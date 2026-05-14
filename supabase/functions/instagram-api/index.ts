import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    // ── LIST AVAILABLE IG ACCOUNTS via connected FB pages ─────────────────────
    // For each Facebook page the user owns, check if it has an IG Business
    // account attached.  Returns the list so the user can pick which one to
    // connect to the CRM.
    if (action === "list_available_ig_accounts") {
      const { data: pages, error } = await supabase
        .from("facebook_pages")
        .select("page_id, page_name, page_access_token")
        .eq("user_id", user.id);
      if (error) throw error;

      const results: any[] = [];
      for (const page of pages || []) {
        try {
          const res = await fetch(
            `${GRAPH_API}/${page.page_id}?fields=instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${page.page_access_token}`,
          );
          const data = await res.json();
          const ig = data.instagram_business_account;
          if (ig) {
            results.push({
              ig_user_id: ig.id,
              ig_username: ig.username,
              profile_picture_url: ig.profile_picture_url,
              followers_count: ig.followers_count,
              page_id: page.page_id,
              page_name: page.page_name,
              page_access_token: page.page_access_token,
            });
          }
        } catch (e) {
          console.error(`Error checking IG on page ${page.page_id}:`, e);
        }
      }

      return new Response(JSON.stringify({ accounts: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CONNECT an IG account to the CRM ──────────────────────────────────────
    if (action === "connect_account") {
      const {
        ig_user_id, ig_username, profile_picture_url,
        page_id, page_name, page_access_token,
      } = body;
      if (!ig_user_id || !page_id || !page_access_token) {
        throw new Error("ig_user_id, page_id y page_access_token son obligatorios");
      }

      // Resolve organization
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      // Deactivate any previous IG accounts for this user (one active at a time)
      await supabase
        .from("instagram_accounts")
        .update({ is_active: false })
        .eq("user_id", user.id);

      // Upsert the new account
      const { error } = await supabase
        .from("instagram_accounts")
        .upsert(
          {
            user_id: user.id,
            organization_id: membership?.organization_id ?? null,
            ig_user_id,
            ig_username: ig_username ?? null,
            profile_picture_url: profile_picture_url ?? null,
            page_id,
            page_name: page_name ?? null,
            page_access_token,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ig_user_id" },
        );
      if (error) throw error;

      // Subscribe the page to messaging events (REQUIRED for IG DMs to arrive
      // at the webhook).  This used to be best-effort with a silent warning,
      // but that masked the most common failure mode in production: the user
      // sees "Conectado" and wonders why DMs never come in.  Now we surface
      // the exact Meta error so the user knows what permission/app review is
      // missing.  The IG account row is still inserted so they can run the
      // /diagnose action later, but we return a warning in the response.
      let subscribeError: string | null = null;
      let subscribeRaw: any = null;
      try {
        const subRes = await fetch(`${GRAPH_API}/${page_id}/subscribed_apps`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${page_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subscribed_fields: "messages,messaging_postbacks,messaging_seen",
          }),
        });
        subscribeRaw = await subRes.json();
        console.log("connect_account → subscribed_apps:", JSON.stringify(subscribeRaw));
        if (subscribeRaw?.error) {
          subscribeError = `${subscribeRaw.error.message} (código ${subscribeRaw.error.code})`;
        } else if (subscribeRaw?.success !== true) {
          subscribeError = "Meta no confirmó la suscripción (success != true)";
        }
      } catch (e: any) {
        subscribeError = e?.message || "Falló la llamada a /subscribed_apps";
        console.warn("subscribe_apps threw:", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          subscribe_warning: subscribeError, // null if OK
          subscribe_raw: subscribeRaw,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── DIAGNOSE the IG connection ────────────────────────────────────────────
    // Calls Meta to check (a) what webhook fields the page is subscribed to,
    // and (b) what permissions the token has.  Returns a structured report so
    // the UI can render a checklist of what's working and what's missing.
    if (action === "diagnose") {
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("ig_user_id, ig_username, page_id, page_name, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      // (a) What is the page subscribed to?
      let pageSubscriptions: any = null;
      let pageSubsError: string | null = null;
      try {
        const r = await fetch(
          `${GRAPH_API}/${account.page_id}/subscribed_apps?access_token=${account.page_access_token}`,
        );
        pageSubscriptions = await r.json();
        if (pageSubscriptions?.error) {
          pageSubsError = `${pageSubscriptions.error.message} (código ${pageSubscriptions.error.code})`;
        }
      } catch (e: any) {
        pageSubsError = e?.message || "Error consultando subscribed_apps";
      }

      // (b) What permissions does the token have?
      let tokenPermissions: any = null;
      let permsError: string | null = null;
      try {
        const r = await fetch(
          `${GRAPH_API}/me/permissions?access_token=${account.page_access_token}`,
        );
        tokenPermissions = await r.json();
        if (tokenPermissions?.error) {
          permsError = `${tokenPermissions.error.message} (código ${tokenPermissions.error.code})`;
        }
      } catch (e: any) {
        permsError = e?.message || "Error consultando permissions";
      }

      // Helper: does a permission appear as "granted"?
      const hasPermission = (perm: string): boolean => {
        const list = tokenPermissions?.data || [];
        return list.some((p: any) => p.permission === perm && p.status === "granted");
      };

      // Build the page-level subscribed fields set.  Meta returns one or
      // more app entries, each with a subscribed_fields array.
      const subscribedFields = new Set<string>();
      for (const entry of pageSubscriptions?.data || []) {
        for (const f of entry.subscribed_fields || []) {
          // Each field can be a string OR an object {name: "messages", version: "v21"}
          subscribedFields.add(typeof f === "string" ? f : f.name);
        }
      }

      const checks = {
        page_subscribed_to_messages: subscribedFields.has("messages"),
        page_subscribed_to_messaging_postbacks: subscribedFields.has("messaging_postbacks"),
        page_subscribed_to_comments: subscribedFields.has("comments"),
        token_has_instagram_basic: hasPermission("instagram_basic"),
        token_has_instagram_manage_messages: hasPermission("instagram_manage_messages"),
        token_has_pages_messaging: hasPermission("pages_messaging"),
        token_has_pages_manage_metadata: hasPermission("pages_manage_metadata"),
      };

      // Try to re-subscribe right now so the user doesn't have to disconnect/reconnect.
      // Only do this if messages isn't currently subscribed.
      let resubscribeResult: any = null;
      if (!checks.page_subscribed_to_messages) {
        try {
          const r = await fetch(`${GRAPH_API}/${account.page_id}/subscribed_apps`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${account.page_access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_seen",
            }),
          });
          resubscribeResult = await r.json();
          console.log("diagnose → resubscribe:", JSON.stringify(resubscribeResult));
        } catch (e: any) {
          resubscribeResult = { error: { message: e?.message || "fetch failed" } };
        }
      }

      return new Response(
        JSON.stringify({
          account: {
            ig_user_id: account.ig_user_id,
            ig_username: account.ig_username,
            page_id: account.page_id,
            page_name: account.page_name,
          },
          checks,
          subscribed_fields: Array.from(subscribedFields),
          token_permissions: tokenPermissions?.data || [],
          page_subscriptions_error: pageSubsError,
          permissions_error: permsError,
          resubscribe_result: resubscribeResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── RESOLVE UNRESOLVED PARTICIPANT INFO ───────────────────────────────────
    // Backfills @username / display name / avatar for any conversation that
    // currently shows only the raw IGSID.  Useful after the webhook code that
    // does this automatically was deployed AFTER some conversations already
    // arrived.  Called by the "Actualizar" button in the IG modal.
    if (action === "resolve_unresolved_participants") {
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      const { data: unresolved } = await supabase
        .from("instagram_conversations")
        .select("id, participant_id")
        .eq("user_id", user.id)
        .eq("ig_account_id", account.id)
        .is("participant_username", null);

      let resolved = 0;
      let failed = 0;
      for (const conv of unresolved || []) {
        try {
          const r = await fetch(
            `${GRAPH_API}/${conv.participant_id}?fields=name,username,profile_pic&access_token=${encodeURIComponent(account.page_access_token)}`,
          );
          const data = await r.json();
          if (data.error || (!data.username && !data.name)) {
            failed++;
            console.warn(`Failed to resolve ${conv.participant_id}:`, JSON.stringify(data));
            continue;
          }
          await supabase
            .from("instagram_conversations")
            .update({
              participant_username: data.username || null,
              participant_name: data.name || null,
              participant_profile_pic: data.profile_pic || null,
            })
            .eq("id", conv.id);
          resolved++;
        } catch (e) {
          failed++;
          console.warn(`Exception resolving ${conv.participant_id}:`, e);
        }
      }

      return new Response(
        JSON.stringify({
          total: (unresolved || []).length,
          resolved,
          failed,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    if (action === "disconnect") {
      await supabase
        .from("instagram_accounts")
        .update({ is_active: false })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET ACTIVE ACCOUNT STATUS ─────────────────────────────────────────────
    if (action === "status") {
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id, ig_user_id, ig_username, profile_picture_url, page_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!account) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { count: conversationsCount } = await supabase
        .from("instagram_conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const { count: commentsCount } = await supabase
        .from("instagram_comments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          connected: true,
          account,
          conversations_count: conversationsCount ?? 0,
          comments_count: commentsCount ?? 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── SEND DM ───────────────────────────────────────────────────────────────
    // Sends a direct message to an IG user via the Instagram Messaging API.
    // Note: subject to the 24-hour standard messaging window — outside that,
    // you can only send approved message tags.
    if (action === "send_dm") {
      const { recipient_id, text, conversation_id } = body;
      if (!recipient_id || !text) {
        throw new Error("recipient_id y text son obligatorios");
      }

      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id, ig_user_id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      // POST /{ig-user-id}/messages
      const res = await fetch(`${GRAPH_API}/${account.ig_user_id}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.page_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipient_id },
          message: { text },
        }),
      });
      const data = await res.json();
      console.log("send_dm response:", JSON.stringify(data));
      if (data.error) {
        throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);
      }

      // Persist the outgoing message
      await supabase.from("instagram_messages").insert({
        user_id: user.id,
        conversation_id: conversation_id ?? null,
        ig_account_id: account.id,
        ig_message_id: data.message_id ?? null,
        direction: "outgoing",
        message_type: "text",
        message_text: text,
        recipient_id,
        sender_id: account.ig_user_id,
        status: "sent",
      });

      return new Response(
        JSON.stringify({ success: true, message_id: data.message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── REPLY TO A COMMENT (public reply) ─────────────────────────────────────
    if (action === "reply_comment") {
      const { comment_id, text } = body;
      if (!comment_id || !text) throw new Error("comment_id y text son obligatorios");

      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      const res = await fetch(`${GRAPH_API}/${comment_id}/replies`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.page_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      console.log("reply_comment response:", JSON.stringify(data));
      if (data.error) throw new Error(`Meta: ${data.error.message}`);

      await supabase
        .from("instagram_comments")
        .update({ is_replied: true })
        .eq("comment_id", comment_id);

      return new Response(JSON.stringify({ success: true, reply_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST RECENT IG MEDIA (posts/reels) ────────────────────────────────────
    // Returns the connected account's recent posts so the user can pick one
    // visually instead of typing a Media ID manually.
    if (action === "list_media") {
      const { limit } = body;
      const fetchLimit = Math.min(parseInt(limit) || 24, 50);

      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("ig_user_id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,comments_count,like_count";
      const res = await fetch(
        `${GRAPH_API}/${account.ig_user_id}/media?fields=${fields}&limit=${fetchLimit}&access_token=${account.page_access_token}`,
      );
      const data = await res.json();
      if (data.error) {
        console.error("list_media error:", JSON.stringify(data.error));
        throw new Error(`Meta: ${data.error.message}`);
      }

      // Meta returns VIDEO/REEL with thumbnail_url; IMAGE/CAROUSEL_ALBUM with media_url.
      // Normalize a `preview_url` field so the frontend can render thumbnails uniformly.
      const media = (data.data || []).map((m: any) => ({
        id: m.id,
        caption: m.caption || null,
        media_type: m.media_type,
        permalink: m.permalink,
        preview_url: m.thumbnail_url || m.media_url || null,
        timestamp: m.timestamp,
        comments_count: m.comments_count ?? 0,
        like_count: m.like_count ?? 0,
      }));

      return new Response(JSON.stringify({ media }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CHECK FOLLOWER STATUS ─────────────────────────────────────────────────
    // Returns whether a given IG user follows the connected business account.
    // Used by automations with require_follower=true.
    if (action === "check_follower") {
      const { user_psid } = body;
      if (!user_psid) throw new Error("user_psid es obligatorio");

      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("ig_user_id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      const res = await fetch(
        `${GRAPH_API}/${account.ig_user_id}?fields=business_discovery.username(${user_psid}){followers_count}&access_token=${account.page_access_token}`,
      );
      const data = await res.json();
      // Note: the most reliable approach uses the messaging webhook payload's
      // `is_follower` field when it arrives.  This endpoint is best-effort.
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("instagram-api error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

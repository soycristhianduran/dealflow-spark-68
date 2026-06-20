import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Facebook Graph (used when the access token comes from a Facebook Login flow,
// tokens that start with "EAA").  Old IG connections + page management calls.
const GRAPH_API = "https://graph.facebook.com/v21.0";
// Instagram Graph (used when the access token comes from Instagram Business
// Login, tokens that start with "IGAA").  Required for the new dedicated
// Instagram-only Meta App that hosts our messaging capability.
const IG_GRAPH_API = "https://graph.instagram.com/v21.0";

/**
 * Choose the correct Graph host for a given token.  IG Business Login tokens
 * ("IGAA..." prefix) must use graph.instagram.com — graph.facebook.com
 * returns "Cannot parse access token" for them.  Page access tokens from
 * Facebook Login keep using graph.facebook.com.
 */
function graphHostForToken(token: string | undefined | null): string {
  return token && token.startsWith("IGAA") ? IG_GRAPH_API : GRAPH_API;
}

/**
 * Resolve the correct node + host for SENDING Instagram messages.
 *
 *  • Instagram Login token (starts with "IGAA") → graph.instagram.com, and the
 *    message is sent from the IG user id node (/{ig_user_id}/messages).
 *  • Facebook Page token → graph.facebook.com, and the message MUST be sent
 *    from the PAGE node (/{page_id}/messages). Sending from the IG user id on
 *    graph.facebook.com returns Meta error #3 ("Application does not have the
 *    capability to make this API call"), which is exactly what blocked replies.
 */
function messagingNode(account: { ig_user_id: string; page_id?: string | null; page_access_token?: string | null }): { host: string; id: string } {
  const isIgLogin = !!account.page_access_token && account.page_access_token.startsWith("IGAA");
  if (isIgLogin) return { host: IG_GRAPH_API, id: account.ig_user_id };
  return { host: GRAPH_API, id: account.page_id || account.ig_user_id };
}

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
      // Get the user's current access token from facebook_tokens
      const { data: tokenRow } = await supabase
        .from("facebook_tokens")
        .select("access_token")
        .eq("user_id", user.id)
        .maybeSingle();

      const userAccessToken = tokenRow?.access_token;

      // Build pages list: first try live from Meta using the user token,
      // then fall back to saved facebook_pages rows.
      let pagesForCheck: { page_id: string; page_name: string; page_access_token: string }[] = [];

      if (userAccessToken) {
        try {
          const accountsRes = await fetch(
            `${GRAPH_API}/me/accounts?fields=id,name,access_token&limit=50&access_token=${userAccessToken}`
          );
          const accountsData = await accountsRes.json();
          if (accountsData.data) {
            pagesForCheck = (accountsData.data as any[]).map((p: any) => ({
              page_id: p.id,
              page_name: p.name,
              page_access_token: p.access_token,
            }));
            // Also upsert these pages so facebook_pages stays fresh
            for (const p of pagesForCheck) {
              await supabase.from("facebook_pages").upsert(
                { user_id: user.id, page_id: p.page_id, page_name: p.page_name, page_access_token: p.page_access_token },
                { onConflict: "user_id,page_id" }
              );
            }
          }
        } catch (e) {
          console.error("Error fetching pages from Meta:", e);
        }
      }

      // If live fetch returned nothing, fall back to saved pages
      if (pagesForCheck.length === 0) {
        const { data: savedPages } = await supabase
          .from("facebook_pages")
          .select("page_id, page_name, page_access_token")
          .eq("user_id", user.id);
        pagesForCheck = savedPages || [];
      }

      const results: any[] = [];
      for (const page of pagesForCheck) {
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

      // Capture the Facebook App-Scoped User ID (ASID) — needed for the Meta
      // data-deletion callback to match revocation events back to this row.
      // We read it from facebook_tokens (populated by the FB OAuth callback)
      // since the IG connect flow goes through Facebook Login first.
      let fbUserId: string | null = null;
      try {
        const { data: tokenRow } = await supabase
          .from("facebook_tokens")
          .select("fb_user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        fbUserId = tokenRow?.fb_user_id ?? null;
      } catch (e) {
        console.warn("Could not resolve fb_user_id for IG connect:", e);
      }

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
            fb_user_id: fbUserId,
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
            // `messaging_seen` is no longer a valid subscribable field on the
            // current Graph API version → Meta rejects the WHOLE subscription
            // with error 100, so the page never receives IG DMs. Keep the
            // essential, valid fields only.
            subscribed_fields: "messages,messaging_postbacks,comments",
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
        token_has_instagram_manage_insights: hasPermission("instagram_manage_insights"),
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
              subscribed_fields: "messages,messaging_postbacks,comments",
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
            `${graphHostForToken(account.page_access_token)}/${conv.participant_id}?fields=name,username,profile_pic&access_token=${encodeURIComponent(account.page_access_token)}`,
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
      // Instagram is shared ORG-WIDE (status() checks the whole org), so the
      // disconnect must also be org-wide — otherwise an account connected by a
      // different member stays active and the integration shows connected again.
      const { data: memberships } = await supabase
        .from("organization_members").select("organization_id").eq("user_id", user.id);
      const orgIds = (memberships || []).map((m: any) => m.organization_id).filter(Boolean);

      const q = supabase.from("instagram_accounts").update({ is_active: false });
      if (orgIds.length) await q.in("organization_id", orgIds);
      else await q.eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET ACTIVE ACCOUNT STATUS ─────────────────────────────────────────────
    if (action === "status") {
      // Instagram connection is shared ORG-WIDE: resolve the caller's org and
      // report the org's connected account so every member sees it connected.
      const { data: memberships } = await supabase
        .from("organization_members").select("organization_id").eq("user_id", user.id);
      const orgIds = (memberships || []).map((m: any) => m.organization_id).filter(Boolean);

      let accQuery = supabase
        .from("instagram_accounts")
        .select("id, ig_user_id, ig_username, profile_picture_url, page_name, organization_id")
        .eq("is_active", true);
      accQuery = orgIds.length ? accQuery.in("organization_id", orgIds) : accQuery.eq("user_id", user.id);
      // NOTE: instagram_accounts has NO created_at column — only updated_at.
      // Ordering by created_at threw "column does not exist", which made the
      // whole status call error out → the UI always showed "no conectado"
      // even when the account WAS connected and subscribed. Use updated_at.
      const { data: account } = await accQuery.order("updated_at", { ascending: true }).limit(1).maybeSingle();

      if (!account) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgFilter = account.organization_id;
      const { count: conversationsCount } = await supabase
        .from("instagram_conversations")
        .select("id", { count: "exact", head: true })
        .eq(orgFilter ? "organization_id" : "user_id", orgFilter ?? user.id);

      const { count: commentsCount } = await supabase
        .from("instagram_comments")
        .select("id", { count: "exact", head: true })
        .eq(orgFilter ? "organization_id" : "user_id", orgFilter ?? user.id);

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
        .select("id, ig_user_id, page_id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      // Send to the correct messaging node:
      //  • Instagram Login token (IGAA…) → graph.instagram.com + IG user id node
      //  • Facebook Page token           → graph.facebook.com + PAGE id node
      // Posting to the IG user id on graph.facebook.com returns Meta error #3
      // "Application does not have the capability to make this API call".
      const msgNode = messagingNode(account);
      const res = await fetch(`${msgNode.host}/${msgNode.id}/messages`, {
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

    // ── SEND DM WITH MEDIA ATTACHMENT (image / audio / video / file) ──────────
    // Unlike WhatsApp, Instagram's Messaging API does not accept media_ids
    // for outgoing attachments — it requires a publicly reachable URL.
    // Flow: client base64 → Supabase Storage (public) → URL → Meta.
    if (action === "send_dm_media") {
      const { recipient_id, file_base64, mime_type, filename, conversation_id } = body;
      if (!recipient_id || !file_base64 || !mime_type) {
        throw new Error("recipient_id, file_base64 y mime_type son obligatorios");
      }

      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id, ig_user_id, page_id, page_access_token")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) throw new Error("Instagram no está conectado");

      // Normalize MIME aliases the same way WhatsApp does, so audio recorded
      // on iOS (audio/x-m4a) and similar quirks don't get rejected.
      const MIME_ALIASES: Record<string, string> = {
        "audio/x-m4a": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "audio/x-aac": "audio/aac",
        "audio/mp3": "audio/mpeg",
        "image/jpg": "image/jpeg",
        "image/x-png": "image/png",
      };
      const rawMimeBase = mime_type.split(";")[0].trim().toLowerCase();
      const mimeBase = MIME_ALIASES[rawMimeBase] || rawMimeBase;

      // Decide IG attachment type from MIME prefix.
      let attachmentType: "image" | "audio" | "video" | "file";
      if (mimeBase.startsWith("image/")) attachmentType = "image";
      else if (mimeBase.startsWith("audio/")) attachmentType = "audio";
      else if (mimeBase.startsWith("video/")) attachmentType = "video";
      else attachmentType = "file";

      // Decode base64
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Upload to Supabase Storage so Meta can pull it via a public URL.
      const extFromMime = (m: string): string => {
        const map: Record<string, string> = {
          "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
          "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
          "audio/ogg": "ogg", "audio/opus": "opus", "audio/mpeg": "mp3",
          "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav",
          "application/pdf": "pdf",
        };
        return map[m] || "bin";
      };
      const safeFilename = filename || `ig-${attachmentType}-${Date.now()}.${extFromMime(mimeBase)}`;
      const storagePath = `${user.id}/ig/${Date.now()}_${safeFilename}`;
      const uploadBlob = new Blob([bytes], { type: mimeBase });

      const { error: storageErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(storagePath, uploadBlob, { contentType: mimeBase, upsert: false });
      if (storageErr) {
        throw new Error(`Subida a storage falló: ${storageErr.message}`);
      }

      const { data: pubData } = supabase.storage.from("whatsapp-media").getPublicUrl(storagePath);
      const publicUrl = pubData.publicUrl;
      if (!publicUrl) throw new Error("No se pudo generar URL pública");

      console.log(`send_dm_media: type=${attachmentType} mime=${mimeBase} url=${publicUrl}`);

      // Send the attachment via Meta IG Messaging API.
      // Use graph.instagram.com for IGAA tokens (new dedicated IG app).
      const mediaNode = messagingNode(account);
      const res = await fetch(`${mediaNode.host}/${mediaNode.id}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.page_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: attachmentType,
              payload: { url: publicUrl, is_reusable: false },
            },
          },
        }),
      });
      const data = await res.json();
      console.log("send_dm_media response:", JSON.stringify(data));
      if (data.error) {
        throw new Error(`Meta: ${data.error.message} (código ${data.error.code})`);
      }

      // Persist outgoing message — store attachment_url so the chat bubble
      // can render the media without re-fetching from Meta.
      await supabase.from("instagram_messages").insert({
        user_id: user.id,
        conversation_id: conversation_id ?? null,
        ig_account_id: account.id,
        ig_message_id: data.message_id ?? null,
        direction: "outgoing",
        message_type: attachmentType,
        message_text: null,
        attachment_url: publicUrl,
        recipient_id,
        sender_id: account.ig_user_id,
        status: "sent",
      });

      return new Response(
        JSON.stringify({ success: true, message_id: data.message_id, media_url: publicUrl }),
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

      const res = await fetch(`${graphHostForToken(account.page_access_token)}/${comment_id}/replies`, {
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
        `${graphHostForToken(account.page_access_token)}/${account.ig_user_id}/media?fields=${fields}&limit=${fetchLimit}&access_token=${account.page_access_token}`,
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
        `${graphHostForToken(account.page_access_token)}/${account.ig_user_id}?fields=business_discovery.username(${user_psid}){followers_count}&access_token=${account.page_access_token}`,
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

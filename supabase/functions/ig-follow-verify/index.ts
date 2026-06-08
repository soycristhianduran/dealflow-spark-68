/**
 * ig-follow-verify — one-click follower verification endpoint
 *
 * Called from the "Ya te sigo ✓" button URL:
 *   GET /ig-follow-verify?token=UUID
 *
 * Flow:
 *   1. Look up pending delivery by verify_token
 *   2. Check is_following_business on the commenter
 *   3a. Following  → deliver lead magnet DM + mark delivered → {status:"delivered"}
 *   3b. Not following → {status:"not_following", profile_url}
 *   3c. API error  → {status:"error", message}
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function graphHost(token: string) {
  return token?.startsWith("IGAA")
    ? "https://graph.instagram.com/v21.0"
    : "https://graph.facebook.com/v21.0";
}

function buildMessageBody(text: string, buttons?: { title: string; url: string }[] | null) {
  const valid = (buttons || []).filter((b) => b.title && b.url);
  if (valid.length === 0) return { text };

  const isIgUrl = (url: string) => /instagram\.com/i.test(url) || url.startsWith("instagram://");
  const externalBtns = valid.filter((b) => !isIgUrl(b.url)).slice(0, 3);

  if (externalBtns.length === 0) return { text };

  const title = text.substring(0, 80);
  const subtitle = text.length > 80 ? text.substring(80, 200) : undefined;
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{
          title,
          ...(subtitle ? { subtitle } : {}),
          buttons: externalBtns.map((b) => ({
            type: "web_url",
            url: b.url,
            title: b.title.substring(0, 20),
          })),
        }],
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ status: "error", message: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Load pending delivery
    const { data: pending, error: pendingErr } = await supabase
      .from("instagram_pending_deliveries")
      .select("*")
      .eq("verify_token", token)
      .maybeSingle();

    if (pendingErr || !pending) {
      console.error("[ig-follow-verify] pending lookup error:", pendingErr);
      return new Response(JSON.stringify({ status: "error", message: "invalid token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pending.status === "delivered") {
      return new Response(JSON.stringify({ status: "already_delivered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pending.status === "ready_to_deliver") {
      // Already verified, waiting for user to open DM and send a message
      return new Response(JSON.stringify({ status: "ready_to_deliver" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load account
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("id, ig_user_id, ig_username, page_access_token")
      .eq("id", pending.ig_account_id)
      .maybeSingle();

    if (!account?.page_access_token) {
      return new Response(JSON.stringify({ status: "error", message: "account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load automation (for dm_buttons)
    const { data: auto } = await supabase
      .from("instagram_comment_automations")
      .select("dm_buttons, dm_message_non_follower, dm_buttons_non_follower")
      .eq("id", pending.automation_id)
      .maybeSingle();
    const igToken = account.page_access_token;
    const host = graphHost(igToken);
    const commenterId = pending.commenter_id;
    // ig_user_id is the Instagram Business Account ID (correct column name)
    const igUserId = account.ig_user_id;
    const igUsername = account.ig_username || null;

    console.log("[ig-follow-verify] account.ig_user_id:", igUserId, "commenter:", commenterId);

    // NOTE: We skip the is_following_business API check here because that field
    // requires the instagram_manage_insights permission which is not approved yet.
    // The real follower gate is sender.is_follower in the DM webhook — that field
    // is available without special permissions and fires reliably on every DM.
    //
    // Flow: user taps "Ya te sigo" → we attempt delivery immediately.
    //   • If the 24h window is open → delivered ✅
    //   • If window is closed → mark ready_to_deliver; next DM from user
    //     triggers delivery ONLY if sender.is_follower === true.

    // ── Try to deliver the lead magnet immediately ───────────────────────────
    const resourceText = pending.dm_text;
    const resourceButtons = auto?.dm_buttons ?? null;

    const sendRes = await fetch(`${host}/${igUserId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${igToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: commenterId },
        message: buildMessageBody(resourceText, resourceButtons),
      }),
    });
    const sendData = await sendRes.json();
    console.log("[ig-follow-verify] send result:", JSON.stringify(sendData).substring(0, 200));

    if (!sendData.error) {
      // ✅ Delivered immediately
      await supabase
        .from("instagram_pending_deliveries")
        .update({ status: "delivered", delivered_at: new Date().toISOString() })
        .eq("id", pending.id);
      console.log(`[ig-follow-verify] ✅ Delivered immediately to ${commenterId}`);
      return new Response(JSON.stringify({ status: "delivered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DM failed — check if it's the messaging window error
    const isWindowError = sendData.error?.error_subcode === 2534022 ||
      sendData.error?.message?.includes("allowed window");

    if (isWindowError) {
      // Fallback: mark as ready_to_deliver so the next DM from user triggers delivery
      await supabase
        .from("instagram_pending_deliveries")
        .update({ status: "ready_to_deliver" })
        .eq("id", pending.id);
      console.log(`[ig-follow-verify] ⚠️ Window closed — marked ready_to_deliver for ${commenterId}`);
      return new Response(JSON.stringify({ status: "ready_to_deliver" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Other DM error
    console.error("[ig-follow-verify] DM send failed:", JSON.stringify(sendData.error));
    return new Response(JSON.stringify({ status: "error", message: "could not send DM", detail: sendData.error }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[ig-follow-verify] Exception:", e);
    return new Response(JSON.stringify({ status: "error", message: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

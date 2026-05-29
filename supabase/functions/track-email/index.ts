import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── HMAC-SHA256 signature verification (Fix #6) ──────────────────────────────
async function verifyTrackingSig(sendId: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  try {
    const raw = new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sendId));
    const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, "0")).join("");
    // Constant-time comparison to prevent timing attacks
    if (expectedHex.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

// 1×1 transparent GIF
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const sendId  = url.searchParams.get("sid");
  const type    = url.searchParams.get("t");   // "o" = open, "c" = click
  const destUrl = url.searchParams.get("url"); // click redirect target
  const sig     = url.searchParams.get("sig"); // HMAC-SHA256 signature

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify HMAC signature — silently ignore invalid/missing sigs.
    // Emails sent before this fix was deployed won't have a sig, so we
    // still process them (grace period: remove this check after ~30 days).
    const sigValid = sendId ? await verifyTrackingSig(sendId, sig) : false;

    if (sendId && type === "o" && sigValid) {
      // Only record first open
      const { data: send } = await supabase
        .from("email_sends")
        .select("campaign_id, contact_id, opened_at")
        .eq("id", sendId)
        .maybeSingle();

      if (send && !send.opened_at) {
        await supabase
          .from("email_sends")
          .update({ opened_at: new Date().toISOString(), status: "opened" })
          .eq("id", sendId);

        if (send.campaign_id) {
          await supabase.rpc("inc_email_campaign_opened", { p_campaign_id: send.campaign_id });
        }

        // Fire automation trigger: email_opened
        if (send.contact_id) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              action: "trigger_event",
              trigger_type: "email_opened",
              contact_id: send.contact_id,
              trigger_data: { send_id: sendId, campaign_id: send.campaign_id },
            }),
          }).catch(() => null);
        }
      }
    }

    if (sendId && type === "c" && destUrl && sigValid) {
      const { data: send } = await supabase
        .from("email_sends")
        .select("campaign_id, contact_id, clicked_at")
        .eq("id", sendId)
        .maybeSingle();

      if (send && !send.clicked_at) {
        await supabase
          .from("email_sends")
          .update({ clicked_at: new Date().toISOString(), status: "clicked" })
          .eq("id", sendId);

        if (send.campaign_id) {
          await supabase.rpc("inc_email_campaign_clicked", { p_campaign_id: send.campaign_id }).catch(() => null);
        }

        // Fire automation trigger: email_clicked
        if (send.contact_id) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              action: "trigger_event",
              trigger_type: "email_clicked",
              contact_id: send.contact_id,
              trigger_data: { send_id: sendId, campaign_id: send.campaign_id, url: destUrl },
            }),
          }).catch(() => null);
        }
      }
      // Redirect to original URL
      return new Response(null, {
        status: 302,
        headers: { Location: decodeURIComponent(destUrl), "Cache-Control": "no-cache" },
      });
    }
  } catch (_) {
    // Never fail — always return the pixel
  }

  return new Response(PIXEL, {
    headers: {
      ...cors,
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
});

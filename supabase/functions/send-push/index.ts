import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * send-push — delivers a Web Push notification to a user's / org's devices.
 * Body: { organization_id?, user_ids?: string[], title, body, url?, tag? }
 * Auth: header x-internal-secret === PUSH_INTERNAL_SECRET (called by webhooks).
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-internal-secret") !== Deno.env.get("PUSH_INTERNAL_SECRET")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@klosify.com";
  if (!pub || !priv) return new Response(JSON.stringify({ error: "missing VAPID keys" }), { status: 500, headers: cors });
  webpush.setVapidDetails(subject, pub, priv);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { organization_id, user_ids, title, body, url, tag } = await req.json().catch(() => ({}));

  let q = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (Array.isArray(user_ids) && user_ids.length) q = q.in("user_id", user_ids);
  else if (organization_id) q = q.eq("organization_id", organization_id);
  else return new Response(JSON.stringify({ error: "organization_id o user_ids requerido" }), { status: 200, headers: cors });

  const { data: subs } = await q;
  const payload = JSON.stringify({ title: title || "Klosify", body: body || "", url: url || "/", tag });

  let sent = 0, removed = 0;
  for (const s of (subs || [])) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) { // expired/gone → clean up
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, sent, removed, total: subs?.length ?? 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
});

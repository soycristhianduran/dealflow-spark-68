import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * admin-resolve-ig-usernames — one-off backfill. Re-resolves @username / name /
 * avatar for Instagram conversations that only show the numeric IGSID, by asking
 * Meta's Graph API with each conversation's IG account token.
 * Protected by x-admin-secret. Some IGSIDs may stay unresolved (Meta privacy/API).
 */
const ADMIN_SECRET = "klosify-ig-resolve-2026";
const GRAPH_API = "https://graph.facebook.com/v21.0";
const IG_GRAPH_API = "https://graph.instagram.com/v21.0";
const graphHost = (t?: string | null) => (t && t.startsWith("IGAA") ? IG_GRAPH_API : GRAPH_API);

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 300, 500);

  // Conversations missing a username, with their account token.
  const { data: convs } = await supabase
    .from("instagram_conversations")
    .select("id, participant_id, ig_account_id")
    .is("participant_username", null)
    .is("participant_name", null)
    .not("participant_id", "is", null)
    .limit(limit);

  if (!convs?.length) {
    return new Response(JSON.stringify({ ok: true, resolved: 0, failed: 0, total: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  // Cache account tokens.
  const acctIds = [...new Set(convs.map((c: any) => c.ig_account_id).filter(Boolean))];
  const { data: accts } = await supabase.from("instagram_accounts")
    .select("id, page_access_token").in("id", acctIds);
  const tokenById: Record<string, string> = {};
  for (const a of (accts || [])) tokenById[a.id] = a.page_access_token;

  let resolved = 0, failed = 0;
  const errors: Record<string, number> = {};
  for (const c of convs) {
    const token = tokenById[c.ig_account_id];
    if (!token) { failed++; continue; }
    try {
      const r = await fetch(`${graphHost(token)}/${c.participant_id}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`);
      const data = await r.json();
      if (data.error) { failed++; const code = String(data.error.code || "?"); errors[code] = (errors[code] || 0) + 1; continue; }
      if (!data.username && !data.name) { failed++; continue; }
      await supabase.from("instagram_conversations").update({
        participant_username: data.username || null,
        participant_name: data.name || null,
        participant_profile_pic: data.profile_pic || null,
      }).eq("id", c.id);
      resolved++;
    } catch (_) { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, resolved, failed, total: convs.length, errorCodes: errors }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

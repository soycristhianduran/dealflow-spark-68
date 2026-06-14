import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * sync-lead-ads — backfills SPEND/insights for the specific ads that generated
 * leads (contacts.meta_ad_id), which the bulk /ads sync misses (they can live in
 * a different account/be archived). Fetches each ad's insights by id, trying every
 * connected token, and upserts into meta_ads so ad-level ROAS shows Inversión/CPL.
 *
 * Runs from the daily cron (x-cron-secret) or on demand.
 */
const GRAPH_API = "https://graph.facebook.com/v21.0";
const CRON_SECRET = "klosify-cron-2026";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Distinct (org, ad_id, ad_name) from contacts that came from an ad.
  const { data: pairs } = await supabase
    .from("contacts")
    .select("organization_id, meta_ad_id, ad, campaign, meta_campaign_id, adset, meta_adset_id")
    .not("meta_ad_id", "is", null)
    .limit(5000);

  const seen = new Set<string>();
  const targets: any[] = [];
  for (const p of (pairs || [])) {
    const k = `${p.organization_id}:${p.meta_ad_id}`;
    if (seen.has(k)) continue; seen.add(k);
    targets.push(p);
  }

  // Which ad_ids already have spend → skip.
  const { data: existing } = await supabase.from("meta_ads").select("ad_id, spend");
  const haveSpend = new Set((existing || []).filter((e: any) => e.spend > 0).map((e: any) => e.ad_id));

  const { data: tokens } = await supabase.from("facebook_tokens").select("user_id, access_token").not("access_token", "is", null);
  const tokenList = (tokens || []).filter((t: any) => t.access_token);
  if (!tokenList.length) return new Response(JSON.stringify({ ok: true, synced: 0, note: "no tokens" }), { headers: { "Content-Type": "application/json" } });

  let synced = 0;
  for (const t of targets) {
    if (haveSpend.has(t.meta_ad_id)) continue;
    for (const tok of tokenList) {
      try {
        const url = `${GRAPH_API}/${t.meta_ad_id}?fields=name,campaign_id,adset_id,status` +
          `,insights.date_preset(maximum){spend,impressions,clicks,actions}&access_token=${tok.access_token}`;
        const res = await fetch(url);
        const d = await res.json();
        if (d.error || !d.id) continue;
        const ins = d.insights?.data?.[0] || {};
        const leadAct = (ins.actions || []).find((x: any) => x.action_type === "lead");
        const leads = leadAct ? Number(leadAct.value) : 0;
        const spend = ins.spend ? Number(ins.spend) : 0;
        await supabase.from("meta_ads").upsert({
          user_id: tok.user_id, organization_id: t.organization_id,
          ad_id: d.id, ad_name: d.name || t.ad, adset_id: d.adset_id || t.meta_adset_id, campaign_id: d.campaign_id || t.meta_campaign_id,
          status: d.status, spend,
          impressions: ins.impressions ? Number(ins.impressions) : 0,
          clicks: ins.clicks ? Number(ins.clicks) : 0,
          leads, cpl: leads > 0 ? spend / leads : null,
        }, { onConflict: "user_id,ad_id" });
        synced++;
        break; // got it from this token
      } catch { /* try next token */ }
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: targets.length, synced }), { headers: { "Content-Type": "application/json" } });
});

// shopify-sync — periodic poll (cron). For every active store, pulls paid orders
// updated since the last sync, upserts them and attributes to campaigns.
// Gated by x-cron-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2024-10";
const CRON_SECRET = "klosify-shopify-sync-2026";

async function importOrders(db: any, cfg: any, sinceISO: string): Promise<number> {
  let url: string | null =
    `https://${cfg.shop_domain}/admin/api/${API_VERSION}/orders.json?status=any&financial_status=paid&updated_at_min=${encodeURIComponent(sinceISO)}&limit=250`;
  let imported = 0;
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.access_token } });
    if (!res.ok) break;
    const orders = (await res.json()).orders || [];
    for (const o of orders) {
      const phone = o.phone || o.customer?.phone || o.billing_address?.phone || o.shipping_address?.phone || null;
      const { data: row } = await db.from("shopify_orders").upsert({
        organization_id: cfg.organization_id,
        shop_domain: cfg.shop_domain,
        shopify_order_id: o.id,
        order_number: o.name ?? String(o.order_number ?? ""),
        email: o.email || o.customer?.email || null,
        phone,
        total_price: Number(o.total_price ?? 0),
        currency: o.currency ?? null,
        financial_status: o.financial_status ?? null,
        discount_codes: (o.discount_codes || []).map((d: any) => d.code).filter(Boolean),
        landing_site: o.landing_site ?? null,
        referring_site: o.referring_site ?? null,
        shopify_created_at: o.created_at ?? null,
      }, { onConflict: "organization_id,shopify_order_id" }).select("id").single();
      if (row?.id) { await db.rpc("attribute_shopify_order", { p_order_id: row.id }); imported++; }
    }
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return imported;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response("forbidden", { status: 403 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: configs } = await db.from("shopify_configs").select("*").eq("is_active", true);
  let total = 0;
  for (const cfg of configs ?? []) {
    try {
      // overlap a little to avoid missing edge cases
      const since = new Date((cfg.last_synced_at ? new Date(cfg.last_synced_at).getTime() : Date.now() - 2 * 24 * 3600 * 1000) - 3600 * 1000).toISOString();
      total += await importOrders(db, cfg, since);
      await db.from("shopify_configs").update({ last_synced_at: new Date().toISOString() }).eq("id", cfg.id);
    } catch (_) { /* skip this store, continue */ }
  }
  return new Response(JSON.stringify({ ok: true, stores: configs?.length ?? 0, orders: total }), {
    headers: { "Content-Type": "application/json" },
  });
});

// shopify-connect — connect a merchant's store (custom-app token method).
// Validates the Admin API token, saves the config, backfills recent paid orders
// and attributes them to email/WhatsApp campaigns.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API_VERSION = "2024-10";
const normalizeShop = (d: string) =>
  d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.myshopify\.com.*$/, "") + ".myshopify.com";

// Import paid orders since `sinceISO` for one store; upsert + attribute.
export async function importOrders(db: any, cfg: any, sinceISO: string): Promise<number> {
  let url: string | null =
    `https://${cfg.shop_domain}/admin/api/${API_VERSION}/orders.json?status=any&financial_status=paid&created_at_min=${encodeURIComponent(sinceISO)}&limit=250`;
  let imported = 0;
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.access_token } });
    if (!res.ok) break;
    const body = await res.json();
    const orders = body.orders || [];
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
    // Pagination via Link header (rel="next")
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return imported;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "no auth" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await authClient.auth.getUser(token);
    if (!user) return json({ error: "invalid token" }, 401);

    const { shop_domain, access_token, organization_id } = await req.json();
    if (!shop_domain || !access_token || !organization_id) return json({ error: "faltan datos" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE);
    // verify caller belongs to the org
    const { data: member } = await db.from("organization_members")
      .select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!member) return json({ error: "no perteneces a esta organización" }, 403);

    const shop = normalizeShop(shop_domain);

    // Validate token
    const shopRes = await fetch(`https://${shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": access_token },
    });
    if (!shopRes.ok) return json({ error: "Token o dominio inválido. Verifica el Admin API access token y el dominio .myshopify.com" }, 400);
    const shopName = (await shopRes.json())?.shop?.name ?? shop;

    // Probe the scopes we need so the UI can tell the merchant what will work
    // (abandoned-cart recovery needs read_checkouts; product images need read_products).
    const probe = async (path: string) => {
      try {
        const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, { headers: { "X-Shopify-Access-Token": access_token } });
        return r.status === 200;
      } catch { return false; }
    };
    const scope_checkouts = await probe("checkouts.json?limit=1");
    const scope_products = await probe("products.json?limit=1");

    const cfg = {
      organization_id, shop_domain: shop, access_token, shop_name: shopName,
      is_active: true, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      scope_checkouts, scope_products, scopes_checked_at: new Date().toISOString(),
    };
    const { data: saved } = await db.from("shopify_configs")
      .upsert(cfg, { onConflict: "organization_id,shop_domain" }).select("*").single();

    // Backfill last 60 days
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const imported = await importOrders(db, saved, since);

    return json({ ok: true, shop_name: shopName, orders_imported: imported, scope_checkouts, scope_products });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

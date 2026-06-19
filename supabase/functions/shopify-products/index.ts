// shopify-products — list a merchant's Shopify products for the email builder.
// Returns image + title + price + storefront URL so they can be inserted as
// product blocks. Requires the connected token to have read_products.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API_VERSION = "2024-10";

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

    const { organization_id, query } = await req.json();
    if (!organization_id) return json({ error: "organization_id requerido" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE);
    const { data: member } = await db.from("organization_members")
      .select("organization_id").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!member) return json({ error: "sin acceso" }, 403);

    const { data: cfg } = await db.from("shopify_configs")
      .select("shop_domain, access_token, scope_products").eq("organization_id", organization_id).eq("is_active", true).maybeSingle();
    if (!cfg) return json({ error: "Shopify no conectado" }, 400);

    const q = (query ? `&title=${encodeURIComponent(query)}` : "");
    const res = await fetch(`https://${cfg.shop_domain}/admin/api/${API_VERSION}/products.json?limit=30${q}`, {
      headers: { "X-Shopify-Access-Token": cfg.access_token },
    });
    if (res.status === 403 || res.status === 401) {
      return json({ error: "scope", message: "Falta el permiso read_products en tu app de Shopify." }, 200);
    }
    if (!res.ok) return json({ error: "No se pudieron cargar los productos" }, 502);

    const products = ((await res.json()).products || []).map((p: any) => {
      const variant = p.variants?.[0] || {};
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        image: p.image?.src || p.images?.[0]?.src || null,
        price: Number(variant.price ?? 0),
        currency: cfg.currency || null,
        url: `https://${cfg.shop_domain.replace(".myshopify.com", "")}.myshopify.com/products/${p.handle}`,
      };
    });

    return json({ ok: true, products });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

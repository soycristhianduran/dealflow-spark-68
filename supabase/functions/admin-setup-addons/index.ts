import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * admin-setup-addons — one-time admin tool. Creates the recurring Stripe
 * products/prices for the capacity add-ons (extra seats $12/user/mo, extra
 * contacts $9 per +5,000/mo) and writes their stripe_price_id into addon_catalog.
 *
 * IDEMPOTENT: uses a stable lookup_key per price, so re-running reuses the
 * existing price instead of creating duplicates. Protected by x-admin-secret.
 */
const ADMIN_SECRET = "klosify-addons-setup-2026";

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response(JSON.stringify({ error: "missing STRIPE_SECRET_KEY" }), { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const mode = key.startsWith("sk_live") ? "LIVE" : "TEST";

  const defs = [
    { key: "extra_seats",    name: "Asientos adicionales",   kind: "extra_seats",    units: 1,    monthly: 12, lookup: "addon_extra_seats_monthly" },
    { key: "extra_contacts", name: "Contactos adicionales",  kind: "extra_contacts", units: 5000, monthly: 9,  lookup: "addon_extra_contacts_monthly" },
  ];

  const created: Record<string, any> = {};
  for (const d of defs) {
    // Reuse existing price by lookup_key if present (idempotency).
    const existing = await stripe.prices.list({ lookup_keys: [d.lookup], active: true, limit: 1 });
    let priceId = existing.data[0]?.id;
    if (!priceId) {
      const product = await stripe.products.create({ name: `Klosify — ${d.name}`, metadata: { addon_kind: d.kind } });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: d.monthly * 100,
        currency: "usd",
        recurring: { interval: "month" },
        lookup_key: d.lookup,
        metadata: { kind: d.kind, units: String(d.units) },
      });
      priceId = price.id;
    }
    created[d.key] = priceId;
    await supabase.from("addon_catalog").update({ stripe_price_id: priceId, updated_at: new Date().toISOString() }).eq("key", d.key);
  }

  return new Response(JSON.stringify({ ok: true, mode, created }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

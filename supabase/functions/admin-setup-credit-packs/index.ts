import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

/**
 * admin-setup-credit-packs — recreates the one-time credit-pack prices
 * (IA Boost / IA Landings / IA Agent) on the CURRENT Stripe account, with the
 * metadata the webhook needs (kind + credits). Returns the new price IDs to
 * paste into src/lib/stripe-products.ts. Idempotent via lookup_key.
 * Protected by x-admin-secret.
 */
const ADMIN_SECRET = "klosify-packs-setup-2026";

const PACKS = [
  { key: "ia_boost_1000",    name: "IA Boost +1,000 contactos",   kind: "ia_boost",    credits: 1000,    usd: 19, lookup: "pack_ia_boost_1000" },
  { key: "ia_boost_5000",    name: "IA Boost +5,000 contactos",   kind: "ia_boost",    credits: 5000,    usd: 49, lookup: "pack_ia_boost_5000" },
  { key: "ia_landings_500k", name: "IA Landings +500 créditos",   kind: "ia_landings", credits: 500000,  usd: 12, lookup: "pack_ia_landings_500k" },
  { key: "ia_landings_1m",   name: "IA Landings +1.000 créditos", kind: "ia_landings", credits: 1000000, usd: 22, lookup: "pack_ia_landings_1m" },
  { key: "ia_landings_3m",   name: "IA Landings +3.000 créditos", kind: "ia_landings", credits: 3000000, usd: 52, lookup: "pack_ia_landings_3m" },
  { key: "ia_agent_200",     name: "Agente IA +1.000 créditos",   kind: "ia_agent",    credits: 1000,    usd: 9,  lookup: "pack_ia_agent_1000" },
  { key: "ia_agent_1000",    name: "Agente IA +4.000 créditos",   kind: "ia_agent",    credits: 4000,    usd: 29, lookup: "pack_ia_agent_4000" },
  { key: "ai_assistant_20",  name: "Asistente IA +20 asistencias",  kind: "ai_assistant", credits: 20,  usd: 5,  lookup: "pack_ai_assistant_20" },
  { key: "ai_assistant_50",  name: "Asistente IA +50 asistencias",  kind: "ai_assistant", credits: 50,  usd: 10, lookup: "pack_ai_assistant_50" },
  { key: "ai_assistant_100", name: "Asistente IA +100 asistencias", kind: "ai_assistant", credits: 100, usd: 18, lookup: "pack_ai_assistant_100_v18" },
];

// Old lookup_keys to archive (superseded prices) so they leave checkout.
const ARCHIVE_LOOKUPS = ["pack_ai_assistant_100"];

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response(JSON.stringify({ error: "missing STRIPE_SECRET_KEY" }), { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });

  // Archive superseded prices so they can't be used in new checkouts.
  for (const lk of ARCHIVE_LOOKUPS) {
    const stale = await stripe.prices.list({ lookup_keys: [lk], active: true, limit: 1 });
    if (stale.data[0]?.id) await stripe.prices.update(stale.data[0].id, { active: false });
  }

  const out: Record<string, string> = {};
  for (const p of PACKS) {
    const existing = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
    let priceId = existing.data[0]?.id;
    if (!priceId) {
      const product = await stripe.products.create({ name: `Klosify — ${p.name}`, metadata: { kind: p.kind } });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: p.usd * 100,
        currency: "usd",
        lookup_key: p.lookup,
        metadata: { kind: p.kind, credits: String(p.credits) },
      });
      priceId = price.id;
    }
    out[p.key] = priceId;
  }

  return new Response(JSON.stringify({ ok: true, mode: key.startsWith("sk_live") ? "LIVE" : "TEST", prices: out }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

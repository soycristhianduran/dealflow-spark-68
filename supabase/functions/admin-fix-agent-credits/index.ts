import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

/**
 * admin-fix-agent-credits — one-time. Re-points the existing AI Agent add-on
 * prices from "conversations" to CREDITS (1 credit = 1.000 tokens), keeping the
 * same dollar amounts. The webhook reads price.metadata.credits to grant packs.
 *   $9  pack: 200  conversations  →  1.000 credits
 *   $29 pack: 1000 conversations  →  4.000 credits
 */
const ADMIN_SECRET = "klosify-agent-credits-2026";

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response(JSON.stringify({ error: "missing STRIPE_SECRET_KEY" }), { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });

  const updates = [
    { price: "price_1TbswiRvVDvs7cXCBLbnX48I", credits: "1000" },
    { price: "price_1TbswiRvVDvs7cXCkfJQ35XY", credits: "4000" },
  ];
  const done: Record<string, any> = {};
  for (const u of updates) {
    const p = await stripe.prices.update(u.price, {
      metadata: { kind: "ia_agent", credits: u.credits },
    });
    done[u.price] = p.metadata;
  }
  return new Response(JSON.stringify({ ok: true, done }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

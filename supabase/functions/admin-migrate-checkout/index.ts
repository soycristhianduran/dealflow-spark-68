import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * admin-migrate-checkout — one-off admin tool to generate a fresh Checkout
 * Session on the CURRENT Stripe account for an existing org, so a customer can
 * re-subscribe after a Stripe-account migration (their old card can't move
 * across accounts). Sets metadata.organization_id so the webhook reconciles the
 * subscription back to that org exactly like a normal checkout.
 *
 * Body: { organization_id, plan_id?, interval? }  (defaults: pro / month)
 * Protected by x-admin-secret.
 */
const ADMIN_SECRET = "klosify-migrate-2026";

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response(JSON.stringify({ error: "missing STRIPE_SECRET_KEY" }), { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const orgId: string = body.organization_id;
  const planId: string = body.plan_id || "pro";
  const interval: string = body.interval === "year" ? "year" : "month";
  if (!orgId) return new Response(JSON.stringify({ error: "organization_id requerido" }), { status: 400 });

  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, stripe_price_id_monthly, stripe_price_id_annual")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return new Response(JSON.stringify({ error: "plan no encontrado" }), { status: 404 });
  const priceId = interval === "year" ? plan.stripe_price_id_annual : plan.stripe_price_id_monthly;

  const { data: org } = await supabase
    .from("organizations").select("name, slug").eq("id", orgId).maybeSingle();
  const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";
  const base = org?.slug ? `${appUrl}/w/${org.slug}` : appUrl;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId!, quantity: 1 }],
    success_url: `${base}/billing?success=1`,
    cancel_url: `${base}/billing`,
    metadata: { organization_id: orgId, purchase_kind: "plan", migration: "true" },
    subscription_data: { metadata: { organization_id: orgId } },
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ ok: true, mode: key.startsWith("sk_live") ? "LIVE" : "TEST", org: org?.name, plan: plan.name, interval, url: session.url }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

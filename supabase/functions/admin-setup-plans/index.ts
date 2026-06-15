import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * admin-setup-plans — one-time admin tool. Creates Stripe products + monthly/annual
 * prices for the new pricing (Pro $59, Business $99, Agency $249) and updates the
 * `plans` table (prices + stripe_price_id_* + inserts the Agency plan). Uses the
 * server-side STRIPE_SECRET_KEY (never exposed). Protected by x-admin-secret.
 *
 * Existing subscribers are unaffected (they keep their current Stripe price until
 * they change plans). Only NEW checkouts use the new prices.
 */
const ADMIN_SECRET = "klosify-plans-setup-2026";

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
    { id: "pro",      name: "Klosify Pro",      monthly: 59,  annual: 590 },
    { id: "business", name: "Klosify Business", monthly: 99,  annual: 990 },
    { id: "agency",   name: "Klosify Agencia",  monthly: 249, annual: 2490 },
  ];

  const created: Record<string, any> = {};
  for (const d of defs) {
    const product = await stripe.products.create({ name: d.name, metadata: { plan_id: d.id } });
    const pm = await stripe.prices.create({ product: product.id, unit_amount: d.monthly * 100, currency: "usd", recurring: { interval: "month" }, metadata: { plan_id: d.id, period: "monthly" } });
    const pa = await stripe.prices.create({ product: product.id, unit_amount: d.annual * 100, currency: "usd", recurring: { interval: "year" }, metadata: { plan_id: d.id, period: "annual" } });
    created[d.id] = { product: product.id, monthly: pm.id, annual: pa.id };
  }

  // Update Pro + Business prices and Stripe IDs.
  await supabase.from("plans").update({
    monthly_price_usd: 59, annual_price_usd: 590,
    stripe_price_id_monthly: created.pro.monthly, stripe_price_id_annual: created.pro.annual,
  }).eq("id", "pro");

  await supabase.from("plans").update({
    monthly_price_usd: 99, annual_price_usd: 990,
    stripe_price_id_monthly: created.business.monthly, stripe_price_id_annual: created.business.annual,
  }).eq("id", "business");

  // Create the Agency plan (top tier).
  await supabase.from("plans").upsert({
    id: "agency", name: "Agencia", display_order: 4,
    monthly_price_usd: 249, annual_price_usd: 2490,
    stripe_price_id_monthly: created.agency.monthly, stripe_price_id_annual: created.agency.annual,
    max_users: 25, max_contacts: null, max_active_deals: null,
    max_wa_accounts: null, max_ig_accounts: null, max_fb_accounts: null,
    max_published_landings: null, max_automation_flows: null,
    monthly_automated_messages: null, monthly_ai_analyses: 20000, monthly_ai_objections: 20000,
    monthly_email_sends: null, monthly_ai_agent_conversations: 10000, monthly_ai_assistant: 50000,
    feature_meta_ads: true, feature_email_campaigns: true, feature_api_access: true,
    feature_priority_support: true, feature_ig_automations: true, feature_ai_agent: true,
  }, { onConflict: "id" });

  return new Response(JSON.stringify({ ok: true, mode, created }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

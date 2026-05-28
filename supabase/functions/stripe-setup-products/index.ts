/**
 * stripe-setup-products — ONE-TIME setup function
 * ------------------------------------------------
 * Creates (or retrieves if already existing) all Stripe products and prices
 * for Klosify CRM, then updates the `plans` table with the correct Stripe
 * price IDs and plan limits.
 *
 * Call once (or re-run idempotently — uses Stripe's `lookup_key` to avoid
 * creating duplicates). Protected: requires service-role authorization.
 *
 * Usage:
 *   npx supabase functions invoke stripe-setup-products --no-verify-jwt
 *   (or from Supabase Studio → Edge Functions → Invoke)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    display_order: 1,
    monthly_price_cents: 2900,   // $29
    annual_price_cents: 29000,   // $290 (≈ $24.16/mes, 2 meses gratis)
    // DB limits
    max_users: 1,
    max_contacts: 500,
    max_active_deals: 50,
    max_published_landings: 3,
    max_automation_flows: 3,
    monthly_automated_messages: 500,
    monthly_ai_analyses: 0,      // IA Boost: no incluido
    monthly_ai_objections: 0,
    monthly_email_sends: 500,
    // Features
    feature_meta_ads: true,
    feature_email_campaigns: true,
    feature_api_access: false,
    feature_priority_support: false,
    feature_ig_automations: false,
  },
  {
    id: "pro",
    name: "Pro",
    display_order: 2,
    monthly_price_cents: 3900,   // $39
    annual_price_cents: 39000,   // $390 (≈ $32.50/mes, 2 meses gratis)
    // DB limits
    max_users: 3,
    max_contacts: 5000,
    max_active_deals: null,      // unlimited
    max_published_landings: 15,
    max_automation_flows: null,  // unlimited
    monthly_automated_messages: 3000,
    monthly_ai_analyses: 1000,   // IA Boost contacts/mes
    monthly_ai_objections: 1000,
    monthly_email_sends: 5000,
    // Features
    feature_meta_ads: true,
    feature_email_campaigns: true,
    feature_api_access: false,
    feature_priority_support: false,
    feature_ig_automations: true,
  },
  {
    id: "business",
    name: "Business",
    display_order: 3,
    monthly_price_cents: 8900,   // $89
    annual_price_cents: 89000,   // $890 (≈ $74.16/mes, 2 meses gratis)
    // DB limits
    max_users: 10,
    max_contacts: null,          // unlimited
    max_active_deals: null,      // unlimited
    max_published_landings: 50,
    max_automation_flows: null,  // unlimited
    monthly_automated_messages: null,  // unlimited
    monthly_ai_analyses: 5000,   // IA Boost contacts/mes
    monthly_ai_objections: 5000,
    monthly_email_sends: null,   // unlimited
    // Features
    feature_meta_ads: true,
    feature_email_campaigns: true,
    feature_api_access: true,
    feature_priority_support: true,
    feature_ig_automations: true,
  },
] as const;

// ── One-time credit packs (not subscription) ──────────────────────────────────

const CREDIT_PACKS = [
  {
    key: "ia_landings_5",
    name: "IA Landings +5 créditos",
    description: "5 créditos para generar landing pages con IA",
    price_cents: 900,   // $9
    credits: 5,
    kind: "ia_landings",
  },
  {
    key: "ia_landings_25",
    name: "IA Landings +25 créditos",
    description: "25 créditos para generar landing pages con IA (mejor valor)",
    price_cents: 3500,  // $35 (~$1.40 por crédito vs $1.80 en pack pequeño)
    credits: 25,
    kind: "ia_landings",
  },
  {
    key: "ia_boost_1000",
    name: "IA Boost +1,000 contactos",
    description: "1,000 contactos adicionales para análisis y scoring IA",
    price_cents: 1900,  // $19
    credits: 1000,
    kind: "ia_boost",
  },
  {
    key: "ia_boost_5000",
    name: "IA Boost +5,000 contactos",
    description: "5,000 contactos adicionales para análisis y scoring IA",
    price_cents: 4900,  // $49
    credits: 5000,
    kind: "ia_boost",
  },
  {
    key: "ia_agent_200",
    name: "Agente IA +200 conversaciones",
    description: "200 conversaciones adicionales para el Agente IA 24/7",
    price_cents: 900,   // $9
    credits: 200,
    kind: "ia_agent",
  },
  {
    key: "ia_agent_1000",
    name: "Agente IA +1,000 conversaciones",
    description: "1,000 conversaciones adicionales para el Agente IA 24/7 (mejor valor)",
    price_cents: 2900,  // $29
    credits: 1000,
    kind: "ia_agent",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrCreatePrice(
  stripe: Stripe,
  params: {
    productId: string;
    lookupKey: string;
    unitAmount: number;
    currency: string;
    recurring?: { interval: "month" | "year" };
    metadata?: Record<string, string>;
  },
): Promise<string> {
  // Try to retrieve by lookup key first (idempotency)
  const existing = await stripe.prices.list({ lookup_keys: [params.lookupKey], limit: 1 });
  if (existing.data.length > 0) {
    console.log(`  ↩ Reusing price ${params.lookupKey}: ${existing.data[0].id}`);
    return existing.data[0].id;
  }

  const price = await stripe.prices.create({
    product: params.productId,
    unit_amount: params.unitAmount,
    currency: params.currency,
    lookup_key: params.lookupKey,
    transfer_lookup_key: false,
    ...(params.recurring ? { recurring: params.recurring } : {}),
    metadata: params.metadata ?? {},
  });
  console.log(`  ✓ Created price ${params.lookupKey}: ${price.id}`);
  return price.id;
}

async function getOrCreateProduct(
  stripe: Stripe,
  name: string,
  description: string,
  metadata: Record<string, string>,
): Promise<string> {
  const existing = await stripe.products.search({
    query: `name:"${name}" AND metadata["klosify_key"]:"${metadata.klosify_key}"`,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`  ↩ Reusing product "${name}": ${existing.data[0].id}`);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({ name, description, metadata });
  console.log(`  ✓ Created product "${name}": ${product.id}`);
  return product.id;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: "STRIPE_SECRET_KEY not set in Edge Function secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // No user-level auth needed — protected by STRIPE_SECRET_KEY existence check above.
  // This function is deployed with --no-verify-jwt for one-time CLI invocation.

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results: Record<string, any> = { plans: {}, credit_packs: {} };

  try {
    // ── 1. Subscription plans ─────────────────────────────────────────────────
    console.log("\n═══ Setting up subscription plans ═══");

    for (const plan of PLANS) {
      console.log(`\n→ Plan: ${plan.name}`);

      const productId = await getOrCreateProduct(
        stripe,
        `Klosify CRM ${plan.name}`,
        `Plan ${plan.name} de Klosify CRM — CRM + WhatsApp + Meta Ads + IA`,
        { klosify_key: `plan_${plan.id}`, plan_id: plan.id },
      );

      const monthlyPriceId = await getOrCreatePrice(stripe, {
        productId,
        lookupKey: `klosify_${plan.id}_monthly`,
        unitAmount: plan.monthly_price_cents,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan_id: plan.id, interval: "month" },
      });

      const annualPriceId = await getOrCreatePrice(stripe, {
        productId,
        lookupKey: `klosify_${plan.id}_annual`,
        unitAmount: plan.annual_price_cents,
        currency: "usd",
        recurring: { interval: "year" },
        metadata: { plan_id: plan.id, interval: "year" },
      });

      results.plans[plan.id] = { product_id: productId, monthly: monthlyPriceId, annual: annualPriceId };

      // Update the plans table
      const planData: Record<string, any> = {
        id: plan.id,
        name: plan.name,
        display_order: plan.display_order,
        monthly_price_usd: plan.monthly_price_cents / 100,
        annual_price_usd: plan.annual_price_cents / 100,
        stripe_price_id_monthly: monthlyPriceId,
        stripe_price_id_annual: annualPriceId,
        max_users: plan.max_users,
        max_contacts: plan.max_contacts,
        max_active_deals: plan.max_active_deals,
        monthly_automated_messages: plan.monthly_automated_messages,
        monthly_ai_analyses: plan.monthly_ai_analyses === 0 ? null : plan.monthly_ai_analyses,
        monthly_ai_objections: plan.monthly_ai_objections === 0 ? null : plan.monthly_ai_objections,
        monthly_email_sends: plan.monthly_email_sends,
        feature_meta_ads: plan.feature_meta_ads,
        feature_email_campaigns: plan.feature_email_campaigns,
        feature_api_access: plan.feature_api_access,
        feature_priority_support: plan.feature_priority_support,
      };

      // Add new columns if they exist (ignore error if column doesn't exist yet)
      try {
        await supabase.from("plans").upsert(planData, { onConflict: "id" });
        console.log(`  ✓ Updated plans table for ${plan.id}`);
      } catch (e) {
        console.error(`  ✗ Failed to update plans table for ${plan.id}:`, e);
      }
    }

    // ── 2. Credit packs ───────────────────────────────────────────────────────
    console.log("\n═══ Setting up credit packs ═══");

    for (const pack of CREDIT_PACKS) {
      console.log(`\n→ Pack: ${pack.name}`);

      const productId = await getOrCreateProduct(
        stripe,
        pack.name,
        pack.description,
        { klosify_key: `pack_${pack.key}`, kind: pack.kind, credits: String(pack.credits) },
      );

      const priceId = await getOrCreatePrice(stripe, {
        productId,
        lookupKey: `klosify_${pack.key}`,
        unitAmount: pack.price_cents,
        currency: "usd",
        metadata: {
          kind: pack.kind,
          credits: String(pack.credits),
          pack_key: pack.key,
        },
      });

      results.credit_packs[pack.key] = {
        product_id: productId,
        price_id: priceId,
        credits: pack.credits,
        kind: pack.kind,
        price_usd: pack.price_cents / 100,
      };
    }

    console.log("\n═══ Done ═══");
    console.log(JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("stripe-setup-products error:", e);
    return new Response(
      JSON.stringify({ error: e.message, results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

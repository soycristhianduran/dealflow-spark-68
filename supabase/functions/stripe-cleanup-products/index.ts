/**
 * stripe-cleanup-products — ONE-TIME cleanup
 * -------------------------------------------
 * Archives old duplicate Klosify CRM products by their exact product IDs.
 * Only touches the 7 old duplicates — never modifies unrelated products.
 */

import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Exact IDs of the old duplicate products (identified from cleanup dry-run).
// These are the pre-lookup_key versions — safe to archive because:
//   1. No active Stripe subscriptions exist (all trialing_internal)
//   2. Their prices have no kind/credits metadata → webhook ignores them anyway
const OLD_PRODUCT_IDS: Record<string, string> = {
  prod_UavcM7BXKJndBj: "Klosify IA Boost +5,000 contactos (old)",
  prod_UYNAJG44p6zvTL: "Klosify IA Boost +1,000 contactos (old)",
  prod_UYNAD34qnPFi0u: "Klosify IA Landings +25 créditos (old)",
  prod_UYNAmAGFyA49tR: "Klosify IA Landings +5 (old)",
  prod_UYN1WSMmmeYG9m: "Klosify CRM - Business (old)",
  prod_UYN03jT5flLBeR: "Klosify CRM - Pro (old)",
  prod_UYMzIGAitylW9f: "Klosify CRM - Starter (old)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  const results: { archived: string[]; errors: string[] } = { archived: [], errors: [] };

  for (const [productId, label] of Object.entries(OLD_PRODUCT_IDS)) {
    try {
      const product = await stripe.products.retrieve(productId);

      if (!product.active) {
        results.archived.push(`ALREADY INACTIVE: ${label}`);
        continue;
      }

      // Step 1: clear default_price so individual prices become archivable
      try {
        await (stripe.products as any).update(productId, { default_price: "" });
      } catch (_) { /* ignore if already null */ }

      // Step 2: archive all prices under this product
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
      for (const price of prices.data) {
        try {
          await stripe.prices.update(price.id, { active: false });
        } catch (pe: any) {
          results.errors.push(`  price ${price.id} (${label}): ${pe.message}`);
        }
      }

      // Step 3: archive the product
      await stripe.products.update(productId, { active: false });
      results.archived.push(`ARCHIVED: ${label} (${productId})`);

    } catch (e: any) {
      results.errors.push(`ERROR on ${label} (${productId}): ${e.message}`);
    }
  }

  console.log("Cleanup results:", JSON.stringify(results, null, 2));
  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// stripe-reconcile — periodic safety net that re-syncs every org's subscription
// state from Stripe (the source of truth) into our DB. Catches missed/failed
// webhooks (e.g. the outage that left GRG paid-but-locked). Idempotent; meant to
// run daily via pg_cron, and can be invoked manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function mapStripeStatus(s: string): string {
  switch (s) {
    case "trialing": case "active": case "past_due": case "canceled":
    case "incomplete": case "incomplete_expired": case "unpaid":
      return s;
    case "paused": return "past_due";
    default: return s;
  }
}

function isoFromUnix(u: number | null | undefined): string | null {
  return u && Number.isFinite(u) ? new Date(u * 1000).toISOString() : null;
}

// Basil API moved current_period_* onto the subscription item.
function periodOf(sub: any): { start: string | null; end: string | null } {
  const item = sub.items?.data?.[0];
  return {
    start: isoFromUnix(item?.current_period_start ?? sub.current_period_start),
    end: isoFromUnix(item?.current_period_end ?? sub.current_period_end),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: "no stripe key" }), { status: 500, headers: corsHeaders });
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" as any });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Map Stripe price_id → our plan id (for plan changes).
    const { data: plans } = await supabase.from("plans").select("id, stripe_price_id_monthly, stripe_price_id_annual");
    const priceToPlan: Record<string, { plan: string; interval: string }> = {};
    for (const p of (plans || [])) {
      if (p.stripe_price_id_monthly) priceToPlan[p.stripe_price_id_monthly] = { plan: p.id, interval: "month" };
      if (p.stripe_price_id_annual) priceToPlan[p.stripe_price_id_annual] = { plan: p.id, interval: "year" };
    }

    // Reconcile every subscription that has a Stripe link.
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("organization_id, stripe_customer_id, stripe_subscription_id, status, current_period_end")
      .or("stripe_subscription_id.not.is.null,stripe_customer_id.not.is.null");

    let checked = 0, updated = 0, errors = 0, skippedComp = 0;
    for (const row of (subs || [])) {
      try {
        // Never touch manual comps (e.g. the platform owner): a far-future
        // current_period_end (>= 2090) is our comp sentinel.
        if (row.current_period_end && new Date(row.current_period_end).getUTCFullYear() >= 2090) {
          skippedComp++;
          continue;
        }
        let sub: any = null;
        if (row.stripe_subscription_id) {
          sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        } else if (row.stripe_customer_id) {
          const list = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: "all", limit: 1 });
          sub = list.data?.[0] ?? null;
        }
        checked++;
        if (!sub) continue;

        const priceId = sub.items?.data?.[0]?.price?.id;
        const match = priceId ? priceToPlan[priceId] : null;
        const period = periodOf(sub);
        const patch: Record<string, any> = {
          status: mapStripeStatus(sub.status),
          stripe_subscription_id: sub.id,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_start: period.start,
          current_period_end: period.end,
          trial_ends_at: isoFromUnix(sub.trial_end),
          updated_at: new Date().toISOString(),
        };
        if (match) { patch.plan_id = match.plan; patch.billing_interval = match.interval; }

        const { error } = await supabase.from("subscriptions").update(patch).eq("organization_id", row.organization_id);
        if (error) { errors++; console.error("reconcile update failed", row.organization_id, error.message); }
        else updated++;
      } catch (e) {
        errors++;
        console.error("reconcile error", row.organization_id, e instanceof Error ? e.message : e);
      }
    }

    const summary = { checked, updated, errors, skippedComp };
    console.log("stripe-reconcile done:", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("stripe-reconcile fatal:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: corsHeaders });
  }
});

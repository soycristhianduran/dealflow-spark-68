// Stripe webhook handler
// ----------------------
// Receives ALL billing-relevant events from Stripe and reflects them in
// our `subscriptions` and `ai_boost_credits` tables. This is the SOLE
// source of truth for "is this org actually paying?" — never trust the
// frontend or the checkout success URL.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY        — the API key (used to fetch events / customers)
//   STRIPE_WEBHOOK_SECRET    — the signing secret from the webhook endpoint
//                              config (Stripe Dashboard → Developers → Webhooks)
//
// Events we handle:
//   checkout.session.completed     — first payment after checkout (sub or one-time)
//   customer.subscription.created  — subscription is now live
//   customer.subscription.updated  — plan change / cancellation scheduled / etc
//   customer.subscription.deleted  — subscription canceled
//   invoice.paid                   — renewal succeeded → extend current_period_end
//   invoice.payment_failed         — payment failed → mark past_due
//
// All event handlers are idempotent — Stripe retries on 5xx for up to 3
// days, so the same event may arrive multiple times.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map Stripe subscription status → our internal status enum
function mapStripeStatus(stripeStatus: string): string {
  // Identity mapping for everything Stripe supports except our extra
  // 'trialing_internal' (which is only set by us pre-Stripe).
  switch (stripeStatus) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return stripeStatus;
    case "paused":         // newer Stripe states
      return "past_due";
    default:
      return "incomplete";
  }
}

// Determine which of our plan_ids matches a Stripe price_id
async function resolvePlanIdFromPriceId(
  supabase: any,
  priceId: string,
): Promise<{ plan_id: string; billing_interval: "month" | "year" } | null> {
  const { data: plan } = await supabase
    .from("plans")
    .select("id, stripe_price_id_monthly, stripe_price_id_annual")
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_annual.eq.${priceId}`)
    .maybeSingle();
  if (!plan) return null;
  return {
    plan_id: plan.id,
    billing_interval: plan.stripe_price_id_monthly === priceId ? "month" : "year",
  };
}

async function upsertSubscriptionFromStripe(
  supabase: any,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const orgId = (stripeSub.metadata?.organization_id ?? null) as string | null;
  if (!orgId) {
    console.warn("Subscription event has no organization_id metadata, skipping:", stripeSub.id);
    return;
  }

  const item = stripeSub.items?.data?.[0];
  const priceId = item?.price?.id;
  if (!priceId) {
    console.warn("Subscription has no price item, skipping:", stripeSub.id);
    return;
  }

  const planMatch = await resolvePlanIdFromPriceId(supabase, priceId);
  if (!planMatch) {
    console.error(`Could not map price_id ${priceId} to any plan in DB. Webhook saved as-is.`);
  }

  await supabase.from("subscriptions").upsert(
    {
      organization_id: orgId,
      plan_id: planMatch?.plan_id ?? "pro", // fallback so the row is valid
      status: mapStripeStatus(stripeSub.status),
      stripe_customer_id: stripeSub.customer as string,
      stripe_subscription_id: stripeSub.id,
      billing_interval: planMatch?.billing_interval ?? null,
      current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSub.cancel_at_period_end,
      trial_ends_at: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
}

// ---------------------------------------------------------------------------
// Email dispatch helpers — fire-and-forget calls to send-transactional-email
// ---------------------------------------------------------------------------

async function getOrgOwnerEmail(
  supabase: any,
  organizationId: string,
): Promise<{ email: string; first_name: string | null; slug: string | null } | null> {
  const { data: org } = await supabase
    .from("organizations")
    .select("slug, organization_members(user_id, role)")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return null;

  const owner = (org as any).organization_members?.find((m: any) => m.role === "owner");
  if (!owner) return null;

  const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
  const email = userData?.user?.email;
  if (!email) return null;

  const firstName =
    (userData?.user?.user_metadata?.first_name as string | undefined) ||
    (userData?.user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    null;

  return { email, first_name: firstName, slug: (org as any).slug };
}

async function callEmailDispatcher(
  supabase: any,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("Email dispatch failed (non-fatal):", e);
  }
}

async function dispatchPaymentSuccessEmail(
  supabase: any,
  stripeSub: Stripe.Subscription,
  invoice: Stripe.Invoice,
): Promise<void> {
  const orgId = stripeSub.metadata?.organization_id as string | undefined;
  if (!orgId) return;
  const recipient = await getOrgOwnerEmail(supabase, orgId);
  if (!recipient) return;

  // Resolve plan name from Stripe price metadata or our DB
  const priceId = stripeSub.items?.data?.[0]?.price?.id;
  let planName = "Pro";
  if (priceId) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_annual.eq.${priceId}`)
      .maybeSingle();
    if (plan?.name) planName = plan.name;
  }

  // Amount in USD (Stripe gives cents)
  const amountCents = invoice.amount_paid;
  const amountDisplay = amountCents != null ? `$${(amountCents / 100).toFixed(2)} USD` : "";

  const nextBillingDate = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000).toLocaleDateString("es-CO", {
        dateStyle: "long",
      })
    : "";

  const appUrl = (Deno.env.get("APP_URL") || "https://app.aceleradoradeventas.co").replace(/\/$/, "");
  const dashboardUrl = recipient.slug ? `${appUrl}/w/${recipient.slug}` : appUrl;

  await callEmailDispatcher(supabase, {
    to: recipient.email,
    template: "payment_success",
    data: {
      first_name: recipient.first_name,
      plan_name: planName,
      amount_display: amountDisplay,
      next_billing_date: nextBillingDate,
      dashboard_url: dashboardUrl,
    },
    // Dedupe per invoice — Stripe can fire invoice.paid more than once on retries
    dedupe_key: `payment_success:${invoice.id}`,
    organization_id: orgId,
  });
}

async function dispatchPaymentFailedEmail(
  supabase: any,
  stripeSubId: string,
): Promise<void> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("organization_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (!sub?.organization_id) return;

  const recipient = await getOrgOwnerEmail(supabase, sub.organization_id);
  if (!recipient) return;

  const appUrl = (Deno.env.get("APP_URL") || "https://app.aceleradoradeventas.co").replace(/\/$/, "");
  const billingUrl = recipient.slug ? `${appUrl}/w/${recipient.slug}/billing` : `${appUrl}/billing`;

  await callEmailDispatcher(supabase, {
    to: recipient.email,
    template: "payment_failed",
    data: { first_name: recipient.first_name, billing_url: billingUrl },
    // Dedupe per subscription per day so retries don't spam
    dedupe_key: `payment_failed:${stripeSubId}:${new Date().toISOString().slice(0, 10)}`,
    organization_id: sub.organization_id,
  });
}

async function recordAiBoostPurchase(
  supabase: any,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const orgId = paymentIntent.metadata?.organization_id as string | undefined;
  if (!orgId) {
    console.warn("Payment intent has no organization_id metadata, skipping:", paymentIntent.id);
    return;
  }

  // Determine credit amount from the price metadata or amount paid.
  // Convention: each Boost product has a metadata field `boost_credits`
  // (we'll set this in the Stripe Dashboard when creating products).
  // Fallback: derive from amount paid ($9=100, $29=500, $79=2000).
  let credits = 0;
  try {
    // Pull the latest charge to get the price metadata if available
    const charge = paymentIntent.latest_charge;
    if (typeof charge === "string" || !charge) {
      // Without the price ID we have to fall back to amount-based heuristic
      const amount = paymentIntent.amount; // in cents
      if (amount === 900) credits = 100;
      else if (amount === 2900) credits = 500;
      else if (amount === 7900) credits = 2000;
    }
  } catch (e) {
    console.warn("Could not parse AI boost credit amount from payment intent:", e);
  }

  if (credits === 0) {
    console.warn(`AI boost purchase for org ${orgId} had unknown credit amount, skipping`);
    return;
  }

  // Idempotency: if we've already recorded this payment_intent, skip
  const { data: existing } = await supabase
    .from("ai_boost_credits")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();
  if (existing) {
    console.log(`AI boost payment ${paymentIntent.id} already recorded, skipping`);
    return;
  }

  await supabase.from("ai_boost_credits").insert({
    organization_id: orgId,
    credits_remaining: credits,
    credits_initial: credits,
    stripe_payment_intent_id: paymentIntent.id,
  });
  console.log(`Recorded AI boost: org=${orgId}, credits=${credits}, pi=${paymentIntent.id}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook misconfigured (missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET)");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await req.text();

  // Verify the webhook signature
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  let event: Stripe.Event;
  try {
    // The async variant is required for Deno (Web Crypto signature verification)
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e);
    return new Response("Invalid signature", { status: 401 });
  }

  console.log(`Stripe webhook received: ${event.type} (${event.id})`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      // ── Checkout completed (first payment) ───────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organization_id as string | undefined;
        const kind = session.metadata?.purchase_kind as string | undefined;

        if (!orgId) {
          console.warn("checkout.session.completed has no organization_id metadata");
          break;
        }

        if (kind === "ai_boost" && session.payment_intent) {
          // One-time AI Boost purchase — credits will be recorded in the
          // `payment_intent.succeeded` event handler (or we could do it
          // here too — but PI gives us more data). Skip for now.
          console.log(`AI boost checkout completed for org=${orgId}, awaiting payment_intent event`);
          break;
        }

        // Subscription purchase — fetch the subscription and upsert it
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
          const fullSub = await stripe.subscriptions.retrieve(subId);
          // Make sure metadata.organization_id is set on the subscription too
          // (we set it at checkout creation time)
          if (!fullSub.metadata?.organization_id) {
            await stripe.subscriptions.update(subId, {
              metadata: { organization_id: orgId },
            });
            fullSub.metadata = { ...fullSub.metadata, organization_id: orgId };
          }
          await upsertSubscriptionFromStripe(supabase, fullSub);
        }
        break;
      }

      // ── Subscription lifecycle events ────────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(supabase, sub);
        break;
      }

      // ── Renewal succeeded → extend current_period_end + email confirmation ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subId = typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription.id;
          const fullSub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscriptionFromStripe(supabase, fullSub);
          await dispatchPaymentSuccessEmail(supabase, fullSub, invoice);
        }
        break;
      }

      // ── Payment failed → mark past_due + email "update your card" ────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subId = typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription.id;
          await supabase.from("subscriptions").update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          }).eq("stripe_subscription_id", subId);
          await dispatchPaymentFailedEmail(supabase, subId);
        }
        break;
      }

      // ── One-time AI Boost payment succeeded ──────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        // Only record AI boost — not subscription invoice payments
        if (pi.metadata?.kind === "ai_boost") {
          await recordAiBoostPurchase(supabase, pi);
        }
        break;
      }

      default:
        // Unhandled event types are fine — just log and 200 so Stripe
        // doesn't retry. We only handle what affects our DB state.
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`Error handling ${event.type} (${event.id}):`, e);
    // Return 500 so Stripe retries (within reason — Stripe gives up after 3 days)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

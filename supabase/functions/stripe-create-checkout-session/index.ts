// Stripe Checkout Session creator
// --------------------------------
// Frontend calls this when the user clicks "Subscribe to Pro" (or buys an
// AI Boost). We:
//   1. Authenticate the user
//   2. Resolve their organization
//   3. Get-or-create a Stripe customer for that organization
//   4. Create a Checkout Session with that customer + the requested price
//   5. Return the checkout URL — frontend redirects there
//
// All sensitive state lives in Stripe; our DB is updated later by the
// webhook (`stripe-webhook`) when Stripe confirms the payment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  // 'subscription' for the 3 plans, 'payment' (one-time) for AI Boost packs
  mode: "subscription" | "payment";
  // Stripe price_id to subscribe to / purchase
  price_id: string;
  // Where to redirect after success / cancel — relative paths inside the app
  success_path?: string;
  cancel_path?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // ── Env ────────────────────────────────────────────────────────────────
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const APP_URL = Deno.env.get("APP_URL") || "https://app.aceleradoradeventas.co";

    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured (missing STRIPE_SECRET_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Auth: validate the caller's JWT ────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = (await req.json()) as RequestBody;
    if (!body.price_id || !body.mode) {
      return new Response(
        JSON.stringify({ error: "Missing price_id or mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (body.mode !== "subscription" && body.mode !== "payment") {
      return new Response(
        JSON.stringify({ error: "Invalid mode (must be 'subscription' or 'payment')" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Resolve user's organization (service-role to bypass RLS for member lookup) ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: membership } = await adminClient
      .from("organization_members")
      .select("organization_id, organizations(name, slug)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership?.organization_id) {
      return new Response(
        JSON.stringify({ error: "Not a member of any organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const orgId = membership.organization_id;
    const orgName = (membership as any).organizations?.name ?? "Workspace";
    const orgSlug = (membership as any).organizations?.slug ?? "";

    // ── Fetch / create Stripe customer ─────────────────────────────────────
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });

    const { data: sub } = await adminClient
      .from("subscriptions")
      .select("id, stripe_customer_id")
      .eq("organization_id", orgId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;

    if (!customerId) {
      // Either no subscription row yet (shouldn't happen if signup hook ran)
      // or row exists but customer not yet created in Stripe. Create now.
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: orgName,
        metadata: {
          organization_id: orgId,
          user_id: user.id,
          // We embed enough metadata so the webhook can route incoming events
          // to the right org even if our DB lookup fails later.
        },
      });
      customerId = customer.id;

      // Upsert the subscription row with the customer_id (idempotent if it
      // already exists from the signup trial hook).
      await adminClient.from("subscriptions").upsert(
        {
          organization_id: orgId,
          plan_id: "pro",                  // default while in trial / pre-checkout
          status: "trialing_internal",
          stripe_customer_id: customerId,
        },
        { onConflict: "organization_id" },
      );
    }

    // ── Build success / cancel URLs ────────────────────────────────────────
    const basePath = orgSlug ? `/w/${orgSlug}` : "";
    const successUrl =
      `${APP_URL}${basePath}${body.success_path || "/billing"}?checkout_status=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      `${APP_URL}${basePath}${body.cancel_path || "/billing"}?checkout_status=canceled`;

    // ── Create the Checkout Session ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: body.mode,
      customer: customerId,
      line_items: [{ price: body.price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Pass org_id in metadata so the webhook can resolve without needing
      // to fetch the customer (faster + fewer Stripe API calls).
      metadata: {
        organization_id: orgId,
        user_id: user.id,
        purchase_kind: body.mode === "subscription" ? "plan" : "ai_boost",
      },
      // Tax handling: Stripe Tax can be enabled in dashboard; we don't
      // configure here. For LATAM with LLC US, Stripe handles US sales tax
      // automatically if Tax is enabled.
      allow_promotion_codes: true,
      // For subscriptions, capture the upgrade button intent so the
      // customer goes to portal next time (not checkout again).
      ...(body.mode === "subscription"
        ? { subscription_data: { metadata: { organization_id: orgId } } }
        : { payment_intent_data: { metadata: { organization_id: orgId, kind: "ai_boost" } } }),
    });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("stripe-create-checkout-session error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

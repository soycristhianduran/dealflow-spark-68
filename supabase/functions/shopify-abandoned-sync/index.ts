// shopify-abandoned-sync — cron poller for ABANDONED CARTS.
// For each connected store, pulls Shopify's abandoned checkouts, and once a
// checkout has been abandoned past the threshold (and the shopper hasn't since
// bought), matches/creates a contact and fires the `abandoned_cart` automation
// trigger (which then runs the store's email / WhatsApp follow-ups).
// Gated by x-cron-secret (same as shopify-sync).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2024-10";
const CRON_SECRET = "klosify-shopify-sync-2026";
const ABANDON_MINUTES = 60;     // consider a checkout "abandoned" after this long
const MAX_AGE_HOURS = 72;       // don't notify checkouts older than this

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function fireAbandonedTrigger(contactId: string, cart: Record<string, unknown>) {
  // Reuse the central automation engine (same shape landing-submit/track-email use).
  await fetch(`${SUPABASE_URL}/functions/v1/automation-runner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({
      action: "trigger_event",
      trigger_type: "abandoned_cart",
      contact_id: contactId,
      trigger_data: { cart },
    }),
  }).catch(() => {});
}

async function processStore(db: any, cfg: any): Promise<number> {
  // Shopify lists OPEN (not completed) checkouts on this endpoint → these are
  // the abandoned-cart candidates.
  const url = `https://${cfg.shop_domain}/admin/api/${API_VERSION}/checkouts.json?limit=250&status=open`;
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.access_token } });
  if (!res.ok) return 0;
  const checkouts = (await res.json()).checkouts || [];
  const now = Date.now();
  let fired = 0;

  for (const c of checkouts) {
    if (c.completed_at) continue;                       // already purchased
    const createdMs = c.created_at ? new Date(c.created_at).getTime() : now;
    const ageMin = (now - createdMs) / 60000;
    if (ageMin < ABANDON_MINUTES) continue;             // too fresh — give them time
    if (ageMin > MAX_AGE_HOURS * 60) continue;          // too old — skip

    const email = c.email || c.customer?.email || null;
    const phone = c.phone || c.customer?.phone || c.billing_address?.phone || c.shipping_address?.phone || null;
    if (!email && !phone) continue;                     // can't reach them

    const items = (c.line_items || []).map((li: any) => ({
      title: li.title, qty: li.quantity, price: Number(li.price ?? 0),
    }));
    const cartRow = {
      organization_id: cfg.organization_id,
      shop_domain: cfg.shop_domain,
      checkout_id: String(c.id ?? c.token),
      token: c.token ?? null,
      email, phone,
      total_price: Number(c.total_price ?? 0),
      currency: c.currency ?? cfg.currency ?? null,
      item_count: items.reduce((s: number, i: any) => s + (i.qty || 0), 0),
      items,
      recovery_url: c.abandoned_checkout_url ?? null,
      shopify_created_at: c.created_at ?? null,
      shopify_updated_at: c.updated_at ?? null,
      updated_at: new Date().toISOString(),
    };

    // Upsert (so retries/updates don't duplicate). Returns existing status.
    const { data: existing } = await db.from("shopify_abandoned_checkouts")
      .select("id, status, contact_id")
      .eq("organization_id", cfg.organization_id)
      .eq("checkout_id", cartRow.checkout_id)
      .maybeSingle();

    if (existing && existing.status !== "open") continue; // already notified/recovered

    // Did they buy AFTER abandoning? → mark recovered, don't notify.
    const { data: order } = await db.from("shopify_orders")
      .select("id")
      .eq("organization_id", cfg.organization_id)
      .or(`email.eq.${email || "___"},phone.eq.${phone || "___"}`)
      .gte("shopify_created_at", c.created_at)
      .limit(1)
      .maybeSingle();

    // Match or create the contact (preserve first-touch source on create).
    let contactId: string | null = existing?.contact_id ?? null;
    if (!contactId) {
      const { data: matched } = await db.rpc("match_contact", {
        p_org: cfg.organization_id, p_phone: phone, p_email: email,
      });
      contactId = (matched as string) || null;
    }
    if (!contactId) {
      const fullName = [c.customer?.first_name, c.customer?.last_name].filter(Boolean).join(" ").trim();
      const { data: created } = await db.from("contacts").insert({
        organization_id: cfg.organization_id,
        first_name: c.customer?.first_name || null,
        last_name: c.customer?.last_name || null,
        full_name: fullName || email || phone,
        primary_email: email,
        primary_phone: phone,
        source: "Shopify: carrito abandonado",
      }).select("id").single();
      contactId = created?.id ?? null;
    }
    if (!contactId) continue;

    const status = order ? "recovered" : "notified";
    const stamp = new Date().toISOString();
    await db.from("shopify_abandoned_checkouts").upsert({
      ...cartRow,
      contact_id: contactId,
      status,
      ...(order ? { recovered_at: stamp } : { notified_at: stamp }),
    }, { onConflict: "organization_id,checkout_id" });

    if (!order) {
      await fireAbandonedTrigger(contactId, {
        recovery_url: cartRow.recovery_url,
        total: cartRow.total_price,
        currency: cartRow.currency,
        item_count: cartRow.item_count,
        items: cartRow.items,
        shop: cfg.shop_name || cfg.shop_domain,
      });
      fired++;
    }
  }
  return fired;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response("forbidden", { status: 403 });
  const db = createClient(SUPABASE_URL, SERVICE);
  const { data: configs } = await db.from("shopify_configs").select("*").eq("is_active", true);
  let total = 0;
  for (const cfg of configs ?? []) {
    try { total += await processStore(db, cfg); } catch (_) { /* skip store */ }
  }
  return new Response(JSON.stringify({ ok: true, stores: configs?.length ?? 0, notified: total }), {
    headers: { "Content-Type": "application/json" },
  });
});

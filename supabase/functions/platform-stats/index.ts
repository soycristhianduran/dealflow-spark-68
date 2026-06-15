// platform-stats — founder-only SaaS health report.
// Aggregates every org's plan + consumption vs limits, and platform-level infra
// usage/cost (Anthropic, Resend, Supabase) with upgrade flags. Gated to
// platform_admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno&deno-std=0.224.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ── Cost model (USD) ────────────────────────────────────────────────────────
const agentCost   = (i: number, o: number) => i / 1e6 * 1 + o / 1e6 * 5;   // Haiku
const landingCost = (i: number, o: number) => i / 1e6 * 3 + o / 1e6 * 15;  // Sonnet
// analysis/assistant/call exact cost comes from ai_usage_cost_report (real tokens).

const pct = (used: number, limit: number | null) =>
  limit == null ? null : Math.round((used / Math.max(limit, 1)) * 1000) / 10;
const flag = (used: number, limit: number | null) =>
  limit != null && used >= limit ? "over" : limit != null && used >= limit * 0.8 ? "near" : "ok";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Gate: caller must be a platform admin ──
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "no auth" }, 401);
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await authClient.auth.getUser(token);
    if (!user) return json({ error: "invalid token" }, 401);

    const db = createClient(SUPABASE_URL, SERVICE);
    const { data: isAdmin } = await db.rpc("is_platform_admin", { p_uid: user.id });
    if (!isAdmin) return json({ error: "forbidden — not a platform admin" }, 403);

    // ── Data ──
    const [{ data: plansData }, { data: orgs }, { data: dbBytes }, { data: aiCost }, { data: infraExtra }, { data: health }] = await Promise.all([
      db.from("plans").select("*"),
      db.rpc("platform_org_report"),
      db.rpc("platform_db_size_bytes"),
      db.rpc("ai_usage_cost_report"),
      db.rpc("platform_infra_extra"),
      db.rpc("platform_integrations_health"),
    ]);
    const plans: Record<string, any> = {};
    for (const p of plansData ?? []) plans[p.id] = p;
    // Exact per-org per-feature AI cost (real tokens): { orgId: { analysis, assistant, call } }
    const exact: Record<string, Record<string, number>> = {};
    for (const r of aiCost ?? []) {
      (exact[r.organization_id] ??= {})[r.feature] = Number(r.cost_usd);
    }

    const activeStatuses = ["active", "trialing", "trialing_internal"];

    // ── Per-org breakdown ──
    const orgReport = (orgs ?? []).map((o: any) => {
      const p = plans[o.plan_id] ?? {};
      const landingTokens = Number(o.landing_tokens_in) + Number(o.landing_tokens_out);
      const agentCostUsd = agentCost(Number(o.agent_tokens_in), Number(o.agent_tokens_out));
      const landingCostUsd = landingCost(Number(o.landing_tokens_in), Number(o.landing_tokens_out));
      const metric = (used: number, limit: number | null) => ({ used, limit, pct: pct(used, limit), flag: flag(used, limit) });
      return {
        org_id: o.org_id,
        name: o.org_name || "(sin nombre)",
        plan: o.plan_id,
        status: o.status,
        active: activeStatuses.includes(o.status),
        usage: {
          users:          metric(Number(o.member_count), p.max_users),
          contacts:       metric(Number(o.contact_count), p.max_contacts),
          ai_analyses:    metric(o.ai_analyses_used, p.monthly_ai_analyses),
          ai_objections:  metric(o.ai_objections_used, p.monthly_ai_objections),
          ai_assistant:   metric(o.ai_assistant_used, p.monthly_ai_assistant),
          agent_credits:  metric(Number(o.ai_agent_credits_used), p.monthly_ai_agent_credits),
          email:          metric(o.email_sends_used, p.monthly_email_sends),
        },
        addon_balances: {
          agent_credits: Number(o.agent_credit_balance),
          landing_credits: Math.floor(Number(o.landing_credit_balance) / 1000), // tokens→créditos
          boost: Number(o.boost_balance),
        },
        month_cost_usd: Math.round((agentCostUsd + landingCostUsd
          + (exact[o.org_id]?.analysis ?? 0) + (exact[o.org_id]?.assistant ?? 0)
          + (exact[o.org_id]?.call ?? 0)) * 100) / 100,
        landing_credits_used_month: Math.floor(landingTokens / 1000),
      };
    });

    // ── Platform aggregates ──
    let agIn = 0, agOut = 0, laIn = 0, laOut = 0, emails = 0;
    for (const o of orgs ?? []) {
      agIn += Number(o.agent_tokens_in); agOut += Number(o.agent_tokens_out);
      laIn += Number(o.landing_tokens_in); laOut += Number(o.landing_tokens_out);
      emails += o.email_sends_used;
    }
    // Exact totals from the AI usage log (real tokens).
    let exactAnalysis = 0, exactAssistant = 0, exactCall = 0;
    for (const r of aiCost ?? []) {
      if (r.feature === "analysis") exactAnalysis += Number(r.cost_usd);
      else if (r.feature === "assistant") exactAssistant += Number(r.cost_usd);
      else if (r.feature === "call") exactCall += Number(r.cost_usd);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const anthropicCost = {
      agent_usd: r2(agentCost(agIn, agOut)),       // Anthropic Haiku
      landings_usd: r2(landingCost(laIn, laOut)),  // Anthropic Sonnet
      call_usd: r2(exactCall),                     // Anthropic Haiku (call analysis)
      // OpenAI gpt-4o-mini (análisis + asistente) — exact, real tokens.
      openai_analysis_usd: r2(exactAnalysis),
      openai_assistant_usd: r2(exactAssistant),
    };
    const anthropicTotal = r2(anthropicCost.agent_usd + anthropicCost.landings_usd + anthropicCost.call_usd
      + anthropicCost.openai_analysis_usd + anthropicCost.openai_assistant_usd);

    // Resend: total emails this month vs tier.
    const resendTier = emails <= 3000
      ? { name: "Free", cap: 3000, cost: 0, next: "Pro $20 (50k)" }
      : emails <= 50000
      ? { name: "Pro $20", cap: 50000, cost: 20, next: "Scale $90 (100k)" }
      : { name: "Scale $90+", cap: 100000, cost: 90, next: "Scale superior" };
    const resend = {
      emails_this_month: emails,
      tier: resendTier.name,
      cap: resendTier.cap,
      pct: Math.round((emails / resendTier.cap) * 1000) / 10,
      upgrade: emails >= resendTier.cap * 0.8,
      suggestion: emails >= resendTier.cap * 0.8 ? `Acércate al límite — considera ${resendTier.next}` : "OK",
    };

    // Supabase: DB + storage (SQL) vs Pro plan (8 GB DB, 100 GB storage incl.).
    const gb = Number(dbBytes) / 1e9;
    const storageGb = Number(infraExtra?.storage_bytes ?? 0) / 1e9;
    const supa = {
      db_size_gb: Math.round(gb * 1000) / 1000,
      db_included_gb: 8,
      db_pct: Math.round((gb / 8) * 1000) / 10,
      storage_gb: Math.round(storageGb * 1000) / 1000,
      storage_included_gb: 100,
      storage_pct: Math.round((storageGb / 100) * 1000) / 10,
      mau: Number(infraExtra?.mau ?? 0),
      total_users: Number(infraExtra?.total_users ?? 0),
      upgrade: gb >= 8 * 0.8 || storageGb >= 100 * 0.8,
      note: "Egress e invocations de Edge no se exponen por API — revísalos en el dashboard de Supabase.",
    };

    // Stripe: real fees this month + REAL MRR from actual subscriptions (the true
    // billed amount — auto-excludes comped/internal orgs and respects legacy prices).
    let stripeFees = -1;
    let stripeMrr: number | null = null;
    let stripeSubs = 0;
    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-11-20.acacia" });
      const now = new Date();
      const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
      let total = 0, after: string | undefined;
      for (let i = 0; i < 10; i++) {
        const tx: any = await stripe.balanceTransactions.list({ created: { gte: monthStart }, limit: 100, ...(after ? { starting_after: after } : {}) });
        for (const t of tx.data) total += t.fee || 0;
        if (!tx.has_more) break;
        after = tx.data[tx.data.length - 1]?.id;
      }
      stripeFees = Math.round(total) / 100;

      // Real MRR: sum each active subscription's actual recurring amount (legacy
      // prices included), normalized to monthly. Add-on subs (seats/contacts) count too.
      let mrrCents = 0, sAfter: string | undefined;
      for (let i = 0; i < 10; i++) {
        const subs: any = await stripe.subscriptions.list({ status: "active", limit: 100, ...(sAfter ? { starting_after: sAfter } : {}) });
        for (const sub of subs.data) {
          stripeSubs++;
          for (const it of sub.items.data) {
            const amt = (it.price?.unit_amount || 0) * (it.quantity || 1);
            mrrCents += it.price?.recurring?.interval === "year" ? amt / 12 : amt;
          }
        }
        if (!subs.has_more) break;
        sAfter = subs.data[subs.data.length - 1]?.id;
      }
      stripeMrr = Math.round(mrrCents) / 100;
    } catch (_) { stripeFees = -1; }
    const stripe = { fees_this_month_usd: stripeFees, mrr_usd: stripeMrr, paying_subs: stripeSubs, note: stripeFees < 0 ? "No disponible" : "Comisiones e ingresos reales de Stripe" };

    // Vercel (Hobby): the API doesn't expose bandwidth/edge usage — show deploy
    // health + plan limits as reference. Best-effort.
    let vercel: any = { available: false };
    try {
      const vToken = Deno.env.get("VERCEL_API_TOKEN");
      const vProj = Deno.env.get("VERCEL_PROJECT_ID");
      if (vToken && vProj) {
        const since = Date.now() - 30 * 24 * 3600 * 1000;
        const r = await fetch(`https://api.vercel.com/v6/deployments?projectId=${vProj}&limit=100&since=${since}`, { headers: { Authorization: `Bearer ${vToken}` } });
        const j = await r.json();
        const deps = j.deployments || [];
        const latest = deps[0] || {};
        vercel = {
          available: true,
          plan: "Hobby",
          last_deploy_state: latest.state || latest.readyState || "—",
          last_deploy_at: latest.created || latest.createdAt || null,
          deploys_30d: deps.length,
          limits: "100 GB transfer · 1M edge requests",
          note: "Hobby (gratis). Consumo de transfer/requests solo en el dashboard de Vercel.",
        };
      }
    } catch (_) { vercel = { available: false }; }

    // Cloudflare (DNS/CDN): real analytics via GraphQL (last 30 days). Best-effort.
    let cloudflare: any = { available: false };
    try {
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
      const cfZone = Deno.env.get("CLOUDFLARE_ZONE_ID");
      if (cfToken && cfZone) {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const q = `{ viewer { zones(filter: {zoneTag: "${cfZone}"}) { httpRequests1dGroups(limit: 31, filter: {date_geq: "${since}"}) { sum { requests bytes cachedRequests } } } } }`;
        const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const j = await r.json();
        const g = j?.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
        let req = 0, bytes = 0, cached = 0;
        for (const x of g) { req += x.sum.requests; bytes += x.sum.bytes; cached += x.sum.cachedRequests; }
        cloudflare = {
          available: true,
          plan: "Free",
          requests_30d: req,
          gb_30d: Math.round(bytes / 1e9 * 1000) / 1000,
          cached_pct: Math.round((cached / Math.max(req, 1)) * 1000) / 10,
          note: "Analíticas reales del dominio (últimos 30 días).",
        };
      }
    } catch (_) { cloudflare = { available: false }; }

    const byPlan: Record<string, number> = {};
    for (const o of orgReport) if (o.active) byPlan[o.plan] = (byPlan[o.plan] ?? 0) + 1;

    const stripeCost = stripeFees > 0 ? stripeFees : 0;
    const infraTotal = Math.round((anthropicTotal + resendTier.cost + stripeCost) * 100) / 100;
    // MRR REAL: prefer Stripe's actual billed amount (legacy prices + excludes
    // comped/internal orgs). Fall back to plan list price only if Stripe is down.
    const priceOf = (o: any) => Number(plans[o.plan]?.monthly_price_usd ?? 0);
    const trials = orgReport.filter((o) => o.status === "trialing" || o.status === "trialing_internal");
    const mrr = stripeMrr != null ? stripeMrr
      : Math.round(orgReport.filter((o) => o.status === "active").reduce((s, o) => s + priceOf(o), 0) * 100) / 100;
    const mrrTrials = Math.round(trials.reduce((s, o) => s + priceOf(o), 0) * 100) / 100;
    const payingCount = stripeMrr != null ? stripeSubs : orgReport.filter((o) => o.status === "active").length;

    return json({
      generated_at: new Date().toISOString(),
      summary: {
        total_orgs: orgReport.length,
        active_orgs: orgReport.filter((o) => o.active).length,
        paying_orgs: payingCount,
        trial_orgs: trials.length,
        by_plan: byPlan,
        mrr_usd: mrr,                 // REAL billed amount from Stripe
        mrr_trials_usd: mrrTrials,    // potential if trials convert (at list price)
        mrr_source: stripeMrr != null ? "stripe" : "plan",
        anthropic_month_usd: anthropicTotal,
        resend_month_usd: resendTier.cost,
        stripe_fees_usd: stripeCost,
        infra_month_usd: infraTotal,
      },
      anthropic: anthropicCost,
      resend,
      supabase: supa,
      stripe,
      vercel,
      cloudflare,
      integrations: health ?? {},
      orgs: orgReport,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

// platform-stats — founder-only SaaS health report.
// Aggregates every org's plan + consumption vs limits, and platform-level infra
// usage/cost (Anthropic, Resend, Supabase) with upgrade flags. Gated to
// platform_admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const [{ data: plansData }, { data: orgs }, { data: dbBytes }, { data: aiCost }] = await Promise.all([
      db.from("plans").select("*"),
      db.rpc("platform_org_report"),
      db.rpc("platform_db_size_bytes"),
      db.rpc("ai_usage_cost_report"),
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

    // Supabase: DB size vs Pro plan (8 GB included).
    const gb = Number(dbBytes) / 1e9;
    const supa = {
      db_size_gb: Math.round(gb * 1000) / 1000,
      included_gb: 8,
      pct: Math.round((gb / 8) * 1000) / 10,
      upgrade: gb >= 8 * 0.8,
      note: "Egress y MAU requieren la Management API (fase 2). El tamaño de DB es la métrica principal.",
    };

    const byPlan: Record<string, number> = {};
    for (const o of orgReport) if (o.active) byPlan[o.plan] = (byPlan[o.plan] ?? 0) + 1;

    return json({
      generated_at: new Date().toISOString(),
      summary: {
        total_orgs: orgReport.length,
        active_orgs: orgReport.filter((o) => o.active).length,
        by_plan: byPlan,
        mrr_usd: orgReport.filter((o) => o.active).reduce((s, o) => s + Number(plans[o.plan]?.monthly_price_usd ?? 0), 0),
        anthropic_month_usd: anthropicTotal,
        resend_month_usd: resendTier.cost,
        infra_month_usd: Math.round((anthropicTotal + resendTier.cost) * 100) / 100,
      },
      anthropic: anthropicCost,
      resend,
      supabase: supa,
      orgs: orgReport,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});

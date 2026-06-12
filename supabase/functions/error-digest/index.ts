// error-digest — daily summary of captured errors. If anything failed in the last
// 24h (error_logs), email the platform owner so silent failures surface fast.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data: errs } = await supabase
      .from("error_logs")
      .select("source, level, message, created_at")
      .gte("created_at", since)
      .neq("level", "digest")
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = errs || [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ errors: 0, emailed: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Counts by source
    const bySource: Record<string, number> = {};
    for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;
    const summaryLines = Object.entries(bySource).map(([s, n]) => `• ${s}: ${n}`).join("<br>");
    const recent = rows.slice(0, 15).map((r) =>
      `<tr><td style="padding:4px 8px;color:#64748b">${new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td><td style="padding:4px 8px"><b>${r.source}</b></td><td style="padding:4px 8px">${(r.message || "").slice(0, 160)}</td></tr>`
    ).join("");

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <h2 style="color:#f97316">⚠️ Klosify — ${rows.length} error(es) en 24h</h2>
        <p>Resumen por origen:</p>
        <p>${summaryLines}</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0">
          <thead><tr style="background:#f8fafc"><th style="padding:6px 8px;text-align:left">Hora (UTC)</th><th style="padding:6px 8px;text-align:left">Origen</th><th style="padding:6px 8px;text-align:left">Mensaje</th></tr></thead>
          <tbody>${recent}</tbody>
        </table>
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">Revisa la tabla error_logs para el detalle completo.</p>
      </div>`;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM_ADDRESS") || "alerts@klosify.com";
    const to = Deno.env.get("CONTACT_EMAIL");
    let emailed = false;
    if (RESEND_API_KEY && to) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `Klosify Alertas <${from}>`, to, subject: `⚠️ Klosify: ${rows.length} error(es) en 24h`, html }),
      });
      emailed = res.ok;
      if (!res.ok) console.error("digest email failed:", await res.text());
    }

    await supabase.from("error_logs").insert({ source: "error-digest", level: "digest", message: `${rows.length} errores en 24h`, context: bySource });

    return new Response(JSON.stringify({ errors: rows.length, emailed, bySource }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("error-digest fatal:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: corsHeaders });
  }
});

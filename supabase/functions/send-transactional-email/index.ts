// Transactional email dispatcher
// -------------------------------
// Single Edge Function that renders + sends every platform email:
//   - welcome             → fired by handle_new_user trigger via pg_net
//   - trial_ending        → fired by daily cron at day-11
//   - trial_ended         → fired by daily cron at day-14
//   - payment_success     → fired by stripe-webhook on invoice.paid
//   - payment_failed      → fired by stripe-webhook on invoice.payment_failed
//
// Sender domain + brand name come from env vars (EMAIL_FROM_ADDRESS,
// BRAND_NAME, APP_URL) so swapping domains later means 3 secret edits, no
// code deploy.
//
// Every send is logged to `email_log` for idempotency (same template + same
// user + same period → don't send twice) and audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API = "https://api.resend.com/emails";

type TemplateName =
  | "welcome"
  | "trial_ending"
  | "trial_ended"
  | "payment_success"
  | "payment_failed";

interface RequestBody {
  to: string;                      // recipient email
  template: TemplateName;
  // Template-specific data — varies per template
  data: Record<string, unknown>;
  // Optional: dedupe key. If a row in email_log already exists with this
  // (template, dedupe_key), the send is skipped (returns 200 with skipped=true).
  // E.g. "trial_ending:<user_id>:<period_ending_at>" makes the day-11 send
  // idempotent even if the cron runs twice.
  dedupe_key?: string;
  // Optional: which user/org this is for (for audit log)
  user_id?: string;
  organization_id?: string;
}

// ---------------------------------------------------------------------------
// Render helpers — keep these tight, no template engine. Email clients are
// hostile to anything fancy; inline CSS, no <style>, no JS, no external CSS.
// ---------------------------------------------------------------------------

function brandHeader(brandName: string, appUrl: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;padding:24px 0;">
      <tr><td align="center">
        <a href="${appUrl}" style="color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;text-decoration:none;letter-spacing:-0.4px;display:inline-flex;align-items:center;gap:8px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="28" height="28" style="display:inline-block;vertical-align:middle;"><defs><linearGradient id="kg" x1="20" y1="6" x2="80" y2="91" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#FFA01E"/><stop offset="46%" stop-color="#FF6B2C"/><stop offset="100%" stop-color="#E8460E"/></linearGradient></defs><rect x="17" y="6" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="61" y="6" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="17" y="28" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="39" y="28" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="17" y="50" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="39" y="50" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="17" y="72" width="19" height="19" rx="5" fill="url(#kg)"/><rect x="61" y="72" width="19" height="19" rx="5" fill="url(#kg)"/></svg>
          ${brandName}
        </a>
      </td></tr>
    </table>
  `;
}

function brandFooter(brandName: string, appUrl: string, contactEmail: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
      <tr><td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#6b7280;line-height:1.6;">
        <p style="margin:4px 0;">${brandName} — Tu CRM para WhatsApp, Instagram y leads de Meta</p>
        <p style="margin:4px 0;">
          <a href="${appUrl}" style="color:#6b7280;text-decoration:underline;">${appUrl.replace("https://", "")}</a> ·
          <a href="mailto:${contactEmail}" style="color:#6b7280;text-decoration:underline;">${contactEmail}</a>
        </p>
        <p style="margin:8px 0 0 0;font-size:11px;">
          Este es un email transaccional de tu cuenta. No te puedes desuscribir mientras tengas una cuenta activa.
        </p>
      </td></tr>
    </table>
  `;
}

function wrap(content: string, brandName: string, appUrl: string, contactEmail: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f9fafb;padding:24px 12px;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <tr><td>${brandHeader(brandName, appUrl)}</td></tr>
            <tr><td style="padding:32px;color:#111827;line-height:1.6;font-size:15px;">${content}</td></tr>
            <tr><td style="padding:0 32px 32px;">${brandFooter(brandName, appUrl, contactEmail)}</td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  `;
}

function ctaButton(label: string, href: string): string {
  return `
    <p style="text-align:center;margin:24px 0;">
      <a href="${href}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:8px;font-size:15px;">${label}</a>
    </p>
  `;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface RenderContext {
  brandName: string;
  appUrl: string;
  contactEmail: string;
}

function renderTemplate(
  template: TemplateName,
  data: Record<string, unknown>,
  ctx: RenderContext,
): { subject: string; html: string; text: string } {
  const { brandName, appUrl, contactEmail } = ctx;
  const billingUrl = `${appUrl}/pricing`;

  switch (template) {
    case "welcome": {
      const name = String(data.first_name || "amigo");
      const workspaceName = String(data.workspace_name || "tu workspace");
      const daysInTrial = Number(data.days_in_trial ?? 14);
      const dashboardUrl = String(data.dashboard_url || appUrl);

      const subject = `Bienvenido a ${brandName}, ${name} 🚀`;
      const body = `
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">¡Hola ${name}!</h1>
        <p>Bienvenido a <strong>${brandName}</strong>. Tu workspace <strong>${workspaceName}</strong> está listo y tienes <strong>${daysInTrial} días de prueba gratuita</strong> del plan Pro completo.</p>
        <p>Empieza por aquí:</p>
        <ul style="padding-left:18px;">
          <li>Conecta tu Instagram, WhatsApp y/o Facebook desde <strong>Integraciones</strong></li>
          <li>Importa tus contactos o agrega el primero manualmente</li>
          <li>Configura tu primer pipeline de ventas</li>
        </ul>
        ${ctaButton("Entrar a mi CRM", dashboardUrl)}
        <p style="font-size:14px;color:#6b7280;">¿Dudas? Responde a este email — leemos cada uno.</p>
      `;
      const text =
`Hola ${name},

Bienvenido a ${brandName}. Tu workspace ${workspaceName} está listo y tienes ${daysInTrial} días de prueba gratuita del plan Pro.

Entra a tu CRM: ${dashboardUrl}

¿Dudas? Responde a este email.

— El equipo de ${brandName}`;
      return { subject, html: wrap(body, brandName, appUrl, contactEmail), text };
    }

    case "trial_ending": {
      const name = String(data.first_name || "amigo");
      const daysLeft = Number(data.days_left ?? 3);
      const upgradeUrl = String(data.upgrade_url || billingUrl);

      const subject = `Tu prueba en ${brandName} termina en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`;
      const body = `
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">${name}, tu prueba está por terminar</h1>
        <p>Te quedan <strong>${daysLeft} día${daysLeft === 1 ? "" : "s"}</strong> de tu prueba gratuita en el plan Pro.</p>
        <p>Si te ha gustado lo que has visto, elige tu plan ahora y mantén todo tu progreso (contactos, deals, automatizaciones, integraciones de WhatsApp/IG):</p>
        ${ctaButton("Elegir mi plan", upgradeUrl)}
        <p style="font-size:14px;color:#6b7280;">Si no eliges un plan antes de que termine la prueba, tu workspace se pausará y podrás reactivarlo cuando quieras pagando un plan.</p>
        <p style="font-size:14px;color:#6b7280;">Nuestros planes desde <strong>$14 USD/mes</strong>. <a href="${upgradeUrl}" style="color:#3b82f6;">Ver comparativa</a>.</p>
      `;
      const text =
`Hola ${name},

Tu prueba gratuita en ${brandName} termina en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.

Elige tu plan ahora para mantener tu workspace activo: ${upgradeUrl}

— ${brandName}`;
      return { subject, html: wrap(body, brandName, appUrl, contactEmail), text };
    }

    case "trial_ended": {
      const name = String(data.first_name || "amigo");
      const upgradeUrl = String(data.upgrade_url || billingUrl);

      const subject = `Tu prueba en ${brandName} terminó — reactiva tu acceso`;
      const body = `
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">${name}, tu prueba terminó</h1>
        <p>Tu workspace está pausado, pero <strong>todos tus datos siguen intactos</strong> (contactos, conversaciones, deals, automatizaciones).</p>
        <p>Elige un plan para reactivarlo ahora:</p>
        ${ctaButton("Elegir mi plan", upgradeUrl)}
        <p style="font-size:14px;color:#6b7280;">Planes desde <strong>$14 USD/mes</strong>. Sin contratos largos, cancela cuando quieras.</p>
        <p style="font-size:14px;color:#6b7280;">¿Tienes preguntas antes de pagar? Responde este email y te respondo personalmente.</p>
      `;
      const text =
`Hola ${name},

Tu prueba gratuita en ${brandName} terminó. Tu workspace está pausado pero tus datos están a salvo.

Reactiva tu acceso eligiendo un plan: ${upgradeUrl}

— ${brandName}`;
      return { subject, html: wrap(body, brandName, appUrl, contactEmail), text };
    }

    case "payment_success": {
      const name = String(data.first_name || "amigo");
      const planName = String(data.plan_name || "Pro");
      const amount = String(data.amount_display || "");
      const nextBillingDate = String(data.next_billing_date || "");
      const dashboardUrl = String(data.dashboard_url || appUrl);

      const subject = `¡Pago confirmado! Tu plan ${planName} está activo en ${brandName}`;
      const body = `
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">¡Gracias, ${name}!</h1>
        <p>Recibimos tu pago${amount ? ` de <strong>${amount}</strong>` : ""} y tu plan <strong>${planName}</strong> está activo.</p>
        ${nextBillingDate ? `<p>Próxima fecha de facturación: <strong>${nextBillingDate}</strong></p>` : ""}
        ${ctaButton("Ir a mi CRM", dashboardUrl)}
        <p style="font-size:14px;color:#6b7280;">Tu recibo oficial llegará en un email separado de Stripe. Si necesitas factura con tus datos fiscales, contesta este email y te ayudamos.</p>
      `;
      const text =
`Hola ${name},

Recibimos tu pago y tu plan ${planName} está activo en ${brandName}.

Ve a tu CRM: ${dashboardUrl}

— ${brandName}`;
      return { subject, html: wrap(body, brandName, appUrl, contactEmail), text };
    }

    case "payment_failed": {
      const name = String(data.first_name || "amigo");
      const billingUrlOverride = String(data.billing_url || billingUrl);

      const subject = `⚠️ Tu pago no se procesó — ${brandName}`;
      const body = `
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">${name}, hay un problema con tu pago</h1>
        <p>Intentamos cobrar tu suscripción pero el pago no se procesó. Esto suele pasar cuando:</p>
        <ul style="padding-left:18px;">
          <li>Tu tarjeta expiró</li>
          <li>El banco rechazó el cargo (fondos / seguridad)</li>
          <li>Cambiaste de tarjeta y no la actualizaste</li>
        </ul>
        <p>Actualiza tu método de pago para mantener tu acceso al CRM:</p>
        ${ctaButton("Actualizar tarjeta", billingUrlOverride)}
        <p style="font-size:14px;color:#6b7280;">Si no se actualiza en los próximos días, tu workspace se pausará. Tus datos siguen a salvo, solo perderás acceso temporal.</p>
      `;
      const text =
`Hola ${name},

Tu pago en ${brandName} no se procesó. Actualiza tu tarjeta aquí: ${billingUrlOverride}

— ${brandName}`;
      return { subject, html: wrap(body, brandName, appUrl, contactEmail), text };
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@klosify.com";
    const EMAIL_FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") || "Klosify CRM";
    const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Klosify CRM";
    const APP_URL = (Deno.env.get("APP_URL") || "https://app.klosify.com").replace(/\/$/, "");
    const CONTACT_EMAIL = Deno.env.get("CONTACT_EMAIL") || "hola@klosify.com";

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body.to || !body.template || !body.data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, template, data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Idempotency check ───────────────────────────────────────────────────
    if (body.dedupe_key) {
      const { data: existing } = await supabase
        .from("email_log")
        .select("id, resend_message_id, sent_at")
        .eq("dedupe_key", body.dedupe_key)
        .maybeSingle();
      if (existing) {
        console.log(`Skipped duplicate send: dedupe_key=${body.dedupe_key}`);
        return new Response(
          JSON.stringify({ skipped: true, reason: "duplicate", existing }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Render the template ─────────────────────────────────────────────────
    const rendered = renderTemplate(body.template, body.data, {
      brandName: BRAND_NAME,
      appUrl: APP_URL,
      contactEmail: CONTACT_EMAIL,
    });

    // ── Send via Resend ─────────────────────────────────────────────────────
    const resendRes = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
        to: body.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: CONTACT_EMAIL,
        // Pass the dedupe key as a header so we can correlate Resend logs ↔ our DB
        headers: body.dedupe_key ? { "X-Dedupe-Key": body.dedupe_key } : undefined,
      }),
    });

    const resendBody = await resendRes.json().catch(() => null);

    if (!resendRes.ok) {
      console.error("Resend send failed:", resendRes.status, resendBody);
      // Log the failure so we can debug
      await supabase.from("email_log").insert({
        template: body.template,
        recipient: body.to,
        user_id: body.user_id ?? null,
        organization_id: body.organization_id ?? null,
        dedupe_key: body.dedupe_key ?? null,
        status: "failed",
        error_detail: JSON.stringify(resendBody).slice(0, 1000),
      });
      return new Response(
        JSON.stringify({ error: "Resend rejected the send", detail: resendBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Log success ─────────────────────────────────────────────────────────
    const resendId = resendBody?.id as string | undefined;
    await supabase.from("email_log").insert({
      template: body.template,
      recipient: body.to,
      user_id: body.user_id ?? null,
      organization_id: body.organization_id ?? null,
      dedupe_key: body.dedupe_key ?? null,
      status: "sent",
      resend_message_id: resendId ?? null,
    });

    return new Response(
      JSON.stringify({ sent: true, resend_message_id: resendId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-transactional-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

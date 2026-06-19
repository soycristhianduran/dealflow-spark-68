// Library of ready-made automation templates. Each is a pre-configured flow
// (trigger + steps) the user can instantiate with one click and then edit.
// They are starting points — texts use variables ({{contact.name}},
// {{cart.recovery_url}}, …) and WhatsApp steps need the user's approved template.

export interface TemplateStep {
  type:
    | "wait" | "send_email" | "send_whatsapp" | "add_tag" | "remove_tag"
    | "update_contact" | "condition" | "assign_owner" | "move_pipeline_stage"
    | "create_task" | "send_webhook" | "notify_owner" | "make_call" | "enroll_automation";
  config: Record<string, any>;
}

export interface AutomationTemplate {
  key: string;
  emoji: string;
  category: string;
  name: string;
  description: string;
  badges?: string[];           // e.g. ["Email", "WhatsApp"]
  note?: string;               // honest caveat shown on the card
  triggers: { type: string; config: Record<string, any> }[];
  steps: TemplateStep[];
}

const wait = (delay_value: number, delay_unit: "minutes" | "hours" | "days"): TemplateStep =>
  ({ type: "wait", config: { delay_value, delay_unit } });

const email = (subject: string, html_content: string): TemplateStep =>
  ({ type: "send_email", config: { subject, html_content, from_name: "", from_email: "" } });

const whatsapp = (): TemplateStep =>
  ({ type: "send_whatsapp", config: { template_name: "", language: "es", variables: [] } });

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ── Ecommerce ──────────────────────────────────────────────────────────────
  {
    key: "abandoned_cart",
    emoji: "🛒",
    category: "Ecommerce",
    name: "Recuperar carrito abandonado",
    description: "Lista para activar: 2 emails de recuperación con el link directo al carrito + un WhatsApp opcional. Cuando alguien abandona un carrito en Shopify, lo traes de vuelta automáticamente.",
    badges: ["Email", "WhatsApp", "Shopify"],
    note: "Solo activa: los emails funcionan al instante. El WhatsApp es opcional — se omite si no tienes una plantilla aprobada.",
    triggers: [{ type: "abandoned_cart", config: {} }],
    steps: [
      // Touch 1 — gentle reminder 1h after abandoning
      wait(1, "hours"),
      email(
        "¿Olvidaste algo? 🛒 Tu carrito te espera",
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="font-size:22px;margin:0 0 12px">Hola {{contact.name}} 👋</h2>
  <p style="font-size:15px;line-height:1.6;color:#475569">Vimos que dejaste algunos productos en tu carrito. ¡Todavía están disponibles y guardados para ti!</p>
  <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 8px">Total de tu carrito: <strong>{{cart.total}} {{cart.currency}}</strong> · {{cart.item_count}} artículo(s)</p>
  <p style="text-align:center;margin:28px 0">
    <a href="{{cart.recovery_url}}" style="background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px">Completar mi compra →</a>
  </p>
  <p style="font-size:13px;color:#94a3b8">Si ya completaste tu compra, ignora este mensaje 🙂</p>
</div>`,
      ),
      // Touch 2 — urgency 24h later (only if still not purchased)
      wait(23, "hours"),
      email(
        "⏳ Últimas horas para completar tu compra",
        `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="font-size:22px;margin:0 0 12px">{{contact.name}}, tu carrito sigue esperando ⏳</h2>
  <p style="font-size:15px;line-height:1.6;color:#475569">No queremos que te quedes sin lo que elegiste. Tu carrito está reservado por tiempo limitado.</p>
  <p style="text-align:center;margin:28px 0">
    <a href="{{cart.recovery_url}}" style="background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;display:inline-block;font-size:15px">Recuperar mi carrito →</a>
  </p>
  <p style="font-size:13px;color:#94a3b8">¿Dudas? Responde a este correo y te ayudamos.</p>
</div>`,
      ),
      // Touch 3 — optional WhatsApp nudge (skipped automatically if not configured)
      wait(24, "hours"),
      whatsapp(),
    ],
  },
  {
    key: "post_purchase",
    emoji: "🎁",
    category: "Ecommerce",
    name: "Post-compra: agradecer y pedir reseña",
    description: "Tras una compra, agradeces al cliente, pides una reseña y abres la puerta a una segunda venta.",
    badges: ["Email"],
    note: "Conéctala al evento o etiqueta que marque 'compra realizada' en tu flujo.",
    triggers: [{ type: "tag_added", config: { tag: "compra" } }],
    steps: [
      wait(2, "hours"),
      email(
        "¡Gracias por tu compra! 🙌",
        "<p>Hola {{contact.name}}, ¡gracias por confiar en nosotros!</p><p>Nos encantaría saber tu opinión. ¿Nos dejas una reseña?</p>",
      ),
      wait(7, "days"),
      email("Algo que quizás te encante ✨", "<p>Hola {{contact.name}}, pensamos en ti y queremos mostrarte algo especial…</p>"),
    ],
  },

  // ── Leads ────────────────────────────────────────────────────────────────
  {
    key: "meta_lead_instant",
    emoji: "🎯",
    category: "Leads",
    name: "Lead nuevo de Meta Ads → respuesta inmediata",
    description: "Cuando entra un lead de un formulario de Meta, le respondes al instante por WhatsApp y avisas al vendedor.",
    badges: ["WhatsApp", "Notificación"],
    note: "El paso de WhatsApp necesita una plantilla aprobada.",
    triggers: [{ type: "meta_lead_form", config: {} }],
    steps: [
      whatsapp(),
      { type: "notify_owner", config: { message: "🔥 Nuevo lead de Meta Ads: {{contact.name}} ({{contact.phone}})" } },
      wait(1, "days"),
      email("¿Hablamos? 👋", "<p>Hola {{contact.name}}, quedamos atentos para resolver tus dudas. ¿Cuándo te viene bien una llamada rápida?</p>"),
    ],
  },
  {
    key: "lead_nurture",
    emoji: "🌱",
    category: "Leads",
    name: "Seguimiento a lead sin respuesta",
    description: "Secuencia de seguimiento para que ningún lead se enfríe: recordatorios escalonados por email y WhatsApp.",
    badges: ["Email", "WhatsApp"],
    triggers: [{ type: "contact_created", config: { source: "any" } }],
    steps: [
      wait(1, "days"),
      email("¿Pudiste revisar la info? 📩", "<p>Hola {{contact.name}}, te escribo para saber si pudiste revisar lo que te enviamos. Quedo atento.</p>"),
      wait(2, "days"),
      whatsapp(),
      wait(3, "days"),
      email("Última llamada 🙂", "<p>Hola {{contact.name}}, no quiero insistir de más. Si te interesa, aquí estoy; si no, sin problema. ¡Un saludo!</p>"),
    ],
  },

  // ── Onboarding / Relación ──────────────────────────────────────────────────
  {
    key: "welcome",
    emoji: "👋",
    category: "Onboarding",
    name: "Bienvenida a nuevo contacto",
    description: "Da la bienvenida automáticamente a cada nuevo contacto y lo etiqueta para segmentarlo.",
    badges: ["Email"],
    triggers: [{ type: "contact_created", config: { source: "any" } }],
    steps: [
      email("¡Bienvenido/a! 🎉", "<p>Hola {{contact.name}}, ¡gracias por estar aquí! En breve te contamos cómo podemos ayudarte.</p>"),
      { type: "add_tag", config: { tag: "nuevo" } },
    ],
  },
  {
    key: "birthday",
    emoji: "🎂",
    category: "Relación",
    name: "Cumpleaños / renovación",
    description: "Sorprende a tus contactos en su fecha especial con un mensaje (y un detalle) automático.",
    badges: ["Email", "WhatsApp"],
    note: "Usa la fecha del contacto (cumpleaños / renovación). El WhatsApp necesita plantilla aprobada.",
    triggers: [{ type: "contact_date", config: {} }],
    steps: [
      email("¡Feliz día, {{contact.name}}! 🎉", "<p>Queremos desearte un día increíble. ¡Gracias por estar con nosotros! 🎂</p>"),
      whatsapp(),
    ],
  },

  // ── Retención ──────────────────────────────────────────────────────────────
  {
    key: "winback",
    emoji: "❄️",
    category: "Retención",
    name: "Reactivar leads fríos",
    description: "Vuelve a enganchar a contactos sin actividad reciente con una oferta o novedad.",
    badges: ["Email"],
    note: "Combínala con un trigger programado para correrla periódicamente sobre tu lista.",
    triggers: [{ type: "scheduled", config: {} }],
    steps: [
      email("Te extrañamos 💙", "<p>Hola {{contact.name}}, hace un tiempo que no hablamos. Tenemos novedades que pueden interesarte…</p>"),
      wait(3, "days"),
      email("Una razón para volver 🎁", "<p>Hola {{contact.name}}, preparamos algo especial para ti. ¿Le echamos un vistazo juntos?</p>"),
    ],
  },
];

export const TEMPLATE_CATEGORIES = ["Ecommerce", "Leads", "Onboarding", "Relación", "Retención"];

/** Build a fresh (unsaved, no-id) automation object from a template. */
export function templateToAutomation(t: AutomationTemplate) {
  const genId = () => Math.random().toString(36).slice(2, 10);
  return {
    name: t.name,
    description: t.description,
    is_active: false,
    trigger_type: t.triggers[0]?.type ?? "manual",
    trigger_config: t.triggers[0]?.config ?? {},
    triggers: t.triggers.map((tr) => ({ type: tr.type, config: { ...tr.config } })),
    steps: t.steps.map((s) => ({ id: genId(), type: s.type, config: { ...s.config } })),
  };
}

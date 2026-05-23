/**
 * Pre-built Unlayer starter templates for the email builder.
 * Each design is a valid Unlayer loadDesign() JSON object.
 */

let _counter = 1;
const uid = () => `u${(_counter++).toString(36)}`;

function makeText(html: string, opts: {
  padding?: string; align?: string; fontSize?: string;
  color?: string; lineHeight?: string;
} = {}) {
  return {
    id: uid(), type: "text",
    values: {
      containerPadding: opts.padding ?? "12px 32px",
      fontSize: opts.fontSize ?? "15px",
      textAlign: opts.align ?? "left",
      lineHeight: opts.lineHeight ?? "160%",
      color: opts.color,
      linkStyle: { inherit: true, linkColor: "#FF6B35", linkHoverColor: "#FF6B35", linkUnderline: true, linkHoverUnderline: true },
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_text" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: html,
    },
  };
}

function makeButton(label: string, bg = "#FF6B35", url = "#") {
  return {
    id: uid(), type: "button",
    values: {
      containerPadding: "8px 32px 24px",
      anchor: "",
      href: { name: "web", values: { href: url, target: "_blank" } },
      buttonColors: { color: "#FFFFFF", backgroundColor: bg, hoverColor: "#FFFFFF", hoverBackgroundColor: bg },
      size: { autoWidth: true },
      fontWeight: 700,
      fontSize: "15px",
      textAlign: "center",
      lineHeight: "120%",
      padding: "14px 32px",
      border: {},
      borderRadius: "8px",
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_button" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: `<span style="word-break:break-word">${label}</span>`,
      calculatedWidth: 200, calculatedHeight: 44,
    },
  };
}

function makeDivider(color = "#e8e8e8", padding = "8px 32px") {
  return {
    id: uid(), type: "divider",
    values: {
      containerPadding: padding, anchor: "",
      width: "100%",
      border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: color },
      textAlign: "center",
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_divider" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

function makeRow(contents: object[], bg = "#FFFFFF", padding = "0px") {
  return {
    id: uid(),
    cells: [1],
    columns: [{ id: uid(), contents, values: { backgroundColor: "", padding: "0px", border: {}, _meta: { htmlClassNames: "u_column" } } }],
    values: {
      displayCondition: null, columns: false,
      backgroundColor: bg, columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center", customPosition: ["50%", "50%"] },
      padding, anchor: "", hideDesktop: false,
      _meta: { htmlClassNames: "u_row" },
    },
  };
}

function makeDesign(rows: object[]) {
  return {
    counters: { u_column: 20, u_row: 20, u_content_text: 30, u_content_button: 10, u_content_divider: 10, u_content_image: 10 },
    body: {
      id: uid(),
      rows,
      headers: [], footers: [],
      values: {
        popupPosition: "center", popupWidth: "600px", popupHeight: "auto",
        borderRadius: "10px", contentAlign: "center", contentVerticalAlign: "center",
        contentWidth: 600,
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        textColor: "#333333",
        popupBackgroundColor: "#FFFFFF",
        popupBackgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        popupOverlay_backgroundColor: "rgba(0,0,0,0.1)",
        popupCloseButton_margin: "0px", popupCloseButton_position: "top-right",
        popupCloseButton_backgroundColor: "#DDDDDD", popupCloseButton_iconColor: "#000000",
        popupCloseButton_borderRadius: "0px", popupCloseButton_size: "32px",
        preheaderText: "",
        linkStyle: { body: true, linkColor: "#FF6B35", linkHoverColor: "#FF6B35", linkUnderline: true, linkHoverUnderline: true },
        backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        backgroundColor: "#F0F0F0",
        _meta: { htmlClassNames: "u_body" },
      },
    },
  };
}

// ─── Template 1: Bienvenida ───────────────────────────────────────────────────
const bienvenida = makeDesign([
  // Header naranja
  makeRow([
    makeText(
      `<p style="font-size:26px;font-weight:700;color:#ffffff;margin:0;text-align:center">¡Bienvenido/a, {{nombre}}! 🎉</p>`,
      { padding: "36px 32px 28px", align: "center" }
    ),
  ], "#FF6B35"),
  // Subtítulo
  makeRow([
    makeText(
      `<p style="font-size:15px;color:#555555;text-align:center;margin:0">Nos alegra tenerte aquí. Estamos listos para ayudarte a alcanzar tus metas.</p>`,
      { padding: "28px 40px 8px", align: "center" }
    ),
  ]),
  makeDivider(),
  // Beneficios
  makeRow([
    makeText(
      `<p style="font-size:16px;font-weight:700;color:#222222;margin:0 0 12px">¿Qué puedes esperar?</p>
<p style="margin:6px 0;color:#555">✅ &nbsp;Atención personalizada y rápida</p>
<p style="margin:6px 0;color:#555">✅ &nbsp;Acceso a nuestros mejores servicios</p>
<p style="margin:6px 0;color:#555">✅ &nbsp;Seguimiento continuo de tu caso</p>`,
      { padding: "16px 40px" }
    ),
  ]),
  // CTA
  makeRow([
    makeButton("Empezar ahora →", "#FF6B35"),
  ]),
  makeDivider(),
  // Footer
  makeRow([
    makeText(
      `<p style="font-size:12px;color:#999999;text-align:center;margin:0">Recibiste este mensaje porque te registraste en nuestra plataforma.<br>Si tienes preguntas, responde a este correo.</p>`,
      { padding: "16px 32px 28px", align: "center" }
    ),
  ], "#FAFAFA"),
]);

// ─── Template 2: Seguimiento post-reunión ────────────────────────────────────
const seguimiento = makeDesign([
  // Header azul
  makeRow([
    makeText(
      `<p style="font-size:22px;font-weight:700;color:#ffffff;margin:0">📋 Resumen de nuestra reunión</p>`,
      { padding: "32px 32px 24px", align: "left" }
    ),
  ], "#1E40AF"),
  // Saludo
  makeRow([
    makeText(
      `<p style="color:#333;margin:0">Hola <strong>{{nombre}}</strong>,</p>
<br>
<p style="color:#555;margin:0">Fue un placer hablar contigo hoy. Tal como lo conversamos, te comparto un resumen de los puntos clave y los próximos pasos.</p>`,
      { padding: "28px 36px 8px" }
    ),
  ]),
  makeDivider(),
  // Resumen
  makeRow([
    makeText(
      `<p style="font-size:15px;font-weight:700;color:#1E40AF;margin:0 0 10px">📌 Puntos tratados</p>
<p style="color:#555;margin:4px 0">• Tu situación actual y objetivos principales</p>
<p style="color:#555;margin:4px 0">• Las soluciones que mejor se adaptan a tu caso</p>
<p style="color:#555;margin:4px 0">• Inversión y plazos estimados</p>`,
      { padding: "16px 36px" }
    ),
  ]),
  makeDivider(),
  // Próximos pasos
  makeRow([
    makeText(
      `<p style="font-size:15px;font-weight:700;color:#1E40AF;margin:0 0 10px">🚀 Próximos pasos</p>
<p style="color:#555;margin:4px 0">1. Revisas la propuesta adjunta</p>
<p style="color:#555;margin:4px 0">2. Me confirmas si tienes preguntas</p>
<p style="color:#555;margin:4px 0">3. Agendamos la llamada de cierre</p>`,
      { padding: "16px 36px" }
    ),
  ]),
  // CTA
  makeRow([
    makeButton("Agendar siguiente llamada", "#1E40AF"),
  ]),
  makeDivider(),
  makeRow([
    makeText(
      `<p style="font-size:12px;color:#999;text-align:center;margin:0">Cualquier duda estoy a tu disposición. Solo responde este correo.</p>`,
      { padding: "16px 32px 28px", align: "center" }
    ),
  ], "#FAFAFA"),
]);

// ─── Template 3: Oferta especial ─────────────────────────────────────────────
const oferta = makeDesign([
  // Header llamativo
  makeRow([
    makeText(
      `<p style="font-size:13px;color:#ffffff;text-align:center;letter-spacing:3px;margin:0">OFERTA EXCLUSIVA</p>
<p style="font-size:36px;font-weight:900;color:#ffffff;text-align:center;margin:8px 0 0">¡Solo por hoy!</p>`,
      { padding: "36px 32px 32px", align: "center" }
    ),
  ], "#DC2626"),
  // Oferta principal
  makeRow([
    makeText(
      `<p style="font-size:18px;font-weight:700;color:#222;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, tenemos algo especial para ti</p>`,
      { padding: "28px 40px 8px", align: "center" }
    ),
    makeText(
      `<p style="font-size:15px;color:#555;text-align:center;margin:0">Hemos preparado una propuesta única pensada especialmente para <strong>{{empresa}}</strong>. Esta oportunidad es válida solo por tiempo limitado.</p>`,
      { padding: "8px 44px 16px", align: "center" }
    ),
  ]),
  // Precio / descuento destacado
  makeRow([
    makeText(
      `<p style="font-size:40px;font-weight:900;color:#DC2626;text-align:center;margin:0">30% OFF</p>
<p style="font-size:14px;color:#888;text-align:center;margin:4px 0 0">en tu primer mes de servicio</p>`,
      { padding: "20px 32px", align: "center" }
    ),
  ], "#FEF2F2"),
  // CTA
  makeRow([
    makeButton("Quiero aprovechar esta oferta", "#DC2626"),
  ]),
  makeDivider(),
  makeRow([
    makeText(
      `<p style="font-size:12px;color:#aaa;text-align:center;margin:0">⏰ &nbsp;Oferta válida hasta agotar cupos &nbsp;|&nbsp; Aplican términos y condiciones</p>`,
      { padding: "16px 32px 28px", align: "center" }
    ),
  ], "#FAFAFA"),
]);

// ─── Template 4: Newsletter mensual ──────────────────────────────────────────
const newsletter = makeDesign([
  // Header
  makeRow([
    makeText(
      `<p style="font-size:12px;color:#ffffff;text-align:center;letter-spacing:2px;margin:0">NEWSLETTER MENSUAL</p>
<p style="font-size:26px;font-weight:800;color:#ffffff;text-align:center;margin:6px 0 0">Novedades para {{nombre}}</p>`,
      { padding: "32px 32px 28px", align: "center" }
    ),
  ], "#0F172A"),
  // Intro
  makeRow([
    makeText(
      `<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, aquí tienes las novedades y recursos más relevantes de este mes. Esperamos que te sean de utilidad.</p>`,
      { padding: "24px 36px 8px" }
    ),
  ]),
  makeDivider(),
  // Artículo 1
  makeRow([
    makeText(
      `<p style="font-size:11px;font-weight:700;color:#FF6B35;letter-spacing:2px;margin:0">DESTACADO</p>
<p style="font-size:18px;font-weight:700;color:#111;margin:8px 0 6px">Título del artículo o noticia principal</p>
<p style="color:#666;margin:0;font-size:14px">Descripción breve del contenido más importante del mes. Explica el valor que tiene para tu lector en 2-3 oraciones.</p>`,
      { padding: "16px 36px" }
    ),
    makeButton("Leer más →", "#0F172A"),
  ]),
  makeDivider(),
  // Artículo 2
  makeRow([
    makeText(
      `<p style="font-size:11px;font-weight:700;color:#6366F1;letter-spacing:2px;margin:0">CONSEJO DEL MES</p>
<p style="font-size:16px;font-weight:700;color:#111;margin:8px 0 6px">Un tip que puede transformar tu proceso de ventas</p>
<p style="color:#666;margin:0;font-size:14px">Breve descripción del consejo o recurso. Mantén esto conciso y accionable para que tu lector pueda aplicarlo de inmediato.</p>`,
      { padding: "16px 36px" }
    ),
  ]),
  makeDivider(),
  // CTA final
  makeRow([
    makeText(
      `<p style="font-size:16px;font-weight:700;color:#111;text-align:center;margin:0">¿Listo para el siguiente paso?</p>
<p style="color:#666;text-align:center;margin:8px 0 0;font-size:14px">Agenda una sesión gratuita y te ayudamos personalmente.</p>`,
      { padding: "20px 40px 4px", align: "center" }
    ),
    makeButton("Agendar sesión gratuita", "#FF6B35"),
  ]),
  makeDivider(),
  makeRow([
    makeText(
      `<p style="font-size:12px;color:#999;text-align:center;margin:0">Recibiste este email porque eres parte de nuestra comunidad.<br>Si no deseas recibirlo más, <a href="#" style="color:#999">cancela tu suscripción aquí</a>.</p>`,
      { padding: "16px 32px 28px", align: "center" }
    ),
  ], "#FAFAFA"),
]);

// ─── Exports ──────────────────────────────────────────────────────────────────
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  emoji: string;
  color: string;
  design: object;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "bienvenida",
    name: "Bienvenida",
    description: "Email de bienvenida para nuevos clientes o leads",
    subject: "¡Bienvenido/a, {{nombre}}! 🎉",
    emoji: "👋",
    color: "#FF6B35",
    design: bienvenida,
  },
  {
    id: "seguimiento",
    name: "Seguimiento de reunión",
    description: "Resumen post-reunión con próximos pasos",
    subject: "Resumen de nuestra reunión, {{nombre}}",
    emoji: "📋",
    color: "#1E40AF",
    design: seguimiento,
  },
  {
    id: "oferta",
    name: "Oferta especial",
    description: "Promoción o descuento por tiempo limitado",
    subject: "Oferta exclusiva para ti, {{nombre}} 🔥",
    emoji: "🔥",
    color: "#DC2626",
    design: oferta,
  },
  {
    id: "newsletter",
    name: "Newsletter mensual",
    description: "Boletín con novedades, artículos y CTA",
    subject: "Novedades de este mes para {{nombre}}",
    emoji: "📰",
    color: "#0F172A",
    design: newsletter,
  },
];

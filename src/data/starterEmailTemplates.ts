/**
 * Starter email templates for the drag-and-drop builder.
 * 4 categories × 7 templates = 28 professional designs.
 */

let _c = 1;
const uid = () => `u${(_c++).toString(36)}`;

// ─── Low-level content helpers ────────────────────────────────────────────────

function txt(html: string, p = "12px 32px", align = "left") {
  return {
    id: uid(), type: "text",
    values: {
      containerPadding: p, textAlign: align,
      fontSize: "15px", lineHeight: "160%",
      linkStyle: { inherit: true, linkColor: "#FF6B35", linkHoverColor: "#FF6B35", linkUnderline: true, linkHoverUnderline: true },
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_text" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: html,
    },
  };
}

function btn(label: string, bg = "#FF6B35", p = "8px 32px 24px") {
  return {
    id: uid(), type: "button",
    values: {
      containerPadding: p, anchor: "",
      href: { name: "web", values: { href: "#", target: "_blank" } },
      buttonColors: { color: "#FFFFFF", backgroundColor: bg, hoverColor: "#FFFFFF", hoverBackgroundColor: bg },
      size: { autoWidth: true }, fontWeight: 700, fontSize: "15px",
      textAlign: "center", lineHeight: "120%", padding: "14px 32px",
      border: {}, borderRadius: "8px",
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_button" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: `<span style="word-break:break-word">${label}</span>`,
      calculatedWidth: 200, calculatedHeight: 44,
    },
  };
}

function div(color = "#e8e8e8") {
  return {
    id: uid(), type: "divider",
    values: {
      containerPadding: "6px 32px", anchor: "", width: "100%",
      border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: color },
      textAlign: "center", hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_divider" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

function row(contents: object[], bg = "#FFFFFF", pad = "0px") {
  return {
    id: uid(), cells: [1],
    columns: [{ id: uid(), contents, values: { backgroundColor: "", padding: "0px", border: {}, _meta: { htmlClassNames: "u_column" } } }],
    values: {
      displayCondition: null, columns: false, backgroundColor: bg, columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center", customPosition: ["50%", "50%"] },
      padding: pad, anchor: "", hideDesktop: false, _meta: { htmlClassNames: "u_row" },
    },
  };
}

const divRow = (color = "#e8e8e8") => row([div(color)]);

function design(rows: object[], bodyBg = "#F0F0F0") {
  return {
    counters: { u_column: 30, u_row: 30, u_content_text: 50, u_content_button: 15, u_content_divider: 15 },
    body: {
      id: uid(), rows, headers: [], footers: [],
      values: {
        popupPosition: "center", popupWidth: "600px", popupHeight: "auto",
        borderRadius: "10px", contentAlign: "center", contentVerticalAlign: "center",
        contentWidth: 600,
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        textColor: "#333333", popupBackgroundColor: "#FFFFFF",
        popupBackgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        popupOverlay_backgroundColor: "rgba(0,0,0,0.1)",
        popupCloseButton_margin: "0px", popupCloseButton_position: "top-right",
        popupCloseButton_backgroundColor: "#DDDDDD", popupCloseButton_iconColor: "#000000",
        popupCloseButton_borderRadius: "0px", popupCloseButton_size: "32px",
        preheaderText: "",
        linkStyle: { body: true, linkColor: "#FF6B35", linkHoverColor: "#FF6B35", linkUnderline: true, linkHoverUnderline: true },
        backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        backgroundColor: bodyBg,
        _meta: { htmlClassNames: "u_body" },
      },
    },
  };
}

// ─── Header helpers ───────────────────────────────────────────────────────────
const h = (headline: string, sub: string, bg: string) => row([
  txt(`<p style="font-size:26px;font-weight:800;color:#fff;margin:0;text-align:center">${headline}</p>${sub ? `<p style="font-size:14px;color:rgba(255,255,255,0.85);text-align:center;margin:8px 0 0">${sub}</p>` : ""}`, "36px 32px 28px", "center"),
], bg);

const hDark = (headline: string, sub: string) => h(headline, sub, "#0F172A");
const hOrange = (headline: string, sub: string) => h(headline, sub, "#FF6B35");
const hBlue = (headline: string, sub: string) => h(headline, sub, "#1E40AF");
const hRed = (headline: string, sub: string) => h(headline, sub, "#DC2626");
const hGreen = (headline: string, sub: string) => h(headline, sub, "#16A34A");
const hPurple = (headline: string, sub: string) => h(headline, sub, "#7C3AED");
const hTeal = (headline: string, sub: string) => h(headline, sub, "#0D9488");
const hAmber = (headline: string, sub: string) => h(headline, sub, "#D97706");
const hSlate = (headline: string, sub: string) => h(headline, sub, "#475569");
const hIndigo = (headline: string, sub: string) => h(headline, sub, "#4338CA");

const footer = (msg = "Recibiste este email porque eres parte de nuestra comunidad.") =>
  row([txt(`<p style="font-size:12px;color:#999;text-align:center;margin:0">${msg}</p>`, "16px 32px 24px", "center")], "#FAFAFA");

// ─── ═══════════════════════════════════════════════════════════════════════ ───
// ─── CATEGORÍA: Bienvenida ────────────────────────────────────────────────────
// ─── ═══════════════════════════════════════════════════════════════════════ ───

const W1 = design([
  hOrange("¡Bienvenido/a, {{nombre}}! 🎉", "Nos alegra tenerte aquí"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, a partir de hoy somos tu equipo. Estamos aquí para ayudarte a lograr resultados reales.</p>`, "24px 44px 8px", "center")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#222;margin:0 0 12px">¿Qué puedes esperar?</p>
<p style="margin:5px 0;color:#555">✅&nbsp; Atención personalizada y rápida</p>
<p style="margin:5px 0;color:#555">✅&nbsp; Acceso a nuestros mejores recursos</p>
<p style="margin:5px 0;color:#555">✅&nbsp; Seguimiento continuo de tu caso</p>`, "16px 40px")]),
  row([btn("Empezar ahora →", "#FF6B35")]),
  divRow(), footer(),
]);

const W2 = design([
  hBlue("Bienvenido/a al equipo, {{nombre}}", "Tu socio estratégico ya está listo"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>,</p><br><p style="color:#555;margin:0">Es un placer darte la bienvenida a <strong>{{empresa}}</strong>. A partir de hoy trabajaremos juntos para hacer crecer tu negocio de forma sostenible.</p>`, "28px 40px 8px")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#1E40AF;margin:0 0 10px">Tu plan de inicio</p>
<p style="margin:7px 0;color:#555">📞&nbsp; <strong>Paso 1:</strong> Llamada de onboarding (30 min)</p>
<p style="margin:7px 0;color:#555">📋&nbsp; <strong>Paso 2:</strong> Diagnóstico de tu situación</p>
<p style="margin:7px 0;color:#555">🚀&nbsp; <strong>Paso 3:</strong> Inicio del plan personalizado</p>`, "16px 40px")]),
  row([btn("Agendar mi onboarding", "#1E40AF")]),
  divRow(), footer(),
], "#EFF6FF");

const W3 = design([
  hDark("Acceso exclusivo activado ✦", "Bienvenido/a a la experiencia premium"),
  row([txt(`<p style="font-size:16px;color:#444;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, tu membresía VIP ya está activa. Prepárate para una experiencia completamente diferente.</p>`, "28px 44px 8px", "center")]),
  row([txt(`<p style="font-size:32px;font-weight:900;color:#0F172A;text-align:center;margin:0">✦ PREMIUM ✦</p>`, "12px 32px", "center")], "#F8FAFC"),
  divRow("#cbd5e1"),
  row([
    txt(`<p style="color:#444;margin:6px 0">🎯&nbsp; Acceso prioritario a nuestro equipo</p>
<p style="color:#444;margin:6px 0">💎&nbsp; Informes y análisis exclusivos</p>
<p style="color:#444;margin:6px 0">🔒&nbsp; Soporte dedicado 24/7</p>
<p style="color:#444;margin:6px 0">🚀&nbsp; Estrategia personalizada trimestral</p>`, "16px 44px"),
  ]),
  row([btn("Activar mis beneficios", "#0F172A")]),
  divRow("#cbd5e1"), footer(),
], "#F1F5F9");

const W4 = design([
  hGreen("¡Lo lograste, {{nombre}}! 🌱", "Tu decisión fue el primer gran paso"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Felicidades por dar este paso. Muchas personas piensan en mejorar su negocio — tú lo hiciste. Eso ya te diferencia.</p>`, "24px 44px 8px", "center")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="font-weight:700;color:#16A34A;margin:0 0 12px">Lo que viene ahora</p>
<p style="margin:6px 0;color:#555">🌱&nbsp; Conocemos tu negocio a fondo</p>
<p style="margin:6px 0;color:#555">📈&nbsp; Diseñamos tu hoja de ruta</p>
<p style="margin:6px 0;color:#555">💪&nbsp; Ejecutamos juntos, semana a semana</p>`, "16px 40px")]),
  row([btn("Ver mi hoja de ruta", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

const W5 = design([
  row([txt(`<p style="font-size:13px;color:#FF6B35;font-weight:700;letter-spacing:2px;text-align:center;margin:0">BIENVENIDA</p>
<p style="font-size:30px;font-weight:800;color:#111;text-align:center;margin:8px 0 0">Hola, {{nombre}} 👋</p>`, "40px 32px 16px", "center")]),
  divRow(),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Gracias por confiar en nosotros. Aquí encontrarás todo lo que necesitas para arrancar con el pie derecho.</p>`, "12px 44px 20px", "center")]),
  row([btn("Ir a mi cuenta", "#111111")]),
  divRow(), footer(),
], "#FFFFFF");

const W6 = design([
  hPurple("¡Hola {{nombre}}, ya eres parte! 🎊", "Tu experiencia empieza ahora"),
  row([txt(`<p style="color:#555;margin:0 0 16px">Bienvenido/a, <strong>{{nombre}}</strong>. Estos son tus próximos pasos para sacar el máximo partido desde el día uno:</p>`, "28px 40px 4px")]),
  row([txt(`<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 10px"><strong style="color:#7C3AED">Paso 1</strong> — Completa tu perfil para personalizar tu experiencia</div>
<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 10px"><strong style="color:#7C3AED">Paso 2</strong> — Revisa los recursos en tu panel</div>
<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:12px 16px;border-radius:0 8px 8px 0"><strong style="color:#7C3AED">Paso 3</strong> — Agenda tu primera sesión con nosotros</div>`, "12px 36px")]),
  row([btn("Ir a mi panel", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

const W7 = design([
  hTeal("Cuenta creada con éxito ✓", "{{nombre}}, ya tienes acceso completo"),
  row([txt(`<p style="font-size:18px;color:#333;text-align:center;font-weight:700;margin:0">Nos alegra tenerte en nuestra comunidad</p>`, "24px 40px 4px", "center")]),
  row([txt(`<p style="color:#555;text-align:center;margin:0">En menos de 5 minutos podrás tener tu primera campaña lista. ¿Empezamos?</p>`, "8px 44px 20px", "center")]),
  divRow("#99f6e4"),
  row([
    txt(`<p style="text-align:center;color:#444;margin:4px 0">📧&nbsp; Email de contacto: <strong>{{email}}</strong></p>
<p style="text-align:center;color:#444;margin:4px 0">🏢&nbsp; Empresa: <strong>{{empresa}}</strong></p>`, "12px 40px 20px", "center"),
  ]),
  row([btn("Explorar la plataforma", "#0D9488")]),
  divRow("#99f6e4"), footer(),
], "#F0FDFA");

// ─── ═══════════════════════════════════════════════════════════════════════ ───
// ─── CATEGORÍA: Ventas y Promociones ─────────────────────────────────────────
// ─── ═══════════════════════════════════════════════════════════════════════ ───

const S1 = design([
  hRed("⚡ OFERTA FLASH — 24 horas", "Solo para clientes especiales como tú"),
  row([txt(`<p style="font-size:48px;font-weight:900;color:#DC2626;text-align:center;margin:0">40% OFF</p>
<p style="font-size:14px;color:#888;text-align:center;margin:4px 0 0">descuento exclusivo por tiempo limitado</p>`, "20px 32px", "center")], "#FEF2F2"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, esta oferta es solo para ti. Disponible <strong>hasta hoy a las 23:59</strong>. No la dejes pasar.</p>`, "20px 44px 8px", "center")]),
  row([btn("⚡ Aprovechar ahora", "#DC2626")]),
  divRow("#fecaca"),
  row([txt(`<p style="font-size:12px;color:#aaa;text-align:center">⏰ Quedan pocas horas | Aplican condiciones</p>`, "12px 32px 20px", "center")], "#FAFAFA"),
]);

const S2 = design([
  row([txt(`<p style="font-size:11px;color:#fff;font-weight:700;letter-spacing:3px;text-align:center;margin:0;background:#111;padding:8px">BLACK FRIDAY</p>
<p style="font-size:44px;font-weight:900;color:#fff;text-align:center;margin:0;background:#111">50% OFF</p>
<p style="font-size:14px;color:rgba(255,255,255,0.7);text-align:center;margin:0;background:#111;padding:0 0 20px">La oferta más grande del año</p>`, "0px", "center")], "#111111"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, preparamos esta oferta especial pensando en ti. Es la oportunidad perfecta para dar el siguiente paso.</p>`, "24px 44px 8px", "center")]),
  row([
    txt(`<p style="text-align:center;color:#555;margin:6px 0">✓ Precio especial garantizado</p>
<p style="text-align:center;color:#555;margin:6px 0">✓ Sin costos ocultos</p>
<p style="text-align:center;color:#555;margin:6px 0">✓ Acceso inmediato</p>`, "12px 40px 16px", "center"),
  ]),
  row([btn("Quiero este precio", "#111111")]),
  divRow(), footer(),
]);

const S3 = design([
  hPurple("🚀 Nuevo: {{empresa}} ya disponible", "Más potente. Más rápido. Más simple."),
  row([txt(`<p style="font-size:18px;font-weight:700;color:#222;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, lo esperabas</p>`, "24px 40px 8px", "center")]),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Llevamos meses preparando esto. Hoy por fin está listo y queremos que seas de los primeros en probarlo.</p>`, "8px 44px 16px", "center")]),
  divRow("#ede9fe"),
  row([
    txt(`<p style="margin:6px 0;color:#555">🆕&nbsp; Función 1 — Descripción rápida de la novedad</p>
<p style="margin:6px 0;color:#555">🆕&nbsp; Función 2 — Otra mejora importante destacada</p>
<p style="margin:6px 0;color:#555">🆕&nbsp; Función 3 — El cambio que más pedían</p>`, "16px 40px"),
  ]),
  row([btn("Explorar el lanzamiento", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

const S4 = design([
  hGreen("Tu inversión, multiplicada 📈", "No vendemos servicios. Vendemos resultados."),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, antes de hablar de precio, hablemos de valor. Lo que ofrecemos no es un gasto — es una inversión con retorno.</p>`, "24px 44px 8px", "center")]),
  divRow("#bbf7d0"),
  row([
    txt(`<div style="text-align:center;margin-bottom:16px">
<p style="font-size:36px;font-weight:900;color:#16A34A;margin:0">3x</p>
<p style="font-size:13px;color:#666;margin:4px 0 0">retorno promedio de nuestros clientes</p>
</div>
<div style="text-align:center">
<p style="font-size:36px;font-weight:900;color:#16A34A;margin:0">+60%</p>
<p style="font-size:13px;color:#666;margin:4px 0 0">crecimiento en los primeros 90 días</p>
</div>`, "16px 60px 24px", "center"),
  ]),
  row([btn("Ver cómo funciona →", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

const S5 = design([
  hAmber("🎁 Tu cupón exclusivo te espera", "Solo disponible para {{nombre}}"),
  row([
    txt(`<div style="border:3px dashed #D97706;border-radius:12px;padding:20px;text-align:center;background:#FFFBEB;margin:0">
<p style="font-size:13px;color:#92400E;letter-spacing:2px;font-weight:700;margin:0">CÓDIGO DE DESCUENTO</p>
<p style="font-size:36px;font-weight:900;color:#D97706;font-family:monospace;margin:8px 0">NOMBRE20</p>
<p style="font-size:13px;color:#666;margin:0">20% de descuento en tu próxima compra</p>
</div>`, "24px 36px 16px"),
  ]),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Este cupón es exclusivo para ti y <strong>vence en 7 días</strong>. Úsalo antes de que expire.</p>`, "12px 44px 8px", "center")]),
  row([btn("Usar mi cupón ahora", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

const S6 = design([
  hIndigo("Últimos días del trimestre 🗓️", "El momento de decidir es ahora, {{nombre}}"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">El trimestre termina pronto y quedan <strong>pocos cupos disponibles</strong>. Si llevas tiempo pensándolo, este es el momento.</p>`, "24px 44px 12px", "center")]),
  row([txt(`<p style="font-size:28px;font-weight:900;color:#4338CA;text-align:center;margin:0">Solo 3 cupos disponibles</p>
<p style="font-size:14px;color:#888;text-align:center;margin:4px 0 0">para nuevos clientes este mes</p>`, "12px 40px 20px", "center")], "#EEF2FF"),
  divRow("#c7d2fe"),
  row([txt(`<p style="color:#555;margin:6px 0">✓&nbsp; Precio actual garantizado al cerrar hoy</p>
<p style="color:#555;margin:6px 0">✓&nbsp; Inicio inmediato sin burocracia</p>
<p style="color:#555;margin:6px 0">✓&nbsp; Garantía de satisfacción 30 días</p>`, "12px 40px 16px")]),
  row([btn("Reservar mi cupo", "#4338CA")]),
  divRow("#c7d2fe"), footer(),
], "#EEF2FF");

const S7 = design([
  hSlate("Una propuesta pensada para ti", "{{nombre}}, esto es lo que podemos lograr juntos"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, tomé el tiempo de preparar algo específico para <strong>{{empresa}}</strong>. No es una oferta genérica — es una propuesta diseñada para tu situación.</p>`, "28px 40px 8px")]),
  divRow(),
  row([
    txt(`<p style="font-weight:700;color:#333;margin:0 0 12px">¿Qué incluye?</p>
<p style="color:#555;margin:6px 0">📌&nbsp; Diagnóstico completo de tu situación actual</p>
<p style="color:#555;margin:6px 0">🎯&nbsp; Estrategia personalizada para tus objetivos</p>
<p style="color:#555;margin:6px 0">📈&nbsp; Plan de acción con resultados medibles</p>
<p style="color:#555;margin:6px 0">🤝&nbsp; Acompañamiento semanal de nuestro equipo</p>`, "16px 40px"),
  ]),
  row([btn("Ver la propuesta completa", "#475569")]),
  divRow(), footer(),
]);

// ─── ═══════════════════════════════════════════════════════════════════════ ───
// ─── CATEGORÍA: Seguimiento ───────────────────────────────────────────────────
// ─── ═══════════════════════════════════════════════════════════════════════ ───

const F1 = design([
  hBlue("📋 Resumen de nuestra reunión", "Todo lo que conversamos, en un solo lugar"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, fue un placer hablar contigo. Aquí tienes el resumen de lo que discutimos.</p>`, "24px 40px 8px")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#1E40AF;margin:0 0 10px">📌 Puntos tratados</p>
<p style="color:#555;margin:5px 0">• Tu situación actual y objetivos</p>
<p style="color:#555;margin:5px 0">• Las soluciones más adecuadas para tu caso</p>
<p style="color:#555;margin:5px 0">• Inversión y plazos estimados</p>`, "16px 40px")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#1E40AF;margin:0 0 10px">🚀 Próximos pasos</p>
<p style="color:#555;margin:5px 0">1. Revisas la propuesta que te envío adjunta</p>
<p style="color:#555;margin:5px 0">2. Me confirmas si tienes dudas</p>
<p style="color:#555;margin:5px 0">3. Agendamos la llamada de cierre</p>`, "16px 40px")]),
  row([btn("Agendar siguiente llamada", "#1E40AF")]),
  divRow(), footer(),
], "#EFF6FF");

const F2 = design([
  hTeal("Tu propuesta está lista 📄", "{{nombre}}, la preparé especialmente para ti"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, tal como te comenté, aquí tienes la propuesta personalizada para <strong>{{empresa}}</strong>. La revisé dos veces para asegurarme de que refleja exactamente lo que necesitas.</p>`, "24px 40px 8px")]),
  divRow("#99f6e4"),
  row([txt(`<p style="font-weight:700;color:#0D9488;margin:0 0 10px">La propuesta incluye:</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Diagnóstico y análisis de tu situación</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Solución recomendada con justificación</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Desglose de inversión y ROI proyectado</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Cronograma de implementación</p>`, "16px 40px")]),
  row([btn("Ver propuesta completa", "#0D9488")]),
  row([txt(`<p style="font-size:13px;color:#777;text-align:center;margin:0">Tengo disponibilidad esta semana para resolver tus dudas. Solo responde este email.</p>`, "8px 40px 20px", "center")]),
  divRow("#99f6e4"), footer(),
], "#F0FDFA");

const F3 = design([
  hOrange("{{nombre}}, ¿todo bien por ahí?", "Solo quería saber cómo estás"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, hace un tiempo no hablamos y quería saber si todo va bien con tu proyecto. Sin presiones — solo quería retomar el contacto.</p>`, "24px 40px 8px")]),
  divRow(),
  row([txt(`<p style="color:#555;margin:0">Desde la última vez que conversamos han pasado algunas cosas interesantes que creo que te pueden servir. ¿Tendríamos 20 minutos esta semana para ponernos al día?</p>`, "12px 40px 8px")]),
  row([
    txt(`<div style="background:#FFF7ED;border-left:4px solid #FF6B35;padding:14px 16px;border-radius:0 8px 8px 0">
<p style="font-weight:700;color:#FF6B35;margin:0 0 4px">Novedad para ti</p>
<p style="color:#555;margin:0">Desde tu última visita lanzamos algo nuevo que resuelve exactamente lo que comentabas.</p>
</div>`, "12px 36px 16px"),
  ]),
  row([btn("Ponernos al día ☕", "#FF6B35")]),
  divRow(), footer(),
]);

const F4 = design([
  hSlate("Un último recordatorio, {{nombre}}", "No quiero que te quedes sin esta oportunidad"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, te escribo por última vez respecto a esto. Sé que estás ocupado/a, y lo entiendo perfectamente.</p>`, "24px 40px 8px")]),
  divRow(),
  row([txt(`<p style="color:#555;margin:0">Solo quería asegurarme de que tienes toda la información antes de tomar una decisión. Si la respuesta es no, sin problema — pero si aún tienes interés, me encantaría escucharte.</p>`, "12px 40px 8px")]),
  row([
    txt(`<div style="background:#F8FAFC;border:1px solid #E2E8F0;padding:16px;border-radius:8px;text-align:center">
<p style="font-weight:700;color:#334155;margin:0 0 4px">¿Qué perdería si no actúo?</p>
<p style="color:#64748B;font-size:14px;margin:0">El precio actual, el cupo disponible y la ventana de tiempo.</p>
</div>`, "12px 36px 16px"),
  ]),
  row([btn("Hablemos hoy mismo", "#475569")]),
  divRow(), footer(),
]);

const F5 = design([
  hGreen("¡Gracias, {{nombre}}! 🙌", "Fue un placer trabajar contigo"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Quería escribirte personalmente para agradecerte la confianza que depositaste en nosotros. Trabajar con <strong>{{empresa}}</strong> fue una experiencia excelente.</p>`, "24px 44px 8px", "center")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="font-weight:700;color:#16A34A;text-align:center;margin:0 0 8px">Lo que logramos juntos</p>
<p style="color:#555;text-align:center;margin:4px 0">✓&nbsp; Objetivo 1 — Completado con éxito</p>
<p style="color:#555;text-align:center;margin:4px 0">✓&nbsp; Objetivo 2 — Superado en un 20%</p>
<p style="color:#555;text-align:center;margin:4px 0">✓&nbsp; Objetivo 3 — En camino</p>`, "16px 40px", "center")]),
  row([txt(`<p style="font-size:13px;color:#555;text-align:center;margin:0">Si algún día necesitas algo más, sabes dónde encontrarme. Y si tienes un minuto, una reseña significa mucho para nosotros.</p>`, "12px 44px 8px", "center")]),
  row([btn("Dejar una reseña ⭐", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

const F6 = design([
  hPurple("Revisemos tus avances, {{nombre}} 📊", "Seguimiento mensual — ¿cómo vas?"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, ya pasó otro mes y quiero asegurarme de que todo va según el plan. ¿Podemos revisar brevemente los resultados?</p>`, "24px 40px 8px")]),
  divRow("#ede9fe"),
  row([
    txt(`<p style="font-weight:700;color:#7C3AED;margin:0 0 10px">Puntos a revisar este mes</p>
<p style="color:#555;margin:5px 0">📊&nbsp; Métricas clave vs. objetivos del mes</p>
<p style="color:#555;margin:5px 0">🔍&nbsp; Lo que funcionó y lo que mejorar</p>
<p style="color:#555;margin:5px 0">🎯&nbsp; Ajustes para el próximo período</p>`, "16px 40px"),
  ]),
  row([btn("Agendar revisión mensual", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

const F7 = design([
  hAmber("¡Felicidades por el hito! 🏆", "{{nombre}}, esto merece celebrarse"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, hoy quería escribirte para reconocer lo que lograste. No es un hito menor — es el resultado de tu esfuerzo y constancia.</p>`, "24px 44px 8px", "center")]),
  row([txt(`<p style="font-size:36px;text-align:center;margin:0">🏆</p>
<p style="font-size:22px;font-weight:800;color:#D97706;text-align:center;margin:8px 0 4px">¡Meta alcanzada!</p>
<p style="font-size:14px;color:#888;text-align:center;margin:0">Esto es solo el comienzo</p>`, "12px 40px 20px", "center")], "#FFFBEB"),
  divRow("#fde68a"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">El siguiente objetivo ya está en el horizonte. ¿Hablamos de cómo superarlo?</p>`, "12px 44px 8px", "center")]),
  row([btn("Definir el próximo objetivo", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

// ─── ═══════════════════════════════════════════════════════════════════════ ───
// ─── CATEGORÍA: Newsletter ────────────────────────────────────────────────────
// ─── ═══════════════════════════════════════════════════════════════════════ ───

const N1 = design([
  hDark("Novedades de este mes 📰", "Todo lo que importa, en un solo lugar"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, aquí tienes las novedades más relevantes de este mes. Seleccionamos solo lo que realmente vale la pena leer.</p>`, "24px 40px 8px")]),
  divRow(),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#FF6B35;letter-spacing:2px;margin:0">ARTÍCULO DESTACADO</p>
<p style="font-size:18px;font-weight:700;color:#111;margin:8px 0 6px">Título del artículo más importante del mes</p>
<p style="color:#666;font-size:14px;margin:0">Descripción breve del contenido. Explica en 2-3 oraciones qué aprenderá el lector y por qué le es útil.</p>`, "16px 40px")]),
  row([btn("Leer artículo completo →", "#0F172A")]),
  divRow(),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#6366F1;letter-spacing:2px;margin:0">CONSEJO PRÁCTICO</p>
<p style="font-size:16px;font-weight:700;color:#111;margin:8px 0 6px">Un tip accionable para implementar hoy</p>
<p style="color:#666;font-size:14px;margin:0">Tip breve y concreto que el lector pueda aplicar sin necesitar contexto adicional.</p>`, "16px 40px")]),
  divRow(),
  row([btn("Ver todos los recursos", "#FF6B35")]),
  divRow(), footer(),
]);

const N2 = design([
  row([txt(`<p style="font-size:11px;color:#999;letter-spacing:3px;text-align:center;margin:0">NEWSLETTER</p>
<p style="font-size:28px;font-weight:800;color:#111;text-align:center;margin:8px 0 4px">Hola, {{nombre}}</p>
<p style="font-size:14px;color:#888;text-align:center;margin:0">Lo mejor de este mes</p>`, "40px 32px 20px", "center")]),
  row([div()]),
  row([txt(`<p style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">01 — Noticia principal</p>
<p style="color:#555;font-size:14px;margin:0">Descripción concisa y directa. Una o dos oraciones que atrapan al lector y lo invitan a seguir leyendo.</p>`, "16px 40px 12px")]),
  row([div("#eeeeee")]),
  row([txt(`<p style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">02 — Segunda novedad</p>
<p style="color:#555;font-size:14px;margin:0">Otra noticia relevante. Mantén el estilo consistente con el bloque anterior.</p>`, "12px 40px 12px")]),
  row([div("#eeeeee")]),
  row([txt(`<p style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">03 — Recurso del mes</p>
<p style="color:#555;font-size:14px;margin:0">Un recurso útil: una guía, plantilla, herramienta o artículo que vale la pena compartir.</p>`, "12px 40px 20px")]),
  row([btn("Ver todo el contenido", "#111111")]),
  divRow(), footer(),
], "#FFFFFF");

const N3 = design([
  hBlue("Noticias de {{empresa}} — {{nombre}}", "Actualizaciones importantes que no te puedes perder"),
  row([txt(`<p style="color:#555;margin:0">Este mes ha estado lleno de movimiento. Aquí un resumen de lo más importante que ocurrió en nuestra empresa:</p>`, "24px 40px 8px")]),
  divRow("#bfdbfe"),
  row([txt(`<div style="border-left:4px solid #1E40AF;padding:12px 16px;background:#EFF6FF;border-radius:0 8px 8px 0;margin-bottom:12px">
<p style="font-weight:700;color:#1E40AF;margin:0 0 4px">📢 Anuncio importante</p>
<p style="color:#555;margin:0;font-size:14px">Describe aquí la noticia principal de la empresa: nuevo producto, alianza estratégica, expansión, etc.</p>
</div>
<div style="border-left:4px solid #3B82F6;padding:12px 16px;background:#EFF6FF;border-radius:0 8px 8px 0">
<p style="font-weight:700;color:#3B82F6;margin:0 0 4px">🎉 Logro del mes</p>
<p style="color:#555;margin:0;font-size:14px">Comparte un logro, hito o reconocimiento que haya obtenido la empresa o el equipo.</p>
</div>`, "16px 36px")]),
  row([btn("Ver todas las novedades", "#1E40AF")]),
  divRow("#bfdbfe"), footer(),
], "#EFF6FF");

const N4 = design([
  hGreen("Tips del mes para {{nombre}} 💡", "Consejos accionables que puedes usar hoy"),
  row([txt(`<p style="color:#555;margin:0">Este mes recopilamos los mejores consejos de nuestro equipo y de los mejores profesionales del sector. Aquí van los top 4:</p>`, "24px 40px 8px")]),
  divRow("#bbf7d0"),
  row([
    txt(`<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:13px">1</span>&nbsp; <strong>Tip número uno:</strong> Descripción concisa del consejo. Qué hacer y por qué funciona.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:13px">2</span>&nbsp; <strong>Tip número dos:</strong> Otro consejo práctico y directo al grano.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:13px">3</span>&nbsp; <strong>Tip número tres:</strong> Algo que marca diferencia en el día a día del negocio.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:13px">4</span>&nbsp; <strong>Tip número cuatro:</strong> El consejo más valioso del mes según nuestros clientes.</p>`, "12px 36px"),
  ]),
  row([btn("Ver más tips →", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

const N5 = design([
  hPurple("Próximos eventos — No te los pierdas 🗓️", "Reserva tu lugar antes de que se agoten"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, en las próximas semanas tenemos eventos que no puedes perderte. Aquí el resumen:</p>`, "24px 40px 8px")]),
  divRow("#ede9fe"),
  row([
    txt(`<div style="background:#F5F3FF;border-radius:8px;padding:16px;margin-bottom:12px">
<p style="font-size:12px;color:#7C3AED;font-weight:700;letter-spacing:1px;margin:0">WEBINAR — DD/MM/AAAA</p>
<p style="font-weight:700;color:#111;margin:6px 0 4px">Título del webinar o evento en línea</p>
<p style="color:#666;font-size:14px;margin:0">Descripción breve del tema y por qué es relevante para el asistente.</p>
</div>
<div style="background:#F5F3FF;border-radius:8px;padding:16px">
<p style="font-size:12px;color:#7C3AED;font-weight:700;letter-spacing:1px;margin:0">EVENTO PRESENCIAL — DD/MM/AAAA</p>
<p style="font-weight:700;color:#111;margin:6px 0 4px">Nombre del evento presencial o taller</p>
<p style="color:#666;font-size:14px;margin:0">Lugar, duración y qué aprenderá el asistente.</p>
</div>`, "12px 36px"),
  ]),
  row([btn("Reservar mi lugar →", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

const N6 = design([
  hAmber("Resultados de este mes 📊", "{{nombre}}, aquí están los números que importan"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, este mes cerramos con resultados que vale la pena compartir. Aquí el resumen de las métricas clave:</p>`, "24px 40px 8px")]),
  row([
    txt(`<div style="display:flex;gap:12px;flex-wrap:wrap">
<div style="flex:1;min-width:120px;text-align:center;background:#FFFBEB;border-radius:8px;padding:16px">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">+47%</p>
<p style="font-size:13px;color:#666;margin:4px 0 0">Métrica 1</p>
</div>
<div style="flex:1;min-width:120px;text-align:center;background:#FFFBEB;border-radius:8px;padding:16px">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">1,240</p>
<p style="font-size:13px;color:#666;margin:4px 0 0">Métrica 2</p>
</div>
<div style="flex:1;min-width:120px;text-align:center;background:#FFFBEB;border-radius:8px;padding:16px">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">98%</p>
<p style="font-size:13px;color:#666;margin:4px 0 0">Satisfacción</p>
</div>
</div>`, "16px 36px"),
  ]),
  divRow("#fde68a"),
  row([txt(`<p style="color:#555;margin:0">El próximo mes queremos superar estos resultados. ¿Hablamos de cómo podemos lograrlo juntos?</p>`, "12px 40px 8px")]),
  row([btn("Ver informe completo", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

const N7 = design([
  hIndigo("Digest semanal — Semana del MM/DD 📬", "Lo mejor de la semana, resumido para ti"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, esta semana pasaron cosas importantes. Aquí lo que no debes perderte:</p>`, "24px 40px 8px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:12px;font-weight:700;color:#4338CA;letter-spacing:1px;margin:0">🔥 LO MÁS VISTO</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">Artículo o contenido más popular de la semana</p>
<p style="color:#666;font-size:14px;margin:0">Una o dos oraciones resumiendo el contenido.</p>`, "12px 40px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:12px;font-weight:700;color:#6366F1;letter-spacing:1px;margin:0">🧠 PARA REFLEXIONAR</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">Cita, idea o pregunta de la semana</p>
<p style="color:#555;font-size:14px;margin:0;font-style:italic">"Una cita inspiradora o pregunta que haga pensar a tus lectores."</p>`, "12px 40px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:12px;font-weight:700;color:#818CF8;letter-spacing:1px;margin:0">📌 RECURSO DE LA SEMANA</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">Herramienta, guía o plantilla útil</p>
<p style="color:#666;font-size:14px;margin:0">Breve descripción de por qué es útil y cómo usarlo.</p>`, "12px 40px")]),
  row([btn("Ver todos los recursos →", "#4338CA")]),
  divRow("#c7d2fe"), footer(),
], "#EEF2FF");

// ─── ═══════════════════════════════════════════════════════════════════════ ───
// ─── Export ───────────────────────────────────────────────────────────────────
// ─── ═══════════════════════════════════════════════════════════════════════ ───

export interface StarterTemplate {
  id: string;
  category: "Bienvenida" | "Ventas" | "Seguimiento" | "Newsletter";
  name: string;
  description: string;
  subject: string;
  color: string;
  design: object;
}

export const CATEGORIES = ["Todos", "Bienvenida", "Ventas", "Seguimiento", "Newsletter"] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Bienvenida:   "#FF6B35",
  Ventas:       "#DC2626",
  Seguimiento:  "#1E40AF",
  Newsletter:   "#0F172A",
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ── Bienvenida ──────────────────────────────────────────────────────────────
  { id: "w1", category: "Bienvenida", name: "Bienvenida cálida",       description: "Header naranja, lista de beneficios y CTA",         subject: "¡Bienvenido/a, {{nombre}}! 🎉",            color: "#FF6B35", design: W1 },
  { id: "w2", category: "Bienvenida", name: "Bienvenida corporativa",  description: "Azul profesional con plan de onboarding en pasos",  subject: "Bienvenido/a al equipo, {{nombre}}",        color: "#1E40AF", design: W2 },
  { id: "w3", category: "Bienvenida", name: "Acceso premium ✦",        description: "Estilo oscuro de lujo para membresías VIP",         subject: "Tu acceso exclusivo está activo ✦",         color: "#0F172A", design: W3 },
  { id: "w4", category: "Bienvenida", name: "Bienvenida motivadora",   description: "Verde positivo, celebra la decisión del cliente",   subject: "¡Lo lograste, {{nombre}}! 🌱",              color: "#16A34A", design: W4 },
  { id: "w5", category: "Bienvenida", name: "Bienvenida minimalista",  description: "Diseño limpio y directo, solo lo esencial",         subject: "Hola, {{nombre}} 👋",                       color: "#111111", design: W5 },
  { id: "w6", category: "Bienvenida", name: "Onboarding por pasos",    description: "Morado con 3 pasos visuales para iniciar",          subject: "¡Ya eres parte, {{nombre}}! 🎊",            color: "#7C3AED", design: W6 },
  { id: "w7", category: "Bienvenida", name: "Confirmación de cuenta",  description: "Verde agua, confirma datos y da acceso",            subject: "Cuenta creada con éxito ✓",                color: "#0D9488", design: W7 },
  // ── Ventas ──────────────────────────────────────────────────────────────────
  { id: "s1", category: "Ventas",     name: "Oferta flash ⚡",         description: "Rojo urgente, gran porcentaje de descuento",        subject: "⚡ OFERTA FLASH — Solo 24 horas, {{nombre}}",color: "#DC2626", design: S1 },
  { id: "s2", category: "Ventas",     name: "Black Friday",            description: "Fondo negro dramático, 50% OFF",                   subject: "50% OFF — La mayor oferta del año 🖤",      color: "#111111", design: S2 },
  { id: "s3", category: "Ventas",     name: "Lanzamiento de producto", description: "Morado vibrante para anunciar novedades",           subject: "🚀 Nuevo: ya está disponible, {{nombre}}",  color: "#7C3AED", design: S3 },
  { id: "s4", category: "Ventas",     name: "Propuesta de valor",      description: "Verde con métricas de ROI y resultados",           subject: "Tu inversión multiplicada 📈",              color: "#16A34A", design: S4 },
  { id: "s5", category: "Ventas",     name: "Cupón de descuento",      description: "Ámbar con cupón visual en caja punteada",          subject: "🎁 Tu cupón exclusivo — {{nombre}}",        color: "#D97706", design: S5 },
  { id: "s6", category: "Ventas",     name: "Urgencia de cierre",      description: "Índigo con escasez y cuenta regresiva",            subject: "Últimos cupos disponibles, {{nombre}} 🗓️",  color: "#4338CA", design: S6 },
  { id: "s7", category: "Ventas",     name: "Propuesta personalizada", description: "Gris oscuro, enfocado en valor específico",        subject: "Una propuesta pensada para ti, {{nombre}}",color: "#475569", design: S7 },
  // ── Seguimiento ─────────────────────────────────────────────────────────────
  { id: "f1", category: "Seguimiento",name: "Resumen de reunión",      description: "Azul con puntos tratados y próximos pasos",        subject: "Resumen de nuestra reunión, {{nombre}}",    color: "#1E40AF", design: F1 },
  { id: "f2", category: "Seguimiento",name: "Propuesta enviada",       description: "Verde agua con desglose de lo incluido",           subject: "Tu propuesta está lista, {{nombre}} 📄",    color: "#0D9488", design: F2 },
  { id: "f3", category: "Seguimiento",name: "Reactivación amigable",   description: "Naranja casual para retomar contacto frío",        subject: "{{nombre}}, ¿todo bien por ahí? ☕",        color: "#FF6B35", design: F3 },
  { id: "f4", category: "Seguimiento",name: "Último recordatorio",     description: "Slate discreto para cerrar conversación",          subject: "Un último mensaje, {{nombre}}",             color: "#475569", design: F4 },
  { id: "f5", category: "Seguimiento",name: "Cierre y agradecimiento", description: "Verde celebración con logros alcanzados",          subject: "¡Gracias, {{nombre}}! Fue un placer 🙌",    color: "#16A34A", design: F5 },
  { id: "f6", category: "Seguimiento",name: "Check-in mensual",        description: "Morado con agenda de revisión de métricas",        subject: "Revisemos tus avances, {{nombre}} 📊",      color: "#7C3AED", design: F6 },
  { id: "f7", category: "Seguimiento",name: "Celebración de hito",     description: "Ámbar festivo para reconocer logros del cliente",  subject: "¡Felicidades por el hito, {{nombre}}! 🏆",  color: "#D97706", design: F7 },
  // ── Newsletter ──────────────────────────────────────────────────────────────
  { id: "n1", category: "Newsletter", name: "Newsletter clásico",      description: "Oscuro con secciones destacado + consejo",         subject: "Novedades de este mes para {{nombre}} 📰",  color: "#0F172A", design: N1 },
  { id: "n2", category: "Newsletter", name: "Newsletter minimalista",  description: "Blanco limpio con 3 artículos numerados",          subject: "Lo mejor de este mes, {{nombre}}",          color: "#111111", design: N2 },
  { id: "n3", category: "Newsletter", name: "Noticias de empresa",     description: "Azul corporativo con anuncios e hitos",            subject: "Noticias de {{empresa}} — {{nombre}}",      color: "#1E40AF", design: N3 },
  { id: "n4", category: "Newsletter", name: "Tips y consejos",         description: "Verde con 4 tips numerados y accionables",         subject: "4 tips del mes para {{nombre}} 💡",         color: "#16A34A", design: N4 },
  { id: "n5", category: "Newsletter", name: "Eventos próximos",        description: "Morado con tarjetas de webinar y evento presencial",subject: "Próximos eventos — no te los pierdas 🗓️",   color: "#7C3AED", design: N5 },
  { id: "n6", category: "Newsletter", name: "Resultados y métricas",   description: "Ámbar con bloques de cifras y KPIs visuales",      subject: "Resultados de este mes, {{nombre}} 📊",     color: "#D97706", design: N6 },
  { id: "n7", category: "Newsletter", name: "Digest semanal",          description: "Índigo con 3 secciones: lo más visto, reflexión, recurso",subject: "Digest semanal — {{nombre}} 📬",       color: "#4338CA", design: N7 },
];

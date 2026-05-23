/**
 * Starter email templates — 28 designs, 4 categories.
 * Images via Unsplash (free, no attribution required for display).
 */

let _c = 1;
const uid = () => `u${(_c++).toString(36)}`;

// ─── Content element helpers ──────────────────────────────────────────────────

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

function img(url: string, alt: string, p = "0px") {
  return {
    id: uid(), type: "image",
    values: {
      containerPadding: p, anchor: "",
      src: { url, width: 600, height: 280, autoWidth: false, maxWidth: "100%" },
      textAlign: "center", altText: alt,
      action: { name: "web", values: { href: "#", target: "_blank" } },
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_image" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
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
const imgRow = (url: string, alt: string) => row([img(url, alt)]);

function design(rows: object[], bodyBg = "#F2F2F2") {
  return {
    counters: { u_column: 40, u_row: 40, u_content_text: 60, u_content_button: 20, u_content_divider: 20, u_content_image: 20 },
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
        backgroundColor: bodyBg, _meta: { htmlClassNames: "u_body" },
      },
    },
  };
}

// ─── Typed header helpers ─────────────────────────────────────────────────────
const hdr = (title: string, sub: string, bg: string, p = "36px 32px 28px") =>
  row([txt(`<p style="font-size:26px;font-weight:800;color:#fff;margin:0;text-align:center">${title}</p>${sub ? `<p style="font-size:14px;color:rgba(255,255,255,.82);text-align:center;margin:8px 0 0">${sub}</p>` : ""}`, p, "center")], bg);

const footer = (msg = "Recibiste este email porque eres parte de nuestra comunidad.") =>
  row([txt(`<p style="font-size:12px;color:#999;text-align:center;margin:0">${msg}<br>Si no deseas recibirlo, <a href="#" style="color:#bbb">cancela aquí</a>.</p>`, "16px 32px 24px", "center")], "#F8F8F8");

// ─── Unsplash image URLs (600×280, free stock) ────────────────────────────────
const PX = {
  team:       "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=280&auto=format&fit=crop&q=80",
  handshake:  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=600&h=280&auto=format&fit=crop&q=80",
  welcome:    "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&h=280&auto=format&fit=crop&q=80",
  premium:    "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&h=280&auto=format&fit=crop&q=80",
  growth:     "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=280&auto=format&fit=crop&q=80",
  success:    "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=280&auto=format&fit=crop&q=80",
  onboarding: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=280&auto=format&fit=crop&q=80",
  office:     "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=280&auto=format&fit=crop&q=80",
  sale:       "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&h=280&auto=format&fit=crop&q=80",
  shopping:   "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=280&auto=format&fit=crop&q=80",
  launch:     "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=280&auto=format&fit=crop&q=80",
  gift:       "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&h=280&auto=format&fit=crop&q=80",
  urgency:    "https://images.unsplash.com/photo-1434626881859-194d67b2b86f?w=600&h=280&auto=format&fit=crop&q=80",
  meeting:    "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&h=280&auto=format&fit=crop&q=80",
  document:   "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=280&auto=format&fit=crop&q=80",
  coffee:     "https://images.unsplash.com/photo-1423666639041-f56000c27a9a?w=600&h=280&auto=format&fit=crop&q=80",
  trophy:     "https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=600&h=280&auto=format&fit=crop&q=80",
  checkin:    "https://images.unsplash.com/photo-1590650153855-d9e808231d41?w=600&h=280&auto=format&fit=crop&q=80",
  celebrate:  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&h=280&auto=format&fit=crop&q=80",
  newspaper:  "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&h=280&auto=format&fit=crop&q=80",
  tips:       "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&h=280&auto=format&fit=crop&q=80",
  event:      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=280&auto=format&fit=crop&q=80",
  metrics:    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=280&auto=format&fit=crop&q=80",
  reading:    "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600&h=280&auto=format&fit=crop&q=80",
};

// ═══════════════════════════════════════════════════════════════════════════════
// BIENVENIDA (7 templates)
// ═══════════════════════════════════════════════════════════════════════════════

// W1 — Cálida con equipo
const W1 = design([
  hdr("¡Bienvenido/a, {{nombre}}! 🎉", "Ya eres parte de nuestra familia", "#FF6B35"),
  imgRow(PX.team, "Equipo dando la bienvenida"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, estamos muy contentos de tenerte aquí. A partir de hoy nuestro equipo trabaja para ti.</p>`, "24px 44px 8px", "center")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#222;margin:0 0 10px">¿Qué puedes esperar?</p>
<p style="margin:6px 0;color:#555">✅&nbsp; Atención personalizada y rápida</p>
<p style="margin:6px 0;color:#555">✅&nbsp; Acceso a recursos exclusivos</p>
<p style="margin:6px 0;color:#555">✅&nbsp; Seguimiento continuo de tu caso</p>`, "16px 40px")]),
  row([btn("Conocer mis beneficios →", "#FF6B35")]),
  divRow(), footer(),
]);

// W2 — Corporativa con apretón de manos
const W2 = design([
  hdr("Bienvenido/a al equipo, {{nombre}}", "Tu socio estratégico ya está listo", "#1E40AF"),
  imgRow(PX.handshake, "Apretón de manos — nuevo inicio"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, es un honor que confíes en nosotros. Hemos diseñado un plan de inicio para que el impacto sea inmediato:</p>`, "24px 40px 8px")]),
  row([txt(`<p style="margin:8px 0;color:#555">📞&nbsp; <strong>Paso 1</strong> — Llamada de onboarding (30 min)</p>
<p style="margin:8px 0;color:#555">📋&nbsp; <strong>Paso 2</strong> — Diagnóstico de tu situación actual</p>
<p style="margin:8px 0;color:#555">🎯&nbsp; <strong>Paso 3</strong> — Plan personalizado en marcha</p>`, "12px 40px")]),
  row([btn("Agendar mi onboarding", "#1E40AF")]),
  divRow("#bfdbfe"), footer(),
], "#EFF6FF");

// W3 — Premium / lujo (imagen oscura)
const W3 = design([
  hdr("Acceso VIP activado ✦", "Bienvenido/a a la experiencia premium", "#0F172A"),
  imgRow(PX.premium, "Experiencia premium exclusiva"),
  row([txt(`<p style="font-size:15px;color:#444;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, tu membresía exclusiva ya está activa. Prepárate para un nivel de servicio completamente diferente.</p>`, "24px 44px 8px", "center")]),
  divRow("#cbd5e1"),
  row([
    txt(`<p style="color:#444;margin:6px 0">💎&nbsp; Acceso prioritario a nuestro equipo senior</p>
<p style="color:#444;margin:6px 0">📊&nbsp; Informes y análisis exclusivos mensuales</p>
<p style="color:#444;margin:6px 0">🔒&nbsp; Línea directa de soporte dedicado</p>
<p style="color:#444;margin:6px 0">🚀&nbsp; Estrategia personalizada cada trimestre</p>`, "12px 44px"),
  ]),
  row([btn("Activar mis beneficios VIP", "#0F172A")]),
  divRow("#cbd5e1"), footer(),
], "#F1F5F9");

// W4 — Motivadora / éxito
const W4 = design([
  hdr("¡Lo lograste, {{nombre}}! 🌱", "Tu decisión fue el primer gran paso", "#16A34A"),
  imgRow(PX.success, "Persona celebrando el éxito"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Felicidades por dar este paso. Muchas personas piensan en mejorar — tú lo hiciste. Eso ya te diferencia del 90%.</p>`, "24px 44px 8px", "center")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="font-weight:700;color:#16A34A;margin:0 0 10px">Lo que viene ahora</p>
<p style="margin:6px 0;color:#555">🌱&nbsp; Conocemos tu negocio a fondo (semana 1)</p>
<p style="margin:6px 0;color:#555">📈&nbsp; Diseñamos tu hoja de ruta (semana 2)</p>
<p style="margin:6px 0;color:#555">💪&nbsp; Ejecutamos juntos, semana a semana</p>`, "16px 40px")]),
  row([btn("Ver mi hoja de ruta", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

// W5 — Minimalista (sin imagen, clean)
const W5 = design([
  row([txt(`<p style="font-size:11px;color:#FF6B35;font-weight:700;letter-spacing:3px;text-align:center;margin:0">BIENVENIDA</p>
<p style="font-size:34px;font-weight:900;color:#111;text-align:center;margin:10px 0 0">Hola, {{nombre}} 👋</p>
<p style="font-size:15px;color:#888;text-align:center;margin:10px 0 0">Nos alegra tenerte con nosotros</p>`, "48px 32px 32px", "center")]),
  row([div()]),
  row([txt(`<p style="font-size:16px;color:#444;text-align:center;margin:0">Una sola cosa que necesitas saber:</p>
<p style="font-size:22px;font-weight:700;color:#111;text-align:center;margin:12px 0">Estamos aquí para ayudarte a crecer.</p>
<p style="font-size:15px;color:#666;text-align:center;margin:0">Sin complicaciones, sin letra pequeña.</p>`, "20px 60px", "center")]),
  row([div()]),
  row([btn("Ir a mi cuenta", "#111111")]),
  divRow(), footer(),
], "#FFFFFF");

// W6 — Onboarding por pasos con imagen de trabajo
const W6 = design([
  hdr("¡Ya eres parte, {{nombre}}! 🎊", "Sigue estos 3 pasos para empezar", "#7C3AED"),
  imgRow(PX.onboarding, "Persona trabajando en su computadora"),
  row([txt(`<p style="color:#555;margin:0 0 16px">Preparamos todo para que tengas el mejor inicio posible. Aquí tu guía de los primeros pasos:</p>`, "20px 40px 4px")]),
  row([txt(`<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:14px 16px;border-radius:0 8px 8px 0;margin:0 0 10px">
<p style="font-weight:700;color:#7C3AED;margin:0 0 2px">Paso 1 — Completa tu perfil</p>
<p style="color:#666;font-size:14px;margin:0">Personaliza tu experiencia agregando tus datos y preferencias</p>
</div>
<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:14px 16px;border-radius:0 8px 8px 0;margin:0 0 10px">
<p style="font-weight:700;color:#7C3AED;margin:0 0 2px">Paso 2 — Explora el panel</p>
<p style="color:#666;font-size:14px;margin:0">Conoce todas las herramientas disponibles para ti</p>
</div>
<div style="background:#F5F3FF;border-left:4px solid #7C3AED;padding:14px 16px;border-radius:0 8px 8px 0">
<p style="font-weight:700;color:#7C3AED;margin:0 0 2px">Paso 3 — Agenda tu primera sesión</p>
<p style="color:#666;font-size:14px;margin:0">Hablamos 30 minutos y creamos tu plan personalizado</p>
</div>`, "12px 36px")]),
  row([btn("Ir a mi panel →", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

// W7 — Confirmación con imagen de oficina
const W7 = design([
  hdr("Cuenta creada con éxito ✓", "{{nombre}}, ya tienes acceso completo", "#0D9488"),
  imgRow(PX.office, "Espacio de trabajo moderno y colaborativo"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Tu cuenta está activa y configurada. Aquí un resumen de lo que registramos:</p>`, "20px 44px 8px", "center")]),
  row([txt(`<div style="background:#F0FDFA;border-radius:8px;padding:16px;border:1px solid #99f6e4">
<p style="color:#555;margin:5px 0">📧&nbsp; Email: <strong>{{email}}</strong></p>
<p style="color:#555;margin:5px 0">🏢&nbsp; Empresa: <strong>{{empresa}}</strong></p>
<p style="color:#555;margin:5px 0">👤&nbsp; Nombre: <strong>{{nombre}} {{apellido}}</strong></p>
</div>`, "12px 40px 16px")]),
  row([btn("Explorar la plataforma →", "#0D9488")]),
  divRow("#99f6e4"), footer(),
], "#F0FDFA");

// ═══════════════════════════════════════════════════════════════════════════════
// VENTAS (7 templates)
// ═══════════════════════════════════════════════════════════════════════════════

// S1 — Flash sale urgente
const S1 = design([
  hdr("⚡ OFERTA FLASH — Solo 24 horas", "Exclusivo para clientes como {{nombre}}", "#DC2626"),
  imgRow(PX.sale, "Oferta y descuento especial"),
  row([txt(`<p style="font-size:52px;font-weight:900;color:#DC2626;text-align:center;margin:0">40% OFF</p>
<p style="font-size:14px;color:#888;text-align:center;margin:4px 0 0">descuento exclusivo válido solo hoy</p>`, "16px 32px 8px", "center")], "#FEF2F2"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, esta oferta no se repetirá. La seleccionamos especialmente para ti. <strong>Vence hoy a las 23:59.</strong></p>`, "16px 44px 8px", "center")]),
  row([btn("⚡ Aprovechar ahora", "#DC2626")]),
  divRow("#fecaca"),
  row([txt(`<p style="font-size:12px;color:#aaa;text-align:center">⏰ Quedan pocas horas · Aplican condiciones</p>`, "12px 32px 20px", "center")], "#FAFAFA"),
]);

// S2 — Black Friday dramático
const S2 = design([
  row([txt(`<p style="font-size:12px;color:#f59e0b;font-weight:700;letter-spacing:4px;text-align:center;margin:0">BLACK FRIDAY</p>
<p style="font-size:52px;font-weight:900;color:#fff;text-align:center;margin:6px 0 4px">50% OFF</p>
<p style="font-size:15px;color:rgba(255,255,255,.7);text-align:center;margin:0">La oferta más grande del año ha llegado</p>`, "36px 32px 32px", "center")], "#111111"),
  imgRow(PX.shopping, "Persona de compras aprovechando descuentos"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, preparamos esta oferta única pensando en ti. Es el momento perfecto para dar el siguiente paso.</p>`, "20px 44px 8px", "center")]),
  row([txt(`<p style="text-align:center;color:#555;margin:5px 0">✓&nbsp; Precio especial garantizado</p>
<p style="text-align:center;color:#555;margin:5px 0">✓&nbsp; Sin costos ocultos</p>
<p style="text-align:center;color:#555;margin:5px 0">✓&nbsp; Acceso inmediato tras la compra</p>`, "8px 40px 16px", "center")]),
  row([btn("Quiero este precio 🖤", "#111111")]),
  divRow(), footer(),
]);

// S3 — Lanzamiento de producto
const S3 = design([
  hdr("🚀 Nuevo lanzamiento disponible", "Lo que esperabas ya está aquí, {{nombre}}", "#7C3AED"),
  imgRow(PX.launch, "Lanzamiento de producto digital"),
  row([txt(`<p style="color:#555;margin:0">Llevamos meses preparando esto. Hoy por fin está listo y queremos que seas de los primeros en acceder antes que el resto.</p>`, "20px 40px 8px")]),
  divRow("#ede9fe"),
  row([txt(`<p style="font-weight:700;color:#7C3AED;margin:0 0 10px">¿Qué hay de nuevo?</p>
<p style="margin:7px 0;color:#555">🆕&nbsp; <strong>Función 1</strong> — Descripción de la novedad más esperada</p>
<p style="margin:7px 0;color:#555">🆕&nbsp; <strong>Función 2</strong> — Otra mejora importante que marca diferencia</p>
<p style="margin:7px 0;color:#555">🆕&nbsp; <strong>Función 3</strong> — El cambio que más solicitaban nuestros usuarios</p>`, "12px 40px")]),
  row([btn("Ver el lanzamiento completo →", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

// S4 — Propuesta de valor con métricas
const S4 = design([
  hdr("Tu inversión, multiplicada 📈", "Números reales de clientes reales", "#16A34A"),
  imgRow(PX.growth, "Gráficas de crecimiento y resultados"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, antes de hablar de precio hablemos de resultado. Esto es lo que logran nuestros clientes en promedio:</p>`, "20px 44px 8px", "center")]),
  row([txt(`<div style="display:flex;gap:8px;text-align:center">
<div style="flex:1;background:#F0FDF4;border-radius:8px;padding:14px 8px;border:1px solid #bbf7d0">
<p style="font-size:30px;font-weight:900;color:#16A34A;margin:0">3×</p>
<p style="font-size:12px;color:#666;margin:4px 0 0">Retorno promedio</p>
</div>
<div style="flex:1;background:#F0FDF4;border-radius:8px;padding:14px 8px;border:1px solid #bbf7d0">
<p style="font-size:30px;font-weight:900;color:#16A34A;margin:0">+60%</p>
<p style="font-size:12px;color:#666;margin:4px 0 0">Crecimiento 90 días</p>
</div>
<div style="flex:1;background:#F0FDF4;border-radius:8px;padding:14px 8px;border:1px solid #bbf7d0">
<p style="font-size:30px;font-weight:900;color:#16A34A;margin:0">98%</p>
<p style="font-size:12px;color:#666;margin:4px 0 0">Satisfacción</p>
</div>
</div>`, "12px 36px 16px")]),
  row([btn("Ver cómo funciona →", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

// S5 — Cupón con imagen de regalo
const S5 = design([
  hdr("🎁 Tu regalo exclusivo te espera", "Solo disponible para {{nombre}}", "#D97706"),
  imgRow(PX.gift, "Caja de regalo especial"),
  row([txt(`<div style="border:3px dashed #D97706;border-radius:12px;padding:20px;text-align:center;background:#FFFBEB">
<p style="font-size:12px;color:#92400E;letter-spacing:2px;font-weight:700;margin:0">TU CÓDIGO EXCLUSIVO</p>
<p style="font-size:38px;font-weight:900;color:#D97706;font-family:monospace;margin:8px 0">NOMBRE20</p>
<p style="font-size:13px;color:#666;margin:0">20% de descuento · Válido 7 días</p>
</div>`, "20px 36px 12px")]),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Este cupón es personal e intransferible. Aplícalo en tu próxima compra antes de que expire.</p>`, "8px 44px 12px", "center")]),
  row([btn("Usar mi cupón ahora →", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

// S6 — Urgencia con reloj
const S6 = design([
  hdr("Últimos cupos disponibles 🗓️", "{{nombre}}, el momento de decidir es ahora", "#4338CA"),
  imgRow(PX.urgency, "Reloj — el tiempo corre"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, solo quedan <strong>3 cupos disponibles</strong> para este mes. Una vez llenos, el precio sube y el siguiente ciclo comienza en 6 semanas.</p>`, "20px 44px 8px", "center")]),
  row([txt(`<p style="font-size:28px;font-weight:900;color:#4338CA;text-align:center;margin:0">⚠️ Solo 3 cupos</p>`, "8px 40px 4px", "center")], "#EEF2FF"),
  divRow("#c7d2fe"),
  row([txt(`<p style="color:#555;margin:5px 0">✓&nbsp; Precio actual garantizado si cierras hoy</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Inicio inmediato sin esperas</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Garantía de satisfacción 30 días</p>`, "12px 40px 12px")]),
  row([btn("Reservar mi cupo ahora", "#4338CA")]),
  divRow("#c7d2fe"), footer(),
], "#EEF2FF");

// S7 — Propuesta personalizada
const S7 = design([
  hdr("Una propuesta solo para ti", "{{nombre}}, esto es lo que lograríamos juntos", "#475569"),
  imgRow(PX.meeting, "Reunión de negocios y propuesta"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, tomé el tiempo de preparar algo específico para <strong>{{empresa}}</strong>. No es una oferta genérica — es una propuesta diseñada para tu situación real.</p>`, "24px 40px 8px")]),
  divRow(),
  row([txt(`<p style="font-weight:700;color:#334155;margin:0 0 12px">¿Qué incluye esta propuesta?</p>
<p style="color:#555;margin:6px 0">📌&nbsp; Diagnóstico completo de tu situación actual</p>
<p style="color:#555;margin:6px 0">🎯&nbsp; Estrategia personalizada para tus objetivos</p>
<p style="color:#555;margin:6px 0">📈&nbsp; Plan de acción con resultados medibles</p>
<p style="color:#555;margin:6px 0">🤝&nbsp; Acompañamiento semanal de nuestro equipo</p>`, "16px 40px")]),
  row([btn("Ver la propuesta completa →", "#475569")]),
  divRow(), footer(),
]);

// ═══════════════════════════════════════════════════════════════════════════════
// SEGUIMIENTO (7 templates)
// ═══════════════════════════════════════════════════════════════════════════════

// F1 — Post reunión
const F1 = design([
  hdr("📋 Resumen de nuestra reunión", "Todo lo que conversamos en un solo lugar", "#1E40AF"),
  imgRow(PX.meeting, "Sala de reunión profesional"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, fue un placer hablar contigo hoy. Como prometí, aquí tienes el resumen de lo que discutimos.</p>`, "20px 40px 8px")]),
  row([txt(`<p style="font-weight:700;color:#1E40AF;margin:0 0 8px">📌 Puntos tratados</p>
<p style="color:#555;margin:4px 0">• Tu situación actual y objetivos principales</p>
<p style="color:#555;margin:4px 0">• Las soluciones más adecuadas para tu caso</p>
<p style="color:#555;margin:4px 0">• Inversión y cronograma estimados</p>`, "12px 40px")]),
  divRow("#bfdbfe"),
  row([txt(`<p style="font-weight:700;color:#1E40AF;margin:0 0 8px">🚀 Próximos pasos</p>
<p style="color:#555;margin:4px 0">1. Revisas la propuesta que te envío adjunta</p>
<p style="color:#555;margin:4px 0">2. Me confirmas si tienes dudas (responde este email)</p>
<p style="color:#555;margin:4px 0">3. Agendamos la llamada de cierre</p>`, "12px 40px")]),
  row([btn("Agendar siguiente llamada", "#1E40AF")]),
  divRow("#bfdbfe"), footer(),
], "#EFF6FF");

// F2 — Propuesta enviada
const F2 = design([
  hdr("Tu propuesta está lista 📄", "{{nombre}}, la preparé especialmente para ti", "#0D9488"),
  imgRow(PX.document, "Documentos y propuesta de negocios"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, tal como acordamos aquí tienes la propuesta personalizada para <strong>{{empresa}}</strong>. La revisé dos veces para asegurarme de que refleja exactamente tus necesidades.</p>`, "20px 40px 8px")]),
  divRow("#99f6e4"),
  row([txt(`<p style="font-weight:700;color:#0D9488;margin:0 0 10px">La propuesta incluye:</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Diagnóstico y análisis de situación</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Solución recomendada con justificación</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Desglose de inversión y ROI proyectado</p>
<p style="color:#555;margin:5px 0">✓&nbsp; Cronograma de implementación semana a semana</p>`, "12px 40px")]),
  row([btn("Ver propuesta completa →", "#0D9488")]),
  row([txt(`<p style="font-size:13px;color:#777;text-align:center;margin:0">Tengo disponibilidad esta semana. Solo responde este email y coordinamos.</p>`, "8px 40px 20px", "center")]),
  divRow("#99f6e4"), footer(),
], "#F0FDFA");

// F3 — Reactivación con café
const F3 = design([
  hdr("{{nombre}}, ¿todo bien por ahí? ☕", "Solo quería saber cómo estás", "#FF6B35"),
  imgRow(PX.coffee, "Café y conversación amigable"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, hace un tiempo no hablamos y quería saber si todo va bien con tu proyecto. Sin presiones — solo quería retomar el contacto.</p>`, "20px 40px 8px")]),
  row([txt(`<div style="background:#FFF7ED;border-left:4px solid #FF6B35;padding:14px 16px;border-radius:0 8px 8px 0">
<p style="font-weight:700;color:#FF6B35;margin:0 0 4px">Algo nuevo que puede interesarte</p>
<p style="color:#555;margin:0;font-size:14px">Desde tu última visita lanzamos algo nuevo que resuelve exactamente lo que comentabas en nuestra última conversación.</p>
</div>`, "12px 36px 16px")]),
  row([btn("Ponernos al día ☕", "#FF6B35")]),
  divRow(), footer(),
]);

// F4 — Último recordatorio (más limpio, sin imagen pesada)
const F4 = design([
  hdr("Un último mensaje, {{nombre}}", "No quiero que pierdas esta oportunidad", "#475569"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, te escribo por última vez sobre esto. Sé que estás ocupado/a — lo entiendo perfectamente.</p>`, "24px 40px 8px")]),
  row([txt(`<div style="background:#F8FAFC;border:1px solid #E2E8F0;padding:20px;border-radius:10px;text-align:center">
<p style="font-size:28px;margin:0">🤔</p>
<p style="font-weight:700;color:#334155;margin:10px 0 4px">¿Aún tienes dudas?</p>
<p style="color:#64748B;font-size:14px;margin:0">Responde este email con cualquier pregunta. Me comprometo a responderte en menos de 2 horas.</p>
</div>`, "16px 40px")]),
  divRow(),
  row([txt(`<p style="color:#555;margin:0">Si la respuesta es no, sin problema — pero si aún hay interés, me encantaría escucharte antes de cerrar el ciclo.</p>`, "12px 40px 8px")]),
  row([btn("Hablemos hoy mismo", "#475569")]),
  divRow(), footer(),
]);

// F5 — Cierre y agradecimiento
const F5 = design([
  hdr("¡Gracias, {{nombre}}! 🙌", "Fue un placer trabajar contigo", "#16A34A"),
  imgRow(PX.celebrate, "Celebración y éxito compartido"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Quería escribirte personalmente para agradecerte la confianza que depositaste en nosotros. Trabajar con <strong>{{empresa}}</strong> fue una experiencia increíble.</p>`, "20px 44px 8px", "center")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="font-weight:700;color:#16A34A;text-align:center;margin:0 0 10px">Lo que logramos juntos</p>
<p style="text-align:center;color:#555;margin:4px 0">✓&nbsp; Objetivo 1 — Completado con éxito</p>
<p style="text-align:center;color:#555;margin:4px 0">✓&nbsp; Objetivo 2 — Superado en un 20%</p>
<p style="text-align:center;color:#555;margin:4px 0">✓&nbsp; Objetivo 3 — Base sólida para continuar</p>`, "12px 40px", "center")]),
  row([btn("Dejar una reseña ⭐", "#16A34A")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="font-size:13px;color:#555;text-align:center;margin:0">Si algún día necesitas algo más, sabes dónde encontrarme.</p>`, "12px 44px 16px", "center")]),
  footer(),
], "#F0FDF4");

// F6 — Check-in mensual
const F6 = design([
  hdr("Revisemos tus avances, {{nombre}} 📊", "Check-in mensual — ¿cómo van los números?", "#7C3AED"),
  imgRow(PX.checkin, "Revisión mensual de resultados y métricas"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, ya pasó otro mes y quiero asegurarme de que todo va según el plan. ¿Podemos hacer un repaso rápido?</p>`, "20px 40px 8px")]),
  divRow("#ede9fe"),
  row([txt(`<p style="font-weight:700;color:#7C3AED;margin:0 0 10px">Agenda de revisión</p>
<p style="color:#555;margin:6px 0">📊&nbsp; Métricas clave vs. objetivos del mes</p>
<p style="color:#555;margin:6px 0">🔍&nbsp; ¿Qué funcionó bien y qué mejorar?</p>
<p style="color:#555;margin:6px 0">🎯&nbsp; Ajustes y prioridades para el próximo período</p>`, "12px 40px")]),
  row([btn("Agendar revisión mensual", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

// F7 — Hito / felicitación
const F7 = design([
  hdr("¡Felicidades por el hito, {{nombre}}! 🏆", "Este logro merece celebrarse", "#D97706"),
  imgRow(PX.trophy, "Trofeo y celebración de logros"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">Hola <strong>{{nombre}}</strong>, hoy quería escribirte para reconocer lo que lograste. No es un hito menor — es el resultado de tu constancia y trabajo.</p>`, "20px 44px 8px", "center")]),
  row([txt(`<p style="font-size:44px;text-align:center;margin:0">🏆</p>
<p style="font-size:22px;font-weight:800;color:#D97706;text-align:center;margin:8px 0 4px">¡Meta alcanzada!</p>
<p style="font-size:14px;color:#888;text-align:center;margin:0">Y esto es solo el comienzo</p>`, "8px 40px 16px", "center")], "#FFFBEB"),
  divRow("#fde68a"),
  row([txt(`<p style="color:#555;text-align:center;margin:0">El siguiente objetivo ya está en el horizonte. ¿Hablamos de cómo superarlo?</p>`, "12px 44px 8px", "center")]),
  row([btn("Definir el próximo objetivo 🎯", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

// ═══════════════════════════════════════════════════════════════════════════════
// NEWSLETTER (7 templates)
// ═══════════════════════════════════════════════════════════════════════════════

// N1 — Clásico con imagen de periódico
const N1 = design([
  hdr("Novedades de este mes 📰", "Lo que importa, resumido para {{nombre}}", "#0F172A"),
  imgRow(PX.newspaper, "Periódico y contenido editorial"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, aquí tienes las novedades más relevantes del mes. Seleccionamos solo lo que realmente vale tu tiempo.</p>`, "20px 40px 8px")]),
  divRow(),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#FF6B35;letter-spacing:2px;margin:0">✦ ARTÍCULO DESTACADO</p>
<p style="font-size:18px;font-weight:700;color:#111;margin:8px 0 6px">Título del artículo más importante del mes</p>
<p style="color:#666;font-size:14px;margin:0">Descripción breve en 2-3 oraciones que explica el valor del contenido y por qué tu lector debería leerlo hoy.</p>`, "12px 40px")]),
  row([btn("Leer artículo completo →", "#0F172A")]),
  divRow(),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#6366F1;letter-spacing:2px;margin:0">💡 CONSEJO DEL MES</p>
<p style="font-size:16px;font-weight:700;color:#111;margin:8px 0 6px">Un tip accionable para implementar esta semana</p>
<p style="color:#666;font-size:14px;margin:0">Tip concreto y aplicable que el lector puede usar sin necesitar contexto adicional.</p>`, "12px 40px")]),
  row([btn("Ver todos los recursos →", "#FF6B35")]),
  divRow(), footer(),
]);

// N2 — Minimalista sin imagen
const N2 = design([
  row([txt(`<p style="font-size:11px;color:#999;letter-spacing:3px;text-align:center;margin:0">NEWSLETTER</p>
<p style="font-size:30px;font-weight:900;color:#111;text-align:center;margin:8px 0 4px">Hola, {{nombre}} 👋</p>
<p style="font-size:14px;color:#888;text-align:center;margin:0">Lo más importante de este mes</p>`, "44px 32px 24px", "center")]),
  row([div("#dddddd")]),
  row([txt(`<p style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">01 — Noticia principal</p>
<p style="color:#555;font-size:15px;margin:0;line-height:1.6">Descripción directa y concisa de la noticia más relevante. Una o dos oraciones que atrapan y dan ganas de saber más.</p>`, "20px 40px 12px")]),
  row([div("#eeeeee")]),
  row([txt(`<p style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">02 — Segunda novedad</p>
<p style="color:#555;font-size:15px;margin:0;line-height:1.6">Otra noticia o actualización importante. Mantén el estilo consistente con el bloque anterior.</p>`, "12px 40px 12px")]),
  row([div("#eeeeee")]),
  row([txt(`<p style="font-size:22px;font-weight:700;color:#111;margin:0 0 8px">03 — Recurso del mes</p>
<p style="color:#555;font-size:15px;margin:0;line-height:1.6">Un recurso útil: guía, herramienta o plantilla que vale la pena compartir con tu audiencia.</p>`, "12px 40px 24px")]),
  row([btn("Ver todo el contenido →", "#111111")]),
  divRow(), footer(),
], "#FFFFFF");

// N3 — Corporativo con oficina
const N3 = design([
  hdr("Noticias de {{empresa}} — {{nombre}}", "Las actualizaciones más importantes de este mes", "#1E40AF"),
  imgRow(PX.office, "Oficina moderna y equipo de trabajo"),
  row([txt(`<p style="color:#555;margin:0">Este mes ha sido especialmente activo. Aquí un resumen de lo más importante que ocurrió en nuestra empresa:</p>`, "20px 40px 8px")]),
  divRow("#bfdbfe"),
  row([txt(`<div style="border-left:4px solid #1E40AF;padding:14px 16px;background:#EFF6FF;border-radius:0 8px 8px 0;margin-bottom:12px">
<p style="font-weight:700;color:#1E40AF;margin:0 0 4px">📢 Anuncio importante</p>
<p style="color:#555;margin:0;font-size:14px">Describe aquí la noticia principal: nuevo servicio, alianza estratégica, expansión o lanzamiento.</p>
</div>
<div style="border-left:4px solid #3B82F6;padding:14px 16px;background:#EFF6FF;border-radius:0 8px 8px 0">
<p style="font-weight:700;color:#3B82F6;margin:0 0 4px">🎉 Logro del mes</p>
<p style="color:#555;margin:0;font-size:14px">Comparte un hito o reconocimiento que haya obtenido la empresa o el equipo este mes.</p>
</div>`, "12px 36px")]),
  row([btn("Ver todas las novedades →", "#1E40AF")]),
  divRow("#bfdbfe"), footer(),
], "#EFF6FF");

// N4 — Tips con imagen
const N4 = design([
  hdr("4 tips del mes para {{nombre}} 💡", "Consejos accionables que puedes usar hoy mismo", "#16A34A"),
  imgRow(PX.tips, "Persona aprendiendo y tomando notas"),
  row([txt(`<p style="color:#555;margin:0">Este mes recopilamos los mejores consejos de nuestro equipo y referentes del sector. Aquí los 4 más valiosos:</p>`, "20px 40px 8px")]),
  divRow("#bbf7d0"),
  row([txt(`<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:12px">1</span>&nbsp; <strong>Primer tip:</strong> Descripción concisa del consejo. Qué hacer exactamente y por qué funciona.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:12px">2</span>&nbsp; <strong>Segundo tip:</strong> Otro consejo práctico y directo al grano. Fácil de implementar.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:12px">3</span>&nbsp; <strong>Tercer tip:</strong> Algo que marca diferencia en el día a día del negocio.</p>
<p style="margin:10px 0"><span style="background:#16A34A;color:#fff;font-weight:700;border-radius:50%;padding:2px 8px;font-size:12px">4</span>&nbsp; <strong>Cuarto tip:</strong> El consejo más valorado por nuestros clientes este mes.</p>`, "12px 36px")]),
  row([btn("Ver más tips y recursos →", "#16A34A")]),
  divRow("#bbf7d0"), footer(),
], "#F0FDF4");

// N5 — Eventos con foto
const N5 = design([
  hdr("Próximos eventos — No te los pierdas 🗓️", "Reserva tu lugar antes de que se agoten", "#7C3AED"),
  imgRow(PX.event, "Conferencia y eventos de networking"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, en las próximas semanas tenemos eventos que no puedes perderte. Aquí el resumen completo:</p>`, "20px 40px 8px")]),
  divRow("#ede9fe"),
  row([txt(`<div style="background:#F5F3FF;border-radius:10px;padding:18px;margin-bottom:12px;border:1px solid #ede9fe">
<p style="font-size:11px;color:#7C3AED;font-weight:700;letter-spacing:1px;margin:0">WEBINAR · DD/MM/AAAA · 7:00 PM</p>
<p style="font-weight:700;color:#111;font-size:16px;margin:6px 0 4px">Título del webinar en línea</p>
<p style="color:#666;font-size:14px;margin:0">Descripción breve: tema, duración y por qué deberías asistir.</p>
</div>
<div style="background:#F5F3FF;border-radius:10px;padding:18px;border:1px solid #ede9fe">
<p style="font-size:11px;color:#7C3AED;font-weight:700;letter-spacing:1px;margin:0">PRESENCIAL · DD/MM/AAAA · Ciudad</p>
<p style="font-weight:700;color:#111;font-size:16px;margin:6px 0 4px">Nombre del taller o evento presencial</p>
<p style="color:#666;font-size:14px;margin:0">Lugar, duración y qué aprenderá el asistente.</p>
</div>`, "12px 36px")]),
  row([btn("Reservar mi lugar →", "#7C3AED")]),
  divRow("#ede9fe"), footer(),
], "#FAF5FF");

// N6 — Métricas y resultados
const N6 = design([
  hdr("Resultados de este mes 📊", "{{nombre}}, los números que importan", "#D97706"),
  imgRow(PX.metrics, "Dashboard de métricas y resultados"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, este mes cerramos con resultados que vale la pena compartir. Aquí el resumen:</p>`, "20px 40px 8px")]),
  row([txt(`<div style="display:flex;gap:8px;flex-wrap:wrap">
<div style="flex:1;min-width:100px;text-align:center;background:#FFFBEB;border-radius:10px;padding:16px;border:1px solid #fde68a">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">+47%</p>
<p style="font-size:12px;color:#666;margin:5px 0 0">Crecimiento</p>
</div>
<div style="flex:1;min-width:100px;text-align:center;background:#FFFBEB;border-radius:10px;padding:16px;border:1px solid #fde68a">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">1,240</p>
<p style="font-size:12px;color:#666;margin:5px 0 0">Nuevos leads</p>
</div>
<div style="flex:1;min-width:100px;text-align:center;background:#FFFBEB;border-radius:10px;padding:16px;border:1px solid #fde68a">
<p style="font-size:32px;font-weight:900;color:#D97706;margin:0">98%</p>
<p style="font-size:12px;color:#666;margin:5px 0 0">Satisfacción</p>
</div>
</div>`, "16px 36px")]),
  divRow("#fde68a"),
  row([txt(`<p style="color:#555;margin:0">El próximo mes queremos superar estos resultados. ¿Hablamos de cómo lograrlo juntos?</p>`, "12px 40px 8px")]),
  row([btn("Ver informe completo →", "#D97706")]),
  divRow("#fde68a"), footer(),
], "#FFFBEB");

// N7 — Digest semanal con imagen de lectura
const N7 = design([
  hdr("Digest semanal 📬", "Lo mejor de la semana para {{nombre}}", "#4338CA"),
  imgRow(PX.reading, "Persona leyendo y aprendiendo"),
  row([txt(`<p style="color:#555;margin:0">Hola <strong>{{nombre}}</strong>, esta semana pasaron cosas importantes en nuestro sector. Aquí lo que no debes perderte:</p>`, "20px 40px 8px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#4338CA;letter-spacing:1px;margin:0">🔥 LO MÁS VISTO</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">El contenido más popular de esta semana</p>
<p style="color:#666;font-size:14px;margin:0">Una o dos oraciones que resumen el contenido y generan curiosidad para leer más.</p>`, "12px 40px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#6366F1;letter-spacing:1px;margin:0">🧠 PARA REFLEXIONAR</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">La idea de la semana</p>
<p style="color:#555;font-size:14px;margin:0;font-style:italic">"Una cita inspiradora o pregunta que haga reflexionar a tus lectores."</p>`, "12px 40px")]),
  divRow("#c7d2fe"),
  row([txt(`<p style="font-size:11px;font-weight:700;color:#818CF8;letter-spacing:1px;margin:0">📌 RECURSO DE LA SEMANA</p>
<p style="font-weight:700;color:#111;font-size:15px;margin:6px 0 4px">Herramienta o guía recomendada</p>
<p style="color:#666;font-size:14px;margin:0">Por qué es útil y cómo puedes usarlo en tu negocio esta semana.</p>`, "12px 40px")]),
  row([btn("Ver todos los recursos →", "#4338CA")]),
  divRow("#c7d2fe"), footer(),
], "#EEF2FF");

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

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
  // Bienvenida
  { id:"w1", category:"Bienvenida", name:"Bienvenida cálida",       description:"Con foto de equipo, lista de beneficios y CTA naranja",    subject:"¡Bienvenido/a, {{nombre}}! 🎉",           color:"#FF6B35", design:W1 },
  { id:"w2", category:"Bienvenida", name:"Bienvenida corporativa",  description:"Foto de apretón de manos, plan de onboarding en 3 pasos",  subject:"Bienvenido/a al equipo, {{nombre}}",       color:"#1E40AF", design:W2 },
  { id:"w3", category:"Bienvenida", name:"Acceso VIP premium",      description:"Imagen oscura de lujo, beneficios exclusivos listados",     subject:"Tu acceso VIP está activo ✦",              color:"#0F172A", design:W3 },
  { id:"w4", category:"Bienvenida", name:"Bienvenida motivadora",   description:"Foto de éxito y celebración, hoja de ruta verde",          subject:"¡Lo lograste, {{nombre}}! 🌱",             color:"#16A34A", design:W4 },
  { id:"w5", category:"Bienvenida", name:"Minimalista tipográfica", description:"Solo tipografía impactante, sin imagen, diseño muy limpio", subject:"Hola, {{nombre}} 👋",                      color:"#111111", design:W5 },
  { id:"w6", category:"Bienvenida", name:"Onboarding paso a paso",  description:"Foto de trabajo + 3 pasos visuales en tarjetas moradas",   subject:"¡Ya eres parte, {{nombre}}! 🎊",           color:"#7C3AED", design:W6 },
  { id:"w7", category:"Bienvenida", name:"Confirmación de cuenta",  description:"Foto de oficina moderna, resumen de datos del usuario",    subject:"Cuenta creada con éxito ✓",               color:"#0D9488", design:W7 },
  // Ventas
  { id:"s1", category:"Ventas",     name:"Oferta flash 24h",        description:"Foto de descuento, gran 40% OFF rojo sobre fondo claro",   subject:"⚡ OFERTA FLASH — 24 horas, {{nombre}}",  color:"#DC2626", design:S1 },
  { id:"s2", category:"Ventas",     name:"Black Friday",            description:"Header negro dramático + foto de shopping + 50% OFF",      subject:"50% OFF — La mayor oferta del año 🖤",    color:"#111111", design:S2 },
  { id:"s3", category:"Ventas",     name:"Lanzamiento de producto", description:"Foto de laptop + lista de novedades en morado vibrante",   subject:"🚀 Nuevo lanzamiento, {{nombre}}",         color:"#7C3AED", design:S3 },
  { id:"s4", category:"Ventas",     name:"Propuesta de valor",      description:"Foto de métricas + 3 bloques de KPIs con porcentajes",     subject:"Tu inversión multiplicada 📈",             color:"#16A34A", design:S4 },
  { id:"s5", category:"Ventas",     name:"Cupón de descuento",      description:"Foto de regalo + cupón visual con borde punteado ámbar",   subject:"🎁 Tu cupón exclusivo, {{nombre}}",        color:"#D97706", design:S5 },
  { id:"s6", category:"Ventas",     name:"Urgencia de cierre",      description:"Foto de reloj + escasez de cupos en índigo intenso",       subject:"Últimos cupos disponibles 🗓️",             color:"#4338CA", design:S6 },
  { id:"s7", category:"Ventas",     name:"Propuesta personalizada", description:"Foto de reunión + desglose de lo que incluye la oferta",   subject:"Una propuesta solo para ti, {{nombre}}",  color:"#475569", design:S7 },
  // Seguimiento
  { id:"f1", category:"Seguimiento",name:"Resumen de reunión",      description:"Foto de sala + puntos tratados y próximos pasos en azul",  subject:"Resumen de nuestra reunión, {{nombre}}",  color:"#1E40AF", design:F1 },
  { id:"f2", category:"Seguimiento",name:"Propuesta enviada",       description:"Foto de documentos + desglose detallado en verde agua",    subject:"Tu propuesta está lista 📄",               color:"#0D9488", design:F2 },
  { id:"f3", category:"Seguimiento",name:"Reactivación amigable",   description:"Foto de café + caja de novedad relevante en naranja",      subject:"{{nombre}}, ¿todo bien por ahí? ☕",       color:"#FF6B35", design:F3 },
  { id:"f4", category:"Seguimiento",name:"Último recordatorio",     description:"Diseño limpio con caja de pregunta, tono discreto slate",  subject:"Un último mensaje, {{nombre}}",            color:"#475569", design:F4 },
  { id:"f5", category:"Seguimiento",name:"Cierre y agradecimiento", description:"Foto de celebración + logros alcanzados en verde",         subject:"¡Gracias, {{nombre}}! 🙌",                 color:"#16A34A", design:F5 },
  { id:"f6", category:"Seguimiento",name:"Check-in mensual",        description:"Foto de revisión + agenda de métricas en morado",          subject:"Revisemos tus avances 📊",                 color:"#7C3AED", design:F6 },
  { id:"f7", category:"Seguimiento",name:"Celebración de hito",     description:"Foto de trofeo + bloque de meta alcanzada en ámbar",       subject:"¡Felicidades por el hito, {{nombre}}! 🏆", color:"#D97706", design:F7 },
  // Newsletter
  { id:"n1", category:"Newsletter", name:"Newsletter clásico",      description:"Foto de periódico + sección destacada + consejo del mes",  subject:"Novedades de este mes 📰",                 color:"#0F172A", design:N1 },
  { id:"n2", category:"Newsletter", name:"Newsletter minimalista",  description:"Solo tipografía, 3 artículos numerados, fondo blanco puro",subject:"Lo más importante de este mes, {{nombre}}",color:"#111111", design:N2 },
  { id:"n3", category:"Newsletter", name:"Noticias corporativas",   description:"Foto de oficina + dos bloques de anuncio y logro azul",    subject:"Noticias de {{empresa}} este mes",         color:"#1E40AF", design:N3 },
  { id:"n4", category:"Newsletter", name:"Tips y consejos",         description:"Foto de aprendizaje + 4 tips numerados en verde",          subject:"4 tips del mes para {{nombre}} 💡",        color:"#16A34A", design:N4 },
  { id:"n5", category:"Newsletter", name:"Eventos próximos",        description:"Foto de conferencia + 2 tarjetas de eventos en morado",    subject:"Próximos eventos — no te los pierdas 🗓️",  color:"#7C3AED", design:N5 },
  { id:"n6", category:"Newsletter", name:"Resultados y métricas",   description:"Foto de dashboard + 3 bloques de KPIs en ámbar dorado",    subject:"Resultados de este mes 📊",                color:"#D97706", design:N6 },
  { id:"n7", category:"Newsletter", name:"Digest semanal",          description:"Foto de lectura + 3 secciones: popular, reflexión, recurso",subject:"Digest semanal 📬",                       color:"#4338CA", design:N7 },
];

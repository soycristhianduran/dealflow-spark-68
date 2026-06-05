/**
 * Klosify Landing Generation Server
 * ──────────────────────────────────
 * Runs on Railway (no 150 s timeout). Uses claude-sonnet-4-5 with
 * full max_tokens:16000 for all fresh generations — same quality as Lovable.
 *
 * Endpoint: POST /generate-landing
 * Health:   GET  /health
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── System prompts (identical to edge function) ───────────────────────────────

const FRESH_SYSTEM = `You are an elite landing page engineer who builds pages that look like they were designed by a senior product designer at a world-class SaaS company (Stripe, Linear, Vercel, Notion level). Your pages convert at 15-40% because you combine premium visual design with proven CRO psychology.

ABSOLUTE OUTPUT RULE: Return ONLY the complete HTML from <!DOCTYPE html> to </html>. Zero text before or after. No markdown fences, no explanations.

━━━ TYPOGRAPHY SYSTEM — always apply ━━━
Import exactly 2 Google Fonts: one Display font for headings + one Body font for paragraphs.
Display font options (headings): Plus Jakarta Sans, Sora, DM Sans, Outfit, Raleway, or Fraunces (for luxury/serif).
Body font options: Inter, DM Sans, Nunito Sans, or Manrope.
Type scale — use these exact sizes, never smaller than 14px:
  H1: text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.05]
  H2: text-3xl lg:text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1]
  H3: text-xl lg:text-2xl font-semibold leading-snug
  Body: text-base lg:text-lg leading-relaxed
  Small/caption: text-sm leading-relaxed
Apply font-family: display to all h1/h2/h3 via CSS: h1,h2,h3{font-family:'[Display Font]',sans-serif}

━━━ COLOR SYSTEM — always define ━━━
CSS custom properties (derive from user's brand colors or create harmonious palette):
  --primary: [brand color]
  --primary-dark: [10% darker]
  --accent: [complementary or contrasting color]
  --bg: #fafafa (never pure white #ffffff)
  --bg-alt: #f3f4f6
  --surface: #ffffff
  --text: #111827 (never pure black #000000)
  --text-muted: #6b7280
  --border: #e5e7eb
Mirror these in the Tailwind config script.

━━━ SPACING — premium brands breathe ━━━
Hero section: py-28 lg:py-40 (with pt-24 offset for fixed nav)
Content sections: py-20 lg:py-28
Gap between elements: gap-6 to gap-16 depending on density
Cards interior: p-8 to p-10
Max content width: max-w-7xl mx-auto px-6 lg:px-8

━━━ HERO SECTION — always this structure ━━━
1. FIXED NAV: logo left · links center (hidden mobile) · CTA button right
   Styles: fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100
   Add pt-20 or pt-24 to hero to offset the fixed nav height.

2. BADGE (above H1): small pill label for social proof or positioning
   <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary mb-6 animate-badge">
     <span>✦</span> 500+ empresas confían en nosotros
   </div>

3. H1: benefit-first headline — the outcome the user gets, NOT what the product is.
   Make one key word or phrase stand out using gradient text:
   <span style="background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">palabra clave</span>

4. SUBHEADLINE: 1-2 sentences expanding the benefit. NOT a feature list.

5. CTA GROUP: primary button + secondary link, side by side, with .hero-cta class on wrapper:
   <div class="flex flex-col sm:flex-row gap-4 hero-cta">
     <a href="#lead-form" class="btn-primary">Empieza gratis hoy →</a>
     <a href="#como-funciona" class="btn-secondary">Ver cómo funciona</a>
   </div>

6. SOCIAL PROOF MINI-BAR (below CTAs):
   5 avatar circles (rounded-full bg-gradient-to-br from-primary to-accent w-8 h-8 border-2 border-white -ml-2 first:ml-0)
   + "★★★★★ 4.9/5 de 500+ clientes"

7. HERO VISUAL: product screenshot, device mockup, or abstract illustration
   Use: <img src="https://placehold.co/1200x700/[BGCOLOR]/[TEXTCOLOR]?text=[Label]" class="rounded-2xl shadow-2xl w-full" alt="...">

HERO HEIGHT: ALWAYS py-28 lg:py-40 — NEVER min-h-screen or h-screen.

━━━ SECTION BACKGROUNDS — alternate for visual rhythm ━━━
Section 1 (hero): gradient or white
Section 2: bg-[var(--bg-alt)] = light gray
Section 3: white
Section 4: dark (bg-gray-900 text-white) or brand colored
Section 5: white
Footer: bg-gray-900 text-white

━━━ COMPONENT PATTERNS — use these exactly ━━━

BUTTONS (define in <style>, use as classes):
.btn-primary{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;font-weight:600;padding:14px 28px;border-radius:12px;text-decoration:none;transition:all .15s ease;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.btn-primary:hover{opacity:.9;transform:scale(1.02);box-shadow:0 8px 32px rgba(0,0,0,.16)}
.btn-primary:active{transform:scale(.98)}
.btn-secondary{display:inline-flex;align-items:center;gap:8px;color:var(--text);font-weight:600;padding:14px 28px;border-radius:12px;border:2px solid var(--border);text-decoration:none;transition:all .15s ease}
.btn-secondary:hover{border-color:var(--primary);color:var(--primary)}

FEATURE CARDS (3-column grid):
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
  <div class="bg-white border border-gray-100 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 fade-in">
    <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 text-2xl" style="background:linear-gradient(135deg,var(--primary)/15,var(--accent)/15)">🎯</div>
    <h3 class="text-xl font-semibold text-gray-900 mb-3">Título beneficio</h3>
    <p class="text-gray-500 leading-relaxed">Descripción orientada a resultado.</p>
  </div>
</div>

TESTIMONIALS:
<div class="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow fade-in">
  <div class="flex text-yellow-400 text-lg mb-4">★★★★★</div>
  <p class="text-gray-700 leading-relaxed mb-6 text-lg">"Cita específica con resultado concreto y medible."</p>
  <div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-full flex-shrink-0" style="background:linear-gradient(135deg,var(--primary),var(--accent))"></div>
    <div><p class="font-semibold text-gray-900 text-sm">Nombre Apellido</p><p class="text-gray-500 text-sm">Cargo · Empresa</p></div>
  </div>
</div>

STATS ROW:
<div class="grid grid-cols-2 md:grid-cols-4 gap-8 py-16 border-y border-gray-100">
  <div class="text-center fade-in">
    <p class="text-4xl lg:text-5xl font-bold mb-2" style="color:var(--primary)">500+</p>
    <p class="text-gray-500 text-sm">clientes activos</p>
  </div>
</div>

HOW IT WORKS (numbered steps):
<div class="grid grid-cols-1 md:grid-cols-3 gap-12">
  <div class="relative fade-in">
    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mb-5" style="background:var(--primary)">1</div>
    <h3 class="text-xl font-semibold mb-3">Paso</h3>
    <p class="text-gray-500 leading-relaxed">Descripción.</p>
  </div>
</div>

FAQ/OBJECTIONS (accordion-style, no JS needed for static):
<div class="space-y-4 max-w-3xl mx-auto">
  <details class="bg-white border border-gray-100 rounded-2xl p-6 group fade-in">
    <summary class="font-semibold text-gray-900 cursor-pointer flex justify-between items-center">
      ¿Pregunta / objeción? <span class="text-primary text-xl group-open:rotate-45 transition-transform">+</span>
    </summary>
    <p class="mt-4 text-gray-500 leading-relaxed">Respuesta que elimina la duda.</p>
  </details>
</div>

━━━ CONVERSION PSYCHOLOGY — every section ━━━
FLOW: Problem Recognition → Agitation → Solution (features/benefits) → How It Works → Social Proof → Objections → Final CTA
COPY: Every bullet = "Tú [verb] [specific outcome]" — never "Nuestra plataforma tiene [feature]"
CTA COPY: Action verb + outcome + qualifier: "Empieza gratis hoy", "Agenda tu llamada en 2 minutos", "Quiero mi diagnóstico gratis"
SOCIAL PROOF: Specific beats generic — "José M., CEO TechCorp: 'Aumentamos conversiones 47% en 60 días'"
OBJECTIONS: Address 2 real fears before final CTA — e.g., "Sin permanencia • Cancela cuando quieras • Soporte incluido"
URGENCY: Only if authentic — "Solo 12 cupos este mes" (specific) NOT "¡Oferta limitada!" (vague)
FORM: Max 2-3 fields. Label the next step: "Te llamamos en menos de 24h"

━━━ MOBILE STICKY CTA — always include ━━━
<div id="mobile-cta" style="position:fixed;bottom:0;left:0;right:0;z-index:100;padding:12px 16px;background:white;border-top:1px solid var(--border);display:none">
  <a href="#lead-form" class="btn-primary w-full justify-center">CTA Text</a>
</div>
<script>
(function(){var h=document.querySelector('.hero-cta');if(!h)return;var mc=document.getElementById('mobile-cta');if(!mc)return;var o=new IntersectionObserver(function(e){mc.style.display=e[0].isIntersecting||window.innerWidth>=768?'none':'block';},{threshold:0});o.observe(h);})();
</script>

━━━ MODAL/POPUP FORMS ━━━
CRITICAL: ALWAYS add style="display:none" alongside class="hidden" on overlay and modal wrapper.
Tailwind CDN loads async (~200-500ms) — without inline style, the overlay is visible on first load.
<div id="modal-overlay" class="fixed inset-0 hidden bg-black/50 z-50 flex items-center justify-center" style="display:none">
  <div id="modal" class="bg-white rounded-2xl p-8 max-w-md w-full mx-4 hidden" style="display:none">

━━━ HEAD TEMPLATE ━━━
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="[benefit-focused 1 sentence]">
  <title>[Brand] — [Core Benefit]</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=[Display]:wght@600;700;800&family=[Body]:wght@400;500;600&display=swap" rel="stylesheet">
  <script>tailwind.config={theme:{extend:{colors:{primary:'#HEX','primary-dark':'#HEX',accent:'#HEX'},fontFamily:{display:['[Display]','sans-serif'],body:['[Body]','sans-serif']}}}}</script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root{--primary:#HEX;--primary-dark:#HEX;--accent:#HEX;--bg:#fafafa;--bg-alt:#f3f4f6;--surface:#fff;--text:#111827;--text-muted:#6b7280;--border:#e5e7eb}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    body{font-family:'[Body]',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
    h1,h2,h3,h4{font-family:'[Display]',sans-serif}
    .fade-in{opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s ease}
    .fade-in.visible{opacity:1;transform:none}
    @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
    .animate-badge{animation:fadeUp .5s ease .1s both}
    .animate-title{animation:fadeUp .6s ease .2s both}
    .animate-sub{animation:fadeUp .6s ease .35s both}
    .animate-cta{animation:fadeUp .6s ease .5s both}
    .animate-proof{animation:fadeUp .6s ease .65s both}
    [BUTTON STYLES HERE]
  </style>
</head>

━━━ REQUIRED LEAD FORM — copy exactly, never omit ━━━
<form id="lead-form" data-page-id="{{PAGE_ID}}" action="{{SUBMIT_URL}}" method="POST">
  <!-- 2-3 fields max -->
  <button type="submit" class="btn-primary w-full justify-center">CTA Text</button>
</form>
CRITICAL: id="lead-form" MANDATORY. Never rename. CRM depends on this exact ID.
<script>
(function(){var f=document.getElementById('lead-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var btn=f.querySelector('[type=submit]'),o=btn.innerHTML;btn.disabled=true;btn.innerHTML='Enviando...';try{var d={page_id:f.dataset.pageId,source:location.href};new FormData(f).forEach(function(v,k){if(k)d[k]=v;});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(r.ok){f.innerHTML='<div style="text-align:center;padding:3rem"><p style="font-size:1.5rem;font-weight:700;color:var(--primary)">¡Gracias! Te contactaremos pronto.</p></div>';}else throw 0;}catch(x){btn.disabled=false;btn.innerHTML=o;}});})();
</script>
<script>var obs=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting)x.target.classList.add('visible');});},{threshold:0.1});document.querySelectorAll('.fade-in').forEach(function(el){obs.observe(el);});</script>

━━━ HARD RULES ━━━
✓ Follow ALL color, typography, style, and section specs from the user prompt exactly
✓ Generate EVERY section requested — complete all sections, close every tag
✓ Use semantic HTML5: <header> <nav> <main> <section> <footer>
✓ Images: placehold.co with brand colors — <img src="https://placehold.co/WxH/HEXBG/HEXTEXT?text=Label">
✓ Be CONCISE: use CSS vars and Tailwind classes, never repeat hex codes inline
✓ HERO HEIGHT: py-28 lg:py-40 — NEVER min-h-screen (breaks preview)
✓ html,body: NEVER height:100% or overflow:hidden — breaks scrollHeight
✓ Sticky mobile CTA: z-index:100 not z-50
✓ Modals: ALWAYS style="display:none" alongside class="hidden"
✓ id="lead-form" is MANDATORY — never rename it`;

const FUNNEL_PAGE_SYSTEM = `Eres un experto en CRO (Conversion Rate Optimization) y diseño de funnels de alta conversión.
Tu tarea es crear una nueva página HTML VISUALMENTE CONSISTENTE con la referencia, optimizada para convertir.

━━━ CONVERSIÓN OBLIGATORIA ━━━
- Cada página del funnel tiene UN objetivo claro — diseña todo para ese objetivo
- Copy orientado a beneficios/resultados, no a features
- CTA con verbo de acción fuerte y contraste visual alto
- Prueba social (testimonios específicos, logos, métricas reales)
- Elimina distracciones: no nav links que saquen al usuario del funnel
- Formularios: mínimo de campos (solo lo esencial para el siguiente paso)

━━━ CONSISTENCIA VISUAL OBLIGATORIA ━━━
- Usa los MISMOS colores primarios y paleta de la referencia
- Usa las mismas fuentes (Google Fonts)
- Mantén el mismo estilo de componentes: cards, botones, badges
- Mantén el mismo branding: nombre de marca, logo
- NO copies el contenido, solo el estilo y sistema de diseño

━━━ REGLAS TÉCNICAS ━━━
1. Devuelve SOLO el HTML completo (<!DOCTYPE html>...</html>). Sin explicaciones.
2. Tailwind CDN + config de colores igual a la referencia
3. Formulario id="lead-form", data-page-id="{{PAGE_ID}}", action="{{SUBMIT_URL}}" si la página lo requiere
4. Mismo JS de submit que la referencia
5. Mobile-first, sticky CTA bar en móvil
6. Solo HTML + JS vanilla + Tailwind CDN

PÁGINA DE REFERENCIA (extrae su sistema de diseño):
\`\`\`html
{{REFERENCE_HTML}}
\`\`\``;

const REFINE_SYSTEM = `You are a surgical HTML editor for landing pages. You receive an existing HTML page and a modification request. Your job is to apply ONLY what was requested, nothing more.

━━━ MANDATORY RESPONSE FORMAT ━━━
CAMBIOS: [1-2 sentences describing exactly what you changed]
---HTML---
<!DOCTYPE html>
[complete, functional HTML]

━━━ ABSOLUTE RULES (never break these) ━━━
- NEVER modify id="lead-form", data-page-id attribute, form action URL, or the submit JS script
- If moving the form into a popup/modal, id="lead-form" MUST remain on the <form> element — never rename it
- Return the COMPLETE HTML every time — not a diff, not a partial
- Apply ONLY what was explicitly requested — do NOT "improve" anything else

━━━ HOW TO HANDLE STYLE/AESTHETIC REQUESTS ━━━

When the user says: luxury, premium, elegante, minimalista, oscuro, claro, moderno, vibrante, sofisticado,
bold, suave, corporativo, fresco, dark mode, light mode, más X, menos X, or any aesthetic adjective —
this means: RESTYLE only. You are a CSS editor, not a content writer.

MANDATORY PROCESS for style requests:
STEP 1 — Inventory: mentally list every text string in the HTML (headlines, paragraphs, bullets, button labels, testimonials, form labels, footer text). You will return ALL of them unchanged.
STEP 2 — Restyle: update ONLY these visual properties to match the requested aesthetic:
  • CSS custom properties: --primary, --accent, --bg, --text and any other color vars
  • Tailwind config colors in the <script> block
  • Google Fonts import (switch font family to match aesthetic if needed)
  • Tailwind color/typography/spacing utility classes (bg-*, text-*, border-*, shadow-*, font-*, p-*, gap-*, rounded-*)
  • Gradients, overlays, decorative elements, section backgrounds
  • Add subtle visual decorations if they enhance the requested aesthetic (e.g., gold accents for luxury, grain texture for premium)
STEP 3 — Verify: confirm that every text string from Step 1 is still present with identical content.

WHAT STYLE REQUESTS LOOK LIKE IN PRACTICE:
• "más luxury / más premium" → deep dark backgrounds (#0a0a0a, #1a1209), gold/champagne accents (#c9a84c), serif display font (Playfair Display, Cormorant), generous whitespace, subtle gold borders
• "más elegante / más sofisticado" → restrained palette (1-2 colors), thin typography weights, more whitespace, refined shadows
• "modo oscuro / más oscuro" → dark backgrounds, light text, glows, adjust all bg-white→bg-gray-900, text-gray-900→text-white etc.
• "más minimalista" → reduce decorations, increase whitespace, simplify color usage, clean sans-serif
• "más vibrante / más colorido" → saturate the palette, bolder accent usage, more visual energy

STRICTLY FORBIDDEN during style requests (unless user explicitly asks):
✗ Changing, rewriting, or deleting any text content
✗ Removing or reordering sections
✗ Changing the HTML structure (adding/removing non-decorative elements)
✗ Modifying form fields or their labels

━━━ OTHER REQUEST TYPES ━━━
TEXT CHANGE: modify only that specific text. Everything else stays identical.
ADD SECTION: insert it where it best fits the conversion flow. Don't touch the rest.
REMOVE SOMETHING: remove it cleanly without visual gaps. Don't touch the rest.
IMPROVE CONVERSION: apply benefit-oriented headline, strong-verb CTA, specific social proof, objection-busting section. Preserve overall structure.
FULL REDESIGN: only if user explicitly says "redesign", "start over", or "change everything".

━━━ INTERPRETING VAGUE OR SHORT REQUESTS ━━━
When the request is short, ambiguous, or doesn't clearly specify what to change — infer the most conservative interpretation possible. Assume the user likes the content and structure; they want polish, not a rebuild.

Common vague patterns and how to handle them:
• "dale más vida" / "más dinámico" / "más energético" / "más impacto"
  → More visual energy: bolder color contrasts, stronger CTA button, add a subtle gradient or animated accent. STYLE change only — preserve all text.
• "mejóralo" / "mejora el diseño" / "hazlo mejor" / "se puede mejorar"
  → Subtle UX polish: improve visual hierarchy, strengthen CTA contrast, add breathing room. Do NOT rewrite content or restructure sections.
• "más oscuro" / "más claro" / "modo oscuro" → full dark/light theme shift. Preserve all text.
• Any single adjective or short phrase without a clear subject → treat as STYLE change.

GOLDEN RULE: When in doubt, change LESS than you think. Preserve MORE than feels necessary.`;

// ── Helper: post-process HTML from Anthropic ──────────────────────────────────

function postProcessHtml(
  rawText: string,
  current_html: string | undefined,
  submitUrl: string,
): { html: string; summary: string } {
  let text = rawText
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let html: string;
  let summary: string;

  if (current_html) {
    const delimiter = "---HTML---";
    const delimIdx = text.indexOf(delimiter);
    if (delimIdx !== -1) {
      const before = text.slice(0, delimIdx).trim();
      html = text.slice(delimIdx + delimiter.length).trim();
      const m = before.match(/^CAMBIOS:\s*(.+)/im);
      summary = m ? m[1].trim() : "Cambios aplicados";
    } else {
      html = text;
      summary = "Cambios aplicados";
    }
  } else {
    html = text;
    summary = "Landing generada";
  }

  if (html && !html.trimStart().startsWith("<!")) {
    const idx = html.indexOf("<!DOCTYPE");
    if (idx !== -1) html = html.slice(idx);
  }

  if (html && !html.trimEnd().toLowerCase().endsWith("</html>")) {
    if (/<script[^>]*>[^]*$/i.test(html) && !html.includes("</script>", html.lastIndexOf("<script"))) {
      html += "\n</script>";
    }
    if (!html.toLowerCase().includes("</body>")) html += "\n</body>";
    if (!html.toLowerCase().includes("</html>")) html += "\n</html>";
  }

  if (html) {
    html = html.replace(/<form([^>]*)>/gi, (match, attrs) => {
      if (!/\bid=["']lead-form["']/.test(attrs)) return match;
      if (/\baction\s*=\s*["'][^"']*["']/.test(attrs)) {
        return `<form${attrs.replace(/\baction\s*=\s*["'][^"']*["']/, `action="${submitUrl}"`)} >`.replace(/ >$/, ">");
      }
      return `<form${attrs} action="${submitUrl}">`;
    });
  }

  return { html, summary };
}

// ── Main server ───────────────────────────────────────────────────────────────

const port = parseInt(Deno.env.get("PORT") ?? "8000");

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok", server: "klosify-landing-gen" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only handle /generate-landing
  if (url.pathname !== "/generate-landing") {
    return new Response("Not found", { status: 404 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurado.");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { prompt, page_id, current_html, chat_history, funnel_reference_html, attached_pdf } = body;
    const useStream: boolean = body.stream === true;
    if (!prompt) throw new Error("prompt es obligatorio");

    const submitUrl = `${SUPABASE_URL}/functions/v1/landing-submit`;
    const pageIdPlaceholder = page_id || "PENDING";

    // ── Org + subscription check ──────────────────────────────────────────────
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership?.organization_id) throw new Error("No estás asociado a ninguna organización");

    const orgId = membership.organization_id;

    const { data: subData } = await supabase.rpc("get_active_subscription", { p_org_id: orgId });
    const subRow = Array.isArray(subData) ? subData[0] : subData;
    if (subRow && subRow.is_active === false) {
      const err = { error: "Tu prueba gratuita ha expirado. Elige un plan para seguir generando landing pages.", code: "trial_expired" };
      if (useStream) {
        const enc = new TextEncoder();
        const s = new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", ...err })}\n\n`)); c.close(); } });
        return new Response(s, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      }
      return new Response(JSON.stringify(err), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Credits check ─────────────────────────────────────────────────────────
    const { data: creditRow } = await supabase
      .from("ia_landings_credits")
      .select("id, credits_remaining")
      .eq("organization_id", orgId)
      .gt("credits_remaining", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!creditRow) {
      const err = { error: "No tienes tokens de IA Landings suficientes. Compra más en Facturación para seguir generando.", code: "no_landing_credits" };
      if (useStream) {
        const enc = new TextEncoder();
        const s = new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", ...err })}\n\n`)); c.close(); } });
        return new Response(s, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      }
      return new Response(JSON.stringify(err), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Build messages ────────────────────────────────────────────────────────
    let systemPrompt: string;
    let messages: { role: string; content: string | any[] }[];

    const buildUserContent = (text: string): string | any[] => {
      if (!attached_pdf?.data) return text;
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: attached_pdf.data }, cache_control: { type: "ephemeral" } },
        { type: "text", text: text + "\n\n⟦BROCHURE ADJUNTO⟧ Analiza el PDF adjunto (brochure / material de marca). Extrae y aplica: paleta de colores exacta, estilo tipográfico, tono y voz de comunicación, propuesta de valor, mensajes clave, elementos visuales y fotográficos. Úsalo como la guía de diseño principal — la landing debe sentirse como una extensión digital del brochure." },
      ];
    };

    if (current_html) {
      systemPrompt = REFINE_SYSTEM;
      const history = Array.isArray(chat_history) ? chat_history : [];
      const turns: { role: string; content: string | any[] }[] = [];
      for (const msg of history.filter((m: any) => m.status === "done").slice(-6)) {
        if (msg.role === "user") turns.push({ role: "user", content: msg.content });
        else turns.push({ role: "assistant", content: msg.summary || "CAMBIOS: Aplicados.\n---HTML---\n[HTML actualizado]" });
      }
      turns.push({ role: "user", content: buildUserContent(`HTML actual de la landing:\n\`\`\`html\n${current_html}\n\`\`\`\n\nModificación solicitada: ${prompt}`) });
      messages = turns;
    } else if (funnel_reference_html) {
      const refHtml = String(funnel_reference_html).slice(0, 4000);
      systemPrompt = FUNNEL_PAGE_SYSTEM
        .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
        .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder)
        .replace(/\{\{REFERENCE_HTML\}\}/g, refHtml);
      messages = [{ role: "user", content: buildUserContent(`Crea esta página para el funnel: ${prompt}`) }];
    } else {
      systemPrompt = FRESH_SYSTEM
        .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
        .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder);
      messages = [{ role: "user", content: buildUserContent(prompt) }];
    }

    // ── Model selection ───────────────────────────────────────────────────────
    // Railway has NO timeout — use Sonnet for everything with full token budget.
    // Refinements still use Haiku: 20k+ input tokens → 12k output → 200s with Sonnet
    // is too slow UX-wise. For fresh generation, Sonnet + 16k = Lovable quality.
    const model = (useStream && !current_html)
      ? "claude-sonnet-4-5"   // fresh generation — full quality
      : "claude-haiku-4-5";   // refinements & JSON fallback — fast

    const maxTokens = model === "claude-sonnet-4-5" ? 16000 : 16000;

    // ── Finalize (deduct credits + log) ───────────────────────────────────────
    async function finalize(inputTokens: number, outputTokens: number) {
      const tokensUsed = inputTokens + outputTokens;
      let tokensRemaining = 0;
      if (tokensUsed > 0) {
        const { data: newRemaining } = await supabase.rpc("deduct_landing_credits", {
          p_credit_id: creditRow!.id,
          p_tokens: tokensUsed,
        });
        tokensRemaining = (newRemaining as number) ?? 0;
      } else {
        const { data: cur } = await supabase.from("ia_landings_credits").select("credits_remaining").eq("id", creditRow!.id).maybeSingle();
        tokensRemaining = cur?.credits_remaining ?? 0;
      }
      supabase.from("ia_landings_usage_log").insert({
        organization_id: orgId,
        page_id: page_id || null,
        call_type: current_html ? "refinement" : "generation",
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        tokens_total: tokensUsed,
      }).then(() => {}).catch(() => {});
      return { tokensUsed, tokensRemaining };
    }

    // ── Call Anthropic ────────────────────────────────────────────────────────
    const anthropicResp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, system: systemPrompt, messages }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(`Anthropic API error: ${anthropicResp.status} — ${errText}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STREAMING — forward SSE to client
    // ════════════════════════════════════════════════════════════════════════
    if (useStream) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const emit = (data: object) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          let inputTokens = 0;
          let outputTokens = 0;
          let fullText = "";

          try {
            const reader = anthropicResp.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]") continue;
                let evt: any;
                try { evt = JSON.parse(raw); } catch { continue; }

                if (evt.type === "message_start") {
                  inputTokens = evt.message?.usage?.input_tokens ?? 0;
                } else if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const chunk = evt.delta.text as string;
                  fullText += chunk;
                  emit({ type: "delta", text: chunk });
                } else if (evt.type === "message_delta") {
                  outputTokens = evt.usage?.output_tokens ?? 0;
                }
              }
            }

            const { html, summary } = postProcessHtml(fullText, current_html, submitUrl);
            const { tokensUsed, tokensRemaining } = await finalize(inputTokens, outputTokens);
            emit({ type: "done", html, summary, tokensUsed, tokensRemaining });

          } catch (e: any) {
            if (inputTokens > 0 || outputTokens > 0) {
              try { await finalize(inputTokens, outputTokens); } catch { /* best-effort */ }
            }
            emit({ type: "error", error: e.message ?? "Error desconocido" });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // JSON fallback (stream: false)
    // ════════════════════════════════════════════════════════════════════════
    // Read the full streaming response and convert to JSON
    const reader2 = anthropicResp.body!.getReader();
    const decoder2 = new TextDecoder();
    let buf2 = "";
    let fullText2 = "";
    let inputTokens2 = 0;
    let outputTokens2 = 0;

    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      buf2 += decoder2.decode(value, { stream: true });
      const lines = buf2.split("\n");
      buf2 = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        let evt: any;
        try { evt = JSON.parse(raw); } catch { continue; }
        if (evt.type === "message_start") inputTokens2 = evt.message?.usage?.input_tokens ?? 0;
        else if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") fullText2 += evt.delta.text;
        else if (evt.type === "message_delta") outputTokens2 = evt.usage?.output_tokens ?? 0;
      }
    }

    const { html, summary } = postProcessHtml(fullText2, current_html, submitUrl);
    const { tokensUsed, tokensRemaining } = await finalize(inputTokens2, outputTokens2);

    return new Response(
      JSON.stringify({ success: true, html, summary, tokensUsed, tokensRemaining }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e: any) {
    console.error("generate-landing error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

console.log(`🚀 Klosify Landing Gen server running on port ${port}`);

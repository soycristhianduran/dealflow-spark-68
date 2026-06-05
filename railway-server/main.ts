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

const FRESH_SYSTEM = `You are an elite conversion-rate optimizer AND landing page engineer.
Your landing pages consistently achieve 15-40% conversion rates because you apply proven CRO psychology to every design decision.

ABSOLUTE OUTPUT RULE: Return ONLY the HTML from <!DOCTYPE html> to </html>. Zero text outside HTML tags.

━━━ CONVERSION PSYCHOLOGY — apply to every page ━━━
STRUCTURE: Follow Problem → Agitation → Solution → Proof → Objections → CTA flow (PAS+).
HERO (above fold): Benefit-first headline (the outcome the user gets, not what the product is). One dominant CTA. One trust signal.
COPY: Benefit bullets = "Tú obtienes [resultado concreto]", never "Nuestra plataforma tiene [feature]".
CTA COPY: Strong action verbs + outcome: "Agenda tu consulta gratuita", "Quiero mi diagnóstico gratis" — never "Enviar" or "Contactar".
CTA BUTTON: Always high-contrast — visually distinct from brand primary color. Large, with breathing room.
SOCIAL PROOF: Specific testimonials (Name · Role/Company · concrete measurable result). Trust logos. Star ratings. Client counts.
OBJECTION BUSTING: Identify the top 2 objections the target audience has and address them before the final CTA.
URGENCY/SCARCITY: Include only if authentic to the business (limited spots, deadline, launch offer). Never fake it.
FORM FRICTION: Ask only what's essential. 2-3 fields max. Label what happens after submit ("Te llamamos en menos de 24h").
TRUST SIGNALS: Money-back guarantees, certifications, years of experience, media mentions, security badges where relevant.
MOBILE: Always include a sticky bottom CTA bar for mobile (fixed bottom-0, full-width, high contrast, z-50).

━━━ UX LAYOUT RULES ━━━
Visual hierarchy: size → weight → color → whitespace. Guide the eye deliberately.
Whitespace: generous padding between sections = premium brand perception and better readability.
F/Z reading pattern: critical info top-left, important elements along natural eye path.
Section rhythm: alternate light/dark or neutral/colored backgrounds to create visual breathing.
Images: use placehold.co with brand colors and descriptive text — <img src="https://placehold.co/WxH/BGCOLOR/TEXTCOLOR?text=Label">

━━━ TECHNICAL REQUIREMENTS ━━━
HEAD must include:
- <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
- Google Fonts (1-2 fonts matching the brand)
- <script>tailwind.config={theme:{extend:{colors:{primary:'#HEX',accent:'#HEX'}}}}</script>
- <script src="https://cdn.tailwindcss.com"></script>
- <style> with: CSS vars (--primary,--accent,--bg,--text), scroll-behavior:smooth, .fade-in + fade-in-up @keyframes, .fade-in.visible{opacity:1;transform:none}

MODAL/POPUP FORMS — when the prompt asks for a form inside a popup or modal:
CRITICAL: The modal wrapper and its overlay MUST have BOTH a Tailwind class AND an inline style to start hidden:
  <div id="modal-overlay" class="fixed inset-0 hidden ..." style="display:none">  ← REQUIRED: style="display:none"
  <div id="modal" class="... hidden" style="display:none">                         ← REQUIRED: style="display:none"
Reason: Tailwind CDN loads asynchronously (~200–500ms). Before it loads, class="hidden" has NO effect.
Without inline style="display:none", the overlay is VISIBLE and covers the entire page on first load.
JavaScript opens the modal by setting style.display='flex' (or removing the style). This overrides both.
NEVER rely on class="hidden" alone for modal visibility — always pair it with style="display:none".

REQUIRED LEAD FORM — copy exactly, never omit:
<form id="lead-form" data-page-id="{{PAGE_ID}}" action="{{SUBMIT_URL}}" method="POST">
  <!-- form fields here -->
  <button type="submit">CTA Text</button>
</form>
CRITICAL: id="lead-form" is MANDATORY even when the form is inside a popup/modal/overlay.
Never rename it to "contact-form", "registro-form", or anything else. The CRM integration depends on this exact ID.
<script>
(function(){var f=document.getElementById('lead-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var btn=f.querySelector('[type=submit]'),o=btn.innerHTML;btn.disabled=true;btn.innerHTML='Enviando...';try{var d={page_id:f.dataset.pageId,source:location.href};new FormData(f).forEach(function(v,k){if(k)d[k]=v;});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(r.ok){f.innerHTML='<div style="text-align:center;padding:3rem"><p style="font-size:1.5rem;font-weight:700;color:var(--primary)">¡Gracias! Te contactaremos pronto.</p></div>';}else throw 0;}catch(x){btn.disabled=false;btn.innerHTML=o;}});})();
</script>

REQUIRED scroll animation (at end of body):
<script>var obs=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting)x.target.classList.add('visible');});},{threshold:0.1});document.querySelectorAll('.fade-in').forEach(function(el){obs.observe(el);});</script>

DESIGN RULES:
- Follow ALL color, typography, style, and section specs from the user prompt exactly
- Generate EVERY section requested — complete all sections, finish every tag properly
- Be CONCISE in HTML — use CSS vars, avoid repeating hex codes inline, reuse Tailwind classes
- DO NOT pad with excessive comments, placeholder text blocks, or redundant whitespace
- Buttons: hover:scale-105 hover:shadow-lg transition-all duration-200
- Cards: rounded-2xl shadow-md hover:shadow-xl transition-shadow
- Use semantic HTML5 (<section>, <article>, <nav>, <main>, <footer>)
- HERO HEIGHT: NEVER use min-h-screen or h-screen on hero sections. Use py-24 lg:py-32 (generous padding). min-h-screen blocks the preview from showing sections below the fold.
- STICKY MOBILE CTA: Use position:fixed + bottom:0 + z-index:100 — NOT z-50 (z-50 = z-index:50 which can be below modals)
- html,body must NOT have height:100% — this breaks scrollHeight measurement. Use min-height:100vh only if needed.`;

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

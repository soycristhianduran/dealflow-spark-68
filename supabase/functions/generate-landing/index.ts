import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// ── System prompts ────────────────────────────────────────────────────────────

// Compact FRESH_SYSTEM — ~320 tokens vs old ~3000 tokens.
// Key insight: the user prompt already contains all content/style specs;
// the system prompt only needs to establish technical rules + quality bar.
const FRESH_SYSTEM = `Expert landing page designer. Generate a COMPLETE, beautiful, standalone HTML page.

ABSOLUTE OUTPUT RULE: Return ONLY the HTML from <!DOCTYPE html> to </html>. Zero text outside HTML tags.

REQUIRED IN <head>:
- <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
- Google Fonts matching the design (import 1-2 elegant fonts)
- <script>tailwind.config={theme:{extend:{colors:{primary:'#COLOR',accent:'#COLOR'}}}}</script>
- <script src="https://cdn.tailwindcss.com"></script>
- <style> block with: CSS custom properties (--primary, --accent, --bg, --text), scroll-behavior:smooth, fade-in-up @keyframes + .fade-in class

REQUIRED LEAD FORM — copy exactly, never omit:
<form id="lead-form" data-page-id="{{PAGE_ID}}" action="{{SUBMIT_URL}}" method="POST">
  <!-- form fields here -->
  <button type="submit">CTA Text</button>
</form>
<script>
(function(){var f=document.getElementById('lead-form');if(!f)return;f.addEventListener('submit',async function(e){e.preventDefault();var btn=f.querySelector('[type=submit]'),o=btn.innerHTML;btn.disabled=true;btn.innerHTML='Enviando...';try{var d={page_id:f.dataset.pageId,source:location.href};new FormData(f).forEach(function(v,k){if(k)d[k]=v;});var r=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(r.ok){f.innerHTML='<div style="text-align:center;padding:3rem"><p style="font-size:1.5rem;font-weight:700;color:var(--primary)">¡Gracias! Te contactaremos pronto.</p></div>';}else throw 0;}catch(x){btn.disabled=false;btn.innerHTML=o;}});})();
</script>

REQUIRED IntersectionObserver for fade-in (add to all section tags):
<script>new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting)x.target.classList.add('visible');});},{threshold:0.1}).observe(document.querySelectorAll('.fade-in'));</script>
(Fix: use forEach on NodeList: document.querySelectorAll('.fade-in').forEach(el=>obs.observe(el)))

DESIGN RULES:
- Follow ALL color, typography, style, and section specs from the user prompt exactly
- Generate EVERY section the user requested — cover all content points
- Use placehold.co for images: <img src="https://placehold.co/1200x600/3d6b4f/ffffff?text=Verdenzza" ...>
  Adapt colors/text to the project
- Buttons: hover:scale-105 hover:shadow-lg transition-all duration-200
- Cards: rounded-2xl shadow-md hover:shadow-xl transition-shadow
- Mobile sticky CTA bar if user requested it: fixed bottom-0 w-full z-50 (hide on desktop with hidden md:block)
- Use semantic HTML5 sections
- Be CONCISE in HTML — avoid redundant classes, use CSS vars instead of inline hex colors`;


// System prompt for a NEW page within a funnel — reuses style from reference page
const FUNNEL_PAGE_SYSTEM = `Eres un diseñador web experto en funnels de conversión de alta calidad.
Tu tarea es crear una nueva página HTML VISUALMENTE CONSISTENTE con la página de referencia del funnel.

━━━ CONSISTENCIA VISUAL OBLIGATORIA ━━━
- Usa los MISMOS colores primarios y paleta de la referencia
- Usa las mismas fuentes (Google Fonts)
- Mantén el mismo estilo de componentes: cards, botones, badges
- Mantén el mismo branding: nombre de marca, logo
- NO copies el contenido, solo el estilo y sistema de diseño

━━━ REGLAS TÉCNICAS (idénticas a siempre) ━━━
1. Devuelve SOLO el HTML completo (<!DOCTYPE html>...</html>). Sin explicaciones.
2. Tailwind CDN + config de colores igual a la referencia
3. Formulario id="lead-form", data-page-id="{{PAGE_ID}}", action="{{SUBMIT_URL}}" si la página lo requiere
4. Mismo manejo de submit que la referencia
5. Mobile-first, responsive
6. Solo HTML + JS vanilla + Tailwind CDN

PÁGINA DE REFERENCIA (extrae su sistema de diseño):
\`\`\`html
{{REFERENCE_HTML}}
\`\`\``;

const REFINE_SYSTEM = `Eres un diseñador web experto en landing pages de alta conversión.
Tu trabajo es modificar con PRECISIÓN QUIRÚRGICA el HTML que recibes.

━━━ FORMATO DE RESPUESTA OBLIGATORIO ━━━
Responde EXACTAMENTE en este formato (sin desviaciones):

CAMBIOS: [1-2 oraciones describiendo qué cambiaste exactamente]
---HTML---
<!DOCTYPE html>
[HTML completo y funcional]

━━━ REGLAS CRÍTICAS ━━━
1. Aplica SOLO lo que se solicita explícitamente. NO "mejores" nada más.
2. PRESERVA SIEMPRE sin excepción: id="lead-form", data-page-id, action URL del form, todo el JS de submit
3. Si el usuario pide cambiar colores → cambia colores globalmente (CSS vars + tailwind config)
4. Si pide cambiar texto → cambia solo ese texto
5. Si pide agregar sección → agrégala donde tenga sentido en el flujo
6. Si pide quitar algo → quítalo limpiamente sin dejar huecos visuales
7. El HTML resultante debe estar completo y funcionar al 100%
8. Usa el historial de conversación para entender contexto previo`;

// ── Edge function ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurado. Ve a Supabase → Settings → Edge Functions → Secrets.");

    const { prompt, page_id, current_html, chat_history, funnel_reference_html } = await req.json();
    if (!prompt) throw new Error("prompt es obligatorio");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const submitUrl = `${supabaseUrl}/functions/v1/landing-submit`;
    const pageIdPlaceholder = page_id || "PENDING";

    // ── Token gate (ALL calls — generation + refinement both consume tokens) ──
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership?.organization_id) {
      throw new Error("No estás asociado a ninguna organización");
    }

    const orgId = membership.organization_id;

    // Find oldest pack with enough tokens for at least one call (~10k minimum)
    const { data: creditRow } = await supabase
      .from("ia_landings_credits")
      .select("id, credits_remaining")
      .eq("organization_id", orgId)
      .gt("credits_remaining", 10000)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!creditRow) {
      return new Response(
        JSON.stringify({
          error: "No tienes tokens de IA Landings suficientes. Compra más en Facturación para seguir generando.",
          code: "no_landing_credits",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let systemPrompt: string;
    let messages: { role: string; content: string }[];

    if (current_html) {
      // ── REFINE mode ────────────────────────────────────────────────────────
      systemPrompt = REFINE_SYSTEM;

      const history = Array.isArray(chat_history) ? chat_history : [];
      const turns: { role: string; content: string }[] = [];

      for (const msg of history.filter((m: any) => m.status === "done").slice(-6)) {
        if (msg.role === "user") {
          turns.push({ role: "user", content: msg.content });
        } else {
          turns.push({ role: "assistant", content: msg.summary || "CAMBIOS: Aplicados correctamente.\n---HTML---\n[HTML actualizado]" });
        }
      }

      turns.push({
        role: "user",
        content: `HTML actual de la landing:\n\`\`\`html\n${current_html}\n\`\`\`\n\nModificación solicitada: ${prompt}`,
      });

      messages = turns;
    } else if (funnel_reference_html) {
      // ── FUNNEL NEW PAGE mode ────────────────────────────────────────────────
      const refHtml = String(funnel_reference_html).slice(0, 4000);
      systemPrompt = FUNNEL_PAGE_SYSTEM
        .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
        .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder)
        .replace(/\{\{REFERENCE_HTML\}\}/g, refHtml);

      messages = [{ role: "user", content: `Crea esta página para el funnel: ${prompt}` }];
    } else {
      // ── FRESH mode ─────────────────────────────────────────────────────────
      systemPrompt = FRESH_SYSTEM
        .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
        .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder);

      // Send the user's prompt as-is — the system prompt already instructs
      // Claude to analyze it carefully
      messages = [{ role: "user", content: prompt }];
    }

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 16000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
    }

    const data = await response.json();

    // ── Deduct actual tokens consumed ────────────────────────────────────────
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    if (tokensUsed > 0) {
      await supabase
        .from("ia_landings_credits")
        .update({
          credits_remaining: Math.max(0, creditRow.credits_remaining - tokensUsed),
          updated_at: new Date().toISOString(),
        })
        .eq("id", creditRow.id);
    }

    let rawText: string = data.content?.[0]?.text || "";

    // Strip markdown fences
    rawText = rawText.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let html: string;
    let summary: string;

    if (current_html) {
      // Parse REFINE response: "CAMBIOS: ...\n---HTML---\n[HTML]"
      const delimiter = "---HTML---";
      const delimIdx = rawText.indexOf(delimiter);
      if (delimIdx !== -1) {
        const beforeDelim = rawText.slice(0, delimIdx).trim();
        html = rawText.slice(delimIdx + delimiter.length).trim();
        const cambiosMatch = beforeDelim.match(/^CAMBIOS:\s*(.+)/im);
        summary = cambiosMatch ? cambiosMatch[1].trim() : "Cambios aplicados";
      } else {
        html = rawText;
        summary = "Cambios aplicados";
      }
    } else {
      html = rawText;
      summary = "Landing generada";
    }

    // Ensure HTML starts with <!DOCTYPE
    if (html && !html.trimStart().startsWith("<!")) {
      const docIdx = html.indexOf("<!DOCTYPE");
      if (docIdx !== -1) html = html.slice(docIdx);
    }

    // ── Graceful truncation guard ────────────────────────────────────────────
    // If the model hit max_tokens and the HTML is cut off mid-tag, the browser
    // renders a blank page (unclosed tags collapse). Close open tags gracefully.
    if (html && !html.trimEnd().toLowerCase().endsWith("</html>")) {
      // Close any open script/style tags first (safest)
      if (/<script[^>]*>[^]*$/i.test(html) && !html.includes("</script>", html.lastIndexOf("<script"))) {
        html += "\n</script>";
      }
      // Close body and html if missing
      if (!html.toLowerCase().includes("</body>")) html += "\n</body>";
      if (!html.toLowerCase().includes("</html>")) html += "\n</html>";
    }

    // Always normalize the lead-form action to the correct Supabase submit URL.
    if (html) {
      html = html.replace(
        /(<form[^>]*id=["']lead-form["'][^>]*)\s+action=["'][^"']*["']/gi,
        `$1 action="${submitUrl}"`,
      );
      html = html.replace(
        /(<form[^>]*id=["']lead-form["'](?![^>]*\baction\s*=)[^>]*)>/gi,
        `$1 action="${submitUrl}">`,
      );
    }

    // Fetch updated balance to return to client
    const { data: updatedRow } = await supabase
      .from("ia_landings_credits")
      .select("credits_remaining")
      .eq("organization_id", orgId)
      .gt("credits_remaining", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const tokensRemaining = updatedRow?.credits_remaining ?? 0;

    // Log usage (best-effort, non-blocking)
    supabase.from("ia_landings_usage_log").insert({
      organization_id: orgId,
      page_id: page_id || null,
      call_type: current_html ? "refinement" : "generation",
      tokens_input: data.usage?.input_tokens ?? 0,
      tokens_output: data.usage?.output_tokens ?? 0,
      tokens_total: tokensUsed,
    }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({ success: true, html, summary, tokensUsed, tokensRemaining }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-landing error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

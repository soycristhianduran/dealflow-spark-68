import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// ── System prompts ────────────────────────────────────────────────────────────

const FRESH_SYSTEM = `Eres un experto en diseño web y marketing digital.
Tu tarea es generar una landing page completa y profesional en HTML.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO el HTML completo (<!DOCTYPE html>...</html>). Sin explicaciones, sin markdown.
2. Usa Tailwind CSS vía CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Incluye SIEMPRE un formulario de captura de leads con id="lead-form" y data-page-id="{{PAGE_ID}}".
4. El formulario envía por fetch POST a: {{SUBMIT_URL}}
5. Al enviar exitosamente: muestra mensaje de gracias, oculta el form.
6. Diseño: moderno, profesional, conversión-optimizado. Usa gradientes, hero, beneficios, testimonios ficticios, CTA.
7. Mobile-first y responsive.
8. Solo HTML + JS vanilla + Tailwind CDN. Sin otros frameworks.
9. Meta tags SEO básicos incluidos.

Manejo del form (adapta el diseño a lo pedido):
<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const data = { page_id: form.dataset.pageId, source: window.location.href };
    new FormData(form).forEach((v, k) => { if (k) data[k] = v; });
    const res = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { form.innerHTML = '<div class="text-center py-8"><p class="text-2xl font-bold text-green-600">¡Gracias! Te contactaremos pronto.</p></div>'; }
    else { throw new Error(); }
  } catch { btn.disabled = false; btn.textContent = 'Intentar de nuevo'; }
});
</script>`;

const REFINE_SYSTEM = `Eres un experto diseñador web especializado en landing pages de alta conversión.
Recibirás el HTML de una landing page existente y una solicitud de modificación.

REGLAS CRÍTICAS:
1. Responde EXACTAMENTE en este formato (dos partes separadas por ---HTML---):
   CAMBIOS: [1-2 oraciones describiendo qué modificaste]
   ---HTML---
   <!DOCTYPE html>
   [HTML completo actualizado]

2. Aplica ÚNICAMENTE lo que se solicita. NO cambies nada que no se mencione.
3. PRESERVA SIEMPRE: id="lead-form", data-page-id, la URL de envío del form, todo el JS.
4. El HTML resultante debe ser completo y funcional.
5. Si hay historial de conversación, úsalo como contexto pero solo aplica el cambio actual.`;

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

    const { prompt, page_id, current_html, chat_history } = await req.json();
    if (!prompt) throw new Error("prompt es obligatorio");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const submitUrl = `${supabaseUrl}/functions/v1/landing-submit`;
    const pageIdPlaceholder = page_id || "PENDING";

    let systemPrompt: string;
    let messages: { role: string; content: string }[];

    if (current_html) {
      // ── REFINE mode ────────────────────────────────────────────────────────
      // HTML goes in the USER message (not system) so Claude treats it as data to edit.
      // Pass conversation history so the AI understands full context.
      systemPrompt = REFINE_SYSTEM;

      // Build conversation turns from saved history (last 6 messages = 3 exchanges)
      const history = Array.isArray(chat_history) ? chat_history : [];
      const turns: { role: string; content: string }[] = [];

      for (const msg of history.filter((m: any) => m.status === "done").slice(-6)) {
        if (msg.role === "user") {
          turns.push({ role: "user", content: msg.content });
        } else {
          // Previous assistant responses are just confirmations — keep them brief
          // so they don't inflate context with repeated full HTML
          turns.push({ role: "assistant", content: msg.summary || "CAMBIOS: Aplicados correctamente.\n---HTML---\n[HTML actualizado]" });
        }
      }

      // Current request: HTML + new instruction
      turns.push({
        role: "user",
        content: `HTML actual de la landing:\n\`\`\`html\n${current_html}\n\`\`\`\n\nModificación solicitada: ${prompt}`,
      });

      messages = turns;
    } else {
      // ── FRESH mode ─────────────────────────────────────────────────────────
      systemPrompt = FRESH_SYSTEM
        .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
        .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder);

      messages = [{ role: "user", content: `Crea una landing page para: ${prompt}` }];
    }

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
    }

    const data = await response.json();
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
        // Extract summary from "CAMBIOS: ..." line
        const cambiosMatch = beforeDelim.match(/^CAMBIOS:\s*(.+)/im);
        summary = cambiosMatch ? cambiosMatch[1].trim() : "Cambios aplicados";
      } else {
        // Fallback: assume the whole response is HTML
        html = rawText;
        summary = "Cambios aplicados";
      }
    } else {
      html = rawText;
      summary = "Landing generada";
    }

    // Ensure HTML starts with <!DOCTYPE
    if (html && !html.trimStart().startsWith("<!")) {
      // Try to find the start
      const docIdx = html.indexOf("<!DOCTYPE");
      if (docIdx !== -1) html = html.slice(docIdx);
    }

    // Always normalize the lead-form action to the correct Supabase submit URL.
    // The AI sometimes generates a made-up URL or forgets the action attribute.
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

    return new Response(JSON.stringify({ success: true, html, summary }), {
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

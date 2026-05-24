import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `Eres un experto en diseño web y marketing digital.
Tu tarea es generar una landing page completa y profesional en HTML.

REGLAS OBLIGATORIAS:
1. Devuelve SOLO el HTML completo (<!DOCTYPE html> ... </html>). Sin explicaciones.
2. Usa Tailwind CSS vía CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Incluye SIEMPRE un formulario de captura de leads con campos: nombre, email, teléfono (opcional), y un botón de CTA.
4. El formulario debe tener id="lead-form" y un data-attribute data-page-id="{{PAGE_ID}}".
5. El formulario envía por fetch POST a: {{SUBMIT_URL}}
6. Al enviar exitosamente: muestra mensaje de gracias, oculta el form.
7. Diseño: moderno, profesional, conversión-optimizado. Usa gradientes, secciones hero, beneficios, testimonios (ficticios si no se especifican), CTA.
8. Mobile-first y responsive.
9. NO uses frameworks externos además de Tailwind. Solo HTML + JS vanilla + Tailwind CDN.
10. Incluye meta tags SEO básicos.

EJEMPLO de manejo del formulario (adapta el diseño a lo pedido):
<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: form.dataset.pageId,
        name: form.querySelector('[name="name"]').value,
        email: form.querySelector('[name="email"]').value,
        phone: form.querySelector('[name="phone"]')?.value || '',
        source: window.location.href
      })
    });
    if (res.ok) {
      form.innerHTML = '<div class="text-center py-8"><p class="text-2xl font-bold text-green-600">¡Gracias! Te contactaremos pronto.</p></div>';
    }
  } catch(err) {
    btn.disabled = false;
    btn.textContent = 'Intentar de nuevo';
  }
});
</script>`;

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

    const { prompt, page_id } = await req.json();
    if (!prompt) throw new Error("prompt es obligatorio");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const submitUrl = `${supabaseUrl}/functions/v1/landing-submit`;
    const pageIdPlaceholder = page_id || "PENDING";

    // Replace placeholders in system prompt
    const systemPrompt = SYSTEM_PROMPT
      .replace(/\{\{SUBMIT_URL\}\}/g, submitUrl)
      .replace(/\{\{PAGE_ID\}\}/g, pageIdPlaceholder);

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
        messages: [
          {
            role: "user",
            content: `Crea una landing page para: ${prompt}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${errText}`);
    }

    const data = await response.json();
    let html = data.content?.[0]?.text || "";

    // Strip markdown code fences if present
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    return new Response(JSON.stringify({ success: true, html }), {
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

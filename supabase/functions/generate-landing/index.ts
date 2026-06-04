import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// ── System prompts ────────────────────────────────────────────────────────────

const FRESH_SYSTEM = `Eres un diseñador web de clase mundial especializado en landing pages de alta conversión.
Tu trabajo es generar HTML completo, standalone y visualmente impresionante.

━━━ PASO 1: ANALIZA EL PROMPT ━━━
Antes de diseñar, extrae del prompt del usuario:
- INDUSTRIA / NICHO: (tech, inmobiliaria, salud, educación, servicios, e-commerce, etc.)
- PROPUESTA DE VALOR: qué ofrece, qué problema resuelve
- AUDIENCIA: a quién va dirigido
- TONO: profesional / casual / urgente / premium / juvenil
- MARCA: si menciona nombre de empresa o marca → úsala en el diseño
- COLORES: si menciona colores → úsalos; si no, elige paleta apropiada para la industria
- IDIOMA: responde en el idioma del prompt

━━━ PASO 2: DISEÑO VISUAL DE CALIDAD ━━━

TIPOGRAFÍA (importa desde Google Fonts):
- Heading font: Plus Jakarta Sans, Inter, Poppins, o similar moderna
- Usa size hierarchy clara: 4xl-6xl para H1, 2xl-3xl para H2, lg-xl para H3

COLORES:
- Define CSS custom properties al inicio: --primary, --primary-dark, --accent, --bg, --text
- Usa gradientes en hero y secciones CTA (linear-gradient o tailwind gradient)
- Cards con fondo blanco / glass effect en fondos oscuros

COMPONENTES VISUALES:
- Botones: rounded-full o rounded-xl, py-4 px-8, font-semibold, hover con escala y sombra
- Cards: rounded-2xl, shadow-xl, border border-white/10 o border-gray-100
- Badges: texto pequeño uppercase con fondo de color/gradiente para credibilidad
- Íconos: usa emojis Unicode ✅ 🚀 💡 ⭐ o SVG inline (NO librerías externas)
- Imágenes: usa https://placehold.co/800x500/[color]/white?text=[texto] como placeholders

ANIMACIONES:
- Añade fade-in-up con IntersectionObserver para secciones (JS vanilla simple)
- Botones: transition-all duration-200 hover:scale-105 hover:shadow-lg
- NO CSS animations complejas que afecten performance

━━━ PASO 3: ESTRUCTURA DE SECCIONES ━━━
Construye TODAS las secciones relevantes para el tipo de landing:

1. NAVBAR: logo (texto o emoji), links de navegación anclados, CTA button
2. HERO: H1 poderoso (≥6 palabras), subtítulo persuasivo, 2 CTAs, elemento visual
3. SOCIAL PROOF BAR: logos fictícios o números impactantes ("500+ empresas", "4.9⭐ en Google")
4. BENEFICIOS: grid 3 cols (mobile: 1 col) con ícono grande, título, descripción
5. CÓMO FUNCIONA: 3-4 pasos numerados con descripción
6. FEATURES: tabla o grid detallado de características
7. TESTIMONIOS: 3 testimonios con foto placeholder, nombre, cargo, empresa, estrellas ⭐
8. FAQ: 5 preguntas con acordeón JS vanilla
9. CTA FINAL: sección de contraste alto, headline urgente + formulario
10. FOOTER: logo, links, copyright, redes sociales

━━━ PASO 4: COPY DE ALTA CONVERSIÓN ━━━
- H1: específico, con número o resultado concreto cuando sea posible
  ❌ MAL: "La mejor solución para tu negocio"
  ✅ BIEN: "Cierra 3x más ventas con tu CRM inteligente en 30 días"
- Botones CTA: verbo de acción + beneficio ("Empieza gratis hoy", "Ver demo en vivo", "Quiero resultados")
- Testimonios: específicos, con resultado medible ("Aumentamos ventas 40% en 2 meses")
- Urgencia/escasez si aplica: "Solo 10 lugares disponibles", "Precio especial hasta el viernes"

━━━ REGLAS TÉCNICAS OBLIGATORIAS ━━━
1. Devuelve SOLO el HTML completo (<!DOCTYPE html>...</html>). CERO texto antes o después.
2. Tailwind CSS CDN + configuración extendida con colores del proyecto:
   <script>
   tailwind.config = { theme: { extend: { colors: { primary: '#[COLOR]', ... } } } }
   </script>
   <script src="https://cdn.tailwindcss.com"></script>
3. Google Fonts: <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
4. Formulario: id="lead-form", data-page-id="{{PAGE_ID}}", action="{{SUBMIT_URL}}", method="POST"
5. El form envía via fetch JSON:
   <script>
   document.getElementById('lead-form').addEventListener('submit',async(e)=>{
     e.preventDefault();
     const form=e.target,btn=form.querySelector('button[type="submit"]');
     const orig=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="animate-pulse">Enviando...</span>';
     try{
       const data={page_id:form.dataset.pageId,source:window.location.href};
       new FormData(form).forEach((v,k)=>{if(k)data[k]=v;});
       const res=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
       if(res.ok){
         form.closest('section').innerHTML='<div class="text-center py-16"><div class="text-6xl mb-4">🎉</div><h3 class="text-3xl font-bold text-green-600 mb-2">¡Gracias! Nos pondremos en contacto pronto.</h3></div>';
       }else throw new Error();
     }catch{btn.disabled=false;btn.innerHTML=orig;}
   });
   </script>
6. Solo HTML + JS vanilla + Tailwind CDN + Google Fonts. SIN React, Vue, jQuery, Bootstrap.
7. Meta tags completos: title, description, og:title, og:description, og:image, viewport, charset
8. 100% responsive: mobile-first, usa grid y flex de Tailwind`;

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

    // ── Credit gate (only for new generations, not refinements) ─────────────
    const isNewGeneration = !current_html; // FRESH or FUNNEL_NEW_PAGE
    if (isNewGeneration) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership?.organization_id) {
        throw new Error("No estás asociado a ninguna organización");
      }

      const orgId = membership.organization_id;

      // Find oldest pack with credits remaining
      const { data: creditRow } = await supabase
        .from("ia_landings_credits")
        .select("id, credits_remaining")
        .eq("organization_id", orgId)
        .gt("credits_remaining", 0)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!creditRow) {
        return new Response(
          JSON.stringify({
            error: "No tienes créditos de IA Landings disponibles. Compra un paquete en Facturación para seguir generando.",
            code: "no_landing_credits",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase
        .from("ia_landings_credits")
        .update({ credits_remaining: creditRow.credits_remaining - 1, updated_at: new Date().toISOString() })
        .eq("id", creditRow.id);
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
        "anthropic-beta": "output-128k-2025-02-19",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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

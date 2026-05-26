import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function — no JWT required
// Serves published landing pages by slug and tracks views

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!slug || slug === "serve-landing") {
      return new Response(notFoundHtml("sin slug"), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: page, error } = await supabase
      .from("landing_pages")
      .select("id, html, status, name, funnel_id, form_config")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      throw new Error(`DB error: ${error.message}`);
    }

    if (!page) {
      return new Response(notFoundHtml(`slug '${slug}' no encontrado`), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (page.status !== "published") {
      return new Response(notFoundHtml(`página '${page.name}' no publicada (status: ${page.status})`), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (!page.html) {
      return new Response(notFoundHtml(`página '${page.name}' sin HTML guardado`), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Track view (fire-and-forget)
    (async () => { try { await supabase.rpc("inc_landing_page_views", { p_page_id: page.id }); } catch (_) {} })();

    // Resolve redirect URL after form submit:
    // Only use form_config.redirect_url (set explicitly by the builder).
    // "" = user chose "Mostrar mensaje de éxito" → no redirect, show inline message.
    // Auto-detecting the funnel thank-you page is intentionally removed — it caused
    // "Mostrar mensaje" to redirect anyway when the page belonged to a funnel.
    const formConfig: Record<string, any> = (page.form_config as any) || {};
    const thankyouUrl = formConfig.redirect_url || "";  // explicit URL, or "" → show inline message
    const thankyouSlug = "";                             // no longer auto-detected (see comment above)

    // Success message shown inline when no redirect is configured
    const successMessage = (formConfig.success_message || "¡Gracias! Te contactaremos pronto.").replace(/'/g, "\\'").replace(/\n/g, " ");

    // CTA URL: patches href="#" buttons outside the form (user-configured)
    const ctaUrl: string = formConfig.cta_url || "";

    // Inject page_id into the HTML so the form knows which page it belongs to
    let html = page.html.replace(
      /data-page-id="PENDING"/g,
      `data-page-id="${page.id}"`,
    );

    // Also fix any submit URLs that still have the placeholder
    html = html.replace(/\{\{PAGE_ID\}\}/g, page.id);

    const submitUrl = `${supabaseUrl}/functions/v1/landing-submit`;

    // Always normalize the lead-form action to the correct Supabase submit URL.
    html = html.replace(
      /(<form[^>]*id=["']lead-form["'][^>]*)\s+action=["'][^"']*["']/gi,
      `$1 action="${submitUrl}"`,
    );
    // Also add action if the form has no action attribute yet
    html = html.replace(
      /(<form[^>]*id=["']lead-form["'](?![^>]*\baction\s*=)[^>]*)>/gi,
      `$1 action="${submitUrl}">`,
    );

    // ── Inject authoritative form-submit override ─────────────────────────────
    // This runs AFTER the page's own scripts (injected before </body>) and uses
    // capture-phase + stopImmediatePropagation to take priority over any AI-generated
    // listener. It guarantees: correct page_id, JSON body, and thank-you redirect.
    const pageId = page.id;
    // Patch CTA buttons (href="#") — per-button config takes priority over single cta_url
    const ctaLinks: { text: string; url: string }[] = formConfig.cta_links || [];
    const hasPerCtaConfig = ctaLinks.some(c => c.url);

    if (hasPerCtaConfig) {
      // Replace href="#" links outside the form by index (same order as detection)
      const formTagMatch = html.match(/<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i);
      const formPlaceholder = "___LEADFORM___";
      let workHtml = formTagMatch ? html.replace(formTagMatch[0], formPlaceholder) : html;
      let ctaIdx = 0;
      workHtml = workHtml.replace(/<a([^>]*)\bhref=["']#["']([^>]*)>/gi, (_match, before, after) => {
        const cfg = ctaLinks[ctaIdx++];
        return cfg?.url ? `<a${before} href="${cfg.url}"${after}>` : _match;
      });
      html = formTagMatch ? workHtml.replace(formPlaceholder, formTagMatch[0]) : workHtml;
    } else if (ctaUrl) {
      // Fallback: legacy single-CTA override
      html = html.replace(
        /<a([^>]*)\shref=["']#["']([^>]*)>/gi,
        `<a$1 href="${ctaUrl}"$2>`,
      );
    }

    const overrideScript = `<script>
(function(){
  function init(){
    var f=document.getElementById('lead-form');
    if(!f)return;
    // Clone the form to strip ALL AI-generated event listeners (cloneNode drops listeners).
    // This is the only reliable way to ensure our handler is the sole submit handler.
    var parent=f.parentNode;
    var nextSib=f.nextSibling;
    var fc=f.cloneNode(true);
    parent.insertBefore(fc,nextSib);
    parent.removeChild(f);
    f=fc;
    // Ensure hidden page_id input is present (fallback for native POST)
    if(!f.querySelector('input[name="page_id"]')){
      var hi=document.createElement('input');
      hi.type='hidden';hi.name='page_id';hi.value='${pageId}';
      f.appendChild(hi);
    }
    // ── UTM capture: persist from URL to sessionStorage, survive navigations ──
    var utmKeys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var urlP=new URLSearchParams(window.location.search);
    var hasUtm=utmKeys.some(function(k){return!!urlP.get(k);});
    if(hasUtm){
      utmKeys.forEach(function(k){
        var v=urlP.get(k);
        if(v)sessionStorage.setItem('_klosify_'+k,v);
        else sessionStorage.removeItem('_klosify_'+k);
      });
    }
    // Single authoritative submit handler — no other listeners exist after clone
    f.addEventListener('submit',function(e){
      e.preventDefault();
      e.stopPropagation();
      var btn=f.querySelector('button[type="submit"]');
      if(btn){btn.disabled=true;btn.textContent='Enviando...';}
      var d={page_id:'${pageId}',source:window.location.href};
      new FormData(f).forEach(function(v,k){if(k&&k!=='page_id')d[k]=v;});
      // Append UTMs from URL (or sessionStorage fallback)
      var urlPsub=new URLSearchParams(window.location.search);
      utmKeys.forEach(function(k){
        var v=urlPsub.get(k)||sessionStorage.getItem('_klosify_'+k);
        if(v)d[k]=v;
      });
      fetch('${submitUrl}',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(d)
      })
      .then(function(r){return r.json().then(function(data){return{ok:r.ok,data:data};});})
      .then(function(res){
        if(res.ok&&res.data.success){
          // 1) redirect_url from landing-submit (explicit form_config value, most reliable).
          // 2) thankyouUrl baked at serve time (explicit form_config.redirect_url, safety net if fetch succeeds but returns empty).
          // 3) thankyouSlug baked at serve time + window.location.origin evaluated at submit time
          //    → always uses the correct domain (pages.klosify.com) regardless of how serve-landing was proxied.
          var thankyouSlug='${thankyouSlug}';
          var next=res.data.redirect_url||'${thankyouUrl}'||(thankyouSlug?window.location.origin+'/'+thankyouSlug:'');
          if(next){window.location.href=next;}
          else{f.innerHTML='<div style="text-align:center;padding:2rem"><p style="font-size:1.5rem;font-weight:700;color:#16a34a">${successMessage}</p></div>';}
        }else{
          if(btn){btn.disabled=false;btn.textContent='Intentar de nuevo';}
        }
      }).catch(function(){
        if(btn){btn.disabled=false;btn.textContent='Intentar de nuevo';}
      });
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}
  else{init();}
})();
</script>`;

    // Inject before </body>; fallback: append to end
    if (html.includes("</body>")) {
      html = html.replace("</body>", overrideScript + "\n</body>");
    } else {
      html += overrideScript;
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

  } catch (e: any) {
    console.error("serve-landing error:", e);
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:80px;background:#0f172a;color:white;">
        <h1 style="color:#f97316;font-size:3rem;">500</h1>
        <p style="color:#94a3b8;">${e.message || "Error interno"}</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});

function notFoundHtml(reason: string) {
  return `<!DOCTYPE html><html><head><title>Página no encontrada</title></head>
  <body style="font-family:sans-serif;text-align:center;padding:80px;background:#0f172a;color:white;">
    <h1 style="color:#f97316;font-size:3rem;">404</h1>
    <p style="color:#94a3b8;">Esta página no está disponible.</p>
    <!-- ${reason} -->
  </body></html>`;
}

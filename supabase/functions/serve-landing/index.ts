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
      .select("id, html, status, name")
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

    // Track view (fire-and-forget) — await converts PostgrestBuilder to Promise
    (async () => { try { await supabase.rpc("inc_landing_page_views", { p_page_id: page.id }); } catch (_) {} })();

    // Inject page_id into the HTML so the form knows which page it belongs to
    let html = page.html.replace(
      /data-page-id="PENDING"/g,
      `data-page-id="${page.id}"`,
    );

    // Also fix any submit URLs that still have the placeholder
    html = html.replace(/\{\{PAGE_ID\}\}/g, page.id);

    // Always normalize the lead-form action to the correct Supabase submit URL.
    // The AI sometimes generates a made-up URL (e.g. pages.klosify.com/api/leads).
    // This guarantees every published form submits to the right endpoint.
    const submitUrl = `${supabaseUrl}/functions/v1/landing-submit`;
    html = html.replace(
      /(<form[^>]*id=["']lead-form["'][^>]*)\s+action=["'][^"']*["']/gi,
      `$1 action="${submitUrl}"`,
    );
    // Also add action if the form has no action attribute yet
    html = html.replace(
      /(<form[^>]*id=["']lead-form["'](?![^>]*\baction\s*=)[^>]*)>/gi,
      `$1 action="${submitUrl}">`,
    );

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

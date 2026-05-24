import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function — no JWT required
// Serves published landing pages by slug and tracks views

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || url.pathname.split("/").pop();

  if (!slug || slug === "serve-landing") {
    return new Response("Landing page not found", { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: page, error } = await supabase
    .from("landing_pages")
    .select("id, html, status, name")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !page || page.status !== "published" || !page.html) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Página no encontrada</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:80px;">
        <h1>404</h1><p>Esta página no está disponible.</p>
      </body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // Track view (fire-and-forget)
  supabase.rpc("inc_landing_page_views", { p_page_id: page.id }).catch(() => null);

  // Inject page_id into the HTML so the form knows which page it belongs to
  let html = page.html.replace(
    /data-page-id="PENDING"/g,
    `data-page-id="${page.id}"`,
  );

  // Also fix any submit URLs that still have the placeholder
  html = html.replace(/\{\{PAGE_ID\}\}/g, page.id);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
});

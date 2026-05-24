/**
 * Klosify Pages Worker
 * Serves landing pages at pages.klosify.com/<slug>
 * Proxies to the Supabase serve-landing edge function.
 */

const SUPABASE_FUNCTION_URL =
  "https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/serve-landing";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

    // Root path — show a simple branded page
    if (!slug) {
      return new Response(ROOT_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Proxy to Supabase serve-landing
    const upstream = `${SUPABASE_FUNCTION_URL}?slug=${encodeURIComponent(slug)}`;

    try {
      const res = await fetch(upstream, {
        headers: {
          "Accept": "text/html",
          "CF-Connecting-IP": request.headers.get("CF-Connecting-IP") || "",
          "User-Agent": request.headers.get("User-Agent") || "",
        },
      });

      // Pass through the response (HTML or 404)
      const body = await res.text();

      return new Response(body, {
        status: res.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Powered-By": "Klosify",
        },
      });
    } catch (e) {
      return new Response(ERROR_HTML, {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  },
} satisfies ExportedHandler<Env>;

interface Env {}

// ── HTML templates ────────────────────────────────────────────────────────────

const ROOT_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klosify Pages</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
      text-align: center;
      padding: 24px;
    }
    .logo {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, hsl(24 95% 58%), hsl(18 88% 50%));
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
      box-shadow: 0 8px 24px rgba(249,115,22,0.3);
    }
    h1 { font-size: 1.5rem; font-weight: 700; }
    h1 span { color: hsl(24 95% 60%); }
    p { color: #64748b; font-size: 0.9rem; }
    a {
      display: inline-block;
      margin-top: 8px;
      padding: 10px 24px;
      background: linear-gradient(135deg, hsl(24 95% 58%), hsl(18 88% 50%));
      color: white;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="logo">⚡</div>
  <h1>Klosify <span>Pages</span></h1>
  <p>Plataforma de landing pages para equipos de ventas.</p>
  <a href="https://app.aceleradoradeventas.co">Ir al CRM →</a>
</body>
</html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Error</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 80px; background: #0f172a; color: white; }
    h1 { font-size: 3rem; color: hsl(24 95% 58%); }
    p { color: #64748b; }
  </style>
</head>
<body>
  <h1>500</h1>
  <p>Error temporal. Intenta de nuevo en unos segundos.</p>
</body>
</html>`;

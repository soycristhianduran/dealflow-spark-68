import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function — no JWT required.
// Handles sign-ups for the Klosify VIP launch waitlist (/lista-vip).
// Writes through the service-role key so the `waitlist` table can stay locked
// down (RLS on, no public policies). Validates input and dedupes by email.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "invalid_body" }, 400);

    const name = String(body.name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const whatsapp = String(body.whatsapp || "").trim().slice(0, 40);
    const locale = String(body.locale || "").trim().slice(0, 10) || null;

    if (name.length < 2) return json({ error: "name_required" }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "email_invalid" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Already on the list? Treat as success — idempotent, friendly UX.
    const { data: existing } = await supabase
      .from("waitlist")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existing) return json({ ok: true, already: true });

    const { error } = await supabase.from("waitlist").insert({
      name,
      email,
      whatsapp: whatsapp || null,
      source: "lista-vip",
      locale,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) || null,
      referrer: (typeof body.referrer === "string" ? body.referrer : "")?.slice(0, 300) || null,
    });

    if (error) {
      // Unique-violation race → still a success from the user's perspective.
      if ((error as any).code === "23505") return json({ ok: true, already: true });
      console.error("waitlist insert error:", error.message);
      return json({ error: "save_failed" }, 500);
    }

    return json({ ok: true, already: false });
  } catch (err: any) {
    console.error("waitlist-join error:", err?.message);
    return json({ error: "server_error" }, 500);
  }
});

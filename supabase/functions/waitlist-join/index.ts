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

// Where VIP waitlist leads land in the CRM: org "Cristhian Duran",
// VENTAS pipeline → "Lead nuevo" stage. Tagged so they're filterable.
const CRM = {
  organizationId: "953106f4-5fc4-4eeb-a7a5-66a5eda678ed",
  pipelineId: "00000000-0000-0000-0000-000000000001",
  stageId: "b44db1d8-e1af-4001-b153-15ff84cd20f2",
  tag: "Lista VIP",
};

/**
 * Mirror a waitlist sign-up into the CRM as a contact. Idempotent: dedupes by
 * email (then phone) within the org. Never throws — a CRM hiccup must not break
 * the public sign-up, which is already persisted in `waitlist`.
 */
async function upsertCrmContact(
  supabase: any,
  { name, email, phone, locale }: { name: string; email: string; phone: string; locale: string | null },
) {
  try {
    // Already a contact in this org? (by email, else phone) → don't duplicate.
    let existing: any = null;
    const byEmail = await supabase
      .from("contacts")
      .select("id, tags")
      .eq("organization_id", CRM.organizationId)
      .ilike("primary_email", email)
      .maybeSingle();
    existing = byEmail.data;
    if (!existing && phone) {
      const byPhone = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("organization_id", CRM.organizationId)
        .eq("primary_phone", phone)
        .maybeSingle();
      existing = byPhone.data;
    }

    if (existing) {
      // Ensure the VIP tag is present without dropping existing tags.
      const tags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
      if (!tags.includes(CRM.tag)) {
        await supabase.from("contacts").update({ tags: [...tags, CRM.tag] }).eq("id", existing.id);
      }
      return;
    }

    const firstName = name.split(/\s+/)[0] || null;
    const lastName = name.split(/\s+/).slice(1).join(" ") || null;

    await supabase.from("contacts").insert({
      organization_id: CRM.organizationId,
      full_name: name,
      first_name: firstName,
      last_name: lastName,
      primary_email: email,
      primary_phone: phone || null,
      status: "new",
      source: "lista-vip",
      landing_page: "/vip",
      preferred_channel: phone ? "whatsapp" : "email",
      language: locale?.slice(0, 2) || null,
      tags: [CRM.tag],
      pipeline_id: CRM.pipelineId,
      stage_id: CRM.stageId,
    });
  } catch (e: any) {
    console.error("waitlist→CRM contact error:", e?.message);
  }
}

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

    if (existing) {
      // Already on the waitlist, but make sure they exist in the CRM too.
      await upsertCrmContact(supabase, { name, email, phone: whatsapp, locale });
      return json({ ok: true, already: true });
    }

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

    // Mirror into the CRM as a contact/lead (idempotent, non-fatal).
    await upsertCrmContact(supabase, { name, email, phone: whatsapp, locale });

    return json({ ok: true, already: false });
  } catch (err: any) {
    console.error("waitlist-join error:", err?.message);
    return json({ error: "server_error" }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public edge function — no JWT required
// Handles lead form submissions from published landing pages

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { page_id, name, email, phone, source } = body;

    if (!page_id) throw new Error("page_id is required");
    if (!email && !name) throw new Error("At least name or email is required");

    // Look up the landing page to get the organization_id
    const { data: page, error: pageErr } = await supabase
      .from("landing_pages")
      .select("id, organization_id, name, status")
      .eq("id", page_id)
      .maybeSingle();

    if (pageErr || !page || page.status !== "published") {
      throw new Error("Landing page not found or not published");
    }

    const orgId = page.organization_id;

    // Split name into first/last
    const nameParts = (name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Check for existing contact with same email in this org
    let contactId: string | null = null;
    if (email) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", orgId)
        .eq("primary_email", email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        contactId = existing.id;

        // Update phone if provided and missing
        if (phone) {
          await supabase
            .from("contacts")
            .update({ primary_phone: phone })
            .eq("id", contactId)
            .is("primary_phone", null);
        }
      }
    }

    // Create new contact if not found
    if (!contactId) {
      const newContact: Record<string, any> = {
        organization_id: orgId,
        first_name: firstName,
        last_name: lastName,
        source: `Landing: ${page.name}`,
        lead_status: "new",
      };
      if (email) newContact.primary_email = email.toLowerCase().trim();
      if (phone) newContact.primary_phone = phone;

      const { data: created, error: createErr } = await supabase
        .from("contacts")
        .insert(newContact)
        .select("id")
        .single();

      if (createErr) throw createErr;
      contactId = created.id;

      // Increment lead counter on the landing page
      await supabase.rpc("inc_landing_page_leads", { p_page_id: page_id });
    }

    // Log activity
    await supabase.from("activities").insert({
      organization_id: orgId,
      contact_id: contactId,
      type: "note",
      title: `Lead desde landing: ${page.name}`,
      description: `Formulario enviado desde ${source || "landing page"}. Email: ${email || "—"}, Teléfono: ${phone || "—"}`,
    }).catch(() => null);

    return new Response(
      JSON.stringify({ success: true, contact_id: contactId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("landing-submit error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

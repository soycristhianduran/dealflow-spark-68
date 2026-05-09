import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API = "https://api.resend.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

  const body = await req.json();
  const { action } = body;

  // ── Invite a user by email ──────────────────────────────────────────────────
  if (action === "invite") {
    const { email, role = "member" } = body;
    if (!email) return new Response(JSON.stringify({ error: "Email requerido" }), { status: 400, headers: corsHeaders });

    // Get user's organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(name)")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .single();

    if (!membership) return new Response(JSON.stringify({ error: "No tienes permisos para invitar" }), { status: 403, headers: corsHeaders });

    const orgId = membership.organization_id;
    const orgName = (membership.organizations as any)?.name || "tu equipo";

    // Check if already a member
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);
    if (existingUser?.user) {
      const { data: alreadyMember } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", existingUser.user.id)
        .maybeSingle();
      if (alreadyMember) return new Response(JSON.stringify({ error: "Este usuario ya es miembro" }), { status: 400, headers: corsHeaders });
    }

    // Create or update invitation
    const { data: invitation, error: invErr } = await supabase
      .from("organization_invitations")
      .upsert({ organization_id: orgId, email, role, invited_by: user.id }, { onConflict: "organization_id,email" })
      .select()
      .single();

    if (invErr) throw invErr;

    // Send invite email via Resend
    const appUrl = Deno.env.get("APP_URL") || "https://app.aceleradoradeventas.co";
    const inviteUrl = `${appUrl}/invite?token=${invitation.token}`;
    const inviterName = user.user_metadata?.full_name || user.email;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "CRM <noreply@aceleradoradeventas.co>",
          to: [email],
          subject: `${inviterName} te invitó a unirte a ${orgName}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#1a1a1a">Tienes una invitación</h2>
              <p><strong>${inviterName}</strong> te invitó a unirte a <strong>${orgName}</strong> en Velocity CRM.</p>
              <a href="${inviteUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                Aceptar invitación
              </a>
              <p style="color:#666;font-size:13px">Este enlace expira en 7 días. Si no esperabas esta invitación, ignora este correo.</p>
            </div>
          `,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, invite_url: inviteUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── Accept an invitation ───────────────────────────────────────────────────
  if (action === "accept") {
    const { token: inviteToken } = body;
    if (!inviteToken) return new Response(JSON.stringify({ error: "Token requerido" }), { status: 400, headers: corsHeaders });

    const { data: invitation } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("token", inviteToken)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!invitation) return new Response(JSON.stringify({ error: "Invitación inválida o expirada" }), { status: 400, headers: corsHeaders });

    // Add user to org
    const { error: memberErr } = await supabase
      .from("organization_members")
      .upsert({ organization_id: invitation.organization_id, user_id: user.id, role: invitation.role }, { onConflict: "organization_id,user_id" });

    if (memberErr) throw memberErr;

    // Mark accepted
    await supabase.from("organization_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

    return new Response(JSON.stringify({ success: true, organization_id: invitation.organization_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── List members ───────────────────────────────────────────────────────────
  if (action === "list_members") {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) return new Response(JSON.stringify({ members: [], invitations: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: members } = await supabase
      .from("organization_members")
      .select("id, role, created_at, user_id")
      .eq("organization_id", membership.organization_id);

    const { data: invitations } = await supabase
      .from("organization_invitations")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("organization_id", membership.organization_id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());

    // Get user emails from auth
    const memberDetails = await Promise.all((members || []).map(async (m) => {
      const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
      return {
        ...m,
        email: u?.user?.email,
        full_name: u?.user?.user_metadata?.full_name,
      };
    }));

    return new Response(JSON.stringify({ members: memberDetails, invitations: invitations || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── Remove member ──────────────────────────────────────────────────────────
  if (action === "remove_member") {
    const { member_user_id } = body;

    const { data: myMembership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .single();

    if (!myMembership) return new Response(JSON.stringify({ error: "Sin permisos" }), { status: 403, headers: corsHeaders });
    if (member_user_id === user.id) return new Response(JSON.stringify({ error: "No puedes removerte a ti mismo" }), { status: 400, headers: corsHeaders });

    await supabase.from("organization_members")
      .delete()
      .eq("organization_id", myMembership.organization_id)
      .eq("user_id", member_user_id);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Acción no reconocida" }), { status: 400, headers: corsHeaders });
});

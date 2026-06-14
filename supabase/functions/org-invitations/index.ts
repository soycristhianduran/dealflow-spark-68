import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API = "https://api.resend.com";

// Branded sender + email template (Klosify look & feel)
const INVITE_FROM = "Klosify <noreply@klosify.com>";

function brandedInviteEmail(opts: {
  inviterName: string;
  orgName: string;
  inviteUrl: string;
  role?: string;
  reminder?: boolean;
}): string {
  const { inviterName, orgName, inviteUrl, role, reminder } = opts;
  const roleLabel = role === "vendor" ? "Vendedor"
    : role === "admin" ? "Administrador"
    : role === "owner" ? "Propietario" : "Miembro";
  const heading = reminder ? "Recordatorio de invitación" : "Te invitaron a un equipo";
  const intro = reminder
    ? `<strong>${inviterName}</strong> te recuerda que tienes una invitación pendiente para unirte a <strong>${orgName}</strong>.`
    : `<strong>${inviterName}</strong> te invitó a unirte a <strong>${orgName}</strong> en Klosify.`;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header (dark) with official pixel-K logo (orange gradient) + white wordmark -->
        <tr><td bgcolor="#431407" style="background:#431407;background:linear-gradient(135deg,#7c2d12,#2c0f05);padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#FFA01E;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"></td>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#FF9120;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                </tr>
                <tr>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#FF7E24;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#FF6B2C;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"></td>
                </tr>
                <tr>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#FA5A1C;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#F4521A;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"></td>
                </tr>
                <tr>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#EC4A12;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td width="14" height="14"></td>
                  <td width="14" height="14"><div style="width:11px;height:11px;background:#E8460E;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
                </tr>
              </table>
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <span style="color:#ffffff;font-size:23px;font-weight:800;letter-spacing:-0.3px;">Klosify</span>
            </td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;color:#18181b;font-weight:700;">${heading}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3f3f46;">${intro}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Rol asignado: <strong style="color:#ea580c;">${roleLabel}</strong></p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:10px;background:#f97316;">
            <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Aceptar invitación</a>
          </td></tr></table>
          <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;">O copia y pega este enlace en tu navegador:<br>
            <a href="${inviteUrl}" style="color:#f97316;word-break:break-all;">${inviteUrl}</a>
          </p>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:24px 32px 0;"><div style="border-top:1px solid #f4f4f5;"></div></td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 32px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.</p>
          <p style="margin:12px 0 0;font-size:12px;color:#c4c4cc;">© Klosify · CRM para equipos de ventas</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const ok = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json();
  const { action } = body;

  // ── Public: fetch invitation details by token (pre-login email prefill) ──────
  // The token is a secret UUID, so possession of the link authorizes reading it.
  if (action === "get_invitation") {
    const { token: inviteToken } = body;
    if (!inviteToken) return err("token requerido");
    const { data: inv } = await supabase
      .from("organization_invitations")
      .select("email, role, organization_id, accepted_at, expires_at")
      .eq("token", inviteToken)
      .maybeSingle();
    if (!inv) return ok({ valid: false });
    const expired = new Date(inv.expires_at) < new Date();
    const { data: org } = await supabase
      .from("organizations").select("name").eq("id", inv.organization_id).maybeSingle();
    return ok({
      valid: !expired && !inv.accepted_at,
      email: inv.email, role: inv.role, org_name: org?.name || "",
      accepted: !!inv.accepted_at, expired,
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return err("No autorizado");

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return err("No autorizado");

  // ── Invite a user by email ──────────────────────────────────────────────────
  if (action === "invite") {
    const { email, role = "vendor" } = body;
    if (!email) return new Response(JSON.stringify({ error: "Email requerido" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Get user's organization — fetch any role, then check permission in code
    const { data: membership, error: memErr } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("membership lookup:", JSON.stringify({ membership, memErr, userId: user.id }));

    if (!membership) {
      return new Response(JSON.stringify({ error: "No perteneces a ninguna organización" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: `Sin permisos (rol actual: ${membership.role})` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orgId = membership.organization_id;

    // Fetch org name separately to avoid join issues
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const orgName = orgRow?.name || "tu equipo";

    // Create or update invitation
    const { data: invitation, error: invErr } = await supabase
      .from("organization_invitations")
      .upsert(
        { organization_id: orgId, email, role, invited_by: user.id },
        { onConflict: "organization_id,email" }
      )
      .select()
      .maybeSingle();

    console.log("invitation upsert:", JSON.stringify({ invitation, invErr }));
    if (invErr) return new Response(JSON.stringify({ error: invErr.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!invitation) return new Response(JSON.stringify({ error: "No se pudo crear la invitación" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Send invite email via Resend
    const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";
    const inviteUrl = `${appUrl}/invite?token=${invitation.token}`;
    const inviterName = user.user_metadata?.full_name || user.email;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: INVITE_FROM,
          to: [email],
          subject: `${inviterName} te invitó a unirte a ${orgName} en Klosify`,
          html: brandedInviteEmail({ inviterName, orgName, inviteUrl, role }),
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
    if (!inviteToken) return new Response(JSON.stringify({ error: "Token requerido" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Look up by token regardless of accepted_at so the flow is IDEMPOTENT:
    // the signup trigger may have already auto-joined + marked it accepted.
    const { data: invitation } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("token", inviteToken)
      .maybeSingle();

    if (!invitation) return new Response(JSON.stringify({ error: "Invitación inválida o expirada" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // SECURITY: verify the logged-in user's email matches the invitation email
    if ((user.email ?? "").toLowerCase() !== (invitation.email ?? "").toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Esta invitación fue enviada a otro email. Inicia sesión con la cuenta correcta." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already a member? Treat as success (idempotent — trigger may have joined them).
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingMember) {
      // Reject expired invitations only when the user isn't already in.
      if (new Date(invitation.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Invitación inválida o expirada" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: memberErr } = await supabase
        .from("organization_members")
        .upsert({ organization_id: invitation.organization_id, user_id: user.id, role: invitation.role }, { onConflict: "organization_id,user_id" });
      if (memberErr) throw memberErr;
    }

    // Mark accepted (idempotent)
    if (!invitation.accepted_at) {
      await supabase.from("organization_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
    }

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

  // ── Update member role ────────────────────────────────────────────────────
  if (action === "update_role") {
    const { member_user_id, new_role } = body;
    const validRoles = ["admin", "vendor", "readonly"];
    if (!member_user_id || !validRoles.includes(new_role)) {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: myMembership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .single();

    if (!myMembership) return new Response(JSON.stringify({ error: "Sin permisos" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (member_user_id === user.id) return new Response(JSON.stringify({ error: "No puedes cambiar tu propio rol" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Cannot change the owner's role
    const { data: target } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", myMembership.organization_id)
      .eq("user_id", member_user_id)
      .maybeSingle();

    if (!target) return new Response(JSON.stringify({ error: "Miembro no encontrado" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (target.role === "owner") return new Response(JSON.stringify({ error: "No puedes cambiar el rol del propietario" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { error: roleErr } = await supabase
      .from("organization_members")
      .update({ role: new_role })
      .eq("organization_id", myMembership.organization_id)
      .eq("user_id", member_user_id);

    if (roleErr) throw roleErr;
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    if (!myMembership) return new Response(JSON.stringify({ error: "Sin permisos" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (member_user_id === user.id) return new Response(JSON.stringify({ error: "No puedes removerte a ti mismo" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase.from("organization_members")
      .delete()
      .eq("organization_id", myMembership.organization_id)
      .eq("user_id", member_user_id);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Get current org info (bypasses RLS) ───────────────────────────────────
  if (action === "get_org") {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) return new Response(JSON.stringify({ org: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, timezone, public_form_token")
      .eq("id", membership.organization_id)
      .maybeSingle();

    return new Response(JSON.stringify({ org, role: membership.role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── Resend invitation ─────────────────────────────────────────────────────
  if (action === "resend_invitation") {
    const { invitation_id } = body;
    if (!invitation_id) return err("invitation_id requerido");

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return err("No perteneces a ninguna organización");
    if (!["owner", "admin"].includes(membership.role)) return err("Sin permisos");

    const { data: invitation } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("id", invitation_id)
      .eq("organization_id", membership.organization_id)
      .is("accepted_at", null)
      .maybeSingle();

    if (!invitation) return err("Invitación no encontrada");

    // Extend expiry 7 more days
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("organization_invitations")
      .update({ expires_at: newExpiry })
      .eq("id", invitation_id);

    // Resend email
    const appUrl = Deno.env.get("APP_URL") || "https://app.klosify.com";
    const inviteUrl = `${appUrl}/invite?token=${invitation.token}`;
    const inviterName = user.user_metadata?.full_name || user.email;

    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", membership.organization_id)
      .maybeSingle();
    const orgName = orgRow?.name || "tu equipo";

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: INVITE_FROM,
          to: [invitation.email],
          subject: `${inviterName} te recuerda unirte a ${orgName} en Klosify`,
          html: brandedInviteEmail({ inviterName, orgName, inviteUrl, role: invitation.role, reminder: true }),
        }),
      });
    }

    return ok({ success: true });
  }

  // ── Cancel / delete invitation ─────────────────────────────────────────────
  if (action === "cancel_invitation") {
    const { invitation_id } = body;
    if (!invitation_id) return err("invitation_id requerido");

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return err("No perteneces a ninguna organización");
    if (!["owner", "admin"].includes(membership.role)) return err("Sin permisos");

    const { error: delErr } = await supabase
      .from("organization_invitations")
      .delete()
      .eq("id", invitation_id)
      .eq("organization_id", membership.organization_id);

    if (delErr) throw delErr;

    return ok({ success: true });
  }

  // ── Save workspace slug ────────────────────────────────────────────────────
  // ── Save general org settings (name, timezone) ────────────────────────────
  if (action === "save_general") {
    const { name, timezone } = body;
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) return new Response(JSON.stringify({ error: "No perteneces a ninguna organización" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const patch: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (typeof timezone === "string" && timezone.trim()) patch.timezone = timezone.trim();
    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { error: upErr } = await supabase.from("organizations").update(patch).eq("id", membership.organization_id);
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "save_slug") {
    const { slug } = body;
    if (!slug) return new Response(JSON.stringify({ error: "Slug requerido" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
      return new Response(JSON.stringify({ error: "Formato de slug inválido" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user's organization (service role bypasses RLS)
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) return new Response(JSON.stringify({ error: "No perteneces a ninguna organización" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Check slug is not taken by another org
    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .neq("id", membership.organization_id)
      .maybeSingle();

    if (existing) return new Response(JSON.stringify({ error: "Esa dirección ya está en uso" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Save slug and mark it as confirmed so the setup gate is lifted.
    // Graceful fallback: if the slug_confirmed column doesn't exist yet
    // (migration pending), retry without it so the slug still saves.
    const { error: updateErr } = await supabase
      .from("organizations")
      .update({ slug, slug_confirmed: true })
      .eq("id", membership.organization_id);

    if (updateErr) {
      if (updateErr.message?.includes("slug_confirmed")) {
        // Migration not yet applied — save slug only
        const { error: retryErr } = await supabase
          .from("organizations").update({ slug }).eq("id", membership.organization_id);
        if (retryErr) throw retryErr;
      } else {
        throw updateErr;
      }
    }

    return new Response(JSON.stringify({ success: true, slug }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── SETUP ORG (Google onboarding: rename workspace + set unique slug) ──────
  // Called from AuthPage after the Google signup form is submitted.
  // Runs as service role so it can bypass RLS on organizations.
  if (action === "setup_org") {
    const { name: orgName, slug: baseSlug } = body as { name?: string; slug?: string };
    if (!orgName || !baseSlug) {
      return new Response(JSON.stringify({ error: "name y slug son requeridos" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(baseSlug)) {
      return new Response(JSON.stringify({ error: "Formato de slug inválido" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "No perteneces a ninguna organización" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find a unique slug: try baseSlug, then baseSlug-1, baseSlug-2 … baseSlug-10
    let finalSlug = baseSlug;
    for (let attempt = 1; attempt <= 10; attempt++) {
      const { data: conflict } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", finalSlug)
        .neq("id", membership.organization_id)
        .maybeSingle();
      if (!conflict) break;
      finalSlug = `${baseSlug}-${attempt}`;
    }

    const { error: updateErr } = await supabase
      .from("organizations")
      .update({ name: orgName.trim(), slug: finalSlug })
      .eq("id", membership.organization_id);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ success: true, slug: finalSlug }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── SAVE EMAIL SENDER ──────────────────────────────────────────────────────
  if (action === "save_email_sender") {
    const { email_from_name, email_from_email } = body;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) return new Response(JSON.stringify({ error: "No perteneces a ninguna organización" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!["admin", "owner"].includes(membership.role)) return new Response(JSON.stringify({ error: "Solo admins pueden cambiar el remitente" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { error: updateErr } = await supabase
      .from("organizations")
      .update({ email_from_name: email_from_name || null, email_from_email: email_from_email || null })
      .eq("id", membership.organization_id);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ── GET EMAIL SENDER ───────────────────────────────────────────────────────
  if (action === "get_email_sender") {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) return new Response(JSON.stringify({ error: "No org" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: org } = await supabase
      .from("organizations")
      .select("email_from_name, email_from_email")
      .eq("id", membership.organization_id)
      .maybeSingle();

    return new Response(JSON.stringify({ email_from_name: org?.email_from_name || "", email_from_email: org?.email_from_email || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Acción no reconocida" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("Unhandled error in org-invitations:", e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? "Error interno del servidor" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

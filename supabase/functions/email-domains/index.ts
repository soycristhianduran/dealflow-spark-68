import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API = "https://api.resend.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Normalize a user-typed domain: strip protocol, path, leading "www." and spaces.
function cleanDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no está configurado en el servidor.");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: resolve user + org
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || "list";

    // Resolve caller's organization
    const orgId: string | null =
      body?.organization_id ??
      (await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle()).data?.organization_id ??
      null;
    if (!orgId) return json({ error: "No se encontró la organización del usuario." }, 400);

    const resend = (path: string, init?: RequestInit) =>
      fetch(`${RESEND_API}${path}`, {
        ...init,
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });

    // ── LIST ──────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data } = await supabase
        .from("email_domains")
        .select("id, domain, status, dns_records, is_default, region, created_at, verified_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      return json({ domains: data ?? [] });
    }

    // ── ADD ───────────────────────────────────────────────────────────────
    if (action === "add") {
      const domain = cleanDomain(body?.domain || "");
      if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        return json({ error: "Ingresa un dominio válido (ej. midominio.com)." }, 400);
      }

      // Create the domain in Resend
      const res = await resend("/domains", {
        method: "POST",
        body: JSON.stringify({ name: domain, region: body?.region || "us-east-1" }),
      });
      const rd = await res.json();
      if (!res.ok || rd?.error) {
        const msg = rd?.error?.message || rd?.message || "No se pudo crear el dominio en Resend.";
        return json({ error: msg }, 400);
      }

      const row = {
        organization_id: orgId,
        domain,
        resend_domain_id: rd.id,
        status: rd.status || "pending",
        dns_records: rd.records || [],
        region: rd.region || "us-east-1",
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };
      // Upsert so re-adding the same domain refreshes its records.
      const { data: saved, error: dbErr } = await supabase
        .from("email_domains")
        .upsert(row, { onConflict: "organization_id,domain" })
        .select("id, domain, status, dns_records, is_default, region")
        .single();
      if (dbErr) return json({ error: dbErr.message }, 400);

      return json({ domain: saved });
    }

    // ── REFRESH (poll Resend for current status + records) ────────────────
    if (action === "refresh" || action === "verify") {
      const id: string = body?.id;
      if (!id) return json({ error: "Falta el id del dominio." }, 400);

      const { data: dom } = await supabase
        .from("email_domains")
        .select("id, resend_domain_id, organization_id")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!dom?.resend_domain_id) return json({ error: "Dominio no encontrado." }, 404);

      // verify triggers a re-check; refresh just reads current state
      if (action === "verify") {
        await resend(`/domains/${dom.resend_domain_id}/verify`, { method: "POST" });
      }

      const res = await resend(`/domains/${dom.resend_domain_id}`);
      const rd = await res.json();
      if (!res.ok || rd?.error) {
        return json({ error: rd?.error?.message || "No se pudo consultar el dominio." }, 400);
      }

      const verified = rd.status === "verified";
      const { data: updated } = await supabase
        .from("email_domains")
        .update({
          status: rd.status,
          dns_records: rd.records || [],
          verified_at: verified ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id, domain, status, dns_records, is_default, region, verified_at")
        .single();

      return json({ domain: updated });
    }

    // ── SET DEFAULT ───────────────────────────────────────────────────────
    if (action === "set_default") {
      const id: string = body?.id;
      if (!id) return json({ error: "Falta el id del dominio." }, 400);
      await supabase.from("email_domains").update({ is_default: false }).eq("organization_id", orgId);
      const { error } = await supabase
        .from("email_domains")
        .update({ is_default: true })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const id: string = body?.id;
      if (!id) return json({ error: "Falta el id del dominio." }, 400);
      const { data: dom } = await supabase
        .from("email_domains")
        .select("resend_domain_id")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (dom?.resend_domain_id) {
        await resend(`/domains/${dom.resend_domain_id}`, { method: "DELETE" }).catch(() => {});
      }
      await supabase.from("email_domains").delete().eq("id", id).eq("organization_id", orgId);
      return json({ success: true });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e: any) {
    console.error("email-domains error:", e);
    return json({ error: e.message }, 500);
  }
});

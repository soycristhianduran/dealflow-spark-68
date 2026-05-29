import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public REST API — accepts requests authenticated with an API Key.
 * Used by WordPress, Zapier, n8n, Make and any external source to
 * send data into the CRM.
 *
 * Authentication: Authorization: Bearer sk_live_xxxxxxxxxx
 *
 * Endpoints:
 *   POST   /public-api/contacts          → create contact
 *   GET    /public-api/contacts          → list contacts (last 100)
 *   GET    /public-api/contacts/:id      → get contact
 *   PATCH  /public-api/contacts/:id      → update contact
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// SHA-256 hash of the raw key (Web Crypto, no deps)
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Resolve and validate API key → returns { organization_id, key_id }
async function authenticate(
  authHeader: string | null,
  admin: ReturnType<typeof createClient>,
): Promise<{ organization_id: string; key_id: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("sk_live_")) return null;

  const hash = await sha256(raw);

  const { data } = await admin
    .from("api_keys")
    .select("id, organization_id")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  // Update last_used_at async (fire-and-forget)
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { organization_id: data.organization_id, key_id: data.id };
}

// Map inbound field names → CRM contact columns
// Accepts both snake_case CRM names and common aliases
function mapContactFields(body: Record<string, unknown>) {
  const aliases: Record<string, string> = {
    // name aliases
    name: "first_name",
    full_name: "first_name",
    nombre: "first_name",
    apellido: "last_name",
    surname: "last_name",
    // email aliases
    email: "primary_email",
    correo: "primary_email",
    email_address: "primary_email",
    // phone aliases
    phone: "primary_phone",
    telefono: "primary_phone",
    telephone: "primary_phone",
    mobile: "primary_phone",
    celular: "primary_phone",
    // company aliases
    company: "company_name",
    empresa: "company_name",
    organization: "company_name",
    // source aliases
    fuente: "source",
    origen: "source",
    // other common aliases
    mensaje: "notes",
    message: "notes",
    comentario: "notes",
    comment: "notes",
  };

  // CRM contact columns that can be set directly
  const allowed = new Set([
    "first_name", "last_name", "primary_email", "primary_phone",
    "company_name", "source", "campaign", "notes", "tags",
    "lead_status", "score", "budget", "budget_currency",
    "city", "country", "language", "preferred_channel",
    "expected_close_date", "lost_reason",
  ]);

  const mapped: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(body)) {
    const key = aliases[k.toLowerCase()] ?? k.toLowerCase();
    if (allowed.has(key) && v !== undefined && v !== null && v !== "") {
      mapped[key] = v;
    }
  }

  // If full_name was provided as a single string, split into first/last
  if (body.full_name && typeof body.full_name === "string" && !body.first_name) {
    const parts = (body.full_name as string).trim().split(/\s+/);
    mapped.first_name = parts[0];
    if (parts.length > 1) mapped.last_name = parts.slice(1).join(" ");
  }
  if (body.name && typeof body.name === "string" && !body.first_name) {
    const parts = (body.name as string).trim().split(/\s+/);
    mapped.first_name = parts[0];
    if (parts.length > 1) mapped.last_name = parts.slice(1).join(" ");
  }

  return mapped;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth
  const auth = await authenticate(req.headers.get("authorization"), admin);
  if (!auth) {
    return json({ error: "Invalid or missing API key" }, 401);
  }

  const url = new URL(req.url);
  // pathname looks like /public-api/contacts or /public-api/contacts/uuid
  const parts = url.pathname.replace(/^\/public-api\/?/, "").split("/").filter(Boolean);
  const resource = parts[0]; // "contacts"
  const resourceId = parts[1]; // uuid or undefined

  // ── GET /contacts ──────────────────────────────────────────────────────────
  if (req.method === "GET" && resource === "contacts" && !resourceId) {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const email = url.searchParams.get("email");

    let q = admin
      .from("contacts")
      .select("id, first_name, last_name, primary_email, primary_phone, company_name, lead_status, source, created_at")
      .eq("organization_id", auth.organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (email) q = q.eq("primary_email", email);

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ data, count: data?.length ?? 0 });
  }

  // ── GET /contacts/:id ──────────────────────────────────────────────────────
  if (req.method === "GET" && resource === "contacts" && resourceId) {
    const { data, error } = await admin
      .from("contacts")
      .select("*")
      .eq("id", resourceId)
      .eq("organization_id", auth.organization_id)
      .single();
    if (error) return json({ error: "Contact not found" }, 404);
    return json({ data });
  }

  // ── POST /contacts ─────────────────────────────────────────────────────────
  if (req.method === "POST" && resource === "contacts") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const fields = mapContactFields(body);

    // At least one identifying field required
    if (!fields.primary_email && !fields.primary_phone && !fields.first_name) {
      return json({ error: "At least one of: email, phone, first_name is required" }, 422);
    }

    // Default source to "api" if not provided
    if (!fields.source) fields.source = "api";

    // Upsert on email if provided (avoids duplicates)
    if (fields.primary_email) {
      const { data: existing } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", auth.organization_id)
        .eq("primary_email", fields.primary_email)
        .maybeSingle();

      if (existing) {
        // Update existing contact
        const { data, error } = await admin
          .from("contacts")
          .update(fields)
          .eq("id", existing.id)
          .select("id, first_name, last_name, primary_email, lead_status")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ data, created: false }, 200);
      }
    }

    // Insert new contact
    const { data, error } = await admin
      .from("contacts")
      .insert({ ...fields, organization_id: auth.organization_id })
      .select("id, first_name, last_name, primary_email, lead_status")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data, created: true }, 201);
  }

  // ── PATCH /contacts/:id ────────────────────────────────────────────────────
  if (req.method === "PATCH" && resource === "contacts" && resourceId) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const fields = mapContactFields(body);
    if (Object.keys(fields).length === 0) {
      return json({ error: "No valid fields to update" }, 422);
    }

    const { data, error } = await admin
      .from("contacts")
      .update(fields)
      .eq("id", resourceId)
      .eq("organization_id", auth.organization_id)
      .select("id, first_name, last_name, primary_email, lead_status")
      .single();

    if (error) return json({ error: "Contact not found or update failed" }, 404);
    return json({ data });
  }

  return json({ error: "Not found" }, 404);
});

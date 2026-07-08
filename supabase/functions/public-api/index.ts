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

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT_RPM = 100; // max requests per minute per API key

// ── Security & CORS headers ───────────────────────────────────────────────────
const securityHeaders = {
  // CORS — allow any origin since this is a public REST API for external integrations
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  // Prevent MIME-type sniffing
  "X-Content-Type-Options": "nosniff",
  // Block framing (clickjacking protection)
  "X-Frame-Options": "DENY",
  // No referrer leakage
  "Referrer-Policy": "no-referrer",
  // Strict content security
  "Content-Security-Policy": "default-src 'none'",
};

const cors = securityHeaders; // alias for backward compat

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...securityHeaders, "Content-Type": "application/json", ...extra },
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

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Uses the api_rate_limits table (1-minute sliding window per API key).
// Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  keyId: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const windowStart = new Date(
    Math.floor(Date.now() / 60_000) * 60_000,
  ).toISOString();

  // Upsert: increment count for this key+window
  const { data, error } = await admin.rpc("increment_rate_limit", {
    p_key_id: keyId,
    p_window_start: windowStart,
    p_limit: RATE_LIMIT_RPM,
  });

  // If the RPC doesn't exist yet (first deploy after migration), fail open
  if (error) return { allowed: true };

  if (data === false) {
    // Window resets at the next minute
    const windowEndMs = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
    const retryAfter = Math.ceil((windowEndMs - Date.now()) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

// ── Body size guard ───────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 100_000; // 100 KB

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

  // CRM contact columns that can be set directly (confirmed against live DB)
  const allowed = new Set([
    "first_name", "last_name", "full_name",
    "primary_email", "primary_phone",
    "company_name",                          // text field (separate from company_id FK)
    "source", "campaign", "notes", "tags",
    "lead_status", "status",
    "score", "budget", "budget_currency",
    "city", "country", "language", "timezone", "preferred_channel",
    "expected_close_date", "birthday", "lost_reason",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  ]);

  const mapped: Record<string, unknown> = {};
  const customFields: Record<string, unknown> = {};

  // Internal fields to skip (meta/system keys)
  const skip = new Set(["organization_id", "id", "created_at", "updated_at"]);

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null || v === "") continue;
    const normalized = k.toLowerCase().replace(/\s+/g, "_");
    const key = aliases[normalized] ?? normalized;

    if (skip.has(key)) continue;

    if (allowed.has(key)) {
      mapped[key] = v;
    } else {
      // Unknown field → goes to custom_fields JSONB
      customFields[k] = v;
    }
  }

  // If full_name was provided as a single string, split into first/last
  if (body.full_name && typeof body.full_name === "string" && !body.first_name) {
    const parts = (body.full_name as string).trim().split(/\s+/);
    mapped.first_name = parts[0];
    if (parts.length > 1) mapped.last_name = parts.slice(1).join(" ");
    delete customFields.full_name;
  }
  if (body.name && typeof body.name === "string" && !mapped.first_name) {
    const parts = (body.name as string).trim().split(/\s+/);
    mapped.first_name = parts[0];
    if (parts.length > 1) mapped.last_name = parts.slice(1).join(" ");
    delete customFields.name;
  }

  if (Object.keys(customFields).length > 0) {
    mapped.custom_fields = customFields;
  }

  return mapped;
}

// Auto-register new custom field keys as org-level definitions (fire-and-forget)
async function autoRegisterFieldDefs(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  customFields: Record<string, unknown>,
): Promise<void> {
  if (!customFields || Object.keys(customFields).length === 0) return;
  const { data: existing } = await admin
    .from("custom_field_definitions")
    .select("key")
    .eq("organization_id", organizationId);
  const existingKeys = new Set((existing || []).map((r: { key: string }) => r.key));
  const toInsert = Object.keys(customFields)
    .filter(k => !existingKeys.has(k))
    .map((k, i) => ({
      organization_id: organizationId,
      key: k,
      label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      field_type: "text",
      position: (existing?.length ?? 0) + i,
    }));
  if (toInsert.length > 0) {
    await admin.from("custom_field_definitions").insert(toInsert).select();
  }
}

// Merge incoming custom_fields with existing ones in DB (don't wipe previous fields)
async function mergeCustomFields(
  admin: ReturnType<typeof createClient>,
  contactId: string,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!fields.custom_fields) return fields;

  const { data } = await admin
    .from("contacts")
    .select("custom_fields")
    .eq("id", contactId)
    .single();

  const existing = (data?.custom_fields && typeof data.custom_fields === "object")
    ? data.custom_fields as Record<string, unknown>
    : {};

  return {
    ...fields,
    custom_fields: { ...existing, ...(fields.custom_fields as Record<string, unknown>) },
  };
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

  // Rate limit (100 req/min per API key)
  const rateCheck = await checkRateLimit(admin, auth.key_id);
  if (!rateCheck.allowed) {
    return json(
      { error: "Rate limit exceeded. Max 100 requests per minute." },
      429,
      { "Retry-After": String(rateCheck.retryAfter ?? 60) },
    );
  }

  // Body size guard for mutation endpoints
  if (req.method === "POST" || req.method === "PATCH") {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_BODY_BYTES) {
      return json({ error: "Request body too large (max 100 KB)" }, 413);
    }
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
      .select("id, first_name, last_name, full_name, primary_email, primary_phone, company_name, city, country, lead_status, source, campaign, notes, score, budget, budget_currency, expected_close_date, utm_source, utm_medium, utm_campaign, custom_fields, created_at, updated_at")
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

    // full_name is NOT NULL — always compute it
    if (!fields.full_name) {
      const first = (fields.first_name as string) || "";
      const last = (fields.last_name as string) || "";
      fields.full_name = [first, last].filter(Boolean).join(" ")
        || (fields.primary_email as string)
        || (fields.primary_phone as string)
        || "Sin nombre";
    }

    // Match an existing lead by NORMALIZED phone (digits-only) or email so the
    // same person from another channel (e.g. WhatsApp first, then this API) is
    // recognized regardless of phone format — keeps the original source.
    if (fields.primary_email || fields.primary_phone) {
      const { data: matchId } = await admin.rpc("match_contact", {
        p_org: auth.organization_id,
        p_phone: (fields.primary_phone as string) || null,
        p_email: (fields.primary_email as string) || null,
      });
      if (matchId) {
        const updateFields = await mergeCustomFields(admin, matchId as string, fields);
        // Preserve the lead's original first-touch source/created_at on merge.
        delete (updateFields as Record<string, unknown>).source;
        delete (updateFields as Record<string, unknown>).created_at;
        const { data, error } = await admin
          .from("contacts")
          .update(updateFields)
          .eq("id", matchId as string)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ data, created: false }, 200);
      }
    }

    // Auto-register any unknown fields as org-level definitions
    if (fields.custom_fields) {
      autoRegisterFieldDefs(admin, auth.organization_id, fields.custom_fields as Record<string, unknown>);
    }

    // Insert new contact
    const { data, error } = await admin
      .from("contacts")
      .insert({ ...fields, organization_id: auth.organization_id })
      .select("*")
      .single();

    if (error) return json({ error: error.message }, 500);

    // Fire contact_created automation trigger (fire-and-forget)
    admin.functions.invoke("automation-runner", {
      body: {
        action: "trigger_event",
        trigger_type: "contact_created",
        contact_id: data.id,
        trigger_data: { origin: "api", source: fields.source ?? "api" },
      },
    }).catch((e: Error) => console.warn("contact_created automation trigger failed:", e.message));

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

    // Merge custom_fields with existing ones (don't overwrite)
    const updateFields = await mergeCustomFields(admin, resourceId, fields);

    // Keep full_name in sync: a PATCH that adds/changes first/last name must
    // recompute it, otherwise leads created with only an email keep the email
    // as their display name forever.
    if (!updateFields.full_name && (updateFields.first_name || updateFields.last_name)) {
      const { data: cur } = await admin
        .from("contacts").select("first_name, last_name")
        .eq("id", resourceId).maybeSingle();
      const first = (updateFields.first_name as string) ?? cur?.first_name ?? "";
      const last = (updateFields.last_name as string) ?? cur?.last_name ?? "";
      const composed = [first, last].filter(Boolean).join(" ").trim();
      if (composed) updateFields.full_name = composed;
    }

    const { data, error } = await admin
      .from("contacts")
      .update(updateFields)
      .eq("id", resourceId)
      .eq("organization_id", auth.organization_id)
      .select("*")
      .single();

    if (error) return json({ error: "Contact not found or update failed" }, 404);
    return json({ data });
  }

  return json({ error: "Not found" }, 404);
});

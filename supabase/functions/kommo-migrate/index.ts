/**
 * kommo-migrate — reusable Kommo → Klosify migration tool.
 *
 * Secrets: KOMMO_TOKEN (long-lived), KOMMO_SUBDOMAIN.
 * Internal-only: caller must present the service-role key.
 *
 * Actions:
 *  - inspect                → account, pipelines/statuses, users, lead custom
 *                             fields, tag sample and total lead count.
 *  - migrate { organization_id, dry_run?, updated_since? }
 *      · Walks every lead (paged, with contacts), joins contact phone/email.
 *      · Maps: price→budget, status name→same-named Klosify stage,
 *        142→won / 143→lost (+ Ganado/Perdido stage), responsible user→owner
 *        (by email match, fallback org owner), tags, created_at preserved,
 *        "plan" custom field→won_product_id (product name match).
 *      · Idempotent: matches by custom_fields.kommo_lead_id, then phone/email.
 *        Re-runs update instead of duplicating (incremental via updated_since).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KOMMO_TOKEN = Deno.env.get("KOMMO_TOKEN") ?? "";
const KOMMO_SUBDOMAIN = Deno.env.get("KOMMO_SUBDOMAIN") ?? "";
const BASE = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;

async function kommo(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KOMMO_TOKEN}` } });
  if (res.status === 204) return null; // empty page
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Kommo ${path} → HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// Walk a paged collection (limit 250) until Kommo returns 204/empty.
async function* pages(path: string, embedKey: string) {
  for (let page = 1; page < 400; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await kommo(`${path}${sep}limit=250&page=${page}`);
    const items = data?._embedded?.[embedKey] ?? [];
    if (!items.length) return;
    yield items as any[];
    if (items.length < 250) return;
  }
}

const normPhone = (s: string) => (s || "").replace(/[^0-9]/g, "");
const KOMMO_WON = 142, KOMMO_LOST = 143;
const PLAN_FIELD_HINTS = ["plan", "producto", "programa"];

// Kommo status name → Klosify stage name, when they differ (lowercased keys).
const STAGE_ALIASES: Record<string, string> = {
  "lead nuevo": "nuevo contacto",
  "incoming leads": "nuevo contacto",
  "no interesados": "no interesado",
  "calientes (pendientes de pago)": "calientes",
  "no asistio": "no asiste a cita",
  "no asistió": "no asiste a cita",
};
// Kommo user email → Klosify member email, when they differ.
const OWNER_EMAIL_ALIASES: Record<string, string> = {
  "administracion@cristhianduran.com": "marketing@cristhianduran.com",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const migrateKey = Deno.env.get("KOMMO_MIGRATE_KEY") ?? "";
    const auth = req.headers.get("authorization") ?? "";
    const xKey = req.headers.get("x-migrate-key") ?? "";
    if (!(migrateKey && xKey === migrateKey) && !auth.includes(serviceKey)) {
      return json({ error: "forbidden" }, 403);
    }
    if (!KOMMO_TOKEN || !KOMMO_SUBDOMAIN) return json({ error: "KOMMO_TOKEN / KOMMO_SUBDOMAIN no configurados" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "inspect";

    // ── INSPECT ──────────────────────────────────────────────────────────────
    if (action === "inspect") {
      const account = await kommo("/account");
      const pipes = await kommo("/leads/pipelines");
      const users = await kommo("/users?limit=250");
      const cfields = await kommo("/leads/custom_fields").catch(() => null);
      let total = 0;
      const statusCounts: Record<string, number> = {};
      for await (const batch of pages("/leads", "leads")) {
        total += batch.length;
        for (const l of batch) statusCounts[`${l.pipeline_id}:${l.status_id}`] = (statusCounts[`${l.pipeline_id}:${l.status_id}`] ?? 0) + 1;
      }
      return json({
        account: { id: account?.id, name: account?.name },
        total_leads: total,
        pipelines: (pipes?._embedded?.pipelines ?? []).map((p: any) => ({
          id: p.id, name: p.name,
          statuses: (p._embedded?.statuses ?? []).map((s: any) => ({
            id: s.id, name: s.name, leads: statusCounts[`${p.id}:${s.id}`] ?? 0,
          })),
        })),
        users: (users?._embedded?.users ?? []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
        lead_custom_fields: (cfields?._embedded?.custom_fields ?? []).map((f: any) => ({ id: f.id, name: f.name, type: f.type })),
      });
    }

    // ── MIGRATE ──────────────────────────────────────────────────────────────
    if (action === "migrate") {
      const orgId: string = body.organization_id;
      const dryRun: boolean = body.dry_run !== false; // default DRY RUN for safety
      const updatedSince: number | null = body.updated_since ?? null; // unix seconds
      if (!orgId) return json({ error: "organization_id es obligatorio" }, 400);

      // Klosify destination context
      const { data: pipeline } = await supabase.from("pipelines").select("id")
        .eq("organization_id", orgId).order("created_at").limit(1).maybeSingle();
      if (!pipeline) return json({ error: "La organización no tiene pipeline" }, 400);
      const { data: stages } = await supabase.from("pipeline_stages")
        .select("id, name").eq("pipeline_id", pipeline.id);
      const stageByName = new Map((stages ?? []).map((s: any) => [s.name.trim().toLowerCase(), s.id]));
      const { data: members } = await supabase
        .from("organization_members").select("user_id, role").eq("organization_id", orgId);
      const ownerRow = (members ?? []).find((m: any) => m.role === "owner") ?? (members ?? [])[0];
      const emailByUser = new Map<string, string>();
      for (const m of members ?? []) {
        const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
        const em = u?.user?.email?.toLowerCase();
        if (em) emailByUser.set(em, m.user_id);
      }
      const { data: products } = await supabase.from("products").select("id, name").eq("organization_id", orgId);

      // Kommo reference data
      const pipes = await kommo("/leads/pipelines");
      const statusName = new Map<number, string>();
      for (const p of pipes?._embedded?.pipelines ?? [])
        for (const s of p._embedded?.statuses ?? []) statusName.set(s.id, s.name);
      const users = await kommo("/users?limit=250");
      const kommoUserEmail = new Map<number, string>();
      for (const u of users?._embedded?.users ?? []) kommoUserEmail.set(u.id, (u.email ?? "").toLowerCase());

      const stats = { total: 0, created: 0, updated: 0, skipped_no_contact_info: 0, won: 0, lost: 0, no_contact_ref: 0, ref_not_fetched: 0, contact_without_phone_email: 0 };
      const unmappedStatuses = new Set<string>();
      const sample: any[] = [];

      // Resumable pagination: caller drives page windows so a 16k-lead run
      // never hits the function wall-clock limit.
      const startPage: number = body.start_page ?? 1;
      const maxPages: number = body.max_pages ?? 12;
      let nextPage: number | null = null;

      // Preload EVERY existing org contact once (id + match keys) so per-lead
      // matching is in-memory instead of 3 queries × 16k leads.
      const byKommoId = new Map<string, string>();
      const byPhone = new Map<string, string>();
      const byEmail = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data: page } = await supabase.from("contacts")
          .select("id, primary_phone, primary_email, custom_fields")
          .eq("organization_id", orgId).range(from, from + 999);
        for (const c of page ?? []) {
          const kid = (c.custom_fields as any)?.kommo_lead_id;
          if (kid) byKommoId.set(String(kid), c.id);
          const ph = normPhone(c.primary_phone ?? "");
          if (ph) byPhone.set(ph.slice(-10), c.id);
          if (c.primary_email) byEmail.set(String(c.primary_email).toLowerCase(), c.id);
        }
        if (!page || page.length < 1000) break;
      }

      const leadPath = updatedSince
        ? `/leads?with=contacts&filter[updated_at][from]=${updatedSince}`
        : `/leads?with=contacts`;
      const toInsert: Record<string, unknown>[] = [];

      for (let pageN = startPage; pageN < startPage + maxPages; pageN++) {
        const sep = leadPath.includes("?") ? "&" : "?";
        const pageData = await kommo(`${leadPath}${sep}limit=250&page=${pageN}`);
        const batch = pageData?._embedded?.leads ?? [];
        if (!batch.length) { nextPage = null; break; }
        nextPage = batch.length === 250 ? pageN + 1 : null;
        // Fetch this page's contacts in one shot for phones/emails
        const contactIds = [...new Set(batch.flatMap((l: any) =>
          (l._embedded?.contacts ?? []).map((c: any) => c.id)))];
        const contactById = new Map<number, any>();
        for (let i = 0; i < contactIds.length; i += 200) {
          const chunk = contactIds.slice(i, i + 200);
          const q = chunk.map((id) => `filter[id][]=${id}`).join("&");
          const cs = await kommo(`/contacts?${q}&limit=250`);
          for (const c of cs?._embedded?.contacts ?? []) contactById.set(c.id, c);
        }

        for (const lead of batch) {
          stats.total++;
          // Contact info (main contact first)
          const refs = lead._embedded?.contacts ?? [];
          const mainRef = refs.find((r: any) => r.is_main) ?? refs[0];
          const kc = mainRef ? contactById.get(mainRef.id) : null;
          let phone = "", email = "";
          let firstName = kc?.first_name ?? "", lastName = kc?.last_name ?? "";
          for (const f of kc?.custom_fields_values ?? []) {
            if (f.field_code === "PHONE" && !phone) phone = normPhone(f.values?.[0]?.value ?? "");
            if (f.field_code === "EMAIL" && !email) email = String(f.values?.[0]?.value ?? "").trim().toLowerCase();
          }
          // Fallbacks — Kommo WhatsApp-channel contacts often carry the number
          // as the contact/lead NAME (or in a custom text field), not in PHONE.
          if (!phone || !email) {
            for (const f of kc?.custom_fields_values ?? []) {
              for (const v of f.values ?? []) {
                const s = String(v?.value ?? "").trim();
                if (!phone && /^\+?[\d\s().-]{8,20}$/.test(s) && normPhone(s).length >= 8) phone = normPhone(s);
                if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) email = s.toLowerCase();
              }
            }
          }
          if (!phone) {
            for (const cand of [kc?.name, lead.name]) {
              const digits = normPhone(String(cand ?? ""));
              const clean = String(cand ?? "").trim();
              if (digits.length >= 8 && digits.length >= clean.replace(/[\s+().-]/g, "").length - 1) { phone = digits; break; }
            }
          }
          if (!phone && !email) {
            stats.skipped_no_contact_info++;
            if (!mainRef) stats.no_contact_ref++;
            else if (!kc) stats.ref_not_fetched++;
            else stats.contact_without_phone_email++;
            continue;
          }

          // Stage + status (alias-aware: Kommo names differ slightly from Klosify)
          const sName = (statusName.get(lead.status_id) ?? "").trim();
          const sKey = sName.toLowerCase();
          let leadStatus = "active";
          let stageId = stageByName.get(STAGE_ALIASES[sKey] ?? sKey) ?? null;
          if (lead.status_id === KOMMO_WON) { leadStatus = "won"; stageId = stageByName.get("ganado") ?? stageId; stats.won++; }
          else if (lead.status_id === KOMMO_LOST) { leadStatus = "lost"; stageId = stageByName.get("perdido") ?? stageId; stats.lost++; }
          else if (!stageId) { unmappedStatuses.add(sName || String(lead.status_id)); stageId = stageByName.get("nuevo contacto") ?? null; }

          // Owner by responsible user email (alias-aware)
          const rEmail = kommoUserEmail.get(lead.responsible_user_id) ?? "";
          const ownerId = emailByUser.get(OWNER_EMAIL_ALIASES[rEmail] ?? rEmail) ?? ownerRow?.user_id ?? null;

          // Custom fields: plan (→ won product), UTMs, razón de pérdida, extras
          let planValue: string | null = null, lostReason: string | null = null;
          const utm: Record<string, string> = {};
          const extraCf: Record<string, string> = {};
          for (const f of lead.custom_fields_values ?? []) {
            const fname = String(f.field_name ?? "").toLowerCase();
            const val = String(f.values?.[0]?.value ?? "").trim();
            if (!val) continue;
            if (!planValue && PLAN_FIELD_HINTS.some((h) => fname.includes(h))) planValue = val;
            else if (fname === "utm_source") utm.utm_source = val;
            else if (fname === "utm_medium") utm.utm_medium = val;
            else if (fname === "utm_campaign") utm.utm_campaign = val;
            else if (fname === "utm_content") utm.utm_content = val;
            else if (fname === "utm_term") utm.utm_term = val;
            else if (fname.includes("razón de pérdida") || fname.includes("razon de perdida")) lostReason = val;
            else if (fname.includes("libras")) extraCf.libras_a_bajar = val;
            else if (fname.includes("razón de contacto") || fname.includes("razon de contacto")) extraCf.razon_de_contacto = val;
          }
          let wonProductId: string | null = null;
          if (planValue) {
            const pv = planValue.toLowerCase();
            const prod = (products ?? []).find((p: any) =>
              pv.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(pv));
            wonProductId = prod?.id ?? null;
          }

          const kommoTags = (lead._embedded?.tags ?? []).map((t: any) => t.name).filter(Boolean);
          // Prefer the CONTACT's real name. Kommo auto-names chat leads
          // "Facebook №…"/"WhatsApp №…" (and sometimes just the phone) — those
          // are junk, not people. Fall back lead.name → phone/email last.
          const isJunkName = (s: string) =>
            !s || /^\d+$/.test(s) || /^lead\s*#/i.test(s) || /№/.test(s) ||
            /^(facebook|whatsapp|instagram|telegram)\b/i.test(s);
          const contactName = [firstName, lastName].filter(Boolean).join(" ").trim();
          const leadName = (lead.name ?? "").trim();
          const fullName = (!isJunkName(contactName) && contactName)
            || (!isJunkName(leadName) && leadName)
            || phone || email;

          const cf: Record<string, unknown> = {
            kommo_lead_id: String(lead.id),
            ...(planValue ? { kommo_plan: planValue } : {}),
            ...extraCf,
          };
          const row: Record<string, unknown> = {
            organization_id: orgId,
            full_name: fullName,
            first_name: firstName || fullName.split(" ")[0],
            last_name: lastName || null,
            primary_phone: phone ? `+${phone}` : null,
            primary_email: email || null,
            budget: typeof lead.price === "number" && lead.price > 0 ? lead.price : null,
            source: "kommo",
            lead_status: leadStatus,
            pipeline_id: pipeline.id,
            stage_id: stageId,
            owner_id: ownerId,
            tags: kommoTags,
            created_at: lead.created_at ? new Date(lead.created_at * 1000).toISOString() : undefined,
            ...utm,
            ...(wonProductId ? { won_product_id: wonProductId } : {}),
            ...(lostReason ? { lost_reason: lostReason } : {}),
          };

          if (sample.length < 6) sample.push({ ...row, kommo_status: sName, plan: planValue });
          if (dryRun) continue;

          // Idempotent match (all in-memory): kommo_lead_id → phone → email
          const existingId = byKommoId.get(String(lead.id))
            ?? (phone ? byPhone.get(phone.slice(-10)) : undefined)
            ?? (email ? byEmail.get(email) : undefined)
            ?? null;

          if (existingId === "pending") { continue; } // duplicate within this run — first occurrence wins
          if (existingId) {
            const { data: cur } = await supabase.from("contacts")
              .select("tags, custom_fields").eq("id", existingId).maybeSingle();
            const mergedTags = [...new Set([...(cur?.tags ?? []), ...kommoTags])];
            const mergedCf = { ...(cur?.custom_fields ?? {}), ...cf };
            const patch = { ...row, tags: mergedTags, custom_fields: mergedCf };
            delete (patch as Record<string, unknown>).created_at; // keep original
            await supabase.from("contacts").update(patch).eq("id", existingId);
            stats.updated++;
          } else {
            toInsert.push({ ...row, custom_fields: cf, status: "new" });
            // Register in maps so an in-file duplicate updates instead of duplicating
            if (phone) byPhone.set(phone.slice(-10), "pending");
            if (email) byEmail.set(email, "pending");
          }
        }
      }

      // Bulk insert new contacts in chunks
      const insertErrors: Record<string, number> = {};
      if (!dryRun) {
        for (let i = 0; i < toInsert.length; i += 100) {
          const chunk = toInsert.slice(i, i + 100);
          const { error } = await supabase.from("contacts").insert(chunk);
          if (error) {
            // Fall back to row-by-row so one bad row doesn't sink the chunk
            for (const r of chunk) {
              const { error: e2 } = await supabase.from("contacts").insert(r);
              if (!e2) stats.created++;
              else insertErrors[e2.message.slice(0, 120)] = (insertErrors[e2.message.slice(0, 120)] ?? 0) + 1;
            }
          } else stats.created += chunk.length;
        }
        // Sync migrated tags into the org catalog (best effort)
        const allTags = [...new Set(toInsert.flatMap((r: any) => (r.tags as string[]) ?? []))];
        for (const t of allTags.slice(0, 300)) {
          await supabase.from("organization_tags").upsert(
            { organization_id: orgId, name: t },
            { onConflict: "organization_id,name", ignoreDuplicates: true });
        }
      }

      return json({ dry_run: dryRun, stats, insert_errors: insertErrors, next_page: nextPage, unmapped_statuses: [...unmappedStatuses], sample: dryRun ? sample : sample.slice(0, 2) });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

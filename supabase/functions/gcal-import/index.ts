/**
 * gcal-import — importación puntual de eventos de Google Calendar a meetings de
 * Klosify (para organizaciones que agendaron fuera del CRM). Idempotente por
 * google_event_id. Guardado detrás de una clave interna.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-key",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => null);
  return body?.access_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.headers.get("x-import-key") !== (Deno.env.get("GCAL_IMPORT_KEY") || "klosify-gcal-import-2026")) {
    return json({ error: "forbidden" }, 403);
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { organization_id, user_id, days = 7, dry_run = false } = await req.json();
    if (!organization_id || !user_id) return json({ error: "organization_id y user_id son obligatorios" }, 400);

    const { data: tok } = await supabase
      .from("google_calendar_tokens")
      .select("provider_token, provider_refresh_token, calendar_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!tok?.provider_refresh_token) return json({ error: "Ese usuario no tiene Google Calendar conectado" }, 400);

    const accessToken = await refreshAccessToken(tok.provider_refresh_token);
    if (!accessToken) return json({ error: "No se pudo refrescar el token de Google" }, 500);

    const calId = tok.calendar_id || "primary";
    const timeMin = new Date(); timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin.getTime() + days * 86_400_000);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?` +
      new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
    const evRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const evJson = await evRes.json();
    if (!evRes.ok) return json({ error: evJson?.error?.message || "Error de Google Calendar" }, 500);

    const events = (evJson.items || []).filter((e: any) => e.status !== "cancelled" && e.start?.dateTime);
    const results: any[] = [];
    let created = 0, updated = 0, skipped = 0;

    for (const e of events) {
      // Emparejar contacto por email de asistente (excluyendo al organizador).
      let contactId: string | null = null;
      const attendees = (e.attendees || []).filter((a: any) => !a.organizer && a.email);
      for (const a of attendees) {
        const { data: c } = await supabase
          .from("contacts").select("id")
          .eq("organization_id", organization_id)
          .ilike("primary_email", a.email)
          .limit(1).maybeSingle();
        if (c) { contactId = c.id; break; }
      }

      const meetingType = e.hangoutLink || (e.conferenceData ? "video" : null) ? "video" : "in_person";
      const row = {
        organization_id,
        advisor_id: user_id,
        google_event_id: e.id,
        title: e.summary || "Cita (Google Calendar)",
        start_at: e.start.dateTime,
        end_at: e.end?.dateTime ?? e.start.dateTime,
        timezone: e.start.timeZone || "America/Bogota",
        status: "scheduled",
        meeting_type: meetingType,
        location_or_link: e.hangoutLink || e.location || null,
        notes: e.description || null,
        contact_id: contactId,
      };

      // ¿Ya existe por google_event_id en esta org?
      const { data: existing } = await supabase
        .from("meetings").select("id")
        .eq("organization_id", organization_id)
        .eq("google_event_id", e.id)
        .maybeSingle();

      if (dry_run) {
        results.push({ title: row.title, start: row.start_at, contact: contactId ? "match" : "sin contacto", action: existing ? "update" : "create" });
        existing ? updated++ : created++;
        continue;
      }

      if (existing) {
        await supabase.from("meetings").update(row).eq("id", existing.id);
        updated++;
      } else {
        const { error } = await supabase.from("meetings").insert(row);
        if (error) { results.push({ title: row.title, error: error.message }); skipped++; continue; }
        created++;
      }
    }

    return json({ ok: true, total: events.length, created, updated, skipped, sample: results.slice(0, 30) });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

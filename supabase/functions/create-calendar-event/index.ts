import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Google Calendar Event Manager
 *
 * Supports three actions (pass via body.action):
 *   create  — creates a new event and returns { google_event_id, html_link }
 *   update  — patches an existing event by body.google_event_id
 *   delete  — deletes an event by body.google_event_id
 *
 * Token refresh: if the stored access token is expired (401 from Google),
 * the function tries to refresh it using the stored refresh token.
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to be set as
 * Supabase Function Secrets for refresh to work.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const GCAL_ROOT = "https://www.googleapis.com/calendar/v3/calendars";
const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const eventsBase = (calId: string) =>
  `${GCAL_ROOT}/${encodeURIComponent(calId || "primary")}/events`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.access_token ?? null;
}

// Call Google Calendar API; auto-refresh once on 401
async function gcalFetch(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  url: string,
  init: RequestInit,
  accessToken: string,
  refreshToken: string | null,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  let res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401 && refreshToken) {
    const newToken = await refreshAccessToken(refreshToken);
    if (newToken) {
      // Persist the refreshed token
      await supabase
        .from("google_calendar_tokens")
        .update({ provider_token: newToken, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      res = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${newToken}` },
      });
    }
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const token = authHeader.replace("Bearer ", "");

    // Two callers:
    //  • A signed-in user (normal UI flow) → resolve their identity from the JWT.
    //  • The AI agent (server-side) → passes the SERVICE_ROLE_KEY and a body.user_id
    //    telling us whose calendar to write to (the assigned advisor / owner).
    const bodyRaw = await req.json();

    // Detect a server-side (service-role) caller robustly: decode the JWT and
    // check role === 'service_role' instead of comparing the exact key string
    // (which breaks when Supabase rotates / uses different key formats).
    const isServiceRole = (jwt: string): boolean => {
      try {
        const payload = JSON.parse(atob(jwt.split(".")[1] || ""));
        return payload.role === "service_role";
      } catch { return false; }
    };

    let userId: string;
    if ((token === SUPABASE_KEY || isServiceRole(token)) && bodyRaw.user_id) {
      userId = bodyRaw.user_id;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return json({ error: "Invalid user" }, 401);
      userId = user.id;
    }
    const user = { id: userId };

    const { data: tokenRow, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("provider_token, provider_refresh_token, calendar_id")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenRow) {
      return json({ error: "Google Calendar not connected", code: "NOT_CONNECTED" }, 400);
    }

    const { provider_token: accessToken, provider_refresh_token: refreshToken } = tokenRow;
    const calendarId: string = (tokenRow as any).calendar_id || "primary";
    const GCAL_BASE = eventsBase(calendarId);

    const body = bodyRaw;
    const { action = "create", google_event_id, title, description, start_at, end_at, location, attendee_email, create_meet } = body;
    // When the event has an attendee, ask Google to email invites/updates/cancels.
    const sendUpdates = attendee_email ? "all" : "none";

    // ── LIST CALENDARS — for the picker in the UI ─────────────────────────────
    if (action === "list_calendars") {
      const result = await gcalFetch(
        supabase, user.id, CALENDAR_LIST_URL, { method: "GET" }, accessToken, refreshToken,
      );
      if (!result.ok) {
        if (result.status === 401) {
          await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
          return json({ error: "Token de Google expirado. Reconecta Google Calendar.", code: "TOKEN_EXPIRED" }, 401);
        }
        return json({ error: `Google Calendar error [${result.status}]` }, 500);
      }
      const items = ((result.body as any)?.items || [])
        .filter((c: any) => c.accessRole === "owner" || c.accessRole === "writer")
        .map((c: any) => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: !!c.primary }));
      return json({ success: true, calendars: items, selected: calendarId });
    }

    // ── FREEBUSY — return busy intervals in a time range (for availability) ───
    if (action === "freebusy") {
      const { time_min, time_max } = body;
      if (!time_min || !time_max) return json({ error: "time_min and time_max required" }, 400);
      const result = await gcalFetch(
        supabase, user.id,
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeMin: time_min, timeMax: time_max, timeZone: "America/Bogota",
            items: [{ id: calendarId }],
          }),
        },
        accessToken, refreshToken,
      );
      if (!result.ok) {
        if (result.status === 401) {
          await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
          return json({ error: "Token de Google expirado.", code: "TOKEN_EXPIRED" }, 401);
        }
        return json({ error: `Google Calendar error [${result.status}]` }, 500);
      }
      const cals = (result.body as any)?.calendars || {};
      const busy = cals[calendarId]?.busy || cals["primary"]?.busy || [];
      return json({ success: true, busy });
    }

    // ── SET CALENDAR — persist which calendar to use ──────────────────────────
    if (action === "set_calendar") {
      const newId = body.calendar_id || "primary";
      const { error } = await supabase.from("google_calendar_tokens")
        .update({ calendar_id: newId, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, selected: newId });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === "delete") {
      if (!google_event_id) return json({ error: "google_event_id required for delete" }, 400);
      const result = await gcalFetch(
        supabase, user.id,
        `${GCAL_BASE}/${google_event_id}?sendUpdates=all`,
        { method: "DELETE" },
        accessToken, refreshToken,
      );
      if (!result.ok && result.status !== 404) {
        if (result.status === 401) {
          await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
          return json({ error: "Token de Google expirado. Reconecta Google Calendar.", code: "TOKEN_EXPIRED" }, 401);
        }
        return json({ error: `Google Calendar error [${result.status}]` }, 500);
      }
      return json({ success: true });
    }

    // ── Build event payload (shared by create + update) ───────────────────────
    const eventPayload: Record<string, unknown> = {
      summary: title,
      description: description || undefined,
      start: { dateTime: start_at, timeZone: "America/Bogota" },
      end:   { dateTime: end_at,   timeZone: "America/Bogota" },
    };
    if (location) eventPayload.location = location;
    if (attendee_email) eventPayload.attendees = [{ email: attendee_email }];
    // Virtual meeting → ask Google to generate a Google Meet link.
    if (create_meet) {
      eventPayload.conferenceData = {
        createRequest: {
          requestId: `klosify-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }
    const conf = create_meet ? "&conferenceDataVersion=1" : "";

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === "update") {
      if (!google_event_id) return json({ error: "google_event_id required for update" }, 400);
      const result = await gcalFetch(
        supabase, user.id,
        `${GCAL_BASE}/${google_event_id}?sendUpdates=${sendUpdates}${conf}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload) },
        accessToken, refreshToken,
      );
      if (!result.ok) {
        if (result.status === 401) {
          await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
          return json({ error: "Token de Google expirado. Reconecta Google Calendar.", code: "TOKEN_EXPIRED" }, 401);
        }
        return json({ error: `Google Calendar error [${result.status}]` }, 500);
      }
      const ev = result.body as any;
      return json({ success: true, google_event_id: ev.id, html_link: ev.htmlLink, meet_link: ev.hangoutLink || null });
    }

    // ── CREATE (default) ──────────────────────────────────────────────────────
    const result = await gcalFetch(
      supabase, user.id,
      `${GCAL_BASE}?sendUpdates=${sendUpdates}${conf}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload) },
      accessToken, refreshToken,
    );
    if (!result.ok) {
      if (result.status === 401) {
        await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
        return json({ error: "Token de Google expirado. Reconecta Google Calendar.", code: "TOKEN_EXPIRED" }, 401);
      }
      return json({ error: `Google Calendar error [${result.status}]: ${JSON.stringify(result.body)}` }, 500);
    }
    const ev = result.body as any;
    // Meet link lives in hangoutLink or conferenceData.entryPoints
    const meetLink = ev.hangoutLink
      || (ev.conferenceData?.entryPoints || []).find((e: any) => e.entryPointType === "video")?.uri
      || null;
    return json({ success: true, google_event_id: ev.id, html_link: ev.htmlLink, meet_link: meetLink });

  } catch (err) {
    console.error("create-calendar-event error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

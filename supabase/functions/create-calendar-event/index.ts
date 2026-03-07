import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get stored Google token
    const { data: tokenData, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("provider_token, provider_refresh_token")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not connected", code: "NOT_CONNECTED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, description, start_at, end_at, location, attendee_email } = await req.json();

    // Build Google Calendar event
    const event: Record<string, unknown> = {
      summary: title,
      description: description || undefined,
      start: {
        dateTime: start_at,
        timeZone: "America/Mexico_City",
      },
      end: {
        dateTime: end_at,
        timeZone: "America/Mexico_City",
      },
    };

    if (location) {
      event.location = location;
    }

    if (attendee_email) {
      event.attendees = [{ email: attendee_email }];
    }

    // Create event in Google Calendar
    const gcalResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.provider_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!gcalResponse.ok) {
      const errorBody = await gcalResponse.text();
      console.error("Google Calendar API error:", gcalResponse.status, errorBody);

      // If token expired, mark as disconnected
      if (gcalResponse.status === 401) {
        await supabase
          .from("google_calendar_tokens")
          .delete()
          .eq("user_id", user.id);

        return new Response(
          JSON.stringify({
            error: "Token de Google expirado. Reconecta Google Calendar.",
            code: "TOKEN_EXPIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Google Calendar error [${gcalResponse.status}]: ${errorBody}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gcalEvent = await gcalResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        google_event_id: gcalEvent.id,
        html_link: gcalEvent.htmlLink,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

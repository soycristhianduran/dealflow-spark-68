import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useGoogleCalendar() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // ── Check connection ────────────────────────────────────────────────────────
  const checkConnection = useCallback(async () => {
    if (!user) { setIsConnected(false); setLoading(false); return; }
    const { data } = await supabase
      .from("google_calendar_tokens")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsConnected(!!data);
    setLoading(false);
  }, [user]);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  // Handle the return from the dedicated Google Calendar OAuth flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (!gcal) return;
    if (gcal === "connected") {
      setIsConnected(true);
      setConnecting(false);
      toast.success("Google Calendar conectado correctamente");
      checkConnection();
    } else if (gcal === "error") {
      setConnecting(false);
      toast.error("No se pudo conectar Google Calendar: " + (params.get("reason") || "intenta de nuevo"));
    }
    // Clean the URL so the toast doesn't fire again on refresh
    params.delete("gcal"); params.delete("reason");
    const clean = window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash;
    window.history.replaceState({}, "", clean);
  }, [checkConnection]);

  // ── Capture provider_token after Google OAuth redirect ─────────────────────
  // When the user returns from the Google consent screen, Supabase fires
  // onAuthStateChange with the new session that includes provider_token.
  // We store it in google_calendar_tokens so the edge function can use it.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session?.provider_token &&
          session?.user
        ) {
          const { error } = await supabase
            .from("google_calendar_tokens")
            .upsert(
              {
                user_id: session.user.id,
                provider_token: session.provider_token,
                provider_refresh_token: session.provider_refresh_token ?? null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
          if (!error) {
            setIsConnected(true);
            setConnecting(false);
            toast.success("Google Calendar conectado correctamente");
          }
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────────
  // Dedicated Google Calendar OAuth (NOT the app login). Redirects to Google's
  // consent screen with access_type=offline & prompt=consent so Google returns a
  // refresh_token, then back to our google-calendar-callback edge function which
  // exchanges the code and stores both tokens. This does NOT touch the user's
  // login session and reliably captures the refresh token.
  const GOOGLE_CLIENT_ID =
    "573126544961-nbaur53qpl87sd8ujs2u8kctf9upo6sl.apps.googleusercontent.com";
  const CALLBACK_URL =
    "https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/google-calendar-callback";

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      // Pass the current session JWT so the callback can verify who we are.
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) {
        toast.error("Inicia sesión de nuevo para conectar Google Calendar");
        setConnecting(false);
        return;
      }
      const state = btoa(JSON.stringify({ jwt, return_url: window.location.href }));
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        response_type: "code",
        // calendar.events = crear/editar/borrar eventos.
        // calendar.readonly = leer disponibilidad (freeBusy) y listar calendarios.
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      });
      window.location.href =
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } catch (err) {
      toast.error("Error al iniciar conexión con Google");
      setConnecting(false);
    }
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("google_calendar_tokens")
      .delete()
      .eq("user_id", user.id);
    setIsConnected(false);
    toast.success("Google Calendar desconectado");
  }, [user]);

  // ── Internal invoker ─────────────────────────────────────────────────────────
  const invokeCalendarFn = useCallback(
    async (body: Record<string, unknown>) => {
      if (!isConnected) return null;
      const { data, error } = await supabase.functions.invoke(
        "create-calendar-event",
        { body }
      );
      if (error || !data?.success) {
        console.warn("Google Calendar fn error:", error, data);
        if (data?.code === "TOKEN_EXPIRED") {
          setIsConnected(false);
          toast.error(
            "Tu sesión de Google expiró. Reconecta desde Integraciones → Google Calendar.",
            { duration: 8000 }
          );
        }
        return null;
      }
      return data;
    },
    [isConnected]
  );

  // ── Public API ───────────────────────────────────────────────────────────────
  const createEvent = useCallback(
    async (params: {
      title: string;
      start_at: string;
      end_at: string;
      description?: string;
      location?: string;
      attendee_email?: string;
      create_meet?: boolean;
    }) => invokeCalendarFn({ action: "create", ...params }),
    [invokeCalendarFn]
  );

  const updateEvent = useCallback(
    async (
      googleEventId: string,
      params: {
        title: string;
        start_at: string;
        end_at: string;
        description?: string;
        location?: string;
        attendee_email?: string;
        create_meet?: boolean;
      }
    ) => invokeCalendarFn({ action: "update", google_event_id: googleEventId, ...params }),
    [invokeCalendarFn]
  );

  const deleteEvent = useCallback(
    async (googleEventId: string) =>
      invokeCalendarFn({ action: "delete", google_event_id: googleEventId }),
    [invokeCalendarFn]
  );

  // List the user's Google calendars (only ones they can write to)
  const listCalendars = useCallback(async (): Promise<
    { calendars: { id: string; summary: string; primary: boolean }[]; selected: string } | null
  > => {
    const { data, error } = await supabase.functions.invoke("create-calendar-event", {
      body: { action: "list_calendars" },
    });
    if (error || !data?.success) return null;
    return { calendars: data.calendars || [], selected: data.selected || "primary" };
  }, []);

  // Persist which calendar to use for new events
  const setCalendar = useCallback(async (calendarId: string): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke("create-calendar-event", {
      body: { action: "set_calendar", calendar_id: calendarId },
    });
    return !error && !!data?.success;
  }, []);

  return {
    isConnected,
    loading,
    connecting,
    connect,
    disconnect,
    createEvent,
    updateEvent,
    deleteEvent,
    checkConnection,
    listCalendars,
    setCalendar,
  };
}

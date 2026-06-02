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
  // Uses Supabase's native Google OAuth. The user is redirected to Google's
  // consent screen and back. The redirectTo URL must be in the Supabase
  // dashboard's "Redirect URLs" allowlist (add your domain there).
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "https://www.googleapis.com/auth/calendar.events",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
          redirectTo: window.location.href,
        },
      });
      if (error) {
        toast.error("Error al conectar Google Calendar: " + error.message);
        setConnecting(false);
      }
      // If no error, the browser will redirect to Google.
      // setConnecting stays true until the redirect.
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
      }
    ) => invokeCalendarFn({ action: "update", google_event_id: googleEventId, ...params }),
    [invokeCalendarFn]
  );

  const deleteEvent = useCallback(
    async (googleEventId: string) =>
      invokeCalendarFn({ action: "delete", google_event_id: googleEventId }),
    [invokeCalendarFn]
  );

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
  };
}

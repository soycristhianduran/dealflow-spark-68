import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useGoogleCalendar() {
  const { user, session } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const checkConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("google_calendar_tokens")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    setIsConnected(!!data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Listen for auth state changes to capture provider_token after Google OAuth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.provider_token && session?.user) {
        // Store the Google token
        const { error } = await supabase.from("google_calendar_tokens").upsert(
          {
            user_id: session.user.id,
            provider_token: session.provider_token,
            provider_refresh_token: session.provider_refresh_token || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (!error) {
          setIsConnected(true);
          toast.success("Google Calendar conectado exitosamente");
        }
        setConnecting(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          access_type: "offline",
          prompt: "consent",
          scope: "https://www.googleapis.com/auth/calendar.events",
        },
      });
      if (result.error) {
        toast.error("Error al conectar con Google: " + result.error.message);
        setConnecting(false);
      }
    } catch (err) {
      toast.error("Error al iniciar conexión con Google");
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("google_calendar_tokens")
      .delete()
      .eq("user_id", user.id);
    setIsConnected(false);
    toast.success("Google Calendar desconectado");
  }, [user]);

  const createEvent = useCallback(
    async (params: {
      title: string;
      start_at: string;
      end_at: string;
      description?: string;
      location?: string;
      attendee_email?: string;
    }) => {
      if (!isConnected) return null;

      const { data, error } = await supabase.functions.invoke("create-calendar-event", {
        body: params,
      });

      if (error) {
        console.error("Error creating Google Calendar event:", error);
        if (data?.code === "TOKEN_EXPIRED") {
          setIsConnected(false);
          toast.error("Token de Google expirado. Reconecta Google Calendar desde Integraciones.");
        }
        return null;
      }
      return data;
    },
    [isConnected]
  );

  return { isConnected, loading, connecting, connect, disconnect, createEvent, checkConnection };
}

import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  lastAuthEvent: string | null;   // latest onAuthStateChange event name
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  lastAuthEvent: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAuthEvent, setLastAuthEvent] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Track the event name so AuthPage can distinguish INITIAL_SESSION
      // (stale cached token) from SIGNED_IN (real new login).
      setLastAuthEvent(event);
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // scope:'local' clears localStorage instantly (no network round-trip needed).
    // The server-side session expires on its own (Supabase default: 1 hour).
    // This makes logout instant and reliable even on slow connections.
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/auth";
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, lastAuthEvent, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

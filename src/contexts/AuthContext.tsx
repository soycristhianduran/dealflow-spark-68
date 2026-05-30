import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Straightforward: keep React in sync with whatever Supabase reports.
      // The old SIGNED_OUT re-check was a workaround for an RLS recursion bug
      // (fixed in 20260514 + 20260528 migrations). Keeping it caused a race
      // condition where getSession() still saw the stale token in localStorage
      // for a brief window, re-authenticating the user and making logout appear
      // stuck until a manual refresh.
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
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

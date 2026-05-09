/**
 * WorkspaceEntryPage — handles /w/:slug
 *
 * When a user opens a workspace link (e.g. app.aceleradoradeventas.co/w/cristhian-duran):
 *   • Logged in + member of that org  → redirect to dashboard
 *   • Logged in + NOT a member        → show access denied
 *   • Not logged in                   → redirect to /auth (after login, comes back here)
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getRootAppUrl } from "@/lib/subdomain";
import { Loader2 } from "lucide-react";

export default function WorkspaceEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "denied" | "not_found">("loading");

  useEffect(() => {
    if (authLoading) return;

    // Not logged in → redirect to auth, then come back
    if (!session) {
      navigate(`/auth?next=/w/${slug}`, { replace: true });
      return;
    }

    if (!slug) {
      navigate("/", { replace: true });
      return;
    }

    const check = async () => {
      // 1. Find org by slug
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("slug", slug)
        .maybeSingle();

      if (!org) {
        setStatus("not_found");
        return;
      }

      // 2. Check if current user is a member
      const { data: membership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", org.id)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!membership) {
        setStatus("denied");
        return;
      }

      // Member ✅ — go to dashboard
      navigate("/", { replace: true });
    };

    check();
  }, [authLoading, session, slug, navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isNotFound = status === "not_found";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mx-auto">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={isNotFound
                ? "M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                : "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              }
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {isNotFound ? "Espacio no encontrado" : "Acceso denegado"}
        </h1>
        <p className="text-muted-foreground">
          {isNotFound
            ? <>El espacio de trabajo <strong className="text-foreground">{slug}</strong> no existe.</>
            : <>No tienes acceso al espacio <strong className="text-foreground">{slug}</strong>. Debes ser invitado por el administrador de esa organización.</>
          }
        </p>
        <a
          href={getRootAppUrl()}
          className="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Ir a mi espacio de trabajo
        </a>
      </div>
    </div>
  );
}

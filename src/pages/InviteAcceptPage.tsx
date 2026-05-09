import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "loading" | "success" | "error" | "needs_auth";

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setStatus("error");
      setMessage("Enlace de invitación inválido. No se encontró el token.");
      return;
    }
    if (!session) {
      setStatus("needs_auth");
      return;
    }

    const acceptInvite = async () => {
      setStatus("loading");
      try {
        const { data, error } = await supabase.functions.invoke("org-invitations", {
          body: { action: "accept", token },
        });

        if (error) throw error;

        if (data?.error) {
          throw new Error(data.error);
        }

        setStatus("success");
        toast.success("Te has unido a la organización exitosamente");
        setTimeout(() => navigate("/"), 2000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message ?? "Error al aceptar la invitación");
      }
    };

    acceptInvite();
  }, [token, session, authLoading, navigate]);

  if (authLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "needs_auth") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invitación al equipo</CardTitle>
            <CardDescription>
              Debes iniciar sesión o registrarte para aceptar esta invitación.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tu invitación está lista. Inicia sesión con tu cuenta para unirte a la organización.
            </p>
            <Button
              className="w-full"
              onClick={() => navigate(`/auth?redirect=/invite?token=${token}`)}
            >
              Iniciar sesión / Registrarse
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Aceptando invitación...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-lg font-semibold">Bienvenido al equipo</p>
            <p className="text-sm text-muted-foreground text-center">
              Te has unido a la organización exitosamente. Redirigiendo...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <XCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-semibold">Error al aceptar invitación</p>
          <p className="text-sm text-muted-foreground text-center">{message}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            Ir al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

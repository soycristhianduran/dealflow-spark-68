import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Status = "idle" | "loading" | "success" | "error" | "needs_auth";

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setStatus("error");
      setMessage(t("inviteAcceptPage.invalidLink"));
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
        toast.success(t("inviteAcceptPage.joinSuccess"));
        setTimeout(() => navigate("/"), 2000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message ?? t("inviteAcceptPage.acceptError"));
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
            <CardTitle>{t("inviteAcceptPage.teamInviteTitle")}</CardTitle>
            <CardDescription>
              {t("inviteAcceptPage.needsAuthDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("inviteAcceptPage.needsAuthBody")}
            </p>
            <Button
              className="w-full"
              onClick={() => navigate(`/auth?redirect=/invite?token=${token}`)}
            >
              {t("inviteAcceptPage.signInRegister")}
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
            <p className="text-sm text-muted-foreground">{t("inviteAcceptPage.accepting")}</p>
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
            <p className="text-lg font-semibold">{t("inviteAcceptPage.welcomeTeam")}</p>
            <p className="text-sm text-muted-foreground text-center">
              {t("inviteAcceptPage.joinSuccessRedirect")}
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
          <p className="text-lg font-semibold">{t("inviteAcceptPage.acceptErrorTitle")}</p>
          <p className="text-sm text-muted-foreground text-center">{message}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            {t("inviteAcceptPage.goHome")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

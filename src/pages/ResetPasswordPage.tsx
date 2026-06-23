/**
 * ResetPasswordPage — handles the Supabase password-recovery link.
 *
 * Supabase redirects the user here after they click the email link:
 *   /auth/reset-password#access_token=...&type=recovery
 *
 * Supabase fires a PASSWORD_RECOVERY event in onAuthStateChange which
 * sets the session automatically. We just need to collect the new
 * password and call supabase.auth.updateUser().
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // true once recovery session is active

  // Supabase fires PASSWORD_RECOVERY when the user lands here from the email link.
  // We wait for that event before showing the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    // Also check if a session is already active (user refreshed the page)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t("resetPasswordPage.passwordsDoNotMatch"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("resetPasswordPage.passwordTooShort"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("resetPasswordPage.passwordUpdated"));
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("resetPasswordPage.title")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Klosify CRM</p>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-muted-foreground text-sm">{t("resetPasswordPage.verifyingLink")}</p>
              <p className="text-xs text-muted-foreground">
                {t("resetPasswordPage.takingTooLong")}{" "}
                <button onClick={() => navigate("/auth")} className="underline hover:text-foreground">
                  {t("resetPasswordPage.backToLogin")}
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("resetPasswordPage.newPasswordLabel")}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t("resetPasswordPage.minCharsPlaceholder")}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("resetPasswordPage.confirmPasswordLabel")}</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={t("resetPasswordPage.repeatPasswordPlaceholder")}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("resetPasswordPage.saving") : t("resetPasswordPage.savePassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

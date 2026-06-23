import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { toast } from "sonner";
import { CountryPhoneInput, getDialCode, detectCountryByTimezone } from "@/components/auth/CountryPhoneInput";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/metaPixel";
import { useTranslation } from "react-i18next";

const industries = [
  "Tecnología", "Finanzas y Banca", "Salud", "Educación", "Retail / Comercio",
  "Manufactura", "Construcción", "Inmobiliaria", "Alimentos y Bebidas",
  "Marketing y Publicidad", "Consultoría", "Legal", "Transporte y Logística",
  "Energía", "Telecomunicaciones", "Agricultura", "Turismo y Hotelería",
  "Seguros", "Automotriz", "Entretenimiento", "Otro",
];

const companySizes = [
  { value: "1-10", label: "1 – 10 empleados" },
  { value: "11-50", label: "11 – 50 empleados" },
  { value: "51-200", label: "51 – 200 empleados" },
  { value: "201-500", label: "201 – 500 empleados" },
  { value: "501-1000", label: "501 – 1,000 empleados" },
  { value: "1001+", label: "Más de 1,000 empleados" },
];

export default function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [view, setView] = useState<"tabs" | "forgot" | "forgot-sent">("tabs");
  const [forgotEmail, setForgotEmail] = useState("");

  // Detect if arriving from an invitation link
  const redirectParam = searchParams.get("redirect") || "";
  const inviteTokenMatch = redirectParam.match(/\/invite\?token=([^&]+)/);
  const inviteToken = inviteTokenMatch ? inviteTokenMatch[1] : null;
  const [email, setEmail] = useState("");
  const [inviteInfo, setInviteInfo] = useState<{ email: string; org_name: string; role: string } | null>(null);
  const [authTab, setAuthTab] = useState<"login" | "register">(inviteToken ? "register" : "login");

  // When arriving from an invite link, prefill + lock the email to the invited one.
  useEffect(() => {
    if (!inviteToken) return;
    supabase.functions.invoke("org-invitations", { body: { action: "get_invitation", token: inviteToken } })
      .then(({ data }) => {
        if (data?.email) {
          setInviteInfo({ email: data.email, org_name: data.org_name, role: data.role });
          setEmail(data.email);
        }
      })
      .catch(() => {});
  }, [inviteToken]);
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");

  // Redirect to workspace after login.
  // Onboarding for new Google users is handled by the global OnboardingModal
  // (rendered in App.tsx) — it shows as a popup once the session is set.
  useEffect(() => {
    if (!session) return;
    if (redirectParam) {
      navigate(redirectParam, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [session, navigate, redirectParam]);

  useEffect(() => {
    setCountryCode(detectCountryByTimezone());
  }, []);

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    // Clear any stale session from localStorage before starting the OAuth flow.
    // This is critical for the "delete user → re-register same email" test scenario:
    // without this, the old JWT (valid for up to 1 hour) stays in localStorage and
    // Supabase fires INITIAL_SESSION with it before SIGNED_IN with the new one.
    // scope:"local" = only clears localStorage (no network call needed).
    await supabase.auth.signOut({ scope: "local" });
    // Carry the invite through OAuth so we accept it after Google returns.
    const redirectTo = inviteToken
      ? `${window.location.origin}/auth?redirect=${encodeURIComponent(`/invite?token=${inviteToken}`)}`
      : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      toast.error(t("authPage.googleConnectError") + error.message);
      setGoogleLoading(false);
    }
    // On success, browser redirects to Google — googleLoading stays true
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) toast.error(error.message);
    else setView("forgot-sent");
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("authPage.nameRequired"));
      return;
    }
    setLoading(true);
    const fullPhone = phone ? `${getDialCode(countryCode)}${phone.replace(/\s/g, "")}` : "";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: fullPhone,
          industry,
          company_size: companySize,
          job_title: jobTitle,
          company_name: companyName.trim(),
          // Signal to the DB trigger to skip auto-creating an org
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        },
      },
    });
    if (error) toast.error(error.message);
    else {
      toast.success(t("authPage.accountCreated"));
      // Meta: CompleteRegistration (pixel + CAPI, deduplicated by event_id)
      trackEvent(
        "CompleteRegistration",
        { content_name: "signup", status: true },
        { email, phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim() },
      );
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-4 pt-8">
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <KlosifyLogo size={48} />
          </div>
          <CardTitle className="text-2xl font-bold">Klosify CRM</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{t("authPage.tagline")}</p>
        </CardHeader>
        <CardContent>
          {/* ── Forgot password: sent ── */}
          {view === "forgot-sent" && (
            <div className="space-y-4 text-center py-2">
              <div className="text-4xl">📬</div>
              <p className="font-medium">{t("authPage.checkEmail")}</p>
              <p className="text-sm text-muted-foreground">
                {t("authPage.resetLinkSentPrefix")} <strong>{forgotEmail}</strong> {t("authPage.resetLinkSentSuffix")}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setView("tabs")}>
                {t("authPage.backToLogin")}
              </Button>
            </div>
          )}

          {/* ── Forgot password: form ── */}
          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("authPage.forgotPasswordIntro")}
              </p>
              <div className="space-y-2">
                <Label>{t("authPage.email")}</Label>
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder={t("authPage.emailPlaceholder")}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("authPage.sending") : t("authPage.sendLink")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setView("tabs")}>
                {t("authPage.back")}
              </Button>
            </form>
          )}

          {/* ── Normal tabs ── */}
          {view === "tabs" && <>
          {inviteToken && (
            <div className="mb-4 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-center">
              🎉 {t("authPage.invitedToJoin")} {inviteInfo?.org_name ? <strong>{inviteInfo.org_name}</strong> : t("authPage.aTeam")}. <br />
              <span className="text-muted-foreground">{t("authPage.createAccountWith")} <strong>{inviteInfo?.email || t("authPage.yourEmail")}</strong> {t("authPage.toContinue")}</span>
            </div>
          )}

          {/* Google OAuth button */}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 mb-4"
            onClick={handleGoogleAuth}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {t("authPage.continueWithGoogle")}
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t("authPage.or")}</span>
            </div>
          </div>

          <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as "login" | "register")}>
            {inviteToken ? (
              <p className="text-center text-sm font-medium mb-4">
                {authTab === "register" ? t("authPage.createAccountToJoin") : t("authPage.loginToJoin")}
              </p>
            ) : (
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">{t("authPage.login")}</TabsTrigger>
                <TabsTrigger value="register">{t("authPage.register")}</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("authPage.email")}</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("authPage.emailPlaceholder")} required readOnly={!!inviteInfo} className={inviteInfo ? "bg-muted cursor-not-allowed" : undefined} />
                </div>
                <div className="space-y-2">
                  <Label>{t("authPage.password")}</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("authPage.loggingIn") : t("authPage.login")}
                </Button>
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setView("forgot"); }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  {t("authPage.forgotPasswordLink")}
                </button>
                {inviteToken && (
                  <button type="button" onClick={() => setAuthTab("register")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {t("authPage.noAccountCreateOne")}
                  </button>
                )}
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("authPage.firstName")}</Label>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t("authPage.firstNamePlaceholder")} required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("authPage.lastName")}</Label>
                    <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder={t("authPage.lastNamePlaceholder")} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("authPage.emailRequired")}</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("authPage.emailPlaceholder")} required readOnly={!!inviteInfo} className={inviteInfo ? "bg-muted cursor-not-allowed" : undefined} />
                  {inviteInfo && <p className="text-xs text-muted-foreground">{t("authPage.inviteEmailLocked")}</p>}
                </div>
                {!inviteToken && (
                  <div className="space-y-2">
                    <Label>{t("authPage.companyName")}</Label>
                    <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t("authPage.companyNamePlaceholder")} />
                  </div>
                )}
                {!inviteToken && (
                  <>
                    <div className="space-y-2">
                      <Label>{t("authPage.phone")}</Label>
                      <CountryPhoneInput
                        value={phone}
                        onChange={setPhone}
                        countryCode={countryCode}
                        onCountryChange={setCountryCode}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("authPage.industry")}</Label>
                      <Select value={industry} onValueChange={setIndustry}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("authPage.industryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {industries.map(i => (
                            <SelectItem key={i} value={i}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("authPage.companySize")}</Label>
                      <Select value={companySize} onValueChange={setCompanySize}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("authPage.companySizePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {companySizes.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("authPage.jobTitle")}</Label>
                      <Select value={jobTitle} onValueChange={setJobTitle}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("authPage.jobTitlePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {["CEO / Director General", "Director Comercial", "Gerente de Ventas", "Ejecutivo de Ventas", "Director de Marketing", "Gerente de Marketing", "Director de Operaciones", "Gerente de Proyecto", "Fundador / Co-fundador", "Consultor", "Freelancer", "Otro"].map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>{t("authPage.passwordRequired")}</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("authPage.passwordPlaceholder")} minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("authPage.creatingAccount") : t("authPage.createAccount")}
                </Button>
                {inviteToken && (
                  <button type="button" onClick={() => setAuthTab("login")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
                    {t("authPage.haveAccountLogin")}
                  </button>
                )}
              </form>
            </TabsContent>
          </Tabs>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}

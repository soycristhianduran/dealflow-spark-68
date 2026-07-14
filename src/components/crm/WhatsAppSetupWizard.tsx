import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Loader2, MessageCircle,
  Copy, ArrowRight, ArrowLeft, Phone, Building2,
  ChevronRight, KeyRound, Shield, Wifi, WifiOff,
  ExternalLink, Settings, Trash2, RefreshCw, Smartphone, AlertTriangle,
  Star, Plus, Pencil, Check, X
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";

interface WhatsAppSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startStep?: WizardStep;
}

interface WabaAccount {
  id: string;
  name: string;
  business_name?: string;
}

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  status: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { num: 1, label: "Iniciar sesión", icon: Shield },
  { num: 2, label: "Portafolio", icon: Building2 },
  { num: 4, label: "Número", icon: Phone },
  { num: 6, label: "¡Listo!", icon: CheckCircle2 },
];

export function WhatsAppSetupWizard({ open, onOpenChange, startStep }: WhatsAppSetupWizardProps) {
  const { t } = useTranslation();
  const wa = useWhatsAppIntegration();
  const [step, setStep] = useState<WizardStep>(startStep ?? 1);
  const [useManual, setUseManual] = useState(false);

  // Data state
  const [wabaAccounts, setWabaAccounts] = useState<WabaAccount[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<WabaAccount | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual form
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [manualToken, setManualToken] = useState("");

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  // Multi-number label editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");

  // Advanced actions (shown inside the Gestionar / connected view)
  const [resubscribing, setResubscribing] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerPin, setRegisterPin] = useState("");
  const [registering, setRegistering] = useState(false);
  // Re-verificación OTP (cuando Meta pide re-verificar el número, código 133006).
  const [needsVerification, setNeedsVerification] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleResubscribeWebhook = async () => {
    setResubscribing(true);
    try {
      await wa.resubscribeWebhook?.();
      toast.success(t("whatsAppSetupWizard.webhookReactivated"));
    } catch (e: any) {
      toast.error(t("whatsAppSetupWizard.reactivateError") + e.message);
    } finally {
      setResubscribing(false);
    }
  };

  const handleRegisterPhone = async () => {
    if (!/^\d{6}$/.test(registerPin)) {
      toast.error(t("whatsAppSetupWizard.pinValidationError"));
      return;
    }
    setRegistering(true);
    try {
      await wa.registerPhone?.(registerPin);
      toast.success(t("whatsAppSetupWizard.numberActivated"));
      setRegisterDialogOpen(false);
      setRegisterPin("");
      setNeedsVerification(false); setCodeSent(false); setOtpCode("");
    } catch (e: any) {
      // Código 133006 = el número necesita re-verificación por OTP (vino de otra
      // plataforma). Mostramos el paso de verificación en vez de un error seco.
      if (/133006/.test(e.message || "")) {
        setNeedsVerification(true);
        toast.info("Este número necesita re-verificarse. Te enviamos un código.");
      } else {
        toast.error(t("whatsAppSetupWizard.activateError") + e.message);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleSendCode = async (method: "SMS" | "VOICE") => {
    setSendingCode(true);
    try {
      await wa.requestVerificationCode?.(method);
      setCodeSent(true);
      toast.success(method === "SMS" ? "Código enviado por SMS al número." : "Te llamaremos con el código.");
    } catch (e: any) {
      toast.error("No se pudo enviar el código: " + e.message);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(otpCode)) { toast.error("Ingresa el código de 6 dígitos."); return; }
    setVerifying(true);
    try {
      await wa.verifyCode?.(otpCode);
      toast.success("Número verificado. Activando…");
      setNeedsVerification(false); setCodeSent(false); setOtpCode("");
      // Reintenta el registro con el PIN automáticamente.
      await handleRegisterPhone();
    } catch (e: any) {
      toast.error("Código incorrecto o expirado: " + e.message);
    } finally {
      setVerifying(false);
    }
  };

  // Keep a ref to cancel the reset timer if the wizard reopens quickly.
  // Without this, the timer started on the very first render (open=false) would
  // fire 300ms later and reset step back to 1 even after the OAuth redirect
  // advanced it to step 2.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on close — return a cleanup so the timer is cancelled if open flips
  // back to true before the 300 ms expire (e.g. OAuth redirect on page load).
  useEffect(() => {
    if (!open) {
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        setStep(1);
        setUseManual(false);
        setWabaAccounts([]);
        setSelectedWaba(null);
        setPhoneNumbers([]);
        setManualPhoneId("");
        setManualWabaId("");
        setManualToken("");
      }, 300);
      return () => {
        if (resetTimerRef.current) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = null;
        }
      };
    }
  }, [open]);

  // If already connected, show status view
  useEffect(() => {
    if (open && wa.isConnected) {
      setStep(6);
    }
  }, [open, wa.isConnected]);

  // When startStep changes (e.g. parent detects pending OAuth), apply it
  useEffect(() => {
    if (open && startStep && startStep !== step) {
      setStep(startStep);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startStep]);

  // When wizard opens and user is NOT connected, check for pending OAuth token
  // If found, jump directly to WABA selection (step 2) — supports multi-tenant admin flow
  useEffect(() => {
    if (open && !wa.isConnected && step === 1) {
      wa.checkHasPendingToken?.().then((hasPending) => {
        if (hasPending) setStep(2);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-load WABA accounts whenever wizard opens at step 2
  useEffect(() => {
    if (open && step === 2 && wabaAccounts.length === 0 && !loading) {
      loadWabaAccounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // On open: only jump to step 2 when pendingOAuth is explicitly set
  // (i.e. the user just returned from a standard OAuth redirect with wa_token_ready=true).
  // Do NOT auto-jump based on DB state — that causes the wizard to skip step 1
  // and call get_waba_accounts with a token that has no WABA access.
  useEffect(() => {
    if (!open) return;
    if (wa.isConnected) return;
    if (wa.pendingOAuth) {
      wa.setPendingOAuth(false);
      setStep(2);
      loadWabaAccounts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wa.pendingOAuth]);

  const loadWabaAccounts = async () => {
    setLoading(true);
    try {
      const accounts = await wa.getWabaAccounts();
      setWabaAccounts(accounts);
      if (accounts.length === 1) {
        // Auto-select if only one
        handleSelectWaba(accounts[0]);
      }
    } catch (e: any) {
      toast.error(t("whatsAppSetupWizard.loadPortfoliosError") + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWaba = async (waba: WabaAccount) => {
    setSelectedWaba(waba);
    setManualWabaId(waba.id); // pre-fill for manual fallback in step 4
    setStep(4);
    setLoading(true);
    try {
      const phones = await wa.getPhoneNumbers(waba.id);
      setPhoneNumbers(phones);
    } catch (e: any) {
      toast.error(t("whatsAppSetupWizard.loadNumbersError") + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPhone = async (phone: PhoneNumber) => {
    setSaving(true);
    try {
      await wa.savePhoneNumber({
        waba_id: selectedWaba!.id,
        phone_number_id: phone.id,
        display_phone: phone.display_phone_number,
        business_name: phone.verified_name || selectedWaba?.business_name || selectedWaba?.name,
      });
      setStep(6);
    } catch (e: any) {
      toast.error(t("whatsAppSetupWizard.saveError") + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualPhoneId.trim() || !manualWabaId.trim()) {
      toast.error(t("whatsAppSetupWizard.idsRequired"));
      return;
    }
    setSaving(true);
    try {
      await wa.saveManualConfig({
        phone_number_id: manualPhoneId.trim(),
        waba_id: manualWabaId.trim(),
        // token is optional — backend reuses saved OAuth token if not provided
        ...(manualToken.trim() ? { access_token: manualToken.trim() } : {}),
      });
      setStep(6);
    } catch (e: any) {
      toast.error(t("whatsAppSetupWizard.genericError") + e.message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (step === 1) {
      onOpenChange(false);
    } else if (useManual && step === 4) {
      setStep(1);
    } else {
      setStep((prev) => Math.max(1, prev - 1) as WizardStep);
    }
  };

  const qualityBadge = (q: string) => {
    const upper = q?.toUpperCase();
    if (upper === "GREEN" || upper === "HIGH") return { label: t("whatsAppSetupWizard.qualityHigh"), cls: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30" };
    if (upper === "YELLOW" || upper === "MEDIUM") return { label: t("whatsAppSetupWizard.qualityMedium"), cls: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30" };
    if (upper === "RED" || upper === "LOW") return { label: t("whatsAppSetupWizard.qualityLow"), cls: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30" };
    return { label: q || "—", cls: "text-muted-foreground" };
  };

  // Connected view (step 6 when already connected)
  if (step === 6 && wa.isConnected) {
    return (
      <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{t("whatsAppSetupWizard.whatsAppConnected")}</h2>
                <p className="text-sm text-white/80">
                  {wa.configs.length === 1
                    ? t("whatsAppSetupWizard.channelActive")
                    : t("whatsAppSetupWizard.numbersConnected", { count: wa.configs.length })}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* ⚠️ Unregistered number alert */}
            {wa.configs.some(c => !c.webhook_verified) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-0.5">{t("whatsAppSetupWizard.numberPendingActivation")}</p>
                  <p>{t("whatsAppSetupWizard.numberPendingActivationDesc")}</p>
                  <button
                    className="mt-1.5 underline font-medium hover:opacity-80"
                    onClick={() => setRegisterDialogOpen(true)}
                  >
                    {t("whatsAppSetupWizard.activateNow")}
                  </button>
                </div>
              </div>
            )}
            {/* Numbers list */}
            <div className="space-y-2">
              {wa.configs.map((cfg) => (
                <div key={cfg.id} className="rounded-xl border p-3 flex items-center gap-2">
                  {/* Star / Primary */}
                  <button
                    className={`shrink-0 transition-colors ${cfg.is_primary ? "text-amber-500" : "text-muted-foreground/30 hover:text-amber-400"}`}
                    title={cfg.is_primary ? t("whatsAppSetupWizard.primaryNumber") : t("whatsAppSetupWizard.setAsPrimary")}
                    onClick={async () => {
                      if (!cfg.is_primary) {
                        try { await wa.setPrimary(cfg.id); }
                        catch (e) { toast.error(t("whatsAppSetupWizard.genericError") + (e instanceof Error ? e.message : String(e))); }
                      }
                    }}
                  >
                    <Star className="h-4 w-4" fill={cfg.is_primary ? "currentColor" : "none"} />
                  </button>

                  {/* Phone info / inline label editing */}
                  <div className="flex-1 min-w-0">
                    {editingLabelId === cfg.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-6 text-xs py-0 px-1.5"
                          value={editingLabelValue}
                          onChange={(e) => setEditingLabelValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              try { await wa.updateLabel(cfg.id, editingLabelValue); } catch (_) {}
                              setEditingLabelId(null);
                            } else if (e.key === "Escape") {
                              setEditingLabelId(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className="text-green-600 hover:text-green-700 shrink-0"
                          onClick={async () => {
                            try { await wa.updateLabel(cfg.id, editingLabelValue); } catch (_) {}
                            setEditingLabelId(null);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => setEditingLabelId(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium truncate">
                        {cfg.label || cfg.display_phone || cfg.phone_number_id}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {cfg.display_phone && cfg.label ? cfg.display_phone : (cfg.business_name || "WhatsApp Business")}
                    </p>
                  </div>

                  {/* Status badge */}
                  <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 shrink-0">
                    <Wifi className="h-3 w-3" />
                    {t("whatsAppSetupWizard.active")}
                  </Badge>

                  {/* Edit label */}
                  {editingLabelId !== cfg.id && (
                    <button
                      className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
                      title={t("whatsAppSetupWizard.editName")}
                      onClick={() => {
                        setEditingLabelId(cfg.id);
                        setEditingLabelValue(cfg.label || cfg.display_phone || "");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Disconnect this number */}
                  <button
                    className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                    title={t("whatsAppSetupWizard.disconnectThisNumber")}
                    onClick={async () => {
                      await wa.disconnect(cfg.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add another number — launches Embedded Signup */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => wa.launchEmbeddedSignup()}
              disabled={wa.connecting}
            >
              <Plus className="h-4 w-4" />
              {t("whatsAppSetupWizard.connectAnotherNumber")}
            </Button>

            {/* Add a coexistence number — keeps using the WhatsApp Business app */}
            <Button
              variant="outline"
              className="w-full gap-2 border-green-500/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
              onClick={() => wa.launchEmbeddedSignup({ coexistence: true })}
              disabled={wa.connecting}
            >
              <Smartphone className="h-4 w-4" />
              {t("whatsAppSetupWizard.coexistenceTitle")}
            </Button>

            {/* Add another number MANUALLY — same manual flow as the first number
                (WABA ID + Phone Number ID + optional token). Reutiliza el formulario
                y el guardado existentes; no toca las conexiones ya activas. */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => { setManualPhoneId(""); setManualWabaId(""); setManualToken(""); setUseManual(true); setStep(4); }}
              disabled={wa.connecting}
            >
              <Shield className="h-4 w-4" />
              Conectar otro número manualmente
            </Button>

            {/* Advanced actions — collapsed by default */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                {t("whatsAppSetupWizard.advancedOptions")}
              </summary>
              <div className="mt-3 rounded-xl border p-4 space-y-3">
                {/* Webhook URL */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("whatsAppSetupWizard.webhookUrl")}</p>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-2">
                    <code className="text-[10px] flex-1 break-all font-mono text-muted-foreground">{webhookUrl}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 h-6 w-6"
                      onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success(t("whatsAppSetupWizard.urlCopied")); }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Resubscribe webhook */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  disabled={resubscribing}
                  onClick={handleResubscribeWebhook}
                >
                  {resubscribing
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("whatsAppSetupWizard.reactivating")}</>
                    : <><RefreshCw className="h-3 w-3" /> {t("whatsAppSetupWizard.reactivateWebhook")}</>}
                </Button>
                {/* Register phone number (PIN) */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => setRegisterDialogOpen(true)}
                >
                  <Shield className="h-3 w-3" /> {t("whatsAppSetupWizard.activateNumberPin")}
                </Button>
                {/* Disconnect all */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={async () => {
                    await wa.disconnect();
                    onOpenChange(false);
                  }}
                >
                  <WifiOff className="h-3 w-3" /> {t("whatsAppSetupWizard.disconnectAllNumbers")}
                </Button>
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Phone (Cloud API activation) Dialog — nested inside same Fragment so state is shared */}
      <Dialog open={registerDialogOpen} onOpenChange={(v) => { setRegisterDialogOpen(v); if (!v) setRegisterPin(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("whatsAppSetupWizard.activateNumberTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <span className="font-semibold">{t("whatsAppSetupWizard.whenToUseThis")}</span> {t("whatsAppSetupWizard.whenToUseThisDesc")}
                <br /><br />
                {t("whatsAppSetupWizard.registerPinDesc1")} <span className="font-semibold">{t("whatsAppSetupWizard.saveThisPin")}</span> {t("whatsAppSetupWizard.registerPinDesc2")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-register-pin" className="text-sm font-medium">{t("whatsAppSetupWizard.twoStepPinLabel")}</Label>
              <Input
                id="wizard-register-pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder={t("whatsAppSetupWizard.sixDigitsPlaceholder")}
                value={registerPin}
                onChange={(e) => setRegisterPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono tracking-widest text-center text-lg"
              />
              <p className="text-xs text-muted-foreground">{t("whatsAppSetupWizard.pinHelp")}</p>
            </div>
            {!needsVerification ? (
              <Button
                className="w-full"
                onClick={handleRegisterPhone}
                disabled={registering || registerPin.length !== 6}
              >
                {registering ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("whatsAppSetupWizard.activating")}</> : t("whatsAppSetupWizard.activateNumber")}
              </Button>
            ) : (
              /* Paso de re-verificación OTP (Meta código 133006) */
              <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 p-3">
                <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                  <span className="font-semibold">Este número necesita re-verificarse</span> porque venía de otra plataforma. Recibe un código en el número y confírmalo para activarlo.
                </p>
                {!codeSent ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" disabled={sendingCode} onClick={() => handleSendCode("SMS")}>
                      {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar por SMS"}
                    </Button>
                    <Button variant="outline" className="flex-1" disabled={sendingCode} onClick={() => handleSendCode("VOICE")}>
                      {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Llamada"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      type="text" inputMode="numeric" maxLength={6}
                      placeholder="Código de 6 dígitos"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="font-mono tracking-widest text-center text-lg"
                    />
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" disabled={sendingCode} onClick={() => { setCodeSent(false); setOtpCode(""); }}>
                        Reenviar
                      </Button>
                      <Button className="flex-1" disabled={verifying || registering || otpCode.length !== 6} onClick={handleVerifyCode}>
                        {(verifying || registering) ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verificando…</> : "Verificar y activar"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  // Success step after new connection
  if (step === 6) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-8 text-white text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur animate-pulse">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            </div>
            <h2 className="text-xl font-bold">{t("whatsAppSetupWizard.connectionSuccess")}</h2>
            <p className="text-sm text-white/80 mt-2 max-w-sm mx-auto">
              {t("whatsAppSetupWizard.connectionSuccessDesc")}
            </p>
          </div>
          <div className="p-6">
            <Button className="w-full gap-2" onClick={() => onOpenChange(false)}>
              {t("whatsAppSetupWizard.startUsingWhatsApp")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {/* Progress header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button onClick={goBack} className="text-white/70 hover:text-white transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h2 className="text-white font-semibold text-sm">{t("whatsAppSetupWizard.connectWhatsApp")}</h2>
            </div>
            <span className="text-white/70 text-xs">{t("whatsAppSetupWizard.stepCounter", { current: STEPS.findIndex(s => s.num >= step) + 1, total: STEPS.length })}</span>
          </div>

          {/* Step indicators */}
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  STEPS.findIndex(x => x.num >= step) >= STEPS.findIndex(x => x.num === s.num) ? "bg-white" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ===== STEP 1: Choose method ===== */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-950/50">
                    <MessageCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("whatsAppSetupWizard.connectYourWhatsApp")}</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {t("whatsAppSetupWizard.connectYourWhatsAppDesc")}
                </p>
              </div>

              {/* Warning: disconnect other platforms first */}
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <span className="font-semibold">{t("whatsAppSetupWizard.alreadyUsingPlatform")}</span> {t("whatsAppSetupWizard.alreadyUsingPlatformDesc1")} <span className="font-semibold">{t("whatsAppSetupWizard.disconnectFirst")}</span> {t("whatsAppSetupWizard.alreadyUsingPlatformDesc2")}
                </p>
              </div>

              <div className="space-y-3">
                {/* Meta Embedded Signup redirect — recommended */}
                <button
                  className="w-full flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-blue-500/30 bg-card p-5 text-left transition-all hover:shadow-md group disabled:opacity-60"
                  onClick={() => { setUseManual(false); wa.launchEmbeddedSignup(); }}
                  disabled={!wa.metaAppId || wa.connecting}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0" style={{ backgroundColor: "#1877F220" }}>
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#1877F2">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{t("whatsAppSetupWizard.connectWithFacebook")}</p>
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-0">{t("whatsAppSetupWizard.recommended")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("whatsAppSetupWizard.connectWithFacebookDesc")}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>

                {/* Coexistence — keep using the WhatsApp Business app */}
                <button
                  className="w-full flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-green-500/30 bg-card p-5 text-left transition-all hover:shadow-md group disabled:opacity-60"
                  onClick={() => { setUseManual(false); wa.launchEmbeddedSignup({ coexistence: true }); }}
                  disabled={!wa.metaAppId || wa.connecting}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0 bg-green-500/15">
                    <Smartphone className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{t("whatsAppSetupWizard.coexistenceTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("whatsAppSetupWizard.coexistenceDesc")}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>

                {/* Manual */}
                <button
                  className="w-full flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-primary/30 bg-card p-5 text-left transition-all hover:shadow-md group"
                  onClick={() => {
                    setUseManual(true);
                    setStep(4);
                  }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                    <KeyRound className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{t("whatsAppSetupWizard.manualSetup")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("whatsAppSetupWizard.manualSetupDesc")}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 2: Select business portfolio ===== */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-foreground">{t("whatsAppSetupWizard.selectPortfolio")}</h3>
                <p className="text-sm text-muted-foreground">{t("whatsAppSetupWizard.selectPortfolioDesc")}</p>
              </div>

              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  <p className="text-sm text-muted-foreground">{t("whatsAppSetupWizard.loadingPortfolios")}</p>
                </div>
              ) : wabaAccounts.length === 0 ? (
                <div className="space-y-4 py-2">
                  <div className="text-center space-y-2">
                    <div className="flex justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("whatsAppSetupWizard.noAccountsFound")}</p>
                    <Button variant="outline" size="sm" onClick={loadWabaAccounts} className="gap-2">
                      <RefreshCw className="h-3.5 w-3.5" /> {t("whatsAppSetupWizard.retry")}
                    </Button>
                  </div>
                  {/* Manual WABA ID entry as fallback */}
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <p className="text-xs font-medium text-foreground">{t("whatsAppSetupWizard.knowWabaId")}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("whatsAppSetupWizard.wabaIdExample")}
                        value={manualWabaId}
                        onChange={(e) => setManualWabaId(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        disabled={!manualWabaId.trim() || loading}
                        onClick={() => handleSelectWaba({ id: manualWabaId.trim(), name: t("whatsAppSetupWizard.myWaba") })}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("whatsAppSetupWizard.search")}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t("whatsAppSetupWizard.findWabaIdHelp")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {wabaAccounts.map((waba) => (
                    <button
                      key={waba.id}
                      className="w-full flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-green-500/30 bg-card p-4 text-left transition-all hover:shadow-sm group"
                      onClick={() => handleSelectWaba(waba)}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/50 shrink-0">
                        <Building2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{waba.name}</p>
                        {waba.business_name && (
                          <p className="text-xs text-muted-foreground truncate">{waba.business_name}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono">ID: {waba.id}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 3: Choose WABA (existing or new) ===== */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-foreground">{t("whatsAppSetupWizard.whatsAppBusinessAccount")}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedWaba ? t("whatsAppSetupWizard.portfolioLabel", { name: selectedWaba.name }) : t("whatsAppSetupWizard.selectOrCreateWaba")}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-green-500/30 bg-card p-4 text-left transition-all hover:shadow-sm"
                  onClick={() => setStep(4)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/50 shrink-0">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{t("whatsAppSetupWizard.useExistingAccount")}</p>
                    <p className="text-xs text-muted-foreground">{t("whatsAppSetupWizard.useExistingAccountDesc")}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>

                <div className="rounded-xl border border-dashed p-4 text-center space-y-2 opacity-50">
                  <p className="text-xs text-muted-foreground">
                    {t("whatsAppSetupWizard.createWabaComingSoon")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===== STEP 4: Select phone number (or manual entry) ===== */}
          {step === 4 && !useManual && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-foreground">{t("whatsAppSetupWizard.selectYourNumber")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("whatsAppSetupWizard.selectYourNumberDesc")}
                </p>
              </div>

              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  <p className="text-sm text-muted-foreground">{t("whatsAppSetupWizard.loadingNumbers")}</p>
                </div>
              ) : phoneNumbers.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <div className="flex justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <Phone className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("whatsAppSetupWizard.noNumbersFound")}</p>
                  <p className="text-xs text-muted-foreground">{t("whatsAppSetupWizard.registerNumberFirst")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {phoneNumbers.map((phone) => {
                    const qb = qualityBadge(phone.quality_rating);
                    return (
                      <button
                        key={phone.id}
                        className="w-full flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-green-500/30 bg-card p-4 text-left transition-all hover:shadow-sm group"
                        onClick={() => handleSelectPhone(phone)}
                        disabled={saving}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50 shrink-0">
                          <Phone className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{phone.display_phone_number}</p>
                          <p className="text-xs text-muted-foreground truncate">{phone.verified_name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${qb.cls}`}>{qb.label}</Badge>
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Manual fallback: enter Phone Number ID directly when a WABA is already selected.
                  Useful when the desired number is new/pending and doesn't yet appear in the API list. */}
              {!loading && selectedWaba && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                    {t("whatsAppSetupWizard.dontSeeNumber")}
                  </summary>
                  <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      {t("whatsAppSetupWizard.enterPhoneIdHelp1")} <span className="font-medium text-foreground">Phone Number ID</span> {t("whatsAppSetupWizard.enterPhoneIdHelp2")}
                    </p>
                    <Input
                      placeholder={t("whatsAppSetupWizard.phoneIdExample")}
                      value={manualPhoneId}
                      onChange={(e) => setManualPhoneId(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      disabled={!manualPhoneId.trim() || saving}
                      onClick={() =>
                        handleSelectPhone({
                          id: manualPhoneId.trim(),
                          display_phone_number: manualPhoneId.trim(),
                          verified_name: selectedWaba?.name || "",
                          quality_rating: "",
                          status: "",
                        })
                      }
                    >
                      {saving ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {t("whatsAppSetupWizard.connecting")}</>
                      ) : (
                        <>{t("whatsAppSetupWizard.connectThisNumber")} <ArrowRight className="h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ===== STEP 4: Manual entry ===== */}
          {step === 4 && useManual && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  {t("whatsAppSetupWizard.enterYourIds")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("whatsAppSetupWizard.findThemAt")}{" "}
                  <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                    {t("whatsAppSetupWizard.metaBusinessSuitePath")} <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-waba-id" className="text-xs font-medium">WABA ID <span className="text-muted-foreground">(WhatsApp Business Account ID)</span></Label>
                  <Input id="wa-waba-id" placeholder={t("whatsAppSetupWizard.wabaIdExample")} value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone-id" className="text-xs font-medium">Phone Number ID</Label>
                  <Input id="wa-phone-id" placeholder={t("whatsAppSetupWizard.phoneIdExampleShort")} value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} className="font-mono" />
                </div>
                {/* Token is optional — reuses the one already saved from OAuth */}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">{t("whatsAppSetupWizard.accessTokenOptional")}</summary>
                  <div className="mt-2">
                    <Input id="wa-token" type="password" placeholder={t("whatsAppSetupWizard.tokenPlaceholder")} value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
                  </div>
                </details>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleManualSave}
                disabled={saving || !manualPhoneId || !manualWabaId}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t("whatsAppSetupWizard.validating")}</>
                ) : (
                  <>{t("whatsAppSetupWizard.connectWhatsApp")} <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>

              {/* Al agregar un SEGUNDO número: aviso de token para otra WABA y volver
                  a la vista de conexión. Solo visible cuando ya hay un número
                  conectado, así el flujo de primer número queda intacto. */}
              {wa.isConnected && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Si este número pertenece a otra cuenta de WhatsApp (otra WABA), abre
                    "Token de acceso" arriba y pega el token de esa cuenta.
                  </p>
                  <Button variant="ghost" className="w-full" onClick={() => { setUseManual(false); setStep(6); }}>
                    Volver
                  </Button>
                </>
              )}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}

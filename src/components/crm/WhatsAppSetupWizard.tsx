import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Loader2, MessageCircle,
  Copy, ArrowRight, ArrowLeft, Phone, Building2,
  ChevronRight, KeyRound, Shield, Wifi, WifiOff,
  ExternalLink, Settings, Trash2, RefreshCw, Smartphone
} from "lucide-react";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { toast } from "sonner";

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
  { num: 3, label: "Cuenta WABA", icon: MessageCircle },
  { num: 4, label: "Número", icon: Phone },
  { num: 5, label: "Configuración", icon: Settings },
  { num: 6, label: "¡Listo!", icon: CheckCircle2 },
];

export function WhatsAppSetupWizard({ open, onOpenChange, startStep }: WhatsAppSetupWizardProps) {
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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setUseManual(false);
        setWabaAccounts([]);
        setSelectedWaba(null);
        setPhoneNumbers([]);
        setManualPhoneId("");
        setManualWabaId("");
        setManualToken("");
      }, 300);
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
      toast.error("Error al cargar portafolios: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWaba = async (waba: WabaAccount) => {
    setSelectedWaba(waba);
    setStep(4);
    setLoading(true);
    try {
      const phones = await wa.getPhoneNumbers(waba.id);
      setPhoneNumbers(phones);
    } catch (e: any) {
      toast.error("Error al cargar números: " + e.message);
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
      setStep(5);
    } catch (e: any) {
      toast.error("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    if (!manualPhoneId.trim() || !manualWabaId.trim()) {
      toast.error("WABA ID y Phone Number ID son obligatorios");
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
      setStep(5);
    } catch (e: any) {
      toast.error("Error: " + e.message);
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
    if (upper === "GREEN" || upper === "HIGH") return { label: "Alta", cls: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30" };
    if (upper === "YELLOW" || upper === "MEDIUM") return { label: "Media", cls: "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30" };
    if (upper === "RED" || upper === "LOW") return { label: "Baja", cls: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30" };
    return { label: q || "—", cls: "text-muted-foreground" };
  };

  // Connected view (step 6 when already connected)
  if (step === 6 && wa.isConnected && wa.config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">WhatsApp Conectado</h2>
                <p className="text-sm text-white/80">Tu canal está activo y recibiendo mensajes</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Channel info */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50">
                    <Smartphone className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{wa.config.display_phone || wa.config.phone_number_id}</p>
                    <p className="text-xs text-muted-foreground">{wa.config.business_name || "WhatsApp Business"}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                  <Wifi className="h-3 w-3" />
                  Activo
                </Badge>
              </div>
            </div>

            {/* Webhook config */}
            <div className="rounded-xl border p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Webhook para mensajes entrantes
              </h4>
              <div className="flex items-center gap-2 bg-muted rounded-lg p-2.5">
                <code className="text-[11px] flex-1 break-all font-mono text-muted-foreground">{webhookUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 h-7 w-7"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("URL copiada");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 text-destructive hover:text-destructive"
                onClick={async () => {
                  await wa.disconnect();
                  onOpenChange(false);
                }}
              >
                <WifiOff className="h-4 w-4" />
                Desconectar
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => {
                  setStep(1);
                  setUseManual(false);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Reconectar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
            <h2 className="text-xl font-bold">¡Conexión exitosa!</h2>
            <p className="text-sm text-white/80 mt-2 max-w-sm mx-auto">
              Tu WhatsApp Business está conectado. Ya puedes enviar y recibir mensajes desde el CRM.
            </p>
          </div>
          <div className="p-6">
            <Button className="w-full gap-2" onClick={() => onOpenChange(false)}>
              Comenzar a usar WhatsApp <ArrowRight className="h-4 w-4" />
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
              <h2 className="text-white font-semibold text-sm">Conectar WhatsApp</h2>
            </div>
            <span className="text-white/70 text-xs">Paso {step} de 6</span>
          </div>

          {/* Step indicators */}
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  s.num <= step ? "bg-white" : "bg-white/20"
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
                <h3 className="text-lg font-bold text-foreground">Conecta tu WhatsApp Business</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Vincula tu cuenta para enviar y recibir mensajes directamente desde el CRM.
                </p>
              </div>

              <div className="space-y-3">
                {/* Meta Embedded Signup redirect — recommended */}
                <button
                  className="w-full flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-blue-500/30 bg-card p-5 text-left transition-all hover:shadow-md group disabled:opacity-60"
                  onClick={() => { setUseManual(false); wa.connect(); }}
                  disabled={!wa.metaAppId}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0" style={{ backgroundColor: "#1877F220" }}>
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#1877F2">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">Conectar con Facebook</p>
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-0">Recomendado</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Inicia sesión con Facebook y selecciona tu cuenta de WhatsApp Business.
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
                    <p className="text-sm font-semibold text-foreground">Configuración manual</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ingresa tus credenciales de Meta Business manualmente.
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
                <h3 className="text-base font-bold text-foreground">Selecciona tu portafolio de negocio</h3>
                <p className="text-sm text-muted-foreground">Elige la cuenta de negocio que contiene tu WhatsApp Business.</p>
              </div>

              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  <p className="text-sm text-muted-foreground">Cargando tus portafolios de negocio...</p>
                </div>
              ) : wabaAccounts.length === 0 ? (
                <div className="space-y-4 py-2">
                  <div className="text-center space-y-2">
                    <div className="flex justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">No se encontraron cuentas automáticamente.</p>
                    <Button variant="outline" size="sm" onClick={loadWabaAccounts} className="gap-2">
                      <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                    </Button>
                  </div>
                  {/* Manual WABA ID entry as fallback */}
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <p className="text-xs font-medium text-foreground">¿Conoces tu WABA ID? Ingrésalo aquí:</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ej: 119298044591184"
                        value={manualWabaId}
                        onChange={(e) => setManualWabaId(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        disabled={!manualWabaId.trim() || loading}
                        onClick={() => handleSelectWaba({ id: manualWabaId.trim(), name: "Mi WABA" })}
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Encuéntralo en Meta Business Suite → Configuración → Cuentas de WhatsApp Business.
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
                <h3 className="text-base font-bold text-foreground">Cuenta de WhatsApp Business</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedWaba ? `Portafolio: ${selectedWaba.name}` : "Selecciona o crea una cuenta WABA"}
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
                    <p className="text-sm font-semibold text-foreground">Usar cuenta existente</p>
                    <p className="text-xs text-muted-foreground">Selecciona un número ya registrado en tu WABA.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>

                <div className="rounded-xl border border-dashed p-4 text-center space-y-2 opacity-50">
                  <p className="text-xs text-muted-foreground">
                    La opción de crear una nueva cuenta WABA estará disponible próximamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===== STEP 4: Select phone number (or manual entry) ===== */}
          {step === 4 && !useManual && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-foreground">Selecciona tu número</h3>
                <p className="text-sm text-muted-foreground">
                  Elige el número de WhatsApp que quieres conectar al CRM.
                </p>
              </div>

              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                  <p className="text-sm text-muted-foreground">Cargando números disponibles...</p>
                </div>
              ) : phoneNumbers.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <div className="flex justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <Phone className="h-6 w-6 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">No se encontraron números en esta cuenta.</p>
                  <p className="text-xs text-muted-foreground">Registra un número en Meta Business Suite primero.</p>
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
            </div>
          )}

          {/* ===== STEP 4: Manual entry ===== */}
          {step === 4 && useManual && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Ingresa tus IDs de WhatsApp Business
                </h4>
                <p className="text-xs text-muted-foreground">
                  Encuéntralos en{" "}
                  <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                    Meta Business Suite → Configuración → Cuentas WhatsApp <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-waba-id" className="text-xs font-medium">WABA ID <span className="text-muted-foreground">(WhatsApp Business Account ID)</span></Label>
                  <Input id="wa-waba-id" placeholder="Ej: 119298044591184" value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone-id" className="text-xs font-medium">Phone Number ID</Label>
                  <Input id="wa-phone-id" placeholder="Ej: 123456789012345" value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} className="font-mono" />
                </div>
                {/* Token is optional — reuses the one already saved from OAuth */}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Token de acceso (opcional — se usa el guardado)</summary>
                  <div className="mt-2">
                    <Input id="wa-token" type="password" placeholder="Solo si no has conectado con Facebook antes" value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
                  </div>
                </details>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleManualSave}
                disabled={saving || !manualPhoneId || !manualWabaId}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Validando...</>
                ) : (
                  <>Conectar WhatsApp <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          )}

          {/* ===== STEP 5: Webhook configuration ===== */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">¡Cuenta vinculada correctamente!</p>
                    <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">
                      Solo falta configurar el webhook para recibir mensajes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  URL del Webhook
                </h4>
                <p className="text-xs text-muted-foreground">
                  Registra esta URL en tu app de Meta → WhatsApp → Configuración.
                </p>
                <div className="flex items-center gap-2 bg-muted rounded-lg p-2.5">
                  <code className="text-[11px] flex-1 break-all font-mono text-muted-foreground">{webhookUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 h-7 w-7"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success("URL copiada");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><strong>Campo:</strong> messages</p>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => {
                  setStep(6);
                  wa.refreshConfig();
                }}
              >
                Finalizar configuración <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

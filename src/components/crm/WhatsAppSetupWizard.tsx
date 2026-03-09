import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, ExternalLink, Loader2, MessageCircle,
  Copy, ArrowRight, RefreshCw, Phone, Building2, ChevronRight, KeyRound, Zap
} from "lucide-react";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { toast } from "sonner";

interface WhatsAppSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

type Step = "connect" | "manual" | "select_waba" | "select_phone" | "webhook" | "done";

export function WhatsAppSetupWizard({ open, onOpenChange }: WhatsAppSetupWizardProps) {
  const wa = useWhatsAppIntegration();
  const [step, setStep] = useState<Step>(wa.isConnected ? "done" : "connect");
  const [wabaAccounts, setWabaAccounts] = useState<WabaAccount[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<WabaAccount | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual form state
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [manualToken, setManualToken] = useState("");

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  useEffect(() => {
    if (!open) return;
    if (wa.isConnected) {
      setStep("webhook");
      return;
    }
    wa.checkHasPendingToken().then((hasPending) => {
      if (hasPending) {
        setStep("select_waba");
        loadWabaAccounts();
      }
    });
  }, [open, wa.isConnected]);

  const loadWabaAccounts = async () => {
    setLoadingData(true);
    try {
      const accounts = await wa.getWabaAccounts();
      setWabaAccounts(accounts);
    } catch (e: any) {
      toast.error("Error al cargar cuentas: " + e.message);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSelectWaba = async (waba: WabaAccount) => {
    setSelectedWaba(waba);
    setStep("select_phone");
    setLoadingData(true);
    try {
      const phones = await wa.getPhoneNumbers(waba.id);
      setPhoneNumbers(phones);
    } catch (e: any) {
      toast.error("Error al cargar números: " + e.message);
      setStep("select_waba");
    } finally {
      setLoadingData(false);
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
      setStep("webhook");
    } catch (e: any) {
      toast.error("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEmbeddedSignup = () => {
    wa.connect();
  };

  const handleManualSave = async () => {
    if (!manualPhoneId.trim() || !manualWabaId.trim() || !manualToken.trim()) {
      toast.error("Todos los campos son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await wa.saveManualConfig({
        phone_number_id: manualPhoneId.trim(),
        waba_id: manualWabaId.trim(),
        access_token: manualToken.trim(),
      });
      setStep("webhook");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada al portapapeles");
  };

  const progressSteps = [
    { key: "connect", label: "Método" },
    { key: "config", label: "Configurar" },
    { key: "webhook", label: "Webhook" },
    { key: "done", label: "Listo" },
  ];
  const progressIndex = step === "connect" ? 0 : step === "manual" || step === "select_waba" || step === "select_phone" ? 1 : step === "webhook" ? 2 : 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: "hsl(142 70% 45% / 0.15)" }}>
              <MessageCircle className="h-5 w-5" style={{ color: "hsl(142, 70%, 45%)" }} />
            </div>
            <div>
              <DialogTitle>Configurar WhatsApp Business</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Conecta tu cuenta de WhatsApp</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Progress */}
          <div className="flex gap-2">
            {progressSteps.map((s, i) => (
              <div key={s.key} className="flex-1">
                <div className={`h-1.5 rounded-full mb-1 transition-colors ${i <= progressIndex ? "bg-green-500" : "bg-muted"}`} />
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* STEP: connect - choose method */}
          {step === "connect" && (
            <div className="space-y-3">
              {/* Manual connection - primary */}
              <button
                className="w-full flex items-center gap-3 rounded-lg border-2 border-primary/20 hover:border-primary/50 p-4 text-left transition-colors"
                onClick={() => setStep("manual")}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Conexión manual</p>
                  <p className="text-xs text-muted-foreground">Ingresa tu Phone Number ID, WABA ID y Access Token desde el panel de Meta Business</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {/* Embedded Signup - secondary */}
              <button
                className="w-full flex items-center gap-3 rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
                onClick={handleEmbeddedSignup}
                disabled={wa.connecting || !wa.metaAppId}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: "hsl(142 70% 45% / 0.1)" }}>
                  <Zap className="h-5 w-5" style={{ color: "hsl(142, 70%, 45%)" }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Conexión automática</p>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">Requiere BSP/TP</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Usa Facebook Embedded Signup (solo para proveedores autorizados)</p>
                </div>
                {wa.connecting ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>
            </div>
          )}

          {/* STEP: manual form */}
          {step === "manual" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Ingresa tus credenciales de WhatsApp Cloud API</h4>
                <p className="text-xs text-muted-foreground">
                  Obtén estos datos desde{" "}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Meta for Developers
                  </a>{" "}
                  → tu app → WhatsApp → Configuración de la API.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-phone-id" className="text-xs">Phone Number ID</Label>
                  <Input
                    id="wa-phone-id"
                    placeholder="Ej: 123456789012345"
                    value={manualPhoneId}
                    onChange={(e) => setManualPhoneId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-waba-id" className="text-xs">WABA ID (WhatsApp Business Account ID)</Label>
                  <Input
                    id="wa-waba-id"
                    placeholder="Ej: 123456789012345"
                    value={manualWabaId}
                    onChange={(e) => setManualWabaId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-token" className="text-xs">Access Token permanente</Label>
                  <Input
                    id="wa-token"
                    type="password"
                    placeholder="Token de acceso de la API de WhatsApp"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Genera un token permanente en Meta Business Suite → Configuración del sistema → Usuarios del sistema.
                  </p>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleManualSave}
                disabled={saving || !manualPhoneId || !manualWabaId || !manualToken}
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Validando y guardando...</> : <>Conectar WhatsApp <ArrowRight className="h-4 w-4" /></>}
              </Button>

              <Button variant="outline" size="sm" className="w-full" onClick={() => setStep("connect")}>
                Atrás
              </Button>
            </div>
          )}

          {/* STEP: select_waba */}
          {step === "select_waba" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Selecciona tu cuenta de WhatsApp Business</h4>
                <p className="text-xs text-muted-foreground">Elige la cuenta de WABA que quieres conectar.</p>
              </div>
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : wabaAccounts.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-center space-y-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">No se encontraron cuentas de WhatsApp Business.</p>
                  <Button size="sm" variant="outline" onClick={loadWabaAccounts} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Recargar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {wabaAccounts.map((acc) => (
                    <button key={acc.id} className="w-full flex items-center justify-between rounded-lg border p-3.5 hover:bg-muted/50 transition-colors text-left" onClick={() => handleSelectWaba(acc)}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                          <Building2 className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{acc.name}</p>
                          {acc.business_name && <p className="text-xs text-muted-foreground">{acc.business_name}</p>}
                          <p className="text-[10px] text-muted-foreground font-mono">ID: {acc.id}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setStep("connect")}>Atrás</Button>
            </div>
          )}

          {/* STEP: select_phone */}
          {step === "select_phone" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Selecciona el número de teléfono</h4>
                <p className="text-xs text-muted-foreground">Cuenta: <span className="font-medium">{selectedWaba?.name}</span></p>
              </div>
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : phoneNumbers.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-center">
                  <p className="text-sm text-amber-700 dark:text-amber-400">No hay números verificados en esta cuenta.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {phoneNumbers.map((phone) => (
                    <button key={phone.id} className="w-full flex items-center justify-between rounded-lg border p-3.5 hover:bg-muted/50 transition-colors text-left disabled:opacity-50" onClick={() => handleSelectPhone(phone)} disabled={saving || phone.status !== "CONNECTED"}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                          <Phone className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{phone.display_phone_number}</p>
                          <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                          <Badge variant="outline" className={`text-[10px] h-4 px-1 mt-0.5 ${phone.status === "CONNECTED" ? "text-green-600 border-green-300" : "text-amber-600 border-amber-300"}`}>
                            {phone.status === "CONNECTED" ? "Verificado" : phone.status}
                          </Badge>
                        </div>
                      </div>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setStep("select_waba")}>Atrás</Button>
            </div>
          )}

          {/* STEP: webhook */}
          {step === "webhook" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium">¡WhatsApp conectado exitosamente!</p>
                </div>
              </div>

              {wa.config && (
                <div className="flex flex-wrap gap-1.5">
                  {wa.config.business_name && (
                    <Badge variant="outline" className="text-xs gap-1"><Building2 className="h-3 w-3" /> {wa.config.business_name}</Badge>
                  )}
                  {wa.config.display_phone && (
                    <Badge variant="outline" className="text-xs gap-1"><Phone className="h-3 w-3" /> {wa.config.display_phone}</Badge>
                  )}
                </div>
              )}

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Paso final: configura el Webhook</h4>
                <p className="text-xs text-muted-foreground">Para recibir mensajes entrantes, registra esta URL como webhook en tu app de Meta:</p>
                <div className="flex items-center gap-2 bg-muted rounded-md p-2">
                  <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={copyWebhookUrl}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
                <p className="text-xs text-muted-foreground"><strong>Campos a suscribir:</strong> messages</p>
                <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Guía de webhooks
                </a>
              </div>

              <Button className="w-full gap-2" onClick={() => { setStep("done"); onOpenChange(false); }}>
                Entendido, cerrar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STEP: done */}
          {step === "done" && wa.isConnected && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">WhatsApp conectado</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {wa.config?.business_name && (
                    <Badge variant="outline" className="text-xs gap-1"><Building2 className="h-3 w-3" /> {wa.config.business_name}</Badge>
                  )}
                  {wa.config?.display_phone && (
                    <Badge variant="outline" className="text-xs gap-1"><Phone className="h-3 w-3" /> {wa.config.display_phone}</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">URL del Webhook</h5>
                <div className="flex items-center gap-2 bg-muted rounded-md p-2">
                  <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={copyWebhookUrl}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              <Button variant="destructive" className="w-full text-xs" onClick={async () => { await wa.disconnect(); onOpenChange(false); }}>
                Desconectar WhatsApp
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

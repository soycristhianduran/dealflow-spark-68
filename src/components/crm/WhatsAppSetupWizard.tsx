import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ExternalLink, Loader2, MessageCircle,
  Copy, ArrowRight, RefreshCw, Phone, Building2, ChevronRight
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

type Step = "connect" | "select_waba" | "select_phone" | "webhook" | "done";

export function WhatsAppSetupWizard({ open, onOpenChange }: WhatsAppSetupWizardProps) {
  const wa = useWhatsAppIntegration();
  const [step, setStep] = useState<Step>(wa.isConnected ? "done" : "connect");
  const [wabaAccounts, setWabaAccounts] = useState<WabaAccount[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<WabaAccount | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  // React to connection state changes (e.g. after Embedded Signup completes)
  useEffect(() => {
    if (!open) return;
    if (wa.isConnected) {
      setStep("webhook");
      return;
    }
    // Check for pending token (OAuth done but phone not auto-detected)
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
      toast.error("Error al cargar cuentas de WhatsApp: " + e.message);
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
      toast.error("Error al guardar número: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEmbeddedSignup = () => {
    wa.connect();
    // The hook will handle the FB.login popup and auto-connect
    // After connect resolves, wa.isConnected will update and useEffect above will advance step
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada al portapapeles");
  };

  const stepLabels: { key: Step; label: string }[] = [
    { key: "connect", label: "Conectar" },
    { key: "select_waba", label: "Cuenta" },
    { key: "select_phone", label: "Número" },
    { key: "webhook", label: "Webhook" },
    { key: "done", label: "Listo" },
  ];
  const stepIndex = stepLabels.findIndex(s => s.key === step);

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
              <p className="text-xs text-muted-foreground mt-0.5">Conecta tu cuenta de WhatsApp en segundos</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Step indicators */}
          <div className="flex gap-2">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex-1">
                <div className={`h-1.5 rounded-full mb-1 transition-colors ${
                  i <= stepIndex ? "bg-green-500" : "bg-muted"
                }`} />
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {/* STEP: connect - Embedded Signup */}
          {step === "connect" && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Conexión rápida con WhatsApp</h4>
                <p className="text-xs text-muted-foreground">
                  Se abrirá una ventana de Meta donde podrás seleccionar tu cuenta de WhatsApp Business 
                  y número de teléfono directamente. Todo se configura automáticamente.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Selecciona o crea tu <strong>cuenta de WhatsApp Business</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Elige tu <strong>número de teléfono</strong> verificado
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Configuración <strong>automática</strong> — sin copiar tokens
                  </li>
                </ul>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleEmbeddedSignup}
                disabled={wa.connecting || !wa.metaAppId}
              >
                {wa.connecting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Conectando con WhatsApp...</>
                  : <><MessageCircle className="h-4 w-4" /> Conectar WhatsApp Business</>
                }
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Se abrirá un popup de Meta para autorizar y seleccionar tu cuenta.
              </p>
            </div>
          )}

          {/* STEP: select_waba (fallback if auto-detection didn't find WABA) */}
          {step === "select_waba" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Selecciona tu cuenta de WhatsApp Business</h4>
                <p className="text-xs text-muted-foreground">No pudimos detectarla automáticamente. Elige la cuenta de WABA que quieres conectar.</p>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : wabaAccounts.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-center space-y-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    No se encontraron cuentas de WhatsApp Business asociadas.
                  </p>
                  <Button size="sm" variant="outline" onClick={loadWabaAccounts} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Recargar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {wabaAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      className="w-full flex items-center justify-between rounded-lg border p-3.5 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => handleSelectWaba(acc)}
                    >
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

              <Button variant="outline" size="sm" className="w-full" onClick={() => setStep("connect")}>
                Atrás
              </Button>
            </div>
          )}

          {/* STEP: select_phone (fallback) */}
          {step === "select_phone" && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Selecciona el número de teléfono</h4>
                <p className="text-xs text-muted-foreground">
                  Cuenta: <span className="font-medium">{selectedWaba?.name}</span>
                </p>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : phoneNumbers.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-center space-y-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    No hay números verificados en esta cuenta de WABA.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {phoneNumbers.map((phone) => (
                    <button
                      key={phone.id}
                      className="w-full flex items-center justify-between rounded-lg border p-3.5 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                      onClick={() => handleSelectPhone(phone)}
                      disabled={saving || phone.status !== "CONNECTED"}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                          <Phone className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{phone.display_phone_number}</p>
                          <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] h-4 px-1 ${phone.status === "CONNECTED" ? "text-green-600 border-green-300" : "text-amber-600 border-amber-300"}`}
                            >
                              {phone.status === "CONNECTED" ? "Verificado" : phone.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full" onClick={() => setStep("select_waba")}>
                Atrás
              </Button>
            </div>
          )}

          {/* STEP: webhook */}
          {step === "webhook" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                    ¡WhatsApp conectado exitosamente!
                  </p>
                </div>
              </div>

              {wa.config && (
                <div className="flex flex-wrap gap-1.5">
                  {wa.config.business_name && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Building2 className="h-3 w-3" /> {wa.config.business_name}
                    </Badge>
                  )}
                  {wa.config.display_phone && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Phone className="h-3 w-3" /> {wa.config.display_phone}
                    </Badge>
                  )}
                </div>
              )}

              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Paso final: configura el Webhook</h4>
                <p className="text-xs text-muted-foreground">
                  Para recibir mensajes entrantes en tiempo real, registra esta URL como webhook en tu app de Meta:
                </p>
                <div className="flex items-center gap-2 bg-muted rounded-md p-2">
                  <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={copyWebhookUrl}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>Campos a suscribir:</strong> messages</p>
                </div>
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Guía de webhooks de WhatsApp
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
                    <Badge variant="outline" className="text-xs gap-1">
                      <Building2 className="h-3 w-3" /> {wa.config.business_name}
                    </Badge>
                  )}
                  {wa.config?.display_phone && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Phone className="h-3 w-3" /> {wa.config.display_phone}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2">
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">URL del Webhook</h5>
                <div className="flex items-center gap-2 bg-muted rounded-md p-2">
                  <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={copyWebhookUrl}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <Button
                variant="destructive"
                className="w-full text-xs"
                onClick={async () => {
                  await wa.disconnect();
                  onOpenChange(false);
                }}
              >
                Desconectar WhatsApp
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

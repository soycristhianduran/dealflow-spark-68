import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, ExternalLink, Loader2, MessageCircle,
  Copy, ArrowRight, ArrowLeft, RefreshCw, Phone, Building2,
  ChevronRight, KeyRound, Zap, Plus, Trash2, Settings, Shield
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

type View = "main" | "wizard";
type WizardStep = 1 | 2 | 3;
type ConnectionMethod = "manual" | "oauth" | null;

export function WhatsAppSetupWizard({ open, onOpenChange }: WhatsAppSetupWizardProps) {
  const wa = useWhatsAppIntegration();
  const [view, setView] = useState<View>("main");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);

  // WABA/phone selection state
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
    if (!open) {
      // Reset wizard state when closing
      setTimeout(() => {
        setView("main");
        setWizardStep(1);
        setConnectionMethod(null);
        setManualPhoneId("");
        setManualWabaId("");
        setManualToken("");
      }, 300);
    }
  }, [open]);

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
    setLoadingData(true);
    try {
      const phones = await wa.getPhoneNumbers(waba.id);
      setPhoneNumbers(phones);
    } catch (e: any) {
      toast.error("Error al cargar números: " + e.message);
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
      setWizardStep(3);
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
      setWizardStep(3);
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

  const startNewConnection = () => {
    setView("wizard");
    setWizardStep(1);
    setConnectionMethod(null);
    setManualPhoneId("");
    setManualWabaId("");
    setManualToken("");
  };

  const qualityColor = (quality: string) => {
    switch (quality?.toUpperCase()) {
      case "GREEN": case "HIGH": case "ALTA": return "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
      case "YELLOW": case "MEDIUM": case "MEDIA": return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
      case "RED": case "LOW": case "BAJA": return "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
      default: return "text-muted-foreground";
    }
  };

  const qualityLabel = (quality: string) => {
    switch (quality?.toUpperCase()) {
      case "GREEN": case "HIGH": return "Alta";
      case "YELLOW": case "MEDIUM": return "Media";
      case "RED": case "LOW": return "Baja";
      default: return quality || "—";
    }
  };

  // WIZARD STEP LABELS
  const stepLabels = [
    { num: 1, label: "Seleccionar método" },
    { num: 2, label: "Conectar cuenta" },
    { num: 3, label: "Finalizar configuración" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* ========== MAIN VIEW: Connected numbers ========== */}
        {view === "main" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--success)/0.15)]">
                  <MessageCircle className="h-6 w-6 text-[hsl(var(--success))]" />
                </div>
                <div>
                  <DialogTitle className="text-lg">WhatsApp Business</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Conecta tus números de WhatsApp Business y gestiónalos aquí
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Connected numbers table */}
              {wa.isConnected && wa.config ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs font-semibold">Número de teléfono</TableHead>
                        <TableHead className="text-xs font-semibold">Nombre para mostrar</TableHead>
                        <TableHead className="text-xs font-semibold">Estado</TableHead>
                        <TableHead className="text-xs font-semibold">Calidad</TableHead>
                        <TableHead className="text-xs font-semibold w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-sm font-medium">
                          {wa.config.display_phone || wa.config.phone_number_id}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {wa.config.business_name || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                            <CheckCircle2 className="h-3 w-3" />
                            Conectado
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">Alta</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={async () => {
                                await wa.disconnect();
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setView("wizard");
                                setWizardStep(3);
                              }}
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <Phone className="h-7 w-7 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No hay números conectados</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Conecta tu número de WhatsApp Business para enviar y recibir mensajes desde el CRM.
                    </p>
                  </div>
                </div>
              )}

              <Button
                className="gap-2"
                onClick={startNewConnection}
                style={{ backgroundColor: "hsl(var(--success))" }}
              >
                <Plus className="h-4 w-4" />
                Conectar {wa.isConnected ? "otro número" : "un número"}
              </Button>
            </div>
          </>
        )}

        {/* ========== WIZARD VIEW ========== */}
        {view === "wizard" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-muted-foreground hover:text-foreground -ml-2"
                  onClick={() => {
                    if (wizardStep === 1) {
                      setView("main");
                    } else {
                      setWizardStep((prev) => Math.max(1, prev - 1) as WizardStep);
                    }
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver
                </Button>
              </div>
            </DialogHeader>

            {/* Step indicators */}
            <div className="flex items-center gap-2 pb-2">
              {stepLabels.map((s, i) => {
                const isActive = wizardStep === s.num;
                const isDone = wizardStep > s.num;
                return (
                  <div key={s.num} className="flex items-center gap-2">
                    {i > 0 && <div className={`h-px w-6 ${isDone ? "bg-[hsl(var(--success))]" : "bg-border"}`} />}
                    <div className="flex items-center gap-1.5">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        isDone
                          ? "bg-[hsl(var(--success))] text-white"
                          : isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                      </div>
                      <span className={`text-xs hidden sm:inline ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-5">
              {/* ===== STEP 1: Select method ===== */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="text-center space-y-2 py-2">
                    <div className="flex justify-center">
                      <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--success)/0.1)]">
                          <MessageCircle className="h-10 w-10 text-[hsl(var(--success))]" />
                        </div>
                      </div>
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                      ¿Cómo quieres conectar WhatsApp?
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Vincula tu WhatsApp Business existente o configúralo manualmente con tus credenciales de Meta.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {/* Manual connection */}
                    <button
                      className="flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-primary/30 bg-card p-5 text-left transition-all hover:shadow-sm"
                      onClick={() => {
                        setConnectionMethod("manual");
                        setWizardStep(2);
                      }}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                        <KeyRound className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">Configuración manual</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ingresa tu Phone Number ID, WABA ID y Access Token desde el panel de Meta Business.
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </button>

                    {/* Embedded Signup */}
                    <button
                      className="flex items-center gap-4 rounded-xl border-2 border-transparent hover:border-primary/30 bg-card p-5 text-left transition-all hover:shadow-sm"
                      onClick={() => {
                        setConnectionMethod("embedded");
                        setWizardStep(2);
                      }}
                      disabled={!wa.metaAppId}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0" style={{ backgroundColor: "#1877F2" + "1a" }}>
                        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#1877F2">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">Continuar con Facebook</p>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">BSP/TP</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Conecta automáticamente vía Facebook Embedded Signup (requiere ser proveedor autorizado).
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </button>
                  </div>
                </div>
              )}

              {/* ===== STEP 2: Connect account ===== */}
              {wizardStep === 2 && connectionMethod === "manual" && (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Credenciales de WhatsApp Cloud API
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Obtén estos datos desde{" "}
                      <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                        Meta for Developers <ExternalLink className="h-3 w-3 inline" />
                      </a>{" "}
                      → tu app → WhatsApp → Configuración de la API.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="wa-phone-id" className="text-xs font-medium">Phone Number ID</Label>
                      <Input
                        id="wa-phone-id"
                        placeholder="Ej: 123456789012345"
                        value={manualPhoneId}
                        onChange={(e) => setManualPhoneId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wa-waba-id" className="text-xs font-medium">WABA ID (WhatsApp Business Account ID)</Label>
                      <Input
                        id="wa-waba-id"
                        placeholder="Ej: 123456789012345"
                        value={manualWabaId}
                        onChange={(e) => setManualWabaId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wa-token" className="text-xs font-medium">Access Token permanente</Label>
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
                    {saving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Validando y guardando...</>
                    ) : (
                      <>Conectar WhatsApp <ArrowRight className="h-4 w-4" /></>
                    )}
                  </Button>
                </div>
              )}

              {wizardStep === 2 && connectionMethod === "embedded" && (
                <div className="space-y-4">
                  <div className="text-center space-y-3 py-4">
                    <div className="flex justify-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
                        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="#1877F2">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      </div>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
                        <MessageCircle className="h-7 w-7 text-[hsl(var(--success))]" />
                      </div>
                    </div>
                    <h3 className="text-base font-semibold">Continúa con Facebook</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Este proceso conectará tu cuenta de WhatsApp Business a través de Facebook. Asegúrate de que tu número de teléfono esté activo y accesible.
                    </p>
                  </div>

                  <Button
                    className="w-full gap-2 h-11"
                    onClick={handleEmbeddedSignup}
                    disabled={wa.connecting}
                    style={{ backgroundColor: "#1877F2" }}
                  >
                    {wa.connecting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Conectando...</>
                    ) : (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="white">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        Continuar con Facebook
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Nota: el Embedded Signup requiere que tu aplicación de Meta esté registrada como BSP o Technology Provider.
                  </p>
                </div>
              )}

              {/* ===== STEP 3: Finalize - Webhook config ===== */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)] p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-[hsl(var(--success))]">¡WhatsApp conectado exitosamente!</p>
                        {wa.config && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {wa.config.display_phone} · {wa.config.business_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Configurar Webhook
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Para recibir mensajes entrantes, registra esta URL como webhook en tu app de Meta.
                    </p>
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-2.5">
                      <code className="text-xs flex-1 break-all font-mono">{webhookUrl}</code>
                      <Button size="sm" variant="ghost" onClick={copyWebhookUrl} className="shrink-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Campo a suscribir:</strong> messages</p>
                      <p><strong>Verify Token:</strong> usa cualquier string seguro que configures en tu edge function</p>
                    </div>
                    <a
                      href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Guía de webhooks de Meta
                    </a>
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      setView("main");
                      wa.refreshConfig();
                    }}
                  >
                    Finalizar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

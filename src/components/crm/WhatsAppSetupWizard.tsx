import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Copy, AlertTriangle } from "lucide-react";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { toast } from "sonner";

interface WhatsAppSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsAppSetupWizard({ open, onOpenChange }: WhatsAppSetupWizardProps) {
  const wa = useWhatsAppIntegration();
  const [step, setStep] = useState(wa.isConnected ? 3 : 0);
  const [form, setForm] = useState({
    phone_number_id: wa.config?.phone_number_id || "",
    waba_id: wa.config?.waba_id || "",
    access_token: "",
    display_phone: wa.config?.display_phone || "",
    business_name: wa.config?.business_name || "",
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const handleSave = async () => {
    if (!form.phone_number_id || !form.waba_id || !form.access_token) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    await wa.saveConfig(form);
    setStep(3);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada al portapapeles");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/30">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <DialogTitle>Configurar WhatsApp Business</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Conecta tu WhatsApp Cloud API</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Step indicators */}
          <div className="flex gap-2">
            {["Requisitos", "Credenciales", "Webhook", "Listo"].map((label, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 rounded-full mb-1 ${i <= step ? "bg-green-500" : "bg-muted"}`} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* Step 0: Requirements */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Antes de empezar necesitas:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Una cuenta de <strong>Meta Business Suite</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Una app creada en <strong>Meta for Developers</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    El producto <strong>WhatsApp</strong> añadido a tu app
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    Un <strong>número de teléfono verificado</strong> en WhatsApp Business Platform
                  </li>
                </ul>
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Ver guía de configuración de Meta
                </a>
              </div>
              <Button className="w-full" onClick={() => setStep(1)}>
                Ya tengo todo, continuar
              </Button>
            </div>
          )}

          {/* Step 1: Credentials */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Tus credenciales se almacenan de forma segura y encriptada. Solo tú tienes acceso.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Phone Number ID *</Label>
                  <Input
                    placeholder="Ej: 123456789012345"
                    value={form.phone_number_id}
                    onChange={(e) => setForm(f => ({ ...f, phone_number_id: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Encuéntralo en Meta for Developers → WhatsApp → API Setup
                  </p>
                </div>
                <div>
                  <Label className="text-xs">WhatsApp Business Account ID *</Label>
                  <Input
                    placeholder="Ej: 987654321098765"
                    value={form.waba_id}
                    onChange={(e) => setForm(f => ({ ...f, waba_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Access Token (permanente) *</Label>
                  <Input
                    type="password"
                    placeholder="Token de acceso permanente"
                    value={form.access_token}
                    onChange={(e) => setForm(f => ({ ...f, access_token: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Genera un token permanente en Meta Business → System Users
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Nombre del negocio (opcional)</Label>
                  <Input
                    placeholder="Mi Empresa"
                    value={form.business_name}
                    onChange={(e) => setForm(f => ({ ...f, business_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Número de teléfono (opcional, para mostrar)</Label>
                  <Input
                    placeholder="+52 55 1234 5678"
                    value={form.display_phone}
                    onChange={(e) => setForm(f => ({ ...f, display_phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">Atrás</Button>
                <Button onClick={() => setStep(2)} className="flex-1" disabled={!form.phone_number_id || !form.waba_id || !form.access_token}>
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Webhook */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Configura el Webhook en Meta</h4>
                <p className="text-xs text-muted-foreground">
                  Para recibir mensajes entrantes, configura esta URL como webhook en tu app de Meta:
                </p>
                <div className="flex items-center gap-2 bg-muted rounded-md p-2">
                  <code className="text-xs flex-1 break-all">{webhookUrl}</code>
                  <Button size="sm" variant="ghost" onClick={copyWebhookUrl}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p><strong>Campos a suscribir:</strong> messages</p>
                  <p><strong>Verify Token:</strong> Usa el mismo token configurado en tu webhook de Facebook</p>
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

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Atrás</Button>
                <Button onClick={handleSave} className="flex-1" disabled={wa.saving}>
                  {wa.saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Guardando...</> : "Guardar y conectar"}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Connected */}
          {step === 3 && wa.isConnected && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">WhatsApp conectado</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {wa.config?.business_name && <Badge variant="outline" className="text-xs">{wa.config.business_name}</Badge>}
                  {wa.config?.display_phone && <Badge variant="outline" className="text-xs">{wa.config.display_phone}</Badge>}
                  <Badge variant="outline" className="text-xs">ID: {wa.config?.phone_number_id}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Button variant="outline" className="w-full text-xs" onClick={() => setStep(1)}>
                  Editar credenciales
                </Button>
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

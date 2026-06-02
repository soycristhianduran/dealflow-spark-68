import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const sources = ["Facebook Ads", "Google Ads", "WhatsApp", "Referral", "Landing Page", "Instagram", "Otro"];
const channels = ["whatsapp", "email", "phone", "sms"];

type CompanyOption = { id: string; name: string };
type CustomField = { key: string; value: string };

export function CreateContactDialog({ open, onOpenChange, onCreated }: CreateContactDialogProps) {
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    primary_phone: "",
    primary_email: "",
    source: "",
    preferred_channel: "",
    country: "",
    city: "",
    notes: "",
    company_id: "",
    birthday: "",
  });

  useEffect(() => {
    if (open) {
      supabase.from("companies").select("id, name").order("name").then(({ data }) => {
        setCompanies(data || []);
      });
    } else {
      setCustomFields([]);
      setShowCustomFields(false);
      setNewFieldKey("");
    }
  }, [open]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const addCustomField = () => {
    const key = newFieldKey.trim();
    if (!key) { toast.error("Escribe un nombre para el campo"); return; }
    if (customFields.some(f => f.key.toLowerCase() === key.toLowerCase())) {
      toast.error("Ese campo ya existe"); return;
    }
    setCustomFields(prev => [...prev, { key, value: "" }]);
    setNewFieldKey("");
  };

  const updateCustomField = (index: number, value: string) => {
    setCustomFields(prev => prev.map((f, i) => i === index ? { ...f, value } : f));
  };

  const removeCustomField = (index: number) => {
    setCustomFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) { toast.error("El nombre es requerido"); return; }
    
    setLoading(true);
    const companyId = form.company_id && form.company_id !== "none" ? form.company_id : null;
    const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");

    // Build custom_fields JSON
    const customFieldsObj: Record<string, string> = {};
    customFields.forEach(f => {
      if (f.key.trim() && f.value.trim()) {
        customFieldsObj[f.key.trim().toLowerCase().replace(/\s+/g, "_")] = f.value.trim();
      }
    });

    const { data: contact, error } = await supabase.from("contacts").insert({
      full_name: fullName,
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      primary_phone: form.primary_phone || null,
      primary_email: form.primary_email || null,
      source: form.source || null,
      preferred_channel: form.preferred_channel || null,
      country: form.country || null,
      city: form.city || null,
      notes: form.notes || null,
      company_id: companyId,
      birthday: form.birthday || null,
      status: "new",
      score: 0,
      custom_fields: Object.keys(customFieldsObj).length > 0 ? customFieldsObj : {},
      ...(organizationId ? { organization_id: organizationId } : {}),
    }).select("id").single();

    if (error) {
      // Plan limit reached
      if (error.message?.includes("contact_limit_reached")) {
        toast.error(
          (error as any).details ||
          "Has alcanzado el límite de contactos de tu plan. Mejora tu suscripción para agregar más.",
          { duration: 6000 }
        );
      } else {
        toast.error("Error al crear lead: " + error.message);
      }
    } else {
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id")
        .limit(1)
        .single();

      if (pipeline) {
        const { data: firstStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .order("order", { ascending: true })
          .limit(1)
          .single();

        if (firstStage) {
          await supabase.from("deals").insert({
            title: `Deal - ${fullName}`,
            contact_id: contact.id,
            company_id: companyId,
            pipeline_id: pipeline.id,
            stage_id: firstStage.id,
            value: 0,
            status: "open",
            source: form.source || null,
            ...(organizationId ? { organization_id: organizationId } : {}),
          });
        }
      }

      toast.success("Lead creado y agregado al pipeline");

      // Fire contact_created automation trigger (fire-and-forget)
      supabase.functions.invoke("automation-runner", {
        body: { action: "trigger_event", trigger_type: "contact_created", contact_id: contact.id },
      }).catch(() => {});

      setForm({ first_name: "", last_name: "", primary_phone: "", primary_email: "", source: "", preferred_channel: "", country: "", city: "", notes: "", company_id: "", birthday: "" });
      setCustomFields([]);
      onOpenChange(false);
      onCreated();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.first_name} onChange={e => update("first_name", e.target.value)} placeholder="Carlos" />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input value={form.last_name} onChange={e => update("last_name", e.target.value)} placeholder="Mendoza" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={form.primary_phone} onChange={e => update("primary_phone", e.target.value)} placeholder="+52 55 1234 5678" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.primary_email} onChange={e => update("primary_email", e.target.value)} placeholder="carlos@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={form.company_id} onValueChange={v => update("company_id", v)}>
                <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin empresa</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origen</Label>
              <Select value={form.source} onValueChange={v => update("source", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canal preferido</Label>
              <Select value={form.preferred_channel} onValueChange={v => update("preferred_channel", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {channels.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>País</Label>
              <Input value={form.country} onChange={e => update("country", e.target.value)} placeholder="México" />
            </div>
            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="CDMX" />
            </div>
            <div className="space-y-2">
              <Label>Fecha de nacimiento</Label>
              <Input type="date" value={form.birthday} onChange={e => update("birthday", e.target.value)} />
            </div>
          </div>

          {/* Custom Fields Section */}
          <div className="border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setShowCustomFields(!showCustomFields)}
              className="flex items-center justify-between w-full p-3 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Campos personalizados
                {customFields.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {customFields.length}
                  </span>
                )}
              </span>
              {showCustomFields ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showCustomFields && (
              <div className="px-3 pb-3 space-y-3">
                {customFields.map((field, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">{field.key}</Label>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          value={field.value}
                          onChange={e => updateCustomField(index, e.target.value)}
                          placeholder="Valor"
                          className="h-8 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeCustomField(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newFieldKey}
                    onChange={e => setNewFieldKey(e.target.value)}
                    placeholder="Nombre del campo"
                    className="h-8 text-sm flex-1"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomField(); } }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={addCustomField}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Creando..." : "Crear lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
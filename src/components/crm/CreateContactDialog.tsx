import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const sources = ["Facebook Ads", "Google Ads", "WhatsApp", "Referral", "Landing Page", "Instagram", "Otro"];
const channels = ["whatsapp", "email", "phone", "sms"];

type CompanyOption = { id: string; name: string };

export function CreateContactDialog({ open, onOpenChange, onCreated }: CreateContactDialogProps) {
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
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
        setCompanies((data as any) || []);
      });
    }
  }, [open]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error("El nombre es requerido"); return; }
    
    setLoading(true);
    const companyId = form.company_id && form.company_id !== "none" ? form.company_id : null;

    const { data: contact, error } = await supabase.from("contacts").insert({
      full_name: form.full_name.trim(),
      primary_phone: form.primary_phone || null,
      primary_email: form.primary_email || null,
      source: form.source || null,
      preferred_channel: form.preferred_channel || null,
      country: form.country || null,
      city: form.city || null,
      notes: form.notes || null,
      company_id: companyId,
      status: "new",
      score: 0,
    }).select("id").single();

    if (error) {
      toast.error("Error al crear lead: " + error.message);
    } else {
      // Auto-create deal in first pipeline stage
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
            title: `Deal - ${form.full_name.trim()}`,
            contact_id: contact.id,
            company_id: companyId,
            pipeline_id: pipeline.id,
            stage_id: firstStage.id,
            value: 0,
            status: "open",
            source: form.source || null,
          });
        }
      }

      toast.success("Lead creado y agregado al pipeline");
      setForm({ full_name: "", primary_phone: "", primary_email: "", source: "", preferred_channel: "", country: "", city: "", notes: "", company_id: "" });
      onOpenChange(false);
      onCreated();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Nombre completo *</Label>
              <Input value={form.full_name} onChange={e => update("full_name", e.target.value)} placeholder="Ej: Carlos Mendoza" />
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

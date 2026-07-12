import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";

interface Flow { id: string; name: string; status: string; categories?: string[] }
interface FieldDef { label: string; type: string; options: string; required: boolean }

const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Teléfono" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista de opciones" },
];

/** Formulario de creación de un WhatsApp Flow (una pantalla, hasta 10 campos).
 *  Se usa dentro del diálogo "Nueva plantilla" (tipo Flow) y en la sección de Flows. */
export function FlowCreateForm({ onDone, onPreviewChange }: { onDone: () => void; onPreviewChange?: (p: { body: string; cta: string }) => void }) {
  const { organizationId } = useOrganizationContext();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([{ label: "", type: "text", options: "", required: true }]);
  const [tplBody, setTplBody] = useState("");
  const [tplCta, setTplCta] = useState("Abrir formulario");

  useEffect(() => {
    onPreviewChange?.({ body: tplBody, cta: tplCta });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplBody, tplCta]);

  const setField = (i: number, patch: Partial<FieldDef>) =>
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const create = async () => {
    const cleanFields = fields
      .filter(f => f.label.trim())
      .map(f => ({
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === "select" ? f.options.split(",").map(o => o.trim()).filter(Boolean) : undefined,
      }));
    if (!name.trim() || !cleanFields.length) { toast.error("Nombre y al menos un campo son obligatorios"); return; }
    setSaving(true);
    if (!tplBody.trim()) { toast.error("Escribe el cuerpo del mensaje que enviará el formulario"); return; }
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: {
        action: "create_flow", organization_id: organizationId,
        name: name.trim(), title: title.trim() || name.trim(), fields: cleanFields,
        template_body: tplBody.trim(), template_cta: tplCta.trim() || "Abrir formulario",
      },
    });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error || "No se pudo crear el Flow"); return; }
    if (data?.published) {
      if (data.template?.error) toast.warning(`Flow publicado (ID: ${data.flow_id}) pero la plantilla falló: ${data.template.error}`);
      else toast.success(`Flow publicado y plantilla "${data.template?.name}" enviada a revisión de Meta`);
    }
    else toast.warning(`Flow creado (ID: ${data.flow_id}) pero quedó en borrador: ${data.publish_error || JSON.stringify(data.validation_errors || [])}`);
    setName(""); setTitle(""); setFields([{ label: "", type: "text", options: "", required: true }]);
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Nombre interno</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="agendamiento_cita" />
        </div>
        <div>
          <Label className="text-xs">Título visible (máx 30)</Label>
          <Input maxLength={30} value={title} onChange={e => setTitle(e.target.value)} placeholder="Agenda tu cita" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Campos del formulario (máx 10)</Label>
        {fields.map((f, i) => (
          <div key={i} className="rounded-lg border p-2.5 space-y-2">
            <div className="flex gap-2">
              <Input className="flex-1" placeholder="Etiqueta — ej: ¿Qué día prefieres?" value={f.label} onChange={e => setField(i, { label: e.target.value })} />
              <Select value={f.type} onValueChange={v => setField(i, { type: v })}>
                <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive shrink-0"
                onClick={() => setFields(prev => prev.filter((_, idx) => idx !== i))} disabled={fields.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {f.type === "select" && (
              <Input placeholder="Opciones separadas por coma — ej: Mañana, Tarde, Noche" value={f.options} onChange={e => setField(i, { options: e.target.value })} />
            )}
          </div>
        ))}
        {fields.length < 10 && (
          <Button variant="outline" size="sm" onClick={() => setFields(prev => [...prev, { label: "", type: "text", options: "", required: true }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Añadir campo
          </Button>
        )}
      </div>

      <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
        <Label className="text-xs font-semibold">Mensaje de la plantilla que envía el formulario</Label>
        <Textarea rows={3} value={tplBody} onChange={e => setTplBody(e.target.value)}
          placeholder="Hola, para agendar tu valoración necesitamos unos datos. Toca el botón 👇" />
        <div>
          <Label className="text-xs">Texto del botón (CTA, máx 25)</Label>
          <Input maxLength={25} value={tplCta} onChange={e => setTplCta(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Se crea como plantilla con botón que abre el formulario. Meta la revisa (24-48h); una vez aprobada puedes iniciar conversaciones con ella desde flujos y campañas.
        </p>
      </div>

      <Button className="w-full" onClick={create} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Crear y publicar
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Se crea y publica en el WhatsApp Manager de esta organización; el cliente lo llena sin salir de WhatsApp y las respuestas se guardan en el lead.
        Envíalo desde un flujo con el paso "Enviar WhatsApp Flow". Para formularios de varias pantallas, usa el Flow Builder de Meta y pega el ID.
      </p>
    </div>
  );
}

/** Tarjetas de Flows para el grid del catálogo de plantillas (sin contenedor propio). */
export function FlowCardsInline() {
  const { organizationId } = useOrganizationContext();
  const [flows, setFlows] = useState<Flow[]>([]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "list_flows", organization_id: organizationId },
    });
    if (!error && data?.flows) setFlows(data.flows);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const publish = async (id: string) => {
    const { data } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "publish_flow", organization_id: organizationId, flow_id: id },
    });
    if (data?.success) { toast.success("Flow publicado"); load(); }
    else toast.error(data?.error?.message || "No se pudo publicar");
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este Flow (solo borradores)?")) return;
    await supabase.functions.invoke("whatsapp-api", {
      body: { action: "delete_flow", organization_id: organizationId, flow_id: id },
    });
    load();
  };

  return (
    <>
      {flows.map(f => (
        <div key={f.id} className="rounded-xl border bg-card p-4 space-y-2 border-emerald-200/60">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold truncate">{f.name}</p>
            </div>
            <Badge variant={f.status === "PUBLISHED" ? "default" : "outline"} className="text-[10px] shrink-0">
              {f.status === "PUBLISHED" ? "Publicado" : f.status === "DRAFT" ? "Borrador" : f.status}
            </Badge>
          </div>
          <Badge variant="outline" className="text-[10px]">FLOW · Formulario</Badge>
          <p className="text-xs text-muted-foreground select-all">ID: {f.id}</p>
          <div className="flex justify-end gap-1 pt-1 border-t">
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { navigator.clipboard.writeText(f.id); toast.success("ID copiado"); }}>Copiar ID</Button>
            {f.status === "DRAFT" && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => publish(f.id)}>Publicar</Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function WhatsAppFlowsSection() {
  const { organizationId } = useOrganizationContext();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "list_flows", organization_id: organizationId },
    });
    if (!error && data?.flows) setFlows(data.flows);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const publish = async (id: string) => {
    const { data } = await supabase.functions.invoke("whatsapp-api", {
      body: { action: "publish_flow", organization_id: organizationId, flow_id: id },
    });
    if (data?.success) { toast.success("Flow publicado"); load(); }
    else toast.error(data?.error?.message || "No se pudo publicar");
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este Flow (solo borradores)?")) return;
    await supabase.functions.invoke("whatsapp-api", {
      body: { action: "delete_flow", organization_id: organizationId, flow_id: id },
    });
    load();
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-600" /> WhatsApp Flows (formularios nativos)</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Formularios que el cliente llena dentro de WhatsApp. Créalos desde "Nueva plantilla" → tipo Flow, o aquí.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" onClick={() => setDlgOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo Flow</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : flows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Esta organización aún no tiene Flows. Crea el primero — por ejemplo, un formulario de agendamiento.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {flows.map(f => (
            <div key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-[11px] text-muted-foreground">ID: {f.id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={f.status === "PUBLISHED" ? "default" : "outline"} className="text-[10px]">
                  {f.status === "PUBLISHED" ? "Publicado" : f.status === "DRAFT" ? "Borrador" : f.status}
                </Badge>
                {f.status === "DRAFT" && (
                  <>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => publish(f.id)}>Publicar</Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo WhatsApp Flow</DialogTitle></DialogHeader>
          <FlowCreateForm onDone={() => { setDlgOpen(false); load(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

// Formularios prediseñados (estilo Kommo) — punto de partida editable
const FLOW_PRESETS: { key: string; label: string; desc: string; title: string; fields: FieldDef[] }[] = [
  { key: "agendamiento", label: "Agendar cita", desc: "Día, franja horaria y datos de contacto",
    title: "Agenda tu cita", fields: [
      { label: "¿Qué día prefieres?", type: "date", options: "", required: true },
      { label: "Franja horaria", type: "select", options: "Mañana, Tarde", required: true },
      { label: "Teléfono de contacto", type: "phone", options: "", required: true },
    ] },
  { key: "feedback", label: "Compartir feedback", desc: "Comentarios sobre tu producto o servicio",
    title: "Cuéntanos tu opinión", fields: [
      { label: "¿Cómo calificas tu experiencia?", type: "select", options: "Excelente, Buena, Regular, Mala", required: true },
      { label: "¿Qué podemos mejorar?", type: "textarea", options: "", required: false },
    ] },
  { key: "evento", label: "Inscripción a evento", desc: "Registro de asistentes",
    title: "Inscríbete al evento", fields: [
      { label: "Nombre completo", type: "text", options: "", required: true },
      { label: "Email", type: "email", options: "", required: true },
      { label: "¿Cuántas personas asisten?", type: "number", options: "", required: true },
    ] },
  { key: "custom", label: "Formulario personalizado", desc: "Crea un Flow a tu medida",
    title: "", fields: [{ label: "", type: "text", options: "", required: true }] },
];

const FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Teléfono" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista de opciones" },
];

/** Constructor de WhatsApp Flow: elementos de contenido (encabezados, texto,
 *  leyenda, imagen) + campos anclados a los campos del CRM (estándar y
 *  personalizados de la organización) para mapeo automático de respuestas. */
export interface FlowElement {
  kind: "heading_lg" | "heading_sm" | "body" | "caption" | "image" | "field";
  text?: string;
  src?: string;          // base64 para imagen
  key?: string;          // clave CRM (std_<col> o clave de campo personalizado)
  label?: string;
  ftype?: string;        // text|textarea|number|email|phone|date|select
  options?: string[];
  required?: boolean;
}

const STD_FLOW_FIELDS: { key: string; label: string; ftype: string }[] = [
  { key: "std_first_name", label: "Nombre", ftype: "text" },
  { key: "std_last_name", label: "Apellido", ftype: "text" },
  { key: "std_primary_email", label: "Email", ftype: "email" },
  { key: "std_primary_phone", label: "Teléfono", ftype: "phone" },
  { key: "std_city", label: "Ciudad", ftype: "text" },
  { key: "std_country", label: "País", ftype: "text" },
  { key: "std_company_name", label: "Empresa", ftype: "text" },
  { key: "std_budget", label: "Presupuesto", ftype: "number" },
  { key: "std_notes", label: "Notas", ftype: "textarea" },
];

const CONTENT_ELEMENTS: { kind: FlowElement["kind"]; label: string }[] = [
  { kind: "heading_lg", label: "T Encabezado grande" },
  { kind: "heading_sm", label: "T Encabezado pequeño" },
  { kind: "body", label: "T Texto" },
  { kind: "caption", label: "T Leyenda" },
  { kind: "image", label: "🖼 Imagen" },
];

export function FlowCreateForm({ onDone, onPreviewChange, onEditingSection }: {
  onDone: () => void;
  onPreviewChange?: (p: { body: string; cta: string; title: string; elements: FlowElement[] }) => void;
  onEditingSection?: (s: "message" | "form") => void;
}) {
  const { organizationId } = useOrganizationContext();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplCta, setTplCta] = useState("Abrir formulario");
  const [elements, setElements] = useState<FlowElement[]>([]);
  const [orgFields, setOrgFields] = useState<{ key: string; label: string; field_type: string }[]>([]);
  const [fieldPick, setFieldPick] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("custom_field_definitions").select("key, label, field_type")
      .eq("organization_id", organizationId).order("position")
      .then(({ data }) => setOrgFields(data ?? []));
  }, [organizationId]);

  useEffect(() => {
    onPreviewChange?.({ body: tplBody, cta: tplCta, title: title || "Tu Flow", elements });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplBody, tplCta, title, elements]);

  const addContent = (kind: FlowElement["kind"]) => {
    onEditingSection?.("form");
    setElements(prev => [...prev, { kind, text: "" }]);
  };

  const addField = (val: string) => {
    onEditingSection?.("form");
    setFieldPick("");
    if (val === "__new__") {
      setElements(prev => [...prev, { kind: "field", key: "", label: "", ftype: "text", required: true }]);
      return;
    }
    const std = STD_FLOW_FIELDS.find(f => f.key === val);
    if (std) { setElements(prev => [...prev, { kind: "field", key: std.key, label: std.label, ftype: std.ftype, required: true }]); return; }
    const cf = orgFields.find(f => f.key === val);
    if (cf) {
      const ftype = cf.field_type === "number" ? "number" : cf.field_type === "date" ? "date" : "text";
      setElements(prev => [...prev, { kind: "field", key: cf.key, label: cf.label, ftype, required: true }]);
    }
  };

  const setEl = (i: number, patch: Partial<FlowElement>) => {
    onEditingSection?.("form");
    setElements(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  };
  const move = (i: number, dir: -1 | 1) =>
    setElements(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const arr = [...prev]; [arr[i], arr[j]] = [arr[j], arr[i]]; return arr;
    });
  const removeEl = (i: number) => setElements(prev => prev.filter((_, idx) => idx !== i));

  const pickImage = (i: number, file: File | null) => {
    if (!file) return;
    if (file.size > 300_000) { toast.error("Imagen muy pesada — Meta permite hasta ~300KB por imagen en Flows"); return; }
    if (elements.filter(e => e.kind === "image" && e.src).length >= 3) { toast.error("Meta permite máximo 3 imágenes por pantalla"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(",")[1] || "";
      setEl(i, { src: b64 });
    };
    reader.readAsDataURL(file);
  };

  const slugify = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

  const create = async () => {
    const clean = elements
      .map(e => e.kind === "field" && !e.key && e.label ? { ...e, key: slugify(e.label) } : e)
      .filter(e => (e.kind === "field" ? !!(e.key && e.label) : e.kind === "image" ? !!e.src : !!e.text?.trim()));
    const fieldCount = clean.filter(e => e.kind === "field").length;
    if (!name.trim()) { toast.error("Ponle un nombre interno al Flow"); return; }
    if (!fieldCount) { toast.error("Agrega al menos un campo del formulario"); return; }
    if (!tplBody.trim()) { toast.error("Escribe el cuerpo del mensaje que enviará el formulario"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-api", {
      body: {
        action: "create_flow_v2", organization_id: organizationId,
        name: name.trim(), title: title.trim() || name.trim(), elements: clean,
        template_body: tplBody.trim(), template_cta: tplCta.trim() || "Abrir formulario",
      },
    });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error || "No se pudo crear el Flow"); return; }
    if (data?.published) {
      if (data.template?.error) toast.warning(`Flow publicado (ID: ${data.flow_id}) pero la plantilla falló: ${data.template.error}`);
      else toast.success(`Flow publicado y plantilla "${data.template?.name}" enviada a revisión de Meta`);
    } else {
      toast.warning(`Flow creado (ID: ${data.flow_id}) pero quedó en borrador: ${data.publish_error || JSON.stringify(data.validation_errors || [])}`);
    }
    setName(""); setTitle(""); setElements([]); setTplBody("");
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
          <Label className="text-xs">Título de la pantalla (máx 30)</Label>
          <Input maxLength={30} value={title} onChange={e => setTitle(e.target.value)} placeholder="Agenda tu cita" />
        </div>
      </div>

      {/* Paleta de elementos */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Añadir a la pantalla</Label>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_ELEMENTS.map(ce => (
            <Button key={ce.kind} type="button" variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => addContent(ce.kind)}>{ce.label}</Button>
          ))}
        </div>
        <Select value={fieldPick} onValueChange={addField}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="＋ Campo del formulario (se mapea automático al CRM)…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__" className="text-xs italic">Campo personalizado nuevo…</SelectItem>
            {STD_FLOW_FIELDS.map(f => (
              <SelectItem key={f.key} value={f.key} className="text-xs">{f.label} <span className="text-muted-foreground ml-1">· estándar</span></SelectItem>
            ))}
            {orgFields.map(f => (
              <SelectItem key={f.key} value={f.key} className="text-xs">{f.label} <span className="text-muted-foreground ml-1">· personalizado</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de elementos */}
      <div className="space-y-2">
        {elements.length === 0 && (
          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
            Añade textos, imágenes (máx 3, ~300KB c/u) y campos del formulario. Se muestran en el teléfono en el orden de esta lista.
          </p>
        )}
        {elements.map((el, i) => (
          <div key={i} className="rounded-lg border p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground shrink-0 w-24">
                {el.kind === "field" ? (el.key?.startsWith("std_") ? "Campo · CRM" : "Campo") :
                 el.kind === "heading_lg" ? "Encab. grande" : el.kind === "heading_sm" ? "Encab. pequeño" :
                 el.kind === "body" ? "Texto" : el.kind === "caption" ? "Leyenda" : "Imagen"}
              </span>
              {el.kind === "image" ? (
                <div className="flex-1 flex items-center gap-2">
                  <input type="file" accept="image/*" className="text-[11px] flex-1"
                    onChange={e => pickImage(i, e.target.files?.[0] ?? null)} />
                  {el.src && <span className="text-[10px] text-emerald-600">✓ cargada</span>}
                </div>
              ) : el.kind === "field" ? (
                <Input className="h-7 text-xs flex-1" placeholder="Etiqueta del campo" value={el.label ?? ""}
                  onChange={e => setEl(i, { label: e.target.value })} />
              ) : (
                <Input className="h-7 text-xs flex-1" placeholder="Texto…" value={el.text ?? ""}
                  onChange={e => setEl(i, { text: e.target.value })} />
              )}
              <div className="flex shrink-0">
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => move(i, -1)}>↑</Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => move(i, 1)}>↓</Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeEl(i)}>×</Button>
              </div>
            </div>
            {el.kind === "field" && (
              <div className="flex gap-1.5 pl-24">
                <Select value={el.ftype ?? "text"} onValueChange={v => setEl(i, { ftype: v })}>
                  <SelectTrigger className="h-7 w-36 text-xs shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {el.ftype === "select" && (
                  <Input className="h-7 text-xs flex-1" placeholder="Opciones separadas por coma"
                    value={(el.options ?? []).join(", ")}
                    onChange={e => setEl(i, { options: e.target.value.split(",").map(o => o.trim()).filter(Boolean) })} />
                )}
                {el.key?.startsWith("std_") && (
                  <span className="self-center text-[10px] text-emerald-600 whitespace-nowrap">→ {el.key.slice(4)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
        <Label className="text-xs font-semibold">Mensaje de la plantilla que envía el formulario</Label>
        <Textarea rows={3} value={tplBody} onFocus={() => onEditingSection?.("message")}
          onChange={e => setTplBody(e.target.value)}
          placeholder="Hola, para agendar tu valoración necesitamos unos datos. Toca el botón 👇" />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Variables:</span>
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px] font-mono"
            onClick={() => {
              const matches = tplBody.match(/\{\{\d+\}\}/g) ?? [];
              const next = matches.length ? Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ""), 10))) + 1 : 1;
              setTplBody(b => `${b}{{${next}}}`);
              onEditingSection?.("message");
            }}>
            + {"{{"}{(tplBody.match(/\{\{\d+\}\}/g) ?? []).length + 1}{"}}"}
          </Button>
          <span className="text-[10px] text-muted-foreground">se mapean al enviar (nombre, campos del lead…)</span>
        </div>
        <div>
          <Label className="text-xs">Texto del botón (CTA, máx 25)</Label>
          <Input maxLength={25} value={tplCta} onFocus={() => onEditingSection?.("message")} onChange={e => setTplCta(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Puedes usar variables {"{{1}}"}, {"{{2}}"}… en el cuerpo (se mapean al enviar, como en cualquier plantilla). Pasa por revisión de Meta (24-48h). Las respuestas del formulario se mapean automáticamente al lead.
        </p>
      </div>

      <Button className="w-full" onClick={create} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Crear y publicar
      </Button>
    </div>
  );
}

/** Tarjetas de Flows para el grid del catálogo de plantillas (sin contenedor propio). */
export function FlowCardsInline({ hideIds }: { hideIds?: string[] }) {
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

  const hidden = new Set(hideIds ?? []);
  const visible = flows.filter(f => !hidden.has(String(f.id)));
  return (
    <>
      {visible.map(f => (
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

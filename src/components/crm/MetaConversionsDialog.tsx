import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";

// Eventos estándar de Meta más usados + opción de nombre personalizado.
const EVENT_OPTIONS = [
  { value: "", label: "— Sin evento —" },
  { value: "Schedule", label: "Programación de cita (Schedule)" },
  { value: "Purchase", label: "Compra / Venta (Purchase)" },
  { value: "Lead", label: "Lead calificado (Lead)" },
  { value: "CompleteRegistration", label: "Registro completado" },
  { value: "SubmitApplication", label: "Solicitud enviada" },
  { value: "Contact", label: "Contactado (Contact)" },
  { value: "__custom__", label: "Personalizado…" },
];

interface Stage { id: string; name: string; pipeline_id: string; order: number }
interface Pipeline { id: string; name: string }

export function MetaConversionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  // stage_id → event_name; "__custom__:<texto>" mientras se edita personalizado
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [customEditing, setCustomEditing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !organizationId) return;
    setLoading(true);
    (async () => {
      const [{ data: settings }, { data: pls }, { data: sts }, { data: maps }] = await Promise.all([
        supabase.from("meta_conversion_settings").select("pixel_id, enabled").eq("organization_id", organizationId).maybeSingle(),
        supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at"),
        supabase.from("pipeline_stages").select("id, name, pipeline_id, order").eq("organization_id", organizationId).order("order"),
        supabase.from("meta_conversion_mappings").select("stage_id, event_name").eq("organization_id", organizationId),
      ]);
      setPixelId(settings?.pixel_id ?? "");
      setEnabled(settings?.enabled ?? true);
      setPipelines(pls ?? []);
      setStages((sts ?? []) as Stage[]);
      const m: Record<string, string> = {};
      for (const row of maps ?? []) m[row.stage_id] = row.event_name;
      setMappings(m);
      setCustomEditing({});
      setLoading(false);
    })();
  }, [open, organizationId]);

  const save = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const { error: sErr } = await supabase.from("meta_conversion_settings").upsert({
        organization_id: organizationId,
        pixel_id: pixelId.trim() || null,
        enabled,
        updated_at: new Date().toISOString(),
      });
      if (sErr) throw sErr;

      // Reemplaza los mapeos de la org por los del formulario.
      const { error: dErr } = await supabase.from("meta_conversion_mappings").delete().eq("organization_id", organizationId);
      if (dErr) throw dErr;
      const rows = Object.entries(mappings)
        .filter(([, ev]) => ev && ev !== "__custom__")
        .map(([stage_id, event_name]) => ({ organization_id: organizationId, stage_id, event_name }));
      if (rows.length) {
        const { error: iErr } = await supabase.from("meta_conversion_mappings").insert(rows);
        if (iErr) throw iErr;
      }
      toast.success("Conversiones de Meta guardadas");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const setStageEvent = (stageId: string, value: string) => {
    if (value === "__custom__") {
      setCustomEditing((p) => ({ ...p, [stageId]: true }));
      setMappings((p) => ({ ...p, [stageId]: "" }));
      return;
    }
    setCustomEditing((p) => ({ ...p, [stageId]: false }));
    setMappings((p) => {
      const n = { ...p };
      if (value) n[stageId] = value; else delete n[stageId];
      return n;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversiones de Meta (CAPI)</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Cuando un lead se mueva a una etapa mapeada, se enviará el evento de conversión
              al píxel para que Meta optimice tus campañas con resultados reales del CRM.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">ID del píxel / dataset</label>
              <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Ej: 1234567890123456" />
              <p className="text-[11px] text-muted-foreground">
                Lo encuentras en Meta Events Manager → Orígenes de datos.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Envío de eventos activo</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {pipelines.map((pl) => {
              const plStages = stages.filter((s) => s.pipeline_id === pl.id);
              if (!plStages.length) return null;
              return (
                <div key={pl.id} className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{pl.name}</h4>
                  {plStages.map((st) => {
                    const current = mappings[st.id] ?? "";
                    const isCustom = customEditing[st.id] || (!!current && !EVENT_OPTIONS.some((o) => o.value === current));
                    return (
                      <div key={st.id} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate">{st.name}</span>
                        <select
                          className="w-56 rounded-md border bg-background px-2 py-1.5 text-sm"
                          value={isCustom ? "__custom__" : current}
                          onChange={(e) => setStageEvent(st.id, e.target.value)}
                        >
                          {EVENT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {isCustom && (
                          <Input
                            className="w-40"
                            placeholder="Nombre del evento"
                            value={current}
                            onChange={(e) => setMappings((p) => ({ ...p, [st.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Guardar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

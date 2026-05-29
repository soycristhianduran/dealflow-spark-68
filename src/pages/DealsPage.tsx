import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Trash2, KanbanSquare, Tag } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

type DealRow = {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  expected_close_date: string | null;
  contacts: { full_name: string } | null;
  pipeline_stages: { name: string; color: string } | null;
};

type Stage = { id: string; name: string; color: string };

export default function DealsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "won" | "lost">("all");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const { path } = useWorkspace();

  const fetchDeals = async () => {
    const { data, error } = await supabase
      .from("deals")
      .select("id, title, value, currency, status, stage_id, contact_id, expected_close_date, contacts(full_name), pipeline_stages(name, color)")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Error cargando deals"); return; }
    setDeals((data as unknown as DealRow[]) || []);
    setLoading(false);
  };

  const fetchStages = async () => {
    const { data } = await supabase.from("pipeline_stages").select("id, name, color").order("order");
    if (data) setStages(data as Stage[]);
  };

  useEffect(() => { fetchDeals(); fetchStages(); }, []);

  useRealtimeRefresh({ table: "deals", channelKey: "deals-page-all", onChange: fetchDeals });

  // Clear selection on filter change
  useEffect(() => { setSelected(new Set()); }, [statusFilter, search]);

  const filtered = deals.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === "all" || d.status === statusFilter)
  );

  const counts = {
    all: deals.length,
    open: deals.filter(d => d.status === "open").length,
    won: deals.filter(d => d.status === "won").length,
    lost: deals.filter(d => d.status === "lost").length,
  };

  const visibleIds = filtered.map(d => d.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(visibleIds));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    setBulkWorking(true);
    const { error } = await supabase.from("deals").delete().in("id", [...selected]);
    if (error) { toast.error("Error al eliminar: " + error.message); }
    else { toast.success(`${selected.size} deal${selected.size !== 1 ? "s" : ""} eliminado${selected.size !== 1 ? "s" : ""}`); setSelected(new Set()); fetchDeals(); }
    setBulkWorking(false);
  };

  const handleBulkStatus = async (newStatus: string) => {
    setBulkWorking(true);
    const { error } = await supabase.from("deals").update({ status: newStatus }).in("id", [...selected]);
    if (error) { toast.error("Error al actualizar: " + error.message); }
    else { toast.success(`${selected.size} deal${selected.size !== 1 ? "s" : ""} actualizado${selected.size !== 1 ? "s" : ""}`); setSelected(new Set()); fetchDeals(); }
    setBulkWorking(false);
  };

  const handleBulkStage = async (stageId: string) => {
    setBulkWorking(true);
    const { error } = await supabase.from("deals").update({ stage_id: stageId }).in("id", [...selected]);
    if (error) { toast.error("Error al cambiar etapa: " + error.message); }
    else { toast.success(`Etapa actualizada en ${selected.size} deal${selected.size !== 1 ? "s" : ""}`); setSelected(new Set()); fetchDeals(); }
    setBulkWorking(false);
  };

  return (
    <AppLayout>
      <AppHeader title="Deals" subtitle={`${deals.length} oportunidades`} actions={
        <Button size="sm" className="gap-1.5" onClick={() => navigate(path("/pipeline"))}><Plus className="h-4 w-4" /> Nuevo deal</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar deals..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <div className="flex rounded-lg border overflow-hidden">
            {([
              { key: "all", label: "Todos" },
              { key: "open", label: "Abiertos" },
              { key: "won", label: "Ganados" },
              { key: "lost", label: "Perdidos" },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                  statusFilter === f.key
                    ? f.key === "won" ? "bg-primary text-primary-foreground"
                    : f.key === "lost" ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}>
                {f.label}
                <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 font-bold",
                  statusFilter === f.key ? "bg-background/20" : "bg-muted"
                )}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {someChecked && (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {/* Change stage */}
              <Select onValueChange={handleBulkStage} disabled={bulkWorking}>
                <SelectTrigger className="h-8 text-xs w-48 gap-1">
                  <KanbanSquare className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue placeholder="Cambiar etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Change status */}
              <Select onValueChange={handleBulkStatus} disabled={bulkWorking}>
                <SelectTrigger className="h-8 text-xs w-44 gap-1">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue placeholder="Cambiar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Abierto</SelectItem>
                  <SelectItem value="won">Ganado</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" onClick={handleBulkDelete} disabled={bulkWorking}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 w-10">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Deal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contacto</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Etapa</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => {
                  const isSelected = selected.has(deal.id);
                  return (
                    <tr key={deal.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(deal.id)}
                          aria-label={`Seleccionar ${deal.title}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>{deal.title}</td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>{deal.contacts?.full_name || '-'}</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>
                        {deal.pipeline_stages ? (
                          <Badge variant="outline" className="text-xs" style={{ borderColor: deal.pipeline_stages.color, color: deal.pipeline_stages.color }}>
                            {deal.pipeline_stages.name}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>
                        <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                          {deal.status === 'won' ? 'Ganado' : deal.status === 'lost' ? 'Perdido' : 'Abierto'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>${Number(deal.value).toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs cursor-pointer" onClick={() => navigate(path(`/leads/${deal.id}`))}>{deal.expected_close_date || '-'}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-0 py-0">
                    <EmptyState
                      variant="deals"
                      title={search ? "Sin resultados" : "Aún no tienes deals"}
                      description={
                        search
                          ? "Prueba con otro término de búsqueda."
                          : "Los leads son las oportunidades de venta que se mueven por tu pipeline. Créalos desde el pipeline o desde el detalle de un contacto."
                      }
                    />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.size} deal{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkWorking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkWorking} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Settings2, Loader2, MoreVertical, Pencil, Trash2, GripVertical, Trophy, XCircle } from "lucide-react";
import { closeDeal } from "@/lib/deal-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  order: number;
  color: string;
  probability: number;
}

interface DealRow {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  expected_close_date: string | null;
  contact_name?: string;
}

const stageColorOptions = [
  { value: "#3b82f6", label: "Azul" },
  { value: "#8b5cf6", label: "Púrpura" },
  { value: "#eab308", label: "Amarillo" },
  { value: "#f97316", label: "Naranja" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Celeste" },
  { value: "#22c55e", label: "Verde" },
  { value: "#ef4444", label: "Rojo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#a855f7", label: "Violeta" },
];

export default function PipelinePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageCol, setDragOverStageCol] = useState<string | null>(null);

  // Pipeline info
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  // Stage dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState(stageColorOptions[0].value);
  const [stageProbability, setStageProbability] = useState("50");
  const [savingStage, setSavingStage] = useState(false);

  // Manage mode
  const [manageMode, setManageMode] = useState(false);

  // Deal creation dialog
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealStageId, setDealStageId] = useState<string | null>(null);
  const [dealTitle, setDealTitle] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealCurrency, setDealCurrency] = useState("USD");
  const [dealContactId, setDealContactId] = useState("");
  const [dealCloseDate, setDealCloseDate] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Get or create pipeline
    let { data: pipelines } = await supabase.from("pipelines").select("id").limit(1);
    let pid: string;
    if (!pipelines || pipelines.length === 0) {
      const { data: newPipeline } = await supabase.from("pipelines").insert({ name: "Pipeline principal" }).select("id").single();
      pid = newPipeline!.id;
    } else {
      pid = pipelines[0].id;
    }
    setPipelineId(pid);

    // Get stages
    const { data: stagesData } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pid)
      .order("order", { ascending: true });
    setStages(stagesData || []);

    // Get deals with contact name
    const { data: dealsData } = await supabase
      .from("deals")
      .select("id, title, value, currency, status, stage_id, contact_id, expected_close_date, contacts(full_name)")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    const mapped = (dealsData || []).map((d: any) => ({
      ...d,
      contact_name: d.contacts?.full_name || null,
      contacts: undefined,
    }));
    setDeals(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    supabase.from("contacts").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setContacts(data);
    });

    // Refetch when tab/window regains focus
    const handleFocus = () => fetchData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchData]);

  // Deal creation
  const openCreateDeal = (stageId: string) => {
    setDealStageId(stageId);
    setDealTitle("");
    setDealValue("");
    setDealCurrency("USD");
    setDealContactId("");
    setDealCloseDate("");
    setDealDialogOpen(true);
  };

  const handleCreateDeal = async () => {
    if (!dealTitle.trim() || !pipelineId || !dealStageId) {
      toast.error("El título es requerido");
      return;
    }
    setSavingDeal(true);
    const { error } = await supabase.from("deals").insert({
      title: dealTitle.trim(),
      value: Number(dealValue) || 0,
      currency: dealCurrency,
      stage_id: dealStageId,
      pipeline_id: pipelineId,
      contact_id: dealContactId && dealContactId !== "none" ? dealContactId : null,
      expected_close_date: dealCloseDate || null,
      owner_id: session?.user?.id || null,
      status: "open",
    });
    setSavingDeal(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Deal creado");
    setDealDialogOpen(false);
    fetchData();
  };

  // Drag & drop
  const handleDrop = async (stageId: string) => {
    if (!draggedDeal) return;
    setDragOverStage(null);
    setDeals(prev => prev.map(d => d.id === draggedDeal ? { ...d, stage_id: stageId } : d));
    setDraggedDeal(null);
    await supabase.from("deals").update({ stage_id: stageId }).eq("id", draggedDeal);
  };

  const getStageValue = (stageId: string) =>
    deals.filter(d => d.stage_id === stageId).reduce((sum, d) => sum + Number(d.value), 0);

  // Stage CRUD
  const openAddStage = () => {
    setEditingStage(null);
    setStageName("");
    setStageColor(stageColorOptions[0].value);
    setStageProbability("50");
    setStageDialogOpen(true);
  };

  const openEditStage = (stage: Stage) => {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageColor(stage.color);
    setStageProbability(String(stage.probability));
    setStageDialogOpen(true);
  };

  const handleSaveStage = async () => {
    if (!stageName.trim() || !pipelineId) return;
    setSavingStage(true);

    if (editingStage) {
      const { error } = await supabase.from("pipeline_stages").update({
        name: stageName.trim(),
        color: stageColor,
        probability: Number(stageProbability) || 0,
      }).eq("id", editingStage.id);
      if (error) toast.error("Error: " + error.message);
      else toast.success("Etapa actualizada");
    } else {
      const newOrder = stages.length > 0 ? Math.max(...stages.map(s => s.order)) + 1 : 1;
      const { error } = await supabase.from("pipeline_stages").insert({
        pipeline_id: pipelineId,
        name: stageName.trim(),
        color: stageColor,
        probability: Number(stageProbability) || 0,
        order: newOrder,
      });
      if (error) toast.error("Error: " + error.message);
      else toast.success("Etapa creada");
    }

    setSavingStage(false);
    setStageDialogOpen(false);
    fetchData();
  };

  const handleDeleteStage = async (stageId: string) => {
    const stageDeals = deals.filter(d => d.stage_id === stageId);
    if (stageDeals.length > 0) {
      toast.error("No puedes eliminar una etapa con deals. Mueve los deals primero.");
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) toast.error("Error: " + error.message);
    else { toast.success("Etapa eliminada"); fetchData(); }
  };

  const handleMoveStage = async (stageId: string, direction: "up" | "down") => {
    const idx = stages.findIndex(s => s.id === stageId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;

    const current = stages[idx];
    const swap = stages[swapIdx];

    await Promise.all([
      supabase.from("pipeline_stages").update({ order: swap.order }).eq("id", current.id),
      supabase.from("pipeline_stages").update({ order: current.order }).eq("id", swap.id),
    ]);
    fetchData();
  };

  const handleStageDrop = async (targetStageId: string) => {
    if (!draggedStageId || draggedStageId === targetStageId) {
      setDraggedStageId(null);
      setDragOverStageCol(null);
      return;
    }
    const fromIdx = stages.findIndex(s => s.id === draggedStageId);
    const toIdx = stages.findIndex(s => s.id === targetStageId);
    if (fromIdx < 0 || toIdx < 0) return;

    // Reorder locally first for instant feedback
    const reordered = [...stages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setStages(reordered);
    setDraggedStageId(null);
    setDragOverStageCol(null);

    // Persist new order
    await Promise.all(
      reordered.map((s, i) =>
        supabase.from("pipeline_stages").update({ order: i + 1 }).eq("id", s.id)
      )
    );
    fetchData();
  };

  return (
    <AppLayout>
      <AppHeader
        title="Pipeline"
        subtitle="Vista Kanban de oportunidades"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={manageMode ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setManageMode(!manageMode)}
            >
              <Settings2 className="h-4 w-4" />
              {manageMode ? "Listo" : "Personalizar"}
            </Button>
            {manageMode && (
              <Button size="sm" className="gap-1.5" onClick={openAddStage}>
                <Plus className="h-4 w-4" /> Nueva etapa
              </Button>
            )}
          </div>
        }
      />
      <main className="flex-1 overflow-x-auto p-6 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-muted-foreground">No hay etapas en el pipeline.</p>
            <Button onClick={openAddStage} className="gap-1.5">
              <Plus className="h-4 w-4" /> Crear primera etapa
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 min-w-max h-full">
            {stages.map((stage, idx) => {
              const stageDeals = deals.filter(d => d.stage_id === stage.id);
              return (
                <div
                  key={stage.id}
                  draggable={manageMode}
                  onDragStart={(e) => {
                    if (!manageMode) return;
                    setDraggedStageId(stage.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => { setDraggedStageId(null); setDragOverStageCol(null); }}
                  className={cn(
                    "flex w-72 flex-col rounded-lg bg-muted/50 transition-all",
                    !manageMode && dragOverStage === stage.id && "ring-2 ring-primary/40 bg-primary/5",
                    manageMode && dragOverStageCol === stage.id && draggedStageId !== stage.id && "ring-2 ring-primary/40",
                    manageMode && draggedStageId === stage.id && "opacity-50 scale-95",
                    manageMode && "cursor-grab active:cursor-grabbing"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedStageId && manageMode) {
                      setDragOverStageCol(stage.id);
                    } else if (draggedDeal) {
                      setDragOverStage(stage.id);
                    }
                  }}
                  onDragLeave={() => { setDragOverStage(null); setDragOverStageCol(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedStageId && manageMode) {
                      handleStageDrop(stage.id);
                    } else if (draggedDeal) {
                      handleDrop(stage.id);
                    }
                  }}
                >
                  {/* Stage header */}
                  <div className="flex items-center justify-between px-3 py-3 border-b">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold text-foreground truncate">{stage.name}</span>
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground shrink-0">
                        {stageDeals.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        ${(getStageValue(stage.id) / 1000).toFixed(0)}K
                      </span>
                      {!manageMode && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openCreateDeal(stage.id); }}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {manageMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditStage(stage)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                            {idx > 0 && (
                              <DropdownMenuItem onClick={() => handleMoveStage(stage.id, "up")}>
                                <GripVertical className="h-3.5 w-3.5 mr-2" /> Mover izquierda
                              </DropdownMenuItem>
                            )}
                            {idx < stages.length - 1 && (
                              <DropdownMenuItem onClick={() => handleMoveStage(stage.id, "down")}>
                                <GripVertical className="h-3.5 w-3.5 mr-2" /> Mover derecha
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteStage(stage.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 p-2 overflow-y-auto scrollbar-thin">
                    {stageDeals.map((deal) => (
                      <div
                        key={deal.id}
                        draggable={!manageMode}
                        onDragStart={() => setDraggedDeal(deal.id)}
                        onClick={() => !manageMode && navigate(`/deals/${deal.id}`)}
                        className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow"
                      >
                        <p className="text-sm font-medium text-foreground mb-1">{deal.title}</p>
                        <p className="text-xs text-muted-foreground mb-2">{deal.contact_name || "Sin contacto"}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">${Number(deal.value).toLocaleString()}</span>
                          <Badge variant="outline" className="text-xs">{deal.currency}</Badge>
                        </div>
                        {deal.expected_close_date && (
                          <p className="text-xs text-muted-foreground mt-1.5">Cierre: {deal.expected_close_date}</p>
                        )}
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">Sin deals</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add stage column (manage mode) */}
            {manageMode && (
              <button
                onClick={openAddStage}
                className="flex w-72 flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-colors gap-2 py-12"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Agregar etapa</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/* Stage Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingStage ? "Editar etapa" : "Nueva etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={stageName} onChange={e => setStageName(e.target.value)} placeholder="Ej: Propuesta enviada" />
            </div>
            <div className="space-y-2">
              <Label>Probabilidad (%)</Label>
              <Input type="number" min={0} max={100} value={stageProbability} onChange={e => setStageProbability(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {stageColorOptions.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setStageColor(c.value)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all",
                      stageColor === c.value ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveStage} disabled={savingStage || !stageName.trim()}>
              {savingStage && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingStage ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Deal Creation Dialog */}
      <Dialog open={dealDialogOpen} onOpenChange={setDealDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={dealTitle} onChange={e => setDealTitle(e.target.value)} placeholder="Ej: Venta de servicio premium" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" min={0} value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={dealCurrency} onValueChange={setDealCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Contacto</Label>
                <Select value={dealContactId} onValueChange={setDealContactId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin contacto</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha cierre</Label>
                <Input type="date" value={dealCloseDate} onChange={e => setDealCloseDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDealDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateDeal} disabled={savingDeal || !dealTitle.trim()}>
              {savingDeal && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crear deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

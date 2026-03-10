import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Settings2, Loader2, MoreVertical, Pencil, Trash2, GripVertical, Trophy, XCircle, ChevronDown, FolderPlus } from "lucide-react";
import { closeDeal } from "@/lib/deal-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Pipeline {
  id: string;
  name: string;
}

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
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageCol, setDragOverStageCol] = useState<string | null>(null);

  // Stage dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState(stageColorOptions[0].value);
  const [stageProbability, setStageProbability] = useState("50");
  const [savingStage, setSavingStage] = useState(false);

  // Manage mode
  const [manageMode, setManageMode] = useState(false);

  // Pipeline dialog (create/rename)
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [pipelineName, setPipelineName] = useState("");
  const [savingPipeline, setSavingPipeline] = useState(false);

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

  const fetchPipelines = useCallback(async () => {
    const { data } = await supabase.from("pipelines").select("id, name").order("created_at", { ascending: true });
    const list = data || [];
    setPipelines(list);
    return list;
  }, []);

  const fetchStagesAndDeals = useCallback(async (pid: string) => {
    const [{ data: stagesData }, { data: dealsData }] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("order", { ascending: true }),
      supabase.from("deals").select("id, title, value, currency, status, stage_id, contact_id, expected_close_date, contacts(full_name)").eq("pipeline_id", pid).eq("status", "open").order("created_at", { ascending: false }),
    ]);
    setStages(stagesData || []);
    const mapped = (dealsData || []).map((d: any) => ({
      ...d,
      contact_name: d.contacts?.full_name || null,
      contacts: undefined,
    }));
    setDeals(mapped);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const list = await fetchPipelines();

    let pid = selectedPipelineId;
    if (!pid || !list.find(p => p.id === pid)) {
      if (list.length === 0) {
        const { data: newPipeline } = await supabase.from("pipelines").insert({ name: "Pipeline principal" }).select("id, name").single();
        if (newPipeline) {
          setPipelines([newPipeline]);
          pid = newPipeline.id;
        }
      } else {
        pid = list[0].id;
      }
    }
    setSelectedPipelineId(pid);
    if (pid) await fetchStagesAndDeals(pid);
    setLoading(false);
  }, [selectedPipelineId, fetchPipelines, fetchStagesAndDeals]);

  useEffect(() => {
    fetchData();
    supabase.from("contacts").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setContacts(data);
    });
    const handleFocus = () => fetchData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchData]);

  const switchPipeline = async (pid: string) => {
    setSelectedPipelineId(pid);
    setLoading(true);
    await fetchStagesAndDeals(pid);
    setLoading(false);
  };

  // Pipeline CRUD
  const openCreatePipeline = () => {
    setEditingPipeline(null);
    setPipelineName("");
    setPipelineDialogOpen(true);
  };

  const openRenamePipeline = (p: Pipeline) => {
    setEditingPipeline(p);
    setPipelineName(p.name);
    setPipelineDialogOpen(true);
  };

  const handleSavePipeline = async () => {
    if (!pipelineName.trim()) return;
    setSavingPipeline(true);
    if (editingPipeline) {
      const { error } = await supabase.from("pipelines").update({ name: pipelineName.trim() }).eq("id", editingPipeline.id);
      if (error) toast.error("Error: " + error.message);
      else { toast.success("Pipeline renombrado"); setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? { ...p, name: pipelineName.trim() } : p)); }
    } else {
      const { data, error } = await supabase.from("pipelines").insert({ name: pipelineName.trim() }).select("id, name").single();
      if (error) toast.error("Error: " + error.message);
      else if (data) {
        toast.success("Pipeline creado");
        setPipelines(prev => [...prev, data]);
        setSelectedPipelineId(data.id);
        setStages([]);
        setDeals([]);
      }
    }
    setSavingPipeline(false);
    setPipelineDialogOpen(false);
  };

  const handleDeletePipeline = async (pid: string) => {
    if (pipelines.length <= 1) { toast.error("Debes tener al menos un pipeline"); return; }
    // Check if pipeline has deals
    const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("pipeline_id", pid);
    if (count && count > 0) { toast.error("No puedes eliminar un pipeline con deals. Mueve o elimina los deals primero."); return; }
    // Delete stages first
    await supabase.from("pipeline_stages").delete().eq("pipeline_id", pid);
    const { error } = await supabase.from("pipelines").delete().eq("id", pid);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Pipeline eliminado");
    const remaining = pipelines.filter(p => p.id !== pid);
    setPipelines(remaining);
    if (selectedPipelineId === pid && remaining.length > 0) {
      switchPipeline(remaining[0].id);
    }
  };

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
    if (!dealTitle.trim() || !selectedPipelineId || !dealStageId) {
      toast.error("El título es requerido");
      return;
    }
    setSavingDeal(true);
    const { error } = await supabase.from("deals").insert({
      title: dealTitle.trim(),
      value: Number(dealValue) || 0,
      currency: dealCurrency,
      stage_id: dealStageId,
      pipeline_id: selectedPipelineId,
      contact_id: dealContactId && dealContactId !== "none" ? dealContactId : null,
      expected_close_date: dealCloseDate || null,
      owner_id: session?.user?.id || null,
      status: "open",
    });
    setSavingDeal(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Deal creado");
    setDealDialogOpen(false);
    if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId);
  };

  // Drag & drop deals
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
    if (!stageName.trim() || !selectedPipelineId) return;
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
        pipeline_id: selectedPipelineId,
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
    fetchStagesAndDeals(selectedPipelineId!);
  };

  const handleDeleteStage = async (stageId: string) => {
    const stageDeals = deals.filter(d => d.stage_id === stageId);
    if (stageDeals.length > 0) {
      toast.error("No puedes eliminar una etapa con deals. Mueve los deals primero.");
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) toast.error("Error: " + error.message);
    else { toast.success("Etapa eliminada"); if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId); }
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
    if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId);
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

    const reordered = [...stages];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setStages(reordered);
    setDraggedStageId(null);
    setDragOverStageCol(null);

    await Promise.all(
      reordered.map((s, i) =>
        supabase.from("pipeline_stages").update({ order: i + 1 }).eq("id", s.id)
      )
    );
    if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId);
  };

  const currentPipeline = pipelines.find(p => p.id === selectedPipelineId);

  return (
    <AppLayout>
      <AppHeader
        title="Pipeline"
        subtitle="Vista Kanban de oportunidades"
        actions={
          <div className="flex items-center gap-2">
            {/* Pipeline selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 max-w-[200px]">
                  <span className="truncate">{currentPipeline?.name || "Pipeline"}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {pipelines.map(p => (
                  <DropdownMenuItem
                    key={p.id}
                    className={cn("flex items-center justify-between", p.id === selectedPipelineId && "bg-accent")}
                    onClick={() => switchPipeline(p.id)}
                  >
                    <span className="truncate">{p.name}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); openRenamePipeline(p); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {pipelines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeletePipeline(p.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openCreatePipeline}>
                  <FolderPlus className="h-4 w-4 mr-2" /> Nuevo pipeline
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
            <p className="text-muted-foreground">No hay etapas en este pipeline.</p>
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
                        className="group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-foreground flex-1 mr-1">{deal.title}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => navigate(`/deals/${deal.id}`)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Ver / Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  await closeDeal(deal.id, "won", deal.contact_id || null, session?.user?.id);
                                  toast.success("Deal marcado como ganado 🎉");
                                  if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId);
                                } catch (err: any) { toast.error(err.message); }
                              }}>
                                <Trophy className="h-3.5 w-3.5 mr-2 text-green-500" /> Marcar ganado
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  await closeDeal(deal.id, "lost", deal.contact_id || null, session?.user?.id);
                                  toast.success("Deal marcado como perdido");
                                  if (selectedPipelineId) fetchStagesAndDeals(selectedPipelineId);
                                } catch (err: any) { toast.error(err.message); }
                              }}>
                                <XCircle className="h-3.5 w-3.5 mr-2 text-destructive" /> Marcar perdido
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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

      {/* Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingPipeline ? "Renombrar pipeline" : "Nuevo pipeline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={pipelineName} onChange={e => setPipelineName(e.target.value)} placeholder="Ej: Pipeline de ventas B2B" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePipeline} disabled={savingPipeline || !pipelineName.trim()}>
              {savingPipeline && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingPipeline ? "Guardar" : "Crear"}
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

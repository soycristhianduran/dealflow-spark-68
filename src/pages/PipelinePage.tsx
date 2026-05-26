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
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Plus, Settings2, Loader2, MoreVertical, Pencil, Trash2, GripVertical, Trophy, XCircle, ChevronDown, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

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

interface ContactRow {
  id: string;
  full_name: string;
  primary_phone: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  budget: number | null;
  budget_currency: string | null;
  expected_close_date: string | null;
  lead_status: string;
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
  const { path } = useWorkspace();
  const { session } = useAuth();
  const { organizationId } = useOrganizationContext();
  const { isVendor, myUserId } = usePermissions();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedContact, setDraggedContact] = useState<string | null>(null);
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

  // Lead creation dialog (creates a contact with stage + pipeline)
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadStageId, setLeadStageId] = useState<string | null>(null);
  const [leadFullName, setLeadFullName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadBudget, setLeadBudget] = useState("");
  const [leadCurrency, setLeadCurrency] = useState("USD");
  const [leadCloseDate, setLeadCloseDate] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  const fetchPipelines = useCallback(async () => {
    const { data } = await supabase.from("pipelines").select("id, name").order("created_at", { ascending: true });
    const list = data || [];
    setPipelines(list);
    return list;
  }, []);

  const fetchStagesAndContacts = useCallback(async (pid: string) => {
    let contactsQuery = supabase.from("contacts")
      .select("id, full_name, primary_phone, stage_id, pipeline_id, budget, budget_currency, expected_close_date, lead_status")
      .eq("pipeline_id", pid)
      .order("created_at", { ascending: false });

    // Vendors only see their own leads
    if (isVendor && myUserId) {
      contactsQuery = contactsQuery.eq("owner_id", myUserId);
    }

    const [{ data: stagesData }, { data: contactsData }] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("order", { ascending: true }),
      contactsQuery,
    ]);
    setStages(stagesData || []);
    setContacts(contactsData || []);
  }, [isVendor, myUserId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const list = await fetchPipelines();

    let pid = selectedPipelineId;
    if (!pid || !list.find(p => p.id === pid)) {
      if (list.length === 0) {
        const { data: newPipeline } = await supabase.from("pipelines").insert({ name: "Pipeline principal", ...(organizationId ? { organization_id: organizationId } : {}) }).select("id, name").single();
        if (newPipeline) {
          setPipelines([newPipeline]);
          pid = newPipeline.id;
        }
      } else {
        pid = list[0].id;
      }
    }
    setSelectedPipelineId(pid);
    if (pid) await fetchStagesAndContacts(pid);
    setLoading(false);
  }, [selectedPipelineId, fetchPipelines, fetchStagesAndContacts]);

  useEffect(() => {
    fetchData();
    const handleFocus = () => fetchData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchData]);

  // Realtime: refresh on contact inserts/updates/deletes for the active pipeline
  useEffect(() => {
    if (!selectedPipelineId) return;
    const channel = supabase
      .channel(`pipeline-contacts-${selectedPipelineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `pipeline_id=eq.${selectedPipelineId}` },
        () => fetchStagesAndContacts(selectedPipelineId),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedPipelineId, fetchStagesAndContacts]);

  const switchPipeline = async (pid: string) => {
    setSelectedPipelineId(pid);
    setLoading(true);
    await fetchStagesAndContacts(pid);
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
      const { data, error } = await supabase.from("pipelines").insert({ name: pipelineName.trim(), ...(organizationId ? { organization_id: organizationId } : {}) }).select("id, name").single();
      if (error) toast.error("Error: " + error.message);
      else if (data) {
        toast.success("Pipeline creado");
        setPipelines(prev => [...prev, data]);
        setSelectedPipelineId(data.id);
        setStages([]);
        setContacts([]);
      }
    }
    setSavingPipeline(false);
    setPipelineDialogOpen(false);
  };

  const handleDeletePipeline = async (pid: string) => {
    if (pipelines.length <= 1) { toast.error("Debes tener al menos un pipeline"); return; }
    const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("pipeline_id", pid);
    if (count && count > 0) { toast.error("No puedes eliminar un pipeline con leads. Mueve o elimina los leads primero."); return; }
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

  // Lead creation
  const openCreateLead = (stageId: string) => {
    setLeadStageId(stageId);
    setLeadFullName("");
    setLeadPhone("");
    setLeadBudget("");
    setLeadCurrency("USD");
    setLeadCloseDate("");
    setLeadDialogOpen(true);
  };

  const handleCreateLead = async () => {
    if (!leadFullName.trim() || !selectedPipelineId || !leadStageId) {
      toast.error("El nombre es requerido");
      return;
    }
    setSavingLead(true);
    const nameParts = leadFullName.trim().split(" ");
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";
    const { error } = await supabase.from("contacts").insert({
      full_name: leadFullName.trim(),
      first_name,
      last_name: last_name || null,
      primary_phone: leadPhone.trim() || null,
      budget: Number(leadBudget) || null,
      budget_currency: leadCurrency,
      stage_id: leadStageId,
      pipeline_id: selectedPipelineId,
      expected_close_date: leadCloseDate || null,
      owner_id: session?.user?.id || null,
      lead_status: "active",
      ...(organizationId ? { organization_id: organizationId } : {}),
    });
    setSavingLead(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Lead creado");
    setLeadDialogOpen(false);
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
  };

  // Derive lead_status from stage name (supports common Spanish/English naming patterns)
  const inferLeadStatus = (stageName: string): "won" | "lost" | "active" => {
    const n = stageName.toLowerCase();
    if (n.includes("ganado") || n.includes("won") || n.includes("cerrado ganado") || n.includes("closed won")) return "won";
    if (n.includes("perdido") || n.includes("lost") || n.includes("cerrado perdido") || n.includes("closed lost")) return "lost";
    return "active";
  };

  // Drag & drop contacts between stages
  const handleDrop = async (stageId: string) => {
    if (!draggedContact) return;
    setDragOverStage(null);
    const contactId = draggedContact;
    setDraggedContact(null);
    const stage = stages.find(s => s.id === stageId);
    const newLeadStatus = stage ? inferLeadStatus(stage.name) : "active";
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: stageId } : c));
    await supabase.from("contacts").update({ stage_id: stageId, lead_status: newLeadStatus }).eq("id", contactId);
    supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: contactId } }).catch(() => {});
    // Fire automation trigger: contact_stage_changed
    supabase.functions.invoke("automation-runner", {
      body: {
        action: "trigger_event",
        trigger_type: "contact_stage_changed",
        contact_id: contactId,
        trigger_data: { stage_id: stageId, stage_name: stage?.name ?? "", pipeline_id: selectedPipelineId },
      },
    }).catch(() => {});
  };

  const getStageValue = (stageId: string) =>
    contacts.filter(c => c.stage_id === stageId).reduce((sum, c) => sum + Number(c.budget || 0), 0);

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
    fetchStagesAndContacts(selectedPipelineId!);
  };

  const handleDeleteStage = async (stageId: string) => {
    const stageContacts = contacts.filter(c => c.stage_id === stageId);
    if (stageContacts.length > 0) {
      toast.error("No puedes eliminar una etapa con leads. Mueve los leads primero.");
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) toast.error("Error: " + error.message);
    else { toast.success("Etapa eliminada"); if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId); }
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
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
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
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
  };

  const closeContact = async (contactId: string, status: "won" | "lost") => {
    if (status === "won") {
      const c = contacts.find(x => x.id === contactId);
      if (!c || !c.budget || Number(c.budget) <= 0) {
        toast.error("El lead debe tener un presupuesto asignado (> 0) para marcarse como ganado");
        return;
      }
    }
    await supabase.from("contacts").update({ lead_status: status }).eq("id", contactId);
    await supabase.from("activities").insert({
      related_entity_id: contactId,
      related_entity_type: "contact",
      event_type: status === "won" ? "deal_won" : "deal_lost",
      summary: status === "won" ? "Lead marcado como ganado 🎉" : "Lead marcado como perdido",
      created_by: session?.user?.id || null,
    });
    toast.success(status === "won" ? "Lead marcado como ganado 🎉" : "Lead marcado como perdido");
    supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: contactId } }).catch(() => {});
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
  };

  const currentPipeline = pipelines.find(p => p.id === selectedPipelineId);

  return (
    <AppLayout>
      <AppHeader
        title="Pipeline"
        subtitle="Vista Kanban de leads"
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
              const stageContacts = contacts.filter(c => c.stage_id === stage.id);
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
                    } else if (draggedContact) {
                      setDragOverStage(stage.id);
                    }
                  }}
                  onDragLeave={() => { setDragOverStage(null); setDragOverStageCol(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedStageId && manageMode) {
                      handleStageDrop(stage.id);
                    } else if (draggedContact) {
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
                        {stageContacts.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        ${(getStageValue(stage.id) / 1000).toFixed(0)}K
                      </span>
                      {!manageMode && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openCreateLead(stage.id); }}>
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
                    {stageContacts.map((contact) => (
                      <div
                        key={contact.id}
                        draggable={!manageMode}
                        onDragStart={() => setDraggedContact(contact.id)}
                        onClick={() => !manageMode && navigate(path(`/contacts/${contact.id}`))}
                        className="group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-foreground flex-1 mr-1">{contact.full_name}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Ver / Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => closeContact(contact.id, "won")}>
                                <Trophy className="h-3.5 w-3.5 mr-2 text-green-500" /> Marcar ganado
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => closeContact(contact.id, "lost")}>
                                <XCircle className="h-3.5 w-3.5 mr-2 text-destructive" /> Marcar perdido
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {contact.primary_phone && (
                          <p className="text-xs text-muted-foreground mb-1">{contact.primary_phone}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {contact.budget ? (
                            <span className="text-sm font-semibold text-foreground">${Number(contact.budget).toLocaleString()}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin presupuesto</span>
                          )}
                          {contact.budget_currency && contact.budget && (
                            <Badge variant="outline" className="text-xs">{contact.budget_currency}</Badge>
                          )}
                        </div>
                        {contact.expected_close_date && (
                          <p className="text-xs text-muted-foreground mt-1.5">Cierre: {contact.expected_close_date}</p>
                        )}
                      </div>
                    ))}
                    {stageContacts.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">Sin leads</p>
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

      {/* New Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input value={leadFullName} onChange={e => setLeadFullName(e.target.value)} placeholder="Ej: Juan Pérez" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="+52 55 1234 5678" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Presupuesto</Label>
                <Input type="number" min={0} value={leadBudget} onChange={e => setLeadBudget(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={leadCurrency} onValueChange={setLeadCurrency}>
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
            <div className="space-y-2">
              <Label>Fecha de cierre estimada</Label>
              <Input type="date" value={leadCloseDate} onChange={e => setLeadCloseDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateLead} disabled={savingLead || !leadFullName.trim()}>
              {savingLead && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crear lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Plus, Settings2, Loader2, MoreVertical, Pencil, Trash2, GripVertical, Trophy, XCircle, ChevronDown, FolderPlus, UserPlus, Filter, X, List, KanbanSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { usePermissions } from "@/hooks/usePermissions";
import { WonBudgetDialog, LostReasonDialog } from "@/components/crm/CloseLeadDialogs";
import { useTranslation } from "react-i18next";

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
  is_no_show?: boolean;
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
  owner_id: string | null;
  source: string | null;
  tags: string[] | null;
  created_at: string;
}

/** Checkbox multi-select dropdown used by the board filter bar. */
function MultiFilter({ label, active, allLabel, options, selected, onToggle, onClear }: {
  label: string;
  active: boolean;
  allLabel: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? "secondary" : "outline"} size="sm" className="h-8 gap-1.5 text-xs font-normal max-w-[200px]">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onCheckedChange={() => onClear()}
          onSelect={e => e.preventDefault()}
        >
          {allLabel}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map(o => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            onSelect={e => e.preventDefault()}
          >
            <span className="truncate">{o.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const stageColorOptions = [
  { value: "#3b82f6", labelKey: "blue" },
  { value: "#8b5cf6", labelKey: "purple" },
  { value: "#eab308", labelKey: "yellow" },
  { value: "#f97316", labelKey: "orange" },
  { value: "#14b8a6", labelKey: "teal" },
  { value: "#06b6d4", labelKey: "lightBlue" },
  { value: "#22c55e", labelKey: "green" },
  { value: "#ef4444", labelKey: "red" },
  { value: "#ec4899", labelKey: "pink" },
  { value: "#a855f7", labelKey: "violet" },
];

export default function PipelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { session } = useAuth();
  const { organizationId, defaultCurrency } = useOrganizationContext();
  const { isVendor, isSetter, myUserId, canEditContacts, isOwnerOrAdmin, leadView } = usePermissions();
  // Alcance "solo los míos" para el tablero (respeta overrides + default de org).
  const ownScope = leadView === "own";
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("pipeline"),
  );
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  // One-shot guard: auto-creating the default pipeline may only happen once
  // per mount — a dependency loop was inserting it repeatedly (blinking).
  const autoCreatingRef = useRef(false);
  const [draggedContact, setDraggedContact] = useState<string | null>(null);
  // Cards RENDERED per column (data/filters/sums still use the full set).
  // Rendering 10k+ DOM cards froze the board after large migrations.
  const CARDS_PER_COLUMN = 50;
  const [visibleByStage, setVisibleByStage] = useState<Record<string, number>>({});
  // Two-phase load: a light server snapshot (top 50/column + exact per-stage
  // count/sum aggregates) paints the board instantly; the full contact set
  // streams in the background for filters/search/drag beyond the top cards.
  const [stageAggs, setStageAggs] = useState<Record<string, { n: number; total: number }>>({});
  const [fullLoaded, setFullLoaded] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [dragOverStageCol, setDragOverStageCol] = useState<string | null>(null);

  // Stage dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState(stageColorOptions[0].value);
  const [stageProbability, setStageProbability] = useState("50");
  const [stageIsNoShow, setStageIsNoShow] = useState(false);
  const [savingStage, setSavingStage] = useState(false);

  // Manage mode
  const [manageMode, setManageMode] = useState(false);

  // Board filters (client-side; the board already loads all leads of the pipeline).
  // Initialized from URL params so filters survive the Lista ⇄ Embudo switch.
  const [searchParams] = useSearchParams();
  // Multi-select filters (empty array = no filter). URL uses comma-separated values.
  const initList = (k: string) =>
    (searchParams.get(k) || "").split(",").map(s => s.trim()).filter(v => v && v !== "all");
  const [showFilters, setShowFilters] = useState(() =>
    ["owner", "source", "tag", "from", "to"].some(k => searchParams.get(k)));
  const [ownerFilter, setOwnerFilter] = useState<string[]>(() => initList("owner"));
  const [sourceFilter, setSourceFilter] = useState<string[]>(() => initList("source"));
  const [tagFilter, setTagFilter] = useState<string[]>(() => initList("tag"));
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("from") || "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("to") || "");
  const [members, setMembers] = useState<{ user_id: string; full_name: string }[]>([]);

  // Switch to the list view carrying the active filters in the URL.
  // The list's filters are single-select, so only pass a value when exactly
  // one is chosen here (otherwise the list would silently narrow the set).
  const goToListView = () => {
    const qs = new URLSearchParams({ flt: "1" });
    if (ownerFilter.length === 1) qs.set("owner", ownerFilter[0]);
    if (sourceFilter.length === 1) qs.set("source", sourceFilter[0]);
    if (tagFilter.length === 1) qs.set("tag", tagFilter[0]);
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    if (selectedPipelineId) qs.set("pipeline", selectedPipelineId);
    navigate(path(`/contacts?${qs.toString()}`));
  };

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

  // Budget required dialog (shown when dragging to a "won" stage without budget)
  const [wonBudgetDialogOpen, setWonBudgetDialogOpen] = useState(false);
  const [pendingWonDrop, setPendingWonDrop] = useState<{ contactId: string; stageId: string; stageName: string } | null>(null);
  const [wonBudgetAmount, setWonBudgetAmount] = useState("");
  const [deletePipelineTarget, setDeletePipelineTarget] = useState<string | null>(null);
  const [deleteStageTarget, setDeleteStageTarget] = useState<string | null>(null);
  const [wonBudgetCurrency, setWonBudgetCurrency] = useState("USD");
  const [wonBudgetSaving, setWonBudgetSaving] = useState(false);

  // Lost reason dialog (shown when dragging to a "lost" stage)
  const [lostReasonDialogOpen, setLostReasonDialogOpen] = useState(false);
  const [pendingLostDrop, setPendingLostDrop] = useState<{ contactId: string; stageId: string; stageName: string } | null>(null);
  const [lostReasonSelected, setLostReasonSelected] = useState("");
  const [lostReasonCustom, setLostReasonCustom] = useState("");
  const [lostReasonSaving, setLostReasonSaving] = useState(false);
  const [leadCloseDate, setLeadCloseDate] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  // Default editable middle stages seeded for brand-new MANUAL pipelines.
  // (The DB trigger already creates the fixed Nuevo contacto / Ganado / Perdido.)
  const seedDefaultStages = useCallback(async (pipelineId: string) => {
    const defaults = [
      { name: "Contactado",       color: "#60a5fa", probability: 20, order: 1 },
      { name: "Calificado",       color: "#818cf8", probability: 45, order: 2 },
      { name: "Propuesta enviada", color: "#f59e0b", probability: 70, order: 3 },
    ].map(s => ({ ...s, pipeline_id: pipelineId, ...(organizationId ? { organization_id: organizationId } : {}) }));
    await supabase.from("pipeline_stages").insert(defaults);
  }, [organizationId]);

  const fetchPipelines = useCallback(async () => {
    if (!organizationId) return [];
    const { data } = await supabase.from("pipelines").select("id, name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    const list = data || [];
    setPipelines(list);
    return list;
  }, [organizationId]);

  const fetchStagesAndContacts = useCallback(async (pid: string) => {
    // Paginate past Supabase's 1,000-row default cap so the board shows ALL
    // leads — pages fetched in PARALLEL (post-migration boards hold 10k+
    // contacts; serial paging made the kanban take many seconds to appear).
    const fetchAllContacts = async (): Promise<any[]> => {
      const PAGE = 1000;
      const baseQuery = () => {
        let q = supabase.from("contacts")
          .select("id, full_name, primary_phone, stage_id, pipeline_id, budget, budget_currency, expected_close_date, lead_status, owner_id, source, tags, created_at")
          .eq("pipeline_id", pid)
          .order("created_at", { ascending: false });
        if (ownScope && myUserId) {
          if (isSetter) q = q.or(`owner_id.eq.${myUserId},setter_id.eq.${myUserId}`);
          else q = q.eq("owner_id", myUserId);
        } else if (leadView === "none") q = q.eq("owner_id", "00000000-0000-0000-0000-000000000000");
        return q;
      };
      let countQ = supabase.from("contacts").select("id", { count: "exact", head: true }).eq("pipeline_id", pid);
      if (ownScope && myUserId) {
        if (isSetter) countQ = countQ.or(`owner_id.eq.${myUserId},setter_id.eq.${myUserId}`);
        else countQ = countQ.eq("owner_id", myUserId);
      } else if (leadView === "none") countQ = countQ.eq("owner_id", "00000000-0000-0000-0000-000000000000");
      const { count } = await countQ;
      const total = count ?? 0;
      if (!total) return [];
      const pages = Math.ceil(total / PAGE);
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) => baseQuery().range(i * PAGE, i * PAGE + PAGE - 1)),
      );
      return results.flatMap(r => r.data ?? []);
    };

    // Phase 1 — instant paint: stages + light snapshot (top 50 per column and
    // exact per-stage count/sum computed in the DB).
    const [{ data: stagesData }, { data: snap }] = await Promise.all([
      supabase.from("pipeline_stages").select("*").eq("pipeline_id", pid).order("order", { ascending: true }),
      supabase.rpc("pipeline_board_snapshot", {
        p_pipeline: pid,
        p_limit: CARDS_PER_COLUMN,
        p_owner: ownScope && !isSetter && myUserId ? myUserId : null,
        p_setter: ownScope && isSetter && myUserId ? myUserId : null,
      }),
    ]);
    setStages(stagesData || []);
    if (snap?.top) {
      const aggs: Record<string, { n: number; total: number }> = {};
      for (const a of snap.aggregates ?? []) aggs[a.stage_id] = { n: Number(a.n), total: Number(a.total_budget) };
      setStageAggs(aggs);
      setFullLoaded(false);
      setContacts(snap.top);
    }

    // Phase 2 — stream the full set in the background (filters/search/drag
    // beyond the top cards). Replaces the snapshot when it lands.
    fetchAllContacts().then((all) => {
      setContacts(all);
      setFullLoaded(true);
    }).catch(() => { /* snapshot keeps the board usable */ });
  }, [isVendor, isSetter, myUserId, ownScope, leadView]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const list = await fetchPipelines();

    let pid = selectedPipelineId;
    if (!pid || !list.find(p => p.id === pid)) {
      if (list.length === 0) {
        // Auto-create the default pipeline exactly once — guarded so a
        // re-render (or a stale read-after-insert) can't loop inserting it.
        if (!autoCreatingRef.current && organizationId) {
          autoCreatingRef.current = true;
          const { data: newPipeline } = await supabase.from("pipelines")
            .insert({ name: "Pipeline principal", organization_id: organizationId })
            .select("id, name").single();
          if (newPipeline) {
            await seedDefaultStages(newPipeline.id);
            setPipelines([newPipeline]);
            pid = newPipeline.id;
          }
        }
      } else {
        pid = list[0].id;
      }
    }
    if (pid && pid !== selectedPipelineId) setSelectedPipelineId(pid);
    if (pid) await fetchStagesAndContacts(pid);
    setLoading(false);
  }, [selectedPipelineId, organizationId, fetchPipelines, fetchStagesAndContacts, seedDefaultStages]);

  // Team members for the owner filter (owner/admin only — vendors/setters
  // already see just their own leads).
  useEffect(() => {
    if (!isOwnerOrAdmin) return;
    supabase.functions.invoke("org-invitations", { body: { action: "list_members", organization_id: organizationId } })
      .then(({ data }) => {
        if (data?.members) {
          setMembers((data.members as { user_id: string; full_name?: string; email?: string }[]).map(m => ({
            user_id: m.user_id,
            full_name: m.full_name || m.email || m.user_id,
          })));
        }
      })
      .catch(() => {});
  }, [isOwnerOrAdmin]);

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
      if (error) toast.error(t("pipelinePage.errorPrefix") + error.message);
      else { toast.success(t("pipelinePage.pipelineRenamed")); setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? { ...p, name: pipelineName.trim() } : p)); }
    } else {
      const { data, error } = await supabase.from("pipelines").insert({ name: pipelineName.trim(), ...(organizationId ? { organization_id: organizationId } : {}) }).select("id, name").single();
      if (error) toast.error(t("pipelinePage.errorPrefix") + error.message);
      else if (data) {
        toast.success(t("pipelinePage.pipelineCreated"));
        setPipelines(prev => [...prev, data]);
        setSelectedPipelineId(data.id);
        setContacts([]);
        // DB auto-creates Nuevo contacto / Ganado / Perdido; seed 3 editable middle stages.
        await seedDefaultStages(data.id);
        fetchStagesAndContacts(data.id);
      }
    }
    setSavingPipeline(false);
    setPipelineDialogOpen(false);
  };

  const handleDeletePipeline = async (pid: string) => {
    if (pipelines.length <= 1) { toast.error(t("pipelinePage.atLeastOnePipeline")); return; }
    const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("pipeline_id", pid);
    if (count && count > 0) { toast.error(t("pipelinePage.cannotDeletePipelineWithLeads")); return; }
    await supabase.from("pipeline_stages").delete().eq("pipeline_id", pid);
    const { error } = await supabase.from("pipelines").delete().eq("id", pid);
    if (error) { toast.error(t("pipelinePage.errorPrefix") + error.message); return; }
    toast.success(t("pipelinePage.pipelineDeleted"));
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
    setLeadCurrency(defaultCurrency);
    setLeadCloseDate("");
    setLeadDialogOpen(true);
  };

  // Closing-stage guards for DIRECT CREATION in a won/lost column: won requires
  // a budget, lost requires a reason (same rule as drag & drop — no back doors).
  const [createLostReasonOpen, setCreateLostReasonOpen] = useState(false);
  const [pendingCreateReason, setPendingCreateReason] = useState<string | null>(null);

  const handleCreateLead = async (lostReasonArg?: string) => {
    if (!leadFullName.trim() || !selectedPipelineId || !leadStageId) {
      toast.error(t("pipelinePage.nameRequired"));
      return;
    }
    const targetStage = stages.find(s => s.id === leadStageId) as any;
    const targetStatus = targetStage
      ? (targetStage.is_won ? "won" : targetStage.is_lost ? "lost" : inferLeadStatus(targetStage.name))
      : "active";
    if (targetStatus === "won" && !(Number(leadBudget) > 0)) {
      toast.error(t("pipelinePage.wonNeedsBudget"));
      return;
    }
    const lostReason = lostReasonArg ?? pendingCreateReason;
    if (targetStatus === "lost" && !lostReason) {
      setCreateLostReasonOpen(true);
      return; // resumes via the dialog's onConfirm
    }
    setSavingLead(true);
    const nameParts = leadFullName.trim().split(" ");
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";
    const { data: newLead, error } = await supabase.from("contacts").insert({
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
      lead_status: targetStatus,
      ...(targetStatus === "lost" && lostReason ? { lost_reason: lostReason } : {}),
      ...(organizationId ? { organization_id: organizationId } : {}),
    }).select("id").single();
    setSavingLead(false);
    if (error) {
      if (error.message?.includes("contact_limit_reached")) {
        toast.error(
          (error as any).details ||
          t("pipelinePage.contactLimitReached"),
          { duration: 6000 }
        );
      } else {
        toast.error(t("pipelinePage.errorPrefix") + error.message);
      }
      return;
    }

    // Fire contact_created automation trigger (fire-and-forget)
    if (newLead?.id) {
      supabase.functions.invoke("automation-runner", {
        body: { action: "trigger_event", trigger_type: "contact_created", contact_id: newLead.id, trigger_data: { origin: "manual" } },
      }).catch(() => {});
    }

    toast.success(t("pipelinePage.leadCreated"));
    setPendingCreateReason(null);
    setLeadDialogOpen(false);
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
  };

  const LOST_REASONS = [
    "Precio muy alto",
    "Eligió a la competencia",
    "Sin presupuesto disponible",
    "No era el momento indicado",
    "Sin respuesta (ghosting)",
    "No era el cliente ideal",
    "Otra razón…",
  ];

  // Derive lead_status from stage name (supports common Spanish/English naming patterns)
  const inferLeadStatus = (stageName: string): "won" | "lost" | "active" => {
    const n = stageName.toLowerCase();
    if (n.includes("ganado") || n.includes("won") || n.includes("cerrado ganado") || n.includes("closed won")) return "won";
    if (n.includes("perdido") || n.includes("lost") || n.includes("cerrado perdido") || n.includes("closed lost")) return "lost";
    return "active";
  };

  // Complete a drop (shared by handleDrop and confirmWonDrop)
  const completeDrop = async (contactId: string, stageId: string, newLeadStatus: "won" | "lost" | "active", budgetOverride?: { amount: number; currency: string; productId?: string | null }) => {
    const stage = stages.find(s => s.id === stageId);
    const update: Record<string, any> = { stage_id: stageId, lead_status: newLeadStatus };
    if (budgetOverride) {
      update.budget = budgetOverride.amount;
      update.budget_currency = budgetOverride.currency;
      if (budgetOverride.productId !== undefined) update.won_product_id = budgetOverride.productId;
    }
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage_id: stageId, lead_status: newLeadStatus, ...(budgetOverride ? { budget: budgetOverride.amount, budget_currency: budgetOverride.currency } : {}) } : c));
    await supabase.from("contacts").update(update).eq("id", contactId);
    supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: contactId } }).catch(() => {});
    supabase.functions.invoke("automation-runner", {
      body: {
        action: "trigger_event",
        trigger_type: "contact_stage_changed",
        contact_id: contactId,
        trigger_data: { stage_id: stageId, stage_name: stage?.name ?? "", pipeline_id: selectedPipelineId },
      },
    }).catch(() => {});
  };

  // Drag & drop contacts between stages
  const handleDrop = async (stageId: string) => {
    if (!draggedContact) return;
    setDragOverStage(null);
    const contactId = draggedContact;
    setDraggedContact(null);
    const stage = stages.find(s => s.id === stageId);
    const newLeadStatus = stage
      ? ((stage as any).is_won ? "won" : (stage as any).is_lost ? "lost" : inferLeadStatus(stage.name))
      : "active";

    // Moving to a won stage ALWAYS confirms/updates the closing budget —
    // prefilled with the current estimate so one Enter confirms it.
    if (newLeadStatus === "won") {
      const contact = contacts.find(c => c.id === contactId);
      setPendingWonDrop({ contactId, stageId, stageName: stage?.name ?? "" });
      setWonBudgetAmount(contact?.budget && Number(contact.budget) > 0 ? String(contact.budget) : "");
      setWonBudgetCurrency(contact?.budget_currency || defaultCurrency);
      setWonBudgetDialogOpen(true);
      return; // pause — completes after the user confirms the amount
    }

    // If moving to a lost stage, require a reason
    if (newLeadStatus === "lost") {
      setPendingLostDrop({ contactId, stageId, stageName: stage?.name ?? "" });
      setLostReasonSelected("");
      setLostReasonCustom("");
      setLostReasonDialogOpen(true);
      return; // pause — will complete after user selects reason
    }

    await completeDrop(contactId, stageId, newLeadStatus);
  };

  // Confirm lost drop with reason
  const confirmLostDrop = async () => {
    if (!pendingLostDrop) return;
    const reason = lostReasonSelected === "Otra razón…" ? lostReasonCustom.trim() : lostReasonSelected;
    if (!reason) { toast.error(t("pipelinePage.selectOrWriteReason")); return; }
    setLostReasonSaving(true);
    const stage = stages.find(s => s.id === pendingLostDrop.stageId);
    const update: Record<string, any> = { stage_id: pendingLostDrop.stageId, lead_status: "lost", lost_reason: reason };
    setContacts(prev => prev.map(c => c.id === pendingLostDrop.contactId ? { ...c, stage_id: pendingLostDrop.stageId, lead_status: "lost" } : c));
    await supabase.from("contacts").update(update).eq("id", pendingLostDrop.contactId);
    supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: pendingLostDrop.contactId } }).catch(() => {});
    supabase.functions.invoke("automation-runner", {
      body: { action: "trigger_event", trigger_type: "contact_stage_changed", contact_id: pendingLostDrop.contactId,
        trigger_data: { stage_id: pendingLostDrop.stageId, stage_name: stage?.name ?? "", pipeline_id: selectedPipelineId } },
    }).catch(() => {});
    toast.success(t("pipelinePage.leadMarkedLost"));
    setLostReasonSaving(false);
    setLostReasonDialogOpen(false);
    setPendingLostDrop(null);
  };

  // Confirm won drop with budget + optional product (via the shared dialog)
  const confirmWonDrop = async (amount: number, currency: string, productId: string | null) => {
    if (!pendingWonDrop) return;
    await completeDrop(pendingWonDrop.contactId, pendingWonDrop.stageId, "won", { amount, currency, productId });
    toast.success(t("pipelinePage.leadClosedWon"));
    setWonBudgetDialogOpen(false);
    setPendingWonDrop(null);
  };

  // Apply board filters (client-side). Drag&drop and dialogs keep using the
  // raw `contacts` list so a filtered-out lead can still be mutated safely.
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (ownerFilter.length && !ownerFilter.includes(c.owner_id || "")) return false;
      if (sourceFilter.length && !sourceFilter.includes(c.source || "")) return false;
      if (tagFilter.length && !(c.tags || []).some(tg => tagFilter.includes(tg))) return false;
      if (dateFrom && c.created_at < dateFrom) return false;
      if (dateTo && c.created_at > `${dateTo}T23:59:59`) return false;
      return true;
    });
  }, [contacts, ownerFilter, sourceFilter, tagFilter, dateFrom, dateTo]);

  const activeFilterCount =
    ownerFilter.length + sourceFilter.length + tagFilter.length +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const clearFilters = () => {
    setOwnerFilter([]); setSourceFilter([]); setTagFilter([]);
    setDateFrom(""); setDateTo("");
  };

  const toggleIn = (setter: (fn: (prev: string[]) => string[]) => void, value: string) =>
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);

  // Distinct sources/tags present in this pipeline's leads
  const sourceOptions = useMemo(
    () => [...new Set(contacts.map(c => c.source).filter(Boolean))].sort() as string[],
    [contacts],
  );
  const tagOptions = useMemo(
    () => [...new Set(contacts.flatMap(c => c.tags || []))].sort(),
    [contacts],
  );

  // Until the full set streams in (and no client filters are active), the
  // exact count/sum come from the server snapshot aggregates.
  const useAggs = !fullLoaded && activeFilterCount === 0;
  const getStageValue = (stageId: string) =>
    useAggs && stageAggs[stageId]
      ? stageAggs[stageId].total
      : filteredContacts.filter(c => c.stage_id === stageId).reduce((sum, c) => sum + Number(c.budget || 0), 0);
  const getStageCount = (stageId: string, loadedCount: number) =>
    useAggs && stageAggs[stageId] ? stageAggs[stageId].n : loadedCount;

  // Stage CRUD
  const openAddStage = () => {
    setEditingStage(null);
    setStageName("");
    setStageColor(stageColorOptions[0].value);
    setStageProbability("50");
    setStageIsNoShow(false);
    setStageDialogOpen(true);
  };

  const openEditStage = (stage: Stage) => {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageColor(stage.color);
    setStageProbability(String(stage.probability));
    setStageIsNoShow(!!stage.is_no_show);
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
        is_no_show: stageIsNoShow,
      }).eq("id", editingStage.id);
      if (error) toast.error(t("pipelinePage.errorPrefix") + error.message);
      else toast.success(t("pipelinePage.stageUpdated"));
    } else {
      // Insert new stages BEFORE the system won/lost stages (which sit at order 9998/9999).
      const nonSystem = stages.filter(s => !(s as any).is_system);
      const newOrder = nonSystem.length > 0 ? Math.max(...nonSystem.map(s => s.order)) + 1 : 1;
      const { error } = await supabase.from("pipeline_stages").insert({
        pipeline_id: selectedPipelineId,
        name: stageName.trim(),
        color: stageColor,
        probability: Number(stageProbability) || 0,
        order: newOrder,
        is_no_show: stageIsNoShow,
      });
      if (error) toast.error(t("pipelinePage.errorPrefix") + error.message);
      else toast.success(t("pipelinePage.stageCreated"));
    }

    setSavingStage(false);
    setStageDialogOpen(false);
    fetchStagesAndContacts(selectedPipelineId!);
  };

  const handleDeleteStage = async (stageId: string) => {
    const target = stages.find(s => s.id === stageId);
    if (target && (target as any).is_system) {
      toast.error(t("pipelinePage.cannotDeleteClosingStages"));
      return;
    }
    const stageContacts = contacts.filter(c => c.stage_id === stageId);
    if (stageContacts.length > 0) {
      toast.error(t("pipelinePage.cannotDeleteStageWithLeads"));
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) toast.error(t("pipelinePage.errorPrefix") + error.message);
    else { toast.success(t("pipelinePage.stageDeleted")); if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId); }
  };

  const handleMoveStage = async (stageId: string, direction: "up" | "down") => {
    const idx = stages.findIndex(s => s.id === stageId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    const current = stages[idx];
    const swap = stages[swapIdx];
    // System stages (Ganado/Perdido) stay pinned at the end — don't reorder them.
    if ((current as any).is_system || (swap as any).is_system) return;
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
    const dragged = stages.find(s => s.id === draggedStageId);
    const target = stages.find(s => s.id === targetStageId);
    // System stages (Ganado/Perdido) are pinned last — they can't be dragged or displaced.
    if ((dragged as any)?.is_system || (target as any)?.is_system) {
      setDraggedStageId(null); setDragOverStageCol(null); return;
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
    // Persist order only for non-system stages; keep system ones at 9998/9999.
    await Promise.all(
      reordered.filter(s => !(s as any).is_system).map((s, i) =>
        supabase.from("pipeline_stages").update({ order: i + 1 }).eq("id", s.id)
      )
    );
    if (selectedPipelineId) fetchStagesAndContacts(selectedPipelineId);
  };

  // Reasignar un lead a otro miembro del equipo directo desde el pipeline.
  const reassignContact = async (contactId: string, ownerId: string) => {
    if (!organizationId) return;
    const prevOwner = contacts.find(c => c.id === contactId)?.owner_id ?? null;
    // Optimista: refleja el cambio de inmediato.
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, owner_id: ownerId } : c));
    const { error } = await supabase.from("contacts")
      .update({ owner_id: ownerId })
      .eq("id", contactId).eq("organization_id", organizationId);
    if (error) {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, owner_id: prevOwner } : c));
      toast.error("No se pudo reasignar: " + error.message);
      return;
    }
    const name = members.find(m => m.user_id === ownerId)?.full_name || "el usuario";
    toast.success(`Lead reasignado a ${name}`);
  };

  const closeContact = async (contactId: string, status: "won" | "lost") => {
    // Same rule as drag & drop: won always confirms/updates the budget,
    // lost always captures a reason — route through the shared dialogs.
    const wonStage = stages.find(st => (st as any).is_won);
    const lostStage = stages.find(st => (st as any).is_lost);
    if (status === "won") {
      const c = contacts.find(x => x.id === contactId);
      setPendingWonDrop({ contactId, stageId: wonStage?.id ?? c?.stage_id ?? "", stageName: wonStage?.name ?? "Ganado" });
      setWonBudgetAmount(c?.budget ? String(c.budget) : "");
      setWonBudgetCurrency(c?.budget_currency || defaultCurrency);
      setWonBudgetDialogOpen(true);
      return;
    }
    if (status === "lost") {
      const c = contacts.find(x => x.id === contactId);
      setPendingLostDrop({ contactId, stageId: lostStage?.id ?? c?.stage_id ?? "", stageName: lostStage?.name ?? "Perdido" });
      setLostReasonSelected("");
      setLostReasonCustom("");
      setLostReasonDialogOpen(true);
      return;
    }
  };

  const currentPipeline = pipelines.find(p => p.id === selectedPipelineId);

  return (
    <AppLayout>
      <AppHeader
        title={t("pipelinePage.title")}
        subtitle={t("pipelinePage.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {/* Lista ⇄ Embudo view switch */}
            <div className="flex rounded-md border overflow-hidden">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-none text-muted-foreground" onClick={goToListView}>
                <List className="h-4 w-4" />
                <span className="hidden md:inline">{t("pipelinePage.viewList")}</span>
              </Button>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-none pointer-events-none">
                <KanbanSquare className="h-4 w-4" />
                <span className="hidden md:inline">{t("pipelinePage.viewBoard")}</span>
              </Button>
            </div>
            {/* Pipeline selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 max-w-[200px]">
                  <span className="truncate">{currentPipeline?.name || t("pipelinePage.title")}</span>
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
                          onClick={(e) => { e.stopPropagation(); setDeletePipelineTarget(p.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openCreatePipeline}>
                  <FolderPlus className="h-4 w-4 mr-2" /> {t("pipelinePage.newPipeline")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">{t("pipelinePage.filters")}</span>
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-background/20 text-[10px] font-bold px-1">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {canEditContacts && (
            <Button
              size="sm"
              variant={manageMode ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setManageMode(!manageMode)}
            >
              <Settings2 className="h-4 w-4" />
              {manageMode ? t("pipelinePage.done") : t("pipelinePage.customize")}
            </Button>
            )}
            {manageMode && (
              <Button size="sm" className="gap-1.5" onClick={openAddStage}>
                <Plus className="h-4 w-4" /> {t("pipelinePage.newStage")}
              </Button>
            )}
          </div>
        }
      />
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 px-2 sm:px-6 py-2 border-b bg-muted/30">
          {isOwnerOrAdmin && members.length > 0 && (
            <MultiFilter
              label={ownerFilter.length === 0
                ? t("pipelinePage.allOwners")
                : ownerFilter.length === 1
                  ? (members.find(m => m.user_id === ownerFilter[0])?.full_name || t("pipelinePage.filterOwner"))
                  : `${t("pipelinePage.filterOwner")} (${ownerFilter.length})`}
              active={ownerFilter.length > 0}
              allLabel={t("pipelinePage.allOwners")}
              options={members.map(m => ({ value: m.user_id, label: m.full_name }))}
              selected={ownerFilter}
              onToggle={v => toggleIn(setOwnerFilter, v)}
              onClear={() => setOwnerFilter([])}
            />
          )}
          {sourceOptions.length > 0 && (
            <MultiFilter
              label={sourceFilter.length === 0
                ? t("pipelinePage.allSources")
                : sourceFilter.length === 1 ? sourceFilter[0]
                : `${t("pipelinePage.filterSource")} (${sourceFilter.length})`}
              active={sourceFilter.length > 0}
              allLabel={t("pipelinePage.allSources")}
              options={sourceOptions.map(s => ({ value: s, label: s }))}
              selected={sourceFilter}
              onToggle={v => toggleIn(setSourceFilter, v)}
              onClear={() => setSourceFilter([])}
            />
          )}
          {tagOptions.length > 0 && (
            <MultiFilter
              label={tagFilter.length === 0
                ? t("pipelinePage.allTags")
                : tagFilter.length === 1 ? tagFilter[0]
                : `${t("pipelinePage.filterTag")} (${tagFilter.length})`}
              active={tagFilter.length > 0}
              allLabel={t("pipelinePage.allTags")}
              options={tagOptions.map(tag => ({ value: tag, label: tag }))}
              selected={tagFilter}
              onToggle={v => toggleIn(setTagFilter, v)}
              onClear={() => setTagFilter([])}
            />
          )}
          <div className="flex items-center gap-1.5">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[155px] min-w-[155px] text-xs px-2" />
            <span className="text-xs text-muted-foreground shrink-0">–</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-[155px] min-w-[155px] text-xs px-2" />
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> {t("pipelinePage.clearFilters")}
            </Button>
          )}
        </div>
      )}
      <main className="flex-1 overflow-x-auto p-2 sm:p-6 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-muted-foreground">{t("pipelinePage.noStages")}</p>
            <Button onClick={openAddStage} className="gap-1.5">
              <Plus className="h-4 w-4" /> {t("pipelinePage.createFirstStage")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 min-w-max h-full">
            {stages.map((stage, idx) => {
              const stageContacts = filteredContacts.filter(c => c.stage_id === stage.id);
              const sys = (stage as any).is_system;
              const isWon = (stage as any).is_won;
              const isLost = (stage as any).is_lost;
              const isFirst = (stage as any).is_first;
              return (
                <div
                  key={stage.id}
                  draggable={manageMode && !sys}
                  onDragStart={(e) => {
                    if (!manageMode || sys) return;
                    setDraggedStageId(stage.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => { setDraggedStageId(null); setDragOverStageCol(null); }}
                  className={cn(
                    "flex w-[260px] sm:w-72 flex-col rounded-lg bg-muted/50 transition-all",
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
                      {isFirst ? <UserPlus className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                        : isWon ? <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        : isLost ? <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        : <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />}
                      <span className="text-sm font-semibold text-foreground truncate">{stage.name}</span>
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground shrink-0">
                        {getStageCount(stage.id, stageContacts.length)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatMoney(getStageValue(stage.id), defaultCurrency, { compact: true })}
                      </span>
                      {!manageMode && canEditContacts && (
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
                              <Pencil className="h-3.5 w-3.5 mr-2" /> {t("pipelinePage.edit")}
                            </DropdownMenuItem>
                            {!sys && idx > 0 && !(stages[idx - 1] as any)?.is_system && (
                              <DropdownMenuItem onClick={() => handleMoveStage(stage.id, "up")}>
                                <GripVertical className="h-3.5 w-3.5 mr-2" /> {t("pipelinePage.moveLeft")}
                              </DropdownMenuItem>
                            )}
                            {!sys && idx < stages.length - 1 && !(stages[idx + 1] as any)?.is_system && (
                              <DropdownMenuItem onClick={() => handleMoveStage(stage.id, "down")}>
                                <GripVertical className="h-3.5 w-3.5 mr-2" /> {t("pipelinePage.moveRight")}
                              </DropdownMenuItem>
                            )}
                            {sys ? (
                              <DropdownMenuItem disabled className="text-muted-foreground">
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> {isFirst ? t("pipelinePage.initialStageFixed") : t("pipelinePage.closingStageFixed")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteStageTarget(stage.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> {t("pipelinePage.delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 p-2 overflow-y-auto scrollbar-thin">
                    {stageContacts.slice(0, visibleByStage[stage.id] ?? CARDS_PER_COLUMN).map((contact) => (
                      <div
                        key={contact.id}
                        draggable={!manageMode && canEditContacts}
                        onDragStart={() => canEditContacts && setDraggedContact(contact.id)}
                        onClick={() => !manageMode && navigate(path(`/contacts/${contact.id}`))}
                        className={cn("group rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow", canEditContacts ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium text-foreground flex-1 mr-1">{contact.full_name}</p>
                          {canEditContacts && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> {t("pipelinePage.viewEdit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => closeContact(contact.id, "won")}>
                                <Trophy className="h-3.5 w-3.5 mr-2 text-green-500" /> {t("pipelinePage.markWon")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => closeContact(contact.id, "lost")}>
                                <XCircle className="h-3.5 w-3.5 mr-2 text-destructive" /> {t("pipelinePage.markLost")}
                              </DropdownMenuItem>
                              {members.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <UserPlus className="h-3.5 w-3.5 mr-2" /> Reasignar a
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                                      {members.map(m => (
                                        <DropdownMenuItem
                                          key={m.user_id}
                                          disabled={m.user_id === contact.owner_id}
                                          onClick={() => reassignContact(contact.id, m.user_id)}
                                        >
                                          {m.full_name}{m.user_id === contact.owner_id ? " (actual)" : ""}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          )}
                        </div>
                        {contact.primary_phone && (
                          <p className="text-xs text-muted-foreground mb-1">{contact.primary_phone}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {contact.budget ? (
                            <span className="text-sm font-semibold text-foreground">{formatMoney(contact.budget, contact.budget_currency || defaultCurrency)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("pipelinePage.noBudget")}</span>
                          )}
                          {contact.budget_currency && contact.budget && (
                            <Badge variant="outline" className="text-xs">{contact.budget_currency}</Badge>
                          )}
                        </div>
                        {contact.expected_close_date && (
                          <p className="text-xs text-muted-foreground mt-1.5">{t("pipelinePage.closeLabel")} {contact.expected_close_date}</p>
                        )}
                      </div>
                    ))}
                    {stageContacts.length > (visibleByStage[stage.id] ?? CARDS_PER_COLUMN) && (
                      <button
                        onClick={() => setVisibleByStage(prev => ({
                          ...prev,
                          [stage.id]: (prev[stage.id] ?? CARDS_PER_COLUMN) + 100,
                        }))}
                        className="w-full rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                      >
                        Mostrar más ({(visibleByStage[stage.id] ?? CARDS_PER_COLUMN)} de {stageContacts.length})
                      </button>
                    )}
                    {stageContacts.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">{t("pipelinePage.noLeads")}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add stage column (manage mode) */}
            {manageMode && (
              <button
                onClick={openAddStage}
                className="flex w-[260px] sm:w-72 flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-colors gap-2 py-12"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("pipelinePage.addStage")}</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/* Stage Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingStage ? t("pipelinePage.editStage") : t("pipelinePage.newStage")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("pipelinePage.name")}</Label>
              <Input value={stageName} onChange={e => setStageName(e.target.value)} placeholder={t("pipelinePage.stageNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("pipelinePage.probability")}</Label>
              <Input type="number" min={0} max={100} value={stageProbability} onChange={e => setStageProbability(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("pipelinePage.color")}</Label>
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
                    title={t(`pipelinePage.color_${c.labelKey}`)}
                  />
                ))}
              </div>
            </div>
            {/* Designa esta etapa como "el cliente no asistió a su cita": al mover un
                lead aquí, su cita se marca automáticamente como No asistió. Funciona
                sin importar el nombre de la etapa. */}
            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
              <Checkbox checked={stageIsNoShow} onCheckedChange={(v) => setStageIsNoShow(!!v)} className="mt-0.5" />
              <span className="text-sm">
                Esta etapa = el cliente <span className="font-medium">no asistió</span> a su cita
                <span className="block text-xs text-muted-foreground">Al mover un lead aquí, su cita pasada se marca sola como “No asistió”.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>{t("pipelinePage.cancel")}</Button>
            <Button onClick={handleSaveStage} disabled={savingStage || !stageName.trim()}>
              {savingStage && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingStage ? t("pipelinePage.save") : t("pipelinePage.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingPipeline ? t("pipelinePage.renamePipeline") : t("pipelinePage.newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("pipelinePage.name")}</Label>
              <Input value={pipelineName} onChange={e => setPipelineName(e.target.value)} placeholder={t("pipelinePage.pipelineNamePlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineDialogOpen(false)}>{t("pipelinePage.cancel")}</Button>
            <Button onClick={handleSavePipeline} disabled={savingPipeline || !pipelineName.trim()}>
              {savingPipeline && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingPipeline ? t("pipelinePage.save") : t("pipelinePage.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pipelinePage.newLead")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("pipelinePage.fullName")}</Label>
              <Input value={leadFullName} onChange={e => setLeadFullName(e.target.value)} placeholder={t("pipelinePage.fullNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("pipelinePage.phone")}</Label>
              <Input value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="+52 55 1234 5678" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("pipelinePage.budget")}</Label>
                <Input type="number" min={0} value={leadBudget} onChange={e => setLeadBudget(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("pipelinePage.currency")}</Label>
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
              <Label>{t("pipelinePage.expectedCloseDate")}</Label>
              <Input type="date" value={leadCloseDate} onChange={e => setLeadCloseDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialogOpen(false)}>{t("pipelinePage.cancel")}</Button>
            <Button onClick={handleCreateLead} disabled={savingLead || !leadFullName.trim()}>
              {savingLead && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {t("pipelinePage.createLead")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lost reason dialog ── */}
      <Dialog open={lostReasonDialogOpen} onOpenChange={open => { if (!open && !lostReasonSaving) { setLostReasonDialogOpen(false); setPendingLostDrop(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> {t("pipelinePage.whyLostDeal")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("pipelinePage.lostReasonHelp")}
          </p>
          <div className="space-y-2">
            {LOST_REASONS.map(reason => (
              <button
                key={reason}
                type="button"
                onClick={() => { setLostReasonSelected(reason); if (reason !== "Otra razón…") setLostReasonCustom(""); }}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                  lostReasonSelected === reason
                    ? "border-destructive bg-destructive/10 text-destructive font-medium"
                    : "border-border hover:border-muted-foreground hover:bg-muted/50"
                }`}
              >
                {reason}
              </button>
            ))}
            {lostReasonSelected === "Otra razón…" && (
              <Input
                autoFocus
                placeholder={t("pipelinePage.describeReasonPlaceholder")}
                value={lostReasonCustom}
                onChange={e => setLostReasonCustom(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmLostDrop()}
                className="mt-1"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLostReasonDialogOpen(false); setPendingLostDrop(null); }} disabled={lostReasonSaving}>
              {t("pipelinePage.cancel")}
            </Button>
            <Button onClick={confirmLostDrop} disabled={lostReasonSaving || !lostReasonSelected || (lostReasonSelected === "Otra razón…" && !lostReasonCustom.trim())} variant="destructive" className="gap-1.5">
              {lostReasonSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("pipelinePage.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Budget + product confirmation on WON (shared dialog) ── */}
      <WonBudgetDialog
        open={wonBudgetDialogOpen}
        onOpenChange={open => { if (!open) { setWonBudgetDialogOpen(false); setPendingWonDrop(null); } }}
        contactName={contacts.find(c => c.id === pendingWonDrop?.contactId)?.full_name}
        initialAmount={wonBudgetAmount ? Number(wonBudgetAmount) : null}
        initialCurrency={wonBudgetCurrency}
        onConfirm={confirmWonDrop}
      />

      {/* Reason required when creating a lead DIRECTLY in the lost column */}
      <LostReasonDialog
        open={createLostReasonOpen}
        onOpenChange={setCreateLostReasonOpen}
        onConfirm={(reason) => { setPendingCreateReason(reason); return handleCreateLead(reason); }}
      />

      <AlertDialog open={!!deletePipelineTarget} onOpenChange={open => { if (!open) setDeletePipelineTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pipelinePage.deletePipelineTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pipelinePage.deletePipelineDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pipelinePage.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletePipelineTarget) handleDeletePipeline(deletePipelineTarget); setDeletePipelineTarget(null); }}
            >
              {t("pipelinePage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteStageTarget} onOpenChange={open => { if (!open) setDeleteStageTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pipelinePage.deleteStageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pipelinePage.deleteStageDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pipelinePage.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteStageTarget) handleDeleteStage(deleteStageTarget); setDeleteStageTarget(null); }}
            >
              {t("pipelinePage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

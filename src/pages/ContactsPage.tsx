import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Search, Trash2, Tag, UserCheck, CheckSquare, Pencil, Tags, X, Sparkles, User, KanbanSquare, MessageSquare, Mail, Loader2, LayoutTemplate, FileText, Eye, SlidersHorizontal, ChevronLeft, ChevronRight, PhoneCall, GitMerge, Columns2, BarChart2, Download, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useOrgTags, tagChipStyle } from "@/hooks/useOrgTags";
import { WhatsAppSendLoader } from "@/components/whatsapp/WhatsAppSendLoader";
import { TagPicker } from "@/components/TagPicker";
import { supabase } from "@/integrations/supabase/client";
import { CreateContactDialog } from "@/components/crm/CreateContactDialog";
import { ImportContactsDialog } from "@/components/crm/ImportContactsDialog";
import { TemplatePicker } from "@/components/whatsapp/TemplatePicker";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import type { ContactStatus } from "@/types/crm";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  qualified: { label: "Calificado", variant: "outline" },
  client: { label: "Cliente", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

const leadStatusFilters: { value: string; label: string; color?: string }[] = [
  { value: 'all',        label: 'Todos' },
  { value: 'active',     label: 'Activos',      color: 'text-blue-600' },
  { value: 'won',        label: 'Ganados',       color: 'text-green-600' },
  { value: 'lost',       label: 'Perdidos',      color: 'text-red-500' },
  { value: 'unassigned', label: 'Sin asignar',   color: 'text-muted-foreground' },
];


const FIELD_OPTIONS = [
  { value: "source", label: "Origen" },
  { value: "city", label: "Ciudad" },
  { value: "country", label: "País" },
  { value: "preferred_channel", label: "Canal preferido" },
  { value: "score", label: "Actividad CRM" },
];

const CHANNEL_OPTIONS = ["whatsapp", "email", "phone", "sms"];
const SOURCE_OPTIONS = ["Facebook Ads", "Google Ads", "WhatsApp", "Referral", "Landing Page", "Instagram", "Otro"];

const COLUMN_DEFS = [
  { key: "phone",       label: "Teléfono",  defaultWidth: 155, defaultVisible: true,  adminOnly: false },
  { key: "email",       label: "Email",     defaultWidth: 200, defaultVisible: false, adminOnly: false },
  { key: "company",     label: "Empresa",   defaultWidth: 160, defaultVisible: false, adminOnly: false },
  { key: "source",      label: "Origen",    defaultWidth: 150, defaultVisible: true,  adminOnly: false },
  { key: "stage",       label: "Etapa",     defaultWidth: 155, defaultVisible: true,  adminOnly: false },
  { key: "activity",    label: "Actividad", defaultWidth: 90,  defaultVisible: true,  adminOnly: false },
  { key: "lead_status", label: "Estado",    defaultWidth: 115, defaultVisible: false, adminOnly: false },
  { key: "vendor",      label: "Vendedor",  defaultWidth: 155, defaultVisible: true,  adminOnly: true  },
  { key: "tags",        label: "Tags",      defaultWidth: 155, defaultVisible: true,  adminOnly: false },
] as const;
type ColKey = typeof COLUMN_DEFS[number]["key"];

interface ContactRow {
  id: string;
  full_name: string;
  primary_phone: string | null;
  primary_email: string | null;
  status: string;
  score: number | null;
  owner_id: string | null;
  source: string | null;
  tags: string[] | null;
  created_at: string;
  stage_id: string | null;
  pipeline_id: string | null;
  lead_status: string | null;
  company_name?: string | null;
  pipeline_stages?: { id: string; name: string; color: string } | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  custom_fields?: Record<string, any> | null;
}

interface ProfileOption {
  user_id: string;
  full_name: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const SELECT_ALL_CAP = 10000; // safety cap for "select all across pages"

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // lead_status filter
  const [scoreFilter, setScoreFilter] = useState("all");   // hot / warm / cold / all
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [utmSourceFilter, setUtmSourceFilter] = useState("all");
  const [utmMediumFilter, setUtmMediumFilter] = useState("all");
  const [utmCampaignFilter, setUtmCampaignFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [customFieldKey, setCustomFieldKey] = useState("");
  const [customFieldValue, setCustomFieldValue] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Distinct values for UTM dropdowns
  const [utmSources, setUtmSources] = useState<string[]>([]);
  const [utmMediums, setUtmMediums] = useState<string[]>([]);
  const [utmCampaigns, setUtmCampaigns] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stagesForFilter, setStagesForFilter] = useState<{ id: string; name: string; color: string }[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalCount, setTotalCount] = useState(0);
  // True when the user chose "select all N across every page" (not just this page).
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Apply filters arriving from the CRM assistant (?ai=1&temperature=hot&...).
  useEffect(() => {
    if (searchParams.get("ai") !== "1") return;
    const temp = searchParams.get("temperature");
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const tag = searchParams.get("tag");
    const q = searchParams.get("search");
    const sinceDays = searchParams.get("since_days");
    if (temp) setScoreFilter(temp);
    if (status) setStatusFilter(status);
    if (source) setSourceFilter(source);
    if (tag) setTagFilter(tag);
    if (q) setSearch(q);
    if (sinceDays) {
      const d = new Date(Date.now() - Number(sinceDays) * 86400000);
      setDateFrom(d.toISOString().slice(0, 10));
    }
    setCurrentPage(0);
    // Clear the params so refreshes/manual changes aren't overridden. Depending on
    // searchParams (not []) makes this also fire when the assistant navigates here
    // while the page is ALREADY mounted (same /contacts route, new query).
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const { path } = useWorkspace();
  const { organizationId } = useOrganizationContext();
  const { tags: orgCatalogTags, colorOf } = useOrgTags();
  const { isOwnerOrAdmin, isVendor, myUserId } = usePermissions();

  // Bulk action dialog state
  const [reassignOpen, setReassignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Profiles — loaded on mount for owner filter + reassign
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [selectedOwner, setSelectedOwner] = useState("");

  // Task form
  const [taskForm, setTaskForm] = useState({ title: "", task_type: "call", priority: "medium", due_date: "", due_time: "" });

  // Field change form
  const [fieldName, setFieldName] = useState("");
  const [fieldValue, setFieldValue] = useState("");

  // Tags form
  const [tagInput, setTagInput] = useState("");
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [tagsMode, setTagsMode] = useState<"add" | "replace">("add");

  // Status dialog
  const [bulkStatus, setBulkStatus] = useState("");

  // AI bulk analysis
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [mergeWorking, setMergeWorking] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);

  // Column customization & resize
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key) as ColKey[])
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    { lead: 260, ...Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.defaultWidth])) }
  );
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Bulk WhatsApp template blast
  const [waBlastOpen, setWaBlastOpen] = useState(false);
  const [waBlastSending, setWaBlastSending] = useState(false);
  const [waBlastProgress, setWaBlastProgress] = useState<{ done: number; total: number; finished: boolean } | null>(null);
  const waPollRef = useRef<number | null>(null);
  const closeWaLoader = () => {
    if (waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; }
    setWaBlastProgress(null);
  };

  // Bulk email blast
  const [emailBlastOpen, setEmailBlastOpen] = useState(false);
  const [emailBlastSending, setEmailBlastSending] = useState(false);
  const [emailBlastProgress, setEmailBlastProgress] = useState<{ done: number; total: number } | null>(null);
  const [emailCampaignName, setEmailCampaignName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  // Email template picker
  const [emailMode, setEmailMode] = useState<"template" | "custom">("template");
  const [savedTemplates, setSavedTemplates] = useState<{ id: string; name: string; subject: string; html: string }[]>([]);
  const [loadingEmailTpls, setLoadingEmailTpls] = useState(false);
  const [selectedEmailTpl, setSelectedEmailTpl] = useState<{ id: string; name: string; subject: string; html: string } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // Sender config
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  // WhatsApp campaign name
  const [waCampaignName, setWaCampaignName] = useState("");

  // CSV export
  const [exportLoading, setExportLoading] = useState(false);

  // Voice campaign (Llamada IA)
  const [voiceCampaignOpen, setVoiceCampaignOpen] = useState(false);
  const [voiceCampaignName, setVoiceCampaignName] = useState("");
  const [voiceCampaignAgentId, setVoiceCampaignAgentId] = useState("");
  const [voiceCampaignLoading, setVoiceCampaignLoading] = useState(false);
  const [callingAgents, setCallingAgents] = useState<{ id: string; name: string }[]>([]);

  // Apply the active filters to any contacts query (shared by the paged fetch
  // and by "select all across pages" so both operate on the same result set).
  const applyFilters = useCallback((query: any) => {
    if (statusFilter === "unassigned") query = query.is("pipeline_id", null);
    else if (statusFilter !== "all") query = query.eq("lead_status", statusFilter);
    if (search) query = query.or(`full_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    if (pipelineFilter !== "all") query = query.eq("pipeline_id", pipelineFilter);
    if (stageFilter !== "all") query = query.eq("stage_id", stageFilter);
    if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
    if (utmSourceFilter !== "all") query = query.eq("utm_source", utmSourceFilter);
    if (utmMediumFilter !== "all") query = query.eq("utm_medium", utmMediumFilter);
    if (utmCampaignFilter !== "all") query = query.eq("utm_campaign", utmCampaignFilter);
    if (tagFilter) query = query.contains("tags", [tagFilter]);
    if (customFieldKey && customFieldValue) {
      query = query.contains("custom_fields", { [customFieldKey]: customFieldValue });
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");
    if (scoreFilter === "hot")  query = query.gte("score", 61);
    if (scoreFilter === "warm") query = query.gte("score", 31).lte("score", 60);
    if (scoreFilter === "cold") query = query.lte("score", 30);
    if (isVendor && myUserId) {
      query = query.eq("owner_id", myUserId);
    } else if (isOwnerOrAdmin && ownerFilter !== "all") {
      query = query.eq("owner_id", ownerFilter);
    }
    return query;
  }, [statusFilter, scoreFilter, search, ownerFilter, pipelineFilter, stageFilter, sourceFilter, utmSourceFilter, utmMediumFilter, utmCampaignFilter, tagFilter, customFieldKey, customFieldValue, dateFrom, dateTo, isVendor, isOwnerOrAdmin, myUserId]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const from = currentPage * pageSize;
    const to = from + pageSize - 1;
    let query = supabase.from("contacts")
      .select("id, full_name, primary_phone, primary_email, status, score, source, tags, created_at, stage_id, pipeline_id, lead_status, owner_id, company_name, pipeline_stages(id, name, color), utm_source, utm_medium, utm_campaign, utm_content, utm_term, custom_fields", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    query = applyFilters(query);
    const { data, error, count } = await query;
    if (!error && data) {
      setContacts(data as unknown as ContactRow[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [currentPage, pageSize, applyFilters]);

  // Select EVERY lead matching the current filters (across all pages), capped for
  // safety. Sets a flag so the UI can show "all N selected".
  const selectAllAcrossPages = useCallback(async () => {
    let query = supabase.from("contacts").select("id").order("created_at", { ascending: false }).limit(SELECT_ALL_CAP);
    query = applyFilters(query);
    const { data, error } = await query;
    if (!error && data) {
      setSelected(new Set((data as { id: string }[]).map(r => r.id)));
      setAllMatchingSelected(true);
    }
  }, [applyFilters]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => fetchContacts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchContacts]);

  useEffect(() => { setSelected(new Set()); setAllMatchingSelected(false); }, [statusFilter, search, ownerFilter]);
  // Changing page size resets to the first page so ranges stay consistent.
  useEffect(() => { setCurrentPage(0); }, [pageSize]);

  // Reset to page 0 whenever any filter changes
  useEffect(() => {
    setCurrentPage(0);
  }, [statusFilter, scoreFilter, search, ownerFilter, pipelineFilter, stageFilter, sourceFilter, utmSourceFilter, utmMediumFilter, utmCampaignFilter, tagFilter, customFieldKey, customFieldValue, dateFrom, dateTo]);

  // Column preferences — load from localStorage per user+org
  useEffect(() => {
    if (!myUserId || !organizationId) return;
    try {
      const savedVis = localStorage.getItem(`crm-cols-${myUserId}-${organizationId}`);
      if (savedVis) setVisibleCols(new Set(JSON.parse(savedVis) as ColKey[]));
      const savedW = localStorage.getItem(`crm-col-w-${myUserId}-${organizationId}`);
      if (savedW) setColWidths(prev => ({ ...prev, ...JSON.parse(savedW) }));
    } catch {}
  }, [myUserId, organizationId]);

  useEffect(() => {
    if (!myUserId || !organizationId) return;
    localStorage.setItem(`crm-cols-${myUserId}-${organizationId}`, JSON.stringify([...visibleCols]));
  }, [visibleCols, myUserId, organizationId]);

  useEffect(() => {
    if (!myUserId || !organizationId) return;
    localStorage.setItem(`crm-col-w-${myUserId}-${organizationId}`, JSON.stringify(colWidths));
  }, [colWidths, myUserId, organizationId]);

  // Fetch team members via edge function (bypasses RLS on profiles table).
  // Used for: owner filter dropdown, reassign dialog, Vendedor column display.
  useEffect(() => {
    supabase.functions.invoke("org-invitations", { body: { action: "list_members" } })
      .then(({ data }) => {
        if (data?.members) {
          const list = (data.members as { user_id: string; full_name?: string; email?: string }[]).map(m => ({
            user_id: m.user_id,
            full_name: m.full_name || m.email || m.user_id,
          }));
          setProfiles(list);
          setProfileMap(Object.fromEntries(list.map(p => [p.user_id, p.full_name])));
        }
      });
  }, []);

  // Load pipelines for the filter dropdown
  useEffect(() => {
    supabase.from("pipelines").select("id, name").order("created_at", { ascending: true })
      .then(({ data }) => setPipelines(data || []));
  }, []);

  // When pipeline filter changes, load its stages
  useEffect(() => {
    if (pipelineFilter === "all") {
      setStagesForFilter([]);
      setStageFilter("all");
      return;
    }
    supabase.from("pipeline_stages")
      .select("id, name, color")
      .eq("pipeline_id", pipelineFilter)
      .order("order", { ascending: true })
      .then(({ data }) => {
        setStagesForFilter(data || []);
        setStageFilter("all");
      });
  }, [pipelineFilter]);

  // Load distinct UTM values and tags for filter dropdowns
  useEffect(() => {
    if (!organizationId) return;
    supabase.from("contacts")
      .select("utm_source, utm_medium, utm_campaign, tags")
      .eq("organization_id", organizationId)
      .then(({ data }) => {
        if (!data) return;
        setUtmSources([...new Set(data.map(d => d.utm_source).filter(Boolean) as string[])].sort());
        setUtmMediums([...new Set(data.map(d => d.utm_medium).filter(Boolean) as string[])].sort());
        setUtmCampaigns([...new Set(data.map(d => d.utm_campaign).filter(Boolean) as string[])].sort());
        const tags = data.flatMap(d => d.tags || []);
        setAllTags([...new Set(tags)].sort());
      });
  }, [organizationId]);

  // Load calling agents (re-run when org is known)
  useEffect(() => {
    if (!organizationId) return;
    supabase.from("calling_agents")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCallingAgents((data || []) as { id: string; name: string; phone_number: string | null }[]));
  }, [organizationId]);

  // Load saved email templates + org sender when dialog opens
  useEffect(() => {
    if (!emailBlastOpen) return;
    setLoadingEmailTpls(true);
    supabase.from("email_templates")
      .select("id, name, subject, html")
      .not("html", "is", null)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setSavedTemplates((data || []) as { id: string; name: string; subject: string; html: string }[]);
        setLoadingEmailTpls(false);
      });
    // Pre-populate sender from org settings (only if user hasn't typed anything)
    supabase.functions.invoke("org-invitations", { body: { action: "get_email_sender" } })
      .then(({ data }) => {
        if (data?.email_from_name) setFromName(prev => prev || data.email_from_name);
        if (data?.email_from_email) setFromEmail(prev => prev || data.email_from_email);
      });
  }, [emailBlastOpen]);

  const visibleIds = contacts.map(c => c.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    setAllMatchingSelected(false);
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(visibleIds));
  };

  const toggleOne = (id: string) => {
    setAllMatchingSelected(false);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const done = (msg: string) => {
    toast.success(msg);
    setSelected(new Set());
    fetchContacts();
    setBulkWorking(false);
  };

  // ── Bulk handlers ──────────────────────────────────────────────────────

  const handleBulkDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").delete().in("id", [...selected]);
    if (error) { toast.error("Error al eliminar: " + error.message); setBulkWorking(false); return; }
    done(`${selected.size} lead${selected.size !== 1 ? "s" : ""} eliminado${selected.size !== 1 ? "s" : ""}`);
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").update({ lead_status: bulkStatus }).in("id", [...selected]);
    if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }
    setStatusOpen(false);
    done(`${selected.size} lead${selected.size !== 1 ? "s" : ""} actualizado${selected.size !== 1 ? "s" : ""}`);
  };

  const handleBulkReassign = async () => {
    if (!selectedOwner) return;
    setBulkWorking(true);
    const contactIds = [...selected];

    // 1. Update contact owner
    const { error } = await supabase.from("contacts").update({ owner_id: selectedOwner }).in("id", contactIds);
    if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }

    // 2. Migrate WhatsApp message history to new owner so they can see it
    await supabase.from("whatsapp_messages").update({ user_id: selectedOwner }).in("contact_id", contactIds);

    // 3. Migrate Instagram conversations + their messages
    const { data: igConvs } = await supabase
      .from("instagram_conversations")
      .select("id")
      .in("contact_id", contactIds);
    if (igConvs?.length) {
      const convIds = igConvs.map((c: any) => c.id);
      await supabase.from("instagram_conversations").update({ user_id: selectedOwner }).in("id", convIds);
      await supabase.from("instagram_messages").update({ user_id: selectedOwner }).in("conversation_id", convIds);
    }

    setReassignOpen(false);
    setSelectedOwner("");
    done(`${selected.size} lead${selected.size !== 1 ? "s" : ""} reasignado${selected.size !== 1 ? "s" : ""}`);
  };

  const handleBulkAddTask = async () => {
    if (!taskForm.title.trim()) { toast.error("El título es requerido"); return; }
    setBulkWorking(true);
    const rows = [...selected].map(contactId => ({
      title: taskForm.title.trim(),
      task_type: taskForm.task_type,
      priority: taskForm.priority,
      due_date: taskForm.due_date || null,
      due_time: taskForm.due_time || null,
      contact_id: contactId,
      status: "pending",
    }));
    const { error } = await supabase.from("tasks").insert(rows);
    if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }
    setTaskOpen(false);
    setTaskForm({ title: "", task_type: "call", priority: "medium", due_date: "", due_time: "" });
    done(`${rows.length} tarea${rows.length !== 1 ? "s" : ""} creada${rows.length !== 1 ? "s" : ""}`);
  };

  // Fetch the FULL set of selected contacts (across all pages), not just the page
  // currently loaded in memory — bulk sends were only hitting the visible page.
  const fetchSelectedContacts = async (): Promise<ContactRow[]> => {
    const ids = [...selected];
    if (ids.length === 0) return [];
    const loaded = contacts.filter(c => selected.has(c.id));
    if (loaded.length === ids.length) return loaded; // all already in memory
    const out: ContactRow[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from("contacts")
        .select("id, full_name, primary_phone, primary_email, company_name")
        .in("id", ids.slice(i, i + 500));
      if (data) out.push(...(data as unknown as ContactRow[]));
    }
    return out;
  };

  // ── Bulk WhatsApp template blast ──────────────────────────────────────────
  const handleWaBlast = async (templateName: string, language: string, vars: string[], mediaId: string, campaignName?: string, scheduledAt?: string) => {
    const campName = (campaignName || waCampaignName || "").trim();
    if (!campName) { toast.error("El nombre de la campaña es obligatorio"); return; }

    setWaBlastSending(true);
    setWaBlastProgress({ done: 0, total: 0 });
    try {
      const allSelected = await fetchSelectedContacts();
      const targets = allSelected.filter(c => c.primary_phone);
      if (targets.length === 0) { toast.error("Ningún lead seleccionado tiene número de teléfono"); setWaBlastSending(false); setWaBlastProgress(null); return; }

      const { data: { user: waAuthUser } } = await supabase.auth.getUser();
      const waUserId = waAuthUser?.id ?? myUserId;

      // Create the campaign with its config; the backend worker does the sending.
      const { data: campData, error: campErr } = await supabase.from("whatsapp_campaigns").insert({
        name: campName,
        template_name: templateName,
        language,
        variables: vars,                       // raw tokens; backend resolves per contact
        media_id: mediaId || null,
        status: scheduledAt ? "scheduled" : "sending",
        scheduled_at: scheduledAt || null,
        total_recipients: targets.length,
        user_id: waUserId,
        organization_id: organizationId ?? null,
      }).select("id").single();
      if (campErr || !campData) throw new Error(campErr?.message || "No se pudo crear la campaña");
      const campaignId = campData.id;

      // One 'pending' send row per recipient (chunked for large lists).
      const sendRows = targets.map(c => ({
        campaign_id: campaignId, contact_id: c.id,
        phone: c.primary_phone!.replace(/[^0-9]/g, ""), status: "pending",
        user_id: myUserId, organization_id: organizationId ?? null,
      }));
      setWaBlastProgress({ done: 0, total: targets.length });
      for (let i = 0; i < sendRows.length; i += 500) {
        await supabase.from("whatsapp_sends").insert(sendRows.slice(i, i + 500));
      }

      setWaBlastOpen(false);
      setWaCampaignName("");
      setSelected(new Set());
      setWaBlastSending(false);

      if (scheduledAt) {
        toast.success(`Campaña "${campName}" programada para ${new Date(scheduledAt).toLocaleString()} · ${targets.length} destinatarios.`);
        return;
      }

      // Show the WhatsApp send animation. It stays until the USER closes it; the
      // send runs in the backend so closing doesn't stop it.
      setWaBlastProgress({ done: 0, total: targets.length, finished: false });
      if (waPollRef.current) clearInterval(waPollRef.current);
      waPollRef.current = window.setInterval(async () => {
        const { data: cnt } = await supabase.from("whatsapp_campaigns")
          .select("sent_count, failed_count, total_recipients, status").eq("id", campaignId).maybeSingle();
        if (!cnt) return;
        const done = (cnt.sent_count || 0) + (cnt.failed_count || 0);
        const isDone = cnt.status === "sent";
        // Only update if the loader is still open (user may have closed it).
        setWaBlastProgress(prev => prev ? { done, total: cnt.total_recipients || targets.length, finished: isDone } : null);
        if (isDone && waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; }
      }, 1500);

      // Reliable trigger: AWAIT keeps the connection alive so the worker isn't
      // killed (fire-and-forget was getting dropped). The overlay + poll are
      // independent, so the user can close meanwhile. If it times out on a huge
      // send, the 2-min cron finishes the rest.
      try {
        await supabase.functions.invoke("campaign-sender", { body: { campaign_id: campaignId } });
      } catch (_) { /* cron continues */ }
      if (waPollRef.current) { clearInterval(waPollRef.current); waPollRef.current = null; }
      // Mark finished only if the loader is still open (user may have closed it).
      setWaBlastProgress(prev => prev ? { done: prev.total, total: prev.total, finished: true } : null);
    } catch (e: any) {
      setWaBlastSending(false);
      closeWaLoader();
      toast.error(e?.message || "No se pudo iniciar la campaña");
    }
  };

  // ── Bulk email blast ──────────────────────────────────────────────────────
  const handleEmailBlast = async () => {
    const usingTemplate = emailMode === "template" && selectedEmailTpl;
    const htmlSource = usingTemplate ? selectedEmailTpl!.html : emailBody;
    const subjectSource = emailSubject.trim();
    if (!emailCampaignName.trim()) { toast.error("El nombre de la campaña es obligatorio"); return; }
    if (!subjectSource) { toast.error("El asunto es obligatorio"); return; }
    if (!htmlSource?.trim()) { toast.error(usingTemplate ? "La plantilla no tiene HTML" : "El cuerpo es obligatorio"); return; }
    if (!fromEmail.trim()) { toast.error("El email del remitente es obligatorio. Configúralo en Ajustes → Remitente de emails."); return; }
    const targets = (await fetchSelectedContacts()).filter(c => c.primary_email);
    if (targets.length === 0) { toast.error("Ningún lead seleccionado tiene email"); return; }

    const senderEmail = fromEmail.trim();
    const senderName = fromName.trim();

    // Get user ID directly from auth session (most reliable source)
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? myUserId;
    if (!userId) { toast.error("No se pudo verificar tu sesión, recarga la página"); return; }

    // Create campaign record BEFORE sending
    const { data: campData, error: campErr } = await supabase.from("email_campaigns").insert({
      name: emailCampaignName.trim(),
      subject: subjectSource,
      from_name: senderName,
      from_email: senderEmail,
      html_content: htmlSource || "",
      status: "sending",
      recipient_filter: { type: "manual", contact_ids: targets.map(c => c.id) },
      total_recipients: targets.length,
      user_id: userId,
    }).select("id").single();

    if (campErr || !campData) {
      console.warn("Campaign insert error:", campErr);
      toast.error(`Error al crear la campaña: ${campErr?.message ?? "intenta de nuevo"}`);
      return;
    }
    const campaignId = campData.id;

    setEmailBlastSending(true);
    setEmailBlastProgress({ done: 0, total: targets.length });
    let sent = 0; let failed = 0;
    for (const c of targets) {
      try {
        const firstName = (c.full_name || "").split(" ")[0];
        const html = htmlSource
          .replace(/\{\{nombre\}\}/gi, firstName || c.full_name || "")
          .replace(/\{\{apellido\}\}/gi, (c.full_name || "").split(" ").slice(1).join(" "))
          .replace(/\{\{email\}\}/gi, c.primary_email || "")
          .replace(/\{\{empresa\}\}/gi, c.company_name || "")
          .replace(/\n/g, usingTemplate ? "\n" : "<br>");
        const subject = subjectSource
          .replace(/\{\{nombre\}\}/gi, firstName || c.full_name || "");
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: { action: "send_single", to: c.primary_email, subject, html, contact_id: c.id, from_name: senderName || undefined, from_email: senderEmail, campaign_id: campaignId },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        sent++;
      } catch { failed++; }
      setEmailBlastProgress({ done: sent + failed, total: targets.length });
    }

    // Update campaign with final counts
    await supabase.from("email_campaigns").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    }).eq("id", campaignId);

    setEmailBlastSending(false);
    setEmailBlastOpen(false);
    setEmailBlastProgress(null);
    setEmailCampaignName("");
    setEmailSubject("");
    setEmailBody("");
    setSelectedEmailTpl(null);
    setPreviewHtml(null);
    toast.success(`Email enviado a ${sent} lead${sent !== 1 ? "s" : ""}${failed ? ` (${failed} fallaron)` : ""}`);
    setSelected(new Set());
  };

  // ── Voice campaign (Llamada IA) ───────────────────────────────────────────
  const handleVoiceCampaign = async () => {
    if (!voiceCampaignAgentId) { toast.error("Selecciona un agente de voz"); return; }
    if (!voiceCampaignName.trim()) { toast.error("El nombre de la campaña es obligatorio"); return; }
    const contactIds = [...selected];
    if (contactIds.length === 0) { toast.error("Selecciona al menos un lead"); return; }

    setVoiceCampaignLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userId = authUser?.id ?? myUserId;

      // Create calling_campaign record
      const { data: camp, error: campErr } = await supabase.from("calling_campaigns").insert({
        name: voiceCampaignName.trim(),
        calling_agent_id: voiceCampaignAgentId,
        organization_id: organizationId,
        contact_ids: contactIds,
        status: "active",
        calls_initiated: 0,
        calls_completed: 0,
        calls_failed: 0,
        total_contacts: contactIds.length,
      }).select("id").single();

      if (campErr || !camp) throw new Error(campErr?.message || "Error al crear campaña");

      // Trigger calls via edge function
      const { error: callErr } = await supabase.functions.invoke("call-outbound", {
        body: { action: "launch_campaign", campaign_id: camp.id },
      });

      if (callErr) {
        // Campaign created but calls failed to start — still show campaign link
        toast.warning(`Campaña creada pero hubo un error al iniciar llamadas: ${callErr.message}`);
      } else {
        toast.success(`Campaña "${voiceCampaignName.trim()}" iniciada — ${contactIds.length} llamada${contactIds.length !== 1 ? "s" : ""} en cola`);
      }

      setVoiceCampaignOpen(false);
      setVoiceCampaignName("");
      setVoiceCampaignAgentId("");
      setSelected(new Set());
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setVoiceCampaignLoading(false);
    }
  };

  const handleBulkFieldChange = async () => {
    if (!fieldName || !fieldValue.trim()) { toast.error("Selecciona un campo y escribe un valor"); return; }
    setBulkWorking(true);
    const value = fieldName === "score" ? Number(fieldValue) : fieldValue.trim();
    const { error } = await supabase.from("contacts").update({ [fieldName]: value }).in("id", [...selected]);
    if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }
    setFieldOpen(false);
    setFieldName("");
    setFieldValue("");
    done(`Campo actualizado en ${selected.size} lead${selected.size !== 1 ? "s" : ""}`);
  };

  const handleBulkEditTags = async () => {
    if (pendingTags.length === 0) { toast.error("Agrega al menos una etiqueta"); return; }
    setBulkWorking(true);
    const ids = [...selected];

    if (tagsMode === "replace") {
      const { error } = await supabase.from("contacts").update({ tags: pendingTags }).in("id", ids);
      if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }
    } else {
      // Add mode: merge with existing tags per contact
      const { data: rows } = await supabase.from("contacts").select("id, tags").in("id", ids);
      if (!rows) { setBulkWorking(false); return; }
      for (const row of rows) {
        const existing: string[] = row.tags || [];
        const newTags = pendingTags.filter((t: string) => !existing.includes(t));
        const merged = [...existing, ...newTags];
        await supabase.from("contacts").update({ tags: merged }).eq("id", row.id);
        // Fire tag_added automation trigger for each truly new tag (fire-and-forget)
        if (newTags.length > 0) {
          supabase.functions.invoke("automation-runner", {
            body: {
              action: "trigger_event",
              trigger_type: "tag_added",
              contact_id: row.id,
              trigger_data: { new_tags: newTags },
            },
          }).catch(() => {});
        }
      }
    }

    setTagsOpen(false);
    setPendingTags([]);
    setTagInput("");
    done(`Etiquetas actualizadas en ${ids.length} lead${ids.length !== 1 ? "s" : ""}`);
  };

  const handleBulkAIAnalysis = async () => {
    const ids = [...selected];
    setAiProgress({ done: 0, total: ids.length });
    setBulkWorking(true);
    let succeeded = 0;
    for (const contactId of ids) {
      try {
        const { error } = await supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: contactId } });
        if (!error) succeeded++;
      } catch (_) {}
      setAiProgress(p => p ? { ...p, done: p.done + 1 } : null);
    }
    setAiAnalysisOpen(false);
    setAiProgress(null);
    setBulkWorking(false);
    toast.success(`Score IA actualizado en ${succeeded} lead${succeeded !== 1 ? "s" : ""}`);
    fetchContacts();
  };

  const handleMergeContacts = async () => {
    if (!mergePrimaryId || selected.size !== 2) return;
    const [idA, idB] = [...selected];
    const secondaryId = mergePrimaryId === idA ? idB : idA;
    setMergeWorking(true);
    try {
      const { data, error } = await supabase.rpc("merge_contacts", {
        p_primary_id: mergePrimaryId,
        p_secondary_id: secondaryId,
        p_org_id: organizationId,
      });
      if (error) throw error;
      toast.success("Contactos fusionados correctamente");
      setMergeOpen(false);
      setSelected(new Set());
      fetchContacts();
    } catch (err: any) {
      toast.error("Error al fusionar: " + (err.message || String(err)));
    } finally {
      setMergeWorking(false);
    }
  };

  const addPendingTag = () => {
    const raw = tagInput.trim();
    if (!raw) return;
    // Use the catalog's canonical casing so we never create case-variant duplicates
    // (e.g. "reserva 54" vs "Reserva 54").
    const canonical = orgCatalogTags.find(t => t.toLowerCase() === raw.toLowerCase()) || raw;
    if (!pendingTags.includes(canonical)) setPendingTags(prev => [...prev, canonical]);
    setTagInput("");
  };

  const advancedFilterCount = [sourceFilter !== "all", utmSourceFilter !== "all", utmMediumFilter !== "all", utmCampaignFilter !== "all", !!tagFilter, !!(customFieldKey && customFieldValue), !!(dateFrom || dateTo)].filter(Boolean).length;

  const clearAdvancedFilters = () => {
    setSourceFilter("all");
    setUtmSourceFilter("all");
    setUtmMediumFilter("all");
    setUtmCampaignFilter("all");
    setTagFilter("");
    setCustomFieldKey("");
    setCustomFieldValue("");
    setDateFrom("");
    setDateTo("");
  };

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  };

  const startColResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] ?? 120 };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      setColWidths(prev => ({ ...prev, [resizingRef.current!.key]: Math.max(60, resizingRef.current!.startWidth + delta) }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  /* ─── CSV Export ──────────────────────────────────────────────────── */
  const exportToCSV = useCallback(async () => {
    setExportLoading(true);
    try {
      // Rebuild the same filters as fetchContacts but fetch ALL (up to 10k)
      let query = supabase.from("contacts")
        .select("id, full_name, primary_phone, primary_email, status, lead_status, score, source, tags, company_name, created_at, pipeline_stages(name), owner_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, city, country, budget, budget_currency, notes, custom_fields")
        .order("created_at", { ascending: false })
        .limit(10000);

      if (statusFilter === "unassigned") query = query.is("pipeline_id", null);
      else if (statusFilter !== "all") query = query.eq("lead_status", statusFilter);
      if (search) query = query.or(`full_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
      if (pipelineFilter !== "all") query = query.eq("pipeline_id", pipelineFilter);
      if (stageFilter !== "all") query = query.eq("stage_id", stageFilter);
      if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
      if (utmSourceFilter !== "all") query = query.eq("utm_source", utmSourceFilter);
      if (utmMediumFilter !== "all") query = query.eq("utm_medium", utmMediumFilter);
      if (utmCampaignFilter !== "all") query = query.eq("utm_campaign", utmCampaignFilter);
      if (tagFilter) query = query.contains("tags", [tagFilter]);
      if (customFieldKey && customFieldValue) query = query.contains("custom_fields", { [customFieldKey]: customFieldValue });
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");
      if (scoreFilter === "hot")  query = query.gte("score", 61);
      if (scoreFilter === "warm") query = query.gte("score", 31).lte("score", 60);
      if (scoreFilter === "cold") query = query.lte("score", 30);
      if (isVendor && myUserId) query = query.eq("owner_id", myUserId);
      else if (isOwnerOrAdmin && ownerFilter !== "all") query = query.eq("owner_id", ownerFilter);

      const { data, error } = await query;
      if (error || !data) { toast.error("Error al exportar: " + (error?.message ?? "sin datos")); return; }

      // Collect all custom field keys across all contacts
      const customKeys = new Set<string>();
      data.forEach((c: any) => {
        if (c.custom_fields && typeof c.custom_fields === "object") {
          Object.keys(c.custom_fields).forEach(k => customKeys.add(k));
        }
      });
      const customKeyList = [...customKeys].sort();

      // Build CSV
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = Array.isArray(v) ? v.join("; ") : String(v);
        // Wrap in quotes if contains comma, newline, or quote; escape internal quotes
        if (s.includes(",") || s.includes("\n") || s.includes('"')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const leadStatusLabel: Record<string, string> = {
        active: "Activo", won: "Ganado", lost: "Perdido", new: "Nuevo",
      };

      const headers = [
        "Nombre", "Teléfono", "Email", "Empresa", "Ciudad", "País",
        "Estado", "Fuente", "Etapa", "Puntuación CRM",
        "Presupuesto", "Moneda", "Notas",
        "UTM Fuente", "UTM Medio", "UTM Campaña", "UTM Contenido", "UTM Término",
        "Fecha de ingreso",
        ...customKeyList.map(k => `CF: ${k}`),
      ];

      const rows = data.map((c: any) => [
        escape(c.full_name),
        escape(c.primary_phone),
        escape(c.primary_email),
        escape(c.company_name),
        escape(c.city),
        escape(c.country),
        escape(leadStatusLabel[c.lead_status] ?? c.lead_status),
        escape(c.source),
        escape(c.pipeline_stages?.name),
        escape(c.score),
        escape(c.budget),
        escape(c.budget_currency),
        escape(c.notes),
        escape(c.utm_source),
        escape(c.utm_medium),
        escape(c.utm_campaign),
        escape(c.utm_content),
        escape(c.utm_term),
        escape(c.created_at ? new Date(c.created_at).toLocaleString("es-ES") : ""),
        ...customKeyList.map(k => escape(c.custom_fields?.[k])),
      ]);

      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `leads-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${data.length} leads exportados correctamente`);
    } finally {
      setExportLoading(false);
    }
  }, [statusFilter, scoreFilter, search, ownerFilter, pipelineFilter, stageFilter, sourceFilter,
      utmSourceFilter, utmMediumFilter, utmCampaignFilter, tagFilter, customFieldKey, customFieldValue,
      dateFrom, dateTo, isVendor, isOwnerOrAdmin, myUserId]);

  return (
    <AppLayout>
      <AppHeader title="Leads" subtitle={`${totalCount} leads`} actions={
        <div className="flex items-center gap-1.5 md:gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 hidden sm:inline-flex" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline">Importar CSV</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 hidden sm:inline-flex" onClick={exportToCSV} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden md:inline">Exportar CSV</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nuevo lead</span>
          </Button>
        </div>
      } />
      <main className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 md:pb-24 space-y-3 md:space-y-4 scrollbar-thin">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-full" />
          </div>
          <div className="flex gap-1.5 flex-wrap items-center overflow-x-auto pb-1 sm:pb-0">
            {leadStatusFilters.map(f => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "default" : "outline"}
                size="sm"
                className={`text-xs h-8 ${statusFilter !== f.value && f.color ? f.color : ""}`}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}

            {/* Actividad CRM dropdown */}
            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="h-8 w-44 text-xs gap-1.5">
                <BarChart2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda la actividad</SelectItem>
                <SelectItem value="hot">Alta (61–100)</SelectItem>
                <SelectItem value="warm">Media (31–60)</SelectItem>
                <SelectItem value="cold">Baja (0–30)</SelectItem>
              </SelectContent>
            </Select>

            {isOwnerOrAdmin && profiles.length > 0 && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-8 w-44 text-xs gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los vendedores</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {pipelines.length > 0 && (
              <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
                <SelectTrigger className="h-8 w-40 text-xs gap-1.5">
                  <KanbanSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los pipelines</SelectItem>
                  {pipelines.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {pipelineFilter !== "all" && stagesForFilter.length > 0 && (
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="h-8 w-40 text-xs gap-1.5">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las etapas</SelectItem>
                  {stagesForFilter.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color || "#94a3b8" }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Columnas picker */}
            <Popover open={colPickerOpen} onOpenChange={setColPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Columns2 className="h-3.5 w-3.5" /> Columnas
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="end">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Columnas visibles</p>
                {COLUMN_DEFS.filter(c => !c.adminOnly || isOwnerOrAdmin).map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={visibleCols.has(col.key)} onCheckedChange={() => toggleCol(col.key)} />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>

            {/* Más filtros button */}
            <Button
              variant={advancedFilterCount > 0 ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setAdvancedOpen(prev => !prev)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Más filtros
              {advancedFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">{advancedFilterCount}</span>
              )}
            </Button>
          </div>
        </div>

        {/* Advanced filters panel */}
        {advancedOpen && (
          <div className="rounded-lg border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros avanzados</p>
              {advancedFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAdvancedFilters}>
                  <X className="h-3 w-3 mr-1" /> Limpiar filtros
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {/* Source */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Fuente de origen</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las fuentes</SelectItem>
                    {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* UTM Source */}
              {utmSources.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">UTM Fuente</Label>
                  <Select value={utmSourceFilter} onValueChange={setUtmSourceFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {utmSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* UTM Medium */}
              {utmMediums.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">UTM Medio</Label>
                  <Select value={utmMediumFilter} onValueChange={setUtmMediumFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {utmMediums.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* UTM Campaign */}
              {utmCampaigns.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">UTM Campaña</Label>
                  <Select value={utmCampaignFilter} onValueChange={setUtmCampaignFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {utmCampaigns.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Tag filter */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Etiqueta (tag)</Label>
                {allTags.length > 0 ? (
                  <Select value={tagFilter || "all"} onValueChange={v => setTagFilter(v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las etiquetas</SelectItem>
                      {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ej: vip"
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                  />
                )}
              </div>

              {/* Custom field key/value */}
              <div className="space-y-1 col-span-2">
                <Label className="text-[11px] text-muted-foreground">Campo personalizado</Label>
                <div className="flex gap-1.5">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Clave (ej: empresa)"
                    value={customFieldKey}
                    onChange={e => setCustomFieldKey(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Valor (ej: Acme)"
                    value={customFieldValue}
                    onChange={e => setCustomFieldValue(e.target.value)}
                  />
                </div>
              </div>

              {/* Date range */}
              <div className="space-y-1 col-span-2">
                <Label className="text-[11px] text-muted-foreground">Fecha de ingreso</Label>
                <div className="flex gap-1.5 items-center">
                  <Input type="date" className="h-8 text-xs flex-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  <span className="text-xs text-muted-foreground shrink-0">hasta</span>
                  <Input type="date" className="h-8 text-xs flex-1" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Active filter chips */}
            {advancedFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sourceFilter !== "all" && <Badge variant="secondary" className="text-xs gap-1">{sourceFilter}<button onClick={() => setSourceFilter("all")}><X className="h-3 w-3" /></button></Badge>}
                {utmSourceFilter !== "all" && <Badge variant="secondary" className="text-xs gap-1">utm_source: {utmSourceFilter}<button onClick={() => setUtmSourceFilter("all")}><X className="h-3 w-3" /></button></Badge>}
                {utmMediumFilter !== "all" && <Badge variant="secondary" className="text-xs gap-1">utm_medium: {utmMediumFilter}<button onClick={() => setUtmMediumFilter("all")}><X className="h-3 w-3" /></button></Badge>}
                {utmCampaignFilter !== "all" && <Badge variant="secondary" className="text-xs gap-1">utm_campaign: {utmCampaignFilter}<button onClick={() => setUtmCampaignFilter("all")}><X className="h-3 w-3" /></button></Badge>}
                {tagFilter && <Badge variant="secondary" className="text-xs gap-1">tag: {tagFilter}<button onClick={() => setTagFilter("")}><X className="h-3 w-3" /></button></Badge>}
                {customFieldKey && customFieldValue && <Badge variant="secondary" className="text-xs gap-1">{customFieldKey}: {customFieldValue}<button onClick={() => { setCustomFieldKey(""); setCustomFieldValue(""); }}><X className="h-3 w-3" /></button></Badge>}
                {(dateFrom || dateTo) && <Badge variant="secondary" className="text-xs gap-1">Ingresó: {dateFrom || "…"} – {dateTo || "…"}<button onClick={() => { setDateFrom(""); setDateTo(""); }}><X className="h-3 w-3" /></button></Badge>}
              </div>
            )}
          </div>
        )}

        {/* Bulk action bar */}
        {someChecked && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 md:px-4 md:py-2.5 shadow-sm overflow-x-auto flex-nowrap min-h-[44px]">
            <span className="text-sm font-semibold text-foreground mr-1">
              {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            <div className="h-4 w-px bg-border" />

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-green-700 dark:text-green-400 hover:text-green-700" onClick={() => setWaBlastOpen(true)} disabled={bulkWorking}>
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-blue-700 dark:text-blue-400 hover:text-blue-700" onClick={() => { setEmailSubject(""); setEmailBody(""); setEmailBlastOpen(true); }} disabled={bulkWorking}>
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-600" onClick={() => { setVoiceCampaignName(""); setVoiceCampaignAgentId(callingAgents[0]?.id ?? ""); setVoiceCampaignOpen(true); }} disabled={bulkWorking}>
              <PhoneCall className="h-3.5 w-3.5" /> Llamada IA
            </Button>

            <div className="h-4 w-px bg-border" />

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => { setSelectedOwner(""); setReassignOpen(true); }} disabled={bulkWorking}>
              <UserCheck className="h-3.5 w-3.5" /> Reasignar
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => setTaskOpen(true)} disabled={bulkWorking}>
              <CheckSquare className="h-3.5 w-3.5" /> Añadir tarea
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => { setFieldName(""); setFieldValue(""); setFieldOpen(true); }} disabled={bulkWorking}>
              <Pencil className="h-3.5 w-3.5" /> Cambio de campo
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => { setPendingTags([]); setTagInput(""); setTagsMode("add"); setTagsOpen(true); }} disabled={bulkWorking}>
              <Tags className="h-3.5 w-3.5" /> Editar etiquetas
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => { setBulkStatus(""); setStatusOpen(true); }} disabled={bulkWorking}>
              <Tag className="h-3.5 w-3.5" /> Cambiar estado
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={handleBulkDelete} disabled={bulkWorking}>
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>

            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-primary hover:text-primary" onClick={() => setAiAnalysisOpen(true)} disabled={bulkWorking}>
              <Sparkles className="h-3.5 w-3.5" /> Score IA
            </Button>

            {selected.size === 2 && (
              <Button
                size="sm" variant="ghost"
                className="h-8 gap-1.5 text-xs text-amber-600 hover:text-amber-700"
                disabled={bulkWorking}
                onClick={() => {
                  const [first] = [...selected];
                  setMergePrimaryId(first);
                  setMergeOpen(true);
                }}
              >
                <GitMerge className="h-3.5 w-3.5" /> Fusionar
              </Button>
            )}

            <div className="h-4 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setSelected(new Set()); setAllMatchingSelected(false); }}>
              Cancelar
            </Button>
          </div>
        )}

        {/* Select-all-across-pages banner */}
        {someChecked && totalCount > visibleIds.length && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-center">
            {allMatchingSelected ? (
              <>
                <span className="font-medium">Se seleccionaron los {totalCount.toLocaleString()} leads de todas las páginas.</span>
                <button className="font-semibold text-primary underline underline-offset-2" onClick={() => { setSelected(new Set()); setAllMatchingSelected(false); }}>
                  Limpiar selección
                </button>
              </>
            ) : allChecked ? (
              <>
                <span>Seleccionaste los {visibleIds.length} de esta página.</span>
                <button className="font-semibold text-primary underline underline-offset-2" onClick={selectAllAcrossPages}>
                  Seleccionar los {totalCount.toLocaleString()} de todas las páginas
                </button>
              </>
            ) : null}
          </div>
        )}

        {(() => {
          const activeCols = COLUMN_DEFS.filter(c => visibleCols.has(c.key) && (!c.adminOnly || isOwnerOrAdmin));
          const totalCols = 2 + activeCols.length;
          return (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="text-sm" style={{ tableLayout: "fixed", minWidth: "100%", width: 40 + 260 + activeCols.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultWidth), 0) }}>
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col style={{ width: colWidths["lead"] ?? 260, minWidth: 160 }} />
                  {activeCols.map(col => (
                    <col key={col.key} style={{ width: colWidths[col.key] ?? col.defaultWidth }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 w-10 border-r-2 border-border/60">
                      <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Seleccionar todos" />
                    </th>
                    {/* Lead column — resizable */}
                    <th className="relative px-4 py-3 text-left font-medium text-muted-foreground select-none overflow-hidden border-r-2 border-border/60">
                      <span className="truncate block pr-3">Lead</span>
                      <div
                        className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors z-10"
                        onMouseDown={e => startColResize("lead", e)}
                      />
                    </th>
                    {activeCols.map(col => (
                      <th key={col.key} className="relative px-4 py-3 text-left font-medium text-muted-foreground select-none overflow-hidden border-r-2 border-border/60">
                        <span className="truncate block pr-3">{col.label}</span>
                        <div
                          className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors z-10"
                          onMouseDown={e => startColResize(col.key, e)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={totalCols} className="px-0 py-0">
                      <div className="p-8 space-y-3">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="h-8 w-8 rounded-full bg-muted" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 w-1/3 rounded bg-muted" />
                              <div className="h-2 w-1/4 rounded bg-muted/60" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  ) : contacts.length === 0 ? (
                    <tr><td colSpan={totalCols} className="px-0 py-0">
                      <EmptyState
                        variant={search || statusFilter !== "all" ? "search" : "contacts"}
                        title={search || statusFilter !== "all" ? "Sin resultados" : "Aún no tienes leads"}
                        description={
                          search || statusFilter !== "all"
                            ? "Prueba con otro filtro o término de búsqueda"
                            : "Importa tus leads desde Excel/CSV o crea el primero manualmente. También llegarán automáticamente si tienes Facebook Lead Ads conectado."
                        }
                        action={
                          !search && statusFilter === "all" && (
                            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                              <Plus className="h-4 w-4" /> Crear mi primer lead
                            </Button>
                          )
                        }
                      />
                    </td></tr>
                  ) : contacts.map((contact) => {
                    const stage = contact.pipeline_stages as { id: string; name: string; color: string } | null;
                    const isSelected = selected.has(contact.id);
                    const nav = () => navigate(path(`/contacts/${contact.id}`));
                    return (
                      <tr key={contact.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(contact.id)} aria-label={`Seleccionar ${contact.full_name}`} />
                        </td>
                        <td className="px-4 py-3 cursor-pointer overflow-hidden" onClick={nav}>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                                {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{contact.full_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{contact.primary_email || ''}</p>
                              <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                                {new Date(contact.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        </td>
                        {activeCols.map(col => {
                          switch (col.key) {
                            case "phone": return (
                              <td key="phone" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden truncate" onClick={nav}>
                                {contact.primary_phone || '—'}
                              </td>
                            );
                            case "email": return (
                              <td key="email" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden truncate" onClick={nav}>
                                {contact.primary_email || '—'}
                              </td>
                            );
                            case "company": return (
                              <td key="company" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden truncate" onClick={nav}>
                                {contact.company_name || '—'}
                              </td>
                            );
                            case "source": return (
                              <td key="source" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden truncate" onClick={nav}>
                                {contact.source || '—'}
                              </td>
                            );
                            case "stage": return (
                              <td key="stage" className="px-4 py-3 cursor-pointer overflow-hidden" onClick={nav}>
                                {stage ? (
                                  <Badge variant="outline" className="gap-1.5 text-xs">
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                                    {stage.name}
                                  </Badge>
                                ) : contact.lead_status === "won" ? (
                                  <Badge className="bg-green-500 text-white border-0 text-xs">Ganado</Badge>
                                ) : contact.lead_status === "lost" ? (
                                  <Badge variant="destructive" className="text-xs">Perdido</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                            case "activity": return (
                              <td key="activity" className="px-4 py-3 cursor-pointer overflow-hidden" onClick={nav}>
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${contact.score || 0}%` }} />
                                </div>
                              </td>
                            );
                            case "lead_status": return (
                              <td key="lead_status" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden" onClick={nav}>
                                {contact.lead_status || '—'}
                              </td>
                            );
                            case "vendor": return (
                              <td key="vendor" className="px-4 py-3 text-xs text-muted-foreground cursor-pointer overflow-hidden truncate" onClick={nav}>
                                {contact.owner_id ? (profileMap[contact.owner_id] || "—") : "—"}
                              </td>
                            );
                            case "tags": return (
                              <td key="tags" className="px-4 py-3 cursor-pointer overflow-hidden" onClick={nav}>
                                <div className="flex gap-1 flex-wrap">
                                  {(contact.tags || []).slice(0, 2).map(tag => (
                                    <Badge key={tag} variant="outline" className="text-xs border" style={tagChipStyle(colorOf(tag))}>{tag}</Badge>
                                  ))}
                                </div>
                              </td>
                            );
                            default: return <td key={col.key} />;
                          }
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Pagination controls */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalCount)} de {totalCount} leads
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Por página:</span>
                <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[72px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={String(opt)} className="text-xs">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Página {currentPage + 1} de {Math.max(1, Math.ceil(totalCount / pageSize))}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={(currentPage + 1) * pageSize >= totalCount}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchContacts} />

      <ImportContactsDialog open={importOpen} onOpenChange={setImportOpen} onImported={fetchContacts} />

      {/* ── Reasignar ─────────────────────────────────────────────────── */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reasignar {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Asignar a</Label>
            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
              <SelectTrigger><SelectValue placeholder="Seleccionar usuario" /></SelectTrigger>
              <SelectContent>
                {profiles.length === 0
                  ? <SelectItem value="__none__" disabled>Sin usuarios disponibles</SelectItem>
                  : profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)
                }
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkReassign} disabled={!selectedOwner || bulkWorking}>
              {bulkWorking ? "Reasignando..." : "Reasignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Añadir tarea ──────────────────────────────────────────────── */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Añadir tarea a {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Título *</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: Llamar al lead" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={taskForm.task_type} onValueChange={v => setTaskForm(f => ({ ...f, task_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Llamada</SelectItem>
                    <SelectItem value="meeting">Reunión</SelectItem>
                    <SelectItem value="follow_up">Seguimiento</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha límite</Label>
                <Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Hora</Label>
                <Input type="time" value={taskForm.due_time} onChange={e => setTaskForm(f => ({ ...f, due_time: e.target.value }))} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkAddTask} disabled={!taskForm.title.trim() || bulkWorking}>
              {bulkWorking ? "Creando..." : `Crear ${selected.size} tarea${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cambio de campo ───────────────────────────────────────────── */}
      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambio de campo en {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Campo a modificar</Label>
              <Select value={fieldName} onValueChange={v => { setFieldName(v); setFieldValue(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar campo" /></SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fieldName && (
              <div>
                <Label>Nuevo valor</Label>
                {fieldName === "source" ? (
                  <Select value={fieldValue} onValueChange={setFieldValue}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar origen" /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : fieldName === "preferred_channel" ? (
                  <Select value={fieldValue} onValueChange={setFieldValue}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar canal" /></SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={fieldName === "score" ? "number" : "text"}
                    min={fieldName === "score" ? 0 : undefined}
                    max={fieldName === "score" ? 100 : undefined}
                    value={fieldValue}
                    onChange={e => setFieldValue(e.target.value)}
                    placeholder={fieldName === "score" ? "0 – 100" : "Nuevo valor"}
                    className="mt-1"
                  />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkFieldChange} disabled={!fieldName || !fieldValue || bulkWorking}>
              {bulkWorking ? "Aplicando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Editar etiquetas ──────────────────────────────────────────── */}
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar etiquetas en {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button size="sm" variant={tagsMode === "add" ? "default" : "outline"} className="flex-1 text-xs" onClick={() => setTagsMode("add")}>
                Agregar a existentes
              </Button>
              <Button size="sm" variant={tagsMode === "replace" ? "default" : "outline"} className="flex-1 text-xs" onClick={() => setTagsMode("replace")}>
                Reemplazar todo
              </Button>
            </div>
            <div>
              <Label>Etiquetas</Label>
              <div className="flex gap-2 mt-1 items-start">
                <div className="flex-1">
                  <TagPicker
                    value={tagInput}
                    onChange={setTagInput}
                    placeholder="Elige una etiqueta..."
                    allowCreate={false}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPendingTag}>Agregar</Button>
              </div>
              {pendingTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {pendingTags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                      {t}
                      <button onClick={() => setPendingTags(p => p.filter(x => x !== t))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {tagsMode === "add"
                ? "Las etiquetas se añadirán a las que ya tiene cada lead."
                : "Se reemplazarán todas las etiquetas existentes de los leads seleccionados."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagsOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkEditTags} disabled={pendingTags.length === 0 || bulkWorking}>
              {bulkWorking ? "Aplicando..." : "Aplicar etiquetas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Score IA masivo ───────────────────────────────────────────── */}
      <Dialog open={aiAnalysisOpen} onOpenChange={v => { if (!bulkWorking) setAiAnalysisOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Analizar score IA</DialogTitle></DialogHeader>
          {aiProgress ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Analizando leads...</p>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(aiProgress.done / aiProgress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-center text-muted-foreground">{aiProgress.done} / {aiProgress.total}</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground">
                Se analizarán <strong>{selected.size} lead{selected.size !== 1 ? "s" : ""}</strong> con inteligencia artificial para calcular su score de compra.
              </p>
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-warning">Aviso de costo</p>
                <p className="text-xs text-muted-foreground">
                  Cada análisis consume créditos IA de tu plan. Costo estimado de esta operación: <strong>~${(selected.size * 0.0004).toFixed(3)} USD</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Leads sin conversaciones recientes pueden generar un score menos preciso.
                </p>
              </div>
            </div>
          )}
          {!aiProgress && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAiAnalysisOpen(false)}>Cancelar</Button>
              <Button onClick={handleBulkAIAnalysis} disabled={bulkWorking} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Analizar {selected.size} lead{selected.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Fusionar contactos ───────────────────────────────────────── */}
      <Dialog open={mergeOpen} onOpenChange={v => { if (!mergeWorking) setMergeOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-amber-600" /> Fusionar contactos duplicados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Elige cuál es el contacto <strong>principal</strong>. El otro se eliminará y toda su actividad, mensajes y llamadas se transferirán al principal.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[...selected].map(cid => {
                const c = contacts.find(x => x.id === cid);
                if (!c) return null;
                const isPrimary = mergePrimaryId === cid;
                return (
                  <button
                    key={cid}
                    onClick={() => setMergePrimaryId(cid)}
                    className={`text-left rounded-lg border-2 p-3 transition-all ${isPrimary ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                          {c.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {isPrimary && <Badge className="text-[10px] h-5">Principal</Badge>}
                    </div>
                    <p className="text-sm font-medium truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.primary_phone || c.primary_email || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Origen: <span className="font-medium">{c.source || "—"}</span></p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">
                Esta acción es <strong>irreversible</strong>. El contacto secundario se eliminará permanentemente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={mergeWorking}>Cancelar</Button>
            <Button
              onClick={handleMergeContacts}
              disabled={!mergePrimaryId || mergeWorking}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-0"
            >
              {mergeWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
              Fusionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cambiar estado ────────────────────────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar estado de {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nuevo estado</Label>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="won">Ganado</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
                <SelectItem value="disqualified">Descalificado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkStatus} disabled={!bulkStatus || bulkWorking}>
              {bulkWorking ? "Actualizando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Bulk WhatsApp template picker ──────────────────────────────── */}
      <TemplatePicker
        open={waBlastOpen}
        onClose={() => !waBlastSending && setWaBlastOpen(false)}
        sending={waBlastSending}
        onSend={handleWaBlast}
        requireCampaignName
      />
      {waBlastProgress && (
        <WhatsAppSendLoader
          done={waBlastProgress.done}
          total={waBlastProgress.total}
          finished={waBlastProgress.finished}
          onClose={closeWaLoader}
        />
      )}

      {/* ── Bulk email blast dialog ─────────────────────────────────────── */}
      <Dialog open={emailBlastOpen} onOpenChange={v => { if (!emailBlastSending) { setEmailBlastOpen(v); if (!v) { setSelectedEmailTpl(null); setPreviewHtml(null); setEmailMode("template"); setEmailSubject(""); setEmailBody(""); setEmailCampaignName(""); } } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b shrink-0">
            <Mail className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <h2 className="text-base font-semibold">Enviar email a {selected.size} leads seleccionados</h2>
              <p className="text-xs text-muted-foreground">
                Usa <code className="bg-muted px-1 rounded">{"{{nombre}}"}</code> para personalizar automáticamente
              </p>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 px-6 py-3 border-b shrink-0 bg-muted/30">
            <button
              onClick={() => setEmailMode("template")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${emailMode === "template" ? "bg-white shadow text-foreground border" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Usar plantilla guardada
            </button>
            <button
              onClick={() => setEmailMode("custom")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${emailMode === "custom" ? "bg-white shadow text-foreground border" : "text-muted-foreground hover:text-foreground"}`}
            >
              <FileText className="h-3.5 w-3.5" /> Escribir email nuevo
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* ── Template mode ── */}
            {emailMode === "template" && (
              <>
                {loadingEmailTpls ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : savedTemplates.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm font-medium">No tienes plantillas guardadas</p>
                    <p className="text-xs text-muted-foreground">Ve a <strong>Email Builder</strong> en el sidebar para crear y guardar plantillas de diseño.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {savedTemplates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => { setSelectedEmailTpl(tpl); setEmailSubject(tpl.subject || ""); }}
                        className={`text-left rounded-lg border p-3 transition-all hover:border-blue-400 ${selectedEmailTpl?.id === tpl.id ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-border bg-card"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{tpl.name}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.subject || "Sin asunto"}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {selectedEmailTpl?.id === tpl.id && <span className="text-blue-600 text-xs font-bold">✓</span>}
                            <button
                              onClick={e => { e.stopPropagation(); setPreviewHtml(tpl.html); }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Previsualizar"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Preview modal */}
                {previewHtml && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl w-[660px] max-h-[80vh] flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b">
                        <p className="font-semibold text-sm">Vista previa</p>
                        <button onClick={() => setPreviewHtml(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
                      </div>
                      <div className="flex-1 overflow-auto p-2">
                        <iframe
                          srcDoc={previewHtml}
                          title="Email preview"
                          className="w-full border-0 rounded"
                          style={{ minHeight: 480 }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Custom mode ── */}
            {emailMode === "custom" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold mb-1 block">Cuerpo del email</Label>
                  <Textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    placeholder={"Hola {{nombre}},\n\nEscribo para..."}
                    rows={9}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">El texto se envía tal cual con saltos de línea respetados.</p>
                </div>
              </div>
            )}

            {/* ── Campaign name (required) ── */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                🏷️ Nombre de la campaña <span className="text-red-500">*</span>
              </p>
              <Input
                value={emailCampaignName}
                onChange={e => setEmailCampaignName(e.target.value)}
                placeholder="Ej: Promo Mayo 2026, Seguimiento leads fríos…"
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Aparecerá en Campañas para identificar y ver las estadísticas de este envío.</p>
            </div>

            {/* ── Sender config ── */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                📤 Remitente
                {!fromEmail.trim() && (
                  <span className="text-amber-600 font-normal ml-1">⚠ Configura un email verificado en Resend para que llegue</span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1 block">Nombre del remitente</Label>
                  <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Ej: Cristhian de Aceleradora" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Email del remitente <span className="text-red-500">*</span></Label>
                  <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="Ej: hola@tudominio.com" type="email" className="h-8 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Debe ser un email de un dominio verificado en <strong>resend.com → Domains</strong></p>
            </div>

            {/* ── Subject (always visible) ── */}
            <div>
              <Label className="text-xs font-semibold mb-1 block">Asunto del email</Label>
              <Input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Ej: Tenemos algo para ti, {{nombre}}"
              />
            </div>

            {/* Progress */}
            {emailBlastProgress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando {emailBlastProgress.done}/{emailBlastProgress.total}…
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 flex items-center justify-between shrink-0 bg-background">
            <p className="text-xs text-muted-foreground">
              {emailMode === "template" && selectedEmailTpl
                ? <>Plantilla: <strong>{selectedEmailTpl.name}</strong></>
                : emailMode === "template"
                ? "Selecciona una plantilla arriba"
                : "Email personalizado"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEmailBlastOpen(false)} disabled={emailBlastSending}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleEmailBlast}
                disabled={emailBlastSending || !emailCampaignName.trim() || !emailSubject.trim() || !fromEmail.trim() || (emailMode === "template" ? !selectedEmailTpl : !emailBody.trim())}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {emailBlastSending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Enviando…</>
                  : <><Mail className="h-4 w-4 mr-1" /> Enviar email</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Voice Campaign (Llamada IA) ────────────────────────────── */}
      <Dialog open={voiceCampaignOpen} onOpenChange={setVoiceCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-orange-500" />
              Campaña de llamadas IA
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Summary */}
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/10 px-4 py-3">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {selected.size} lead{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-0.5">
                El agente de voz llamará a cada lead de forma automática.
              </p>
            </div>

            {/* Agent selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Agente de voz <span className="text-red-500">*</span></Label>
              {callingAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-2.5">
                  No tienes agentes de voz configurados.{" "}
                  <a href="/calling-agent" className="text-primary underline underline-offset-2">Crear un agente →</a>
                </p>
              ) : (
                <Select value={voiceCampaignAgentId} onValueChange={setVoiceCampaignAgentId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecciona un agente…" />
                  </SelectTrigger>
                  <SelectContent>
                    {callingAgents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Campaign name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nombre de la campaña <span className="text-red-500">*</span></Label>
              <Input
                value={voiceCampaignName}
                onChange={e => setVoiceCampaignName(e.target.value)}
                placeholder="Ej: Seguimiento mayo, Leads fríos Q2…"
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Aparecerá en Agente de Voz → Campañas para ver el progreso.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setVoiceCampaignOpen(false)} disabled={voiceCampaignLoading}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleVoiceCampaign}
              disabled={voiceCampaignLoading || !voiceCampaignAgentId || !voiceCampaignName.trim() || callingAgents.length === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {voiceCampaignLoading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Iniciando…</>
                : <><PhoneCall className="h-4 w-4 mr-1" /> Iniciar campaña</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete leads confirmation ──────────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.size} lead{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Los leads se eliminarán permanentemente.</AlertDialogDescription>
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

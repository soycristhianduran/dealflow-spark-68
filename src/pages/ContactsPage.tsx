import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Search, Trash2, Tag, UserCheck, CheckSquare, Pencil, Tags, X, Sparkles, User, KanbanSquare, MessageSquare, Mail, Loader2, LayoutTemplate, FileText, Eye } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { CreateContactDialog } from "@/components/crm/CreateContactDialog";
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

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'Nuevos' },
  { value: 'contacted', label: 'Contactados' },
  { value: 'qualified', label: 'Calificados' },
  { value: 'client', label: 'Clientes' },
  { value: 'lost', label: 'Perdidos' },
];

const FIELD_OPTIONS = [
  { value: "source", label: "Origen" },
  { value: "city", label: "Ciudad" },
  { value: "country", label: "País" },
  { value: "preferred_channel", label: "Canal preferido" },
  { value: "score", label: "Score (0–100)" },
];

const CHANNEL_OPTIONS = ["whatsapp", "email", "phone", "sms"];
const SOURCE_OPTIONS = ["Facebook Ads", "Google Ads", "WhatsApp", "Referral", "Landing Page", "Instagram", "Otro"];

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
  pipeline_stages?: { id: string; name: string; color: string } | null;
}

interface ProfileOption {
  user_id: string;
  full_name: string;
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stagesForFilter, setStagesForFilter] = useState<{ id: string; name: string; color: string }[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const navigate = useNavigate();
  const { path } = useWorkspace();
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
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);

  // Bulk WhatsApp template blast
  const [waBlastOpen, setWaBlastOpen] = useState(false);
  const [waBlastSending, setWaBlastSending] = useState(false);
  const [waBlastProgress, setWaBlastProgress] = useState<{ done: number; total: number } | null>(null);

  // Bulk email blast
  const [emailBlastOpen, setEmailBlastOpen] = useState(false);
  const [emailBlastSending, setEmailBlastSending] = useState(false);
  const [emailBlastProgress, setEmailBlastProgress] = useState<{ done: number; total: number } | null>(null);
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

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("contacts")
      .select("id, full_name, primary_phone, primary_email, status, score, source, tags, created_at, stage_id, pipeline_id, lead_status, owner_id, pipeline_stages(id, name, color)")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (search) query = query.or(`full_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    if (pipelineFilter !== "all") query = query.eq("pipeline_id", pipelineFilter);
    if (stageFilter !== "all") query = query.eq("stage_id", stageFilter);
    // Vendors only see their own leads
    if (isVendor && myUserId) {
      query = query.eq("owner_id", myUserId);
    } else if (isOwnerOrAdmin && ownerFilter !== "all") {
      query = query.eq("owner_id", ownerFilter);
    }
    const { data, error } = await query;
    if (!error && data) setContacts(data as any);
    setLoading(false);
  }, [statusFilter, search, ownerFilter, pipelineFilter, stageFilter, isVendor, isOwnerOrAdmin, myUserId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => fetchContacts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchContacts]);

  useEffect(() => { setSelected(new Set()); }, [statusFilter, search, ownerFilter]);

  // Fetch team members via edge function (bypasses RLS on profiles table).
  // Used for: owner filter dropdown, reassign dialog, Vendedor column display.
  useEffect(() => {
    supabase.functions.invoke("org-invitations", { body: { action: "list_members" } })
      .then(({ data }) => {
        if (data?.members) {
          const list = (data.members as any[]).map(m => ({
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

  const done = (msg: string) => {
    toast.success(msg);
    setSelected(new Set());
    fetchContacts();
    setBulkWorking(false);
  };

  // ── Bulk handlers ──────────────────────────────────────────────────────

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} lead${selected.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").delete().in("id", [...selected]);
    if (error) { toast.error("Error al eliminar: " + error.message); setBulkWorking(false); return; }
    done(`${selected.size} lead${selected.size !== 1 ? "s" : ""} eliminado${selected.size !== 1 ? "s" : ""}`);
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").update({ status: bulkStatus }).in("id", [...selected]);
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

  // ── Bulk WhatsApp template blast ──────────────────────────────────────────
  const handleWaBlast = async (templateName: string, language: string, vars: string[], mediaId: string) => {
    const targets = contacts.filter(c => selected.has(c.id) && c.primary_phone);
    if (targets.length === 0) { toast.error("Ningún lead seleccionado tiene número de teléfono"); return; }
    setWaBlastSending(true);
    setWaBlastProgress({ done: 0, total: targets.length });
    let sent = 0; let failed = 0;
    for (const c of targets) {
      try {
        const phone = c.primary_phone!.replace(/[^0-9]/g, "");
        const { data, error } = await supabase.functions.invoke("whatsapp-api", {
          body: { action: "send_template", phone, template_name: templateName, language, variables: vars, header_media_id: mediaId || undefined, contact_id: c.id },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        sent++;
      } catch { failed++; }
      setWaBlastProgress({ done: sent + failed, total: targets.length });
    }
    setWaBlastSending(false);
    setWaBlastOpen(false);
    setWaBlastProgress(null);
    toast.success(`WhatsApp enviado a ${sent} lead${sent !== 1 ? "s" : ""}${failed ? ` (${failed} fallaron)` : ""}`);
    setSelected(new Set());
  };

  // ── Bulk email blast ──────────────────────────────────────────────────────
  const handleEmailBlast = async () => {
    const usingTemplate = emailMode === "template" && selectedEmailTpl;
    const htmlSource = usingTemplate ? selectedEmailTpl!.html : emailBody;
    const subjectSource = emailSubject.trim();
    if (!subjectSource) { toast.error("El asunto es obligatorio"); return; }
    if (!htmlSource?.trim()) { toast.error(usingTemplate ? "La plantilla no tiene HTML" : "El cuerpo es obligatorio"); return; }
    if (!fromEmail.trim()) { toast.error("El email del remitente es obligatorio. Configúralo en Ajustes → Remitente de emails."); return; }
    const targets = contacts.filter(c => selected.has(c.id) && c.primary_email);
    if (targets.length === 0) { toast.error("Ningún lead seleccionado tiene email"); return; }

    // Build RFC 5322 from address: "Name <email>" or just "email" if no name
    const senderEmail = fromEmail.trim();
    const senderName = fromName.trim();
    // If name contains special chars, wrap in quotes
    const safeFromName = senderName ? `"${senderName.replace(/"/g, "'")}"` : null;
    const fromAddress = safeFromName ? `${safeFromName} <${senderEmail}>` : senderEmail;

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
          .replace(/\{\{empresa\}\}/gi, (c as any).company_name || "")
          .replace(/\n/g, usingTemplate ? "\n" : "<br>");
        const subject = subjectSource
          .replace(/\{\{nombre\}\}/gi, firstName || c.full_name || "");
        const { data, error } = await supabase.functions.invoke("send-email", {
          body: { action: "send_single", to: c.primary_email, subject, html, contact_id: c.id, from_name: senderName || undefined, from_email: senderEmail },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        sent++;
      } catch { failed++; }
      setEmailBlastProgress({ done: sent + failed, total: targets.length });
    }
    setEmailBlastSending(false);
    setEmailBlastOpen(false);
    setEmailBlastProgress(null);
    setEmailSubject("");
    setEmailBody("");
    setSelectedEmailTpl(null);
    setPreviewHtml(null);
    toast.success(`Email enviado a ${sent} lead${sent !== 1 ? "s" : ""}${failed ? ` (${failed} fallaron)` : ""}`);
    setSelected(new Set());
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
        const existing = row.tags || [];
        const merged = Array.from(new Set([...existing, ...pendingTags]));
        await supabase.from("contacts").update({ tags: merged }).eq("id", row.id);
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

  const addPendingTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (!pendingTags.includes(t)) setPendingTags(prev => [...prev, t]);
    setTagInput("");
  };

  return (
    <AppLayout>
      <AppHeader title="Leads" subtitle={`${contacts.length} leads`} actions={
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo lead
        </Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            {statusFilters.map(f => (
              <Button key={f.value} variant={statusFilter === f.value ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </Button>
            ))}
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
          </div>
        </div>

        {/* Bulk action bar */}
        {someChecked && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm flex-wrap">
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

            <div className="h-4 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </div>
        )}

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Seleccionar todos" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Origen</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Etapa</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Score</th>
                {isOwnerOrAdmin && <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">Vendedor</th>}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-0 py-0">
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
                <tr><td colSpan={7} className="px-0 py-0">
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
                return (
                  <tr key={contact.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(contact.id)} aria-label={`Seleccionar ${contact.full_name}`} />
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                            {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{contact.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{contact.primary_email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>{contact.primary_phone || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>{contact.source || '—'}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
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
                    <td className="px-4 py-3 hidden md:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${contact.score || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{contact.score || 0}</span>
                      </div>
                    </td>
                    {isOwnerOrAdmin && (
                      <td className="px-4 py-3 hidden xl:table-cell cursor-pointer text-xs text-muted-foreground" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                        {contact.owner_id ? (profileMap[contact.owner_id] || "—") : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 hidden lg:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex gap-1 flex-wrap">
                        {(contact.tags || []).slice(0, 2).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchContacts} />

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
              <div className="flex gap-2 mt-1">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder="Escribe una etiqueta..."
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPendingTag(); } }}
                  className="flex-1"
                />
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

      {/* ── Cambiar estado ────────────────────────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar estado de {selected.size} lead{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nuevo estado</Label>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Nuevo</SelectItem>
                <SelectItem value="contacted">Contactado</SelectItem>
                <SelectItem value="qualified">Calificado</SelectItem>
                <SelectItem value="client">Cliente</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
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
      />
      {waBlastProgress && (
        <div className="fixed bottom-6 right-6 z-50 bg-card border rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-green-600" />
          <span>Enviando WhatsApp… {waBlastProgress.done}/{waBlastProgress.total}</span>
        </div>
      )}

      {/* ── Bulk email blast dialog ─────────────────────────────────────── */}
      <Dialog open={emailBlastOpen} onOpenChange={v => { if (!emailBlastSending) { setEmailBlastOpen(v); if (!v) { setSelectedEmailTpl(null); setPreviewHtml(null); setEmailMode("template"); setEmailSubject(""); setEmailBody(""); } } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b shrink-0">
            <Mail className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <h2 className="text-base font-semibold">Enviar email a {contacts.filter(c => selected.has(c.id) && c.primary_email).length} leads</h2>
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
                disabled={emailBlastSending || !emailSubject.trim() || !fromEmail.trim() || (emailMode === "template" ? !selectedEmailTpl : !emailBody.trim())}
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
    </AppLayout>
  );
}

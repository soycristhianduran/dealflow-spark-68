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
import { Plus, Search, Trash2, Tag, UserCheck, CheckSquare, Pencil, Tags, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { CreateContactDialog } from "@/components/crm/CreateContactDialog";
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
  source: string | null;
  tags: string[] | null;
  created_at: string;
}

interface ProfileOption {
  user_id: string;
  full_name: string;
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const navigate = useNavigate();
  const { path } = useWorkspace();

  // Bulk action dialog state
  const [reassignOpen, setReassignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Profiles for reassign
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
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

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("contacts").select("id, full_name, primary_phone, primary_email, status, score, source, tags, created_at").order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (search) query = query.or(`full_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    const { data, error } = await query;
    if (!error && data) setContacts(data);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => fetchContacts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchContacts]);

  useEffect(() => { setSelected(new Set()); }, [statusFilter, search]);

  // Fetch profiles when reassign dialog opens
  useEffect(() => {
    if (!reassignOpen) return;
    supabase.from("profiles").select("user_id, first_name, last_name").then(({ data }) => {
      if (data) setProfiles(data.map(p => ({
        user_id: p.user_id,
        full_name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.user_id,
      })));
    });
  }, [reassignOpen]);

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
    const { error } = await supabase.from("contacts").update({ owner_id: selectedOwner }).in("id", [...selected]);
    if (error) { toast.error("Error: " + error.message); setBulkWorking(false); return; }
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
          <div className="flex gap-1.5 flex-wrap">
            {statusFilters.map(f => (
              <Button key={f.value} variant={statusFilter === f.value ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {someChecked && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 shadow-sm flex-wrap">
            <span className="text-sm font-semibold text-foreground mr-1">
              {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Score</th>
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
                const status = statusConfig[contact.status] || statusConfig.new;
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
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}><Badge variant={status.variant}>{status.label}</Badge></td>
                    <td className="px-4 py-3 hidden md:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${contact.score || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{contact.score || 0}</span>
                      </div>
                    </td>
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
    </AppLayout>
  );
}

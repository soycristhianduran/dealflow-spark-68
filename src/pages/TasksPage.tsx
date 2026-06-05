import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Plus, Search, Phone, MessageCircle, Mail, Calendar,
  ArrowRight, CreditCard, FileText, CheckCircle2, Circle, Clock, Loader2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  status: string;
  contact_id: string | null;
  deal_id: string | null;
  contact_name?: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  follow_up: <ArrowRight className="h-3.5 w-3.5" />,
  payment: <CreditCard className="h-3.5 w-3.5" />,
  proposal: <FileText className="h-3.5 w-3.5" />,
};

const priorityClasses: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-success" />,
  cancelled: <Circle className="h-4 w-4 text-destructive" />,
};

const nextStatus: Record<string, string> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
  cancelled: "pending",
};

export default function TasksPage() {
  const { session } = useAuth();
  const { isVendor, myUserId } = usePermissions();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("follow_up");
  const [formPriority, setFormPriority] = useState("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formDueTime, setFormDueTime] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("tasks")
      .select("id, title, description, task_type, priority, due_date, due_time, status, contact_id, deal_id, contacts(full_name)")
      .order("due_date", { ascending: true });
    if (isVendor && myUserId) query = query.eq("owner_id", myUserId);
    const { data } = await query;
    const mapped = (data || []).map((t: any) => ({
      ...t,
      contact_name: t.contacts?.full_name || null,
      contacts: undefined,
    }));
    setTasks(mapped);
    setLoading(false);
  }, [isVendor, myUserId]);

  useEffect(() => {
    fetchTasks();
    // Vendors only see their own contacts in the picker
    const contactsQuery = isVendor && myUserId
      ? supabase.from("contacts").select("id, full_name").eq("owner_id", myUserId).order("full_name")
      : supabase.from("contacts").select("id, full_name").order("full_name");
    contactsQuery.then(({ data }) => {
      if (data) setContacts(data);
    });
  }, [fetchTasks, isVendor, myUserId]);

  const today = format(new Date(), "yyyy-MM-dd");

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === "today") return t.due_date === today && t.status !== "completed";
    if (tab === "overdue") return t.due_date && t.due_date < today && t.status === "pending";
    if (tab === "completed") return t.status === "completed";
    return true;
  });

  const pendingCount = tasks.filter(t => t.status === "pending").length;

  const toggleStatus = async (task: TaskRow) => {
    const newStatus = nextStatus[task.status] || "pending";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
  };

  const openCreate = () => {
    setFormTitle("");
    setFormDescription("");
    setFormType("follow_up");
    setFormPriority("medium");
    setFormDueDate(today);
    setFormDueTime("");
    setFormContactId("");
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) { toast.error("El título es requerido"); return; }
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      task_type: formType,
      priority: formPriority,
      due_date: formDueDate || null,
      due_time: formDueTime || null,
      contact_id: formContactId && formContactId !== "none" ? formContactId : null,
      owner_id: session?.user?.id || null,
      status: "pending",
    });
    setSaving(false);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success("Tarea creada");
    setDialogOpen(false);
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
    toast.success("Tarea eliminada");
  };

  return (
    <AppLayout>
      <AppHeader
        title="Tareas"
        subtitle={`${pendingCount} pendientes`}
        actions={
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nueva tarea
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="today">Hoy</TabsTrigger>
              <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
              <TabsTrigger value="completed">Completadas</TabsTrigger>
            </TabsList>
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar tareas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
          </div>

          <TabsContent value={tab} className="mt-4 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No hay tareas en esta vista</div>
            ) : (
              filtered.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow group">
                  <button className="shrink-0" onClick={() => toggleStatus(task)} title="Cambiar estado">
                    {statusIcons[task.status]}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {task.due_date && (
                        <span className={`text-xs ${task.due_date < today && task.status === "pending" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {task.due_date}{task.due_time && ` · ${task.due_time}`}
                        </span>
                      )}
                      {task.contact_name && <span className="text-xs text-muted-foreground">· {task.contact_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="gap-1 text-xs">
                      {typeIcons[task.task_type]}
                      {task.task_type}
                    </Badge>
                    <Badge className={`text-xs ${priorityClasses[task.priority]}`}>
                      {task.priority}
                    </Badge>
                    <button
                      onClick={() => setDeleteTargetId(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-muted-foreground hover:text-destructive transition-opacity ml-1"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ej: Llamar a cliente" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Detalles..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Seguimiento</SelectItem>
                    <SelectItem value="call">Llamada</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Reunión</SelectItem>
                    <SelectItem value="proposal">Propuesta</SelectItem>
                    <SelectItem value="payment">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={formDueTime} onChange={e => setFormDueTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin contacto</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !formTitle.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTargetId} onOpenChange={open => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarea?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTargetId) handleDelete(deleteTargetId); setDeleteTargetId(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

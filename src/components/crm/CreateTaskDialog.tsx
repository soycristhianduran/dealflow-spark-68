/**
 * Diálogo para crear una tarea (llamada, seguimiento, etc.) asociada a un lead.
 * Permite fijar fecha/hora y un RECORDATORIO: cuando llega el momento, el sistema
 * envía una notificación push al responsable (vía la función cron task-reminders).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | null;
  contactId: string | null;
  ownerId: string | null;
  onCreated?: () => void;
}

const TASK_TYPES = [
  { v: "call", label: "Llamada" },
  { v: "follow_up", label: "Seguimiento" },
  { v: "email", label: "Email" },
  { v: "meeting", label: "Reunión" },
  { v: "other", label: "Otra" },
];
const PRIORITIES = [
  { v: "low", label: "Baja" },
  { v: "medium", label: "Media" },
  { v: "high", label: "Alta" },
  { v: "urgent", label: "Urgente" },
];
// Minutos antes de la fecha/hora en que se dispara el recordatorio.
const REMINDERS = [
  { v: "none", label: "Sin recordatorio", min: null },
  { v: "0", label: "A la hora exacta", min: 0 },
  { v: "10", label: "10 minutos antes", min: 10 },
  { v: "30", label: "30 minutos antes", min: 30 },
  { v: "60", label: "1 hora antes", min: 60 },
  { v: "1440", label: "1 día antes", min: 1440 },
];

export function CreateTaskDialog({ open, onOpenChange, organizationId, contactId, ownerId, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("call");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reminder, setReminder] = useState("none");
  const [description, setDescription] = useState("");

  const reset = () => {
    setTitle(""); setType("call"); setPriority("medium");
    setDueDate(""); setDueTime(""); setReminder("none"); setDescription("");
  };

  // Momento (instante UTC) en que debe dispararse el recordatorio.
  const computeRemindAt = (): string | null => {
    const min = REMINDERS.find(r => r.v === reminder)?.min;
    if (min == null || !dueDate) return null;
    const t = dueTime || "09:00";
    const base = new Date(`${dueDate}T${t}:00`); // hora local del usuario
    if (isNaN(base.getTime())) return null;
    return new Date(base.getTime() - min * 60000).toISOString();
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Escribe un título para la tarea"); return; }
    if (reminder !== "none" && !dueDate) { toast.error("Para un recordatorio necesitas fijar una fecha"); return; }
    setSaving(true);
    const remind_at = computeRemindAt();
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      task_type: type,
      priority,
      due_date: dueDate || null,
      due_time: dueTime || null,
      contact_id: contactId,
      owner_id: ownerId,
      organization_id: organizationId,
      status: "pending",
      remind_at,
    } as any);
    setSaving(false);
    if (error) { toast.error("No se pudo crear la tarea: " + error.message); return; }
    toast.success(remind_at ? "Tarea creada — te avisaremos a tiempo ⏰" : "Tarea creada");
    reset();
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Llamar para dar seguimiento" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_TYPES.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Recordatorio</Label>
            <Select value={reminder} onValueChange={setReminder}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{REMINDERS.map(o => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {reminder !== "none" && (
              <p className="text-[11px] text-muted-foreground">Recibirás una notificación en tu dispositivo. Actívalas en la campanita si aún no lo has hecho.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Detalles de la tarea…" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Crear tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

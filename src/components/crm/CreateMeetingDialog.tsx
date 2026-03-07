import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CreateMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultDate?: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultContactId?: string;
}

const timeOptions: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of ["00", "15", "30", "45"]) {
    timeOptions.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

export function CreateMeetingDialog({
  open,
  onOpenChange,
  onCreated,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  defaultContactId,
}: CreateMeetingDialogProps) {
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [meetingType, setMeetingType] = useState("video_call");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(defaultDate || new Date());
      setStartTime(defaultStartTime || "09:00");
      setEndTime(defaultEndTime || "10:00");
      setMeetingType("video_call");
      setLocation("");
      setNotes("");
      setContactId(defaultContactId || "");

      supabase.from("contacts").select("id, full_name").order("full_name").then(({ data }) => {
        if (data) setContacts(data);
      });
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime, defaultContactId]);

  const handleCreate = async () => {
    if (!title.trim() || !date) {
      toast.error("Título y fecha son requeridos");
      return;
    }
    setSaving(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const { error } = await supabase.from("meetings").insert({
      title: title.trim(),
      start_at: `${dateStr}T${startTime}:00`,
      end_at: `${dateStr}T${endTime}:00`,
      meeting_type: meetingType,
      location_or_link: location.trim() || null,
      notes: notes.trim() || null,
      contact_id: contactId && contactId !== "none" ? contactId : null,
      advisor_id: session?.user?.id || null,
      status: "scheduled",
    });
    setSaving(false);
    if (error) {
      toast.error("Error al crear cita: " + error.message);
    } else {
      toast.success("Cita creada");
      onOpenChange(false);
      onCreated?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Nueva cita</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Reunión con cliente" />
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>Fecha *</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setDateOpen(false); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Hora inicio</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeOptions.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hora fin</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeOptions.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video_call">Videollamada</SelectItem>
                  <SelectItem value="in_person">Presencial</SelectItem>
                  <SelectItem value="phone_call">Llamada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Select value={contactId} onValueChange={setContactId}>
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
          <div className="space-y-2">
            <Label>Ubicación / Enlace</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="https://meet.google.com/..." />
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionales..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Crear cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

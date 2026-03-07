import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CreateMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultDate?: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  /** Pre-select a contact */
  defaultContactId?: string;
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
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [meetingType, setMeetingType] = useState("video_call");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
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
    const { error } = await supabase.from("meetings").insert({
      title: title.trim(),
      start_at: `${date}T${startTime}:00`,
      end_at: `${date}T${endTime}:00`,
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
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

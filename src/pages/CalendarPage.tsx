import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ChevronLeft, ChevronRight, Video, MapPin, Phone, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, addWeeks, subMonths, subWeeks,
  isSameMonth, isSameDay, isToday, startOfDay, endOfDay,
  setHours, setMinutes, parseISO
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type ViewMode = "month" | "week" | "day";

interface MeetingRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  meeting_type: string | null;
  location_or_link: string | null;
  notes: string | null;
  contact_id: string | null;
  deal_id: string | null;
  advisor_id: string | null;
}

const meetingTypeIcons: Record<string, React.ReactNode> = {
  video_call: <Video className="h-3 w-3" />,
  in_person: <MapPin className="h-3 w-3" />,
  phone_call: <Phone className="h-3 w-3" />,
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am-9pm

export default function CalendarPage() {
  const { session } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formType, setFormType] = useState("video_call");
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Contacts for linking
  const [contacts, setContacts] = useState<{ id: string; full_name: string }[]>([]);
  const [formContactId, setFormContactId] = useState("");

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, start_at, end_at, status, meeting_type, location_or_link, notes, contact_id, deal_id, advisor_id")
      .order("start_at", { ascending: true });
    if (!error && data) setMeetings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMeetings();
    supabase.from("contacts").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setContacts(data);
    });
  }, [fetchMeetings]);

  // Navigation
  const navigate = (dir: number) => {
    if (view === "month") setCurrentDate(prev => dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
    else if (view === "week") setCurrentDate(prev => dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    else setCurrentDate(prev => addDays(prev, dir));
  };

  const goToday = () => setCurrentDate(new Date());

  // Month grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = useMemo(() => {
    const result: Date[] = [];
    let day = calStart;
    while (day <= calEnd) { result.push(day); day = addDays(day, 1); }
    return result;
  }, [calStart.getTime(), calEnd.getTime()]);

  // Week grid
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]);

  const getMeetingsForDay = (day: Date) =>
    meetings.filter(m => isSameDay(parseISO(m.start_at), day));

  // Create meeting
  const openCreateDialog = (date?: Date) => {
    setFormTitle("");
    setFormDate(format(date || currentDate, "yyyy-MM-dd"));
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormType("video_call");
    setFormLocation("");
    setFormNotes("");
    setFormContactId("");
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDate) {
      toast.error("Título y fecha son requeridos");
      return;
    }
    setSaving(true);
    const startAt = `${formDate}T${formStartTime}:00`;
    const endAt = `${formDate}T${formEndTime}:00`;

    const { error } = await supabase.from("meetings").insert({
      title: formTitle.trim(),
      start_at: startAt,
      end_at: endAt,
      meeting_type: formType,
      location_or_link: formLocation.trim() || null,
      notes: formNotes.trim() || null,
      contact_id: formContactId || null,
      advisor_id: session?.user?.id || null,
      status: "scheduled",
    });

    setSaving(false);
    if (error) {
      toast.error("Error al crear cita: " + error.message);
    } else {
      toast.success("Cita creada");
      setDialogOpen(false);
      fetchMeetings();
    }
  };

  // Header title
  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : view === "week"
      ? `${format(weekDays[0], "d MMM", { locale: es })} – ${format(weekDays[6], "d MMM yyyy", { locale: es })}`
      : format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es });

  // Selected day meetings (sidebar)
  const selectedDayMeetings = getMeetingsForDay(currentDate);

  return (
    <AppLayout>
      <AppHeader
        title="Calendario"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => openCreateDialog()}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground capitalize">{headerLabel}</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {(["month", "week", "day"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {v === "month" ? "Mes" : v === "week" ? "Semana" : "Día"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              {/* ===== MONTH VIEW ===== */}
              {view === "month" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="grid grid-cols-7 border-b">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                      <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthDays.map((day, i) => {
                      const dayMeetings = getMeetingsForDay(day);
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      return (
                        <div
                          key={i}
                          onClick={() => setCurrentDate(day)}
                          onDoubleClick={() => openCreateDialog(day)}
                          className={cn(
                            "min-h-[80px] border-b border-r p-1 cursor-pointer transition-colors hover:bg-muted/50",
                            !isCurrentMonth && "opacity-40"
                          )}
                        >
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                            isToday(day) && "bg-primary text-primary-foreground",
                            isSameDay(day, currentDate) && !isToday(day) && "bg-accent text-accent-foreground"
                          )}>
                            {format(day, "d")}
                          </span>
                          {dayMeetings.slice(0, 2).map(m => (
                            <div key={m.id} className="mt-0.5 truncate rounded bg-primary/10 px-1 py-0.5 text-xs text-primary">
                              {format(parseISO(m.start_at), "HH:mm")} {m.title}
                            </div>
                          ))}
                          {dayMeetings.length > 2 && (
                            <p className="text-xs text-muted-foreground px-1">+{dayMeetings.length - 2} más</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== WEEK VIEW ===== */}
              {view === "week" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
                    <div className="p-2" />
                    {weekDays.map((day, i) => (
                      <div
                        key={i}
                        onClick={() => { setCurrentDate(day); setView("day"); }}
                        className={cn(
                          "px-2 py-2 text-center cursor-pointer hover:bg-muted/50 transition-colors",
                          isToday(day) && "bg-primary/5"
                        )}
                      >
                        <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: es })}</div>
                        <div className={cn(
                          "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                          isToday(day) && "bg-primary text-primary-foreground"
                        )}>
                          {format(day, "d")}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Time grid */}
                  <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                    {HOURS.map(hour => (
                      <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[48px]">
                        <div className="px-2 py-1 text-xs text-muted-foreground text-right pr-3 pt-0">
                          {String(hour).padStart(2, "0")}:00
                        </div>
                        {weekDays.map((day, di) => {
                          const dayMeetings = getMeetingsForDay(day).filter(m => {
                            const h = parseISO(m.start_at).getHours();
                            return h === hour;
                          });
                          return (
                            <div
                              key={di}
                              className="border-l px-1 py-0.5 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => {
                                setCurrentDate(day);
                                setFormStartTime(`${String(hour).padStart(2, "0")}:00`);
                                setFormEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                                openCreateDialog(day);
                              }}
                            >
                              {dayMeetings.map(m => (
                                <div key={m.id} className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary truncate mb-0.5">
                                  {format(parseISO(m.start_at), "HH:mm")} {m.title}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== DAY VIEW ===== */}
              {view === "day" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                    {HOURS.map(hour => {
                      const hourMeetings = getMeetingsForDay(currentDate).filter(m => {
                        const h = parseISO(m.start_at).getHours();
                        return h === hour;
                      });
                      return (
                        <div
                          key={hour}
                          className="grid grid-cols-[60px_1fr] border-b min-h-[52px] cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => {
                            setFormStartTime(`${String(hour).padStart(2, "0")}:00`);
                            setFormEndTime(`${String(hour + 1).padStart(2, "0")}:00`);
                            openCreateDialog(currentDate);
                          }}
                        >
                          <div className="px-2 py-1 text-xs text-muted-foreground text-right pr-3">
                            {String(hour).padStart(2, "0")}:00
                          </div>
                          <div className="border-l px-2 py-1 space-y-0.5">
                            {hourMeetings.map(m => (
                              <div key={m.id} className="rounded-md bg-primary/15 px-2 py-1.5 text-sm text-primary flex items-center gap-2">
                                {meetingTypeIcons[m.meeting_type || "video_call"]}
                                <span className="font-medium">{m.title}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {format(parseISO(m.start_at), "HH:mm")} – {format(parseISO(m.end_at), "HH:mm")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar: selected day */}
            <div className="w-full lg:w-80 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground capitalize">
                  {format(currentDate, "EEEE d 'de' MMMM", { locale: es })}
                </h3>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openCreateDialog(currentDate)}>
                  <Plus className="h-3.5 w-3.5" /> Crear
                </Button>
              </div>
              {selectedDayMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin citas este día</p>
              ) : (
                selectedDayMeetings.map(meeting => (
                  <Card key={meeting.id} className="p-3 border shadow-sm">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {meetingTypeIcons[meeting.meeting_type || "video_call"]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(meeting.start_at), "HH:mm")} - {format(parseISO(meeting.end_at), "HH:mm")}
                        </p>
                        {meeting.location_or_link && (
                          <p className="text-xs text-primary mt-1 truncate">{meeting.location_or_link}</p>
                        )}
                        <Badge variant="outline" className="mt-2 text-xs">{meeting.status}</Badge>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Create Meeting Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva cita</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ej: Reunión con cliente" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <Input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
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
            <div className="space-y-2">
              <Label>Ubicación / Enlace</Label>
              <Input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="https://meet.google.com/..." />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas adicionales..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crear cita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CreateMeetingDialog } from "@/components/crm/CreateMeetingDialog";
import { Plus, ChevronLeft, ChevronRight, Video, MapPin, Phone, Loader2, Pencil } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, addWeeks, subMonths, subWeeks,
  isSameMonth, isSameDay, isToday, parseISO
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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
  contact_name: string | null;
  google_event_id: string | null;
}

const meetingTypeIcons: Record<string, React.ReactNode> = {
  video_call: <Video className="h-3 w-3" />,
  in_person: <MapPin className="h-3 w-3" />,
  phone_call: <Phone className="h-3 w-3" />,
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6);

function getMeetingDisplayTitle(m: MeetingRow, t: TFunction) {
  if (m.contact_name) return t("calendarPage.meetingWithContact", { title: m.title, contact: m.contact_name });
  return m.title;
}

export default function CalendarPage() {
  const { isVendor, myUserId } = usePermissions();
  const { organizationId } = useOrganizationContext();
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date>(new Date());
  const [dialogStartTime, setDialogStartTime] = useState("09:00");
  const [dialogEndTime, setDialogEndTime] = useState("10:00");
  const [editingMeeting, setEditingMeeting] = useState<MeetingRow | null>(null);

  const fetchMeetings = useCallback(async () => {
    if (!organizationId) { setMeetings([]); setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from("meetings")
      .select("id, title, start_at, end_at, status, meeting_type, location_or_link, notes, contact_id, google_event_id, contacts(full_name)")
      .eq("organization_id", organizationId)
      .order("start_at", { ascending: true });
    if (isVendor && myUserId) query = query.eq("advisor_id", myUserId);
    const { data } = await query;
    if (data) {
      setMeetings(data.map((m: any) => ({
        ...m,
        contact_name: m.contacts?.full_name || null,
        google_event_id: m.google_event_id || null,
      })));
    }
    setLoading(false);
  }, [isVendor, myUserId, organizationId]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const navigate = (dir: number) => {
    if (view === "month") setCurrentDate(prev => dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
    else if (view === "week") setCurrentDate(prev => dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    else setCurrentDate(prev => addDays(prev, dir));
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = useMemo(() => {
    const r: Date[] = []; let d = calStart;
    while (d <= calEnd) { r.push(d); d = addDays(d, 1); }
    return r;
  }, [calStart.getTime(), calEnd.getTime()]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]);

  const getMeetingsForDay = (day: Date) => meetings.filter(m => isSameDay(parseISO(m.start_at), day));

  const openCreate = (date?: Date, startTime?: string, endTime?: string) => {
    setEditingMeeting(null);
    setDialogDate(date || currentDate);
    setDialogStartTime(startTime || "09:00");
    setDialogEndTime(endTime || "10:00");
    setDialogOpen(true);
  };

  const openEdit = (meeting: MeetingRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingMeeting(meeting);
    const start = parseISO(meeting.start_at);
    setDialogDate(start);
    setDialogStartTime(format(start, "HH:mm"));
    setDialogEndTime(format(parseISO(meeting.end_at), "HH:mm"));
    setDialogOpen(true);
  };

  const headerLabel = view === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : view === "week"
      ? `${format(weekDays[0], "d MMM", { locale: es })} – ${format(weekDays[6], "d MMM yyyy", { locale: es })}`
      : format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es });

  const selectedDayMeetings = getMeetingsForDay(currentDate);

  return (
    <AppLayout>
      <AppHeader title={t("calendarPage.title")} actions={
        <Button size="sm" className="gap-1.5" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" /> {t("calendarPage.newAppointment")}
        </Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground capitalize">{headerLabel}</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {(["month", "week", "day"] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}>
                  {v === "month" ? t("calendarPage.month") : v === "week" ? t("calendarPage.week") : t("calendarPage.day")}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>{t("calendarPage.today")}</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              {view === "month" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="grid grid-cols-7 border-b">
                    {["mon","tue","wed","thu","fri","sat","sun"].map(d => (
                      <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{t(`calendarPage.weekday_${d}`)}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthDays.map((day, i) => {
                      const dm = getMeetingsForDay(day);
                      const cur = isSameMonth(day, currentDate);
                      return (
                        <div key={i} onClick={() => setCurrentDate(day)} onDoubleClick={() => openCreate(day)}
                          className={cn("min-h-[80px] border-b border-r p-1 cursor-pointer transition-colors hover:bg-muted/50", !cur && "opacity-40")}>
                          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                            isToday(day) && "bg-primary text-primary-foreground",
                            isSameDay(day, currentDate) && !isToday(day) && "bg-accent text-accent-foreground"
                          )}>{format(day, "d")}</span>
                          {dm.slice(0, 2).map(m => (
                            <div key={m.id} onClick={(e) => openEdit(m, e)}
                              className="mt-0.5 truncate rounded bg-primary/10 px-1 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors">
                              {format(parseISO(m.start_at), "HH:mm")} {getMeetingDisplayTitle(m, t)}
                            </div>
                          ))}
                          {dm.length > 2 && <p className="text-xs text-muted-foreground px-1">{t("calendarPage.moreCount", { count: dm.length - 2 })}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {view === "week" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
                    <div className="p-2" />
                    {weekDays.map((day, i) => (
                      <div key={i} onClick={() => { setCurrentDate(day); setView("day"); }}
                        className={cn("px-2 py-2 text-center cursor-pointer hover:bg-muted/50 transition-colors", isToday(day) && "bg-primary/5")}>
                        <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: es })}</div>
                        <div className={cn("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                          isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</div>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                    {HOURS.map(hour => (
                      <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b min-h-[48px]">
                        <div className="px-2 py-1 text-xs text-muted-foreground text-right pr-3 pt-0">{String(hour).padStart(2,"0")}:00</div>
                        {weekDays.map((day, di) => {
                          const hm = getMeetingsForDay(day).filter(m => parseISO(m.start_at).getHours() === hour);
                          return (
                            <div key={di} className="border-l px-1 py-0.5 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => openCreate(day, `${String(hour).padStart(2,"0")}:00`, `${String(hour+1).padStart(2,"0")}:00`)}>
                              {hm.map(m => (
                                <div key={m.id} onClick={(e) => openEdit(m, e)}
                                  className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary truncate mb-0.5 hover:bg-primary/25 transition-colors">
                                  {format(parseISO(m.start_at), "HH:mm")} {getMeetingDisplayTitle(m, t)}
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

              {view === "day" && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                    {HOURS.map(hour => {
                      const hm = getMeetingsForDay(currentDate).filter(m => parseISO(m.start_at).getHours() === hour);
                      return (
                        <div key={hour} className="grid grid-cols-[60px_1fr] border-b min-h-[52px] cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => openCreate(currentDate, `${String(hour).padStart(2,"0")}:00`, `${String(hour+1).padStart(2,"0")}:00`)}>
                          <div className="px-2 py-1 text-xs text-muted-foreground text-right pr-3">{String(hour).padStart(2,"0")}:00</div>
                          <div className="border-l px-2 py-1 space-y-0.5">
                            {hm.map(m => (
                              <div key={m.id} onClick={(e) => openEdit(m, e)}
                                className="rounded-md bg-primary/15 px-2 py-1.5 text-sm text-primary flex items-center gap-2 hover:bg-primary/25 transition-colors">
                                {meetingTypeIcons[m.meeting_type || "video_call"]}
                                <span className="font-medium">{getMeetingDisplayTitle(m, t)}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {format(parseISO(m.start_at), "HH:mm")} – {format(parseISO(m.end_at), "HH:mm")}
                                </span>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
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

            <div className="w-full lg:w-80 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground capitalize">{format(currentDate, "EEEE d 'de' MMMM", { locale: es })}</h3>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openCreate(currentDate)}>
                  <Plus className="h-3.5 w-3.5" /> {t("calendarPage.create")}
                </Button>
              </div>
              {selectedDayMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("calendarPage.noAppointmentsThisDay")}</p>
              ) : selectedDayMeetings.map(meeting => (
                <Card key={meeting.id} className="p-3 border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openEdit(meeting)}>
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {meetingTypeIcons[meeting.meeting_type || "video_call"]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{getMeetingDisplayTitle(meeting, t)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(meeting.start_at), "HH:mm")} - {format(parseISO(meeting.end_at), "HH:mm")}
                      </p>
                      {meeting.location_or_link && <p className="text-xs text-primary mt-1 truncate">{meeting.location_or_link}</p>}
                      <Badge variant="outline" className="mt-2 text-xs">{meeting.status}</Badge>
                    </div>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      <CreateMeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchMeetings}
        defaultDate={dialogDate}
        defaultStartTime={dialogStartTime}
        defaultEndTime={dialogEndTime}
        editingMeeting={editingMeeting ? {
          id: editingMeeting.id,
          title: editingMeeting.title,
          meeting_type: editingMeeting.meeting_type,
          location_or_link: editingMeeting.location_or_link,
          notes: editingMeeting.notes,
          contact_id: editingMeeting.contact_id,
          status: editingMeeting.status,
        } : undefined}
      />
    </AppLayout>
  );
}

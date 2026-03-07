import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { mockMeetings } from "@/data/mock-data";
import { Plus, ChevronLeft, ChevronRight, Video, MapPin, Phone } from "lucide-react";
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, isSameMonth, isSameDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = 'month' | 'week' | 'day';

const meetingTypeIcons = {
  video_call: <Video className="h-3 w-3" />,
  in_person: <MapPin className="h-3 w-3" />,
  phone_call: <Phone className="h-3 w-3" />,
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date('2026-03-07'));
  const [view, setView] = useState<ViewMode>('month');

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const result = [];
    let day = calStart;
    while (day <= calEnd) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [calStart, calEnd]);

  const getMeetingsForDay = (day: Date) =>
    mockMeetings.filter(m => isSameDay(new Date(m.start_at), day));

  const navigate = (dir: number) => setCurrentDate(prev => addMonths(prev, dir));

  const todayMeetings = mockMeetings.filter(m => isSameDay(new Date(m.start_at), currentDate));

  return (
    <AppLayout>
      <AppHeader title="Calendario" actions={
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva cita</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Calendar grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {format(currentDate, "MMMM yyyy", { locale: es })}
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border">
                  {(['month', 'week', 'day'] as ViewMode[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium transition-colors",
                        view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Día'}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date('2026-03-07'))}>Hoy</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Month view */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="grid grid-cols-7 border-b">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                  <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day, i) => {
                  const dayMeetings = getMeetingsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const today = isToday(day);
                  return (
                    <div
                      key={i}
                      onClick={() => setCurrentDate(day)}
                      className={cn(
                        "min-h-[80px] border-b border-r p-1 cursor-pointer transition-colors hover:bg-muted/50",
                        !isCurrentMonth && "opacity-40"
                      )}
                    >
                      <span className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        today && "bg-primary text-primary-foreground",
                        isSameDay(day, currentDate) && !today && "bg-accent text-accent-foreground"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {dayMeetings.slice(0, 2).map(m => (
                        <div key={m.id} className="mt-0.5 truncate rounded bg-primary/10 px-1 py-0.5 text-xs text-primary">
                          {format(new Date(m.start_at), 'HH:mm')} {m.title}
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
          </div>

          {/* Day detail sidebar */}
          <div className="w-full lg:w-80 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {format(currentDate, "EEEE d 'de' MMMM", { locale: es })}
            </h3>
            {todayMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin citas este día</p>
            ) : (
              todayMeetings.map(meeting => (
                <Card key={meeting.id} className="p-3 border shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {meetingTypeIcons[meeting.meeting_type || 'video_call']}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(meeting.start_at), 'HH:mm')} - {format(new Date(meeting.end_at), 'HH:mm')}
                      </p>
                      {meeting.contact && (
                        <p className="text-xs text-muted-foreground mt-1">{meeting.contact.full_name}</p>
                      )}
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
      </main>
    </AppLayout>
  );
}

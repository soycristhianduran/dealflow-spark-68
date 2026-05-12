import type { Activity } from "@/types/crm";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Phone, MessageCircle, Mail, Calendar, FileText, ArrowRightLeft, Handshake, CheckSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const eventIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  note: <FileText className="h-3.5 w-3.5" />,
  stage_change: <ArrowRightLeft className="h-3.5 w-3.5" />,
  deal_created: <Handshake className="h-3.5 w-3.5" />,
  task_created: <CheckSquare className="h-3.5 w-3.5" />,
  system: <Settings className="h-3.5 w-3.5" />,
};

const eventColors: Record<string, string> = {
  call: "bg-primary/10 text-primary",
  whatsapp: "bg-success/10 text-success",
  email: "bg-primary/10 text-primary",
  meeting: "bg-warning/10 text-warning",
  note: "bg-muted text-muted-foreground",
  stage_change: "bg-primary/10 text-primary",
  deal_created: "bg-success/10 text-success",
  task_created: "bg-primary/10 text-primary",
  system: "bg-muted text-muted-foreground",
};

interface ActivityTimelineProps {
  activities: Activity[];
  onAddNote?: (text: string) => Promise<void> | void;
}

export function ActivityTimeline({ activities, onAddNote }: ActivityTimelineProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const sorted = [...activities].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleAdd = async () => {
    const text = note.trim();
    if (!text || !onAddNote) return;
    setSaving(true);
    try {
      await onAddNote(text);
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add note — the channel-specific buttons (Llamada/WhatsApp/Email) used to
          live here too but they did nothing.  Real interactions are auto-logged
          by the integrations (WhatsApp messages, automations, etc.) and the
          channel "actions" live in the contact sidebar's Acciones Rápidas card. */}
      <div className="space-y-2">
        <Textarea
          placeholder="Agregar una nota..."
          value={note}
          onChange={e => setNote(e.target.value)}
          className="min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Tip: <kbd className="px-1 py-0.5 rounded border bg-muted">⌘</kbd>+<kbd className="px-1 py-0.5 rounded border bg-muted">Enter</kbd> para guardar
          </p>
          <Button size="sm" disabled={!note.trim() || saving} onClick={handleAdd}>
            {saving ? "Guardando..." : "Agregar nota"}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {sorted.map((activity, i) => (
          <div key={activity.id} className="flex gap-3 pb-4">
            <div className="relative flex flex-col items-center">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${eventColors[activity.event_type] || 'bg-muted text-muted-foreground'}`}>
                {eventIcons[activity.event_type] || <FileText className="h-3.5 w-3.5" />}
              </div>
              {i < sorted.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm text-foreground">{activity.summary}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(activity.created_at), "d MMM yyyy, HH:mm", { locale: es })}
              </p>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin actividad registrada</p>
        )}
      </div>
    </div>
  );
}

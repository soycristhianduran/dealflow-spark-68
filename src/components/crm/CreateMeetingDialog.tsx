import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock, Loader2, Search, X, CalendarDays, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useTranslation } from "react-i18next";

interface EditingMeeting {
  id: string;
  title: string;
  meeting_type: string | null;
  location_or_link: string | null;
  notes: string | null;
  contact_id: string | null;
  status: string;
  google_event_id?: string | null;
}

interface CreateMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultDate?: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultContactId?: string;
  editingMeeting?: EditingMeeting;
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
  editingMeeting,
}: CreateMeetingDialogProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { organizationId } = useOrganizationContext();
  const gcal = useGoogleCalendar();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [meetingType, setMeetingType] = useState("video_call");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [contacts, setContacts] = useState<{ id: string; full_name: string; primary_email: string | null }[]>([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const [status, setStatus] = useState("scheduled");
  const [syncToGcal, setSyncToGcal] = useState(true);

  const isEditing = !!editingMeeting;

  useEffect(() => {
    if (open) {
      if (editingMeeting) {
        setTitle(editingMeeting.title);
        setMeetingType(editingMeeting.meeting_type || "video_call");
        setLocation(editingMeeting.location_or_link || "");
        setNotes(editingMeeting.notes || "");
        setContactId(editingMeeting.contact_id || "");
        setStatus(editingMeeting.status);
      } else {
        setTitle("");
        setMeetingType("video_call");
        setLocation("");
        setNotes("");
        setContactId(defaultContactId || "");
        setStatus("scheduled");
      }
      setDate(defaultDate || new Date());
      setStartTime(defaultStartTime || "09:00");
      setEndTime(defaultEndTime || "10:00");
      setContactSearch("");
      setSyncToGcal(true);

      {
        let cq = supabase.from("contacts").select("id, full_name, primary_email").order("full_name");
        if (organizationId) cq = cq.eq("organization_id", organizationId);
        cq.then(({ data }) => { if (data) setContacts(data); });
      }
    }
  }, [open, defaultDate, defaultStartTime, defaultEndTime, defaultContactId, editingMeeting]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.full_name.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const selectedContact = useMemo(() => {
    if (!contactId) return null;
    return contacts.find(c => c.id === contactId) || null;
  }, [contactId, contacts]);

  const handleSave = async () => {
    if (!title.trim() || !date) {
      toast.error(t("createMeetingDialog.titleAndDateRequired"));
      return;
    }
    setSaving(true);
    const dateStr = format(date, "yyyy-MM-dd");
    const payload = {
      title: title.trim(),
      start_at: `${dateStr}T${startTime}:00`,
      end_at: `${dateStr}T${endTime}:00`,
      meeting_type: meetingType,
      location_or_link: location.trim() || null,
      notes: notes.trim() || null,
      contact_id: contactId && contactId !== "none" ? contactId : null,
      status,
    };

    let meetingId: string | null = isEditing ? editingMeeting!.id : null;
    let error: { message: string } | null = null;

    if (isEditing) {
      ({ error } = await supabase.from("meetings").update(payload).eq("id", editingMeeting!.id));
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("meetings")
        .insert({ ...payload, advisor_id: session?.user?.id || null })
        .select("id")
        .single();
      error = insertErr;
      meetingId = inserted?.id ?? null;
    }

    if (!error) {
      const isVirtual = meetingType === "video_call";
      const gcalParams = {
        title: title.trim(),
        start_at: `${dateStr}T${startTime}:00`,
        end_at: `${dateStr}T${endTime}:00`,
        description: notes.trim() || undefined,
        location: location.trim() || undefined,
        attendee_email: selectedContact?.primary_email || undefined,
        // Virtual meeting with no manual link → generate a Google Meet link.
        create_meet: isVirtual && !location.trim(),
      };

      if (!isEditing && gcal.isConnected && syncToGcal && meetingId) {
        // Create new Google Calendar event and persist its ID on the meeting row
        const gcalResult = await gcal.createEvent(gcalParams);
        if (gcalResult?.google_event_id) {
          const upd: Record<string, unknown> = { google_event_id: gcalResult.google_event_id };
          if (gcalResult.meet_link && isVirtual && !location.trim()) upd.location_or_link = gcalResult.meet_link;
          await supabase.from("meetings").update(upd).eq("id", meetingId);
          toast.success(t("createMeetingDialog.alsoAddedToGoogleCalendar"), { icon: "📅" });
        }
      } else if (isEditing && gcal.isConnected && editingMeeting?.google_event_id) {
        // Update the existing Google Calendar event silently (don't regenerate Meet)
        await gcal.updateEvent(editingMeeting.google_event_id, { ...gcalParams, create_meet: false });
      }
    }

    setSaving(false);
    if (error) {
      toast.error(
        (isEditing
          ? t("createMeetingDialog.updateMeetingError")
          : t("createMeetingDialog.createMeetingError")) + `: ${error.message}`
      );
    } else {
      toast.success(isEditing ? t("createMeetingDialog.meetingUpdated") : t("createMeetingDialog.meetingCreated"));
      onOpenChange(false);
      onCreated?.();
    }
  };

  const handleDelete = async () => {
    if (!editingMeeting?.id) return;
    if (!confirm(t("createMeetingDialog.deleteConfirm"))) return;
    setDeleting(true);
    // Remove from Google Calendar first (best-effort), then from the CRM.
    if (editingMeeting.google_event_id && gcal.isConnected) {
      await gcal.deleteEvent(editingMeeting.google_event_id);
    }
    const { error } = await supabase.from("meetings").delete().eq("id", editingMeeting.id);
    setDeleting(false);
    if (error) {
      toast.error(t("createMeetingDialog.deleteMeetingError") + ": " + error.message);
    } else {
      toast.success(t("createMeetingDialog.meetingDeleted"));
      onOpenChange(false);
      onCreated?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("createMeetingDialog.editMeeting") : t("createMeetingDialog.newMeeting")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
          <div className="space-y-2">
            <Label>{t("createMeetingDialog.titleLabel")}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("createMeetingDialog.titlePlaceholder")} />
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>{t("createMeetingDialog.dateLabel")}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: es }) : t("createMeetingDialog.selectDate")}
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
              <Label>{t("createMeetingDialog.startTimeLabel")}</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("createMeetingDialog.endTimeLabel")}</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("createMeetingDialog.typeLabel")}</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video_call">{t("createMeetingDialog.typeVideoCall")}</SelectItem>
                  <SelectItem value="in_person">{t("createMeetingDialog.typeInPerson")}</SelectItem>
                  <SelectItem value="phone_call">{t("createMeetingDialog.typePhoneCall")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label>{t("createMeetingDialog.statusLabel")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{t("createMeetingDialog.statusScheduled")}</SelectItem>
                    <SelectItem value="completed">{t("createMeetingDialog.statusCompleted")}</SelectItem>
                    <SelectItem value="cancelled">{t("createMeetingDialog.statusCancelled")}</SelectItem>
                    <SelectItem value="no_show">{t("createMeetingDialog.statusNoShow")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Searchable contact selector */}
          <div className="space-y-2">
            <Label>{t("createMeetingDialog.contactLabel")}</Label>
            <div className="relative">
              {selectedContact && !contactDropdownOpen ? (
                <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{selectedContact.full_name}</span>
                  <button
                    type="button"
                    onClick={() => { setContactId(""); setContactSearch(""); }}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setContactDropdownOpen(true); }}
                    onFocus={() => setContactDropdownOpen(true)}
                    placeholder={t("createMeetingDialog.searchContactPlaceholder")}
                    className="pl-9"
                  />
                </div>
              )}
              {contactDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto scrollbar-thin">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => { setContactId(""); setContactSearch(""); setContactDropdownOpen(false); }}
                  >
                    {t("createMeetingDialog.noContact")}
                  </button>
                  {filteredContacts.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t("createMeetingDialog.noContactsFound")}</p>
                  ) : filteredContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors",
                        contactId === c.id && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => { setContactId(c.id); setContactSearch(""); setContactDropdownOpen(false); }}
                    >
                      {c.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("createMeetingDialog.locationLabel")}</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="https://meet.google.com/..." />
          </div>
          <div className="space-y-2">
            <Label>{t("createMeetingDialog.notesLabel")}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("createMeetingDialog.notesPlaceholder")} rows={2} />
          </div>

          {/* Google Calendar sync indicator / toggle */}
          {isEditing && gcal.isConnected && editingMeeting?.google_event_id && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t("createMeetingDialog.syncedWithGoogleCalendar")}</p>
                <p className="text-xs text-muted-foreground">{t("createMeetingDialog.changesUpdatedAutomatically")}</p>
              </div>
            </div>
          )}
          {!isEditing && gcal.isConnected && (
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                syncToGcal ? "border-primary/30 bg-primary/5" : "border-border"
              )}
              onClick={() => setSyncToGcal(!syncToGcal)}
            >
              <CalendarDays className={cn("h-5 w-5 shrink-0", syncToGcal ? "text-primary" : "text-muted-foreground")} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{t("createMeetingDialog.addToGoogleCalendar")}</p>
                <p className="text-xs text-muted-foreground">{t("createMeetingDialog.willBeCreatedAutomatically")}</p>
              </div>
              <div className={cn(
                "h-5 w-9 rounded-full transition-colors relative",
                syncToGcal ? "bg-primary" : "bg-muted"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  syncToGcal ? "translate-x-4" : "translate-x-0.5"
                )} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEditing ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={deleting || saving}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {t("createMeetingDialog.delete")}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("createMeetingDialog.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEditing ? t("createMeetingDialog.saveChanges") : t("createMeetingDialog.createMeeting")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

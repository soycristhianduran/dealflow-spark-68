import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ArrowLeft, DollarSign, Calendar, User, Target, Pencil, Trash2 } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import type { Activity } from "@/types/crm";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type DealFull = {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  pipeline_id: string | null;
  expected_close_date: string | null;
  close_probability: number | null;
  source: string | null;
  product: string | null;
  won_reason: string | null;
  lost_reason: string | null;
  contacts: { full_name: string } | null;
  pipeline_stages: { name: string; color: string; order: number } | null;
};

type Stage = { id: string; name: string; color: string; order: number };
type Contact = { id: string; full_name: string };

type Task = { id: string; title: string; priority: string; status: string; due_date: string | null };
type Meeting = { id: string; title: string; start_at: string; status: string };

export default function DealDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { organizationId } = useOrganizationContext();
  const { t } = useTranslation();
  const [deal, setDeal] = useState<DealFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", value: "", currency: "USD", contact_id: "", stage_id: "", expected_close_date: "", close_probability: "", source: "", product: "" });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchDeal = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("deals")
      .select("*, contacts(full_name), pipeline_stages(name, color, order)")
      .eq("id", id)
      .single();
    if (error || !data) { setLoading(false); return; }
    setDeal(data as unknown as DealFull);
    setEditForm({
      title: data.title,
      value: String(data.value),
      currency: data.currency,
      contact_id: data.contact_id || "",
      stage_id: data.stage_id || "",
      expected_close_date: data.expected_close_date || "",
      close_probability: data.close_probability != null ? String(data.close_probability) : "",
      source: data.source || "",
      product: data.product || "",
    });
    setLoading(false);
  };

  const fetchRelated = async () => {
    if (!id) return;
    const stagesQ = organizationId
      ? supabase.from("pipeline_stages").select("id, name, color, order").eq("organization_id", organizationId).order("order")
      : supabase.from("pipeline_stages").select("id, name, color, order").order("order");
    const contactsQ = organizationId
      ? supabase.from("contacts").select("id, full_name").eq("organization_id", organizationId).order("full_name").limit(200)
      : supabase.from("contacts").select("id, full_name").order("full_name").limit(200);
    const [stagesRes, contactsRes, activitiesRes, tasksRes, meetingsRes] = await Promise.all([
      stagesQ,
      contactsQ,
      supabase.from("activities").select("*").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id, title, priority, status, due_date").eq("deal_id", id).order("due_date"),
      supabase.from("meetings").select("id, title, start_at, status").eq("deal_id", id).order("start_at", { ascending: false }),
    ]);
    setStages(stagesRes.data || []);
    setContacts(contactsRes.data || []);
    setActivities((activitiesRes.data as unknown as Activity[]) || []);
    setTasks(tasksRes.data || []);
    setMeetings(meetingsRes.data || []);
  };

  useEffect(() => { fetchDeal(); fetchRelated(); }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("deals").update({
      title: editForm.title,
      value: Number(editForm.value) || 0,
      currency: editForm.currency,
      contact_id: editForm.contact_id && editForm.contact_id !== "none" ? editForm.contact_id : null,
      stage_id: editForm.stage_id || null,
      expected_close_date: editForm.expected_close_date || null,
      close_probability: editForm.close_probability ? Number(editForm.close_probability) : null,
      source: editForm.source || null,
      product: editForm.product || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { toast.error(t("dealDetailPage.saveError")); return; }
    toast.success(t("dealDetailPage.dealUpdated"));
    setEditOpen(false);
    fetchDeal();
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) { toast.error(t("dealDetailPage.deleteError")); return; }
    toast.success(t("dealDetailPage.dealDeleted"));
    navigate(path("/leads"));
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    try {
      if (newStatus === "won" || newStatus === "lost") {
        const { closeDeal } = await import("@/lib/deal-actions");
        await closeDeal(id, newStatus, deal?.contact_id || null);
      } else {
        const { reopenDeal } = await import("@/lib/deal-actions");
        await reopenDeal(id);
      }
      fetchDeal();
      fetchRelated();
      toast.success(t("dealDetailPage.dealStatusChanged", { status: newStatus === "won" ? t("dealDetailPage.statusWon") : newStatus === "lost" ? t("dealDetailPage.statusLost") : t("dealDetailPage.statusReopened") }));
    } catch (err: any) {
      toast.error(t("dealDetailPage.errorWithMessage", { message: err.message }));
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title={t("dealDetailPage.loadingTitle")} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t("dealDetailPage.loadingDeal")}</p>
        </main>
      </AppLayout>
    );
  }

  if (!deal) {
    return (
      <AppLayout>
        <AppHeader title={t("dealDetailPage.notFoundTitle")} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t("dealDetailPage.notFoundMessage")}</p>
        </main>
      </AppLayout>
    );
  }

  const currentStage = deal.pipeline_stages;

  return (
    <AppLayout>
      <AppHeader
        title={deal.title}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-4 w-4" /> {t("dealDetailPage.edit")}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(path('/leads'))} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t("dealDetailPage.back")}
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Deal info */}
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  {currentStage && (
                    <Badge variant="outline" className="text-sm" style={{ borderColor: currentStage.color, color: currentStage.color }}>
                      {currentStage.name}
                    </Badge>
                  )}
                  <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                    {deal.status === 'won' ? t("dealDetailPage.badgeWon") : deal.status === 'lost' ? t("dealDetailPage.badgeLost") : t("dealDetailPage.badgeOpen")}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-lg font-bold text-foreground">${Number(deal.value).toLocaleString()} {deal.currency}</span>
                  </div>
                  {deal.contacts && (
                    <div className="flex items-center gap-2 text-sm cursor-pointer" onClick={() => navigate(path(`/contacts/${deal.contact_id}`))}>
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-primary hover:underline">{deal.contacts.full_name}</span>
                    </div>
                  )}
                  {deal.expected_close_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{deal.expected_close_date}</span>
                    </div>
                  )}
                  {deal.close_probability != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground">{t("dealDetailPage.probability", { value: deal.close_probability })}</span>
                    </div>
                  )}
                  {deal.source && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("dealDetailPage.sourceLabel")} </span>
                      <span className="text-foreground">{deal.source}</span>
                    </div>
                  )}
                  {deal.product && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("dealDetailPage.productLabel")} </span>
                      <span className="text-foreground">{deal.product}</span>
                    </div>
                  )}
                </div>

                {/* Status actions */}
                {deal.status === "open" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="default" className="flex-1" onClick={() => handleStatusChange("won")}>{t("dealDetailPage.markWon")}</Button>
                    <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleStatusChange("lost")}>{t("dealDetailPage.markLost")}</Button>
                  </div>
                )}
                {deal.status !== "open" && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => handleStatusChange("open")}>{t("dealDetailPage.reopenDeal")}</Button>
                )}
              </CardContent>
            </Card>

            {/* Pipeline progress */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dealDetailPage.pipelineProgress")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {stages.filter(s => s.name !== "Cerrado perdido").map(stage => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${stage.order <= (currentStage?.order || 0) ? '' : 'opacity-30'}`} style={{ backgroundColor: stage.color }} />
                    <span className={`text-xs ${stage.id === deal.stage_id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {stage.name}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">{t("dealDetailPage.tabTimeline")}</TabsTrigger>
                <TabsTrigger value="tasks">{t("dealDetailPage.tabTasks", { count: tasks.length })}</TabsTrigger>
                <TabsTrigger value="meetings">{t("dealDetailPage.tabMeetings", { count: meetings.length })}</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline activities={activities} />
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                      task.priority === 'urgent' ? 'bg-destructive' :
                      task.priority === 'high' ? 'bg-warning' : 'bg-primary'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.due_date}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{task.status}</Badge>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{t("dealDetailPage.noTasks")}</p>}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {meetings.map(meeting => (
                  <Card key={meeting.id} className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(meeting.start_at).toLocaleString()}
                      </p>
                      <Badge variant="outline" className="mt-2 text-xs">{meeting.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
                {meetings.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{t("dealDetailPage.noMeetings")}</p>}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dealDetailPage.editDealTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("dealDetailPage.fieldTitle")}</Label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("dealDetailPage.fieldValue")}</Label>
                <Input type="number" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div>
                <Label>{t("dealDetailPage.fieldCurrency")}</Label>
                <Select value={editForm.currency} onValueChange={v => setEditForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="MXN">MXN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("dealDetailPage.fieldContact")}</Label>
              <Select value={editForm.contact_id} onValueChange={v => setEditForm(f => ({ ...f, contact_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("dealDetailPage.selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("dealDetailPage.noContact")}</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("dealDetailPage.fieldStage")}</Label>
              <Select value={editForm.stage_id} onValueChange={v => setEditForm(f => ({ ...f, stage_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("dealDetailPage.selectPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("dealDetailPage.fieldCloseDate")}</Label>
                <Input type="date" value={editForm.expected_close_date} onChange={e => setEditForm(f => ({ ...f, expected_close_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("dealDetailPage.fieldProbability")}</Label>
                <Input type="number" min="0" max="100" value={editForm.close_probability} onChange={e => setEditForm(f => ({ ...f, close_probability: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("dealDetailPage.fieldSource")}</Label>
                <Input value={editForm.source} onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))} />
              </div>
              <div>
                <Label>{t("dealDetailPage.fieldProduct")}</Label>
                <Input value={editForm.product} onChange={e => setEditForm(f => ({ ...f, product: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("dealDetailPage.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.title}>{saving ? t("dealDetailPage.saving") : t("dealDetailPage.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dealDetailPage.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dealDetailPage.deleteConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dealDetailPage.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("dealDetailPage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

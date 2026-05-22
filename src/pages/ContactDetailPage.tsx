import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Phone, Mail, ArrowLeft, MessageCircle, Calendar, MapPin, Megaphone, BarChart3, Loader2, Trash2, Cake, Pencil, Check, X, Plus, Settings2, KanbanSquare, Trophy, XCircle } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { CreateMeetingDialog } from "@/components/crm/CreateMeetingDialog";
import { AILeadAnalysisCard } from "@/components/crm/AILeadAnalysisCard";
import { ContactWhatsAppThread } from "@/components/crm/ContactWhatsAppThread";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { toast } from "sonner";

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editForm, setEditForm] = useState<{
    first_name: string; last_name: string; primary_phone: string; primary_email: string;
    birthday: string; customFields: Record<string, string>; newFieldKey: string; newFieldValue: string;
    pipeline_id: string; stage_id: string; budget: string; budget_currency: string; expected_close_date: string;
  }>({
    first_name: "", last_name: "", primary_phone: "", primary_email: "", birthday: "",
    customFields: {}, newFieldKey: "", newFieldValue: "",
    pipeline_id: "", stage_id: "", budget: "", budget_currency: "USD", expected_close_date: "",
  });
  const [activeTab, setActiveTab] = useState("timeline");

  // Pipeline state for stage dropdowns (loaded on demand when editing)
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stagesForPipeline, setStagesForPipeline] = useState<{ id: string; name: string; color: string; order: number }[]>([]);

  const startEditing = () => {
    setEditForm({
      first_name: contact?.first_name || "",
      last_name: contact?.last_name || "",
      primary_phone: contact?.primary_phone || "",
      primary_email: contact?.primary_email || "",
      birthday: contact?.birthday || "",
      customFields: contact?.custom_fields && typeof contact.custom_fields === "object" ? { ...(contact.custom_fields as Record<string, string>) } : {},
      newFieldKey: "",
      newFieldValue: "",
      pipeline_id: contact?.pipeline_id || "",
      stage_id: contact?.stage_id || "",
      budget: contact?.budget != null ? String(contact.budget) : "",
      budget_currency: contact?.budget_currency || "USD",
      expected_close_date: contact?.expected_close_date || "",
    });
    // Ensure pipeline list and stages are ready for the dropdowns
    if (!pipelines.length) loadPipelinesForEdit(contact?.pipeline_id);
    else if (contact?.pipeline_id && !stagesForPipeline.length) {
      supabase.from("pipeline_stages").select("id, name, color, order")
        .eq("pipeline_id", contact.pipeline_id).order("order", { ascending: true })
        .then(({ data }) => setStagesForPipeline(data || []));
    }
    setEditingContact(true);
  };

  const addCustomField = () => {
    const key = editForm.newFieldKey.trim();
    if (!key) return;
    const slug = key.toLowerCase().replace(/\s+/g, "_");
    setEditForm(p => ({ ...p, customFields: { ...p.customFields, [slug]: p.newFieldValue }, newFieldKey: "", newFieldValue: "" }));
  };

  const removeCustomField = (key: string) => {
    setEditForm(p => {
      const next = { ...p.customFields };
      delete next[key];
      return { ...p, customFields: next };
    });
  };

  const cancelEditing = () => {
    setEditingContact(false);
  };

  const saveContactInfo = async () => {
    if (!id) return;
    setSavingContact(true);
    const fullName = [editForm.first_name.trim(), editForm.last_name.trim()].filter(Boolean).join(" ") || contact.full_name;
    const prevStageId = contact?.stage_id;
    const { error } = await supabase.from("contacts").update({
      first_name: editForm.first_name.trim() || null,
      last_name: editForm.last_name.trim() || null,
      full_name: fullName,
      primary_phone: editForm.primary_phone.trim() || null,
      primary_email: editForm.primary_email.trim() || null,
      birthday: editForm.birthday || null,
      custom_fields: Object.keys(editForm.customFields).length > 0 ? editForm.customFields : null,
      pipeline_id: editForm.pipeline_id || null,
      stage_id: editForm.stage_id || null,
      budget: editForm.budget ? Number(editForm.budget) : null,
      budget_currency: editForm.budget_currency || "USD",
      expected_close_date: editForm.expected_close_date || null,
    }).eq("id", id);
    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      // Log stage change activity if stage moved
      if (editForm.stage_id && editForm.stage_id !== prevStageId) {
        const stageName = stagesForPipeline.find(s => s.id === editForm.stage_id)?.name || "";
        await supabase.from("activities").insert({
          related_entity_type: "contact", related_entity_id: id,
          event_type: "stage_changed", event_source: "contact_detail_inline",
          summary: `Etapa cambiada a "${stageName}"`,
        });
        supabase.functions.invoke("analyze-contact-ai", { body: { contact_id: id } }).catch(() => {});
      }
      toast.success("Lead actualizado");
      const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      setContact(data);
      setEditingContact(false);
    }
    setSavingContact(false);
  };

  const fetchRelated = async () => {
    if (!id) return;
    const [t, m, a] = await Promise.all([
      supabase.from("tasks").select("*").eq("contact_id", id),
      supabase.from("meetings").select("*").eq("contact_id", id).order("start_at", { ascending: false }),
      supabase.from("activities").select("*").eq("related_entity_id", id).order("created_at", { ascending: false }),
    ]);
    setTasks(t.data || []);
    setMeetings(m.data || []);
    setActivities(a.data || []);
  };

  const loadPipelinesForEdit = useCallback(async (currentPipelineId?: string) => {
    const { data } = await supabase.from("pipelines").select("id, name").order("created_at", { ascending: true });
    setPipelines(data || []);
    if (currentPipelineId) {
      const { data: stages } = await supabase.from("pipeline_stages").select("id, name, color, order").eq("pipeline_id", currentPipelineId).order("order", { ascending: true });
      setStagesForPipeline(stages || []);
    }
  }, []);

  const handlePipelineChange = async (newPipelineId: string) => {
    setEditForm(p => ({ ...p, pipeline_id: newPipelineId, stage_id: "" }));
    if (newPipelineId) {
      const { data: stages } = await supabase.from("pipeline_stages").select("id, name, color, order").eq("pipeline_id", newPipelineId).order("order", { ascending: true });
      setStagesForPipeline(stages || []);
    } else {
      setStagesForPipeline([]);
    }
  };

  // Re-fetches the contact row.  Extracted so the realtime hook can call it.
  const refetchContact = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    setContact(data);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    refetchContact().finally(() => setLoading(false));
    fetchRelated();
  }, [id, refetchContact]);

  // Pre-load stages when contact has a pipeline (for view-mode display)
  useEffect(() => {
    if (!contact?.pipeline_id) return;
    supabase.from("pipeline_stages").select("id, name, color, order")
      .eq("pipeline_id", contact.pipeline_id).order("order", { ascending: true })
      .then(({ data }) => setStagesForPipeline(data || []));
  }, [contact?.pipeline_id]);

  // ── Realtime: keep the page in sync with DB changes ──────────────────────
  // Contact row (score, status, etc.)
  useRealtimeRefresh({
    table: "contacts",
    filter: `id=eq.${id}`,
    channelKey: `contact-${id}`,
    onChange: refetchContact,
    enabled: !!id,
  });
  // Tasks (auto-created by AI, manual changes, etc.)
  useRealtimeRefresh({
    table: "tasks",
    filter: `contact_id=eq.${id}`,
    channelKey: `contact-tasks-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });
  // Meetings
  useRealtimeRefresh({
    table: "meetings",
    filter: `contact_id=eq.${id}`,
    channelKey: `contact-meetings-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });
  // Activities (timeline entries, new WhatsApp messages, etc.)
  useRealtimeRefresh({
    table: "activities",
    filter: `related_entity_id=eq.${id}`,
    channelKey: `contact-activities-${id}`,
    onChange: fetchRelated,
    enabled: !!id,
  });

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title="Cargando..." />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </AppLayout>
    );
  }

  if (!contact) {
    return (
      <AppLayout>
        <AppHeader title="Lead no encontrado" />
        <main className="flex-1 flex items-center justify-center flex-col gap-3">
          <p className="text-muted-foreground">El lead no existe.</p>
          <Button variant="outline" onClick={() => navigate(path('/contacts'))}>Volver a leads</Button>
        </main>
      </AppLayout>
    );
  }

  const currentStage = stagesForPipeline.find(s => s.id === contact.stage_id);
  const currentPipeline = pipelines.find(p => p.id === contact.pipeline_id);

  return (
    <AppLayout>
      <AppHeader
        title={contact.full_name}
        actions={
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará permanentemente a <strong>{contact.full_name}</strong> y no se podrá recuperar. Los deals, tareas y citas asociados no se eliminarán.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                    const { error } = await supabase.from("contacts").delete().eq("id", id!);
                    if (error) { toast.error("Error al eliminar: " + error.message); return; }
                    toast.success("Lead eliminado");
                    navigate(path("/contacts"));
                  }}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" onClick={() => navigate(path('/contacts'))} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                        {contact.full_name.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{contact.full_name}</h2>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {contact.lead_status === "won" && (
                          <Badge className="bg-green-500 text-white border-0 gap-1"><Trophy className="h-3 w-3" /> Ganado</Badge>
                        )}
                        {contact.lead_status === "lost" && (
                          <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Perdido</Badge>
                        )}
                        {currentStage && (
                          <Badge variant="outline" className="gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />
                            {currentStage.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {!editingContact ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2" onClick={startEditing}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={cancelEditing}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="default" className="h-7 text-xs px-2 gap-1" onClick={saveContactInfo} disabled={savingContact}>
                        <Check className="h-3 w-3" /> {savingContact ? "..." : "Guardar"}
                      </Button>
                    </div>
                  )}
                </div>

                {editingContact ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nombre</label>
                        <Input value={editForm.first_name} onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))} className="h-8 text-sm mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Apellido</label>
                        <Input value={editForm.last_name} onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))} className="h-8 text-sm mt-0.5" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Teléfono</label>
                      <Input value={editForm.primary_phone} onChange={e => setEditForm(p => ({ ...p, primary_phone: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder="+52 55 1234 5678" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Email</label>
                      <Input type="email" value={editForm.primary_email} onChange={e => setEditForm(p => ({ ...p, primary_email: e.target.value }))} className="h-8 text-sm mt-0.5" placeholder="email@ejemplo.com" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Cumpleaños</label>
                      <Input type="date" value={editForm.birthday} onChange={e => setEditForm(p => ({ ...p, birthday: e.target.value }))} className="h-8 text-sm mt-0.5" />
                    </div>

                    {/* Pipeline fields */}
                    <div className="pt-1 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><KanbanSquare className="h-3 w-3" /> Pipeline</p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Pipeline</label>
                          <Select value={editForm.pipeline_id || "none"} onValueChange={v => v === "none" ? setEditForm(p => ({ ...p, pipeline_id: "", stage_id: "" })) : handlePipelineChange(v)}>
                            <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Sin pipeline" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin pipeline</SelectItem>
                              {pipelines.map(pl => <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {editForm.pipeline_id && (
                          <div>
                            <label className="text-xs text-muted-foreground">Etapa</label>
                            <Select value={editForm.stage_id || "none"} onValueChange={v => setEditForm(p => ({ ...p, stage_id: v === "none" ? "" : v }))}>
                              <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Sin etapa" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin etapa</SelectItem>
                                {stagesForPipeline.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                      {s.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Presupuesto</label>
                            <Input type="number" min={0} value={editForm.budget} onChange={e => setEditForm(p => ({ ...p, budget: e.target.value }))} className="h-8 text-xs mt-0.5" placeholder="0" />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Moneda</label>
                            <Select value={editForm.budget_currency} onValueChange={v => setEditForm(p => ({ ...p, budget_currency: v }))}>
                              <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["USD","EUR","MXN","COP","ARS","BRL"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Fecha cierre estimada</label>
                          <Input type="date" value={editForm.expected_close_date} onChange={e => setEditForm(p => ({ ...p, expected_close_date: e.target.value }))} className="h-8 text-xs mt-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Custom fields */}
                    <div className="pt-1 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Settings2 className="h-3 w-3" /> Campos personalizados</p>
                      <div className="space-y-1.5">
                        {Object.entries(editForm.customFields).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground w-24 truncate shrink-0">{key}</span>
                            <Input
                              value={val}
                              onChange={e => setEditForm(p => ({ ...p, customFields: { ...p.customFields, [key]: e.target.value } }))}
                              className="h-7 text-xs flex-1"
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive" onClick={() => removeCustomField(key)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      {/* Add new field row */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <Input
                          placeholder="Nombre del campo"
                          value={editForm.newFieldKey}
                          onChange={e => setEditForm(p => ({ ...p, newFieldKey: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && addCustomField()}
                          className="h-7 text-xs flex-1"
                        />
                        <Input
                          placeholder="Valor"
                          value={editForm.newFieldValue}
                          onChange={e => setEditForm(p => ({ ...p, newFieldValue: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && addCustomField()}
                          className="h-7 text-xs flex-1"
                        />
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" onClick={addCustomField}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contact.primary_phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{contact.primary_phone}</span>
                      </div>
                    )}
                    {contact.primary_email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{contact.primary_email}</span>
                      </div>
                    )}
                    {contact.preferred_channel && (
                      <div className="flex items-center gap-2 text-sm">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground capitalize">{contact.preferred_channel}</span>
                      </div>
                    )}
                    {(contact.city || contact.country) && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{[contact.city, contact.country].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {contact.birthday && (
                      <div className="flex items-center gap-2 text-sm">
                        <Cake className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{new Date(contact.birthday + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                    )}
                    {contact.custom_fields && typeof contact.custom_fields === "object" && Object.keys(contact.custom_fields).length > 0 && (
                      <div className="pt-2 mt-1 border-t space-y-1.5">
                        {Object.entries(contact.custom_fields as Record<string, string>).map(([key, val]) => (
                          <div key={key} className="flex items-start justify-between gap-2 text-sm">
                            <span className="text-muted-foreground capitalize shrink-0">{key.replace(/_/g, " ")}:</span>
                            <span className="text-foreground text-right break-all">{val || "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pipeline summary */}
                    {(currentStage || currentPipeline || contact.budget != null) && (
                      <div className="pt-3 mt-2 border-t flex flex-wrap items-center gap-2">
                        <KanbanSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {currentStage ? (
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: currentStage.color }} />
                            {currentStage.name}
                          </Badge>
                        ) : currentPipeline ? (
                          <span className="text-xs text-muted-foreground">{currentPipeline.name}</span>
                        ) : null}
                        {contact.budget != null && (
                          <span className="text-xs font-semibold text-foreground">
                            ${Number(contact.budget).toLocaleString()} <span className="font-normal text-muted-foreground">{contact.budget_currency}</span>
                          </span>
                        )}
                        {contact.expected_close_date && (
                          <span className="text-xs text-muted-foreground">· {contact.expected_close_date}</span>
                        )}
                      </div>
                    )}

                    {/* Quick actions — always visible inside the card */}
                    <div className="pt-3 mt-2 border-t grid grid-cols-4 gap-1.5">
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        disabled={!contact.primary_phone}
                        onClick={() => { if (contact.primary_phone) window.location.href = `tel:${contact.primary_phone.replace(/[^+\d]/g, "")}`; }}
                        title={contact.primary_phone ? `Llamar a ${contact.primary_phone}` : "Sin teléfono"}
                      >
                        <Phone className="h-4 w-4" />
                        Llamar
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        disabled={!contact.primary_phone}
                        onClick={() => { if (contact.primary_phone) setActiveTab("whatsapp"); }}
                        title={contact.primary_phone ? "Abrir chat de WhatsApp" : "Sin teléfono"}
                      >
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        disabled={!contact.primary_email}
                        onClick={() => { if (contact.primary_email) { const s = `Hola ${contact.full_name?.split(" ")[0] || ""}`.trim(); window.location.href = `mailto:${contact.primary_email}?subject=${encodeURIComponent(s)}`; } }}
                        title={contact.primary_email ? `Email a ${contact.primary_email}` : "Sin email"}
                      >
                        <Mail className="h-4 w-4" />
                        Email
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="flex-col h-auto py-2 gap-1 text-xs"
                        onClick={() => setMeetingDialogOpen(true)}
                      >
                        <Calendar className="h-4 w-4" />
                        Agendar
                      </Button>
                    </div>
                  </div>
                )}

                {contact.score != null && (() => {
                  // Tier metadata — must mirror the contact_score_tier() SQL function
                  const tier =
                    contact.score >= 86 ? { label: "Listo para cerrar", emoji: "🟢", bar: "bg-green-500", badge: "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30" }
                    : contact.score >= 61 ? { label: "Caliente", emoji: "🟠", bar: "bg-orange-500", badge: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/30" }
                    : contact.score >= 31 ? { label: "Tibio", emoji: "🟡", bar: "bg-yellow-500", badge: "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30" }
                    : { label: "Frío", emoji: "🔵", bar: "bg-blue-500", badge: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30" };
                  return (
                    <div className="mt-4 p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Score</span>
                        <span className="text-sm font-bold text-foreground">{contact.score}/100</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${tier.bar}`} style={{ width: `${contact.score}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${tier.badge}`}>
                          <span>{tier.emoji}</span> {tier.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={async () => {
                            const { data, error } = await supabase.rpc("recalculate_contact_score", {
                              contact_uuid: id,
                            });
                            if (error) {
                              toast.error("Error al recalcular: " + error.message);
                            } else {
                              toast.success(`Score actualizado: ${data}/100`);
                              setContact((prev: any) => prev ? { ...prev, score: data } : prev);
                            }
                          }}
                          title="Recalcular score basado en última actividad"
                        >
                          <Settings2 className="h-3 w-3" /> Recalcular
                        </Button>
                      </div>
                      {contact.score_calculated_at && (
                        <p className="text-[10px] text-muted-foreground text-right">
                          Actualizado {new Date(contact.score_calculated_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* AI-powered conversation analysis */}
                <div className="mt-4">
                  <AILeadAnalysisCard
                    contactId={id!}
                    onAnalysisComplete={(newScore) =>
                      setContact((prev: any) => prev ? { ...prev, score: newScore } : prev)
                    }
                  />
                </div>

                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {contact.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="tasks">Tareas ({tasks.length})</TabsTrigger>
                <TabsTrigger value="meetings">Citas ({meetings.length})</TabsTrigger>
                {contact.primary_phone && (
                  <TabsTrigger value="whatsapp">
                    <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="timeline" className="mt-4">
                <ActivityTimeline
                  activities={activities}
                  onAddNote={async (text) => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                      toast.error("Tu sesión expiró. Vuelve a iniciar sesión.");
                      return;
                    }
                    const { error } = await supabase.from("activities").insert({
                      related_entity_type: "contact",
                      related_entity_id: id,
                      event_type: "note",
                      event_source: "manual",
                      summary: text,
                      created_by: user.id,
                    });
                    if (error) {
                      toast.error("No se pudo guardar la nota: " + error.message);
                      return;
                    }
                    toast.success("Nota guardada");
                    fetchRelated();
                  }}
                />
              </TabsContent>

              <TabsContent value="info" className="mt-4 space-y-4">
                {contact.source && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5" /> Origen y campaña
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Origen" value={contact.source} />
                        <InfoItem label="Campaña" value={contact.campaign} />
                        <InfoItem label="Ad Set" value={contact.adset} />
                        <InfoItem label="Anuncio" value={contact.ad} />
                        <InfoItem label="Landing Page" value={contact.landing_page} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(contact.utm_source || contact.utm_medium || contact.utm_campaign) && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" /> UTM
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="utm_source" value={contact.utm_source} />
                        <InfoItem label="utm_medium" value={contact.utm_medium} />
                        <InfoItem label="utm_campaign" value={contact.utm_campaign} />
                        <InfoItem label="utm_content" value={contact.utm_content} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fechas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoItem label="Cumpleaños" value={contact.birthday ? new Date(contact.birthday + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} />
                      <InfoItem label="Creado" value={new Date(contact.created_at).toLocaleString()} />
                      <InfoItem label="Actualizado" value={new Date(contact.updated_at).toLocaleString()} />
                      <InfoItem label="Último contacto" value={contact.last_contact_at ? new Date(contact.last_contact_at).toLocaleString() : undefined} />
                      <InfoItem label="Próxima acción" value={contact.next_action_at ? new Date(contact.next_action_at).toLocaleString() : undefined} />
                    </div>
                  </CardContent>
                </Card>

              </TabsContent>

              {contact.primary_phone && (
                <TabsContent value="whatsapp" className="mt-4">
                  <ContactWhatsAppThread
                    phone={contact.primary_phone}
                    contactId={contact.id}
                    contactName={contact.full_name}
                  />
                </TabsContent>
              )}

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {tasks.length > 0 ? tasks.map(task => (
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
                )) : (
                  <EmptyState
                    variant="tasks"
                    title="Sin tareas asociadas"
                    description="Las tareas que crees para este contacto (follow-up, llamada, etc.) aparecerán aquí."
                  />
                )}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {meetings.length > 0 ? meetings.map(meeting => (
                  <Card key={meeting.id} className="border shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(meeting.start_at).toLocaleString()} - {new Date(meeting.end_at).toLocaleTimeString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">{meeting.status}</Badge>
                        {meeting.meeting_type && <Badge variant="secondary" className="text-xs">{meeting.meeting_type}</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                )) : (
                  <EmptyState
                    variant="meetings"
                    title="Sin citas asociadas"
                    description="Agenda una llamada o reunión con este contacto desde el botón 'Agendar' arriba."
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <CreateMeetingDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        onCreated={fetchRelated}
        defaultContactId={id}
      />
    </AppLayout>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value || '—'}</p>
    </div>
  );
}

function CustomFieldsCard({ customFields, contactId, onUpdated }: { customFields?: Record<string, string> | null; contactId: string; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields(customFields && typeof customFields === 'object' ? { ...customFields } as Record<string, string> : {});
  }, [customFields]);

  const hasFields = Object.keys(fields).length > 0;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("contacts").update({ custom_fields: fields }).eq("id", contactId);
    if (error) toast.error("Error al guardar campos");
    else { toast.success("Campos guardados"); onUpdated(); }
    setSaving(false);
    setEditing(false);
  };

  const handleAddField = () => {
    if (!newKey.trim()) return;
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    setFields(prev => ({ ...prev, [key]: newValue }));
    setNewKey("");
    setNewValue("");
  };

  const handleRemoveField = (key: string) => {
    setFields(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  if (!hasFields && !editing) {
    return (
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Campos personalizados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">Sin campos personalizados</p>
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setEditing(true)}>
              <Plus className="h-3 w-3" /> Agregar campo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Campos personalizados
          </CardTitle>
          {!editing ? (
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditing(false); setFields(customFields && typeof customFields === 'object' ? { ...customFields } as Record<string, string> : {}); }}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="default" className="h-6 text-xs px-2 gap-1" onClick={handleSave} disabled={saving}>
                <Check className="h-3 w-3" /> Guardar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(fields).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            {editing ? (
              <>
                <span className="text-xs text-muted-foreground font-mono w-28 truncate shrink-0">{key}</span>
                <Input
                  value={value}
                  onChange={(e) => setFields(prev => ({ ...prev, [key]: e.target.value }))}
                  className="h-7 text-xs flex-1"
                />
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive" onClick={() => handleRemoveField(key)}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{value || "—"}</p>
              </div>
            )}
          </div>
        ))}

        {editing && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Input placeholder="Nombre del campo" value={newKey} onChange={e => setNewKey(e.target.value)} className="h-7 text-xs flex-1" />
            <Input placeholder="Valor" value={newValue} onChange={e => setNewValue(e.target.value)} className="h-7 text-xs flex-1" />
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1" onClick={handleAddField} disabled={!newKey.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

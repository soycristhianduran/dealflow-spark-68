import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Send, Mail, Loader2, Trash2, Eye, Users, CheckCircle2,
  AlertCircle, Clock, BarChart3, X, TestTube2
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  html_content: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "paused";
  recipient_filter: { type: "all" | "tag"; value?: string };
  total_recipients: number;
  sent_count: number;
  opened_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

const STATUS_MAP = {
  draft:     { label: "Borrador",  color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Programada", color: "bg-blue-100 text-blue-700" },
  sending:   { label: "Enviando…",  color: "bg-amber-100 text-amber-700" },
  sent:      { label: "Enviada",    color: "bg-green-100 text-green-700" },
  paused:    { label: "Pausada",    color: "bg-red-100 text-red-700" },
};

const EMPTY: Partial<Campaign> = {
  name: "", subject: "", from_name: "", from_email: "", html_content: "",
  recipient_filter: { type: "all" },
};

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<Partial<Campaign>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Error al cargar campañas");
    else setCampaigns((data || []) as Campaign[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Estimate recipient count
  useEffect(() => {
    if (!showDialog) return;
    const filter = form.recipient_filter;
    (async () => {
      let q = supabase.from("contacts").select("id", { count: "exact", head: true })
        .not("primary_email", "is", null).neq("primary_email", "");
      if (filter?.type === "tag" && filter.value) q = q.contains("tags", [filter.value]);
      const { count } = await q;
      setContactCount(count);
    })();
  }, [form.recipient_filter, showDialog]);

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.html_content) {
      toast.error("Nombre, asunto y contenido son obligatorios");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await supabase.from("email_campaigns").update({
          name: form.name, subject: form.subject, from_name: form.from_name,
          from_email: form.from_email, html_content: form.html_content,
          recipient_filter: form.recipient_filter, updated_at: new Date().toISOString(),
        }).eq("id", form.id);
        toast.success("Campaña guardada");
      } else {
        await supabase.from("email_campaigns").insert({
          name: form.name, subject: form.subject, from_name: form.from_name || "",
          from_email: form.from_email || "", html_content: form.html_content,
          recipient_filter: form.recipient_filter || { type: "all" }, status: "draft",
        });
        toast.success("Campaña creada");
      }
      setShowDialog(false);
      setForm(EMPTY);
      fetchCampaigns();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleSend = async (campaign: Campaign) => {
    if (!confirm(`¿Enviar la campaña "${campaign.name}" a ${contactCount ?? "todos los"} contactos con email? Esta acción no se puede deshacer.`)) return;
    setSending(campaign.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: { action: "send_campaign", campaign_id: campaign.id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Campaña enviada — ${data.sent} enviados, ${data.failed} fallidos`);
      fetchCampaigns();
    } catch (e: any) { toast.error("Error al enviar: " + e.message); }
    finally { setSending(null); }
  };

  const handleTestSend = async () => {
    if (!testEmail || !selectedCampaign) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          action: "test_send",
          to: testEmail,
          subject: selectedCampaign.subject,
          html: selectedCampaign.html_content,
          from_name: selectedCampaign.from_name,
          from_email: selectedCampaign.from_email,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Email de prueba enviado a ${testEmail}`);
      setShowTest(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta campaña?")) return;
    await supabase.from("email_campaigns").delete().eq("id", id);
    fetchCampaigns();
    toast.success("Campaña eliminada");
  };

  const openEdit = (c: Campaign) => { setForm(c); setShowDialog(true); };
  const openNew = () => { setForm(EMPTY); setShowDialog(true); };

  return (
    <AppLayout>
      <AppHeader title="Campañas de Email" />

      {/* Info banner if no Resend key */}
      <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Para enviar emails necesitas una cuenta en{" "}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com</a>{" "}
          (gratis hasta 3.000 emails/mes). Luego ve a <strong>Supabase → Edge Functions → Secrets</strong> y añade{" "}
          <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code>.
        </span>
      </div>

      <div className="flex-1 p-6 space-y-4 overflow-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{campaigns.length} campaña{campaigns.length !== 1 ? "s" : ""}</p>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nueva campaña
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Mail className="h-14 w-14 text-muted-foreground/30" />
            <h3 className="font-semibold text-lg">Sin campañas</h3>
            <p className="text-muted-foreground text-sm max-w-xs">Crea tu primera campaña de email y envíala a tus contactos.</p>
            <Button onClick={openNew} className="mt-2"><Plus className="h-4 w-4 mr-1" /> Nueva campaña</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {campaigns.map((c) => {
              const s = STATUS_MAP[c.status] || STATUS_MAP.draft;
              const sentPct = c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
              const openPct = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
              return (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{c.name}</p>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", s.color)}>{s.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.subject}</p>
                    {c.status === "sent" && (
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span><Users className="h-3 w-3 inline mr-0.5" />{c.total_recipients} destinatarios</span>
                        <span><Send className="h-3 w-3 inline mr-0.5" />{sentPct}% enviado</span>
                        <span><Eye className="h-3 w-3 inline mr-0.5" />{openPct}% abierto</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEdit(c)}>
                      Editar
                    </Button>
                    {(c.status === "draft" || c.status === "paused") && (
                      <>
                        <Button
                          variant="ghost" size="sm" className="h-8 text-xs"
                          onClick={() => { setSelectedCampaign(c); setShowTest(true); }}
                        >
                          <TestTube2 className="h-3.5 w-3.5 mr-1" /> Prueba
                        </Button>
                        <Button
                          size="sm" className="h-8 text-xs"
                          disabled={sending === c.id}
                          onClick={() => handleSend(c)}
                        >
                          {sending === c.id
                            ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Enviando</>
                            : <><Send className="h-3.5 w-3.5 mr-1" />Enviar</>}
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={() => { setShowDialog(false); setForm(EMPTY); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Nombre interno <span className="text-red-500">*</span></Label>
                <Input placeholder="Ej: Newsletter Mayo 2026" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Asunto <span className="text-red-500">*</span></Label>
                <Input placeholder="Hola {{contact.first_name}}, te tenemos algo especial…" value={form.subject || ""} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del remitente</Label>
                <Input placeholder="Tu nombre o empresa" value={form.from_name || ""} onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email del remitente</Label>
                <Input placeholder="tu@dominio.com" type="email" value={form.from_email || ""} onChange={e => setForm(f => ({ ...f, from_email: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Debe ser un dominio verificado en Resend. Deja vacío para usar el de prueba.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Destinatarios</Label>
              <Select
                value={form.recipient_filter?.type || "all"}
                onValueChange={(v) => setForm(f => ({ ...f, recipient_filter: { type: v as "all" | "tag" } }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los contactos con email</SelectItem>
                  <SelectItem value="tag">Filtrar por etiqueta</SelectItem>
                </SelectContent>
              </Select>
              {form.recipient_filter?.type === "tag" && (
                <Input
                  placeholder="Nombre de la etiqueta exacta"
                  value={form.recipient_filter?.value || ""}
                  onChange={e => setForm(f => ({ ...f, recipient_filter: { type: "tag", value: e.target.value } }))}
                />
              )}
              {contactCount != null && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> {contactCount} contacto{contactCount !== 1 ? "s" : ""} recibirán esta campaña
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Contenido HTML <span className="text-red-500">*</span></Label>
              <p className="text-xs text-muted-foreground">
                Usa variables: <code className="bg-muted px-1 rounded">{"{{contact.first_name}}"}</code>{" "}
                <code className="bg-muted px-1 rounded">{"{{contact.last_name}}"}</code>{" "}
                <code className="bg-muted px-1 rounded">{"{{contact.email}}"}</code>{" "}
                <code className="bg-muted px-1 rounded">{"{{contact.company}}"}</code>
              </p>
              <Textarea
                placeholder={`<h1>Hola {{contact.first_name}}</h1>\n<p>Te escribimos para...</p>`}
                value={form.html_content || ""}
                onChange={e => setForm(f => ({ ...f, html_content: e.target.value }))}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setForm(EMPTY); }}>Cancelar</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando</> : "Guardar borrador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test send dialog */}
      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar email de prueba</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Envía un email de prueba a tu dirección para revisar cómo se verá.</p>
            <Input placeholder="tu@email.com" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTest(false)}>Cancelar</Button>
            <Button disabled={saving || !testEmail} onClick={handleTestSend}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><TestTube2 className="h-4 w-4 mr-1" />Enviar prueba</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

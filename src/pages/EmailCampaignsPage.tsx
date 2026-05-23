import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, MessageSquare, Users, Eye, XCircle, Loader2,
  ChevronRight, MousePointerClick, CheckCircle2, RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmailCampaign {
  id: string; name: string; subject: string; status: string;
  sent_at: string | null; total_recipients: number;
  sent_count: number; opened_count: number; clicked_count: number; failed_count: number;
  from_name: string; from_email: string;
}
interface WaCampaign {
  id: string; name: string; template_name: string | null; status: string;
  sent_at: string; total_recipients: number;
  sent_count: number; failed_count: number; delivered_count: number; read_count: number;
}
interface EmailSendRow {
  id: string; email_address: string; status: string;
  sent_at: string | null; opened_at: string | null; clicked_at: string | null;
  error_message: string | null; contacts: { full_name: string | null } | null;
}
interface WaSendRow {
  id: string; phone: string; status: string;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  error_message: string | null; contacts: { full_name: string | null } | null;
}
type TabType = "email" | "whatsapp";

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct = (n: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy, HH:mm", { locale: es }); } catch { return d; }
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    sent: "Enviado", opened: "Abierto", clicked: "Clic", failed: "Fallido",
    delivered: "Entregado", read: "Leído", pending: "Pendiente",
  };
  return m[s] ?? s;
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-blue-400", opened: "bg-green-500", clicked: "bg-purple-500",
    failed: "bg-red-400", delivered: "bg-teal-400", read: "bg-green-500", pending: "bg-gray-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? "bg-gray-300"}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    sending: "bg-amber-100 text-amber-700",
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    failed: "bg-red-100 text-red-600",
  };
  const labels: Record<string, string> = { sent: "Enviada", sending: "Enviando…", draft: "Borrador", failed: "Error" };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400", green: "text-green-600 dark:text-green-400",
    purple: "text-purple-600 dark:text-purple-400", red: "text-red-500",
    teal: "text-teal-600 dark:text-teal-400",
  };
  return (
    <div className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5">
      <span className={colorMap[color]}>{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg px-4 py-2.5 min-w-[90px] ${color}`}>
      <div className="flex items-center gap-1 opacity-70 mb-0.5">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      {icon}<div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground mt-1 max-w-xs">{desc}</p></div>
    </div>
  );
}

// ── Campaign rows ─────────────────────────────────────────────────────────────
function EmailCampaignRow({ campaign: c, onClick }: { campaign: EmailCampaign; onClick: () => void }) {
  const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-4 group">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
        <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm truncate">{c.name}</p><StatusBadge status={c.status} /></div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{c.subject} · {c.from_email}</p>
        <p className="text-xs text-muted-foreground">{fmtDate(c.sent_at)}</p>
      </div>
      <div className="hidden md:flex items-center gap-5 shrink-0 text-sm">
        <div className="text-center"><p className="font-semibold">{c.sent_count}</p><p className="text-[11px] text-muted-foreground">enviados</p></div>
        <div className="text-center"><p className="font-semibold text-green-600">{c.opened_count} <span className="text-xs font-normal text-muted-foreground">({openRate}%)</span></p><p className="text-[11px] text-muted-foreground">abiertos</p></div>
        <div className="text-center"><p className="font-semibold text-purple-600">{c.clicked_count}</p><p className="text-[11px] text-muted-foreground">clics</p></div>
        {c.failed_count > 0 && <div className="text-center"><p className="font-semibold text-red-500">{c.failed_count}</p><p className="text-[11px] text-muted-foreground">fallidos</p></div>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
    </button>
  );
}

function WaCampaignRow({ campaign: c, onClick }: { campaign: WaCampaign; onClick: () => void }) {
  const readRate = c.sent_count > 0 ? Math.round((c.read_count / c.sent_count) * 100) : 0;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-4 group">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950">
        <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm truncate">{c.name}</p><StatusBadge status={c.status} /></div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">Plantilla: {c.template_name || "—"}</p>
        <p className="text-xs text-muted-foreground">{fmtDate(c.sent_at)}</p>
      </div>
      <div className="hidden md:flex items-center gap-5 shrink-0 text-sm">
        <div className="text-center"><p className="font-semibold">{c.sent_count}</p><p className="text-[11px] text-muted-foreground">enviados</p></div>
        <div className="text-center"><p className="font-semibold text-teal-600">{c.delivered_count}</p><p className="text-[11px] text-muted-foreground">entregados</p></div>
        <div className="text-center"><p className="font-semibold text-green-600">{c.read_count} <span className="text-xs font-normal text-muted-foreground">({readRate}%)</span></p><p className="text-[11px] text-muted-foreground">leídos</p></div>
        {c.failed_count > 0 && <div className="text-center"><p className="font-semibold text-red-500">{c.failed_count}</p><p className="text-[11px] text-muted-foreground">fallidos</p></div>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [tab, setTab] = useState<TabType>("email");
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [waCampaigns, setWaCampaigns] = useState<WaCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<EmailCampaign | WaCampaign | null>(null);
  const [detailType, setDetailType] = useState<TabType>("email");
  const [detailRows, setDetailRows] = useState<(EmailSendRow | WaSendRow)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    const [emailRes, waRes] = await Promise.all([
      supabase.from("email_campaigns")
        .select("id,name,subject,status,sent_at,total_recipients,sent_count,opened_count,clicked_count,failed_count,from_name,from_email")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("whatsapp_campaigns")
        .select("id,name,template_name,status,sent_at,total_recipients,sent_count,failed_count,delivered_count,read_count")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (emailRes.data) setEmailCampaigns(emailRes.data as EmailCampaign[]);
    if (waRes.data) setWaCampaigns(waRes.data as WaCampaign[]);
    if (showSpinner) setLoading(false); else setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (campaign: EmailCampaign | WaCampaign, type: TabType) => {
    setDetailCampaign(campaign); setDetailType(type); setDetailRows([]); setDetailLoading(true);
    if (type === "email") {
      const { data } = await supabase.from("email_sends")
        .select("id,email_address,status,sent_at,opened_at,clicked_at,error_message,contacts(full_name)")
        .eq("campaign_id", campaign.id).order("sent_at", { ascending: true });
      setDetailRows((data || []) as EmailSendRow[]);
    } else {
      const { data } = await supabase.from("whatsapp_sends")
        .select("id,phone,status,sent_at,delivered_at,read_at,error_message,contacts(full_name)")
        .eq("campaign_id", campaign.id).order("sent_at", { ascending: true });
      setDetailRows((data || []) as WaSendRow[]);
    }
    setDetailLoading(false);
  };

  const emailTotals = emailCampaigns.reduce((a, c) => ({
    sent: a.sent + c.sent_count, opened: a.opened + c.opened_count,
    clicked: a.clicked + c.clicked_count, failed: a.failed + c.failed_count,
  }), { sent: 0, opened: 0, clicked: 0, failed: 0 });

  const waTotals = waCampaigns.reduce((a, c) => ({
    sent: a.sent + c.sent_count, delivered: a.delivered + c.delivered_count,
    read: a.read + c.read_count, failed: a.failed + c.failed_count,
  }), { sent: 0, delivered: 0, read: 0, failed: 0 });

  return (
    <AppLayout>
      <AppHeader
        title="Campañas"
        subtitle="Estadísticas de todos los envíos masivos"
        actions={
          <Button variant="outline" size="sm" onClick={() => load(false)} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">

        {/* Tab toggle */}
        <div className="flex gap-2">
          <button onClick={() => setTab("email")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "email" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            <Mail className="h-4 w-4" /> Email ({emailCampaigns.length})
          </button>
          <button onClick={() => setTab("whatsapp")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "whatsapp" ? "bg-green-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            <MessageSquare className="h-4 w-4" /> WhatsApp ({waCampaigns.length})
          </button>
        </div>

        {/* Summary stats */}
        {tab === "email" && emailCampaigns.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Users className="h-3 w-3" />} label="Enviados" value={emailTotals.sent.toLocaleString()} color="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
            <StatPill icon={<Eye className="h-3 w-3" />} label="Abiertos" value={`${emailTotals.opened} (${pct(emailTotals.opened, emailTotals.sent)})`} color="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" />
            <StatPill icon={<MousePointerClick className="h-3 w-3" />} label="Clics" value={`${emailTotals.clicked} (${pct(emailTotals.clicked, emailTotals.sent)})`} color="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" />
            <StatPill icon={<XCircle className="h-3 w-3" />} label="Fallidos" value={emailTotals.failed} color="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" />
          </div>
        )}
        {tab === "whatsapp" && waCampaigns.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Users className="h-3 w-3" />} label="Enviados" value={waTotals.sent.toLocaleString()} color="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
            <StatPill icon={<CheckCircle2 className="h-3 w-3" />} label="Entregados" value={`${waTotals.delivered} (${pct(waTotals.delivered, waTotals.sent)})`} color="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300" />
            <StatPill icon={<Eye className="h-3 w-3" />} label="Leídos" value={`${waTotals.read} (${pct(waTotals.read, waTotals.sent)})`} color="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" />
            <StatPill icon={<XCircle className="h-3 w-3" />} label="Fallidos" value={waTotals.failed} color="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" />
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando campañas…
          </div>
        ) : tab === "email" ? (
          emailCampaigns.length === 0
            ? <EmptyState icon={<Mail className="h-10 w-10 text-muted-foreground/40" />} title="Sin campañas de email" desc="Los envíos masivos desde el pipeline aparecerán aquí con sus estadísticas." />
            : <div className="space-y-2">{emailCampaigns.map(c => <EmailCampaignRow key={c.id} campaign={c} onClick={() => openDetail(c, "email")} />)}</div>
        ) : (
          waCampaigns.length === 0
            ? <EmptyState icon={<MessageSquare className="h-10 w-10 text-muted-foreground/40" />} title="Sin campañas de WhatsApp" desc="Los envíos masivos de WhatsApp desde el pipeline aparecerán aquí." />
            : <div className="space-y-2">{waCampaigns.map(c => <WaCampaignRow key={c.id} campaign={c} onClick={() => openDetail(c, "whatsapp")} />)}</div>
        )}
      </div>

      {/* Detail modal */}
      <Dialog open={!!detailCampaign} onOpenChange={v => { if (!v) setDetailCampaign(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base font-semibold truncate">{detailCampaign?.name}</DialogTitle>
            {detailType === "email" && (detailCampaign as EmailCampaign)?.subject && (
              <p className="text-sm text-muted-foreground">Asunto: {(detailCampaign as EmailCampaign).subject}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {fmtDate(detailCampaign?.sent_at ?? null)} · {detailCampaign?.total_recipients ?? 0} destinatarios
            </p>
          </DialogHeader>

          {/* Stats summary */}
          <div className="px-6 py-3 border-b shrink-0 flex flex-wrap gap-2">
            {detailType === "email" ? (() => {
              const c = detailCampaign as EmailCampaign;
              return <>
                <MiniStat icon={<Users className="h-3 w-3" />} label="Enviados" value={c?.sent_count ?? 0} color="blue" />
                <MiniStat icon={<Eye className="h-3 w-3" />} label="Abiertos" value={`${c?.opened_count ?? 0} · ${pct(c?.opened_count ?? 0, c?.sent_count ?? 1)}`} color="green" />
                <MiniStat icon={<MousePointerClick className="h-3 w-3" />} label="Clics" value={`${c?.clicked_count ?? 0} · ${pct(c?.clicked_count ?? 0, c?.sent_count ?? 1)}`} color="purple" />
                <MiniStat icon={<XCircle className="h-3 w-3" />} label="Fallidos" value={c?.failed_count ?? 0} color="red" />
              </>;
            })() : (() => {
              const c = detailCampaign as WaCampaign;
              return <>
                <MiniStat icon={<Users className="h-3 w-3" />} label="Enviados" value={c?.sent_count ?? 0} color="blue" />
                <MiniStat icon={<CheckCircle2 className="h-3 w-3" />} label="Entregados" value={`${c?.delivered_count ?? 0} · ${pct(c?.delivered_count ?? 0, c?.sent_count ?? 1)}`} color="teal" />
                <MiniStat icon={<Eye className="h-3 w-3" />} label="Leídos" value={`${c?.read_count ?? 0} · ${pct(c?.read_count ?? 0, c?.sent_count ?? 1)}`} color="green" />
                <MiniStat icon={<XCircle className="h-3 w-3" />} label="Fallidos" value={c?.failed_count ?? 0} color="red" />
              </>;
            })()}
          </div>

          {/* Per-contact table */}
          <div className="flex-1 overflow-auto">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando contactos…
              </div>
            ) : detailRows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No hay registros individuales aún.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Contacto</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Enviado</th>
                    {detailType === "email" ? <>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Abierto</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Clic</th>
                    </> : <>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Entregado</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Leído</th>
                    </>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailType === "email"
                    ? (detailRows as EmailSendRow[]).map(row => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-medium truncate max-w-[160px]">{row.contacts?.full_name || row.email_address}</p>
                            {row.contacts?.full_name && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{row.email_address}</p>}
                          </td>
                          <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><StatusDot status={row.status} /><span className="text-xs capitalize">{statusLabel(row.status)}</span></span></td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.sent_at)}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">{row.opened_at ? <span className="text-green-600 font-medium">{fmtDate(row.opened_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">{row.clicked_at ? <span className="text-purple-600 font-medium">{fmtDate(row.clicked_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))
                    : (detailRows as WaSendRow[]).map(row => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-medium truncate max-w-[160px]">{row.contacts?.full_name || row.phone}</p>
                            {row.contacts?.full_name && <p className="text-xs text-muted-foreground">{row.phone}</p>}
                          </td>
                          <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><StatusDot status={row.status} /><span className="text-xs capitalize">{statusLabel(row.status)}</span></span></td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.sent_at)}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">{row.delivered_at ? <span className="text-teal-600 font-medium">{fmtDate(row.delivered_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">{row.read_at ? <span className="text-green-600 font-medium">{fmtDate(row.read_at)}</span> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

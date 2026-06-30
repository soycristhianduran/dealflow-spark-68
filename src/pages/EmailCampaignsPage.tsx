import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { WhatsAppIcon, EmailIcon3D } from "@/components/icons/BrandIcons";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import {
  Mail, MessageSquare, Users, Eye, XCircle, Loader2,
  ChevronRight, MousePointerClick, CheckCircle2, RefreshCw, ShoppingBag,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmailCampaign {
  id: string; name: string; subject: string; status: string;
  sent_at: string | null; scheduled_at: string | null; total_recipients: number;
  sent_count: number; opened_count: number; clicked_count: number; failed_count: number;
  from_name: string; from_email: string;
}
interface WaCampaign {
  id: string; name: string; template_name: string | null; status: string;
  sent_at: string; scheduled_at: string | null; total_recipients: number;
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

function statusLabel(s: string, t: (key: string) => string) {
  const m: Record<string, string> = {
    sent: t("emailCampaignsPage.statusSent"),
    opened: t("emailCampaignsPage.statusOpened"),
    clicked: t("emailCampaignsPage.statusClicked"),
    failed: t("emailCampaignsPage.statusFailed"),
    delivered: t("emailCampaignsPage.statusDelivered"),
    read: t("emailCampaignsPage.statusRead"),
    pending: t("emailCampaignsPage.statusPending"),
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
  const { t } = useTranslation();
  const map: Record<string, string> = {
    sent: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    sending: "bg-amber-100 text-amber-700",
    scheduled: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    queued: "bg-amber-100 text-amber-700",
    canceled: "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    failed: "bg-red-100 text-red-600",
  };
  const labels: Record<string, string> = {
    sent: t("emailCampaignsPage.badgeSent"),
    sending: t("emailCampaignsPage.badgeSending"),
    scheduled: t("emailCampaignsPage.badgeScheduled"),
    queued: t("emailCampaignsPage.badgeQueued"),
    canceled: t("emailCampaignsPage.badgeCanceled"),
    draft: t("emailCampaignsPage.badgeDraft"),
    failed: t("emailCampaignsPage.badgeFailed"),
  };
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
function SalesMetric({ sales }: { sales?: { orders: number; revenue: number; currency: string | null } }) {
  const { t } = useTranslation();
  if (!sales || sales.orders === 0) return null;
  const fmt = `${sales.currency ? sales.currency + " " : "$"}${Number(sales.revenue).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return (
    <div className="text-center">
      <p className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt}</p>
      <p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.salesCount", { count: sales.orders })}</p>
    </div>
  );
}

function EmailCampaignRow({ campaign: c, sales, onClick }: { campaign: EmailCampaign; sales?: { orders: number; revenue: number; currency: string | null }; onClick: () => void }) {
  const { t } = useTranslation();
  const openRate = c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-4 group">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <EmailIcon3D size={32} className="drop-shadow-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm truncate">{c.name}</p><StatusBadge status={c.status} /></div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{c.subject} · {c.from_email}</p>
        <p className="text-xs text-muted-foreground">{fmtDate(c.sent_at)}</p>
      </div>
      <div className="hidden md:flex items-center gap-5 shrink-0 text-sm">
        <div className="text-center"><p className="font-semibold">{c.sent_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.sent")}</p></div>
        <div className="text-center"><p className="font-semibold text-green-600">{c.opened_count} <span className="text-xs font-normal text-muted-foreground">({openRate}%)</span></p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.opened")}</p></div>
        <div className="text-center"><p className="font-semibold text-purple-600">{c.clicked_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.clicks")}</p></div>
        {c.failed_count > 0 && <div className="text-center"><p className="font-semibold text-red-500">{c.failed_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.failed")}</p></div>}
        <SalesMetric sales={sales} />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
    </button>
  );
}

function WaCampaignRow({ campaign: c, sales, onClick }: { campaign: WaCampaign; sales?: { orders: number; revenue: number; currency: string | null }; onClick: () => void }) {
  const { t } = useTranslation();
  const readRate = c.sent_count > 0 ? Math.round((c.read_count / c.sent_count) * 100) : 0;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-4 group">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <WhatsAppIcon size={32} className="drop-shadow-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm truncate">{c.name}</p><StatusBadge status={c.status} /></div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{t("emailCampaignsPage.template")}: {c.template_name || "—"}</p>
        <p className="text-xs text-muted-foreground">{fmtDate(c.sent_at)}</p>
      </div>
      <div className="hidden md:flex items-center gap-5 shrink-0 text-sm">
        <div className="text-center"><p className="font-semibold text-foreground">{c.total_recipients}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.recipients")}</p></div>
        <div className="text-center"><p className="font-semibold">{c.sent_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.sent")}</p></div>
        <div className="text-center"><p className="font-semibold text-teal-600">{c.delivered_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.delivered")}</p></div>
        <div className="text-center"><p className="font-semibold text-green-600">{c.read_count} <span className="text-xs font-normal text-muted-foreground">({readRate}%)</span></p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.read")}</p></div>
        {c.failed_count > 0 && <div className="text-center"><p className="font-semibold text-red-500">{c.failed_count}</p><p className="text-[11px] text-muted-foreground">{t("emailCampaignsPage.failed")}</p></div>}
        <SalesMetric sales={sales} />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors" />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const [tab, setTab] = useState<TabType>("email");
  const [salesById, setSalesById] = useState<Record<string, { orders: number; revenue: number; currency: string | null }>>({});
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [waCampaigns, setWaCampaigns] = useState<WaCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<EmailCampaign | WaCampaign | null>(null);
  const [detailType, setDetailType] = useState<TabType>("email");
  const [detailRows, setDetailRows] = useState<(EmailSendRow | WaSendRow)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (!organizationId) { setLoading(false); setRefreshing(false); return; }
    if (showSpinner) setLoading(true); else setRefreshing(true);
    const [emailRes, waRes] = await Promise.all([
      supabase.from("email_campaigns")
        .select("id,name,subject,status,sent_at,scheduled_at,total_recipients,sent_count,opened_count,clicked_count,failed_count,from_name,from_email")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("whatsapp_campaigns")
        .select("id,name,template_name,status,sent_at,scheduled_at,total_recipients,sent_count,failed_count,delivered_count,read_count,organization_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (emailRes.data) setEmailCampaigns(emailRes.data as EmailCampaign[]);
    // Attributed Shopify sales per campaign (email + whatsapp)
    supabase.from("campaign_sales_roi").select("campaign_id, attributed_orders, attributed_revenue, currency").then(({ data }) => {
      const map: Record<string, { orders: number; revenue: number; currency: string | null }> = {};
      for (const r of data ?? []) map[(r as any).campaign_id] = { orders: Number((r as any).attributed_orders), revenue: Number((r as any).attributed_revenue), currency: (r as any).currency };
      setSalesById(map);
    });
    if (waRes.data) {
      let wa = waRes.data as (WaCampaign & { organization_id?: string })[];
      // Override stored counters with LIVE stats from whatsapp_sends so the list
      // matches the detail view exactly (the stored counters can lag).
      const orgId = wa[0]?.organization_id;
      if (orgId) {
        const { data: stats } = await supabase.rpc("whatsapp_campaign_stats", { p_org: orgId });
        if (Array.isArray(stats)) {
          const byId = new Map(stats.map((s: any) => [s.campaign_id, s]));
          wa = wa.map(c => {
            const s = byId.get(c.id);
            return s ? { ...c, sent_count: s.sent, delivered_count: s.delivered, read_count: s.read_c, failed_count: s.failed } : c;
          });
        }
      }
      setWaCampaigns(wa as WaCampaign[]);
    }
    if (showSpinner) setLoading(false); else setRefreshing(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (campaign: EmailCampaign | WaCampaign, type: TabType) => {
    setDetailCampaign(campaign); setDetailType(type); setDetailRows([]); setDetailLoading(true);
    // PostgREST caps responses at 1000 rows; page through with .range() so a
    // campaign with >1000 recipients shows all of them (not just the first 1000).
    const table = type === "email" ? "email_sends" : "whatsapp_sends";
    const cols = type === "email"
      ? "id,email_address,status,sent_at,opened_at,clicked_at,error_message,contacts(full_name)"
      : "id,phone,status,sent_at,delivered_at,read_at,error_message,contacts(full_name)";
    const all: (EmailSendRow | WaSendRow)[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table)
        .select(cols)
        .eq("campaign_id", campaign.id)
        .order("sent_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = (data || []) as unknown as (EmailSendRow | WaSendRow)[];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    setDetailRows(all);
    setDetailLoading(false);
  };

  const isSentStatus = (s: string) => ["sent", "delivered", "read", "opened", "clicked"].includes(s);

  // Cancel a scheduled campaign so the cron never sends it.
  const cancelSchedule = async (campaign: WaCampaign | EmailCampaign, type: TabType) => {
    if (!confirm(t("emailCampaignsPage.confirmCancelSchedule", { name: campaign.name }))) return;
    const table = type === "email" ? "email_campaigns" : "whatsapp_campaigns";
    const { error } = await supabase.from(table)
      .update({ status: "canceled", scheduled_at: null }).eq("id", campaign.id);
    if (error) { toast.error(t("emailCampaignsPage.cancelError", { message: error.message })); return; }
    toast.success(t("emailCampaignsPage.scheduleCanceled"));
    setDetailCampaign(null);
    load(false);
  };

  // Reschedule a scheduled campaign to a new future date/time.
  const reschedule = async (campaign: WaCampaign | EmailCampaign, type: TabType, newWhen: string) => {
    const when = new Date(newWhen);
    if (isNaN(when.getTime())) { toast.error(t("emailCampaignsPage.invalidDate")); return; }
    if (when.getTime() <= Date.now()) { toast.error(t("emailCampaignsPage.dateMustBeFuture")); return; }
    const table = type === "email" ? "email_campaigns" : "whatsapp_campaigns";
    const { error } = await supabase.from(table)
      .update({ status: "scheduled", scheduled_at: when.toISOString() }).eq("id", campaign.id);
    if (error) { toast.error(t("emailCampaignsPage.rescheduleError", { message: error.message })); return; }
    toast.success(t("emailCampaignsPage.rescheduledTo", { date: when.toLocaleString() }));
    setRescheduleOpen(false);
    setDetailCampaign(null);
    load(false);
  };

  const emailTotals = emailCampaigns.reduce((a, c) => ({
    sent: a.sent + c.sent_count, opened: a.opened + c.opened_count,
    clicked: a.clicked + c.clicked_count, failed: a.failed + c.failed_count,
  }), { sent: 0, opened: 0, clicked: 0, failed: 0 });

  const waTotals = waCampaigns.reduce((a, c) => ({
    recipients: a.recipients + (c.total_recipients || 0),
    sent: a.sent + c.sent_count, delivered: a.delivered + c.delivered_count,
    read: a.read + c.read_count, failed: a.failed + c.failed_count,
  }), { recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 });

  // Total attributed Shopify sales per channel
  const sumSales = (list: { id: string }[]) => list.reduce((a, c) => {
    const s = salesById[c.id]; return s ? { rev: a.rev + s.revenue, ord: a.ord + s.orders, cur: s.currency || a.cur } : a;
  }, { rev: 0, ord: 0, cur: null as string | null });
  const emailSales = sumSales(emailCampaigns);
  const waSales = sumSales(waCampaigns);
  const fmtSales = (s: { rev: number; ord: number; cur: string | null }) =>
    `${s.cur ? s.cur + " " : "$"}${s.rev.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${s.ord})`;

  return (
    <AppLayout>
      <AppHeader
        title={t("emailCampaignsPage.pageTitle")}
        subtitle={t("emailCampaignsPage.pageSubtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => load(false)} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("emailCampaignsPage.refresh")}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">

        {/* Tab toggle */}
        <div className="flex gap-2">
          <button onClick={() => setTab("email")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "email" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            <EmailIcon3D size={18} /> Email ({emailCampaigns.length})
          </button>
          <button onClick={() => setTab("whatsapp")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "whatsapp" ? "bg-green-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            <WhatsAppIcon size={18} /> WhatsApp ({waCampaigns.length})
          </button>
        </div>

        {/* Summary stats */}
        {tab === "email" && emailCampaigns.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statSent")} value={emailTotals.sent.toLocaleString()} color="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
            <StatPill icon={<Eye className="h-3 w-3" />} label={t("emailCampaignsPage.statOpened")} value={`${emailTotals.opened} (${pct(emailTotals.opened, emailTotals.sent)})`} color="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" />
            <StatPill icon={<MousePointerClick className="h-3 w-3" />} label={t("emailCampaignsPage.statClicks")} value={`${emailTotals.clicked} (${pct(emailTotals.clicked, emailTotals.sent)})`} color="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" />
            <StatPill icon={<XCircle className="h-3 w-3" />} label={t("emailCampaignsPage.statBounced")} value={emailTotals.failed} color="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" />
            {emailSales.ord > 0 && <StatPill icon={<ShoppingBag className="h-3 w-3" />} label={t("emailCampaignsPage.statSales")} value={fmtSales(emailSales)} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />}
          </div>
        )}
        {tab === "whatsapp" && waCampaigns.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statRecipients")} value={waTotals.recipients.toLocaleString()} color="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
            <StatPill icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statSent")} value={waTotals.sent.toLocaleString()} color="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
            <StatPill icon={<CheckCircle2 className="h-3 w-3" />} label={t("emailCampaignsPage.statDelivered")} value={`${waTotals.delivered} (${pct(waTotals.delivered, waTotals.sent)})`} color="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300" />
            <StatPill icon={<Eye className="h-3 w-3" />} label={t("emailCampaignsPage.statRead")} value={`${waTotals.read} (${pct(waTotals.read, waTotals.sent)})`} color="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" />
            <StatPill icon={<XCircle className="h-3 w-3" />} label={t("emailCampaignsPage.statFailed")} value={waTotals.failed} color="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" />
            {waSales.ord > 0 && <StatPill icon={<ShoppingBag className="h-3 w-3" />} label={t("emailCampaignsPage.statSales")} value={fmtSales(waSales)} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />}
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("emailCampaignsPage.loadingCampaigns")}
          </div>
        ) : tab === "email" ? (
          emailCampaigns.length === 0
            ? <EmptyState icon={<Mail className="h-10 w-10 text-muted-foreground/40" />} title={t("emailCampaignsPage.emptyEmailTitle")} desc={t("emailCampaignsPage.emptyEmailDesc")} />
            : <div className="space-y-2">{emailCampaigns.map(c => <EmailCampaignRow key={c.id} campaign={c} sales={salesById[c.id]} onClick={() => openDetail(c, "email")} />)}</div>
        ) : (
          waCampaigns.length === 0
            ? <EmptyState icon={<MessageSquare className="h-10 w-10 text-muted-foreground/40" />} title={t("emailCampaignsPage.emptyWaTitle")} desc={t("emailCampaignsPage.emptyWaDesc")} />
            : <div className="space-y-2">{waCampaigns.map(c => <WaCampaignRow key={c.id} campaign={c} sales={salesById[c.id]} onClick={() => openDetail(c, "whatsapp")} />)}</div>
        )}
      </div>

      {/* Detail modal */}
      <Dialog open={!!detailCampaign} onOpenChange={v => { if (!v) setDetailCampaign(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base font-semibold truncate">{detailCampaign?.name}</DialogTitle>
            {detailType === "email" && (detailCampaign as EmailCampaign)?.subject && (
              <p className="text-sm text-muted-foreground">{t("emailCampaignsPage.subject")}: {(detailCampaign as EmailCampaign).subject}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {fmtDate(detailCampaign?.sent_at ?? null)} · {t("emailCampaignsPage.recipientsCount", { count: detailCampaign?.total_recipients ?? 0 })}
            </p>
          </DialogHeader>

          {/* Scheduled campaign: cancel / reschedule before it sends */}
          {detailCampaign?.status === "scheduled" && (
            <div className="px-6 py-3 border-b shrink-0 bg-indigo-50/60 dark:bg-indigo-950/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  📅 {t("emailCampaignsPage.scheduledFor")} <strong>{fmtDate(detailCampaign.scheduled_at)}</strong>
                </span>
                <div className="flex-1" />
                {!rescheduleOpen ? (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => {
                        const d = detailCampaign.scheduled_at ? new Date(detailCampaign.scheduled_at) : new Date();
                        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        setRescheduleValue(local); setRescheduleOpen(true);
                      }}>
                      {t("emailCampaignsPage.reschedule")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => cancelSchedule(detailCampaign, detailType)}>
                      {t("emailCampaignsPage.cancelSchedule")}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="datetime-local" value={rescheduleValue}
                      onChange={e => setRescheduleValue(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-xs" />
                    <Button size="sm" className="h-8 text-xs"
                      onClick={() => reschedule(detailCampaign, detailType, rescheduleValue)}>
                      {t("emailCampaignsPage.save")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs"
                      onClick={() => setRescheduleOpen(false)}>
                      {t("emailCampaignsPage.cancel")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats summary — computed from live detail rows (always accurate) */}
          <div className="px-6 py-3 border-b shrink-0 flex flex-wrap gap-2">
            {detailType === "email" ? (() => {
              const rows = detailRows as EmailSendRow[];
              const sentN   = rows.filter(r => isSentStatus(r.status) || r.sent_at).length;
              const pendingN= rows.filter(r => r.status === "pending").length;
              const openedN = rows.filter(r => r.opened_at).length;
              const clickedN= rows.filter(r => r.clicked_at).length;
              const failedN = rows.filter(r => r.status === "failed").length;
              return <>
                <MiniStat icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statSent")} value={sentN} color="blue" />
                {pendingN > 0 && <MiniStat icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statPending")} value={pendingN} color="purple" />}
                <MiniStat icon={<Eye className="h-3 w-3" />} label={t("emailCampaignsPage.statOpened")} value={`${openedN} · ${pct(openedN, sentN)}`} color="green" />
                <MiniStat icon={<MousePointerClick className="h-3 w-3" />} label={t("emailCampaignsPage.statClicks")} value={`${clickedN} · ${pct(clickedN, sentN)}`} color="purple" />
                <MiniStat icon={<XCircle className="h-3 w-3" />} label={t("emailCampaignsPage.statFailed")} value={failedN} color="red" />
              </>;
            })() : (() => {
              const rows = detailRows as WaSendRow[];
              // Status-based (matches the campaigns list / RPC exactly).
              const sentN     = rows.filter(r => ["sent", "delivered", "read"].includes(r.status)).length;
              const pendingN  = rows.filter(r => r.status === "pending").length;
              const deliveredN= rows.filter(r => ["delivered", "read"].includes(r.status)).length;
              const readN     = rows.filter(r => r.status === "read").length;
              const failedN   = rows.filter(r => r.status === "failed").length;
              return <>
                <MiniStat icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statSent")} value={sentN} color="blue" />
                {pendingN > 0 && <MiniStat icon={<Users className="h-3 w-3" />} label={t("emailCampaignsPage.statPending")} value={pendingN} color="purple" />}
                <MiniStat icon={<CheckCircle2 className="h-3 w-3" />} label={t("emailCampaignsPage.statDelivered")} value={`${deliveredN} · ${pct(deliveredN, sentN)}`} color="teal" />
                <MiniStat icon={<Eye className="h-3 w-3" />} label={t("emailCampaignsPage.statRead")} value={`${readN} · ${pct(readN, sentN)}`} color="green" />
                <MiniStat icon={<XCircle className="h-3 w-3" />} label={t("emailCampaignsPage.statFailed")} value={failedN} color="red" />
              </>;
            })()}
          </div>

          {/* Per-contact table */}
          <div className="flex-1 overflow-auto">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("emailCampaignsPage.loadingContacts")}
              </div>
            ) : detailRows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                {t("emailCampaignsPage.noRecords")}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colContact")}</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colStatus")}</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colSent")}</th>
                    {detailType === "email" ? <>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colOpened")}</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colClicked")}</th>
                    </> : <>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colDelivered")}</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{t("emailCampaignsPage.colRead")}</th>
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
                          <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><StatusDot status={row.status} /><span className="text-xs capitalize">{statusLabel(row.status, t)}</span></span></td>
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
                          <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><StatusDot status={row.status} /><span className="text-xs capitalize">{statusLabel(row.status, t)}</span></span></td>
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

import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  DollarSign, Eye, MousePointerClick, Users, TrendingUp, BarChart3,
  RefreshCw, Loader2, CalendarIcon, X, Pause, Play, AlertTriangle,
  CheckCircle2, Zap, TrendingDown, Trophy, Target, ChevronDown, ChevronUp,
  Image as ImageIcon, Download, ChevronRight, Layers,
} from "lucide-react";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Campaign {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string | null;
  objective: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  cpl: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string | null;
  stop_time: string | null;
  ad_account_id: string | null;
}

type InsightType =
  | "no_leads"
  | "high_cpl"
  | "low_ctr"
  | "high_impressions_low_ctr"
  | "high_ctr_no_leads"
  | "efficient"
  | "paused_winner"
  | "scale";

interface CampaignInsight {
  type: InsightType;
  severity: "critical" | "warning" | "positive";
  title: string;
  description: string;
  action: string;
}

interface ScoredCampaign extends Campaign {
  ctr: number;
  score: 1 | 2 | 3 | 4 | 5;
  insights: CampaignInsight[];
}

interface MetaAdSet {
  id: string; adset_id: string; adset_name: string; campaign_id: string;
  status: string | null; spend: number | null; impressions: number | null;
  clicks: number | null; leads: number | null; cpl: number | null;
  ad_account_id: string | null;
}

interface MetaAd {
  id: string; ad_id: string; ad_name: string; adset_id: string; campaign_id: string;
  status: string | null; headline: string | null; body: string | null;
  image_url: string | null; call_to_action: string | null;
  spend: number | null; impressions: number | null; clicks: number | null;
  leads: number | null; cpl: number | null; creative_id: string | null;
  ad_account_id: string | null;
}

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Más información", SHOP_NOW: "Comprar ahora", SIGN_UP: "Regístrate",
  CONTACT_US: "Contáctanos", GET_QUOTE: "Solicitar cotización", GET_OFFER: "Ver oferta",
  SUBSCRIBE: "Suscribirse", DOWNLOAD: "Descargar", BOOK_NOW: "Reservar ahora",
  APPLY_NOW: "Aplicar ahora", WATCH_MORE: "Ver más", SEND_MESSAGE: "Enviar mensaje",
  BUY_NOW: "Comprar", CALL_NOW: "Llamar ahora", GET_DIRECTIONS: "Cómo llegar",
  INSTALL_MOBILE_APP: "Instalar app", USE_APP: "Abrir app",
};

/* ─── Constants ──────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  PAUSED: "bg-yellow-400",
  DELETED: "bg-destructive",
  ARCHIVED: "bg-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  DELETED: "Eliminada",
  ARCHIVED: "Archivada",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 70% 50%)",
  "hsl(340 75% 55%)",
  "hsl(280 65% 60%)",
  "hsl(160 60% 45%)",
  "hsl(var(--accent))",
];

const INSIGHT_CONFIG: Record<InsightType, { icon: React.ReactNode; color: string }> = {
  no_leads:               { icon: <AlertTriangle className="h-4 w-4" />, color: "text-destructive" },
  high_cpl:               { icon: <TrendingUp className="h-4 w-4 rotate-180" />, color: "text-destructive" },
  low_ctr:                { icon: <MousePointerClick className="h-4 w-4" />, color: "text-amber-500" },
  high_impressions_low_ctr: { icon: <Eye className="h-4 w-4" />,         color: "text-amber-500" },
  high_ctr_no_leads:      { icon: <Target className="h-4 w-4" />,        color: "text-amber-500" },
  efficient:              { icon: <CheckCircle2 className="h-4 w-4" />,  color: "text-emerald-600" },
  paused_winner:          { icon: <Trophy className="h-4 w-4" />,        color: "text-emerald-600" },
  scale:                  { icon: <Zap className="h-4 w-4" />,           color: "text-emerald-600" },
};

/* ─── Analysis engine ────────────────────────────────────────────────────── */
function analyzeCampaigns(campaigns: Campaign[]): ScoredCampaign[] {
  // Compute medians for benchmarking
  const withCpl = campaigns.filter(c => (c.leads || 0) > 0 && c.cpl != null);
  const cplValues = withCpl.map(c => c.cpl!).sort((a, b) => a - b);
  const medianCpl = cplValues.length > 0
    ? cplValues[Math.floor(cplValues.length / 2)]
    : null;

  const withCtr = campaigns.filter(c => (c.impressions || 0) > 0);
  const ctrValues = withCtr
    .map(c => ((c.clicks || 0) / (c.impressions || 1)) * 100)
    .sort((a, b) => a - b);
  const medianCtr = ctrValues.length > 0
    ? ctrValues[Math.floor(ctrValues.length / 2)]
    : null;

  // Best CPL among paused campaigns (for paused_winner insight)
  const pausedWithCpl = campaigns
    .filter(c => c.status === "PAUSED" && c.cpl != null && c.cpl > 0)
    .sort((a, b) => a.cpl! - b.cpl!);
  const bestPausedCpl = pausedWithCpl[0]?.cpl ?? null;

  return campaigns.map(c => {
    const spend    = c.spend    || 0;
    const leads    = c.leads    || 0;
    const impr     = c.impressions || 0;
    const clicks   = c.clicks  || 0;
    const ctr      = impr > 0 ? (clicks / impr) * 100 : 0;
    const insights: CampaignInsight[] = [];

    // ── Critical: spend with zero leads ──────────────────────────────────
    if (spend > 0 && leads === 0 && c.status === "ACTIVE") {
      insights.push({
        type: "no_leads",
        severity: "critical",
        title: "Sin leads generados",
        description: `$${spend.toFixed(2)} gastados sin obtener ningún lead.`,
        action: "Revisar segmentación y creativos urgente",
      });
    }

    // ── Critical: CPL muy alto ────────────────────────────────────────────
    if (medianCpl && c.cpl && c.cpl > medianCpl * 2) {
      insights.push({
        type: "high_cpl",
        severity: "critical",
        title: "CPL muy alto",
        description: `$${c.cpl.toFixed(2)} por lead vs. $${medianCpl.toFixed(2)} promedio (${Math.round((c.cpl / medianCpl - 1) * 100)}% más caro).`,
        action: "Pausar o ajustar segmentación y oferta",
      });
    }

    // ── Warning: CTR bajo con buen alcance ────────────────────────────────
    if (impr > 5000 && ctr < 0.5) {
      insights.push({
        type: "high_impressions_low_ctr",
        severity: "warning",
        title: "Muchas impresiones, pocos clics",
        description: `CTR de ${ctr.toFixed(2)}% con ${impr.toLocaleString("es")} impresiones.`,
        action: "Renovar creativos, imágenes y copy del anuncio",
      });
    } else if (impr > 0 && ctr < 0.5 && spend > 5) {
      insights.push({
        type: "low_ctr",
        severity: "warning",
        title: "CTR muy bajo",
        description: `Solo ${ctr.toFixed(2)}% de clics sobre las impresiones.`,
        action: "Revisar relevancia del anuncio para la audiencia",
      });
    }

    // ── Warning: muchos clics pero sin leads ──────────────────────────────
    if (clicks > 50 && leads === 0 && spend > 0) {
      insights.push({
        type: "high_ctr_no_leads",
        severity: "warning",
        title: "Clics sin conversión",
        description: `${clicks} clics pero ningún lead. El tráfico no convierte.`,
        action: "Revisar la landing page o el formulario de captación",
      });
    }

    // ── Positive: campaña pausada era la más eficiente ────────────────────
    if (c.status === "PAUSED" && c.cpl != null && bestPausedCpl !== null && c.cpl === bestPausedCpl && leads > 0) {
      insights.push({
        type: "paused_winner",
        severity: "positive",
        title: "Mejor CPL entre las pausadas",
        description: `$${c.cpl.toFixed(2)} por lead — era tu campaña más eficiente.`,
        action: "Considera reactivarla",
      });
    }

    // ── Positive: campaña eficiente con leads ─────────────────────────────
    if (medianCpl && c.cpl && c.cpl < medianCpl * 0.7 && leads > 2 && c.status === "ACTIVE") {
      insights.push({
        type: "efficient",
        severity: "positive",
        title: "Campaña rentable",
        description: `CPL un ${Math.round((1 - c.cpl / medianCpl) * 100)}% por debajo de la media.`,
        action: "Considera aumentar el presupuesto",
      });
    }

    // ── Score ──────────────────────────────────────────────────────────────
    let score: 1 | 2 | 3 | 4 | 5;
    if (spend === 0 && leads === 0) {
      score = 3; // no data
    } else if (insights.some(i => i.severity === "critical")) {
      score = spend > 20 ? 1 : 2;
    } else if (insights.some(i => i.severity === "warning")) {
      score = 3;
    } else if (insights.some(i => i.type === "efficient" || i.type === "paused_winner")) {
      score = 5;
    } else if (leads > 0 && c.status === "ACTIVE") {
      score = 4;
    } else {
      score = 3;
    }

    return { ...c, ctr, score, insights };
  });
}

/* ─── Score badge ─────────────────────────────────────────────────────────── */
function ScoreBadge({ score }: { score: 1 | 2 | 3 | 4 | 5 }) {
  const map = {
    5: { label: "Estrella",   className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", dot: "bg-emerald-500" },
    4: { label: "Buena",      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",           dot: "bg-blue-500"    },
    3: { label: "Regular",    className: "bg-muted text-muted-foreground",                                              dot: "bg-muted-foreground" },
    2: { label: "Mejorar",    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",       dot: "bg-amber-500"   },
    1: { label: "Bajo rend.", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",               dot: "bg-destructive" },
  };
  const { label, className, dot } = map[score];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/* ─── Toggle button ──────────────────────────────────────────────────────── */
function StatusToggle({
  campaign,
  onToggle,
  loading,
}: {
  campaign: ScoredCampaign;
  onToggle: (id: string, newStatus: "ACTIVE" | "PAUSED") => void;
  loading: boolean;
}) {
  const isActive = campaign.status === "ACTIVE";
  const isEditable = campaign.status === "ACTIVE" || campaign.status === "PAUSED";

  if (!isEditable) {
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <div className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[campaign.status || ""] || "bg-muted-foreground"}`} />
        {STATUS_LABELS[campaign.status || ""] || campaign.status}
      </Badge>
    );
  }

  return (
    <button
      onClick={() => onToggle(campaign.campaign_id, isActive ? "PAUSED" : "ACTIVE")}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all border",
        isActive
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
        loading && "opacity-50 cursor-not-allowed"
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isActive ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {isActive ? "Pausar" : "Activar"}
    </button>
  );
}

/* ─── Creative card ──────────────────────────────────────────────────────── */
function AdCreativeCard({
  ad,
  adsetName,
  campaignName,
  onToggle,
  toggling,
}: {
  ad: MetaAd;
  adsetName: string;
  campaignName: string;
  onToggle: (id: string, type: "ad", newStatus: "ACTIVE" | "PAUSED") => void;
  toggling: boolean;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const isActive = ad.status === "ACTIVE";
  const canToggle = ad.status === "ACTIVE" || ad.status === "PAUSED";
  const ctaLabel = ad.call_to_action ? (CTA_LABELS[ad.call_to_action] || ad.call_to_action) : null;

  return (
    <Card className="border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Image / thumbnail */}
      {ad.image_url ? (
        <div className="relative w-full bg-muted aspect-video overflow-hidden">
          <img
            src={ad.image_url}
            alt={ad.ad_name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).parentElement!.classList.add("hidden");
            }}
          />
          {/* status pill overlay */}
          <div className="absolute top-2 right-2">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow",
              isActive
                ? "bg-emerald-500/90 text-white"
                : "bg-amber-400/90 text-white"
            )}>
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              {STATUS_LABELS[ad.status || ""] || ad.status}
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full aspect-video bg-muted/60 flex items-center justify-center text-muted-foreground/30">
          <ImageIcon className="h-10 w-10" />
        </div>
      )}

      <CardContent className="p-3 flex flex-col gap-2 flex-1">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
          <span className="truncate max-w-[90px]">{campaignName}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[90px]">{adsetName}</span>
        </div>

        {/* Ad name */}
        <p className="text-xs font-semibold text-foreground leading-tight">{ad.ad_name}</p>

        {/* Headline */}
        {ad.headline && (
          <p className="text-sm font-bold text-foreground leading-snug">{ad.headline}</p>
        )}

        {/* Body / caption */}
        {ad.body && (
          <div>
            <p className={cn(
              "text-xs text-muted-foreground leading-relaxed",
              !bodyExpanded && "line-clamp-3"
            )}>
              {ad.body}
            </p>
            {ad.body.length > 120 && (
              <button
                onClick={() => setBodyExpanded(v => !v)}
                className="text-[10px] text-primary mt-0.5 hover:underline"
              >
                {bodyExpanded ? "Ver menos" : "Ver más"}
              </button>
            )}
          </div>
        )}

        {/* CTA */}
        {ctaLabel && (
          <div className="mt-auto pt-1">
            <span className="inline-block bg-primary/10 text-primary text-[11px] font-semibold px-3 py-1 rounded-full">
              {ctaLabel}
            </span>
          </div>
        )}

        {/* Metrics */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground border-t pt-2 mt-1">
          {(ad.spend || 0) > 0 && (
            <span className="tabular-nums">${(ad.spend || 0).toLocaleString("es", { minimumFractionDigits: 2 })} gasto</span>
          )}
          {(ad.leads || 0) > 0 && (
            <span className="tabular-nums font-semibold text-emerald-600">{ad.leads} leads</span>
          )}
          {ad.cpl && (
            <span className="tabular-nums">${ad.cpl.toFixed(2)} CPL</span>
          )}
          {(ad.impressions || 0) > 0 && (
            <span className="tabular-nums">{(ad.impressions || 0).toLocaleString("es")} impr.</span>
          )}
        </div>

        {/* Toggle */}
        {canToggle && (
          <button
            onClick={() => onToggle(ad.ad_id, "ad", isActive ? "PAUSED" : "ACTIVE")}
            disabled={toggling}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium border transition-all",
              isActive
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
              toggling && "opacity-50 cursor-not-allowed"
            )}
          >
            {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isActive ? "Pausar anuncio" : "Activar anuncio"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Analysis panel ─────────────────────────────────────────────────────── */
function AnalysisPanel({ scored }: { scored: ScoredCampaign[] }) {
  const [expanded, setExpanded] = useState(false);

  const critical = scored.flatMap(c => c.insights.filter(i => i.severity === "critical").map(i => ({ ...i, campaign: c })));
  const warnings = scored.flatMap(c => c.insights.filter(i => i.severity === "warning").map(i => ({ ...i, campaign: c })));
  const positive = scored.flatMap(c => c.insights.filter(i => i.severity === "positive").map(i => ({ ...i, campaign: c })));

  if (critical.length + warnings.length + positive.length === 0) return null;

  const summary = [
    critical.length > 0 && { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: `${critical.length} problema${critical.length > 1 ? "s" : ""} crítico${critical.length > 1 ? "s" : ""}`, cls: "text-destructive bg-red-50 dark:bg-red-900/20" },
    warnings.length > 0 && { icon: <TrendingDown className="h-3.5 w-3.5" />, text: `${warnings.length} advertencia${warnings.length > 1 ? "s" : ""}`, cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20" },
    positive.length > 0 && { icon: <Zap className="h-3.5 w-3.5" />, text: `${positive.length} oportunidad${positive.length > 1 ? "es" : ""}`, cls: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20" },
  ].filter(Boolean) as { icon: React.ReactNode; text: string; cls: string }[];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Análisis de rendimiento
            </CardTitle>
            <div className="flex items-center gap-2">
              {summary.map((s, i) => (
                <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                  {s.icon} {s.text}
                </span>
              ))}
            </div>
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Critical */}
          {critical.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Problemas críticos
              </p>
              <div className="space-y-2">
                {critical.map((ins, i) => (
                  <div key={i} className="rounded-lg border border-destructive/20 bg-red-50/50 dark:bg-red-900/10 p-3 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 text-destructive">{INSIGHT_CONFIG[ins.type].icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{ins.campaign.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ins.description}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-destructive font-medium bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {ins.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-2 flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" /> Advertencias
              </p>
              <div className="space-y-2">
                {warnings.map((ins, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 p-3 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 text-amber-500">{INSIGHT_CONFIG[ins.type].icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{ins.campaign.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ins.description}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-amber-700 font-medium bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {ins.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positive */}
          {positive.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> Oportunidades
              </p>
              <div className="space-y-2">
                {positive.map((ins, i) => (
                  <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 text-emerald-600">{INSIGHT_CONFIG[ins.type].icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{ins.campaign.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ins.description}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-emerald-800 font-medium bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {ins.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function MetaAdsPage() {
  const { user } = useAuth();
  const fb = useFacebookIntegration();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const queryClient = useQueryClient();

  const [activeTab,       setActiveTab]       = useState<"campaigns" | "ads">("campaigns");
  const [statusFilter,    setStatusFilter]    = useState("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [dateFrom,        setDateFrom]        = useState<Date | undefined>();
  const [dateTo,          setDateTo]          = useState<Date | undefined>();
  const [togglingIds,     setTogglingIds]     = useState<Set<string>>(new Set());
  const [importingAds,    setImportingAds]    = useState(false);
  const [adCampaignFilter, setAdCampaignFilter] = useState("all");
  const [adStatusFilter,   setAdStatusFilter]   = useState("all");

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: adsets = [] } = useQuery({
    queryKey: ["meta-adsets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("meta_adsets").select("*").eq("user_id", user.id).order("adset_name");
      return (data || []) as MetaAdSet[];
    },
    enabled: !!user,
  });

  const { data: metaAds = [], refetch: refetchAds } = useQuery({
    queryKey: ["meta-ads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("meta_ads").select("*").eq("user_id", user.id).order("spend", { ascending: false });
      return (data || []) as MetaAd[];
    },
    enabled: !!user,
  });

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["meta-campaigns", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("meta_campaigns")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });
      if (error) throw error;
      return (data || []) as Campaign[];
    },
    enabled: !!user,
  });

  /* ── Toggle status ────────────────────────────────────────────────────── */
  const handleToggle = async (campaignId: string, newStatus: "ACTIVE" | "PAUSED") => {
    setTogglingIds(prev => new Set(prev).add(campaignId));
    const ok = await fb.updateCampaignStatus(campaignId, newStatus);
    if (ok) {
      queryClient.setQueryData(["meta-campaigns", user?.id], (old: Campaign[] | undefined) =>
        (old || []).map(c => c.campaign_id === campaignId ? { ...c, status: newStatus } : c)
      );
    }
    setTogglingIds(prev => { const s = new Set(prev); s.delete(campaignId); return s; });
  };

  const handleEntityToggle = async (
    entityId: string,
    entityType: "campaign" | "adset" | "ad",
    newStatus: "ACTIVE" | "PAUSED"
  ) => {
    setTogglingIds(prev => new Set(prev).add(entityId));
    const ok = await fb.updateEntityStatus(entityId, entityType, newStatus);
    if (ok) {
      // Optimistic update for ads
      if (entityType === "ad") {
        queryClient.setQueryData(["meta-ads", user?.id], (old: MetaAd[] | undefined) =>
          (old || []).map(a => a.ad_id === entityId ? { ...a, status: newStatus } : a)
        );
      }
    }
    setTogglingIds(prev => { const s = new Set(prev); s.delete(entityId); return s; });
  };

  const handleImportStructure = async () => {
    // Use the first ad account from any known campaign
    const adAccountId = campaigns[0]?.ad_account_id;
    if (!adAccountId) return;
    setImportingAds(true);
    await fb.importAdsStructure(adAccountId);
    await Promise.all([refetchAds()]);
    setImportingAds(false);
  };

  /* ── Ad filters ────────────────────────────────────────────────────────── */
  const filteredAds = useMemo(() => metaAds.filter(a => {
    if (adCampaignFilter !== "all" && a.campaign_id !== adCampaignFilter) return false;
    if (adStatusFilter   !== "all" && a.status       !== adStatusFilter)  return false;
    return true;
  }), [metaAds, adCampaignFilter, adStatusFilter]);

  // Build lookup maps for breadcrumb display
  const campaignNameById = useMemo(() => {
    const m = new Map<string, string>();
    campaigns.forEach(c => m.set(c.campaign_id, c.campaign_name));
    return m;
  }, [campaigns]);

  const adsetNameById = useMemo(() => {
    const m = new Map<string, string>();
    adsets.forEach(s => m.set(s.adset_id, s.adset_name));
    return m;
  }, [adsets]);

  /* ── Filtering ────────────────────────────────────────────────────────── */
  const uniqueObjectives = useMemo(() => {
    const s = new Set<string>();
    campaigns.forEach(c => { if (c.objective) s.add(c.objective); });
    return Array.from(s).sort();
  }, [campaigns]);

  const filtered = useMemo(() => campaigns.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (objectiveFilter !== "all" && c.objective !== objectiveFilter) return false;
    if (dateFrom && c.start_time && new Date(c.start_time) < dateFrom) return false;
    if (dateTo && c.start_time) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      if (new Date(c.start_time) > end) return false;
    }
    return true;
  }), [campaigns, statusFilter, objectiveFilter, dateFrom, dateTo]);

  /* ── Analysis ─────────────────────────────────────────────────────────── */
  const scored = useMemo(() => analyzeCampaigns(filtered), [filtered]);

  /* ── Totals ───────────────────────────────────────────────────────────── */
  const totals = useMemo(() => filtered.reduce(
    (acc, c) => ({
      spend:       acc.spend       + (c.spend       || 0),
      impressions: acc.impressions + (c.impressions || 0),
      clicks:      acc.clicks      + (c.clicks      || 0),
      leads:       acc.leads       + (c.leads       || 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0 }
  ), [filtered]);

  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const ctr    = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  /* ── Chart data ───────────────────────────────────────────────────────── */
  const barData = useMemo(() =>
    filtered.filter(c => (c.spend || 0) > 0).slice(0, 10).map(c => ({
      name:   c.campaign_name.length > 20 ? c.campaign_name.substring(0, 20) + "…" : c.campaign_name,
      spend:  c.spend  || 0,
      leads:  c.leads  || 0,
      clicks: c.clicks || 0,
    })),
  [filtered]);

  const pieData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(c => {
      const obj = c.objective || "Otro";
      map[obj] = (map[obj] || 0) + (c.spend || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const chartConfig = {
    spend:  { label: "Gasto",  color: "hsl(var(--primary))" },
    leads:  { label: "Leads",  color: "hsl(142 70% 45%)" },
    clicks: { label: "Clicks", color: "hsl(220 70% 50%)" },
  };

  /* ── Not connected ────────────────────────────────────────────────────── */
  if (!fb.isConnected && !fb.loading) {
    return (
      <AppLayout>
        <AppHeader title="Meta Ads" subtitle="Gestión y análisis de campañas" />
        <main className="flex-1 overflow-y-auto p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center space-y-4">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-semibold">Conecta Meta Ads</h3>
              <p className="text-sm text-muted-foreground">
                Para ver y gestionar campañas, primero conecta tu cuenta de Meta desde Integraciones.
              </p>
              <Button onClick={() => navigate(path("/integrations"))}>Ir a Integraciones</Button>
            </CardContent>
          </Card>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title="Meta Ads" subtitle="Gestión y análisis de campañas" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
            <button
              onClick={() => setActiveTab("campaigns")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "campaigns"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Campañas
            </button>
            <button
              onClick={() => setActiveTab("ads")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "ads"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5" /> Anuncios y creativos
              {metaAds.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 py-0 text-[10px] font-semibold">
                  {metaAds.length}
                </span>
              )}
            </button>
          </div>

          {/* Import structure button — shown in both tabs */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleImportStructure}
            disabled={importingAds || campaigns.length === 0}
          >
            {importingAds
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <Download className="h-3.5 w-3.5 mr-1" />}
            {metaAds.length === 0 ? "Importar anuncios" : "Actualizar anuncios"}
          </Button>
        </div>

        {/* ── ANUNCIOS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "ads" && (
          <>
            {/* Ad filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={adCampaignFilter} onValueChange={setAdCampaignFilter}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Campaña" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las campañas</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id}>
                      <span className="truncate max-w-[180px]">{c.campaign_name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={adStatusFilter} onValueChange={setAdStatusFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="ACTIVE">Activos</SelectItem>
                  <SelectItem value="PAUSED">Pausados</SelectItem>
                </SelectContent>
              </Select>

              {(adCampaignFilter !== "all" || adStatusFilter !== "all") && (
                <Button size="sm" variant="ghost" className="h-8 text-xs"
                  onClick={() => { setAdCampaignFilter("all"); setAdStatusFilter("all"); }}>
                  <X className="h-3 w-3 mr-1" /> Limpiar
                </Button>
              )}
              <Badge variant="secondary" className="text-xs">{filteredAds.length} anuncios</Badge>
            </div>

            {metaAds.length === 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="py-16 text-center space-y-3">
                  <Layers className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm font-medium text-foreground">Sin anuncios importados</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Haz clic en "Importar anuncios" para traer todos los anuncios con su creatividad, textos e imágenes desde Meta.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleImportStructure}
                    disabled={importingAds || campaigns.length === 0}
                  >
                    {importingAds ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                    Importar anuncios
                  </Button>
                </CardContent>
              </Card>
            ) : filteredAds.length === 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Sin anuncios para los filtros seleccionados.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredAds.map(ad => (
                  <AdCreativeCard
                    key={ad.id}
                    ad={ad}
                    adsetName={adsetNameById.get(ad.adset_id) || ad.adset_id}
                    campaignName={campaignNameById.get(ad.campaign_id) || ad.campaign_id}
                    onToggle={handleEntityToggle}
                    toggling={togglingIds.has(ad.ad_id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CAMPAÑAS TAB (existing content wrapped) ──────────────────────── */}
        {activeTab === "campaigns" && (<>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="ACTIVE">Activas</SelectItem>
                <SelectItem value="PAUSED">Pausadas</SelectItem>
                <SelectItem value="DELETED">Eliminadas</SelectItem>
                <SelectItem value="ARCHIVED">Archivadas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={objectiveFilter} onValueChange={setObjectiveFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Objetivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los objetivos</SelectItem>
                {uniqueObjectives.map(obj => (
                  <SelectItem key={obj} value={obj}>{obj}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs w-[130px] justify-start font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" locale={es} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs w-[130px] justify-start font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" locale={es} />
              </PopoverContent>
            </Popover>

            {(dateFrom || dateTo || objectiveFilter !== "all" || statusFilter !== "all") && (
              <Button size="sm" variant="ghost" className="h-8 text-xs"
                onClick={() => { setStatusFilter("all"); setObjectiveFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
                <X className="h-3 w-3 mr-1" /> Limpiar
              </Button>
            )}

            <Badge variant="secondary" className="text-xs">{filtered.length} campañas</Badge>
          </div>

          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Sincronizar
          </Button>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Gasto total",   value: `$${totals.spend.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: <DollarSign className="h-3.5 w-3.5" /> },
            { label: "Impresiones",   value: totals.impressions.toLocaleString("es"),   icon: <Eye className="h-3.5 w-3.5" /> },
            { label: "Clicks",        value: totals.clicks.toLocaleString("es"),        icon: <MousePointerClick className="h-3.5 w-3.5" /> },
            { label: "Leads",         value: totals.leads.toLocaleString("es"),         icon: <Users className="h-3.5 w-3.5" /> },
            { label: "CPL promedio",  value: `$${avgCpl.toFixed(2)}`,                  icon: <Target className="h-3.5 w-3.5" /> },
            { label: "CTR",           value: `${ctr.toFixed(2)}%`,                     icon: <TrendingUp className="h-3.5 w-3.5" /> },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1">
                  {k.icon} {k.label}
                </div>
                <p className="text-xl font-bold text-foreground tabular-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Analysis panel ─────────────────────────────────────────────── */}
        <AnalysisPanel scored={scored} />

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top campañas por gasto</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">Sin datos de campañas</div>
              ) : (
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="spend" fill="var(--color-spend)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Gasto por objetivo</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">Sin datos</div>
              ) : (
                <>
                  <ChartContainer config={chartConfig} className="h-[260px] w-full">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="45%" outerRadius={90} innerRadius={50}
                        dataKey="value" nameKey="name" paddingAngle={2}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap gap-2 justify-center -mt-2">
                    {pieData.slice(0, 5).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-1.5 text-xs">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Campaign table ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Detalle de campañas</CardTitle>
              <p className="text-xs text-muted-foreground">Puedes pausar o activar campañas directamente desde aquí</p>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : scored.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No hay campañas importadas. Ve a Integraciones para importar campañas de Meta Ads.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Campaña</th>
                      <th className="pb-2 pr-3 font-medium">Estado</th>
                      <th className="pb-2 pr-3 font-medium">Score</th>
                      <th className="pb-2 pr-3 font-medium">Objetivo</th>
                      <th className="pb-2 pr-3 font-medium text-right">Gasto</th>
                      <th className="pb-2 pr-3 font-medium text-right">Impresiones</th>
                      <th className="pb-2 pr-3 font-medium text-right">CTR</th>
                      <th className="pb-2 pr-3 font-medium text-right">Leads</th>
                      <th className="pb-2 font-medium text-right">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scored.map(c => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                        <td className="py-2.5 pr-3 font-medium text-foreground max-w-[180px]">
                          <div className="truncate" title={c.campaign_name}>{c.campaign_name}</div>
                          {c.insights.length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {c.insights.slice(0, 2).map((ins, i) => (
                                <span key={i} className={`text-[10px] ${INSIGHT_CONFIG[ins.type].color}`}>
                                  {ins.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <StatusToggle
                            campaign={c}
                            onToggle={handleToggle}
                            loading={togglingIds.has(c.campaign_id)}
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <ScoreBadge score={c.score} />
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground text-xs">{c.objective || "—"}</td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs">
                          ${(c.spend || 0).toLocaleString("es", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs">
                          {(c.impressions || 0).toLocaleString("es")}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-mono text-xs ${c.ctr < 0.5 && c.impressions ? "text-amber-600" : ""}`}>
                          {c.ctr.toFixed(2)}%
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold">
                          {(c.leads || 0).toLocaleString("es")}
                        </td>
                        <td className={`py-2.5 text-right font-mono text-xs ${!c.cpl ? "text-muted-foreground" : ""}`}>
                          {c.cpl ? `$${c.cpl.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        </>)} {/* end campaigns tab */}

      </main>
    </AppLayout>
  );
}

import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Image as ImageIcon, Download, ChevronRight, Layers, Video, Plus,
  ExternalLink, Maximize2,
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
  image_url: string | null; video_id: string | null; video_url: string | null;
  call_to_action: string | null;
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

/* ─── Creative preview modal ──────────────────────────────────────────────── */
function CreativePreviewModal({ ad, open, onClose }: { ad: MetaAd; open: boolean; onClose: () => void }) {
  const isVideo = !!(ad.video_url || ad.video_id);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {/* Media */}
        <div className="bg-black w-full">
          {ad.video_url ? (
            <video
              src={ad.video_url}
              controls
              autoPlay
              className="w-full max-h-[60vh] object-contain"
              poster={ad.image_url || undefined}
            />
          ) : ad.video_id ? (
            <iframe
              src={`https://www.facebook.com/video/embed?video_id=${ad.video_id}`}
              className="w-full aspect-video"
              allowFullScreen
              allow="autoplay; encrypted-media"
            />
          ) : ad.image_url ? (
            <img src={ad.image_url} alt={ad.ad_name} className="w-full max-h-[60vh] object-contain" />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center text-white/20">
              <ImageIcon className="h-16 w-16" />
            </div>
          )}
        </div>
        {/* Copy */}
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              {ad.headline && <p className="text-base font-bold text-foreground leading-snug">{ad.headline}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">{ad.ad_name}</p>
            </div>
            <Badge variant={ad.status === "ACTIVE" ? "default" : "secondary"} className="shrink-0 text-xs">
              {STATUS_LABELS[ad.status || ""] || ad.status}
            </Badge>
          </div>
          {ad.body && (
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{ad.body}</p>
          )}
          {ad.call_to_action && (
            <span className="inline-block bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-md">
              {CTA_LABELS[ad.call_to_action] || ad.call_to_action}
            </span>
          )}
          {/* Metrics row */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
            {(ad.spend || 0) > 0 && <span><span className="font-semibold text-foreground">${(ad.spend||0).toLocaleString("es",{minimumFractionDigits:2})}</span> gasto</span>}
            {(ad.impressions || 0) > 0 && <span><span className="font-semibold text-foreground">{(ad.impressions||0).toLocaleString("es")}</span> impresiones</span>}
            {(ad.clicks || 0) > 0 && <span><span className="font-semibold text-foreground">{ad.clicks}</span> clics</span>}
            {(ad.leads || 0) > 0 && <span><span className="font-semibold text-emerald-600">{ad.leads}</span> leads</span>}
            {ad.cpl && <span>CPL <span className="font-semibold text-foreground">${ad.cpl.toFixed(2)}</span></span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const [previewOpen,  setPreviewOpen]  = useState(false);

  const isActive  = ad.status === "ACTIVE";
  const canToggle = ad.status === "ACTIVE" || ad.status === "PAUSED";
  const ctaLabel  = ad.call_to_action ? (CTA_LABELS[ad.call_to_action] || ad.call_to_action) : null;
  const isVideo   = !!(ad.video_url || ad.video_id);
  const hasThumbnail = !!(ad.image_url);

  return (
    <>
      <Card className="border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">

        {/* ── Media area ─────────────────────────────────────────────────── */}
        <div
          className="relative w-full aspect-video bg-muted overflow-hidden group cursor-pointer"
          onClick={() => setPreviewOpen(true)}
        >
          {/* Video: native player */}
          {ad.video_url ? (
            <video
              src={ad.video_url}
              poster={ad.image_url || undefined}
              className="w-full h-full object-cover"
              preload="metadata"
              onClick={e => e.stopPropagation()} /* let the card click handle it */
            />
          ) : hasThumbnail ? (
            <img
              src={ad.image_url!}
              alt={ad.ad_name}
              className="w-full h-full object-cover"
              onError={e => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/25">
              {isVideo ? <Video className="h-12 w-12" /> : <ImageIcon className="h-12 w-12" />}
            </div>
          )}

          {/* Play button overlay for video */}
          {(isVideo && !ad.video_url) || (ad.video_url && hasThumbnail) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-black/50 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                <Play className="h-5 w-5 text-white ml-0.5" />
              </div>
            </div>
          ) : null}

          {/* Expand icon on hover */}
          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-md bg-black/50 p-1">
              <Maximize2 className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Status pill */}
          <div className="absolute top-2 right-2">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm",
              isActive ? "bg-emerald-500/90 text-white" : "bg-amber-400/90 text-white"
            )}>
              {isVideo && <Video className="h-2.5 w-2.5" />}
              {STATUS_LABELS[ad.status || ""] || ad.status}
            </span>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <CardContent className="p-3 flex flex-col gap-2 flex-1">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground overflow-hidden">
            <span className="truncate max-w-[80px] shrink-0">{campaignName}</span>
            <ChevronRight className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{adsetName}</span>
          </div>

          {/* Headline */}
          {ad.headline && (
            <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">{ad.headline}</p>
          )}

          {/* Body / caption */}
          {ad.body ? (
            <div>
              <p className={cn(
                "text-xs text-muted-foreground leading-relaxed",
                !bodyExpanded && "line-clamp-3"
              )}>
                {ad.body}
              </p>
              {ad.body.length > 140 && (
                <button
                  onClick={() => setBodyExpanded(v => !v)}
                  className="text-[10px] text-primary mt-0.5 hover:underline"
                >
                  {bodyExpanded ? "Ver menos" : "Ver más"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">Sin texto de anuncio</p>
          )}

          {/* CTA */}
          {ctaLabel && (
            <div className="mt-auto pt-1">
              <span className="inline-block bg-primary/10 text-primary text-[11px] font-semibold px-3 py-1 rounded-md">
                {ctaLabel}
              </span>
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] border-t pt-2 mt-1">
            <span className="text-muted-foreground">Gasto <span className="font-semibold text-foreground tabular-nums">${(ad.spend||0).toLocaleString("es",{minimumFractionDigits:2})}</span></span>
            <span className="text-muted-foreground">Leads <span className={cn("font-semibold tabular-nums", (ad.leads||0) > 0 ? "text-emerald-600" : "text-foreground")}>{ad.leads || 0}</span></span>
            {ad.cpl ? <span className="text-muted-foreground">CPL <span className="font-semibold text-foreground tabular-nums">${ad.cpl.toFixed(2)}</span></span> : null}
            {(ad.impressions||0) > 0 && <span className="text-muted-foreground">Impr. <span className="font-semibold text-foreground tabular-nums">{(ad.impressions||0).toLocaleString("es")}</span></span>}
          </div>

          {/* Action bar */}
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              <Maximize2 className="h-3 w-3" /> Ver creativo
            </button>
            {canToggle && (
              <button
                onClick={() => onToggle(ad.ad_id, "ad", isActive ? "PAUSED" : "ACTIVE")}
                disabled={toggling}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium border transition-all",
                  isActive
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
                  toggling && "opacity-50 cursor-not-allowed"
                )}
              >
                {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isActive ? "Pausar" : "Activar"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <CreativePreviewModal ad={ad} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}

/* ─── Campaign creation wizard (3 steps) ────────────────────────────────── */
const OBJECTIVES = [
  { value: "OUTCOME_LEADS",        label: "🎯 Leads",              desc: "Captura formularios y mensajes",   opt: "LEAD_GENERATION"     },
  { value: "OUTCOME_SALES",        label: "🛍️ Ventas",             desc: "Conversiones y compras",           opt: "OFFSITE_CONVERSIONS" },
  { value: "OUTCOME_TRAFFIC",      label: "🚀 Tráfico",            desc: "Visitas a tu sitio web",           opt: "LINK_CLICKS"         },
  { value: "OUTCOME_AWARENESS",    label: "📣 Reconocimiento",     desc: "Alcance e impresiones",            opt: "REACH"               },
  { value: "OUTCOME_ENGAGEMENT",   label: "💬 Interacción",        desc: "Likes, comentarios, mensajes",     opt: "POST_ENGAGEMENT"     },
  { value: "OUTCOME_APP_PROMOTION",label: "📱 Promoción de app",   desc: "Instalaciones y eventos en app",   opt: "APP_INSTALLS"        },
];

const CTA_OPTIONS = [
  { value: "LEARN_MORE",    label: "Más información" },
  { value: "SIGN_UP",       label: "Registrarse" },
  { value: "CONTACT_US",    label: "Contáctanos" },
  { value: "GET_QUOTE",     label: "Obtener cotización" },
  { value: "APPLY_NOW",     label: "Aplicar ahora" },
  { value: "DOWNLOAD",      label: "Descargar" },
  { value: "SHOP_NOW",      label: "Comprar ahora" },
  { value: "SUBSCRIBE",     label: "Suscribirse" },
  { value: "WATCH_MORE",    label: "Ver más" },
  { value: "GET_OFFER",     label: "Obtener oferta" },
];

async function invokeApi(body: Record<string, any>) {
  const { data: res, error: err } = await supabase.functions.invoke("facebook-api", { body });
  let errMsg: string | undefined;
  if (err) {
    try { const j = await (err as any).context?.json?.(); errMsg = j?.error || err.message; }
    catch { errMsg = err.message; }
  }
  return { res, err, errMsg };
}

function StepIndicator({ step }: { step: number }) {
  const steps = ["Campaña", "Conjunto", "Anuncio"];
  return (
    <div className="flex items-center gap-0 mb-5">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
            i + 1 === step  ? "bg-primary text-white"
            : i + 1 < step  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
            : "bg-muted text-muted-foreground"
          )}>
            {i + 1 < step ? <CheckCircle2 className="h-3 w-3" /> : <span>{i + 1}</span>}
            {s}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px w-4 mx-0.5", i + 1 < step ? "bg-emerald-400" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

function CreateCampaignDialog({
  open,
  onClose,
  adAccountId,
  pages,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  adAccountId: string | null;
  pages: { page_id: string; page_name: string }[];
  onCreated: (campaignId: string) => void;
}) {
  const [step,       setStep]       = useState(1);
  const [saving,     setSaving]     = useState(false);

  // Step 1 – Campaign
  const [camName,      setCamName]      = useState("");
  const [objective,    setObjective]    = useState("OUTCOME_LEADS");
  const [camBudget,    setCamBudget]    = useState("");
  const [startPaused,  setStartPaused]  = useState(true);
  const [campaignId,   setCampaignId]   = useState<string | null>(null);

  // Step 2 – Ad Set
  const [adsetName,    setAdsetName]    = useState("");
  const [adsetBudget,  setAdsetBudget]  = useState("");
  const [ageMin,       setAgeMin]       = useState("18");
  const [ageMax,       setAgeMax]       = useState("65");
  const [gender,       setGender]       = useState("all");
  const [adsetId,      setAdsetId]      = useState<string | null>(null);

  // Step 3 – Ad
  const [adName,       setAdName]       = useState("");
  const [pageId,       setPageId]       = useState("");
  const [imageUrl,     setImageUrl]     = useState("");
  const [headline,     setHeadline]     = useState("");
  const [adBody,       setAdBody]       = useState("");
  const [linkUrl,      setLinkUrl]      = useState("");
  const [cta,          setCta]          = useState("LEARN_MORE");

  const handleClose = () => {
    setStep(1);
    setCamName(""); setObjective("OUTCOME_LEADS"); setCamBudget(""); setStartPaused(true); setCampaignId(null);
    setAdsetName(""); setAdsetBudget(""); setAgeMin("18"); setAgeMax("65"); setGender("all"); setAdsetId(null);
    setAdName(""); setPageId(""); setImageUrl(""); setHeadline(""); setAdBody(""); setLinkUrl(""); setCta("LEARN_MORE");
    onClose();
  };

  // ── Step 1: Create campaign ────────────────────────────────────────────
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camName.trim() || !adAccountId) return;
    setSaving(true);
    const { res, errMsg } = await invokeApi({
      action: "create_campaign",
      ad_account_id: adAccountId,
      name: camName.trim(),
      objective,
      status: startPaused ? "PAUSED" : "ACTIVE",
      daily_budget: camBudget ? Number(camBudget) : undefined,
      special_ad_categories: [],
    });
    setSaving(false);
    if (!res?.success) {
      const { toast } = await import("sonner");
      toast.error(res?.error || errMsg || "Error al crear la campaña");
      return;
    }
    const { toast } = await import("sonner");
    toast.success("Campaña creada ✓");
    setCampaignId(res.campaign_id);
    // Pre-fill ad set name
    const obj = OBJECTIVES.find(o => o.value === objective);
    setAdsetName(`Conjunto – ${camName.trim()}`);
    setStep(2);
  };

  // ── Step 2: Create ad set ──────────────────────────────────────────────
  const handleCreateAdSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adsetName.trim() || !campaignId || !adAccountId) return;
    if (!adsetBudget || Number(adsetBudget) <= 0) {
      const { toast } = await import("sonner");
      toast.error("El presupuesto del conjunto es obligatorio");
      return;
    }
    setSaving(true);
    const obj = OBJECTIVES.find(o => o.value === objective);
    const genders = gender === "men" ? [1] : gender === "women" ? [2] : [];
    const { res, errMsg } = await invokeApi({
      action: "create_adset",
      ad_account_id: adAccountId,
      campaign_id: campaignId,
      name: adsetName.trim(),
      optimization_goal: obj?.opt || "LINK_CLICKS",
      daily_budget: Number(adsetBudget),
      age_min: Number(ageMin),
      age_max: Number(ageMax),
      genders,
      countries: ["CO"],
      status: "PAUSED",
    });
    setSaving(false);
    if (!res?.success) {
      const { toast } = await import("sonner");
      toast.error(res?.error || errMsg || "Error al crear el conjunto de anuncios");
      return;
    }
    const { toast } = await import("sonner");
    toast.success("Conjunto de anuncios creado ✓");
    setAdsetId(res.adset_id);
    setAdName(`Anuncio – ${camName.trim()}`);
    if (pages.length > 0) setPageId(pages[0].page_id);
    setStep(3);
  };

  // ── Step 3: Create ad ──────────────────────────────────────────────────
  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adName.trim() || !adsetId || !campaignId || !adAccountId || !pageId || !linkUrl.trim()) return;
    setSaving(true);
    const { res, errMsg } = await invokeApi({
      action: "create_ad",
      ad_account_id: adAccountId,
      adset_id: adsetId,
      campaign_id: campaignId,
      name: adName.trim(),
      page_id: pageId,
      image_url: imageUrl.trim() || undefined,
      headline: headline.trim() || undefined,
      body: adBody.trim() || undefined,
      link_url: linkUrl.trim(),
      call_to_action: cta,
      status: "PAUSED",
    });
    setSaving(false);
    if (!res?.success) {
      const { toast } = await import("sonner");
      toast.error(res?.error || errMsg || "Error al crear el anuncio");
      return;
    }
    const { toast } = await import("sonner");
    toast.success("¡Estructura creada completa! Campaña, conjunto y anuncio listos.");
    onCreated(campaignId!);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Nueva estructura de campaña
          </DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} />

        {/* ── Step 1: Campaign ── */}
        {step === 1 && (
          <form onSubmit={handleCreateCampaign} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cam-name" className="text-xs font-medium">Nombre de la campaña *</Label>
              <Input id="cam-name" value={camName} onChange={e => setCamName(e.target.value)}
                placeholder="Ej: Leads Julio 2026 – Formulario Web" required className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Objetivo *</Label>
              <div className="grid grid-cols-2 gap-2">
                {OBJECTIVES.map(obj => (
                  <button type="button" key={obj.value} onClick={() => setObjective(obj.value)}
                    className={cn("flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-all",
                      objective === obj.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/50")}>
                    <span className="text-xs font-semibold">{obj.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{obj.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cam-budget" className="text-xs font-medium">
                Presupuesto campaña (opcional) <span className="text-muted-foreground font-normal">— CBO</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input id="cam-budget" type="number" min="1" value={camBudget}
                  onChange={e => setCamBudget(e.target.value)} placeholder="0" className="h-9 pl-6" />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <button type="button" onClick={() => setStartPaused(v => !v)}
                className={cn("relative h-5 w-9 rounded-full transition-colors shrink-0", !startPaused ? "bg-emerald-500" : "bg-muted")}>
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  !startPaused ? "translate-x-4" : "translate-x-0.5")} />
              </button>
              <div>
                <p className="text-xs font-medium">{startPaused ? "Crear pausada" : "Activar al crear"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {startPaused ? "La activarás cuando el anuncio esté listo." : "Se activa inmediatamente en Meta."}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={saving || !camName.trim() || !adAccountId}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Siguiente: Conjunto →
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── Step 2: Ad Set ── */}
        {step === 2 && (
          <form onSubmit={handleCreateAdSet} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre del conjunto *</Label>
              <Input value={adsetName} onChange={e => setAdsetName(e.target.value)}
                placeholder="Ej: Colombia – 25-45 – Intereses" required className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Presupuesto diario (COP) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input type="number" min="1000" value={adsetBudget}
                  onChange={e => setAdsetBudget(e.target.value)} placeholder="50000" required className="h-9 pl-6" />
              </div>
              <p className="text-[10px] text-muted-foreground">Mínimo recomendado: $20,000 COP/día</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Edad mínima</Label>
                <Input type="number" min="18" max="64" value={ageMin}
                  onChange={e => setAgeMin(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Edad máxima</Label>
                <Input type="number" min="19" max="65" value={ageMax}
                  onChange={e => setAgeMax(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Género</Label>
              <div className="flex gap-2">
                {[{ v: "all", l: "Todos" }, { v: "men", l: "Hombres" }, { v: "women", l: "Mujeres" }].map(g => (
                  <button type="button" key={g.v} onClick={() => setGender(g.v)}
                    className={cn("flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                      gender === g.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40")}>
                    {g.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">
              🌍 Segmentación geográfica: <strong>Colombia</strong> · Más segmentaciones se configuran en Meta Ads Manager.
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>← Volver</Button>
              <Button type="submit" size="sm" disabled={saving || !adsetName.trim() || !adsetBudget}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Siguiente: Anuncio →
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── Step 3: Ad ── */}
        {step === 3 && (
          <form onSubmit={handleCreateAd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">Nombre del anuncio *</Label>
                <Input value={adName} onChange={e => setAdName(e.target.value)}
                  placeholder="Ej: Anuncio Principal – Imagen" required className="h-9" />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">Página de Facebook *</Label>
                <Select value={pageId} onValueChange={setPageId} required>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona una página…" />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.map(p => (
                      <SelectItem key={p.page_id} value={p.page_id} className="text-xs">{p.page_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">URL de imagen (opcional)</Label>
                <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://…/imagen.jpg" className="h-9" type="url" />
                <p className="text-[10px] text-muted-foreground">URL pública de la imagen (1200×628 recomendado)</p>
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">Titular (headline) <span className="text-muted-foreground">{headline.length}/40</span></Label>
                <Input value={headline} onChange={e => setHeadline(e.target.value.slice(0, 40))}
                  placeholder="Tu propuesta de valor en pocas palabras" className="h-9" />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">Texto principal <span className="text-muted-foreground">{adBody.length}/125</span></Label>
                <textarea
                  value={adBody}
                  onChange={e => setAdBody(e.target.value.slice(0, 125))}
                  placeholder="Descripción que aparece sobre la imagen…"
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">URL de destino *</Label>
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} required
                  placeholder="https://tu-sitio.com/landing" className="h-9" type="url" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Botón CTA</Label>
                <Select value={cta} onValueChange={setCta}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map(c => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)}>← Volver</Button>
              <Button type="submit" size="sm" disabled={saving || !adName.trim() || !pageId || !linkUrl.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Crear anuncio
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
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

/* ─── ROAS Attribution Tab ───────────────────────────────────────────────── */
function RoasTab({
  campaigns,
  roasData,
}: {
  campaigns: Campaign[];
  roasData: Record<string, { leads: number; won: number; revenue: number }>;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  // Build rows joining campaign spend with CRM attribution
  const rows = useMemo(() => {
    return campaigns
      .filter(c => (c.spend || 0) > 0 || roasData[c.campaign_id])
      .map(c => {
        const attr   = roasData[c.campaign_id] || { leads: 0, won: 0, revenue: 0 };
        const spend  = c.spend || 0;
        const roas   = spend > 0 && attr.revenue > 0 ? attr.revenue / spend : null;
        const cpl    = attr.leads > 0 && spend > 0   ? spend / attr.leads   : null;
        const winPct = attr.leads > 0                ? (attr.won / attr.leads) * 100 : null;
        return { ...c, attr, spend, roas, cpl, winPct };
      })
      .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1));
  }, [campaigns, roasData]);

  const totalSpend   = rows.reduce((s, r) => s + r.spend, 0);
  const totalRev     = rows.reduce((s, r) => s + r.attr.revenue, 0);
  const totalLeads   = rows.reduce((s, r) => s + r.attr.leads, 0);
  const totalWon     = rows.reduce((s, r) => s + r.attr.won, 0);
  const globalRoas   = totalSpend > 0 && totalRev > 0 ? totalRev / totalSpend : null;

  const noData = totalLeads === 0;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Inversión Meta",    value: fmt(totalSpend),        sub: "gasto total importado" },
          { label: "Ingresos atribuidos", value: fmt(totalRev),        sub: "deals ganados de Meta leads" },
          { label: "ROAS global",        value: globalRoas ? `${globalRoas.toFixed(2)}x` : "—", sub: "ingreso por cada $ invertido", highlight: globalRoas !== null },
          { label: "Tasa de cierre",     value: totalLeads > 0 ? `${((totalWon / totalLeads) * 100).toFixed(1)}%` : "—", sub: `${totalWon} ganados de ${totalLeads} leads` },
        ].map((k, i) => (
          <Card key={i} className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground mb-1">{k.label}</p>
              <p className={cn("text-xl font-bold tracking-tight", k.highlight && "text-emerald-600")}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attribution table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> ROAS por campaña
          </CardTitle>
          {noData && (
            <p className="text-xs text-muted-foreground">
              No hay leads importados con atribución de campaña aún.
              Importa leads desde la pestaña Campañas → Sincronizar para cruzar datos.
            </p>
          )}
        </CardHeader>
        {rows.length > 0 && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Campaña", "Estado", "Inversión", "Leads CRM", "Deals ganados", "Ingresos cerrados", "ROAS", "CPL real", "Tasa cierre"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.campaign_id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium max-w-[200px] truncate">{r.campaign_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{r.objective?.replace("OUTCOME_", "") || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full",
                          r.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        )}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{fmt(r.spend)}</td>
                      <td className="px-4 py-3">{r.attr.leads > 0 ? <span className="font-medium">{r.attr.leads}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">{r.attr.won > 0 ? <span className="font-medium text-emerald-600">{r.attr.won}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 font-medium text-emerald-600">{r.attr.revenue > 0 ? fmt(r.attr.revenue) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.roas !== null ? (
                          <span className={cn(
                            "font-bold px-2 py-0.5 rounded-full text-[11px]",
                            r.roas >= 3 ? "bg-emerald-100 text-emerald-700"
                            : r.roas >= 1 ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                          )}>{r.roas.toFixed(2)}x</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">{r.cpl !== null ? fmt(r.cpl) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">{r.winPct !== null ? `${r.winPct.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-semibold">¿Cómo funciona la atribución?</p>
        <p>Cada lead importado desde Meta (formularios o webhook) se etiqueta con el <strong>campaign_id</strong> del anuncio que lo generó. Cuando ese contacto avanza a <strong>deal ganado</strong> en tu pipeline, el valor del deal se atribuye a esa campaña.</p>
        <p className="text-blue-600 dark:text-blue-400">Para capturar UTMs de tu sitio web → próximamente con el pixel de seguimiento en landing pages.</p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function MetaAdsPage() {
  const { user } = useAuth();
  const fb = useFacebookIntegration();
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const queryClient = useQueryClient();

  const [activeTab,       setActiveTab]       = useState<"campaigns" | "ads" | "roas">("campaigns");
  const [statusFilter,    setStatusFilter]    = useState("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [dateFrom,        setDateFrom]        = useState<Date | undefined>();
  const [dateTo,          setDateTo]          = useState<Date | undefined>();
  const [togglingIds,     setTogglingIds]     = useState<Set<string>>(new Set());
  const [importingAds,      setImportingAds]      = useState(false);
  const [adCampaignFilter,  setAdCampaignFilter]  = useState("all");
  const [adStatusFilter,    setAdStatusFilter]    = useState("all");
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);

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

  /* ── ROAS attribution: contacts from Meta leads joined with won deals ── */
  const { data: roasContacts = [] } = useQuery({
    queryKey: ["meta-roas-contacts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("contacts")
        .select("meta_campaign_id, lead_status, budget, utm_campaign, campaign")
        .eq("owner_id", user.id)
        .or("meta_campaign_id.not.is.null,utm_campaign.not.is.null,campaign.not.is.null")
        .not("source", "is", null);
      return data || [];
    },
    enabled: !!user,
  });

  // Aggregate ROAS data per Meta campaign ID
  const roasData = useMemo(() => {
    const byId: Record<string, { leads: number; won: number; revenue: number }> = {};
    for (const c of roasContacts) {
      const key = c.meta_campaign_id || null;
      if (!key) continue;
      if (!byId[key]) byId[key] = { leads: 0, won: 0, revenue: 0 };
      byId[key].leads++;
      if (c.lead_status === "won") {
        byId[key].won++;
        byId[key].revenue += Number(c.budget) || 0;
      }
    }
    return byId;
  }, [roasContacts]);

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
            <button
              onClick={() => setActiveTab("roas")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "roas"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" /> Atribución ROAS
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportStructure}
              disabled={importingAds || campaigns.length === 0}
            >
              {importingAds
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                : <Download className="h-3.5 w-3.5 mr-1" />}
              {metaAds.length === 0 ? "Importar anuncios" : "Actualizar"}
            </Button>
          </div>
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

        {/* ── ROAS ATTRIBUTION TAB ─────────────────────────────────────────── */}
        {activeTab === "roas" && (
          <RoasTab campaigns={campaigns} roasData={roasData} />
        )}

      </main>
    </AppLayout>
  );
}

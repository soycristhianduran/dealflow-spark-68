import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, TrendingUp, TrendingDown, Target, AlertTriangle,
  CheckCircle2, ArrowRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface AIAnalysis {
  temperature: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  buying_intent: "high" | "medium" | "low" | "none";
  signals_detected: string[];
  objections: string[];
  next_best_action: string | null;
  reasoning: string | null;
  messages_analyzed: number;
  analyzed_at: string;
}

interface Props {
  contactId: string;
  onAnalysisComplete?: (newScore: number) => void;
}

export function AILeadAnalysisCard({ contactId, onAnalysisComplete }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contact_ai_analyses")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();
    setAnalysis(data as AIAnalysis | null);
    setLoading(false);
  }, [contactId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-contact-ai", {
        body: { contact_id: contactId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Análisis IA listo. Temperatura: ${data.analysis.temperature}/100`);
      await fetchAnalysis();
      if (data.new_contact_score != null) onAnalysisComplete?.(data.new_contact_score);
    } catch (e: any) {
      toast.error("Error al analizar: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Sentiment metadata
  const sentimentMeta = (s: string) => {
    switch (s) {
      case "positive": return { label: "Positivo", icon: <TrendingUp className="h-3 w-3" />, cls: "text-green-600 bg-green-50 border-green-300 dark:bg-green-950/30" };
      case "negative": return { label: "Negativo", icon: <TrendingDown className="h-3 w-3" />, cls: "text-red-600 bg-red-50 border-red-300 dark:bg-red-950/30" };
      case "mixed":    return { label: "Mixto",    icon: <AlertTriangle className="h-3 w-3" />, cls: "text-amber-600 bg-amber-50 border-amber-300 dark:bg-amber-950/30" };
      default:         return { label: "Neutral",  icon: <Target className="h-3 w-3" />, cls: "text-muted-foreground bg-muted border-border" };
    }
  };

  const intentMeta = (i: string) => {
    switch (i) {
      case "high":   return { label: "Alta", cls: "text-green-700 bg-green-100 dark:bg-green-950/40" };
      case "medium": return { label: "Media", cls: "text-yellow-700 bg-yellow-100 dark:bg-yellow-950/40" };
      case "low":    return { label: "Baja", cls: "text-orange-700 bg-orange-100 dark:bg-orange-950/40" };
      default:       return { label: "Ninguna", cls: "text-muted-foreground bg-muted" };
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando análisis IA...
        </div>
      </div>
    );
  }

  // No analysis yet
  if (!analysis) {
    return (
      <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold">Análisis IA del Lead</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Aún no se ha analizado este contacto con IA. El análisis evalúa el sentimiento y la intención de compra basándose en las conversaciones reales (WhatsApp, Instagram, llamadas, notas).
        </p>
        <Button
          size="sm"
          onClick={runAnalysis}
          disabled={analyzing}
          className="gap-2 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600"
        >
          {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando...</> : <><Sparkles className="h-3.5 w-3.5" /> Analizar con IA</>}
        </Button>
      </div>
    );
  }

  const sm = sentimentMeta(analysis.sentiment);
  const im = intentMeta(analysis.buying_intent);

  const tempColor =
    analysis.temperature >= 86 ? "from-green-500 to-emerald-500"
    : analysis.temperature >= 61 ? "from-orange-500 to-amber-500"
    : analysis.temperature >= 31 ? "from-yellow-500 to-amber-400"
    : "from-blue-500 to-cyan-500";

  return (
    <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/20 dark:to-pink-950/20 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Análisis IA del Lead</h3>
            <p className="text-[10px] text-muted-foreground">
              {analysis.messages_analyzed} mensaje(s) analizados · {formatDistanceToNow(new Date(analysis.analyzed_at), { addSuffix: true, locale: es })}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={runAnalysis}
          disabled={analyzing}
        >
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>

      {/* Temperature gauge */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Temperatura IA</span>
          <span className="font-bold">{analysis.temperature}/100</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${tempColor} transition-all`}
            style={{ width: `${analysis.temperature}%` }}
          />
        </div>
      </div>

      {/* Sentiment + Intent badges */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className={`text-[10px] gap-1 ${sm.cls}`}>
          {sm.icon} Sentimiento: {sm.label}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${im.cls}`}>
          Intención de compra: {im.label}
        </Badge>
      </div>

      {/* Reasoning */}
      {analysis.reasoning && (
        <div className="rounded-lg bg-white/60 dark:bg-black/20 p-2.5">
          <p className="text-xs italic text-muted-foreground">
            "{analysis.reasoning}"
          </p>
        </div>
      )}

      {/* Signals detected */}
      {analysis.signals_detected?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-green-700 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Señales positivas
          </p>
          <ul className="space-y-0.5">
            {analysis.signals_detected.map((s, i) => (
              <li key={i} className="text-xs text-foreground/80 pl-4 relative before:content-['✓'] before:absolute before:left-0 before:text-green-600">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objections */}
      {analysis.objections?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Objeciones detectadas
          </p>
          <ul className="space-y-0.5">
            {analysis.objections.map((o, i) => (
              <li key={i} className="text-xs text-foreground/80 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-amber-600">
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next best action */}
      {analysis.next_best_action && (
        <div className="rounded-lg border border-violet-200 bg-violet-100/50 dark:border-violet-900/50 dark:bg-violet-950/30 p-2.5 flex gap-2">
          <ArrowRight className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
              Próxima mejor acción
            </p>
            <p className="text-xs text-foreground mt-0.5">{analysis.next_best_action}</p>
          </div>
        </div>
      )}
    </div>
  );
}

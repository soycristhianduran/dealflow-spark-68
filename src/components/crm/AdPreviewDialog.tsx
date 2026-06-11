import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Loader2, Megaphone, AlertCircle, Image as ImageIcon } from "lucide-react";

interface Creative {
  name?: string | null;
  caption?: string | null;
  title?: string | null;
  image_url?: string | null;
  video_id?: string | null;
  child_attachments?: { picture?: string; name?: string; description?: string; link?: string }[] | null;
}
interface PreviewData {
  previews: { format: string; body: string }[];
  creative: Creative | null;
}

const FORMAT_LABELS: Record<string, string> = {
  MOBILE_FEED_STANDARD: "Feed móvil",
  INSTAGRAM_STANDARD: "Instagram",
  DESKTOP_FEED_STANDARD: "Feed escritorio",
};

export function AdPreviewDialog({ open, onOpenChange, adId, adName }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adId: string | null;
  adName?: string | null;
}) {
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fmt, setFmt] = useState<string>("");

  useEffect(() => {
    if (!open || !adId) return;
    setLoading(true); setError(null); setData(null);
    supabase.functions.invoke("facebook-api", { body: { action: "get_ad_preview", ad_id: adId, organization_id: organizationId } })
      .then(({ data: d, error: e }) => {
        if (e || d?.error) { setError(d?.error || e?.message || "No se pudo cargar el anuncio"); return; }
        setData(d);
        setFmt(d?.previews?.[0]?.format || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, adId]);

  const preview = data?.previews?.find(p => p.format === fmt) || data?.previews?.[0];
  const creative = data?.creative;
  const carousel = creative?.child_attachments;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-blue-500" />
            <span className="truncate">{adName || creative?.name || "Anuncio"}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Cargando anuncio…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <AlertCircle className="h-7 w-7 text-amber-500" />
            <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
            <p className="text-xs text-muted-foreground">El anuncio puede haber sido eliminado o ya no está disponible en Meta.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Caption */}
            {creative?.caption && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Texto del anuncio</p>
                <p className="text-sm whitespace-pre-wrap">{creative.caption}</p>
              </div>
            )}

            {/* Format switch */}
            {data && data.previews.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {data.previews.map(p => (
                  <button
                    key={p.format}
                    onClick={() => setFmt(p.format)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      (fmt || data.previews[0].format) === p.format
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {FORMAT_LABELS[p.format] || p.format}
                  </button>
                ))}
              </div>
            )}

            {/* Rendered ad preview (Meta iframe) */}
            {preview ? (
              <div className="flex justify-center overflow-hidden rounded-lg border bg-white">
                <div
                  className="origin-top"
                  style={{ transform: "scale(0.95)" }}
                  dangerouslySetInnerHTML={{ __html: preview.body }}
                />
              </div>
            ) : carousel && carousel.length > 0 ? (
              /* Carousel fallback from creative */
              <div className="flex gap-2 overflow-x-auto pb-2">
                {carousel.map((c, i) => (
                  <div key={i} className="shrink-0 w-40 rounded-lg border overflow-hidden">
                    {c.picture && <img src={c.picture} alt={c.name || ""} className="w-full h-40 object-cover" />}
                    {c.name && <p className="text-xs font-medium p-2 line-clamp-2">{c.name}</p>}
                  </div>
                ))}
              </div>
            ) : creative?.image_url ? (
              <img src={creative.image_url} alt={creative.title || "Anuncio"} className="w-full rounded-lg border" />
            ) : creative?.video_id ? (
              <div className="rounded-lg border overflow-hidden aspect-video">
                <iframe
                  title="Video del anuncio"
                  src={`https://www.facebook.com/video/embed?video_id=${creative.video_id}`}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <ImageIcon className="h-7 w-7 opacity-40" />
                <p className="text-sm">No hay vista previa disponible para este anuncio.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

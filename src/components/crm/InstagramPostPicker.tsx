import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInstagramIntegration, IgMedia } from "@/hooks/useInstagramIntegration";
import {
  Loader2, Image as ImageIcon, Film, Layers, Heart, MessageCircle,
  Check, X, Search, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMediaIds: string[];
  onSelect: (mediaIds: string[]) => void;
}

/**
 * Full-screen picker for Instagram posts.
 * Rendered via portal so it always paints above any overlay (e.g. the editor at z-[9999]).
 * Supports multi-select: user picks several posts, then taps "Confirmar".
 */
export function InstagramPostPicker({ open, onOpenChange, selectedMediaIds, onSelect }: Props) {
  const { t } = useTranslation();
  const ig = useInstagramIntegration();
  const [media, setMedia] = useState<IgMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // Local selection (committed only when user taps Confirmar)
  const [localSelected, setLocalSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setLocalSelected(selectedMediaIds);
    setLoading(true);
    ig.listMedia(48)
      .then(setMedia)
      .catch((e) => toast.error(t("instagramPostPicker.loadError", { message: e.message })))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = media.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.caption || "").toLowerCase().includes(q) || m.id.includes(q);
  });

  const toggle = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onSelect(localSelected);
    onOpenChange(false);
  };

  const handleClearAll = () => {
    setLocalSelected([]);
  };

  const typeIcon = (type: string) => {
    if (type === "VIDEO") return <Film className="h-3 w-3" />;
    if (type === "CAROUSEL_ALBUM") return <Layers className="h-3 w-3" />;
    return <ImageIcon className="h-3 w-3" />;
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 md:px-8 py-3 border-b bg-background/95 backdrop-blur shrink-0">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t("instagramPostPicker.back")}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-semibold">{t("instagramPostPicker.selectPosts")}</span>
        <div className="flex-1" />
        {localSelected.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> {t("instagramPostPicker.applyToAll")}
          </button>
        )}
        <Button
          onClick={handleConfirm}
          size="sm"
          className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white gap-1.5"
        >
          <Check className="h-4 w-4" />
          {localSelected.length > 0
            ? t("instagramPostPicker.confirmCount", { count: localSelected.length })
            : t("instagramPostPicker.applyToAll")}
        </Button>
      </div>

      {/* Subtitle */}
      <div className="px-4 md:px-8 py-2 border-b bg-muted/30">
        <p className="text-xs text-muted-foreground">
          {t("instagramPostPicker.subtitle")}
          {localSelected.length === 0
            ? " " + t("instagramPostPicker.subtitleNoSelection")
            : " " + t("instagramPostPicker.subtitleSelectedCount", { count: localSelected.length })}
        </p>
      </div>

      {/* Search bar */}
      <div className="px-4 md:px-8 py-3 border-b">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("instagramPostPicker.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-4">
        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{t("instagramPostPicker.loading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? t("instagramPostPicker.noResults") : t("instagramPostPicker.noPosts")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((m) => {
              const isSelected = localSelected.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={`relative group rounded-xl overflow-hidden border-2 transition-all aspect-square ${
                    isSelected
                      ? "border-pink-500 ring-2 ring-pink-500/30"
                      : "border-border hover:border-pink-500/50"
                  }`}
                >
                  {m.preview_url ? (
                    <img
                      src={m.preview_url}
                      alt=""
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Type badge */}
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur rounded-md px-1.5 py-0.5 text-white text-[10px] flex items-center gap-1">
                    {typeIcon(m.media_type)}
                  </div>

                  {/* Selected check */}
                  {isSelected ? (
                    <div className="absolute top-2 left-2 bg-pink-500 rounded-full p-1 shadow-md">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className="absolute top-2 left-2 rounded-full p-1 border-2 border-white/60 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="h-3 w-3" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white text-left">
                    <div className="flex items-center gap-3 text-[11px] mb-1">
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-3 w-3" /> {m.like_count ?? 0}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="h-3 w-3" /> {m.comments_count ?? 0}
                      </span>
                    </div>
                    {m.caption && (
                      <p className="text-[10px] line-clamp-2 leading-tight">{m.caption}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 md:px-8 py-3 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground shrink-0">
        <span>{t("instagramPostPicker.postsCount", { count: filtered.length })}</span>
        {localSelected.length > 0 && (
          <span className="text-pink-500 font-medium">
            {t("instagramPostPicker.selectedCount", { count: localSelected.length })}
          </span>
        )}
      </div>
    </div>,
    document.body
  );
}

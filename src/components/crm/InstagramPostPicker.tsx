import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInstagramIntegration, IgMedia } from "@/hooks/useInstagramIntegration";
import { Loader2, Image as ImageIcon, Film, Layers, Heart, MessageCircle, Check, X, Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMediaId: string | null;
  onSelect: (mediaId: string | null) => void;
}

/**
 * Visual picker for Instagram posts.  Lets the user browse their recent
 * publications and click one to use as the trigger filter, instead of
 * having to paste a Media ID by hand.
 */
export function InstagramPostPicker({ open, onOpenChange, selectedMediaId, onSelect }: Props) {
  const ig = useInstagramIntegration();
  const [media, setMedia] = useState<IgMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ig.listMedia(48)
      .then(setMedia)
      .catch((e) => toast.error("Error al cargar publicaciones: " + e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = media.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.caption || "").toLowerCase().includes(q) || m.id.includes(q);
  });

  const handleSelect = (m: IgMedia) => {
    onSelect(m.id);
    onOpenChange(false);
  };

  const handleClear = () => {
    onSelect(null);
    onOpenChange(false);
  };

  const typeIcon = (type: string) => {
    if (type === "VIDEO") return <Film className="h-3 w-3" />;
    if (type === "CAROUSEL_ALBUM") return <Layers className="h-3 w-3" />;
    return <ImageIcon className="h-3 w-3" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 px-6 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Selecciona una publicación</DialogTitle>
            <p className="text-xs text-white/80 mt-1">
              Elige el post donde quieres que se active esta automatización. Si no eliges ninguno, aplica a todos.
            </p>
          </DialogHeader>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por caption o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          {selectedMediaId && (
            <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 shrink-0">
              <X className="h-3.5 w-3.5" /> Aplicar a todas
            </Button>
          )}
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1 px-6 py-4">
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Cargando tus publicaciones...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Sin resultados" : "No se encontraron publicaciones"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((m) => {
                const isSelected = selectedMediaId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSelect(m)}
                    className={`relative group rounded-xl overflow-hidden border-2 transition-all aspect-square ${
                      isSelected
                        ? "border-pink-500 ring-2 ring-pink-500/30"
                        : "border-transparent hover:border-pink-500/50"
                    }`}
                  >
                    {m.preview_url ? (
                      <img
                        src={m.preview_url}
                        alt=""
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
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

                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-2 left-2 bg-pink-500 rounded-full p-1">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}

                    {/* Hover overlay with stats + caption */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white text-left">
                      <div className="flex items-center gap-3 text-[11px] mb-1">
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-3 w-3" /> {m.like_count}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle className="h-3 w-3" /> {m.comments_count}
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
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} publicaciones</span>
          {selectedMediaId && (
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <Check className="h-3 w-3 text-pink-500" />
              ID: {selectedMediaId.slice(-12)}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

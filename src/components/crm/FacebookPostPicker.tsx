import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FbPost {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time?: string;
}

/**
 * Facebook page post picker — mirror of InstagramPostPicker for the RRSS
 * comment automations. Empty selection = automation applies to ALL posts.
 */
export function FacebookPostPicker({
  open, onOpenChange, pageId, organizationId, selectedPostIds, onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  organizationId: string | null;
  selectedPostIds: string[];
  onSelect: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<FbPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(selectedPostIds);
  const [search, setSearch] = useState("");

  useEffect(() => { setSelected(selectedPostIds); }, [selectedPostIds, open]);

  useEffect(() => {
    if (!open || !pageId) return;
    setLoading(true);
    setError(null);
    supabase.functions.invoke("facebook-api", {
      body: { action: "get_page_posts", page_id: pageId, organization_id: organizationId, limit: 50 },
    }).then(({ data, error }) => {
      if (error || data?.error) setError(data?.error || error?.message || "Error");
      else setPosts(data?.posts || []);
      setLoading(false);
    });
  }, [open, pageId, organizationId]);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const visible = posts.filter(p =>
    !search.trim() || (p.message || "").toLowerCase().includes(search.toLowerCase()) || p.id.includes(search.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("facebookPostPicker.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("facebookPostPicker.hint")}</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("facebookPostPicker.searchPlaceholder")} className="pl-8 h-9" />
        </div>
        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-10">{error}</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("facebookPostPicker.empty")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1">
              {visible.map(p => {
                const active = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`relative rounded-lg border-2 overflow-hidden text-left transition-all ${
                      active ? "border-blue-500 ring-1 ring-blue-500/40" : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    {p.full_picture ? (
                      <img src={p.full_picture} alt="" className="h-28 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-28 w-full flex items-center justify-center bg-muted">
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    {active && (
                      <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-blue-500 text-white text-[11px] flex items-center justify-center">✓</span>
                    )}
                    <p className="text-[10px] text-muted-foreground p-1.5 line-clamp-2 min-h-[2.2rem]">
                      {p.message || t("facebookPostPicker.noCaption")}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={selected.length === 0}>
            {t("facebookPostPicker.clear")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("facebookPostPicker.cancel")}</Button>
          <Button size="sm" onClick={() => { onSelect(selected); onOpenChange(false); }}>
            {selected.length > 0
              ? t("facebookPostPicker.applyCount", { count: selected.length })
              : t("facebookPostPicker.applyAll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

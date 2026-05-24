import { useRef, useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Globe, Eye, EyeOff, Link2,
  Sparkles, MousePointer, RefreshCw, Edit2, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
// @ts-expect-error — react-email-editor ships without bundled types in v1
import EmailEditor from "react-email-editor";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LandingPage {
  id: string;
  name: string;
  slug: string | null;
  html: string | null;
  design: object | null;
  prompt: string | null;
  mode: "ai" | "drag";
  status: "draft" | "published";
  views: number;
  leads_count: number;
  updated_at: string;
}

type EditorMode = "ai" | "drag";

// ── Slug generator ────────────────────────────────────────────────────────────
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    || `landing-${Date.now()}`;
}

// ── Public URL builder ────────────────────────────────────────────────────────
// pages.klosify.com/<slug> — served by the Cloudflare Worker
// Fallback to Supabase function URL during development / before DNS is set up
const PAGES_DOMAIN = (import.meta as any).env?.VITE_PAGES_DOMAIN || "pages.klosify.com";
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL
  || "https://oqwcgvemrvimrdrzjzil.supabase.co";

function getPublicUrl(slug: string) {
  // Use the pretty domain once the Worker is live; fallback to Supabase URL
  if (PAGES_DOMAIN && PAGES_DOMAIN !== "pages.klosify.com") {
    return `https://${PAGES_DOMAIN}/${slug}`;
  }
  // Default: pages.klosify.com (Cloudflare Worker)
  return `https://pages.klosify.com/${slug}`;
}

function getPreviewUrl(slug: string) {
  // Always use Supabase directly for preview (Worker might not be deployed yet)
  return `${SUPABASE_URL}/functions/v1/serve-landing?slug=${slug}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandingBuilderPage() {
  // Editor
  const editorRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Pages list
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);

  // Current page
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("Nueva landing");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [mode, setMode] = useState<EditorMode>("ai");
  const [views, setViews] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);

  // AI mode
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [slugEditing, setSlugEditing] = useState(false);

  // ── Fetch pages ─────────────────────────────────────────────────────────────
  const fetchPages = useCallback(async () => {
    const { data } = await supabase
      .from("landing_pages")
      .select("id,name,slug,html,design,prompt,mode,status,views,leads_count,updated_at")
      .order("updated_at", { ascending: false });
    setPages((data || []) as LandingPage[]);
    setLoadingPages(false);
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  // ── Select page ─────────────────────────────────────────────────────────────
  const selectPage = useCallback((page: LandingPage) => {
    setSelectedId(page.id);
    setName(page.name);
    setSlug(page.slug || "");
    setStatus(page.status);
    setMode(page.mode);
    setViews(page.views || 0);
    setLeadsCount(page.leads_count || 0);
    setGeneratedHtml(page.html || "");
    setPreviewHtml(page.html || "");
    setPrompt(page.prompt || "");

    if (page.mode === "drag" && editorReady && page.design) {
      editorRef.current?.editor?.loadDesign(page.design);
    }
  }, [editorReady]);

  // ── Editor ready ────────────────────────────────────────────────────────────
  const handleEditorReady = () => {
    setEditorReady(true);
    if (mode === "drag") {
      const current = pages.find(p => p.id === selectedId);
      if (current?.design) {
        editorRef.current?.editor?.loadDesign(current.design);
      }
    }
  };

  // ── Create new page ─────────────────────────────────────────────────────────
  const handleCreatePage = async () => {
    if (!newPageName.trim()) return;
    const generatedSlug = toSlug(newPageName);
    const { data, error } = await supabase
      .from("landing_pages")
      .insert({ name: newPageName.trim(), slug: generatedSlug, mode: "ai" })
      .select()
      .single();
    if (error) { toast.error("Error al crear la página"); return; }
    const newPage = data as LandingPage;
    setPages(prev => [newPage, ...prev]);
    selectPage(newPage);
    setNewPageOpen(false);
    setNewPageName("");
    toast.success("Página creada");
  };

  // ── Delete page ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("landing_pages").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    setPages(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setGeneratedHtml("");
      setPreviewHtml("");
    }
    toast.success("Página eliminada");
  };

  // ── AI Generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Escribe qué quieres en tu landing page"); return; }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("generate-landing", {
        body: { prompt: prompt.trim(), page_id: selectedId || "PENDING" },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      const html = res.data.html as string;
      setGeneratedHtml(html);
      setPreviewHtml(html);
      toast.success("¡Landing generada!");
    } catch (e: any) {
      toast.error(e.message || "Error generando la landing");
    } finally {
      setGenerating(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (publishOverride?: boolean) => {
    if (!selectedId) { toast.error("Selecciona o crea una página primero"); return; }
    setSaving(true);

    const targetStatus = publishOverride !== undefined ? (publishOverride ? "published" : "draft") : status;

    try {
      if (mode === "drag") {
        // Export from Unlayer
        await new Promise<void>((resolve, reject) => {
          editorRef.current?.editor?.exportHtml(async (exportData: { design: object; html: string }) => {
            try {
              const { error } = await supabase
                .from("landing_pages")
                .update({
                  name, slug: slug || toSlug(name),
                  html: exportData.html,
                  design: exportData.design,
                  mode: "drag",
                  status: targetStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", selectedId);
              if (error) throw error;
              resolve();
            } catch (e) { reject(e); }
          });
        });
      } else {
        // AI mode — save generatedHtml
        const { error } = await supabase
          .from("landing_pages")
          .update({
            name, slug: slug || toSlug(name),
            html: generatedHtml,
            prompt,
            mode: "ai",
            status: targetStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedId);
        if (error) throw error;
      }

      setStatus(targetStatus);
      await fetchPages();
      toast.success(targetStatus === "published" ? "¡Landing publicada!" : "Guardado");
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [selectedId, mode, name, slug, status, generatedHtml, prompt, fetchPages]);

  // ── Copy URL ────────────────────────────────────────────────────────────────
  const copyUrl = () => {
    const effectiveSlug = slug || toSlug(name);
    if (!effectiveSlug) { toast.error("La página necesita un slug para tener URL pública"); return; }
    navigator.clipboard.writeText(getPublicUrl(effectiveSlug));
    toast.success("URL copiada: pages.klosify.com/" + effectiveSlug);
  };

  const openPublicUrl = () => {
    const effectiveSlug = slug || toSlug(name);
    if (status !== "published") { toast.error("Publica la página primero"); return; }
    window.open(getPublicUrl(effectiveSlug), "_blank");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex h-full">

        {/* ── Left sidebar: page list ── */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-background">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm">Landings</span>
            <Button size="sm" variant="ghost" onClick={() => setNewPageOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingPages && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingPages && pages.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-8">
                Sin landing pages aún.
                <br />
                <button
                  className="text-primary underline mt-1"
                  onClick={() => setNewPageOpen(true)}
                >
                  Crear la primera
                </button>
              </div>
            )}
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => selectPage(page)}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent group",
                  selectedId === page.id && "bg-accent"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-medium">{page.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        page.status === "published"
                          ? "border-green-500 text-green-600"
                          : "border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {page.status === "published" ? "Publicada" : "Borrador"}
                    </Badge>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(page.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Eye className="h-2.5 w-2.5" /> {page.views}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <BarChart2 className="h-2.5 w-2.5" /> {page.leads_count} leads
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main editor area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
            {selectedId ? (
              <>
                {/* Page name */}
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-sm font-medium w-52 border-0 shadow-none focus-visible:ring-1"
                  placeholder="Nombre de la página"
                />

                {/* Slug / public URL */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="text-muted-foreground/60 shrink-0">pages.klosify.com/</span>
                  {slugEditing ? (
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, "-").toLowerCase())}
                      onBlur={() => setSlugEditing(false)}
                      className="h-6 text-xs w-28"
                      autoFocus
                    />
                  ) : (
                    <button
                      className="hover:text-foreground underline font-mono"
                      onClick={() => setSlugEditing(true)}
                      title="Editar slug"
                    >
                      {slug || toSlug(name)}
                    </button>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={copyUrl} className="ml-0.5">
                          <Link2 className="h-3 w-3 hover:text-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Copiar URL pública</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {status === "published" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={openPublicUrl}>
                            <Eye className="h-3 w-3 hover:text-foreground" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Ver página publicada</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground ml-2">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {views} vistas</span>
                  <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" /> {leadsCount} leads</span>
                </div>

                <div className="flex-1" />

                {/* Mode switcher */}
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    onClick={() => setMode("ai")}
                    className={cn(
                      "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                      mode === "ai" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    <Sparkles className="h-3 w-3" /> IA
                  </button>
                  <button
                    onClick={() => setMode("drag")}
                    className={cn(
                      "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                      mode === "drag" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    <MousePointer className="h-3 w-3" /> Drag & Drop
                  </button>
                </div>

                {/* Status toggle */}
                <Button
                  size="sm"
                  variant={status === "published" ? "destructive" : "outline"}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => handleSave(status !== "published")}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "published" ? <EyeOff className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {status === "published" ? "Despublicar" : "Publicar"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="h-8 text-xs"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Selecciona una landing page o{" "}
                <button className="text-primary underline" onClick={() => setNewPageOpen(true)}>
                  crea una nueva
                </button>
              </div>
            )}
          </div>

          {/* Editor body */}
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
              <Globe className="h-12 w-12 opacity-20" />
              <p className="text-sm">Ninguna landing seleccionada</p>
              <Button onClick={() => setNewPageOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nueva landing page
              </Button>
            </div>
          ) : mode === "ai" ? (
            /* ── AI Mode ── */
            <div className="flex-1 flex min-h-0">
              {/* Prompt panel */}
              <div className="w-80 shrink-0 border-r border-border flex flex-col p-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Describe tu landing page
                  </Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ej: Landing para un curso de fotografía profesional. Quiero capturar emails de personas interesadas. El CTA es 'Reservar mi lugar'. Incluye testimonios y sección de beneficios."
                    className="min-h-[200px] text-sm resize-none"
                  />
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="w-full gap-2"
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> {generatedHtml ? "Regenerar" : "Generar landing"}</>
                  )}
                </Button>

                {generatedHtml && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setMode("drag")}
                  >
                    <MousePointer className="h-3.5 w-3.5" />
                    Editar con drag & drop
                  </Button>
                )}

                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <p className="font-medium">Consejos:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Menciona tu producto/servicio</li>
                    <li>Indica el público objetivo</li>
                    <li>Especifica el CTA principal</li>
                    <li>Describe el estilo deseado</li>
                  </ul>
                </div>
              </div>

              {/* Preview */}
              <div className="flex-1 flex flex-col min-w-0">
                {!previewHtml ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
                    <Sparkles className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Describe tu landing page y haz clic en "Generar"</p>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground flex items-center gap-2">
                      <Eye className="h-3 w-3" /> Vista previa
                      <button
                        className="ml-auto flex items-center gap-1 hover:text-foreground"
                        onClick={handleGenerate}
                        disabled={generating}
                      >
                        <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
                        Regenerar
                      </button>
                    </div>
                    <iframe
                      srcDoc={previewHtml}
                      className="flex-1 w-full border-0"
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      title="Vista previa landing"
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── Drag & Drop Mode (Unlayer web) ── */
            <div className="flex-1 min-h-0">
              <EmailEditor
                ref={editorRef}
                onReady={handleEditorReady}
                minHeight="100%"
                options={{
                  displayMode: "web",
                  locale: "es-ES",
                  features: {
                    userUploads: false,
                  },
                  tools: {
                    form: { enabled: true },
                  },
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── New page dialog ── */}
      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva landing page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nombre de la página</Label>
              <Input
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                placeholder="Ej: Webinar marketing digital"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              URL pública: <span className="font-mono">{toSlug(newPageName) || "mi-landing"}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreatePage} disabled={!newPageName.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

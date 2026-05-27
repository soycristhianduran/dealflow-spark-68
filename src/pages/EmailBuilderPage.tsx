import { useRef, useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Trash2, Loader2, FileText, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { STARTER_TEMPLATES, CATEGORIES, CATEGORY_COLORS } from "@/data/starterEmailTemplates";
// @ts-expect-error — react-email-editor ships without bundled types in v1
import EmailEditor from "react-email-editor";

interface Template {
  id: string;
  name: string;
  subject: string;
  design: object | null;
  html: string | null;
  updated_at: string;
}

export default function EmailBuilderPage() {
  const editorRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  // Current template metadata
  const [name, setName] = useState("Nueva plantilla");
  const [subject, setSubject] = useState("");

  // Save-as dialog
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // Gallery dialog
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [galleryCategory, setGalleryCategory] = useState<string>("Todos");

  // ── Load template list ──────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("email_templates")
      .select("id, name, subject, design, html, updated_at")
      .order("updated_at", { ascending: false });
    setTemplates((data || []) as Template[]);
    setLoadingTemplates(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // ── Load a template into the editor ────────────────────────────────────
  const loadTemplate = useCallback((tpl: Template) => {
    setSelectedId(tpl.id);
    setName(tpl.name);
    setSubject(tpl.subject || "");
    if (editorReady && tpl.design) {
      editorRef.current?.editor?.loadDesign(tpl.design);
    }
  }, [editorReady]);

  // When editor becomes ready, reload selected template's design
  const handleEditorReady = () => {
    setEditorReady(true);
    const selected = templates.find(t => t.id === selectedId);
    if (selected?.design) {
      editorRef.current?.editor?.loadDesign(selected.design);
    }
  };

  // ── Save (update existing) ──────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!editorReady) return;
    editorRef.current?.editor?.exportHtml(async (data: { design: object; html: string }) => {
      setSaving(true);
      try {
        if (selectedId) {
          const { error } = await supabase.from("email_templates").update({
            name, subject, design: data.design, html: data.html, updated_at: new Date().toISOString(),
          }).eq("id", selectedId);
          if (error) throw error;
          toast.success("Plantilla guardada");
          fetchTemplates();
        } else {
          setSaveAsOpen(true);
          setNewName(name);
        }
      } catch (e: any) {
        toast.error("Error al guardar: " + e.message);
      } finally {
        setSaving(false);
      }
    });
  }, [editorReady, selectedId, name, subject, fetchTemplates]);

  // ── Save as new ─────────────────────────────────────────────────────────
  const handleSaveAs = useCallback(() => {
    if (!editorReady) return;
    editorRef.current?.editor?.exportHtml(async (data: { design: object; html: string }) => {
      if (!newName.trim()) { toast.error("El nombre es obligatorio"); return; }
      setSaving(true);
      try {
        const { data: row, error } = await supabase.from("email_templates").insert({
          name: newName.trim(), subject, design: data.design, html: data.html,
        }).select("id").single();
        if (error) throw error;
        toast.success("Plantilla creada");
        setSelectedId(row.id);
        setName(newName.trim());
        setSaveAsOpen(false);
        fetchTemplates();
      } catch (e: any) {
        toast.error("Error: " + e.message);
      } finally {
        setSaving(false);
      }
    });
  }, [editorReady, newName, subject, fetchTemplates]);

  // ── New blank ───────────────────────────────────────────────────────────
  const handleNew = () => {
    setSelectedId(null);
    setName("Nueva plantilla");
    setSubject("");
    editorRef.current?.editor?.loadDesign(null);
  };

  // ── Load starter template ────────────────────────────────────────────────
  const handleLoadStarter = (tpl: typeof STARTER_TEMPLATES[0]) => {
    setSelectedId(null);
    setName(tpl.name);
    setSubject(tpl.subject);
    if (editorReady) {
      editorRef.current?.editor?.loadDesign(tpl.design);
    }
    setGalleryOpen(false);
    toast.success(`Plantilla "${tpl.name}" cargada — personalízala y guarda`);
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar"); return; }
    toast.success("Plantilla eliminada");
    if (selectedId === id) handleNew();
    fetchTemplates();
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short" });

  return (
    <AppLayout>
      <AppHeader
        title="Constructor de emails"
        subtitle="Diseña plantillas con drag & drop"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGalleryOpen(true)}>
              <LayoutTemplate className="h-4 w-4" /> Plantillas
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleNew}>
              <Plus className="h-4 w-4" /> Nueva
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving || !editorReady}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {selectedId ? "Guardar" : "Guardar como…"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: template list ── */}
        <aside className="w-60 border-r flex flex-col shrink-0 bg-muted/20">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mis plantillas</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingTemplates ? (
              <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Aún no tienes plantillas
              </div>
            ) : templates.map(tpl => (
              <div
                key={tpl.id}
                onClick={() => loadTemplate(tpl)}
                className={cn(
                  "group px-3 py-2.5 cursor-pointer border-b border-border/50 hover:bg-accent transition-colors",
                  selectedId === tpl.id && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tpl.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{tpl.subject || "Sin asunto"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(tpl.updated_at)}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(tpl.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive shrink-0 mt-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── RIGHT: editor ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Metadata bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Nombre:</span>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-7 text-sm font-medium max-w-[200px]"
                placeholder="Nombre de la plantilla"
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Asunto:</span>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="h-7 text-sm flex-1"
                placeholder="Ej: ¡Tenemos algo para ti, {{nombre}}!"
              />
            </div>
          </div>

          {/* Unlayer editor */}
          <div className="flex-1 overflow-hidden">
            <EmailEditor
              ref={editorRef}
              onReady={handleEditorReady}
              minHeight="100%"
              options={{
                locale: "es-ES",
                displayMode: "email",
                features: { textEditor: { spellChecker: false } },
                appearance: {
                  theme: "modern_light",
                  customCSS: [
                    ".blockbuilder-branding { display: none !important; }",
                    "#blockbuilder-branding { display: none !important; }",
                    "[class*='branding'] { display: none !important; }",
                  ],
                },
                mergeTags: {
                  nombre:   { name: "Nombre del lead",   value: "{{nombre}}",   sample: "Juan" },
                  apellido: { name: "Apellido",           value: "{{apellido}}", sample: "Pérez" },
                  email:    { name: "Email del lead",     value: "{{email}}",    sample: "juan@ejemplo.com" },
                  empresa:  { name: "Empresa",            value: "{{empresa}}",  sample: "Acme Corp" },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Gallery dialog ── */}
      <Dialog open={galleryOpen} onOpenChange={v => { setGalleryOpen(v); if (!v) setGalleryCategory("Todos"); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b shrink-0">
            <LayoutTemplate className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold">Galería de plantillas</h2>
              <p className="text-xs text-muted-foreground">28 diseños listos para personalizar con tu marca</p>
            </div>
            <button onClick={() => setGalleryOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">✕</button>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 px-6 py-3 border-b shrink-0 overflow-x-auto scrollbar-thin">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setGalleryCategory(cat)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                  galleryCategory === cat
                    ? "text-white border-transparent"
                    : "bg-muted/50 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
                style={galleryCategory === cat ? {
                  background: cat === "Todos" ? "#FF6B35" : CATEGORY_COLORS[cat],
                  borderColor: "transparent",
                } : {}}
              >
                {cat === "Todos" ? `Todos (${STARTER_TEMPLATES.length})` : `${cat} (${STARTER_TEMPLATES.filter(t => t.category === cat).length})`}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-3">
              {STARTER_TEMPLATES
                .filter(t => galleryCategory === "Todos" || t.category === galleryCategory)
                .map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => handleLoadStarter(tpl)}
                    className="group text-left rounded-xl border border-border hover:border-primary hover:shadow-md transition-all overflow-hidden bg-card"
                  >
                    {/* Color preview strip */}
                    <div
                      className="h-14 w-full flex items-center justify-center relative overflow-hidden"
                      style={{ background: tpl.color }}
                    >
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.1) 0px, rgba(255,255,255,.1) 1px, transparent 1px, transparent 8px)"
                      }} />
                      <span className="text-white font-black text-[10px] uppercase tracking-widest opacity-80 z-10 px-3 text-center leading-tight">
                        {tpl.name}
                      </span>
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white"
                          style={{ background: CATEGORY_COLORS[tpl.category] ?? "#999" }}
                        >
                          {tpl.category}
                        </span>
                      </div>
                      <p className="font-semibold text-[13px] text-foreground group-hover:text-primary transition-colors leading-tight">
                        {tpl.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save-as dialog */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Guardar plantilla</DialogTitle></DialogHeader>
          <div>
            <Label>Nombre de la plantilla</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ej: Seguimiento cita"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleSaveAs()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveAs} disabled={saving || !newName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta plantilla?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. La plantilla se eliminará permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

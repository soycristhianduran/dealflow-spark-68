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
import { Save, Plus, Trash2, Loader2, FileText, LayoutTemplate, ShoppingBag, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STARTER_TEMPLATES, CATEGORIES, CATEGORY_COLORS } from "@/data/starterEmailTemplates";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { buildProductRows, type ShopProduct } from "@/lib/emailProductBlock";
import { useTranslation } from "react-i18next";
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
  const { organizationId } = useOrganizationContext();
  const { t } = useTranslation();
  const editorRef = useRef<any>(null);
  const [editorReady, setEditorReady] = useState(false);

  // Shopify product picker
  const [productsOpen, setProductsOpen] = useState(false);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, ShopProduct>>({});

  const openProducts = async () => {
    setProductsOpen(true);
    setSelectedProducts({});
    setProductsError(null);
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-products", { body: { organization_id: organizationId } });
      if (error || data?.error) {
        setProductsError(
          data?.error === "scope"
            ? t("emailBuilderPage.shopifyScopeError")
            : (data?.message || data?.error || t("emailBuilderPage.productsLoadError")),
        );
        setProducts([]);
      } else {
        setProducts(data.products || []);
      }
    } finally { setLoadingProducts(false); }
  };

  const toggleProduct = (p: ShopProduct) => {
    setSelectedProducts((prev) => {
      const key = String(p.id ?? p.title);
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = p;
      return next;
    });
  };

  const insertProducts = () => {
    const picked = Object.values(selectedProducts);
    if (!picked.length) { setProductsOpen(false); return; }
    editorRef.current?.editor?.saveDesign((design: any) => {
      try {
        const rows = buildProductRows(picked);
        design.body.rows = [...(design.body.rows || []), ...rows];
        editorRef.current?.editor?.loadDesign(design);
        toast.success(t("emailBuilderPage.productsInserted", { count: picked.length }));
      } catch {
        toast.error(t("emailBuilderPage.productsInsertError"));
      }
    });
    setProductsOpen(false);
  };

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [saving, setSaving] = useState(false);

  // Current template metadata
  const [name, setName] = useState(t("emailBuilderPage.newTemplateName"));
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
    if (!organizationId) return;
    const { data } = await supabase
      .from("email_templates")
      .select("id, name, subject, design, html, updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });
    setTemplates((data || []) as Template[]);
    setLoadingTemplates(false);
  }, [organizationId]);

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
          toast.success(t("emailBuilderPage.templateSaved"));
          fetchTemplates();
        } else {
          setSaveAsOpen(true);
          setNewName(name);
        }
      } catch (e: any) {
        toast.error(t("emailBuilderPage.saveError") + e.message);
      } finally {
        setSaving(false);
      }
    });
  }, [editorReady, selectedId, name, subject, fetchTemplates]);

  // ── Save as new ─────────────────────────────────────────────────────────
  const handleSaveAs = useCallback(() => {
    if (!editorReady) return;
    editorRef.current?.editor?.exportHtml(async (data: { design: object; html: string }) => {
      if (!newName.trim()) { toast.error(t("emailBuilderPage.nameRequired")); return; }
      setSaving(true);
      try {
        const { data: row, error } = await supabase.from("email_templates").insert({
          name: newName.trim(), subject, design: data.design, html: data.html,
        }).select("id").single();
        if (error) throw error;
        toast.success(t("emailBuilderPage.templateCreated"));
        setSelectedId(row.id);
        setName(newName.trim());
        setSaveAsOpen(false);
        fetchTemplates();
      } catch (e: any) {
        toast.error(t("emailBuilderPage.error") + e.message);
      } finally {
        setSaving(false);
      }
    });
  }, [editorReady, newName, subject, fetchTemplates]);

  // ── New blank ───────────────────────────────────────────────────────────
  const handleNew = () => {
    setSelectedId(null);
    setName(t("emailBuilderPage.newTemplateName"));
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
    toast.success(t("emailBuilderPage.starterLoaded", { name: tpl.name }));
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
    if (error) { toast.error(t("emailBuilderPage.deleteError")); return; }
    toast.success(t("emailBuilderPage.templateDeleted"));
    if (selectedId === id) handleNew();
    fetchTemplates();
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short" });

  return (
    <AppLayout>
      <AppHeader
        title={t("emailBuilderPage.pageTitle")}
        subtitle={t("emailBuilderPage.pageSubtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGalleryOpen(true)}>
              <LayoutTemplate className="h-4 w-4" /> {t("emailBuilderPage.templates")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openProducts} disabled={!editorReady}>
              <ShoppingBag className="h-4 w-4" /> {t("emailBuilderPage.products")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleNew}>
              <Plus className="h-4 w-4" /> {t("emailBuilderPage.new")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving || !editorReady}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {selectedId ? t("emailBuilderPage.save") : t("emailBuilderPage.saveAs")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: template list ── */}
        <aside className="w-60 border-r flex flex-col shrink-0 bg-muted/20">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("emailBuilderPage.myTemplates")}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingTemplates ? (
              <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {t("emailBuilderPage.noTemplates")}
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
                    <p className="text-[11px] text-muted-foreground truncate">{tpl.subject || t("emailBuilderPage.noSubject")}</p>
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
              <span className="text-xs text-muted-foreground shrink-0">{t("emailBuilderPage.nameLabel")}</span>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-7 text-sm font-medium max-w-[200px]"
                placeholder={t("emailBuilderPage.namePlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">{t("emailBuilderPage.subjectLabel")}</span>
              <Input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="h-7 text-sm flex-1"
                placeholder={t("emailBuilderPage.subjectPlaceholder")}
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
                  nombre:   { name: t("emailBuilderPage.mergeTagFirstName"), value: "{{nombre}}",   sample: "Juan" },
                  apellido: { name: t("emailBuilderPage.mergeTagLastName"),  value: "{{apellido}}", sample: "Pérez" },
                  email:    { name: t("emailBuilderPage.mergeTagEmail"),     value: "{{email}}",    sample: "juan@ejemplo.com" },
                  empresa:  { name: t("emailBuilderPage.mergeTagCompany"),   value: "{{empresa}}",  sample: "Acme Corp" },
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
              <h2 className="text-base font-semibold">{t("emailBuilderPage.galleryTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("emailBuilderPage.gallerySubtitle")}</p>
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
          <DialogHeader><DialogTitle>{t("emailBuilderPage.saveTemplateTitle")}</DialogTitle></DialogHeader>
          <div>
            <Label>{t("emailBuilderPage.templateNameLabel")}</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t("emailBuilderPage.saveAsPlaceholder")}
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleSaveAs()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>{t("emailBuilderPage.cancel")}</Button>
            <Button onClick={handleSaveAs} disabled={saving || !newName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("emailBuilderPage.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Shopify product picker ── */}
      <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-orange-500" /> {t("emailBuilderPage.insertShopifyProducts")}</DialogTitle>
          </DialogHeader>
          {loadingProducts ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />{t("emailBuilderPage.loadingProducts")}</div>
          ) : productsError ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">{productsError}</div>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("emailBuilderPage.noProductsFound")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
              {products.map((p) => {
                const key = String(p.id ?? p.title);
                const sel = !!selectedProducts[key];
                return (
                  <button key={key} onClick={() => toggleProduct(p)}
                    className={cn("text-left rounded-xl border p-2 transition-all relative", sel ? "border-orange-500 ring-2 ring-orange-200" : "hover:border-muted-foreground/40")}>
                    {sel && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center"><Check className="h-3 w-3" /></span>}
                    {p.image
                      ? <img src={p.image} alt={p.title} className="w-full h-24 object-cover rounded-lg mb-1.5" />
                      : <div className="w-full h-24 rounded-lg bg-muted flex items-center justify-center text-2xl mb-1.5">🛍️</div>}
                    <p className="text-xs font-medium line-clamp-2 leading-snug">{p.title}</p>
                    {p.price != null && <p className="text-xs text-muted-foreground mt-0.5">{Number(p.price).toFixed(2)} {p.currency || ""}</p>}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProductsOpen(false)}>{t("emailBuilderPage.cancel")}</Button>
            <Button onClick={insertProducts} disabled={!Object.keys(selectedProducts).length} className="bg-orange-500 hover:bg-orange-600">
              {t("emailBuilderPage.insertProductsButton", { count: Object.keys(selectedProducts).length || "" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("emailBuilderPage.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("emailBuilderPage.deleteConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("emailBuilderPage.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("emailBuilderPage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

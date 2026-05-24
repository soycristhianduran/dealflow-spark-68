import { useRef, useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Globe, Eye, EyeOff, Link2,
  Sparkles, MousePointer, RefreshCw, Edit2, BarChart2,
  ClipboardList, ChevronUp, ChevronDown, Settings2, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
// @ts-expect-error — react-email-editor ships without bundled types in v1
import EmailEditor from "react-email-editor";

// ── Edit mode script ──────────────────────────────────────────────────────────
const EDIT_MODE_SCRIPT = `<script id="__em__">
(function(){
var s=document.createElement('style');
s.textContent='[data-ee]:hover{outline:2px dashed rgba(99,102,241,.55)!important;outline-offset:2px;cursor:text;border-radius:3px}[data-ee]:focus{outline:2px solid #6366f1!important;outline-offset:2px}';
document.head.appendChild(s);
['h1','h2','h3','h4','h5','h6','p','span','a','li','button','label','td','th'].forEach(function(t){
  document.querySelectorAll(t).forEach(function(el){
    if(el.closest('#lead-form'))return;
    el.setAttribute('data-ee','1');
    el.addEventListener('click',function(e){e.stopPropagation();if(el.contentEditable==='true')return;el.contentEditable='true';el.focus();try{var r=document.createRange();r.selectNodeContents(el);window.getSelection().removeAllRanges();window.getSelection().addRange(r);}catch(x){}});
    el.addEventListener('blur',function(){el.contentEditable='false';window.parent.postMessage({type:'landing_html_edit',html:'<!DOCTYPE html>'+document.documentElement.outerHTML},'*');});
    el.addEventListener('keydown',function(e){if(e.key==='Escape'||(e.key==='Enter'&&!e.shiftKey&&el.tagName!=='DIV')){e.preventDefault();el.contentEditable='false';el.blur();}});
  });
});
})();
<\/script>`;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FormField {
  id: string;
  label: string;
  name: string;        // POST body key (auto-generated from label)
  type: "text" | "email" | "tel" | "number" | "textarea" | "select";
  required: boolean;
  placeholder: string;
  crm_field: string;   // target CRM column or special key
  options?: string[];  // for select type
}

export interface FormConfig {
  fields: FormField[];
  pipeline_id: string;
  stage_id: string;
  pipeline_name: string;
  stage_name: string;
  cta_text: string;
  success_message: string;
}

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
  form_config: FormConfig | null;
}

type EditorMode = "ai" | "drag";

// Moved outside component — TypeScript interfaces inside function bodies are
// valid TS but some transpiler setups can cause subtle issues; keeping it here
// is safer and is the conventional style.
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "loading" | "done" | "error";
}

// ── CRM field mapping options ─────────────────────────────────────────────────
const CRM_FIELD_OPTIONS = [
  { value: "full_name",      label: "Nombre completo (separar en first/last)" },
  { value: "first_name",     label: "Nombre" },
  { value: "last_name",      label: "Apellido" },
  { value: "primary_email",  label: "Email" },
  { value: "primary_phone",  label: "Teléfono" },
  { value: "city",           label: "Ciudad" },
  { value: "country",        label: "País" },
  { value: "notes",          label: "Notas del contacto" },
  { value: "source",         label: "Fuente" },
  { value: "utm_source",     label: "UTM Source" },
  { value: "utm_medium",     label: "UTM Medium" },
  { value: "utm_campaign",   label: "UTM Campaign" },
  { value: "_note",          label: "Guardar como actividad / nota" },
  { value: "_ignore",        label: "No guardar" },
];

const DEFAULT_FORM_CONFIG: FormConfig = {
  fields: [
    { id: "f1", label: "Nombre completo", name: "name",  type: "text",  required: true,  placeholder: "Tu nombre",          crm_field: "full_name"     },
    { id: "f2", label: "Email",           name: "email", type: "email", required: true,  placeholder: "tu@email.com",        crm_field: "primary_email" },
    { id: "f3", label: "Teléfono",        name: "phone", type: "tel",   required: false, placeholder: "+1 234 567 890",      crm_field: "primary_phone" },
  ],
  pipeline_id: "",
  stage_id: "",
  pipeline_name: "",
  stage_name: "",
  cta_text: "Enviar información",
  success_message: "¡Gracias! Te contactaremos pronto.",
};

// ── Form HTML generator ───────────────────────────────────────────────────────
const SUPABASE_SUBMIT_URL = `${(import.meta as any).env?.VITE_SUPABASE_URL || "https://oqwcgvemrvimrdrzjzil.supabase.co"}/functions/v1/landing-submit`;

function labelToName(label: string): string {
  return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "campo";
}

function generateFormHtml(cfg: FormConfig, pageId: string): string {
  const fieldsHtml = (cfg.fields ?? []).map(f => {
    const req = f.required ? ' required' : '';
    const ph  = f.placeholder ? ` placeholder="${f.placeholder}"` : "";
    const inp = f.type === "textarea"
      ? `<textarea name="${f.name}"${ph}${req} rows="3" style="width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>`
      : `<input type="${f.type}" name="${f.name}"${ph}${req} style="width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;" />`;
    return `<div style="margin-bottom:16px;">
      <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">${f.label}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>
      ${inp}
    </div>`;
  }).join("\n");

  const cta = cfg.cta_text || "Enviar";
  const success = cfg.success_message || "¡Gracias! Te contactaremos pronto.";

  return `<form id="lead-form" data-page-id="${pageId}" action="${SUPABASE_SUBMIT_URL}" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:32px;max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${fieldsHtml}
  <button type="submit" style="width:100%;background:#2563eb;color:#fff;font-weight:700;font-size:15px;padding:14px;border:none;border-radius:10px;cursor:pointer;transition:background .2s;">${cta}</button>
  <script>
  (function(){
    var form=document.getElementById('lead-form');
    if(!form)return;
    var btn=form.querySelector('button[type="submit"]');
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      btn.disabled=true;btn.textContent='Enviando...';
      var data={page_id:form.dataset.pageId,source:window.location.href};
      new FormData(form).forEach(function(v,k){if(k!=='')data[k]=v;});
      try{
        var res=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        if(res.ok){form.innerHTML='<div style="text-align:center;padding:32px 0;"><p style="font-size:22px;font-weight:700;color:#16a34a;">${success}</p></div>';}
        else{throw new Error('error');}
      }catch(err){btn.disabled=false;btn.textContent='${cta}';}
    });
  })();
  </script>
</form>`;
}

function injectFormIntoHtml(html: string, formHtml: string): string {
  // Replace existing lead-form
  const formRe = /<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i;
  if (formRe.test(html)) return html.replace(formRe, formHtml);
  // Inject before </body>
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `\n${formHtml}\n</body>`);
  return html + "\n" + formHtml;
}

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

  // Chat interface
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);

  // Form config
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [formConfigOpen, setFormConfigOpen] = useState(false);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [slugEditing, setSlugEditing] = useState(false);

  // ── Fetch pages ─────────────────────────────────────────────────────────────
  const fetchPages = useCallback(async () => {
    const { data } = await supabase
      .from("landing_pages")
      .select("id,name,slug,html,design,prompt,mode,status,views,leads_count,updated_at,form_config")
      .order("updated_at", { ascending: false });
    setPages((data || []) as LandingPage[]);
    setLoadingPages(false);
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  // Listen for inline text edits from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'landing_html_edit' && e.data?.html) {
        setGeneratedHtml(e.data.html);
        setPreviewHtml(e.data.html);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Load pipelines + stages (for form config) ────────────────────────────────
  useEffect(() => {
    supabase.from("pipelines").select("id, name").order("created_at", { ascending: true })
      .then(({ data }) => setPipelines(data || []));
    supabase.from("pipeline_stages").select("id, name, pipeline_id").order("order", { ascending: true })
      .then(({ data }) => setPipelineStages(data || []));
  }, []);

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
    // Merge DB config over defaults so that a bare `{}` (the DB column default)
    // never leaves formConfig.fields undefined, which would crash the Sheet render.
    const rawCfg = page.form_config || {};
    setFormConfig({
      ...DEFAULT_FORM_CONFIG,
      ...rawCfg,
      fields: Array.isArray(rawCfg.fields) && rawCfg.fields.length > 0
        ? rawCfg.fields
        : DEFAULT_FORM_CONFIG.fields,
    });
    setChatMessages([]);
    setEditMode(false);

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

  // ── Inject configured form into current HTML ────────────────────────────────
  const handleInjectForm = useCallback(() => {
    if (!generatedHtml || !(formConfig.fields ?? []).length) return;
    const formHtml = generateFormHtml(formConfig, selectedId || "PENDING");
    const injected = injectFormIntoHtml(generatedHtml, formHtml);
    setGeneratedHtml(injected);
    setPreviewHtml(injected);
    toast.success("Formulario inyectado en la landing");
  }, [generatedHtml, formConfig, selectedId]);

  // ── AI Generation (chat-driven) ─────────────────────────────────────────────
  const handleGenerate = async () => {
    const currentInput = chatInput.trim();
    if (!currentInput) { toast.error("Escribe qué quieres en tu landing page"); return; }

    const userMsgId = Math.random().toString(36).slice(2);
    const assistantMsgId = Math.random().toString(36).slice(2);

    // When generating fresh (no existing HTML) and form fields are configured,
    // tell the AI which fields to include so the generated form matches.
    const configuredFields = formConfig.fields ?? [];
    const formContext = !generatedHtml && configuredFields.length > 0
      ? `\n\nFormulario requerido con estos campos: ${configuredFields.map(f => f.label).join(", ")}.`
      : "";

    // Append user bubble + loading assistant bubble
    setChatMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: currentInput, status: "done" },
      { id: assistantMsgId, role: "assistant", content: "", status: "loading" },
    ]);
    setChatInput("");
    setGenerating(true);

    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await supabase.functions.invoke("generate-landing", {
        body: {
          prompt: currentInput + formContext,
          page_id: selectedId || "PENDING",
          current_html: generatedHtml || undefined,
        },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      const html = res.data.html as string;
      setGeneratedHtml(html);
      setPreviewHtml(html);
      setChatMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: "✓ Aplicado", status: "done" } : m
      ));
    } catch (e: any) {
      setChatMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: e.message || "Error generando la landing", status: "error" } : m
      ));
    } finally {
      setGenerating(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (publishOverride?: boolean) => {
    if (!selectedId) { toast.error("Selecciona o crea una página primero"); return; }
    setSaving(true);

    const targetStatus = publishOverride !== undefined ? (publishOverride ? "published" : "draft") : status;

    try {
      // Inject form HTML based on current form_config before saving
      const formHtml = generateFormHtml(formConfig, selectedId);

      if (mode === "drag") {
        // Export from Unlayer
        await new Promise<void>((resolve, reject) => {
          editorRef.current?.editor?.exportHtml(async (exportData: { design: object; html: string }) => {
            try {
              const htmlWithForm = injectFormIntoHtml(exportData.html, formHtml);
              const { error } = await supabase
                .from("landing_pages")
                .update({
                  name, slug: slug || toSlug(name),
                  html: htmlWithForm,
                  design: exportData.design,
                  mode: "drag",
                  status: targetStatus,
                  form_config: formConfig,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", selectedId);
              if (error) throw error;
              resolve();
            } catch (e) { reject(e); }
          });
        });
      } else {
        // AI mode — inject form into generated HTML
        const baseHtml = generatedHtml || "";
        const htmlWithForm = baseHtml ? injectFormIntoHtml(baseHtml, formHtml) : baseHtml;
        const { error } = await supabase
          .from("landing_pages")
          .update({
            name, slug: slug || toSlug(name),
            html: htmlWithForm,
            prompt,
            mode: "ai",
            status: targetStatus,
            form_config: formConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedId);
        if (error) throw error;
        if (htmlWithForm !== generatedHtml) {
          setGeneratedHtml(htmlWithForm);
          setPreviewHtml(htmlWithForm);
        }
      }

      setStatus(targetStatus);
      await fetchPages();
      toast.success(targetStatus === "published" ? "¡Landing publicada!" : "Guardado");
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [selectedId, mode, name, slug, status, generatedHtml, prompt, formConfig, fetchPages]);

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

                {/* Form config button — always visible so you can configure fields at any time */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 relative"
                  onClick={() => setFormConfigOpen(true)}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Formulario
                  {(formConfig.fields ?? []).length > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">
                      {(formConfig.fields ?? []).length}
                    </span>
                  )}
                </Button>

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
              {/* Chat panel */}
              <div className="w-80 shrink-0 border-r border-border flex flex-col">
                {/* Header */}
                <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">Editar con IA</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setChatMessages([]);
                      setGeneratedHtml("");
                      setPreviewHtml("");
                      setEditMode(false);
                    }}
                  >
                    Nueva
                  </Button>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                      <Sparkles className="h-8 w-8 opacity-20" />
                      <p className="text-sm text-muted-foreground text-center">
                        Describe tu landing para comenzar
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                        {msg.role === "user" ? (
                          <div className="bg-primary text-primary-foreground text-xs rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        ) : (
                          <div className={cn(
                            "bg-muted text-xs rounded-xl rounded-tl-sm px-3 py-2 max-w-[85%]",
                            msg.status === "error" && "text-destructive"
                          )}>
                            {msg.status === "loading" ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="animate-spin h-3 w-3" />
                                Aplicando cambios...
                              </span>
                            ) : (
                              <span className={cn(
                                msg.status === "done" && msg.content.startsWith("✓") && "text-green-600"
                              )}>
                                {msg.content}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Form status strip — configure fields + inject when ready */}
                <div className="shrink-0 border-t border-border px-3 py-2 bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setFormConfigOpen(true)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ClipboardList className="h-3 w-3 shrink-0" />
                      {(formConfig.fields ?? []).length > 0
                        ? <span className="font-medium">{(formConfig.fields ?? []).length} campos configurados</span>
                        : <span>Configurar formulario</span>
                      }
                    </button>

                    {/* Inject button: only when there's HTML AND fields are configured */}
                    {generatedHtml && (formConfig.fields ?? []).length > 0 && (
                      <button
                        onClick={handleInjectForm}
                        className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors shrink-0"
                      >
                        <ClipboardList className="h-3 w-3" />
                        Integrar formulario
                      </button>
                    )}
                  </div>

                  {/* Field name chips preview */}
                  {(formConfig.fields ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(formConfig.fields ?? []).slice(0, 5).map(f => (
                        <span key={f.id} className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                          {f.label}
                        </span>
                      ))}
                      {(formConfig.fields ?? []).length > 5 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{(formConfig.fields ?? []).length - 5} más
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div className="shrink-0 border-t border-border p-3 space-y-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={generatedHtml ? "Describe qué cambiar..." : "Describe tu landing desde cero..."}
                    className="text-sm resize-none min-h-[80px]"
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                  <div className="flex gap-2 items-center">
                    {generatedHtml && (
                      <span className="text-[10px] text-muted-foreground flex-1">
                        Modo refinado — mantiene el diseño
                      </span>
                    )}
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={generating || !chatInput.trim()}
                      onClick={handleGenerate}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {generating ? "Enviando..." : generatedHtml ? "Refinar" : "Generar"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="flex-1 flex flex-col min-w-0">
                {previewHtml ? (
                  <>
                    {/* Mode toggle bar */}
                    <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setEditMode(false)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                          !editMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Eye className="h-3 w-3" /> Vista previa
                      </button>
                      <button
                        onClick={() => setEditMode(true)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                          editMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Edit2 className="h-3 w-3" /> Editar texto
                      </button>
                    </div>

                    {/* Edit mode banner */}
                    {editMode && (
                      <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 flex items-center gap-2 shrink-0">
                        <Edit2 className="h-3 w-3 shrink-0" />
                        Haz clic en cualquier texto para editarlo ·{" "}
                        <kbd className="px-1 bg-white rounded border text-[10px]">Esc</kbd>
                        {" "}o{" "}
                        <kbd className="px-1 bg-white rounded border text-[10px]">Enter</kbd>
                        {" "}para confirmar
                      </div>
                    )}

                    <iframe
                      key={editMode ? "edit" : "preview"}
                      srcDoc={editMode ? previewHtml.replace(/<\/body>/i, EDIT_MODE_SCRIPT + '</body>') : previewHtml}
                      className="flex-1 w-full border-0"
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      title="Vista previa landing"
                    />
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
                    <Sparkles className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Describe tu landing page en el chat de la izquierda</p>
                  </div>
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

      {/* ── Form Config Sheet ── */}
      <Sheet open={formConfigOpen} onOpenChange={setFormConfigOpen}>
        <SheetContent side="right" className="w-[480px] sm:w-[520px] overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              Configuración del Formulario
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Define los campos, mapéalos al CRM y elige dónde llegan los leads.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            {/* ── Fields section ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Campos del formulario</Label>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const newField: FormField = {
                      id: Math.random().toString(36).slice(2),
                      label: "Nuevo campo",
                      name: `campo_${Date.now()}`,
                      type: "text",
                      required: false,
                      placeholder: "",
                      crm_field: "_ignore",
                    };
                    setFormConfig(prev => ({ ...prev, fields: [...prev.fields, newField] }));
                  }}
                >
                  <Plus className="h-3 w-3" /> Agregar campo
                </Button>
              </div>

              <div className="space-y-3">
                {(formConfig.fields ?? []).map((field, idx) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2.5"
                  >
                    {/* Row 1: Label + move + delete */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={field.label}
                        onChange={e => {
                          const newLabel = e.target.value;
                          setFormConfig(prev => ({
                            ...prev,
                            fields: prev.fields.map(f => f.id === field.id
                              ? { ...f, label: newLabel, name: labelToName(newLabel) }
                              : f
                            ),
                          }));
                        }}
                        placeholder="Etiqueta del campo"
                        className="h-7 text-xs flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={idx === 0}
                          onClick={() => setFormConfig(prev => {
                            const arr = [...prev.fields];
                            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            return { ...prev, fields: arr };
                          })}
                          className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                        ><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button
                          disabled={idx === (formConfig.fields ?? []).length - 1}
                          onClick={() => setFormConfig(prev => {
                            const arr = [...prev.fields];
                            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                            return { ...prev, fields: arr };
                          })}
                          className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                        ><ChevronDown className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={() => setFormConfig(prev => ({
                            ...prev, fields: prev.fields.filter(f => f.id !== field.id),
                          }))}
                          className="p-0.5 rounded hover:bg-destructive/10 text-destructive ml-0.5"
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>

                    {/* Row 2: Type + Required */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={field.type}
                        onValueChange={v => setFormConfig(prev => ({
                          ...prev, fields: prev.fields.map(f => f.id === field.id ? { ...f, type: v as FormField["type"] } : f),
                        }))}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="tel">Teléfono</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                          <SelectItem value="textarea">Área de texto</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                        <Switch
                          checked={field.required}
                          onCheckedChange={v => setFormConfig(prev => ({
                            ...prev, fields: prev.fields.map(f => f.id === field.id ? { ...f, required: v } : f),
                          }))}
                          className="scale-75"
                        />
                        Requerido
                      </div>
                    </div>

                    {/* Row 3: Placeholder */}
                    <Input
                      value={field.placeholder}
                      onChange={e => setFormConfig(prev => ({
                        ...prev, fields: prev.fields.map(f => f.id === field.id ? { ...f, placeholder: e.target.value } : f),
                      }))}
                      placeholder="Placeholder (opcional)"
                      className="h-7 text-xs"
                    />

                    {/* Row 4: CRM mapping */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground shrink-0">→ CRM:</span>
                      <Select
                        value={field.crm_field}
                        onValueChange={v => setFormConfig(prev => ({
                          ...prev, fields: prev.fields.map(f => f.id === field.id ? { ...f, crm_field: v } : f),
                        }))}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Seleccionar campo CRM..." />
                        </SelectTrigger>
                        <SelectContent>
                          {CRM_FIELD_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                {(formConfig.fields ?? []).length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-4 border border-dashed rounded-lg">
                    Sin campos. Haz clic en "Agregar campo".
                  </div>
                )}
              </div>
            </div>

            {/* ── Pipeline assignment ── */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                Asignación automática al pipeline
              </Label>
              <div className="space-y-2">
                <Select
                  value={formConfig.pipeline_id || "none"}
                  onValueChange={v => {
                    if (v === "none") {
                      setFormConfig(prev => ({ ...prev, pipeline_id: "", pipeline_name: "", stage_id: "", stage_name: "" }));
                    } else {
                      const p = pipelines.find(p => p.id === v);
                      setFormConfig(prev => ({ ...prev, pipeline_id: v, pipeline_name: p?.name ?? "", stage_id: "", stage_name: "" }));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Sin asignación de pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignación</SelectItem>
                    {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                {formConfig.pipeline_id && (
                  <Select
                    value={formConfig.stage_id || "none"}
                    onValueChange={v => {
                      if (v === "none") {
                        setFormConfig(prev => ({ ...prev, stage_id: "", stage_name: "" }));
                      } else {
                        const s = pipelineStages.find(s => s.id === v);
                        setFormConfig(prev => ({ ...prev, stage_id: v, stage_name: s?.name ?? "" }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Seleccionar etapa..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin etapa específica</SelectItem>
                      {pipelineStages.filter(s => s.pipeline_id === formConfig.pipeline_id).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {formConfig.pipeline_id && formConfig.stage_id && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    ✓ Los leads irán directo a <strong>{formConfig.pipeline_name} → {formConfig.stage_name}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* ── CTA + success message ── */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Apariencia del formulario</Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Texto del botón</Label>
                  <Input
                    value={formConfig.cta_text}
                    onChange={e => setFormConfig(prev => ({ ...prev, cta_text: e.target.value }))}
                    placeholder="Enviar información"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mensaje de éxito</Label>
                  <Input
                    value={formConfig.success_message}
                    onChange={e => setFormConfig(prev => ({ ...prev, success_message: e.target.value }))}
                    placeholder="¡Gracias! Te contactaremos pronto."
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* ── Footer ── */}
          <div className="border-t px-5 py-4 shrink-0 bg-background space-y-2">
            {/* Always available: save form config without injecting */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setFormConfigOpen(false);
                toast.success("Configuración del formulario guardada");
              }}
            >
              <ClipboardList className="h-4 w-4" />
              Guardar configuración
            </Button>

            {/* Only when there's generated HTML: inject into the page */}
            {generatedHtml && (
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setFormConfigOpen(false);
                  handleInjectForm();
                  if (selectedId) handleSave();
                }}
                disabled={saving || !(formConfig.fields ?? []).length}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                Guardar e inyectar en la landing
              </Button>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              {generatedHtml
                ? "Inyectar reemplaza el formulario actual en el HTML con estos campos."
                : "Genera una landing primero para poder inyectar el formulario."}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

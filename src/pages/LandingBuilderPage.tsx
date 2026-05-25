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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Globe, Eye, EyeOff, Link2,
  Sparkles, MousePointer, Edit2, BarChart2,
  ClipboardList, Settings2, Send, AlertCircle,
  Monitor, Tablet, Smartphone, ImageIcon, X, ChevronDown, Check,
  ChevronLeft, FolderOpen, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
// @ts-expect-error — react-email-editor ships without bundled types in v1
import EmailEditor from "react-email-editor";

// ── Link preprocessing (no script required — CSP-safe) ───────────────────────
// Instead of injecting a click-intercept script (blocked by CSP),
// we rewrite <a href="..."> in the HTML string before setting srcDoc.
// Anchor links (#) and javascript: are left alone — they don't navigate away.
function addTargetBlank(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (match, attrs: string) => {
    const href = (/\bhref=["']([^"']*)["']/i.exec(attrs) || [])[1] || '';
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return match;
    // Replace or add target="_blank"
    const withTarget = /\btarget\s*=/i.test(attrs)
      ? attrs.replace(/\btarget\s*=\s*["'][^"']*["']/i, 'target="_blank"')
      : `${attrs} target="_blank" rel="noopener noreferrer"`;
    return `<a${withTarget}>`;
  });
}

// buildPreviewSrcDoc: apply link rewriting only (no injected scripts)
function buildPreviewSrcDoc(html: string): string {
  return addTargetBlank(html);
}

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

interface LandingFunnel {
  id: string;
  name: string;
  created_at: string;
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
  chat_history: ChatMessage[] | null;
  funnel_id: string | null;
  page_role: string;
  page_order: number;
}

type EditorMode = "ai" | "drag";

// Moved outside component — TypeScript interfaces inside function bodies are
// valid TS but some transpiler setups can cause subtle issues; keeping it here
// is safer and is the conventional style.
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;        // brief description of what changed (AI-generated for assistant msgs)
  attachments?: string[];  // public image URLs attached to this message
  status: "loading" | "done" | "error" | "confirm_new_page";
  newPagePrompt?: string;  // original prompt when status === "confirm_new_page"
}

interface ImageAttachment {
  url: string;       // Supabase Storage public URL
  preview: string;   // local blob URL for thumbnail
  name: string;
}

// ── CRM field mapping options ─────────────────────────────────────────────────
const CRM_FIELD_OPTIONS = [
  { value: "full_name",      label: "Nombre completo" },
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
  { value: "_note",          label: "Guardar como actividad" },
  { value: "_ignore",        label: "No guardar" },
];

const DEFAULT_FORM_CONFIG: FormConfig = {
  fields: [],   // Fields are auto-detected from AI-generated HTML, not manually built
  pipeline_id: "",
  stage_id: "",
  pipeline_name: "",
  stage_name: "",
  cta_text: "Enviar información",
  success_message: "¡Gracias! Te contactaremos pronto.",
};

// ── Auto-detect form fields from AI-generated HTML ────────────────────────────
function detectFormFields(html: string): Omit<FormField, 'crm_field'>[] {
  if (!html) return [];
  const formMatch = html.match(/<form[^>]*id=["']lead-form["'][^>]*>([\s\S]*?)<\/form>/i);
  if (!formMatch) return [];
  const formHtml = formMatch[1];

  const fields: Omit<FormField, 'crm_field'>[] = [];
  const seen = new Set<string>();

  // Try to pair <label> with the following <input>/<textarea>
  const blockRe = /<div[^>]*>([\s\S]*?)<\/div>/gi;
  let block;
  while ((block = blockRe.exec(formHtml)) !== null) {
    const seg = block[1];
    const labelMatch = seg.match(/<label[^>]*>([\s\S]*?)<\/label>/i);
    const inputMatch = seg.match(/<(?:input|textarea)[^>]*\sname=["']([^"']+)["'][^>]*/i);
    if (inputMatch) {
      const name = inputMatch[1];
      if (!seen.has(name)) {
        seen.add(name);
        const rawLabel = labelMatch
          ? labelMatch[1].replace(/<[^>]+>/g, '').replace(/[*]/g, '').trim()
          : name;
        const typeMatch  = inputMatch[0].match(/\stype=["']([^"']+)["']/i);
        const phMatch    = inputMatch[0].match(/\splaceholder=["']([^"']+)["']/i);
        fields.push({
          id: name,
          label: rawLabel,
          name,
          type: (typeMatch?.[1] as FormField['type']) || 'text',
          required: /\srequired/.test(inputMatch[0]),
          placeholder: phMatch?.[1] || '',
        });
      }
    }
  }

  // Fallback: catch any inputs not inside a <div>
  const inputRe = /<(?:input|textarea)[^>]*\sname=["']([^"']+)["'][^>]*/gi;
  let m;
  while ((m = inputRe.exec(formHtml)) !== null) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      const typeMatch = m[0].match(/\stype=["']([^"']+)["']/i);
      const phMatch   = m[0].match(/\splaceholder=["']([^"']+)["']/i);
      fields.push({
        id: name, label: name, name,
        type: (typeMatch?.[1] as FormField['type']) || 'text',
        required: false,
        placeholder: phMatch?.[1] || '',
      });
    }
  }
  return fields;
}

// Smart auto-mapping: guesses CRM field from common field name patterns
function autoMapCrmField(name: string, label: string): string {
  const n = name.toLowerCase();
  const l = label.toLowerCase();
  if (n.includes('email') || l.includes('email') || l.includes('correo'))         return 'primary_email';
  if (n.includes('phone') || n.includes('tel')   || l.includes('teléfono') ||
      l.includes('telefono') || l.includes('celular') || l.includes('móvil'))      return 'primary_phone';
  if (n === 'name' || n === 'full_name' || n === 'nombre' ||
      l.includes('nombre completo') || l.includes('full name'))                    return 'full_name';
  if (n === 'first_name' || n === 'firstname' || l === 'nombre')                   return 'first_name';
  if (n === 'last_name'  || n === 'lastname'  || l.includes('apellido'))           return 'last_name';
  if (n.includes('city')    || l.includes('ciudad'))                               return 'city';
  if (n.includes('country') || l.includes('país') || l.includes('pais'))          return 'country';
  if (n.includes('note') || n.includes('nota') || n.includes('mensaje') ||
      l.includes('mensaje') || l.includes('comentario'))                           return '_note';
  return '_ignore';
}

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

  // Image attachments for AI prompts
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);
  // Ref to the edit-mode iframe + cleanup handles
  const editIframeRef = useRef<HTMLIFrameElement>(null);
  const editMoRef    = useRef<MutationObserver | null>(null);
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat panel visibility (collapsible)
  const [chatOpen, setChatOpen] = useState(true);

  // Responsive preview device
  type DeviceSize = "desktop" | "tablet" | "mobile";
  const [deviceSize, setDeviceSize] = useState<DeviceSize>("desktop");
  const DEVICE_WIDTHS: Record<DeviceSize, string | null> = {
    desktop: null,        // full width
    tablet:  "768px",
    mobile:  "390px",
  };

  // Form config
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [formConfigOpen, setFormConfigOpen] = useState(false);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);

  // Version counter — incremented whenever we want the preview iframe to fully
  // remount with fresh content. Changing srcDoc on an existing iframe does NOT
  // reliably reload in all browsers; including this in the key forces a remount.
  const [htmlVersion, setHtmlVersion] = useState(0);

  // UI state
  const [saving, setSaving] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [slugEditing, setSlugEditing] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);

  // Funnel state
  const [funnels, setFunnels] = useState<LandingFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [pickerLevel, setPickerLevel] = useState<"funnels" | "pages">("funnels");
  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");

  // Pages in the currently selected funnel
  const funnelPages = pages.filter(p => p.funnel_id === selectedFunnelId);

  // ── Fetch funnels ────────────────────────────────────────────────────────────
  const fetchFunnels = useCallback(async () => {
    const { data } = await supabase
      .from("landing_funnels")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });
    setFunnels((data || []) as LandingFunnel[]);
    // Auto-select first funnel if none selected
    if (data && data.length > 0) {
      setSelectedFunnelId(prev => prev ?? data[0].id);
      setPickerLevel("pages");
    }
  }, []);

  // ── Fetch pages ─────────────────────────────────────────────────────────────
  const fetchPages = useCallback(async () => {
    const { data } = await supabase
      .from("landing_pages")
      .select("id,name,slug,html,design,prompt,mode,status,views,leads_count,updated_at,form_config,chat_history,funnel_id,page_role,page_order")
      .order("page_order", { ascending: true });
    setPages((data || []) as LandingPage[]);
    setLoadingPages(false);
  }, []);

  useEffect(() => { fetchPages(); fetchFunnels(); }, [fetchPages, fetchFunnels]);

  // ── Create funnel ────────────────────────────────────────────────────────────
  const handleCreateFunnel = async () => {
    if (!newFunnelName.trim()) return;
    const { data, error } = await supabase
      .from("landing_funnels")
      .insert({ name: newFunnelName.trim() })
      .select()
      .single();
    if (error) { toast.error("Error al crear el funnel"); return; }
    const nf = data as LandingFunnel;
    setFunnels(prev => [...prev, nf]);
    setSelectedFunnelId(nf.id);
    setPickerLevel("pages");
    setNewFunnelOpen(false);
    setNewFunnelName("");
    toast.success("Funnel creado");
  };

  // ── Delete funnel ────────────────────────────────────────────────────────────
  const handleDeleteFunnel = async (id: string) => {
    const { error } = await supabase.from("landing_funnels").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar el funnel"); return; }
    setFunnels(prev => prev.filter(f => f.id !== id));
    if (selectedFunnelId === id) {
      const remaining = funnels.filter(f => f.id !== id);
      setSelectedFunnelId(remaining[0]?.id ?? null);
      if (remaining.length === 0) setPickerLevel("funnels");
    }
    toast.success("Funnel eliminado");
  };

  // ── Edit mode: drive designMode from React parent (CSP-safe) ────────────────
  // Called directly from the iframe's onLoad prop — no useEffect race condition.
  // We manipulate contentDocument from the parent frame, so CSP inline-script
  // restrictions on the srcdoc content don't apply.
  const setupEditMode = useCallback(() => {
    const iframe = editIframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;

    // Disconnect any previous observer
    editMoRef.current?.disconnect();
    if (editTimerRef.current) clearTimeout(editTimerRef.current);

    // 1. CSS overrides (no inline script — we're manipulating the DOM directly)
    const style = doc.createElement('style');
    style.id = '__edit_style__';
    style.textContent =
      'script,noscript{display:none!important;}' +           // hide script text in designMode
      '*{-webkit-user-select:text!important;user-select:text!important;}' +
      'body *{cursor:text!important;}';
    (doc.head ?? doc.documentElement).appendChild(style);

    // 2. Indicator bar
    const bar = doc.createElement('div');
    bar.id = '__edit_bar__';
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:#6366f1;color:#fff;text-align:center;padding:9px 12px;' +
      'font-size:13px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    bar.textContent = '✏️  Modo edición activo — haz clic en cualquier texto para editar';
    doc.body.insertBefore(bar, doc.body.firstChild);
    doc.body.style.paddingTop = '42px';

    // 3. Enable editing
    doc.designMode = 'on';

    // 4. Sync changes → React state (DOMParser clone, no designMode toggle)
    const sync = () => {
      if (editTimerRef.current) clearTimeout(editTimerRef.current);
      editTimerRef.current = setTimeout(() => {
        const liveDoc = editIframeRef.current?.contentDocument;
        if (!liveDoc) return;
        const raw = '<!DOCTYPE html>' + liveDoc.documentElement.outerHTML;
        const clean = new DOMParser().parseFromString(raw, 'text/html');
        clean.querySelector('#__edit_style__')?.remove();
        clean.querySelector('#__edit_bar__')?.remove();
        const body = clean.querySelector('body');
        if (body) body.style.paddingTop = '';
        setGeneratedHtml('<!DOCTYPE html>' + clean.documentElement.outerHTML);
      }, 700);
    };

    const mo = new MutationObserver(sync);
    mo.observe(doc.body, { childList: true, subtree: true, characterData: true });
    editMoRef.current = mo;
  }, []); // stable — reads only refs and stable setters

  // Disconnect observer when exiting edit mode or unmounting
  useEffect(() => {
    if (!editMode) {
      editMoRef.current?.disconnect();
      editMoRef.current = null;
    }
    return () => {
      editMoRef.current?.disconnect();
      if (editTimerRef.current) clearTimeout(editTimerRef.current);
    };
  }, [editMode]);

  // ── Load pipelines + stages (for form config) ────────────────────────────────
  useEffect(() => {
    supabase.from("pipelines").select("id, name").order("created_at", { ascending: true })
      .then(({ data }) => setPipelines(data || []));
    supabase.from("pipeline_stages").select("id, name, pipeline_id").order("order", { ascending: true })
      .then(({ data }) => setPipelineStages(data || []));
  }, []);

  // ── Auto-detect form fields when HTML changes ────────────────────────────────
  // When the AI generates (or refines) a landing, we scan the #lead-form for
  // input names and pre-populate form_config with smart CRM auto-mappings.
  // Existing CRM mappings for matching field names are preserved.
  useEffect(() => {
    if (!generatedHtml) return;
    const detected = detectFormFields(generatedHtml);

    if (detected.length === 0) {
      // Form was removed from HTML — clear detected fields so the
      // "Integrar formulario" button and badge disappear immediately.
      // Preserve pipeline/stage assignment in case the user re-adds a form.
      setFormConfig(prev => {
        if ((prev.fields ?? []).length === 0) return prev; // already empty, no-op
        return { ...prev, fields: [] };
      });
      return;
    }

    setFormConfig(prev => {
      const existingMap = new Map((prev.fields ?? []).map(f => [f.name, f.crm_field]));
      const newFields: FormField[] = detected.map(d => ({
        ...d,
        crm_field: existingMap.get(d.name) ?? autoMapCrmField(d.name, d.label),
      }));
      // Only update if fields actually changed (avoids infinite loops)
      const same = newFields.length === (prev.fields ?? []).length &&
        newFields.every((f, i) => f.name === (prev.fields ?? [])[i]?.name);
      return same ? prev : { ...prev, fields: newFields };
    });
  }, [generatedHtml]);

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
    setHtmlVersion(v => v + 1);
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
    // Restore saved chat history (or start fresh if none)
    setChatMessages(
      Array.isArray(page.chat_history) && page.chat_history.length > 0
        ? page.chat_history
        : []
    );
    setEditMode(false);
    setDeviceSize("desktop");

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
    const nextOrder = funnelPages.length; // append at end
    const { data, error } = await supabase
      .from("landing_pages")
      .insert({
        name: newPageName.trim(),
        slug: generatedSlug,
        mode: "ai",
        funnel_id: selectedFunnelId,
        page_order: nextOrder,
      })
      .select()
      .single();
    if (error) { toast.error("Error al crear la página"); return; }
    const newPage = data as LandingPage;
    setPages(prev => [...prev, newPage]);
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

  // ── Image upload ────────────────────────────────────────────────────────────
  const handleImageAttach = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen debe ser menor a 5 MB"); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${selectedId || "temp"}/${Date.now()}.${ext}`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from("landing-assets")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from("landing-assets")
        .getPublicUrl(uploaded.path);
      const preview = URL.createObjectURL(file);
      setAttachedImages(prev => [...prev, { url: publicUrl, preview, name: file.name }]);
    } catch (e: any) {
      toast.error("Error al subir imagen: " + (e.message || "Intenta de nuevo"));
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Detect new-page intent from chat prompt ──────────────────────────────────
  const NEW_PAGE_PATTERNS = [
    /\bcrea?\s+(una?\s+)?(nueva?\s+)?p[aá]gina\b/i,
    /\bnueva\s+p[aá]gina\b/i,
    /\bp[aá]gina\s+de\s+(gracias|agradecimiento|upsell|registro|venta|contacto|checkout|confirmaci[oó]n|inicio|bienvenida)\b/i,
    /\bthank[\s-]?you\s+page\b/i,
    /\bañad[ei][r]?\s+(una?\s+)?p[aá]gina\b/i,
    /\bagreg[aá][r]?\s+(una?\s+)?p[aá]gina\b/i,
  ];
  const isNewPageIntent = (prompt: string) =>
    !!generatedHtml && !!selectedFunnelId &&
    NEW_PAGE_PATTERNS.some(re => re.test(prompt));

  // ── Create a new page from chat (with funnel style context) ──────────────────
  const handleCreatePageFromChat = async (originalPrompt: string, confirmMsgId: string) => {
    // Derive a page name from the prompt (grab key words)
    const nameMatch = originalPrompt.match(/p[aá]gina\s+de\s+([a-záéíóúñü\s]+)/i);
    const pageName = nameMatch
      ? nameMatch[1].trim().slice(0, 40).replace(/\s+/g, ' ')
      : originalPrompt.slice(0, 40);
    const capitalized = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    // 1. Create new landing_pages entry in the same funnel
    const { data, error } = await supabase
      .from("landing_pages")
      .insert({
        name: capitalized,
        slug: toSlug(capitalized),
        mode: "ai",
        funnel_id: selectedFunnelId,
        page_order: funnelPages.length,
      })
      .select()
      .single();
    if (error) { toast.error("Error al crear la página"); return; }

    const newPage = data as LandingPage;
    setPages(prev => [...prev, newPage]);

    // 2. Build initial chat history for the new page (inherits funnel context)
    const funnelName = funnels.find(f => f.id === selectedFunnelId)?.name || "funnel";
    const initHistory: ChatMessage[] = [{
      id: Math.random().toString(36).slice(2),
      role: "assistant",
      content: `Página creada dentro del funnel "${funnelName}". Generando con el estilo del funnel...`,
      status: "done",
    }];

    // 3. Switch to the new page and pre-populate history
    setSelectedId(newPage.id);
    setName(newPage.name);
    setSlug(newPage.slug || "");
    setStatus("draft");
    setMode("ai");
    setGeneratedHtml("");
    setPreviewHtml("");
    setHtmlVersion(v => v + 1);
    setFormConfig(DEFAULT_FORM_CONFIG);
    setChatMessages(initHistory);
    setEditMode(false);

    // 4. Replace confirm bubble with "generating" bubble in current chat
    // (we've already switched pages so this is just cleanup)

    // 5. Immediately generate the new page using funnel style reference
    setGenerating(true);
    const assistantMsgId = Math.random().toString(36).slice(2);
    setChatMessages([
      ...initHistory,
      { id: assistantMsgId, role: "assistant", content: "", status: "loading" },
    ]);

    try {
      const res = await supabase.functions.invoke("generate-landing", {
        body: {
          prompt: originalPrompt,
          page_id: newPage.id,
          funnel_reference_html: generatedHtml.slice(0, 3000), // style context from current page
          chat_history: [],
        },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      const html = res.data.html as string;
      if (!html) throw new Error("La IA no devolvió HTML");
      const summary: string = res.data.summary || "Página creada con estilo del funnel";

      setGeneratedHtml(html);
      setPreviewHtml(html);
      setHtmlVersion(v => v + 1);

      const updatedHistory: ChatMessage[] = [
        ...initHistory,
        { id: assistantMsgId, role: "assistant", content: summary, summary, status: "done" },
      ];
      setChatMessages(updatedHistory);

      // Auto-save to DB
      await supabase.from("landing_pages")
        .update({ html, chat_history: updatedHistory })
        .eq("id", newPage.id);

      await fetchPages();
      toast.success(`Página "${capitalized}" creada en el funnel`);
    } catch (e: any) {
      setChatMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: e.message || "Error", status: "error" } : m
      ));
    } finally {
      setGenerating(false);
    }
  };

  // ── AI Generation (chat-driven) ─────────────────────────────────────────────
  const handleGenerate = async () => {
    const currentInput = chatInput.trim();
    if (!currentInput) { toast.error("Escribe qué quieres en tu landing page"); return; }

    // Detect "create new page" intent — show inline confirmation instead of modifying current page
    if (isNewPageIntent(currentInput)) {
      const confirmId = Math.random().toString(36).slice(2);
      setChatMessages(prev => [
        ...prev,
        { id: Math.random().toString(36).slice(2), role: "user", content: currentInput, status: "done" },
        {
          id: confirmId,
          role: "assistant",
          content: currentInput,
          status: "confirm_new_page",
          newPagePrompt: currentInput,
        },
      ]);
      setChatInput("");
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      return;
    }

    const userMsgId = Math.random().toString(36).slice(2);
    const assistantMsgId = Math.random().toString(36).slice(2);

    // When generating fresh (no existing HTML) and form fields are configured,
    // tell the AI which fields to include so the generated form matches.
    const configuredFields = formConfig.fields ?? [];
    const formContext = !generatedHtml && configuredFields.length > 0
      ? `\n\nFormulario requerido con estos campos: ${configuredFields.map(f => f.label).join(", ")}.`
      : "";

    // Append image URLs to the prompt so the AI uses them in the HTML
    const imageContext = attachedImages.length > 0
      ? `\n\nImágenes adjuntas — úsalas en el diseño según la instrucción:\n${attachedImages.map(img => `- ${img.url}`).join("\n")}`
      : "";

    const imageUrlsSnapshot = attachedImages.map(img => img.url);

    // Append user bubble + loading assistant bubble
    setChatMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: currentInput, attachments: imageUrlsSnapshot, status: "done" },
      { id: assistantMsgId, role: "assistant", content: "", status: "loading" },
    ]);
    setChatInput("");
    setAttachedImages([]); // clear after sending
    setGenerating(true);

    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      // Pass conversation history so the AI has full context when refining
      const historyForApi = chatMessages
        .filter(m => m.status === "done")
        .map(m => ({ role: m.role, content: m.content, status: m.status, summary: m.summary }));

      const res = await supabase.functions.invoke("generate-landing", {
        body: {
          prompt: currentInput + formContext + imageContext,
          page_id: selectedId || "PENDING",
          current_html: generatedHtml || undefined,
          chat_history: historyForApi,
        },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      const html = res.data.html as string;
      if (!html) throw new Error("La IA no devolvió HTML. Intenta de nuevo.");
      const summary: string = res.data.summary || "✓ Aplicado";

      // Debug: log HTML change for diagnosis
      const prevLen = generatedHtml.length;
      const newLen = html.length;
      const htmlChanged = html !== generatedHtml;
      console.log(`[LandingBuilder] AI response — prev: ${prevLen} chars, new: ${newLen} chars, changed: ${htmlChanged}`);
      if (!htmlChanged) {
        console.warn('[LandingBuilder] WARNING: AI returned identical HTML — no visual changes will be seen');
        toast.warning("La IA no modificó el HTML. Intenta ser más específico en tu pedido.");
      }

      // Update HTML and force iframe remount (updating srcDoc on existing iframe
      // is not always reliable — version counter in key forces a fresh mount).
      setGeneratedHtml(html);
      setPreviewHtml(html);
      setHtmlVersion(v => v + 1);

      // Fix: use functional update to avoid stale chatMessages closure.
      // The closure captured chatMessages BEFORE setChatMessages added userMsg,
      // so using it directly would drop the user's message from history.
      setChatMessages(prev => {
        const withoutLoading = prev.filter(m => m.status !== "loading");
        const updated: ChatMessage[] = [
          ...withoutLoading,
          { id: assistantMsgId, role: "assistant" as const, content: summary, summary, status: "done" as const },
        ];
        // Auto-save chat history (fire-and-forget)
        if (selectedId) {
          supabase.from("landing_pages")
            .update({ chat_history: updated })
            .eq("id", selectedId)
            .then(() => {});
        }
        return updated;
      });
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
      if (mode === "drag") {
        // Drag mode: export from Unlayer and inject configured form
        const formHtml = generateFormHtml(formConfig, selectedId);
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
                  chat_history: chatMessages.filter(m => m.status !== "loading"),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", selectedId);
              if (error) throw error;
              resolve();
            } catch (e) { reject(e); }
          });
        });
      } else {
        // AI mode — form is already in the AI-generated HTML; save as-is.
        // form_config only stores CRM field mappings + pipeline assignment.
        const { error } = await supabase
          .from("landing_pages")
          .update({
            name, slug: slug || toSlug(name),
            html: generatedHtml || "",
            prompt,
            mode: "ai",
            status: targetStatus,
            form_config: formConfig,
            // Persist only done/error messages so history survives page reload
            chat_history: chatMessages.filter(m => m.status !== "loading"),
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
      <div className="flex h-full flex-col">

        {/* ── Full-width Toolbar ── */}
        <div className="border-b border-border px-3 py-2 flex items-center gap-2 shrink-0">

          {/* ── Two-level picker: Funnels → Pages (Lovable-style) ── */}
          <Popover open={pagePickerOpen} onOpenChange={(open) => {
            setPagePickerOpen(open);
            // When reopening, go straight to pages if a funnel is already selected
            if (open && selectedFunnelId) setPickerLevel("pages");
          }}>
            <PopoverTrigger asChild>
              <button className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-sm font-medium",
                "hover:bg-accent transition-colors min-w-[160px] max-w-[260px]",
                loadingPages && "opacity-60 pointer-events-none"
              )}>
                {loadingPages ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1 text-left text-xs">
                  {selectedFunnelId && funnels.find(f => f.id === selectedFunnelId)
                    ? <>
                        <span className="text-muted-foreground">{funnels.find(f => f.id === selectedFunnelId)!.name}</span>
                        {selectedId && <span className="text-foreground"> / {name}</span>}
                      </>
                    : "Seleccionar funnel…"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>

            <PopoverContent className="w-80 p-0" align="start">

              {/* ── LEVEL 1: Funnels ── */}
              {pickerLevel === "funnels" && (
                <>
                  <div className="p-2 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground px-1">Mis funnels</p>
                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                      onClick={() => { setNewFunnelOpen(true); setPagePickerOpen(false); }}>
                      <Plus className="h-3 w-3" /> Nuevo
                    </Button>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {funnels.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Sin funnels todavía</p>
                    ) : funnels.map(funnel => (
                      <button key={funnel.id}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent transition-colors group",
                          selectedFunnelId === funnel.id && "bg-accent"
                        )}
                        onClick={() => { setSelectedFunnelId(funnel.id); setPickerLevel("pages"); }}
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-left truncate font-medium">{funnel.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {pages.filter(p => p.funnel_id === funnel.id).length}p
                          </span>
                          <ChevronDown className="h-3 w-3 text-muted-foreground -rotate-90" />
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-0.5 rounded"
                            onClick={e => { e.stopPropagation(); handleDeleteFunnel(funnel.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ── LEVEL 2: Pages within funnel ── */}
              {pickerLevel === "pages" && selectedFunnelId && (
                <>
                  <div className="p-2 border-b border-border flex items-center gap-2">
                    <button onClick={() => setPickerLevel("funnels")}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span className="font-semibold truncate max-w-[140px]">
                        {funnels.find(f => f.id === selectedFunnelId)?.name}
                      </span>
                    </button>
                    <span className="text-muted-foreground/40 text-xs ml-auto">páginas</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {funnelPages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Sin páginas en este funnel</p>
                    ) : funnelPages.map((page, idx) => (
                      <button key={page.id}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors group",
                          selectedId === page.id && "bg-accent"
                        )}
                        onClick={() => { selectPage(page); setPagePickerOpen(false); }}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground/50 w-3 text-right">{idx + 1}</span>
                          <span className={cn("h-1.5 w-1.5 rounded-full",
                            page.status === "published" ? "bg-green-500" : "bg-muted-foreground/30")} />
                        </div>
                        <span className="flex-1 text-left truncate">{page.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{page.views}v · {page.leads_count}L</span>
                          {selectedId === page.id && <Check className="h-3 w-3 text-primary" />}
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-0.5 rounded"
                            onClick={e => { e.stopPropagation(); handleDelete(page.id); setPagePickerOpen(false); }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="w-full h-8 text-xs gap-1.5 justify-start"
                      onClick={() => { setNewPageOpen(true); setPagePickerOpen(false); }}>
                      <Plus className="h-3.5 w-3.5" /> Nueva página en este funnel
                    </Button>
                  </div>
                </>
              )}

            </PopoverContent>
          </Popover>

          {selectedId && (
            <>
              {/* Slug / public URL */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3 shrink-0" />
                <span className="text-muted-foreground/60 shrink-0 hidden sm:inline">pages.klosify.com/</span>
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
                    className="hover:text-foreground underline font-mono max-w-[120px] truncate"
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
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {views}</span>
                <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" /> {leadsCount}L</span>
              </div>
            </>
          )}

          <div className="flex-1" />

          {selectedId ? (
            <>

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

                {/* Form integration button — only meaningful once the AI generated an HTML with a form */}
                {(formConfig.fields ?? []).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 relative"
                    onClick={() => setFormConfigOpen(true)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Integrar formulario
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center font-bold">
                      {(formConfig.fields ?? []).length}
                    </span>
                  </Button>
                )}

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
            ) : null}
        </div>

        {/* ── Editor body ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
              <Globe className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecciona una landing page o crea una nueva</p>
              <Button onClick={() => setNewPageOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nueva landing page
              </Button>
            </div>
          ) : mode === "ai" ? (
            /* ── AI Mode ── */
            <div className="flex-1 flex min-h-0">

              {/* ── Preview panel (dominant) ── */}
              <div className="flex-1 flex flex-col min-w-0">
                {previewHtml ? (
                  <>
                    {/* Preview toolbar */}
                    <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 shrink-0">
                      {/* View / Edit toggle */}
                      <button
                        onClick={() => {
                          setPreviewHtml(generatedHtml);
                          setEditMode(false);
                          setHtmlVersion(v => v + 1); // force iframe remount with latest HTML
                        }}
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

                      <div className="flex-1" />

                      {/* Device size switcher */}
                      <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                        {(
                          [
                            { id: "desktop", icon: Monitor,    label: "Escritorio",   w: "–"     },
                            { id: "tablet",  icon: Tablet,     label: "Tablet 768px", w: "768px" },
                            { id: "mobile",  icon: Smartphone, label: "Móvil 390px",  w: "390px" },
                          ] as const
                        ).map(({ id, icon: Icon, label }) => (
                          <button
                            key={id}
                            onClick={() => setDeviceSize(id)}
                            title={label}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              deviceSize === id
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>

                      {/* Width label */}
                      <span className="text-[10px] text-muted-foreground w-12 text-right font-mono">
                        {deviceSize === "desktop" ? "100%" : DEVICE_WIDTHS[deviceSize]}
                      </span>

                      {/* HTML version/size indicator — helps diagnose if state is updating */}
                      {generatedHtml && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                          v{htmlVersion} · {(generatedHtml.length / 1024).toFixed(1)}kb
                        </span>
                      )}

                      {/* Chat toggle */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setChatOpen(prev => !prev)}
                              className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ml-1",
                                chatOpen
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                              )}
                            >
                              <Sparkles className="h-3 w-3" />
                              IA
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {chatOpen ? "Cerrar panel IA" : "Abrir panel IA"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* iframe wrapper */}
                    <div className={cn(
                      "flex-1 overflow-auto",
                      deviceSize !== "desktop" ? "bg-muted/40 flex justify-center pt-4" : ""
                    )}>
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          deviceSize !== "desktop" && "rounded-t-xl overflow-hidden shadow-xl border border-border"
                        )}
                        style={{
                          width: DEVICE_WIDTHS[deviceSize] ?? "100%",
                          height: deviceSize !== "desktop" ? "calc(100% - 16px)" : "100%",
                        }}
                      >
                        {editMode ? (
                          /* Edit mode: no sandbox, onLoad calls setupEditMode.
                             htmlVersion in key forces remount when AI updates HTML. */
                          <iframe
                            ref={editIframeRef}
                            key={`edit-${deviceSize}-${htmlVersion}`}
                            srcDoc={addTargetBlank(previewHtml)}
                            onLoad={setupEditMode}
                            className="w-full h-full border-0"
                            title="Editar landing"
                          />
                        ) : (
                          /* Preview mode: htmlVersion in key forces remount on
                             every AI generation so new content is always visible. */
                          <iframe
                            key={`preview-${deviceSize}-${htmlVersion}`}
                            srcDoc={buildPreviewSrcDoc(previewHtml)}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                            title="Vista previa landing"
                          />
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
                    <Sparkles className="h-10 w-10 opacity-20" />
                    <p className="text-sm">Describe tu landing page en el panel IA</p>
                    {!chatOpen && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setChatOpen(true)}
                        className="gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Abrir panel IA
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Chat panel (collapsible, RIGHT side) ── */}
              {chatOpen && (
              <div className="w-80 shrink-0 border-l border-border flex flex-col">
                {/* Header */}
                <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Editar con IA
                  </span>
                  <div className="flex items-center gap-1">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setChatOpen(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
                      <div key={msg.id} className={cn("flex flex-col gap-0.5", msg.role === "user" ? "items-end" : "items-start")}>
                        {msg.role === "user" ? (
                          /* User bubble */
                          <div className="bg-primary text-primary-foreground text-xs rounded-2xl rounded-tr-sm px-3 py-2 max-w-[90%] space-y-1.5">
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {msg.attachments.map((url, i) => (
                                  <img key={i} src={url} alt="adjunto"
                                    className="h-16 w-16 object-cover rounded-lg opacity-90" />
                                ))}
                              </div>
                            )}
                            <span className="whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                          </div>
                        ) : msg.status === "confirm_new_page" ? (
                          /* ── New-page confirmation card ── */
                          <div className="bg-muted border border-border rounded-xl rounded-tl-sm px-3 py-3 max-w-[95%] space-y-2.5">
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-foreground">¿Crear nueva página en el funnel?</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                  Se creará con el estilo visual de esta página para que quede consistente.
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 text-xs flex-1 gap-1"
                                disabled={generating}
                                onClick={() => handleCreatePageFromChat(msg.newPagePrompt!, msg.id)}>
                                <Plus className="h-3 w-3" />
                                Sí, crear nueva página
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                disabled={generating}
                                onClick={() => {
                                  // Dismiss confirm and modify current page instead
                                  setChatMessages(prev => prev.filter(m => m.id !== msg.id));
                                  setChatInput(msg.newPagePrompt || "");
                                }}>
                                No, modificar esta
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Assistant bubble */
                          <div className={cn(
                            "text-xs rounded-2xl rounded-tl-sm px-3 py-2 max-w-[90%] leading-relaxed",
                            msg.status === "error"
                              ? "bg-destructive/10 text-destructive border border-destructive/20"
                              : "bg-muted text-foreground"
                          )}>
                            {msg.status === "loading" ? (
                              <span className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="animate-spin h-3 w-3 shrink-0" />
                                Generando página...
                              </span>
                            ) : msg.status === "error" ? (
                              <span>{msg.content}</span>
                            ) : (
                              <span className="flex items-start gap-1.5">
                                <span className="text-green-500 shrink-0 mt-px">✓</span>
                                <span>{msg.content}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Form status strip */}
                <div className="shrink-0 border-t border-border px-3 py-2 bg-muted/30">
                  {(formConfig.fields ?? []).length === 0 ? (
                    /* No form detected yet */
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3 shrink-0" />
                      Menciona en tu prompt que quieres un formulario de captura
                    </p>
                  ) : (
                    /* Form detected — show fields + integrate button */
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {(formConfig.fields ?? []).length} campos detectados
                        </span>
                        <button
                          onClick={() => setFormConfigOpen(true)}
                          className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          Integrar con CRM →
                        </button>
                      </div>
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
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div className="shrink-0 border-t border-border p-3 space-y-2">

                  {/* Attached image previews */}
                  {attachedImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachedImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={img.preview}
                            alt={img.name}
                            className="h-14 w-14 object-cover rounded-lg border border-border"
                          />
                          <button
                            onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={generatedHtml ? "Describe qué cambiar..." : "Describe tu landing desde cero..."}
                    className="text-sm resize-none min-h-[72px]"
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />

                  {/* Hidden file input */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach(handleImageAttach);
                      e.target.value = "";
                    }}
                  />

                  <div className="flex gap-2 items-center">
                    {/* Image attach button */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 shrink-0"
                            disabled={uploadingImage}
                            onClick={() => imageInputRef.current?.click()}
                          >
                            {uploadingImage
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ImageIcon className="h-3.5 w-3.5" />
                            }
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Adjuntar imagen</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {generatedHtml && (
                      <span className="text-[10px] text-muted-foreground flex-1">
                        Modo refinado — mantiene el diseño
                      </span>
                    )}

                    <Button
                      size="sm"
                      className="gap-1.5 ml-auto"
                      disabled={generating || (!chatInput.trim() && attachedImages.length === 0)}
                      onClick={handleGenerate}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {generating ? "Enviando..." : generatedHtml ? "Refinar" : "Generar"}
                    </Button>
                  </div>
                </div>
              </div>
              )}
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

      {/* ── New funnel dialog ── */}
      <Dialog open={newFunnelOpen} onOpenChange={setNewFunnelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" /> Nuevo funnel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nombre del funnel</Label>
              <Input
                value={newFunnelName}
                onChange={(e) => setNewFunnelName(e.target.value)}
                placeholder="Ej: Webinar Mayo, Lanzamiento producto..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateFunnel()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Agrupa varias páginas dentro de un mismo embudo (principal, gracias, upsell…)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFunnelOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateFunnel} disabled={!newFunnelName.trim()}>Crear funnel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New page dialog ── */}
      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Nueva página
              {selectedFunnelId && funnels.find(f => f.id === selectedFunnelId) && (
                <span className="text-muted-foreground font-normal text-sm">
                  en {funnels.find(f => f.id === selectedFunnelId)!.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Nombre de la página</Label>
              <Input
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                placeholder="Ej: Página de gracias, Upsell..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              URL pública: <span className="font-mono">{toSlug(newPageName) || "mi-pagina"}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreatePage} disabled={!newPageName.trim()}>Crear página</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Form Integration Sheet ── */}
      <Sheet open={formConfigOpen} onOpenChange={setFormConfigOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[460px] overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              Integrar formulario con CRM
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              La IA detecta los campos automáticamente. Solo indica a qué columna del CRM va cada uno.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            {/* ── Detected fields ── */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">
                Campos detectados del formulario
              </Label>

              {(formConfig.fields ?? []).length === 0 ? (
                /* No form in HTML yet */
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-5 text-center space-y-2">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    No se detectó ningún formulario en la landing.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Genera una landing con IA y menciona que quieres un formulario de captura de leads.
                  </p>
                </div>
              ) : (
                /* Field → CRM mapping table */
                <div className="space-y-2">
                  {(formConfig.fields ?? []).map(field => (
                    <div key={field.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{field.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{field.name}</p>
                      </div>
                      <span className="text-muted-foreground/60 text-sm shrink-0">→</span>
                      <Select
                        value={field.crm_field || "_ignore"}
                        onValueChange={v => setFormConfig(prev => ({
                          ...prev,
                          fields: (prev.fields ?? []).map(f => f.id === field.id ? { ...f, crm_field: v } : f),
                        }))}
                      >
                        <SelectTrigger className="h-7 text-xs w-44 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRM_FIELD_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
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
                    ✓ Los leads irán a <strong>{formConfig.pipeline_name} → {formConfig.stage_name}</strong>
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* ── Footer ── */}
          <div className="border-t px-5 py-4 shrink-0 bg-background">
            <Button
              className="w-full gap-2"
              onClick={() => {
                setFormConfigOpen(false);
                if (selectedId) handleSave();
              }}
              disabled={saving || !(formConfig.fields ?? []).length}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Guardar integración
            </Button>
            {!(formConfig.fields ?? []).length && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Genera una landing con formulario primero.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

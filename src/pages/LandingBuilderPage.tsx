import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useOrganizationContext } from "@/context/OrganizationContext";
import { LandingTemplates } from "@/components/landing/LandingTemplates";
// @ts-expect-error — react-email-editor ships without bundled types in v1
import EmailEditor from "react-email-editor";

// ── Link preprocessing (no script required — CSP-safe) ───────────────────────
// Instead of injecting a click-intercept script (blocked by CSP),
// we rewrite <a href="..."> in the HTML string before setting srcDoc.
// ── Section ID backfill ───────────────────────────────────────────────────────
// Adds required id attributes to sections that lack them in older pages.
// Called when loading a page for editing — enables surgical mode on legacy pages.
function backfillSectionIds(html: string): string {
  // Skip if page already has section IDs (new pages from FRESH_SYSTEM)
  if (html.includes('id="hero"') || html.includes("id='hero'")) return html;
  let result = html;

  // Header / nav
  result = result.replace(/<header(?![^>]*\bid=)[^>]*>/i, m => m.replace('<header', '<header id="site-header"'));
  // Footer
  result = result.replace(/<footer(?![^>]*\bid=)[^>]*>/i, m => m.replace('<footer', '<footer id="site-footer"'));

  // Assign IDs to sections in document order based on known content signals
  const knownIds = [
    { signal: /min-h-screen|mesh-bg|mesh-dark|hero-cta|anim-title/, id: 'hero' },
    { signal: /te suena familiar|suena familiar|pain|agitac|dolor/, id: 'pain' },
    { signal: /logo.*cloud|trusted by|confían en|con la confianza|grayscale/, id: 'logo-cloud' },
    { signal: /data-counter|clientes activos|años de experiencia|proyectos entregados/, id: 'stats' },
    { signal: /por qué elegir|característica|feature|beneficio|icon-box/, id: 'features' },
    { signal: /cómo funciona|how it works|paso 1|paso 2|paso 3|numbered/, id: 'how-it-works' },
    { signal: /antes.*sin|sin.*antes|con vs|before.*after|✕.*sin|✓.*con/, id: 'before-after' },
    { signal: /★★★★★|testimonial|reseña|opinión|lo que dicen/, id: 'testimonials' },
    { signal: /popular|plan.*mes|mensual|tarifa|suscripción|\$\d/, id: 'pricing' },
    { signal: /<details|accordion|pregunta frecuente|faq/, id: 'faq' },
    { signal: /youtube|vimeo|video-container|ver demo|play button/, id: 'video' },
    { signal: /empieza hoy|final.*cta|garantizado|garantía 30/, id: 'final-cta' },
    { signal: /lead-form-section|id="lead-form"/, id: 'lead-form-section' },
  ];

  // Process each section tag without an id
  const sectionPattern = /<section(?![^>]*\bid=)[^>]*>/gi;
  result = result.replace(sectionPattern, (match, offset) => {
    // Look ahead in the HTML to find content signals
    const snippet = result.slice(offset, offset + 600).toLowerCase();
    for (const { signal, id } of knownIds) {
      // Skip if this ID is already assigned
      if (result.includes(`id="${id}"`) || result.includes(`id='${id}'`)) continue;
      if (signal.test(snippet)) {
        return match.replace('<section', `<section id="${id}"`);
      }
    }
    return match;
  });

  return result;
}

// Anchor links (#) and javascript: are left alone — they don't navigate away.
// ── Section lock helpers ──────────────────────────────────────────────────────

/** Returns all section IDs detected in the HTML, in document order. */
function detectSectionIds(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pattern = /<(?:section|header|footer)[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

/** Returns true if a section is locked. */
function isSectionLocked(html: string, sectionId: string): boolean {
  const pat = new RegExp(`<(?:section|header|footer)[^>]*\\bid=["']${sectionId}["'][^>]*>`, 'i');
  const m = html.match(pat);
  return m ? m[0].includes('data-locked="true"') : false;
}

/** Toggles data-locked="true" on a section by its ID. */
function toggleSectionLock(html: string, sectionId: string, lock: boolean): string {
  // Try section, header, footer
  for (const tag of ['section', 'header', 'footer']) {
    const pat = new RegExp(`(<${tag}[^>]*\\bid=["']${sectionId}["'][^>]*?)>`, 'i');
    if (pat.test(html)) {
      if (lock) {
        return html.replace(pat, (_, attrs) =>
          attrs.includes('data-locked') ? `${attrs}>` : `${attrs} data-locked="true">`
        );
      } else {
        return html.replace(pat, (_, attrs) =>
          `${attrs.replace(/\s*data-locked="true"/g, '')}>`
        );
      }
    }
  }
  return html;
}

/** Human-readable label for a section ID. */
function sectionLabel(id: string): string {
  const labels: Record<string, string> = {
    'site-header': '🧭 Navegación', hero: '🦸 Hero', pain: '😤 Problema/Agitación',
    'logo-cloud': '🏢 Logos clientes', stats: '📊 Estadísticas', features: '⭐ Características',
    bento: '🔲 Bento grid', 'how-it-works': '⚙️ Cómo funciona', 'before-after': '↔️ Antes/Después',
    zigzag: '🔀 Detalle alternado', testimonials: '💬 Testimonios', 'featured-quote': '🗣️ Cita destacada',
    comparison: '📋 Comparación', pricing: '💲 Precios', faq: '❓ FAQ',
    video: '▶️ Video', 'final-cta': '🎯 CTA Final', 'lead-form-section': '📝 Formulario',
    'site-footer': '🦶 Footer',
  };
  return labels[id] ?? `📌 ${id}`;
}

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

// buildPreviewSrcDoc: rewrite links + inject CTA click-intercept (postMessage to parent)
// The preview iframe sandbox allows scripts + postMessage, so we tag every href="#"
// link outside the form with data-klosify-cta="N" and listen for clicks.
//
// Early-CSS injection: provide Tailwind utility classes BEFORE the CDN loads.
// Without this, AI-generated modal overlays that use class="hidden" are visible until
// the CDN finishes loading (~100-500ms), causing a solid-color flash (or permanent
// full-screen overlay if the CDN load fails / is slow).
// CSS injected in BOTH edit and preview modes:
// prevents flash of class="hidden" modal overlays before Tailwind CDN loads.
const COMMON_EARLY_CSS = `<style id="klosify-early">
.hidden{display:none!important}
</style>`;

// CSS injected ONLY in edit mode (full-page height expansion).
// The iframe is dynamically resized to fit all content so the user can click/edit
// any section. This overrides min-h-screen to break the infinite height loop that
// occurs when the iframe viewport equals the measured content height.
// NOT used in preview mode — preview uses a fixed viewport so min-h-screen renders
// correctly, matching the published page exactly.
const EDIT_ONLY_CSS = `<style id="klosify-edit-overrides">
.min-h-screen{min-height:0!important}
.h-screen{height:auto!important}
</style>`;

// ── buildPreviewSrcDoc ────────────────────────────────────────────────────────
// Used for the PREVIEW iframe (Vista previa mode).
// The iframe has a FIXED viewport height (like a real browser window) so
// min-h-screen sections render at 100vh = the visible viewport, exactly as
// users see the published page. The iframe scrolls internally.
// No height reporter needed — we don't resize the iframe dynamically.
function buildPreviewSrcDoc(html: string): string {
  let result = addTargetBlank(html);

  // Inject only the safe early CSS (no min-h-screen override)
  if (result.includes("<head>")) {
    result = result.replace("<head>", "<head>\n" + COMMON_EARLY_CSS);
  } else if (result.includes("</head>")) {
    result = result.replace("</head>", COMMON_EARLY_CSS + "\n</head>");
  } else {
    result = COMMON_EARLY_CSS + "\n" + result;
  }

  // Tag CTA buttons for inline link editing
  const formMatch = result.match(/<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i);
  const FP = "___KLOSIFY_FORM___";
  let work = formMatch ? result.replace(formMatch[0], FP) : result;
  let ctaN = 0;
  work = work.replace(
    /<a([^>]*)\bhref=["']#["']([^>]*)>/gi,
    (_m, before, after) => `<a${before} href="#" data-klosify-cta="${ctaN++}"${after}>`,
  );
  if (formMatch) work = work.replace(FP, formMatch[0]);

  // CTA click intercept only (no height reporter — preview uses fixed viewport height)
  const ctaScript = `<script>
(function(){
  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-klosify-cta]');
    if(!el)return;
    e.preventDefault();e.stopPropagation();
    var r=el.getBoundingClientRect();
    window.parent.postMessage({
      type:'klosify_cta',
      idx:parseInt(el.dataset.klosifyCta),
      text:el.textContent.replace(/\\s+/g,' ').trim().slice(0,80),
      rect:{top:r.top,left:r.left,width:r.width,height:r.height,bottom:r.bottom}
    },'*');
  });
})();
<\/script>`;

  work = work.includes("</body>")
    ? work.replace("</body>", ctaScript + "\n</body>")
    : work + ctaScript;
  return work;
}

// ── buildEditSrcDoc ───────────────────────────────────────────────────────────
// Used for the EDIT iframe (Editar texto mode).
// The iframe expands to its full content height so the user can scroll to any
// section and click on text to edit it. Uses the height reporter + min-h-screen
// override to prevent the height-loop while still showing all sections.
function buildEditSrcDoc(html: string): string {
  let result = addTargetBlank(html);

  // Inject both common CSS and edit-only overrides
  const editCSS = COMMON_EARLY_CSS + "\n" + EDIT_ONLY_CSS;
  if (result.includes("<head>")) {
    result = result.replace("<head>", "<head>\n" + editCSS);
  } else if (result.includes("</head>")) {
    result = result.replace("</head>", editCSS + "\n</head>");
  } else {
    result = editCSS + "\n" + result;
  }

  // Height reporter — expands the edit iframe to show all content
  const heightScript = `<script>
(function(){
  var lastH=0;
  function reportHeight(){
    var h=Math.max(
      document.body.scrollHeight,document.documentElement.scrollHeight,
      document.body.offsetHeight,document.documentElement.offsetHeight
    );
    if(h>100&&h!==lastH){lastH=h;window.parent.postMessage({type:'klosify_height',h:h},'*');}
  }
  reportHeight();
  document.addEventListener('DOMContentLoaded',function(){reportHeight();setTimeout(reportHeight,100);});
  window.addEventListener('load',function(){reportHeight();setTimeout(reportHeight,300);});
  [500,1000,1500,2000,3000,5000].forEach(function(t){setTimeout(reportHeight,t);});
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(function(){reportHeight();}).observe(document.documentElement);
  }
})();
<\/script>`;

  return result.includes("</body>")
    ? result.replace("</body>", heightScript + "\n</body>")
    : result + heightScript;
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

export interface CtaLink {
  text: string;   // visible button label (used as display key)
  url: string;    // destination URL (empty = keep original)
}

export interface FormConfig {
  fields: FormField[];
  pipeline_id: string;
  stage_id: string;
  pipeline_name: string;
  stage_name: string;
  cta_text: string;
  success_message: string;
  // Connections
  redirect_url?: string;    // after form submit: full URL or empty (shows inline message)
  cta_url?: string;         // legacy single-CTA override (kept for backward compat)
  cta_links?: CtaLink[];    // per-CTA configuration (indexed, matches detection order)
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
  redirect_url: "",
  cta_url: "",
  cta_links: [],
};

// ── Auto-detect form fields from AI-generated HTML ────────────────────────────
function detectFormFields(html: string): Omit<FormField, 'crm_field'>[] {
  if (!html) return [];
  // 1st try: canonical lead-form ID (most reliable)
  let formMatch = html.match(/<form[^>]*id=["']lead-form["'][^>]*>([\s\S]*?)<\/form>/i);
  // 2nd try: any <form> in the HTML — catches popup/modal forms where the AI
  // used a different ID (e.g. inside a hidden modal div).
  // Exclude forms that only contain a submit button (search bars, etc.)
  if (!formMatch) {
    const allForms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi)];
    // Pick the first form that has at least one named input/textarea
    const realForm = allForms.find(m => /\sname=["'][^"']+["']/i.test(m[1]));
    if (realForm) formMatch = realForm as RegExpMatchArray;
  }
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

// ── Auto-detect CTA links (href="#") outside the lead form ───────────────────
function detectCtaLinks(html: string): CtaLink[] {
  if (!html) return [];
  // Strip the lead form so we don't pick up submit-button links inside it
  const noForm = html.replace(/<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i, "");
  const results: CtaLink[] = [];
  // Match <a href="#"> ... </a>  (href is exactly "#")
  const re = /<a[^>]*\bhref=["']#["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(noForm)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (text) results.push({ text, url: "" });
  }
  return results;
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
const SUPABASE_SUBMIT_URL = `${import.meta.env.VITE_SUPABASE_URL || "https://oqwcgvemrvimrdrzjzil.supabase.co"}/functions/v1/landing-submit`;

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
    // Auto-capture UTMs (+ ad click ids) from the URL on first load and persist
    // them so they survive navigation within the landing.
    var UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
    try{
      var sp=new URLSearchParams(window.location.search);
      UTM_KEYS.forEach(function(k){var val=sp.get(k);if(val){try{localStorage.setItem('kl_'+k,val);}catch(_){}}});
    }catch(_){}
    function getUtm(k){
      try{var sp=new URLSearchParams(window.location.search);var u=sp.get(k);if(u)return u;}catch(_){}
      try{return localStorage.getItem('kl_'+k)||'';}catch(_){return '';}
    }
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      btn.disabled=true;btn.textContent='Enviando...';
      var data={page_id:form.dataset.pageId,source:window.location.href};
      UTM_KEYS.forEach(function(k){var v=getUtm(k);if(v)data[k]=v;});
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
  // 1st try: replace by canonical id="lead-form"
  const leadFormRe = /<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i;
  if (leadFormRe.test(html)) return html.replace(leadFormRe, formHtml);
  // 2nd try: replace the first form that has named inputs (popup form without lead-form ID)
  const anyFormRe = /<form[^>]*>[\s\S]*?<\/form>/gi;
  const allForms = [...html.matchAll(anyFormRe)];
  const realForm = allForms.find(m => /\sname=["'][^"']+["']/i.test(m[0]));
  if (realForm) return html.replace(realForm[0], formHtml);
  // Last resort: inject before </body>
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
const PAGES_DOMAIN = import.meta.env.VITE_PAGES_DOMAIN || "pages.klosify.com";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
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
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
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
  // Version history — in-memory snapshots (fast undo) + DB versions (persistent)
  const htmlHistoryRef = useRef<string[]>([]);
  const pushHtmlHistory = (html: string) => {
    htmlHistoryRef.current = [html, ...htmlHistoryRef.current].slice(0, 10);
  };
  const [dbVersions, setDbVersions] = useState<{ id: string; summary: string | null; created_at: string; version_number: number }[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  // Section lock panel
  const [showLockPanel, setShowLockPanel] = useState(false);

  // Section to highlight after AI edit (visual diff like Lovable)
  const highlightSectionRef = useRef<string | null>(null);

  // Templates panel — shown in empty state, hidden once HTML exists or user dismisses
  const [showTemplates, setShowTemplates] = useState(true);

  // Chat interface
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Image attachments for AI prompts
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // PDF attachment (brochure / brand doc → Claude reads it directly)
  const [attachedPdf, setAttachedPdf] = useState<{ name: string; base64: string; sizeKb: number } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Inline edit mode
  const [editMode, setEditMode] = useState(false);
  // Ref to the edit-mode iframe + cleanup handles
  const editIframeRef = useRef<HTMLIFrameElement>(null);
  const editMoRef    = useRef<MutationObserver | null>(null);
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat panel visibility (collapsible)
  const [chatOpen, setChatOpen] = useState(true);

  // ── CTA inline link editor (click in preview → floating popover) ─────────────
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  interface CtaPopoverState {
    open: boolean;
    ctaIdx: number;
    text: string;
    screenX: number;
    screenY: number;
  }
  const [ctaPopover, setCtaPopover] = useState<CtaPopoverState>({
    open: false, ctaIdx: -1, text: "", screenX: 0, screenY: 0,
  });
  const [ctaPopoverUrl, setCtaPopoverUrl] = useState("");

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

  // Full-page preview height — set by klosify_height postMessage from the iframe.
  // While 0, the iframe falls back to 100% of its container.
  const [previewContentHeight, setPreviewContentHeight] = useState(0);

  // UI state
  const [saving, setSaving] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);

  // Token balance
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);

  // Generation elapsed timer (for progress feedback during ~60-90s wait)
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const generationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [streamedTokens, setStreamedTokens] = useState(0);
  const [newPageName, setNewPageName] = useState("");
  const [slugEditing, setSlugEditing] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);

  // ── 3-level navigation: projects → pages → editor ───────────────────────────
  const [builderView, setBuilderView] = useState<"projects" | "pages" | "editor">("projects");

  // Funnel state
  const [funnels, setFunnels] = useState<LandingFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [pickerLevel, setPickerLevel] = useState<"funnels" | "pages">("funnels");
  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");

  // Pages in the currently selected funnel
  const funnelPages = pages.filter(p => p.funnel_id === selectedFunnelId);

  // ── Page role auto-detection ─────────────────────────────────────────────────
  const detectPageRole = (text: string): string => {
    const t = text.toLowerCase();
    if (/\b(gracias|agradecimiento|thank[\s-]?you|confirmaci[oó]n|confirmado|bienvenida|registro\s+completo|suscrit[oa])\b/.test(t)) return "thankyou";
    if (/\bupsell\b|\boferta\s+(especial|exclusiva)\b|\bactualiz[a-z]+\s+tu\b|\bupgrade\b/.test(t)) return "upsell";
    return "main";
  };

  // ── Page role metadata ───────────────────────────────────────────────────────
  const PAGE_ROLES = ["main", "thankyou", "upsell"] as const;
  const ROLE_META: Record<string, { label: string; cls: string }> = {
    main:     { label: "Principal", cls: "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25" },
    thankyou: { label: "Gracias",   cls: "bg-green-500/15 text-green-600 hover:bg-green-500/25" },
    upsell:   { label: "Upsell",    cls: "bg-orange-500/15 text-orange-600 hover:bg-orange-500/25" },
    other:    { label: "Otra",      cls: "bg-muted text-muted-foreground hover:bg-muted/80" },
  };
  const cycleRoleOf = (current: string) => {
    const idx = PAGE_ROLES.indexOf(current as typeof PAGE_ROLES[number]);
    return PAGE_ROLES[(idx === -1 ? 1 : (idx + 1)) % PAGE_ROLES.length];
  };
  // Translated label for a page role (ROLE_META labels are Spanish constants)
  const roleLabel = (role: string): string => {
    const key: Record<string, string> = {
      main: "landingBuilderPage.rolePrincipal",
      thankyou: "landingBuilderPage.roleThankyou",
      upsell: "landingBuilderPage.roleUpsell",
      other: "landingBuilderPage.roleOther",
    };
    return t(key[role] ?? "landingBuilderPage.roleOther");
  };

  // ── Fetch funnels ────────────────────────────────────────────────────────────
  const fetchFunnels = useCallback(async () => {
    const { data } = await supabase
      .from("landing_funnels")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });
    setFunnels((data || []) as LandingFunnel[]);
    // No auto-navigation — user starts at the projects view
  }, []);

  // ── Fetch pages ─────────────────────────────────────────────────────────────
  const fetchPages = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("landing_pages")
      .select("id,name,slug,html,design,prompt,mode,status,views,leads_count,updated_at,form_config,chat_history,funnel_id,page_role,page_order")
      .eq("organization_id", organizationId)
      .order("page_order", { ascending: true });
    setPages((data || []) as LandingPage[]);
    setLoadingPages(false);
  }, [organizationId]);

  useEffect(() => { fetchPages(); fetchFunnels(); }, [fetchPages, fetchFunnels]);

  // ── Fetch token balance ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("ia_landings_credits")
      .select("credits_remaining")
      .gt("credits_remaining", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTokensRemaining(data?.credits_remaining ?? 0));
  }, []);

  // ── Create funnel ────────────────────────────────────────────────────────────
  const handleCreateFunnel = async () => {
    if (!newFunnelName.trim()) return;
    const { data, error } = await supabase
      .from("landing_funnels")
      .insert({ name: newFunnelName.trim() })
      .select()
      .single();
    if (error) { toast.error(t("landingBuilderPage.errorCreateFunnel")); return; }
    const nf = data as LandingFunnel;
    setFunnels(prev => [...prev, nf]);
    setSelectedFunnelId(nf.id);
    setPickerLevel("pages");
    setNewFunnelOpen(false);
    setNewFunnelName("");
    setBuilderView("pages");
    toast.success(t("landingBuilderPage.projectCreated"));
  };

  // ── Delete funnel ────────────────────────────────────────────────────────────
  const handleDeleteFunnel = async (id: string) => {
    const { error } = await supabase.from("landing_funnels").delete().eq("id", id);
    if (error) { toast.error(t("landingBuilderPage.errorDeleteFunnel")); return; }
    setFunnels(prev => prev.filter(f => f.id !== id));
    if (selectedFunnelId === id) {
      const remaining = funnels.filter(f => f.id !== id);
      setSelectedFunnelId(remaining[0]?.id ?? null);
      if (remaining.length === 0) setPickerLevel("funnels");
    }
    toast.success(t("landingBuilderPage.funnelDeleted"));
  };

  // ── Inline rename ────────────────────────────────────────────────────────────
  // Single state tracks which item is being renamed (funnel or page)
  const [renaming, setRenaming] = useState<{ id: string; type: "funnel" | "page"; value: string } | null>(null);
  const [deleteFunnelTarget, setDeleteFunnelTarget] = useState<string | null>(null);
  const [deletePageTarget, setDeletePageTarget] = useState<string | null>(null);

  const startRename = (e: React.MouseEvent, id: string, type: "funnel" | "page", currentName: string) => {
    e.stopPropagation();
    setRenaming({ id, type, value: currentName });
  };

  const commitRename = async () => {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (!trimmed) { setRenaming(null); return; }

    if (renaming.type === "funnel") {
      const { error } = await supabase.from("landing_funnels").update({ name: trimmed }).eq("id", renaming.id);
      if (error) { toast.error(t("landingBuilderPage.errorRename")); return; }
      setFunnels(prev => prev.map(f => f.id === renaming.id ? { ...f, name: trimmed } : f));
    } else {
      const { error } = await supabase.from("landing_pages").update({ name: trimmed }).eq("id", renaming.id);
      if (error) { toast.error(t("landingBuilderPage.errorRename")); return; }
      setPages(prev => prev.map(p => p.id === renaming.id ? { ...p, name: trimmed } : p));
      if (selectedId === renaming.id) setName(trimmed);
    }
    setRenaming(null);
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
    bar.textContent = '✏️  ' + t("landingBuilderPage.editModeActive");
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

  // Reset measured height whenever the iframe remounts (new HTML version)
  useEffect(() => { setPreviewContentHeight(0); }, [htmlVersion]);

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
    if (!organizationId) return;
    supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at", { ascending: true })
      .then(({ data }) => setPipelines(data || []));
    supabase.from("pipeline_stages").select("id, name, pipeline_id").eq("organization_id", organizationId).order("order", { ascending: true })
      .then(({ data }) => setPipelineStages(data || []));
  }, [organizationId]);

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

  // ── Auto-detect CTA links when HTML changes ──────────────────────────────────
  useEffect(() => {
    if (!generatedHtml) return;
    const detected = detectCtaLinks(generatedHtml);
    setFormConfig(prev => {
      const existing = prev.cta_links ?? [];
      // Merge: preserve URLs already set by the user (match by position)
      const merged: CtaLink[] = detected.map((d, i) => ({
        text: d.text,
        url: existing[i]?.url ?? "",
      }));
      const same = merged.length === existing.length &&
        merged.every((c, i) => c.text === existing[i]?.text && c.url === existing[i]?.url);
      return same ? prev : { ...prev, cta_links: merged };
    });
  }, [generatedHtml]);

  // ── CTA inline link editor — listen for postMessage from preview iframe ───────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // ── Full-page height ─────────────────────────────────────────────────────
      if (e.data?.type === "klosify_height") {
        const h = e.data.h as number;
        if (h && h > 0) setPreviewContentHeight(h);
        return;
      }
      if (e.data?.type !== "klosify_cta") return;
      const iframe = previewIframeRef.current;
      if (!iframe) return;
      const iframeRect = iframe.getBoundingClientRect();
      // Position popover below the clicked element, clamped to viewport
      const rawX = iframeRect.left + e.data.rect.left;
      const rawY = iframeRect.top + e.data.rect.bottom + 10;
      const screenX = Math.min(rawX, window.innerWidth - 300);
      const screenY = Math.min(rawY, window.innerHeight - 220);
      setCtaPopover({ open: true, ctaIdx: e.data.idx, text: e.data.text, screenX, screenY });
      // Bug #26 fix: pre-fill with the URL already assigned to this CTA (if any)
      const existingUrl = formConfig.cta_links?.[e.data.idx]?.url ?? "";
      setCtaPopoverUrl(existingUrl);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Apply the configured URL to the CTA at ctaPopover.ctaIdx
  const applyCtaLink = (url: string) => {
    if (!url) { setCtaPopover(p => ({ ...p, open: false })); return; }
    const formMatch = generatedHtml.match(/<form[^>]*id=["']lead-form["'][^>]*>[\s\S]*?<\/form>/i);
    const FP = "___KLOSIFY_FORM___";
    let work = formMatch ? generatedHtml.replace(formMatch[0], FP) : generatedHtml;
    let idx = 0;
    work = work.replace(/<a([^>]*)\bhref=["']#["']([^>]*)>/gi, (match, before, after) => {
      if (idx === ctaPopover.ctaIdx) { idx++; return `<a${before} href="${url}"${after}>`; }
      idx++;
      return match;
    });
    if (formMatch) work = work.replace(FP, formMatch[0]);
    setGeneratedHtml(work);
    setPreviewHtml(work); // store raw HTML — iframes call build*SrcDoc themselves
    setHtmlVersion(v => v + 1);
    setCtaPopover(p => ({ ...p, open: false }));
    if (selectedId) {
      supabase.from("landing_pages").update({ html: work }).eq("id", selectedId)
        .then(({ error }) => { if (!error) toast.success(t("landingBuilderPage.buttonUpdated")); });
    }
  };

  // Close floating panels when pressing Escape or clicking outside
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowVersions(false); setShowLockPanel(false); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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
    // Backfill section IDs on legacy pages so surgical mode can find sections
    const backfilledHtml = page.html ? backfillSectionIds(page.html) : "";
    setGeneratedHtml(backfilledHtml);
    setPreviewHtml(backfilledHtml);
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
    setBuilderView("editor");
    setShowVersions(false);

    // Load persistent version history for this page
    if (page.id) {
      supabase.from("landing_page_versions")
        .select("id, summary, created_at, version_number")
        .eq("page_id", page.id)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => { if (data) setDbVersions(data); });
    }

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
    const baseSlug = toSlug(newPageName);
    const nextOrder = funnelPages.length; // append at end

    // Retry with numeric suffix if slug is already taken (unique constraint)
    let data: LandingPage | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt <= 9; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const res = await supabase
        .from("landing_pages")
        .insert({
          name: newPageName.trim(),
          slug,
          mode: "ai",
          funnel_id: selectedFunnelId,
          page_order: nextOrder,
          page_role: detectPageRole(newPageName),
          // Explicit org — the default trigger derives it from the WRITING
          // user, which files pages into the wrong workspace for multi-org
          // users (gestor working inside a client org).
          ...(organizationId ? { organization_id: organizationId } : {}),
        })
        .select()
        .single();
      if (!res.error) { data = res.data as LandingPage; break; }
      lastError = res.error;
      if (res.error.code !== "23505") break; // not a uniqueness conflict — stop retrying
    }
    if (!data) { toast.error(t("landingBuilderPage.errorCreatePage", { message: lastError?.message })); console.error("Create page error:", lastError); return; }
    const newPage = data as LandingPage;
    setPages(prev => [...prev, newPage]);
    selectPage(newPage);
    setNewPageOpen(false);
    setNewPageName("");
    setBuilderView("editor");
    toast.success(t("landingBuilderPage.pageCreated"));
  };

  // ── Set page role (Principal / Gracias / Upsell) ────────────────────────────
  const handleSetPageRole = async (pageId: string, role: string) => {
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, page_role: role } : p));
    const { error } = await supabase.from("landing_pages").update({ page_role: role }).eq("id", pageId);
    if (error) { toast.error(t("landingBuilderPage.errorUpdateRole")); return; }
    const label = roleLabel(role);
    toast.success(t("landingBuilderPage.pageMarkedAs", { label }));
  };

  // ── Delete page ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("landing_pages").delete().eq("id", id);
    if (error) { toast.error(t("landingBuilderPage.errorDelete")); return; }
    setPages(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setGeneratedHtml("");
      setPreviewHtml("");
    }
    toast.success(t("landingBuilderPage.pageDeleted"));
  };

  // ── Inject configured form into current HTML ────────────────────────────────
  const handleInjectForm = useCallback(() => {
    if (!generatedHtml || !(formConfig.fields ?? []).length) return;
    const formHtml = generateFormHtml(formConfig, selectedId || "PENDING");
    const injected = injectFormIntoHtml(generatedHtml, formHtml);
    setGeneratedHtml(injected);
    setPreviewHtml(injected);
    setHtmlVersion(v => v + 1); // force iframe remount so injected form is visible immediately
    toast.success(t("landingBuilderPage.formInjected"));
  }, [generatedHtml, formConfig, selectedId]);

  // ── Image upload ────────────────────────────────────────────────────────────
  const handleImageAttach = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error(t("landingBuilderPage.onlyImagesAllowed")); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t("landingBuilderPage.imageTooLarge")); return; }
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
      toast.error(t("landingBuilderPage.errorUploadImage", { message: e.message || t("landingBuilderPage.tryAgain") }));
    } finally {
      setUploadingImage(false);
    }
  };

  // ── PDF attachment ──────────────────────────────────────────────────────────
  const handlePdfAttach = (file: File) => {
    if (file.type !== "application/pdf") { toast.error(t("landingBuilderPage.onlyPdfAllowed")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("landingBuilderPage.pdfTooLarge")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      // Strip "data:application/pdf;base64," prefix
      const base64 = (reader.result as string).split(",")[1];
      setAttachedPdf({ name: file.name, base64, sizeKb: Math.round(file.size / 1024) });
      toast.success(t("landingBuilderPage.pdfAttached", { name: file.name }));
    };
    reader.readAsDataURL(file);
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
    const detectedRole = detectPageRole(originalPrompt + " " + capitalized);
    const baseSlugChat = toSlug(capitalized);
    let chatPageData: LandingPage | null = null;
    let chatPageErr: any = null;
    for (let attempt = 0; attempt <= 9; attempt++) {
      const slug = attempt === 0 ? baseSlugChat : `${baseSlugChat}-${attempt + 1}`;
      const res = await supabase
        .from("landing_pages")
        .insert({
          name: capitalized,
          slug,
          mode: "ai",
          funnel_id: selectedFunnelId,
          page_order: funnelPages.length,
          page_role: detectedRole,
          ...(organizationId ? { organization_id: organizationId } : {}),
        })
        .select()
        .single();
      if (!res.error) { chatPageData = res.data as LandingPage; break; }
      chatPageErr = res.error;
      if (res.error.code !== "23505") break;
    }
    if (!chatPageData) { toast.error(t("landingBuilderPage.errorCreatePage", { message: chatPageErr?.message })); console.error("Create page from chat error:", chatPageErr); return; }

    const newPage = chatPageData as LandingPage;
    setPages(prev => [...prev, newPage]);

    // 2. Build initial chat history for the new page (inherits funnel context)
    const funnelName = funnels.find(f => f.id === selectedFunnelId)?.name || "funnel";
    const initHistory: ChatMessage[] = [{
      id: Math.random().toString(36).slice(2),
      role: "assistant",
      content: t("landingBuilderPage.pageCreatedInFunnel", { funnelName }),
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

    // Bug #11 fix: use streaming fetch so the edge function picks claude-sonnet-4-5
    // (model = Sonnet when useStream=true && !current_html).
    // The old supabase.functions.invoke path always used Haiku (JSON/non-stream).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? "";
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const railwayUrl = (import.meta.env.VITE_RAILWAY_LANDING_URL as string | undefined)?.replace(/\/$/, "");
      const genEndpoint = railwayUrl ? `${railwayUrl}/generate-landing` : `${supabaseUrl}/functions/v1/generate-landing`;

      const fetchResp = await fetch(genEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          stream: true,
          prompt: originalPrompt,
          page_id: newPage.id,
          funnel_reference_html: generatedHtml.slice(0, 3000),
          chat_history: [],
        }),
      });

      if (!fetchResp.ok) throw new Error(`Error HTTP ${fetchResp.status}`);
      const ct = fetchResp.headers.get("content-type") ?? "";
      if (!ct.includes("text/event-stream")) {
        const errBody = await fetchResp.json().catch(() => ({}));
        throw new Error(errBody.error ?? t("landingBuilderPage.serverError"));
      }

      const reader = fetchResp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "", html = "", summary = t("landingBuilderPage.pageCreatedWithFunnelStyle"), tokensUsed = 0, accumulated = "";

      const dispatch = (seg: string): boolean => {
        const dl = seg.split("\n").find(l => l.startsWith("data: "));
        if (!dl) return false;
        let evt: any;
        try { evt = JSON.parse(dl.slice(6)); } catch { return false; }
        if (evt.type === "delta") { accumulated += evt.text ?? ""; setStreamedTokens(t => t + Math.ceil((evt.text ?? "").length / 4)); }
        else if (evt.type === "done") { html = evt.html ?? ""; summary = evt.summary ?? summary; tokensUsed = evt.tokensUsed ?? 0; if (evt.tokensRemaining != null) setTokensRemaining(evt.tokensRemaining); return true; }
        else if (evt.type === "error") { throw new Error(evt.error ?? t("landingBuilderPage.errorGenerating")); }
        return false;
      };

      outer2: while (true) {
        const { done, value } = await reader.read();
        if (done) { if (buf.trim()) for (const s of buf.split("\n\n")) if (dispatch(s)) break; break; }
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n"); buf = events.pop() ?? "";
        for (const s of events) if (dispatch(s)) break outer2;
      }

      // Delta fallback (same as handleGenerate)
      if (!html && accumulated) {
        let r = accumulated.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        const di = r.indexOf("<!DOCTYPE"); if (di !== -1) r = r.slice(di);
        if (r && !r.trimEnd().toLowerCase().endsWith("</html>")) { if (!r.toLowerCase().includes("</body>")) r += "\n</body>"; r += "\n</html>"; }
        if (r.startsWith("<!DOCTYPE")) html = r;
      }
      if (!html) throw new Error(t("landingBuilderPage.aiNoHtml"));

      setGeneratedHtml(html);
      setPreviewHtml(html);
      setHtmlVersion(v => v + 1);

      // Proactive suggestions after fresh generation (Lovable-style)
      const suggestionId = Math.random().toString(36).slice(2);
      const suggestions = [];
      if (!html.includes('id="testimonials"') && !html.includes("★★★★★")) suggestions.push("💬 " + t("landingBuilderPage.suggestTestimonials"));
      if (!html.includes('id="faq"') && !html.includes("<details")) suggestions.push("❓ " + t("landingBuilderPage.suggestFaq"));
      if (!html.includes('id="pricing"') && !html.toLowerCase().includes("precio")) suggestions.push("💲 " + t("landingBuilderPage.suggestPricing"));
      if (!html.includes('id="video"')) suggestions.push("▶️ " + t("landingBuilderPage.suggestVideo"));
      if (html.includes("placehold.co")) suggestions.push("🖼️ " + t("landingBuilderPage.suggestImages"));

      const suggestionMsg = suggestions.length > 0
        ? `\n\n💡 **${t("landingBuilderPage.suggestionsHeading")}**\n${suggestions.slice(0, 3).map(s => `• ${s}`).join('\n')}`
        : "";

      const updatedHistory: ChatMessage[] = [
        ...initHistory,
        { id: assistantMsgId, role: "assistant", content: summary + (tokensUsed ? ` · ${tokensUsed.toLocaleString()} tokens` : "") + suggestionMsg, summary, status: "done" },
      ];
      setChatMessages(updatedHistory);

      supabase.from("landing_pages")
        .update({ html, chat_history: updatedHistory })
        .eq("id", newPage.id)
        .then(() => {});

      await fetchPages();
      toast.success(t("landingBuilderPage.pageCreatedInFunnelToast", { name: capitalized }));
    } catch (e: any) {
      setChatMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: e.message || t("landingBuilderPage.error"), status: "error" } : m
      ));
    } finally {
      setGenerating(false);
      if (generationTimerRef.current) { clearInterval(generationTimerRef.current); generationTimerRef.current = null; }
      setGenerationElapsed(0);
      setStreamedTokens(0);
    }
  };

  // ── AI Generation (chat-driven) ─────────────────────────────────────────────
  const handleGenerate = async () => {
    const currentInput = chatInput.trim();
    if (!currentInput) { toast.error(t("landingBuilderPage.describeLandingError")); return; }

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

    // ── Intent-based reinforcement ──────────────────────────────────────────
    // Detect what kind of modification the user is requesting and inject an
    // explicit constraint so the model never bleeds one operation into another.
    // Only activates when there's existing HTML to refine (not on fresh generation).
    const _i = currentInput.toLowerCase();
    let intentReinforcement = "";

    if (generatedHtml) {
      // Priority order: most specific first to avoid false matches

      // 1. Full redesign — explicitly requested, no constraints needed
      const isRedesign = [
        "rediseña","rediseñar","desde cero","hazlo de nuevo","rehaz",
        "cámbialo todo","cambia todo","nuevo diseño","diseño nuevo",
      ].some(kw => _i.includes(kw));

      // 2. Remove element
      const isRemove = !isRedesign && [
        "elimina","quita ","quítame","borra ","remueve","saca el","saca la",
        "sin la sección","sin el ","sin la ","no quiero el","no quiero la",
      ].some(kw => _i.includes(kw));

      // 3. Add section
      const isAdd = !isRedesign && !isRemove && [
        "agrega","añade","incluye una","agregar","añadir","nueva sección",
        "agrega sección","añade sección","pon una sección","pon un",
        "agrégale","añádele","falta una","necesito una sección",
      ].some(kw => _i.includes(kw));

      // 4. Text/copy change
      const isTextChange = !isRedesign && !isRemove && !isAdd && [
        "cambia el texto","cambia el título","cambia el subtítulo","cambia el headline",
        "cambia el copy","cambia la descripción","cambia el cta","cambia el botón",
        "modifica el texto","modifica el título","modifica el copy","modifica el cta",
        "edita el texto","reemplaza el texto","actualiza el texto","actualiza el título",
        "cambia el párrafo","pon el texto","pon el título","escribe en vez de",
      ].some(kw => _i.includes(kw));

      // 5. Conversion improvement
      const isCRO = !isRedesign && !isRemove && !isAdd && !isTextChange && [
        "mejora la conversión","optimiza la","más conversiones","mejora el cta",
        "mejora el copy","más impacto","más ventas","más leads","convierte más",
        "mejorar conversión","más persuasivo","más convincente","mejorar el impacto",
        "hazlo más persuasivo","hazlo más convincente",
      ].some(kw => _i.includes(kw));

      // 6. Style/aesthetic change
      const isStyle = !isRedesign && !isRemove && !isAdd && !isTextChange && !isCRO && [
        "luxury","premium","elegante","elegancia","minimalista","minimal",
        "oscuro","dark mode","modo oscuro","claro","light mode","modo claro",
        "moderno","moderna","vibrante","sofisticado","sofisticada","bold",
        "suave","corporativo","fresco","limpio","lujoso","lujosa","refinado",
        "refinada","más oscuro","más claro","más elegante","más moderno",
        "más premium","más luxury","estilo oscuro","estilo claro",
        "paleta de color","cambia los colores","tipografía","fuente diferente",
        "otra fuente","cambiar fuente","colores más",
      ].some(kw => _i.includes(kw));

      if (isStyle) {
        intentReinforcement = `\n\n⚠️ STYLE CHANGE ONLY: Restyle the visual design only. Preserve every single text string, every section, and the complete HTML structure. Only change: colors (CSS vars + Tailwind config), fonts, spacing, shadows, gradients, decorative elements. Do NOT rewrite, remove, or replace any text content.`;
      } else if (isTextChange) {
        intentReinforcement = `\n\n⚠️ TEXT CHANGE ONLY: Modify only the specific text element(s) mentioned. Preserve 100% of everything else: all other text, all sections, all visual styling, all HTML structure, and the form. Do not touch what was not mentioned.`;
      } else if (isAdd) {
        intentReinforcement = `\n\n⚠️ ADD ONLY: Insert only the new element/section requested. Do NOT modify, reorder, or rewrite any existing sections, text, or styles. Use the existing design system (colors, fonts, component style) for the new element.`;
      } else if (isRemove) {
        intentReinforcement = `\n\n⚠️ REMOVE ONLY: Remove only the specific element(s) mentioned. Do NOT touch any other content, text, section, or style. Close any visual gaps cleanly without restructuring the rest of the page.`;
      } else if (isCRO) {
        intentReinforcement = `\n\n⚠️ CRO IMPROVEMENT: Apply conversion optimizations (benefit-oriented headlines, strong-verb CTAs, specific social proof, objection-busting). Preserve the overall section structure, section order, and visual design system. This is NOT a full redesign.`;
      } else if (!isRedesign) {
        // ── Catch-all: vague/unclassified request ────────────────────────────
        // The user wrote something short or ambiguous. Default to maximum
        // content preservation — apply the minimum change that satisfies the
        // request. The model's interpretation guide in REFINE_SYSTEM covers
        // common patterns ("dale más vida", "mejóralo", "se ve soso", etc.)
        intentReinforcement = `\n\n⚠️ CONSERVATIVE REFINEMENT: The request is short or vague — interpret it as narrowly as possible. Assume the user approves of all existing content and structure. Apply only the smallest change that satisfies the request. Preserve all text, all sections, and the overall design system. When in doubt, treat it as a STYLE change (visual polish only).`;
      }
      // isRedesign: no reinforcement — model has full freedom
    }

    const imageUrlsSnapshot = attachedImages.map(img => img.url);

    // Append user bubble + loading assistant bubble
    setChatMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: currentInput, attachments: imageUrlsSnapshot, status: "done" },
      { id: assistantMsgId, role: "assistant", content: "", status: "loading" },
    ]);
    setChatInput("");
    setAttachedImages([]); // clear after sending
    setAttachedPdf(null);  // clear PDF after sending
    setGenerating(true);
    setGenerationElapsed(0);
    setStreamedTokens(0);
    generationTimerRef.current = setInterval(() => setGenerationElapsed(s => s + 1), 1000);

    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    // Build history outside try so it's accessible in the catch (for retry)
    const historyForApi = chatMessages
      .filter(m => m.status === "done")
      .map(m => ({ role: m.role, content: m.content, status: m.status, summary: m.summary }));
    // Capture full prompt outside try so retry can reuse it
    const fullPrompt = currentInput + formContext + imageContext + intentReinforcement;

    try {
      // ── Streaming fetch (replaces supabase.functions.invoke) ────────────────
      // Manual fetch so we can read the SSE stream as it arrives.
      // Uses Railway URL when VITE_RAILWAY_LANDING_URL is set (no 150s timeout,
      // Sonnet with 16k tokens = Lovable-level quality).
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? "";
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const railwayUrl = (import.meta.env.VITE_RAILWAY_LANDING_URL as string | undefined)?.replace(/\/$/, "");
      const genEndpoint = railwayUrl ? `${railwayUrl}/generate-landing` : `${supabaseUrl}/functions/v1/generate-landing`;

      const fetchResp = await fetch(genEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          stream: true,
          prompt: fullPrompt,
          page_id: selectedId || "PENDING",
          current_html: generatedHtml || undefined,
          chat_history: historyForApi,
          attached_pdf: attachedPdf
            ? { data: attachedPdf.base64, name: attachedPdf.name }
            : undefined,
        }),
      });

      if (!fetchResp.ok) throw new Error(`Error HTTP ${fetchResp.status}`);

      // ── Guard: edge function errors always return HTTP 200 with JSON ─────────
      // If the Content-Type is NOT text/event-stream it means the function
      // returned a JSON error (e.g. auth failure, parse error) before it could
      // open the SSE stream. Read it and surface the real message.
      const contentType = fetchResp.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        let errMsg = t("landingBuilderPage.serverErrorTryAgain");
        try {
          const errBody = await fetchResp.json();
          if (errBody.code === "no_landing_credits") {
            errMsg = t("landingBuilderPage.noCredits");
          } else if (errBody.error) {
            errMsg = errBody.error;
          }
        } catch { /* ignore parse failure */ }
        throw new Error(errMsg);
      }

      // ── Read SSE stream ─────────────────────────────────────────────────────
      const reader = fetchResp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let html = "";
      let summary = t("landingBuilderPage.applied");
      let tokensUsedThisCall = 0;
      // Accumulate raw delta text as a fallback in case the "done" event is
      // never received (e.g. edge function timeout before sending it).
      let accumulatedText = "";

      // Parse and dispatch one SSE event string.
      // Returns true when the "done" event is found (caller should break).
      const dispatchSseEvent = (eventStr: string): boolean => {
        const dataLine = eventStr.split("\n").find(l => l.startsWith("data: "));
        if (!dataLine) return false;
        let evt: { type: string; text?: string; html?: string; summary?: string; tokensUsed?: number; tokensRemaining?: number; error?: string; code?: string };
        try { evt = JSON.parse(dataLine.slice(6)); } catch { return false; }

        if (evt.type === "delta") {
          accumulatedText += evt.text ?? "";
          setStreamedTokens(t => t + Math.ceil((evt.text ?? "").length / 4));
        } else if (evt.type === "done") {
          html = evt.html ?? "";
          summary = evt.summary ?? t("landingBuilderPage.applied");
          tokensUsedThisCall = evt.tokensUsed ?? 0;
          if (evt.tokensRemaining != null) setTokensRemaining(evt.tokensRemaining);
          // Store the section ID for visual highlight after iframe loads
          if (evt.sectionId) (dispatchSseEvent as any)._sectionId = evt.sectionId;
          return true;
        } else if (evt.type === "error") {
          if (evt.code === "no_landing_credits") {
            throw new Error(t("landingBuilderPage.noCredits"));
          }
          if (evt.code === "trial_expired") {
            throw new Error(t("landingBuilderPage.trialExpired"));
          }
          throw new Error(evt.error ?? t("landingBuilderPage.errorGeneratingLanding"));
        }
        return false;
      };

      outer: while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // ── Process any buffer remaining when the stream closes ───────────
          // The "done" SSE event can be stranded here if the last TCP packet
          // arrived without a trailing double-newline before the connection
          // closed (common with Supabase edge function + large PDF payloads).
          if (buf.trim()) {
            const leftover = buf.split("\n\n");
            for (const seg of leftover) {
              if (dispatchSseEvent(seg)) break;
            }
          }
          break;
        }

        buf += decoder.decode(value, { stream: true });

        // SSE events are delimited by double newlines
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";

        for (const eventStr of events) {
          if (dispatchSseEvent(eventStr)) break outer;
        }
      }

      // ── Fallback: reconstruct HTML from raw delta chunks ──────────────────
      // If the edge function timed out before it could postProcess and send the
      // "done" event (common with large PDF inputs), we attempt to recover the
      // HTML that Claude was streaming incrementally.
      if (!html && accumulatedText) {
        let recovered = accumulatedText
          .replace(/^```html\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        // REFINE_SYSTEM format: strip CAMBIOS prefix before ---HTML---
        const delimIdx = recovered.indexOf("---HTML---");
        if (delimIdx !== -1) recovered = recovered.slice(delimIdx + 10).trim();
        // Find DOCTYPE start (skip any leading text)
        const doctypeIdx = recovered.indexOf("<!DOCTYPE");
        if (doctypeIdx !== -1) recovered = recovered.slice(doctypeIdx);
        // Graceful truncation guard — close any open tags
        if (recovered && !recovered.trimEnd().toLowerCase().endsWith("</html>")) {
          if (!recovered.toLowerCase().includes("</body>")) recovered += "\n</body>";
          recovered += "\n</html>";
        }
        if (recovered.startsWith("<!DOCTYPE")) {
          html = recovered;
          summary = t("landingBuilderPage.recoveredInterrupted");
          toast.warning(t("landingBuilderPage.generationInterruptedRecovered"));
        }
      }

      // Last-resort fallback: Railway saves to Supabase before sending "done".
      // If the SSE stream dropped (no html, no accumulated text), fetch from DB.
      if (!html && selectedId) {
        const { data: savedPage } = await supabase
          .from("landing_pages")
          .select("html")
          .eq("id", selectedId)
          .maybeSingle();
        if (savedPage?.html && savedPage.html !== generatedHtml) {
          html = savedPage.html;
          summary = t("landingBuilderPage.recoveredFromServer");
          toast.info(t("landingBuilderPage.pageRecoveredFromServer"));
        }
      }

      if (!html) throw new Error(t("landingBuilderPage.aiNoHtmlTryAgain"));

      // Debug: log HTML change
      const htmlChanged = html !== generatedHtml;
      console.log(`[LandingBuilder] stream done — ${html.length} chars, changed: ${htmlChanged}`);
      if (!htmlChanged) {
        toast.warning(t("landingBuilderPage.aiNoChange"));
      }

      // Save current HTML to undo history before overwriting
      if (generatedHtml) pushHtmlHistory(generatedHtml);

      // Store section ID for visual highlight after iframe remounts
      const changedSectionId = (dispatchSseEvent as any)._sectionId ?? null;
      if (changedSectionId) highlightSectionRef.current = changedSectionId;
      delete (dispatchSseEvent as any)._sectionId;

      // Update HTML and force iframe remount
      setGeneratedHtml(html);
      setPreviewHtml(html);
      setHtmlVersion(v => v + 1);

      // Auto-save HTML to DB immediately
      if (selectedId) {
        supabase.from("landing_pages")
          .update({ html })
          .eq("id", selectedId)
          .then(() => {});
        // Reload version history
        supabase.from("landing_page_versions")
          .select("id, summary, created_at, version_number")
          .eq("page_id", selectedId)
          .order("created_at", { ascending: false })
          .limit(10)
          .then(({ data }) => { if (data) setDbVersions(data); });
      }

      // Update chat history — DB write is outside setChatMessages to avoid
      // firing twice under React 18 concurrent mode (updater fns can re-run).
      const updatedMessages: ChatMessage[] = [
        ...chatMessages.filter(m => m.status !== "loading"),
        {
          id: assistantMsgId,
          role: "assistant" as const,
          content: summary + (tokensUsedThisCall ? ` · ${tokensUsedThisCall.toLocaleString()} tokens` : ""),
          summary,
          status: "done" as const,
        },
      ];
      setChatMessages(updatedMessages);
      if (selectedId) {
        supabase.from("landing_pages")
          .update({ chat_history: updatedMessages })
          .eq("id", selectedId)
          .then(({ error }) => { if (error) console.error("[LandingBuilder] chat history save failed:", error); });
      }

    } catch (e: any) {
      const isConnectionError = (e.message ?? "").toLowerCase().includes("conexión") ||
        (e.message ?? "").toLowerCase().includes("connection") ||
        (e.message ?? "").toLowerCase().includes("fetch") ||
        (e.message ?? "").toLowerCase().includes("network");

      if (isConnectionError) {
        // Auto-retry once for transient connection errors
        try {
          setChatMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: "", status: "loading" } : m
          ));
          setStreamedTokens(0);

          const { data: { session: session2 } } = await supabase.auth.getSession();
          const accessToken2 = session2?.access_token ?? "";
          const supabaseUrl2 = import.meta.env.VITE_SUPABASE_URL as string;
          const anonKey2 = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
          const railwayUrl2 = (import.meta.env.VITE_RAILWAY_LANDING_URL as string | undefined)?.replace(/\/$/, "");
          const genEndpoint2 = railwayUrl2 ? `${railwayUrl2}/generate-landing` : `${supabaseUrl2}/functions/v1/generate-landing`;
          const retryResp = await fetch(genEndpoint2, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken2}`, "apikey": anonKey2 },
            body: JSON.stringify({
              stream: true,
              prompt: fullPrompt,
              page_id: selectedId || "PENDING",
              current_html: generatedHtml || undefined,
              chat_history: historyForApi,
            }),
          });

          if (!retryResp.ok) throw new Error(`Error HTTP ${retryResp.status}`);

          const retryReader = retryResp.body!.getReader();
          const retryDecoder = new TextDecoder();
          let retryBuf = "";
          let retryHtml = "";
          let retrySummary = t("landingBuilderPage.applied");
          let retryAccumulated = "";

          outerRetry: while (true) {
            const { done, value } = await retryReader.read();
            if (done) break;
            retryBuf += retryDecoder.decode(value, { stream: true });
            const events = retryBuf.split("\n\n");
            retryBuf = events.pop() ?? "";
            for (const seg of events) {
              const dataLine = seg.split("\n").find(l => l.startsWith("data: "));
              if (!dataLine) continue;
              let evt: any;
              try { evt = JSON.parse(dataLine.slice(6)); } catch { continue; } // skip malformed SSE lines
              if (evt.type === "delta") { retryAccumulated += evt.text ?? ""; setStreamedTokens(t => t + Math.ceil((evt.text ?? "").length / 4)); }
              else if (evt.type === "done") { retryHtml = evt.html ?? ""; retrySummary = evt.summary ?? t("landingBuilderPage.applied"); break outerRetry; }
              else if (evt.type === "error") throw new Error(evt.error ?? t("landingBuilderPage.errorRetry"));
            }
          }

          if (!retryHtml && retryAccumulated) {
            let rec = retryAccumulated.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
            const di = rec.indexOf("---HTML---"); if (di !== -1) rec = rec.slice(di + 10).trim();
            const dti = rec.indexOf("<!DOCTYPE"); if (dti !== -1) rec = rec.slice(dti);
            if (rec && !rec.trimEnd().toLowerCase().endsWith("</html>")) { if (!rec.toLowerCase().includes("</body>")) rec += "\n</body>"; rec += "\n</html>"; }
            if (rec.startsWith("<!DOCTYPE")) retryHtml = rec;
          }

          if (!retryHtml) throw new Error(t("landingBuilderPage.aiNoHtml"));

          setGeneratedHtml(retryHtml);
          setPreviewHtml(retryHtml);
          setHtmlVersion(v => v + 1);
          if (selectedId) supabase.from("landing_pages").update({ html: retryHtml }).eq("id", selectedId).then(() => {});

          const retriedMessages = [
            ...historyForApi,
            { id: userMsgId, role: "user" as const, content: currentInput, status: "done" as const },
            { id: assistantMsgId, role: "assistant" as const, content: retrySummary, summary: retrySummary, status: "done" as const },
          ];
          setChatMessages(retriedMessages);
          if (selectedId) supabase.from("landing_pages").update({ chat_history: retriedMessages }).eq("id", selectedId).then(() => {});

        } catch (retryErr: any) {
          setChatMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: retryErr.message || t("landingBuilderPage.connectionError"), status: "error" } : m
          ));
        }
      } else {
        setChatMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: e.message || t("landingBuilderPage.errorGeneratingLanding"), status: "error" } : m
        ));
      }
    } finally {
      setGenerating(false);
      if (generationTimerRef.current) {
        clearInterval(generationTimerRef.current);
        generationTimerRef.current = null;
      }
      setGenerationElapsed(0);
      setStreamedTokens(0);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };


  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (publishOverride?: boolean) => {
    if (!selectedId) { toast.error(t("landingBuilderPage.selectOrCreatePage")); return; }
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
      toast.success(targetStatus === "published" ? t("landingBuilderPage.landingPublished") : t("landingBuilderPage.saved"));
    } catch (e: any) {
      toast.error(e.message || t("landingBuilderPage.errorSaving"));
    } finally {
      setSaving(false);
    }
  }, [selectedId, mode, name, slug, status, generatedHtml, prompt, formConfig, chatMessages, fetchPages]);

  // ── Copy URL ────────────────────────────────────────────────────────────────
  const copyUrl = () => {
    const effectiveSlug = slug || toSlug(name);
    if (!effectiveSlug) { toast.error(t("landingBuilderPage.slugRequired")); return; }
    navigator.clipboard.writeText(getPublicUrl(effectiveSlug));
    toast.success(t("landingBuilderPage.urlCopied", { url: "pages.klosify.com/" + effectiveSlug }));
  };

  const openPublicUrl = () => {
    const effectiveSlug = slug || toSlug(name);
    if (status !== "published") { toast.error(t("landingBuilderPage.publishFirst")); return; }
    window.open(getPublicUrl(effectiveSlug), "_blank");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex h-full flex-col">

        {/* ── Full-width Toolbar (editor only) ── */}
        {builderView === "editor" && <div className="border-b border-border px-3 py-2 flex items-center gap-2 shrink-0">

          {/* ── Breadcrumb: Proyectos › Funnel › Página ── */}
          <div className="flex items-center gap-1 text-sm min-w-0 shrink-0">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors text-xs font-medium px-1.5 py-0.5 rounded hover:bg-accent"
              onClick={() => setBuilderView("projects")}
            >
              {t("landingBuilderPage.projects")}
            </button>
            <ChevronDown className="h-3 w-3 text-muted-foreground/40 rotate-[-90deg] shrink-0" />
            <button
              className="text-muted-foreground hover:text-foreground transition-colors text-xs font-medium px-1.5 py-0.5 rounded hover:bg-accent max-w-[120px] truncate"
              onClick={() => setBuilderView("pages")}
            >
              {funnels.find(f => f.id === selectedFunnelId)?.name ?? t("landingBuilderPage.project")}
            </button>
            <ChevronDown className="h-3 w-3 text-muted-foreground/40 rotate-[-90deg] shrink-0" />
            <span className="text-xs font-medium text-foreground max-w-[140px] truncate">{name}</span>
          </div>

          {/* Dummy popover kept for compatibility — hidden visually */}
          <Popover open={pagePickerOpen} onOpenChange={(open) => {
            setPagePickerOpen(open);
            if (open && selectedFunnelId) setPickerLevel("pages");
          }}>
            {/* Hidden trigger — Popover kept for page role switcher inside editor */}
            <PopoverTrigger asChild>
              <button className="hidden" aria-hidden />
            </PopoverTrigger>

            <PopoverContent className="w-80 p-0" align="start">

              {/* ── LEVEL 1: Funnels ── */}
              {pickerLevel === "funnels" && (
                <>
                  <div className="p-2 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground px-1">{t("landingBuilderPage.myFunnels")}</p>
                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                      onClick={() => { setNewFunnelOpen(true); setPagePickerOpen(false); }}>
                      <Plus className="h-3 w-3" /> {t("landingBuilderPage.new")}
                    </Button>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {funnels.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">{t("landingBuilderPage.noFunnelsYet")}</p>
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
                            onClick={e => { e.stopPropagation(); setDeleteFunnelTarget(funnel.id); }}>
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
                    <span className="text-muted-foreground/40 text-xs ml-auto">{t("landingBuilderPage.pages")}</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {funnelPages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">{t("landingBuilderPage.noPagesInFunnel")}</p>
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
                        <div className="flex-1 min-w-0">
                          {renaming?.id === page.id && renaming.type === "page" ? (
                            <input
                              autoFocus
                              className="w-full text-xs bg-background border border-primary rounded px-1 py-0.5 outline-none"
                              value={renaming.value}
                              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
                              onBlur={commitRename}
                              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span className="text-left truncate block">{page.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Role badge — click to cycle through roles */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors",
                                    ROLE_META[page.page_role]?.cls ?? ROLE_META.other.cls
                                  )}
                                  onClick={e => { e.stopPropagation(); handleSetPageRole(page.id, cycleRoleOf(page.page_role)); }}
                                >
                                  {roleLabel(page.page_role)}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {t("landingBuilderPage.clickToChangeRole", { role: roleLabel(page.page_role) })}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="text-[10px] text-muted-foreground hidden group-hover:hidden">{page.views}v</span>
                          {selectedId === page.id && <Check className="h-3 w-3 text-primary" />}
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground p-0.5 rounded hover:text-foreground"
                            onClick={e => startRename(e, page.id, "page", page.name)}>
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-0.5 rounded"
                            onClick={e => { e.stopPropagation(); setDeletePageTarget(page.id); setPagePickerOpen(false); }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="w-full h-8 text-xs gap-1.5 justify-start"
                      onClick={() => { setNewPageOpen(true); setPagePickerOpen(false); }}>
                      <Plus className="h-3.5 w-3.5" /> {t("landingBuilderPage.newPageInFunnel")}
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
                    title={t("landingBuilderPage.editSlug")}
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
                    <TooltipContent>{t("landingBuilderPage.copyPublicUrl")}</TooltipContent>
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
                      <TooltipContent>{t("landingBuilderPage.viewPublishedPage")}</TooltipContent>
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
                {(formConfig.fields ?? []).length > 0 && (() => {
                  // Integrated = at least one field mapped to a real CRM field, OR pipeline set
                  const isIntegrated =
                    (formConfig.fields ?? []).some(f => f.crm_field && f.crm_field !== "_ignore") ||
                    !!formConfig.pipeline_id;
                  return isIntegrated ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 border-green-500/50 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                      onClick={() => setFormConfigOpen(true)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("landingBuilderPage.integrated")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1.5 relative border-orange-400/60 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 animate-pulse"
                      onClick={() => setFormConfigOpen(true)}
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      {t("landingBuilderPage.integrateForm")}
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">
                        {(formConfig.fields ?? []).length}
                      </span>
                    </Button>
                  );
                })()}

                {/* Status toggle */}
                <Button
                  size="sm"
                  variant={status === "published" ? "destructive" : "outline"}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => handleSave(status !== "published")}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "published" ? <EyeOff className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {status === "published" ? t("landingBuilderPage.unpublish") : t("landingBuilderPage.publish")}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="h-8 text-xs"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("landingBuilderPage.save")}
                </Button>
              </>
            ) : null}
        </div>}  {/* end editor toolbar */}

        {/* ── PROJECTS VIEW ── */}
        {builderView === "projects" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">{t("landingBuilderPage.myProjects")}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("landingBuilderPage.projectsSubtitle")}</p>
                </div>
                <Button onClick={() => setNewFunnelOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> {t("landingBuilderPage.newProject")}
                </Button>
              </div>

              {loadingPages ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : funnels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                  <FolderOpen className="h-14 w-14 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">{t("landingBuilderPage.noProjectsYet")}<br/>{t("landingBuilderPage.createOneToStart")}</p>
                  <Button onClick={() => setNewFunnelOpen(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" /> {t("landingBuilderPage.createFirstProject")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {funnels.map(funnel => {
                    const fp = pages.filter(p => p.funnel_id === funnel.id);
                    const published = fp.filter(p => p.status === "published").length;
                    const totalViews = fp.reduce((s, p) => s + (p.views || 0), 0);
                    const totalLeads = fp.reduce((s, p) => s + (p.leads_count || 0), 0);
                    return (
                      <div
                        key={funnel.id}
                        className="group border border-border rounded-xl p-5 hover:border-primary/60 hover:shadow-md transition-all cursor-pointer bg-card"
                        onClick={() => { setSelectedFunnelId(funnel.id); setBuilderView("pages"); }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <FolderOpen className="h-4.5 w-4.5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                            {renaming?.id === funnel.id && renaming.type === "funnel" ? (
                              <input
                                autoFocus
                                className="w-full text-sm font-semibold bg-background border border-primary rounded px-1.5 py-0.5 outline-none"
                                value={renaming.value}
                                onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
                                onBlur={commitRename}
                                onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <p className="font-semibold text-sm truncate">{funnel.name}</p>
                            )}
                            <p className="text-[11px] text-muted-foreground">{fp.length} {fp.length === 1 ? t("landingBuilderPage.page") : t("landingBuilderPage.pages")}</p>
                          </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="text-muted-foreground p-1 rounded hover:bg-accent"
                              onClick={e => startRename(e, funnel.id, "funnel", funnel.name)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="text-destructive p-1 rounded hover:bg-destructive/10"
                              onClick={e => { e.stopPropagation(); setDeleteFunnelTarget(funnel.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Page role pills */}
                        <div className="flex flex-wrap gap-1 mb-4 min-h-[22px]">
                          {fp.map(p => (
                            <span key={p.id} className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              ROLE_META[p.page_role]?.cls ?? ROLE_META.other.cls
                            )}>
                              {p.name.slice(0, 20)}
                            </span>
                          ))}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border pt-3">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {totalViews.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart2 className="h-3 w-3" /> {totalLeads} leads
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            {published > 0 ? (
                              <><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> {t("landingBuilderPage.publishedCount", { count: published })}</>
                            ) : (
                              <><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 inline-block" /> {t("landingBuilderPage.draft")}</>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* New project card */}
                  <div
                    className="border border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/60 hover:bg-accent/40 transition-all text-muted-foreground min-h-[160px]"
                    onClick={() => setNewFunnelOpen(true)}
                  >
                    <div className="h-9 w-9 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">{t("landingBuilderPage.newProject")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PAGES VIEW ── */}
        {builderView === "pages" && selectedFunnelId && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setBuilderView("projects")}
                >
                  <ChevronLeft className="h-4 w-4" /> {t("landingBuilderPage.projects")}
                </button>
                <span className="text-muted-foreground/40">/</span>
                <h2 className="text-xl font-bold">
                  {funnels.find(f => f.id === selectedFunnelId)?.name}
                </h2>
                <Button size="sm" onClick={() => setNewPageOpen(true)} className="ml-auto gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {t("landingBuilderPage.newPage")}
                </Button>
              </div>

              {funnelPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                  <FileText className="h-14 w-14 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">{t("landingBuilderPage.projectHasNoPages")}</p>
                  <Button onClick={() => setNewPageOpen(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" /> {t("landingBuilderPage.createFirstPage")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {funnelPages.map((page, idx) => {
                    const roleMeta = ROLE_META[page.page_role] ?? ROLE_META.other;
                    return (
                      <div
                        key={page.id}
                        className="group border border-border rounded-xl overflow-hidden hover:border-primary/60 hover:shadow-md transition-all cursor-pointer bg-card"
                        onClick={() => { selectPage(page); setSelectedFunnelId(page.funnel_id!); }}
                      >
                        {/* Page thumbnail / number */}
                        <div className="h-28 bg-muted/40 flex items-center justify-center relative border-b border-border">
                          <span className="text-4xl font-black text-muted-foreground/20">{idx + 1}</span>
                          <div className="absolute top-2 left-2">
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", roleMeta.cls)}>
                              {roleLabel(page.page_role)}
                            </span>
                          </div>
                          <div className="absolute top-2 right-2 flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 rounded-full", page.status === "published" ? "bg-green-500" : "bg-muted-foreground/30")} />
                            <span className="text-[10px] text-muted-foreground">{page.status === "published" ? t("landingBuilderPage.published") : t("landingBuilderPage.draft")}</span>
                          </div>
                          <button
                            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1 rounded hover:bg-destructive/10 bg-background/80"
                            onClick={e => { e.stopPropagation(); setDeletePageTarget(page.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Page info */}
                        <div className="p-4">
                          {renaming?.id === page.id && renaming.type === "page" ? (
                            <input
                              autoFocus
                              className="w-full text-sm font-semibold bg-background border border-primary rounded px-1.5 py-0.5 outline-none mb-1"
                              value={renaming.value}
                              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
                              onBlur={commitRename}
                              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <div className="flex items-center gap-1 group/name mb-1">
                              <p className="font-semibold text-sm truncate flex-1">{page.name}</p>
                              <button
                                className="opacity-0 group-hover/name:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded shrink-0"
                                onClick={e => startRename(e, page.id, "page", page.name)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground font-mono truncate mb-3">
                            /{page.slug}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {page.views || 0}</span>
                            <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" /> {page.leads_count || 0} {t("landingBuilderPage.leads")}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-auto h-6 text-[10px] px-2"
                              onClick={e => { e.stopPropagation(); selectPage(page); setSelectedFunnelId(page.funnel_id!); }}
                            >
                              {t("landingBuilderPage.edit")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* New page card */}
                  <div
                    className="border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/60 hover:bg-accent/40 transition-all text-muted-foreground min-h-[220px]"
                    onClick={() => setNewPageOpen(true)}
                  >
                    <div className="h-9 w-9 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">{t("landingBuilderPage.newPage")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── EDITOR VIEW ── */}
        {builderView === "editor" && <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
              <Globe className="h-12 w-12 opacity-20" />
              <p className="text-sm">{t("landingBuilderPage.selectOrCreateLanding")}</p>
              <Button onClick={() => setNewPageOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> {t("landingBuilderPage.newLandingPage")}
              </Button>
            </div>
          ) : mode === "ai" ? (
            /* ── AI Mode ── */
            <div className="flex-1 flex min-h-0">

              {/* ── Preview panel (dominant) ── */}
              {/* min-h-0: prevents this flex-1 item from expanding to iframe content height,
                  which would make overflow-y-auto on the child never trigger a scrollbar. */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
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
                        <Eye className="h-3 w-3" /> {t("landingBuilderPage.preview")}
                      </button>
                      <button
                        onClick={() => setEditMode(true)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                          editMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Edit2 className="h-3 w-3" /> {t("landingBuilderPage.editText")}
                      </button>

                      <div className="flex-1" />

                      {/* Device size switcher */}
                      <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                        {(
                          [
                            { id: "desktop", icon: Monitor,    label: t("landingBuilderPage.deviceDesktop"), w: "–"     },
                            { id: "tablet",  icon: Tablet,     label: t("landingBuilderPage.deviceTablet"),  w: "768px" },
                            { id: "mobile",  icon: Smartphone, label: t("landingBuilderPage.deviceMobile"),  w: "390px" },
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

                      {/* HTML version/size indicator */}
                      {generatedHtml && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                          v{htmlVersion} · {(generatedHtml.length / 1024).toFixed(1)}kb
                        </span>
                      )}

                      {/* Undo button — restores previous HTML snapshot */}
                      {htmlHistoryRef.current.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  const prev = htmlHistoryRef.current[0];
                                  if (!prev) return;
                                  htmlHistoryRef.current = htmlHistoryRef.current.slice(1);
                                  setGeneratedHtml(prev);
                                  setPreviewHtml(prev);
                                  setHtmlVersion(v => v + 1);
                                  if (selectedId) {
                                    supabase.from("landing_pages").update({ html: prev }).eq("id", selectedId).then(() => {});
                                  }
                                  toast.success(t("landingBuilderPage.changeUndone"));
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                title={t("landingBuilderPage.undoLastAi")}
                              >
                                ↩ {t("landingBuilderPage.undo")}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("landingBuilderPage.undoLastAiCount", { count: htmlHistoryRef.current.length })}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Version history button */}
                      {dbVersions.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => setShowVersions(v => !v)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            title={t("landingBuilderPage.versionHistory")}
                          >
                            🕐 {dbVersions.length}
                          </button>
                          {showVersions && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-xl shadow-xl z-50 p-2 space-y-1">
                              <p className="text-xs font-semibold text-muted-foreground px-2 py-1">{t("landingBuilderPage.versionHistory")}</p>
                              {dbVersions.map(v => (
                                <button
                                  key={v.id}
                                  onClick={async () => {
                                    const { data } = await supabase
                                      .from("landing_page_versions")
                                      .select("html")
                                      .eq("id", v.id)
                                      .maybeSingle();
                                    if (!data?.html) return;
                                    if (generatedHtml) pushHtmlHistory(generatedHtml);
                                    setGeneratedHtml(data.html);
                                    setPreviewHtml(data.html);
                                    setHtmlVersion(n => n + 1);
                                    if (selectedId) supabase.from("landing_pages").update({ html: data.html }).eq("id", selectedId).then(() => {});
                                    toast.success(t("landingBuilderPage.versionRestored", { version: v.version_number }));
                                    setShowVersions(false);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-xs transition-colors"
                                >
                                  <p className="font-medium">v{v.version_number} — {new Date(v.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                  {v.summary && <p className="text-muted-foreground truncate">{v.summary}</p>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Section lock panel */}
                      {generatedHtml && detectSectionIds(generatedHtml).length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => { setShowLockPanel(v => !v); setShowVersions(false); }}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                              detectSectionIds(generatedHtml).some(id => isSectionLocked(generatedHtml, id))
                                ? "border-amber-400 text-amber-600 bg-amber-50"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                            )}
                            title={t("landingBuilderPage.lockUnlockSections")}
                          >
                            🔒
                            {detectSectionIds(generatedHtml).some(id => isSectionLocked(generatedHtml, id)) && (
                              <span className="font-bold text-amber-600">
                                {detectSectionIds(generatedHtml).filter(id => isSectionLocked(generatedHtml, id)).length}
                              </span>
                            )}
                          </button>

                          {showLockPanel && (
                            <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-xl shadow-xl z-50 p-2">
                              <p className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                                🔒 {t("landingBuilderPage.lockedSectionsTitle")}
                              </p>
                              <div className="space-y-0.5 max-h-80 overflow-y-auto">
                                {detectSectionIds(generatedHtml).map(sectionId => {
                                  const locked = isSectionLocked(generatedHtml, sectionId);
                                  return (
                                    <button
                                      key={sectionId}
                                      onClick={() => {
                                        const newHtml = toggleSectionLock(generatedHtml, sectionId, !locked);
                                        if (generatedHtml) pushHtmlHistory(generatedHtml);
                                        setGeneratedHtml(newHtml);
                                        setPreviewHtml(newHtml);
                                        setHtmlVersion(v => v + 1);
                                        if (selectedId) {
                                          supabase.from("landing_pages").update({ html: newHtml }).eq("id", selectedId).then(() => {});
                                        }
                                      }}
                                      className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                                        locked
                                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "hover:bg-accent text-foreground"
                                      )}
                                    >
                                      <span>{sectionLabel(sectionId)}</span>
                                      <span className={cn(
                                        "font-medium text-[10px] px-2 py-0.5 rounded-full",
                                        locked ? "bg-amber-200 text-amber-800" : "bg-muted text-muted-foreground"
                                      )}>
                                        {locked ? "🔒 " + t("landingBuilderPage.locked") : "🔓 " + t("landingBuilderPage.unlocked")}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[10px] text-muted-foreground px-2 pt-2 border-t border-border mt-1">
                                {t("landingBuilderPage.lockedSectionsHint")}
                              </p>
                            </div>
                          )}
                        </div>
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
                            {chatOpen ? t("landingBuilderPage.closeAiPanel") : t("landingBuilderPage.openAiPanel")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* ── iframe area ─────────────────────────────────────────
                        Edit mode:    iframe expands to full content height so
                                      the user can scroll to any section and click
                                      text to edit it.
                        Preview mode: fixed viewport height (like a real browser
                                      window). min-h-screen renders correctly so
                                      the preview is identical to the published page.
                                      The user scrolls inside the iframe.
                    ────────────────────────────────────────────────────────── */}
                    <div className={cn(
                      editMode ? "flex-1 overflow-y-auto" : "flex-1 overflow-hidden",
                      deviceSize !== "desktop" ? "bg-muted/40 flex justify-center pt-4" : ""
                    )}>
                      <div
                        className={cn(
                          "transition-all duration-300",
                          !editMode && "h-full",
                          deviceSize !== "desktop" && "rounded-t-xl overflow-hidden shadow-xl border border-border"
                        )}
                        style={{
                          width: DEVICE_WIDTHS[deviceSize] ?? "100%",
                          minHeight: editMode && deviceSize === "desktop" ? "100%" : undefined,
                        }}
                      >
                        {editMode ? (
                          /* Edit mode: full-page height expansion via height reporter.
                             Uses buildEditSrcDoc which injects height reporter +
                             min-h-screen override to prevent the height loop. */
                          <iframe
                            ref={editIframeRef}
                            key={`edit-${deviceSize}-${htmlVersion}`}
                            srcDoc={buildEditSrcDoc(previewHtml)}
                            onLoad={setupEditMode}
                            className="w-full border-0"
                            style={{ height: previewContentHeight > 200 ? `${previewContentHeight}px` : "100vh" }}
                            title={t("landingBuilderPage.editLandingTitle")}
                          />
                        ) : (
                          /* Preview mode: fixed viewport height = identical to published page.
                             No min-h-screen override → hero sections render full-screen.
                             iframe scrolls internally (like a real browser window). */
                          <iframe
                            ref={previewIframeRef}
                            key={`preview-${deviceSize}-${htmlVersion}`}
                            srcDoc={buildPreviewSrcDoc(previewHtml)}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                            title={t("landingBuilderPage.previewLandingTitle")}
                            onLoad={() => {
                              // Visual highlight: briefly flash the changed section (Lovable-style)
                              const sid = highlightSectionRef.current;
                              if (!sid) return;
                              highlightSectionRef.current = null;
                              const doc = previewIframeRef.current?.contentDocument;
                              if (!doc) return;
                              const el = doc.getElementById(sid) as HTMLElement | null;
                              if (!el) return;
                              const prev = el.style.cssText;
                              el.style.cssText += ';outline:3px solid #6366f1;outline-offset:4px;border-radius:4px;transition:outline 0.8s ease;';
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              setTimeout(() => { el.style.cssText = prev; }, 2000);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  showTemplates ? (
                    <LandingTemplates
                      className="flex-1"
                      onSelectTemplate={(seedPrompt, templateName) => {
                        // Pre-fill chat input with seed prompt and auto-generate
                        setChatInput(seedPrompt);
                        setShowTemplates(false);
                        setChatOpen(true);
                        // Trigger generation after state settles
                        setTimeout(() => {
                          const userMsgId = Math.random().toString(36).slice(2);
                          const assistantMsgId = Math.random().toString(36).slice(2);
                          setChatMessages(prev => [
                            ...prev,
                            { id: userMsgId, role: "user" as const, content: `📋 ${t("landingBuilderPage.templateLabel", { name: templateName })}`, status: "done" as const },
                            { id: assistantMsgId, role: "assistant" as const, content: "", status: "loading" as const },
                          ]);
                          setChatInput("");
                          setGenerating(true);
                          setGenerationElapsed(0);
                          setStreamedTokens(0);
                          generationTimerRef.current = setInterval(() => setGenerationElapsed(s => s + 1), 1000);

                          // Fire generation
                          (async () => {
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              const accessToken = session?.access_token ?? "";
                              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
                              const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
                              const railwayUrl = (import.meta.env.VITE_RAILWAY_LANDING_URL as string | undefined)?.replace(/\/$/, "");
                              const genEndpoint = railwayUrl ? `${railwayUrl}/generate-landing` : `${supabaseUrl}/functions/v1/generate-landing`;

                              const fetchResp = await fetch(genEndpoint, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "Authorization": `Bearer ${accessToken}`,
                                  "apikey": anonKey,
                                },
                                body: JSON.stringify({
                                  stream: true,
                                  prompt: seedPrompt,
                                  page_id: selectedId || "PENDING",
                                  current_html: undefined,
                                  chat_history: [],
                                }),
                              });

                              if (!fetchResp.ok) throw new Error(`Error HTTP ${fetchResp.status}`);
                              const ct = fetchResp.headers.get("content-type") ?? "";
                              if (!ct.includes("text/event-stream")) {
                                const errBody = await fetchResp.json().catch(() => ({}));
                                throw new Error(errBody.error ?? t("landingBuilderPage.serverError"));
                              }

                              const reader = fetchResp.body!.getReader();
                              const decoder = new TextDecoder();
                              let buf = "", html = "", summary = t("landingBuilderPage.templateGenerated"), tokensUsed = 0, accumulated = "";

                              const dispatch = (seg: string): boolean => {
                                const dl = seg.split("\n").find(l => l.startsWith("data: "));
                                if (!dl) return false;
                                let evt: any;
                                try { evt = JSON.parse(dl.slice(6)); } catch { return false; }
                                if (evt.type === "delta") { accumulated += evt.text ?? ""; setStreamedTokens(t => t + Math.ceil((evt.text ?? "").length / 4)); }
                                else if (evt.type === "done") { html = evt.html ?? ""; summary = evt.summary ?? summary; tokensUsed = evt.tokensUsed ?? 0; if (evt.tokensRemaining != null) setTokensRemaining(evt.tokensRemaining); return true; }
                                else if (evt.type === "error") { if (evt.code === "no_landing_credits") throw new Error(t("landingBuilderPage.noCredits")); if (evt.code === "trial_expired") throw new Error(t("landingBuilderPage.trialExpired")); throw new Error(evt.error ?? t("landingBuilderPage.errorGenerating")); }
                                return false;
                              };

                              outer: while (true) {
                                const { done, value } = await reader.read();
                                if (done) { if (buf.trim()) for (const s of buf.split("\n\n")) if (dispatch(s)) break; break; }
                                buf += decoder.decode(value, { stream: true });
                                const events = buf.split("\n\n"); buf = events.pop() ?? "";
                                for (const s of events) if (dispatch(s)) break outer;
                              }

                              if (!html && accumulated) {
                                let r = accumulated.replace(/^```html\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
                                const di = r.indexOf("<!DOCTYPE"); if (di !== -1) r = r.slice(di);
                                if (r && !r.trimEnd().toLowerCase().endsWith("</html>")) { if (!r.toLowerCase().includes("</body>")) r += "\n</body>"; r += "\n</html>"; }
                                if (r.startsWith("<!DOCTYPE")) { html = r; toast.warning(t("landingBuilderPage.generationPartiallyRecovered")); }
                              }
                              if (!html) throw new Error(t("landingBuilderPage.aiNoHtmlTryAgain"));

                              setGeneratedHtml(html);
                              setPreviewHtml(html);
                              setHtmlVersion(v => v + 1);
                              if (selectedId) supabase.from("landing_pages").update({ html }).eq("id", selectedId).then(() => {});

                              const msgs: ChatMessage[] = [
                                { id: userMsgId, role: "user" as const, content: `📋 ${t("landingBuilderPage.templateLabel", { name: templateName })}`, status: "done" as const },
                                { id: assistantMsgId, role: "assistant" as const, content: summary + (tokensUsed ? ` · ${tokensUsed.toLocaleString()} tokens` : ""), summary, status: "done" as const },
                              ];
                              setChatMessages(msgs);
                              if (selectedId) supabase.from("landing_pages").update({ chat_history: msgs }).eq("id", selectedId).then(() => {});
                            } catch (e: any) {
                              setChatMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: e.message || t("landingBuilderPage.error"), status: "error" as const } : m));
                            } finally {
                              setGenerating(false);
                              if (generationTimerRef.current) { clearInterval(generationTimerRef.current); generationTimerRef.current = null; }
                              setGenerationElapsed(0);
                              setStreamedTokens(0);
                            }
                          })();
                        }, 50);
                      }}
                      onStartFromScratch={() => {
                        setShowTemplates(false);
                        setChatOpen(true);
                      }}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
                      <Sparkles className="h-10 w-10 opacity-20" />
                      <p className="text-sm">{t("landingBuilderPage.describeLandingInPanel")}</p>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" /> {t("landingBuilderPage.viewTemplates")}
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {/* ── 3D Generation overlay ── */}
                {generating && (
                  <>
                    <style>{`
                      @keyframes lp-ring-a {
                        from { transform: rotateX(72deg) rotateZ(0deg); }
                        to   { transform: rotateX(72deg) rotateZ(360deg); }
                      }
                      @keyframes lp-ring-b {
                        from { transform: rotateX(72deg) rotateY(55deg) rotateZ(0deg); }
                        to   { transform: rotateX(72deg) rotateY(55deg) rotateZ(-360deg); }
                      }
                      @keyframes lp-ring-c {
                        from { transform: rotateX(18deg) rotateY(90deg) rotateZ(0deg); }
                        to   { transform: rotateX(18deg) rotateY(90deg) rotateZ(360deg); }
                      }
                      @keyframes lp-glow {
                        0%,100% { box-shadow: 0 0 22px 8px rgba(249,115,22,.42), inset 0 0 18px rgba(249,115,22,.15); }
                        50%     { box-shadow: 0 0 50px 20px rgba(249,115,22,.72), inset 0 0 30px rgba(249,115,22,.28); }
                      }
                      @keyframes lp-core {
                        0%,100% { transform: scale(1); }
                        50%     { transform: scale(1.07); }
                      }
                      @keyframes lp-float {
                        0%   { opacity:0; transform:translate(0,0) scale(1); }
                        18%  { opacity:1; }
                        100% { opacity:0; transform:translate(var(--ptx),var(--pty)) scale(0.15); }
                      }
                      @keyframes lp-bg-spin {
                        from { transform: rotate(0deg); }
                        to   { transform: rotate(360deg); }
                      }
                    `}</style>

                    <div
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-10 select-none"
                      style={{ background: 'color-mix(in srgb, var(--background, #fff) 88%, transparent)', backdropFilter: 'blur(14px)' }}
                    >
                      {/* Ambient glow halo behind orb */}
                      <div style={{ position: 'relative', width: 200, height: 200 }}>
                        <div style={{
                          position: 'absolute', inset: 0,
                          borderRadius: '50%',
                          background: 'radial-gradient(circle, rgba(249,115,22,.14) 0%, transparent 70%)',
                          animation: 'lp-bg-spin 12s linear infinite',
                        }} />

                        {/* 3-ring perspective scene */}
                        <div style={{ perspective: 560, width: '100%', height: '100%' }}>
                          <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}>

                            {/* Ring A — tilt horizontal */}
                            <div style={{
                              position: 'absolute', inset: 0,
                              borderRadius: '50%',
                              border: '2px solid rgba(249,115,22,.65)',
                              boxShadow: '0 0 8px rgba(249,115,22,.4)',
                              animation: 'lp-ring-a 3.6s linear infinite',
                            }} />

                            {/* Ring B — tilted diagonal */}
                            <div style={{
                              position: 'absolute', inset: 14,
                              borderRadius: '50%',
                              border: '1.5px solid rgba(249,115,22,.45)',
                              boxShadow: '0 0 6px rgba(249,115,22,.3)',
                              animation: 'lp-ring-b 2.7s linear infinite',
                            }} />

                            {/* Ring C — near-vertical */}
                            <div style={{
                              position: 'absolute', inset: 26,
                              borderRadius: '50%',
                              border: '1px solid rgba(251,191,36,.38)',
                              boxShadow: '0 0 4px rgba(251,191,36,.25)',
                              animation: 'lp-ring-c 5.2s linear infinite',
                            }} />

                            {/* Core sphere */}
                            <div style={{
                              position: 'absolute', inset: 44,
                              borderRadius: '50%',
                              background: 'radial-gradient(circle at 34% 30%, hsl(24,95%,68%), hsl(18,88%,44%))',
                              animation: 'lp-glow 2.2s ease-in-out infinite, lp-core 2.2s ease-in-out infinite',
                            }}>
                              <div className="w-full h-full flex items-center justify-center">
                                <svg viewBox="0 0 24 24" width="26" height="26" fill="white">
                                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                                </svg>
                              </div>
                            </div>

                            {/* Orbiting particles — fixed positions, no random() in render */}
                            {([
                              { top:'16%', left:'6%',   ptx:'-26px', pty:'-54px', delay:'0s',    dur:'2.1s', size:5 },
                              { top:'68%', left:'10%',  ptx:'-20px', pty:'-62px', delay:'0.55s', dur:'1.9s', size:4 },
                              { top:'10%', left:'72%',  ptx:'24px',  pty:'-50px', delay:'1.1s',  dur:'2.3s', size:5 },
                              { top:'74%', left:'80%',  ptx:'28px',  pty:'-58px', delay:'0.3s',  dur:'1.7s', size:3 },
                              { top:'44%', left:'90%',  ptx:'36px',  pty:'-40px', delay:'0.85s', dur:'2.5s', size:4 },
                              { top:'84%', left:'50%',  ptx:'10px',  pty:'-68px', delay:'1.4s',  dur:'2s',   size:3 },
                              { top:'30%', left:'3%',   ptx:'-32px', pty:'-45px', delay:'0.7s',  dur:'1.8s', size:4 },
                              { top:'55%', left:'88%',  ptx:'30px',  pty:'-52px', delay:'1.6s',  dur:'2.2s', size:5 },
                            ] as const).map((p, i) => (
                              <div key={i} style={{
                                position: 'absolute',
                                width: p.size, height: p.size,
                                borderRadius: '50%',
                                background: 'hsl(24,95%,65%)',
                                top: p.top, left: p.left,
                                '--ptx': p.ptx, '--pty': p.pty,
                                animationDelay: p.delay,
                                animation: `lp-float ${p.dur} ease-out infinite`,
                              } as React.CSSProperties} />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Progress section */}
                      <div className="flex flex-col items-center gap-3" style={{ width: 280 }}>
                        <p className="text-sm font-semibold text-foreground tracking-tight text-center">
                          {streamedTokens < 500
                            ? "✦ " + t("landingBuilderPage.progressAnalyzing")
                            : streamedTokens < 2500
                            ? "✦ " + t("landingBuilderPage.progressDesigning")
                            : streamedTokens < 8000
                            ? "✦ " + t("landingBuilderPage.progressGeneratingHtml")
                            : "✦ " + t("landingBuilderPage.progressPolishing")}
                        </p>

                        {/* Real token-based progress bar */}
                        <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(96, (streamedTokens / (generatedHtml ? 10000 : 12000)) * 100)}%`,
                              background: 'linear-gradient(90deg, hsl(24,95%,53%) 0%, hsl(18,88%,62%) 50%, hsl(36,100%,64%) 100%)',
                              boxShadow: '0 0 8px rgba(249,115,22,0.5)',
                            }}
                          />
                        </div>

                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {streamedTokens > 0
                            ? `${streamedTokens.toLocaleString()} tokens · ${generationElapsed}s`
                            : `${generationElapsed}s · ${t("landingBuilderPage.connecting")}`}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Chat panel (collapsible, RIGHT side) ── */}
              {chatOpen && (
                <div className="w-80 shrink-0 border-l border-border flex flex-col">
                {/* Header */}
                <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      {t("landingBuilderPage.editWithAi")}
                    </span>
                    {tokensRemaining !== null && (
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums",
                        tokensRemaining > 50000
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : tokensRemaining > 15000
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {tokensRemaining.toLocaleString()} tkn
                      </span>
                    )}
                  </div>
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
                        setShowTemplates(true);
                        setHtmlVersion(v => v + 1);
                        // Bug #9 fix: persist the cleared state to DB so the
                        // next page load doesn't restore the old chat/html.
                        if (selectedId) {
                          supabase.from("landing_pages")
                            .update({ html: "", chat_history: [], prompt: "" })
                            .eq("id", selectedId)
                            .then(() => {});
                        }
                      }}
                    >
                      {t("landingBuilderPage.newChat")}
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
                        {t("landingBuilderPage.describeLandingToStart")}
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
                                  <img key={i} src={url} alt={t("landingBuilderPage.attachment")}
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
                                <p className="text-xs font-semibold text-foreground">{t("landingBuilderPage.createNewPageInFunnelQ")}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                  {t("landingBuilderPage.createNewPageInFunnelDesc")}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 text-xs flex-1 gap-1"
                                disabled={generating}
                                onClick={() => handleCreatePageFromChat(msg.newPagePrompt!, msg.id)}>
                                <Plus className="h-3 w-3" />
                                {t("landingBuilderPage.yesCreateNewPage")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                disabled={generating}
                                onClick={() => {
                                  // Dismiss confirm and modify current page instead
                                  setChatMessages(prev => prev.filter(m => m.id !== msg.id));
                                  setChatInput(msg.newPagePrompt || "");
                                }}>
                                {t("landingBuilderPage.noModifyThis")}
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
                                <span className="text-xs tabular-nums">
                                  {streamedTokens < 500 ? t("landingBuilderPage.statusAnalyzing") :
                                   streamedTokens < 2500 ? t("landingBuilderPage.statusDesigning") :
                                   streamedTokens < 8000 ? t("landingBuilderPage.statusGeneratingHtml") :
                                   t("landingBuilderPage.statusFinalizing")}
                                  {streamedTokens > 0
                                    ? <span className="opacity-50 ml-1">{streamedTokens.toLocaleString()} tkn</span>
                                    : generationElapsed > 0 && <span className="opacity-50 ml-1">{generationElapsed}s</span>}
                                </span>
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
                      {t("landingBuilderPage.mentionFormInPrompt")}
                    </p>
                  ) : (
                    /* Form detected — show fields + integrate button */
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {t("landingBuilderPage.fieldsDetected", { count: (formConfig.fields ?? []).length })}
                        </span>
                        <button
                          onClick={() => setFormConfigOpen(true)}
                          className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          {t("landingBuilderPage.integrateWithCrm")} →
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
                            {t("landingBuilderPage.moreCount", { count: (formConfig.fields ?? []).length - 5 })}
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

                  {/* Attached PDF chip */}
                  {attachedPdf && (
                    <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1.5 rounded-lg w-fit max-w-full">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[160px]">{attachedPdf.name}</span>
                      <span className="opacity-60 shrink-0">{attachedPdf.sizeKb}KB</span>
                      <button
                        onClick={() => setAttachedPdf(null)}
                        className="ml-0.5 opacity-60 hover:opacity-100 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={generatedHtml ? t("landingBuilderPage.describeChangePlaceholder") : t("landingBuilderPage.describeFromScratchPlaceholder")}
                    className="text-sm resize-none min-h-[72px]"
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />

                  {/* Hidden file inputs */}
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
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePdfAttach(file);
                      e.target.value = "";
                    }}
                  />

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
                        <TooltipContent side="top">{t("landingBuilderPage.attachImage")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* PDF attach button */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant={attachedPdf ? "secondary" : "outline"}
                            className="h-8 w-8 p-0 shrink-0"
                            disabled={generating}
                            onClick={() => pdfInputRef.current?.click()}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {attachedPdf ? `PDF: ${attachedPdf.name}` : t("landingBuilderPage.attachPdfBrochure")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {generatedHtml && (
                      <span className="text-[10px] text-muted-foreground flex-1">
                        {t("landingBuilderPage.refineMode")}
                      </span>
                    )}

                    <Button
                      size="sm"
                      className="gap-1.5 ml-auto"
                      disabled={generating || (!chatInput.trim() && attachedImages.length === 0 && !attachedPdf)}
                      onClick={handleGenerate}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {generating ? t("landingBuilderPage.sending") : generatedHtml ? t("landingBuilderPage.refine") : t("landingBuilderPage.generate")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Drag & Drop Mode */
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
        </div>}{/* end editor view */}

      </div>{/* end flex h-full */}

      {/* ── New funnel dialog ── */}
      <Dialog open={newFunnelOpen} onOpenChange={setNewFunnelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" /> {t("landingBuilderPage.newProject")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{t("landingBuilderPage.funnelNameLabel")}</Label>
              <Input
                value={newFunnelName}
                onChange={(e) => setNewFunnelName(e.target.value)}
                placeholder={t("landingBuilderPage.funnelNamePlaceholder")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateFunnel()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("landingBuilderPage.funnelHint")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFunnelOpen(false)}>{t("landingBuilderPage.cancel")}</Button>
            <Button onClick={handleCreateFunnel} disabled={!newFunnelName.trim()}>{t("landingBuilderPage.createFunnel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New page dialog ── */}
      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> {t("landingBuilderPage.newPage")}
              {selectedFunnelId && funnels.find(f => f.id === selectedFunnelId) && (
                <span className="text-muted-foreground font-normal text-sm">
                  {t("landingBuilderPage.inFunnel", { name: funnels.find(f => f.id === selectedFunnelId)!.name })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{t("landingBuilderPage.pageNameLabel")}</Label>
              <Input
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                placeholder={t("landingBuilderPage.pageNamePlaceholder")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("landingBuilderPage.publicUrlLabel")} <span className="font-mono">{toSlug(newPageName) || "mi-pagina"}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPageOpen(false)}>{t("landingBuilderPage.cancel")}</Button>
            <Button onClick={handleCreatePage} disabled={!newPageName.trim()}>{t("landingBuilderPage.createPage")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Form Integration Sheet ── */}
      <Sheet open={formConfigOpen} onOpenChange={(open) => {
        setFormConfigOpen(open);
        // Auto-persist form_config whenever the sheet closes so redirect_url /
        // cta_links are never lost even if the user closes via the X button.
        if (!open && selectedId) {
          supabase.from("landing_pages")
            .update({ form_config: formConfig })
            .eq("id", selectedId)
            .then(() => {});
        }
      }}>
        <SheetContent side="right" className="w-[420px] sm:w-[460px] overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              {t("landingBuilderPage.integrateFormWithCrm")}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {t("landingBuilderPage.integrateFormDesc")}
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            {/* ── Detected fields ── */}
            <div>
              <Label className="text-sm font-semibold mb-3 block">
                {t("landingBuilderPage.detectedFormFields")}
              </Label>

              {(formConfig.fields ?? []).length === 0 ? (
                /* No form in HTML yet */
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-5 text-center space-y-2">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    {t("landingBuilderPage.noFormDetected")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("landingBuilderPage.noFormDetectedHint")}
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

            {/* ── Connections (redirect + CTA) ── */}
            {(() => {
              // Use the public custom domain so redirects stay on pages.klosify.com
              const serveUrl = (slug: string | null) =>
                slug ? getPublicUrl(slug) : "";

              // Funnel pages available as targets (exclude current page)
              const targetPages = funnelPages.filter(p => p.id !== selectedId && p.slug);

              const redirectVal = formConfig.redirect_url ?? "";
              const ctaVal = formConfig.cta_url ?? "";

              // Determine select value: "message" | "custom" | one of the page slugs
              const resolveMode = (val: string) => {
                if (!val) return "message";
                const match = targetPages.find(p => serveUrl(p.slug) === val);
                return match ? match.id : "custom";
              };

              const redirectMode = resolveMode(redirectVal);
              const ctaMode = ctaVal ? (targetPages.find(p => serveUrl(p.slug) === ctaVal) ? targetPages.find(p => serveUrl(p.slug) === ctaVal)!.id : "custom") : "none";

              return (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("landingBuilderPage.connectionsAndNav")}
                  </Label>

                  {/* Form submit destination */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("landingBuilderPage.onFormSubmit")}</p>
                    <Select
                      value={redirectMode}
                      onValueChange={v => {
                        if (v === "message") {
                          setFormConfig(prev => ({ ...prev, redirect_url: "" }));
                        } else if (v === "custom") {
                          setFormConfig(prev => ({ ...prev, redirect_url: "https://" }));
                        } else {
                          const page = targetPages.find(p => p.id === v);
                          setFormConfig(prev => ({ ...prev, redirect_url: serveUrl(page?.slug ?? null) }));
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="message">{t("landingBuilderPage.showSuccessMessage")}</SelectItem>
                        {targetPages.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            → {p.name}
                            {p.page_role === "thankyou" && <span className="text-green-600 ml-1">({t("landingBuilderPage.roleThankyou")})</span>}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">{t("landingBuilderPage.customExternalUrl")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {redirectMode === "custom" && (
                      <Input
                        className="h-8 text-sm"
                        placeholder={t("landingBuilderPage.thankYouUrlPlaceholder")}
                        value={redirectVal}
                        onChange={e => setFormConfig(prev => ({ ...prev, redirect_url: e.target.value }))}
                      />
                    )}
                    {redirectMode === "message" && (
                      <Textarea
                        className="text-sm resize-none"
                        rows={2}
                        placeholder={t("landingBuilderPage.successMessagePlaceholder")}
                        value={formConfig.success_message || ""}
                        onChange={e => setFormConfig(prev => ({ ...prev, success_message: e.target.value }))}
                      />
                    )}
                    {redirectMode !== "message" && redirectMode !== "custom" && (
                      <p className="text-[10px] text-green-600 flex items-center gap-1">
                        ✓ {t("landingBuilderPage.willRedirectTo", { name: targetPages.find(p => p.id === redirectMode)?.name })}
                      </p>
                    )}
                  </div>

                  {/* CTA buttons — per-button configuration */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("landingBuilderPage.detectedCtaButtons")}</p>
                    {(formConfig.cta_links ?? []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/60 italic">
                        {t("landingBuilderPage.noCtaButtonsDetected")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(formConfig.cta_links ?? []).map((cta, idx) => {
                          const val = cta.url;
                          const matchPage = targetPages.find(p => serveUrl(p.slug) === val);
                          const mode = !val ? "none" : matchPage ? matchPage.id : "custom";
                          return (
                            <div key={idx} className="rounded-md border border-border p-2.5 space-y-1.5 bg-background">
                              <p className="text-[11px] font-medium truncate text-foreground" title={cta.text}>
                                🔗 "{cta.text}"
                              </p>
                              <Select
                                value={mode}
                                onValueChange={v => {
                                  let url = "";
                                  if (v === "custom") url = "https://";
                                  else if (v !== "none") {
                                    const pg = targetPages.find(p => p.id === v);
                                    url = serveUrl(pg?.slug ?? null);
                                  }
                                  setFormConfig(prev => ({
                                    ...prev,
                                    cta_links: (prev.cta_links ?? []).map((c, i) =>
                                      i === idx ? { ...c, url } : c
                                    ),
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder={t("landingBuilderPage.notConfigured")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t("landingBuilderPage.notConfiguredHref")}</SelectItem>
                                  {targetPages.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      → {p.name}
                                      {p.page_role === "thankyou" && " ✓"}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="custom">{t("landingBuilderPage.externalUrl")}</SelectItem>
                                </SelectContent>
                              </Select>
                              {mode === "custom" && (
                                <Input
                                  className="h-7 text-xs"
                                  placeholder={t("landingBuilderPage.domainPagePlaceholder")}
                                  value={val}
                                  onChange={e => setFormConfig(prev => ({
                                    ...prev,
                                    cta_links: (prev.cta_links ?? []).map((c, i) =>
                                      i === idx ? { ...c, url: e.target.value } : c
                                    ),
                                  }))}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60">
                      {t("landingBuilderPage.ctaHrefHint")}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* ── Pipeline assignment ── */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                {t("landingBuilderPage.autoPipelineAssignment")}
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
                    <SelectValue placeholder={t("landingBuilderPage.noPipelineAssignment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("landingBuilderPage.noAssignment")}</SelectItem>
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
                      <SelectValue placeholder={t("landingBuilderPage.selectStage")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("landingBuilderPage.noSpecificStage")}</SelectItem>
                      {pipelineStages.filter(s => s.pipeline_id === formConfig.pipeline_id).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {formConfig.pipeline_id && formConfig.stage_id && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    ✓ {t("landingBuilderPage.leadsWillGoTo")} <strong>{formConfig.pipeline_name} → {formConfig.stage_name}</strong>
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
              disabled={saving || (
                !(formConfig.fields ?? []).length &&
                !formConfig.redirect_url &&
                !(formConfig.cta_links ?? []).some(c => c.url) &&
                !formConfig.pipeline_id
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              {t("landingBuilderPage.saveIntegration")}
            </Button>
            {!(formConfig.fields ?? []).length && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                {t("landingBuilderPage.generateFormToMap")}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── CTA inline link editor popover ── */}
      {ctaPopover.open && (() => {
        // Use public custom domain for CTA links too
        const serveUrl = (slug: string | null) =>
          slug ? getPublicUrl(slug) : "";
        const targetPages = funnelPages.filter(p => p.id !== selectedId && p.slug);
        const matchPage = targetPages.find(p => serveUrl(p.slug) === ctaPopoverUrl);
        const mode = !ctaPopoverUrl ? "none" : matchPage ? matchPage.id : "custom";

        return (
          <div
            style={{ position: "fixed", top: ctaPopover.screenY, left: ctaPopover.screenX, zIndex: 9999 }}
            className="bg-background border border-border rounded-xl shadow-2xl p-3 w-72 animate-in fade-in-0 zoom-in-95"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-primary shrink-0" />
                  {t("landingBuilderPage.configureButton")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={ctaPopover.text}>
                  "{ctaPopover.text}"
                </p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                onClick={() => setCtaPopover(p => ({ ...p, open: false }))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Destination selector */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium">{t("landingBuilderPage.whereDoesButtonGo")}</p>
              <Select
                value={mode}
                onValueChange={v => {
                  if (v === "none") setCtaPopoverUrl("");
                  else if (v === "custom") setCtaPopoverUrl("https://");
                  else {
                    const pg = targetPages.find(p => p.id === v);
                    setCtaPopoverUrl(serveUrl(pg?.slug ?? null));
                  }
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t("landingBuilderPage.selectDestination")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("landingBuilderPage.noDestinationHref")}</SelectItem>
                  {targetPages.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.page_role === "thankyou" && <span className="text-green-600 ml-1">· {t("landingBuilderPage.roleThankyou")}</span>}
                      {p.page_role === "upsell" && <span className="text-orange-500 ml-1">· {t("landingBuilderPage.roleUpsell")}</span>}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">{t("landingBuilderPage.externalUrl")}</SelectItem>
                </SelectContent>
              </Select>

              {mode === "custom" && (
                <Input
                  className="h-8 text-sm"
                  placeholder={t("landingBuilderPage.domainPagePlaceholder")}
                  value={ctaPopoverUrl}
                  onChange={e => setCtaPopoverUrl(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && applyCtaLink(ctaPopoverUrl)}
                />
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs gap-1"
                  onClick={() => applyCtaLink(ctaPopoverUrl)}
                  disabled={mode === "none"}
                >
                  <Check className="h-3 w-3" /> {t("landingBuilderPage.apply")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setCtaPopover(p => ({ ...p, open: false }))}
                >
                  {t("landingBuilderPage.cancel")}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
      <AlertDialog open={!!deleteFunnelTarget} onOpenChange={open => { if (!open) setDeleteFunnelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("landingBuilderPage.deleteFunnelQ")}</AlertDialogTitle>
            <AlertDialogDescription>{t("landingBuilderPage.deleteFunnelDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("landingBuilderPage.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteFunnelTarget) handleDeleteFunnel(deleteFunnelTarget); setDeleteFunnelTarget(null); }}
            >
              {t("landingBuilderPage.deleteFunnel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePageTarget} onOpenChange={open => { if (!open) setDeletePageTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("landingBuilderPage.deletePageQ")}</AlertDialogTitle>
            <AlertDialogDescription>{t("landingBuilderPage.deletePageDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("landingBuilderPage.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletePageTarget) handleDelete(deletePageTarget); setDeletePageTarget(null); }}
            >
              {t("landingBuilderPage.deletePage")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

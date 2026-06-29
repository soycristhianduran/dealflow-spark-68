import { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWhatsAppTemplates, WhatsAppTemplate, CreateTemplateParams, WaTemplateButton } from "@/hooks/useWhatsAppTemplates";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useOrganizationContext } from "@/context/OrganizationContext";
import {
  Plus, RefreshCw, Trash2, CheckCircle2,
  Clock, XCircle, AlertCircle, Loader2, ChevronRight, Pencil, Upload, X
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/icons/BrandIcons";
import { useTranslation } from "react-i18next";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  APPROVED: { label: "Aprobada", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  PENDING: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  IN_APPEAL: { label: "En apelación", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  REJECTED: { label: "Rechazada", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  PAUSED: { label: "Pausada", color: "bg-gray-100 text-gray-700 border-gray-200", icon: AlertCircle },
  DISABLED: { label: "Deshabilitada", color: "bg-gray-100 text-gray-700 border-gray-200", icon: AlertCircle },
  DRAFT: { label: "Borrador (error Meta)", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle },
};

const CATEGORIES = [
  { value: "MARKETING", label: "Marketing", desc: "Promociones, ofertas, novedades" },
  { value: "UTILITY", label: "Utilidad", desc: "Confirmaciones, recordatorios, actualizaciones" },
  { value: "AUTHENTICATION", label: "Autenticación", desc: "Códigos OTP, verificación" },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "es_MX", label: "Español (México)" },
  { value: "es_AR", label: "Español (Argentina)" },
  { value: "es_CO", label: "Español (Colombia)" },
  { value: "en_US", label: "English (US)" },
  { value: "pt_BR", label: "Português (Brasil)" },
];

const HEADER_OPTIONS = [
  { value: "NONE", label: "Ninguno", icon: "—" },
  { value: "TEXT", label: "Texto", icon: "T" },
  { value: "IMAGE", label: "Imagen", icon: "🖼" },
  { value: "VIDEO", label: "Video", icon: "🎬" },
];

const VARIABLE_HINT = "Usa {{1}}, {{2}}, etc. para variables dinámicas (ej: nombre del cliente)";

// ── Variable Inserter ──────────────────────────────────────────────────────
function VariableInserter({
  value,
  onChange,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const { t } = useTranslation();
  const usedNums = [...new Set(
    (value.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/[{}]/g, "")))
  )].sort((a, b) => a - b);

  const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 1;

  const insert = (text: string) => {
    const el = textareaRef.current;
    if (!el) { onChange(value + text); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.substring(0, start) + text + value.substring(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs text-muted-foreground font-medium">{t("whatsAppTemplatesPage.variablesLabel")}</span>
      {usedNums.map(n => (
        <button
          key={n}
          type="button"
          title={t("whatsAppTemplatesPage.insertVarAtCursor", { var: `{{${n}}}` })}
          onClick={() => insert(`{{${n}}}`)}
          className="font-mono text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-md px-2 py-0.5 hover:bg-blue-100 transition-colors"
        >
          {`{{${n}}}`}
        </button>
      ))}
      <button
        type="button"
        title={t("whatsAppTemplatesPage.insertNewVar", { var: `{{${nextNum}}}` })}
        onClick={() => insert(`{{${nextNum}}}`)}
        className="text-xs bg-primary/10 border border-primary/20 text-primary rounded-md px-2 py-0.5 hover:bg-primary/20 transition-colors font-medium flex items-center gap-1"
      >
        <Plus className="h-3 w-3" />
        {`{{${nextNum}}}`}
      </button>
      {usedNums.length > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          · {usedNums.length > 1
            ? t("whatsAppTemplatesPage.varsInUsePlural", { count: usedNums.length })
            : t("whatsAppTemplatesPage.varsInUseSingular", { count: usedNums.length })}
        </span>
      )}
    </div>
  );
}

// ── Media Uploader ────────────────────────────────────────────────────────
const MAX_IMAGE_MB = 5;
const MAX_VIDEO_MB = 16;
const ACCEPT_MAP: Record<string, string> = {
  IMAGE: "image/jpeg,image/png,image/webp",
  VIDEO: "video/mp4,video/3gpp",
  DOCUMENT: "application/pdf",
};

function MediaUploader({
  headerType,
  mediaId,
  preview,
  uploading,
  onUpload,
  onClear,
}: {
  headerType: string;
  mediaId: string;
  preview: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const maxMb = headerType === "VIDEO" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  const label = headerType === "IMAGE"
    ? t("whatsAppTemplatesPage.mediaImage")
    : headerType === "VIDEO"
      ? t("whatsAppTemplatesPage.mediaVideo")
      : t("whatsAppTemplatesPage.mediaDocument");

  const handleFile = async (file: File) => {
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(t("whatsAppTemplatesPage.fileTooLarge", { maxMb }));
      return;
    }
    // Block HEVC/H.265 videos before upload — WhatsApp rejects them at send time
    // with error 131053 (the message silently fails). iPhones record HEVC by
    // default. We scan the file for the 'hvc1'/'hev1' codec marker and stop the
    // upload with a clear message instead of letting it fail later.
    if (headerType === "VIDEO") {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const head = new TextDecoder("latin1").decode(bytes);
        if (head.includes("hvc1") || head.includes("hev1")) {
          toast.error(t("whatsAppTemplatesPage.videoHevcBlocked"), { duration: 12000 });
          return;
        }
      } catch { /* detection failed → allow upload, don't block legit files */ }
    }
    onUpload(file);
  };

  return (
    <div className="mt-2 space-y-2">
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent"
        )}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_MAP[headerType] || "*"}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">{t("whatsAppTemplatesPage.uploadingToMeta")}</p>
          </div>
        ) : preview ? (
          <div className="relative">
            {headerType === "IMAGE" ? (
              <img src={preview} alt="preview" className="max-h-32 mx-auto rounded object-contain" />
            ) : (
              <video src={preview} className="max-h-32 mx-auto rounded" controls />
            )}
            <p className="text-xs text-green-600 mt-1 font-medium">{t("whatsAppTemplatesPage.fileUploadedCheck")}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t("whatsAppTemplatesPage.dropFileHere", { label })}</p>
            <p className="text-xs text-muted-foreground">
              {headerType === "IMAGE" ? "JPG, PNG, WebP" : headerType === "VIDEO" ? "MP4, 3GPP" : "PDF"} · {t("whatsAppTemplatesPage.maxSize", { maxMb })}
            </p>
          </div>
        )}
      </div>
      {headerType === "VIDEO" && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5">
          <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            <span className="font-semibold">⚠️ {t("whatsAppTemplatesPage.videoCodecTitle")}</span>{" "}
            {t("whatsAppTemplatesPage.videoCodecHint")}
          </p>
        </div>
      )}
      {(preview || mediaId) && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-destructive hover:underline flex items-center gap-1"
        >
          <X className="h-3 w-3" /> {t("whatsAppTemplatesPage.removeFile")}
        </button>
      )}
    </div>
  );
}

function TemplateStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["PENDING"];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

type FormState = {
  name: string;
  category: string;
  language: string;
  headerType: string;
  headerText: string;       // for TEXT headers
  headerMediaId: string;    // Meta media_id after upload
  headerPreview: string;    // local object URL for preview
  headerUploading: boolean;
  bodyText: string;
  footerText: string;
  buttons: { type: string; text: string; url?: string; phone_number?: string }[];
  variableExamples: string[];
};

const EMPTY_FORM: FormState = {
  name: "", category: "MARKETING", language: "es",
  headerType: "NONE", headerText: "", headerMediaId: "", headerPreview: "",
  headerUploading: false, bodyText: "", footerText: "", buttons: [],
  variableExamples: [],
};

/** Extract sorted unique variable numbers from a string like "Hola {{1}}, tu código es {{2}}" */
function extractVarNums(text: string): number[] {
  return [...new Set((text.match(/\{\{(\d+)\}\}/g) || []).map(m => parseInt(m.replace(/[{}]/g, ""))))].sort((a, b) => a - b);
}

/** Validate variables are sequential starting at 1 */
function validateVars(text: string): string | null {
  const nums = extractVarNums(text);
  if (nums.length === 0) return null;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) return `Las variables deben ser secuenciales: falta {{${i + 1}}}`;
  }
  return null;
}

function templateToForm(t: WhatsAppTemplate): FormState {
  const nums = extractVarNums(t.body_text);
  return {
    name: t.name,
    category: t.category,
    language: t.language,
    headerType: t.header_type || "NONE",
    headerText: t.header_text || "",
    headerMediaId: "", headerPreview: "", headerUploading: false,
    bodyText: t.body_text,
    footerText: t.footer_text || "",
    variableExamples: nums.map((_, i) => `Ejemplo ${i + 1}`),
    buttons: (t.buttons || []).map((b: any) => ({
      type: b.type,
      text: b.text || "",
      url: b.url,
      phone_number: b.phone_number,
    })),
  };
}

export default function WhatsAppTemplatesPage() {
  const { t } = useTranslation();
  const translate = t; // alias for use inside closures that shadow `t`
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { organizationId } = useOrganizationContext();
  const { isConnected, loading: waLoading } = useWhatsAppIntegration();
  const { templates, loading, creating, fetchTemplates, syncFromMeta, createTemplate, deleteTemplate, updateTemplate } = useWhatsAppTemplates();

  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<WhatsAppTemplate | null>(null);
  const [viewTemplate, setViewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Edit form state
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  // Textarea refs for variable insertion at cursor
  const createBodyRef = useRef<HTMLTextAreaElement>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);

  // Upload a media file to Meta via edge function → returns media_id
  const uploadMediaFile = useCallback(async (
    file: File,
    formSetter: React.Dispatch<React.SetStateAction<FormState>>
  ) => {
    const preview = URL.createObjectURL(file);
    formSetter(f => ({ ...f, headerPreview: preview, headerUploading: true, headerMediaId: "" }));
    try {
      // Read as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "upload_media", file_base64: base64, mime_type: file.type, filename: file.name, organization_id: organizationId ?? null },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      formSetter(f => ({ ...f, headerMediaId: data.media_id, headerUploading: false }));
      toast.success(t("whatsAppTemplatesPage.fileUploadedSuccess"));
    } catch (e: any) {
      formSetter(f => ({ ...f, headerUploading: false, headerPreview: "", headerMediaId: "" }));
      toast.error(t("whatsAppTemplatesPage.fileUploadError", { message: e.message }));
    }
  }, [organizationId, t]);

  useEffect(() => {
    if (isConnected) fetchTemplates();
  }, [isConnected, fetchTemplates]);

  // When opening edit dialog, pre-populate form
  const openEdit = (t: WhatsAppTemplate) => {
    setEditForm(templateToForm(t));
    setEditTemplate(t);
    setViewTemplate(null);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error(t("whatsAppTemplatesPage.nameRequired")); return; }
    if (!form.bodyText.trim()) { toast.error(t("whatsAppTemplatesPage.bodyRequired")); return; }
    const varError = validateVars(form.bodyText);
    if (varError) { toast.error(varError); return; }
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(form.headerType) && !form.headerMediaId) {
      const fileLabel = form.headerType === "IMAGE"
        ? t("whatsAppTemplatesPage.mediaImage")
        : form.headerType === "VIDEO"
          ? t("whatsAppTemplatesPage.mediaVideo")
          : t("whatsAppTemplatesPage.mediaDocument");
      toast.error(t("whatsAppTemplatesPage.uploadFileBeforeCreate", { label: fileLabel }));
      return;
    }
    const nameClean = form.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const varNums = extractVarNums(form.bodyText);
    const examples = varNums.map((_, i) => form.variableExamples[i]?.trim() || `Ejemplo${i + 1}`);
    const params: CreateTemplateParams = {
      name: nameClean,
      category: form.category,
      language: form.language,
      body_text: form.bodyText.trim(),
      variable_examples: examples.length > 0 ? examples : undefined,
      header: form.headerType !== "NONE"
        ? {
            type: form.headerType,
            text: form.headerType === "TEXT" ? form.headerText.trim() : undefined,
            media_id: form.headerMediaId || undefined,
          }
        : null,
      footer: form.footerText.trim() || undefined,
      buttons: form.buttons.length > 0 ? form.buttons : undefined,
    };
    try {
      await createTemplate(params);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (_) {}
  };

  const handleUpdate = async () => {
    if (!editTemplate) return;
    if (!editForm.bodyText.trim()) { toast.error(t("whatsAppTemplatesPage.bodyRequired")); return; }
    const varError = validateVars(editForm.bodyText);
    if (varError) { toast.error(varError); return; }
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(editForm.headerType) && !editForm.headerMediaId) {
      toast.error(t("whatsAppTemplatesPage.uploadSampleForHeader", { type: editForm.headerType }));
      return;
    }
    setSaving(true);
    const varNums = extractVarNums(editForm.bodyText);
    const examples = varNums.map((_, i) => editForm.variableExamples[i]?.trim() || `Ejemplo${i + 1}`);
    const headerParam = editForm.headerType !== "NONE"
      ? {
          type: editForm.headerType,
          text: editForm.headerType === "TEXT" ? editForm.headerText.trim() : undefined,
          media_id: editForm.headerMediaId || undefined,
        }
      : null;
    try {
      // DRAFT templates never reached Meta — re-submit as a fresh create
      if (!editTemplate.template_id || editTemplate.status === "DRAFT") {
        await createTemplate({
          name: editTemplate.name,
          category: editTemplate.category,
          language: editTemplate.language,
          body_text: editForm.bodyText.trim(),
          variable_examples: examples.length > 0 ? examples : undefined,
          header: headerParam,
          footer: editForm.footerText.trim() || undefined,
          buttons: editForm.buttons.length > 0 ? editForm.buttons : undefined,
        });
      } else {
        await updateTemplate({
          template_id: editTemplate.template_id,
          name: editTemplate.name,
          header: headerParam,
          body_text: editForm.bodyText.trim(),
          variable_examples: examples.length > 0 ? examples : undefined,
          footer: editForm.footerText.trim() || undefined,
          buttons: editForm.buttons.length > 0 ? editForm.buttons : undefined,
        });
      }
      setEditTemplate(null);
    } catch (_) {} finally {
      setSaving(false);
    }
  };

  const addButton = (formSetter: React.Dispatch<React.SetStateAction<FormState>>) => {
    formSetter(f => {
      if (f.buttons.length >= 3) { toast.error(t("whatsAppTemplatesPage.maxButtons")); return f; }
      return { ...f, buttons: [...f.buttons, { type: "QUICK_REPLY", text: "" }] };
    });
  };

  const removeButton = (i: number, formSetter: React.Dispatch<React.SetStateAction<FormState>>) => {
    formSetter(f => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));
  };

  const updateButton = (i: number, field: string, value: string, formSetter: React.Dispatch<React.SetStateAction<FormState>>) => {
    formSetter(f => ({ ...f, buttons: f.buttons.map((b, idx) => idx === i ? { ...b, [field]: value } : b) }));
  };

  if (waLoading) {
    return (
      <AppLayout>
        <AppHeader title={t("whatsAppTemplatesPage.pageTitle")} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isConnected) {
    return (
      <AppLayout>
        <AppHeader title={t("whatsAppTemplatesPage.pageTitle")} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <WhatsAppIcon className="h-11 w-11" />
          </div>
          <h2 className="text-xl font-semibold">{t("whatsAppTemplatesPage.notConnectedTitle")}</h2>
          <p className="text-muted-foreground text-center max-w-md">
            {t("whatsAppTemplatesPage.notConnectedDesc")}
          </p>
          <Button onClick={() => navigate(path("/integrations"))}>
            {t("whatsAppTemplatesPage.goToIntegrations")} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title={t("whatsAppTemplatesPage.pageTitle")} />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-transparent p-6">
          {/* watermark logo */}
          <WhatsAppIcon className="pointer-events-none absolute -right-6 -top-8 h-44 w-44 opacity-[0.06]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <WhatsAppIcon className="h-9 w-9" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t("whatsAppTemplatesPage.heroTitle")}</h1>
                <p className="text-muted-foreground text-sm mt-1 max-w-md">
                  {t("whatsAppTemplatesPage.heroSubtitle")}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={syncFromMeta} disabled={loading} className="bg-background/60 backdrop-blur">
                <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
                {t("whatsAppTemplatesPage.sync")}
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4 mr-1" />
                {t("whatsAppTemplatesPage.newTemplate")}
              </Button>
            </div>
          </div>

          {/* Stat pills */}
          {templates.length > 0 && (
            <div className="relative mt-5 flex flex-wrap gap-2">
              {[
                { label: t("whatsAppTemplatesPage.statTotal"), value: templates.length, cls: "bg-background/70 text-foreground ring-border" },
                { label: t("whatsAppTemplatesPage.statApproved"), value: templates.filter(t => t.status === "APPROVED").length, cls: "bg-green-100 text-green-700 ring-green-200" },
                { label: t("whatsAppTemplatesPage.statPending"), value: templates.filter(t => t.status === "PENDING" || t.status === "IN_APPEAL").length, cls: "bg-yellow-100 text-yellow-700 ring-yellow-200" },
                { label: t("whatsAppTemplatesPage.statRejected"), value: templates.filter(t => t.status === "REJECTED").length, cls: "bg-red-100 text-red-700 ring-red-200" },
              ].map(s => (
                <div key={s.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1", s.cls)}>
                  <span className="font-bold tabular-nums">{s.value}</span>
                  <span className="opacity-80">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300 flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <strong>{t("whatsAppTemplatesPage.howTemplatesWorkTitle")}</strong> {t("whatsAppTemplatesPage.howTemplatesWorkPart1")}{" "}
            <strong>{t("whatsAppTemplatesPage.approvedWord")}</strong> {t("whatsAppTemplatesPage.howTemplatesWorkPart2")}
          </div>
        </div>

        {/* Templates grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <WhatsAppIcon className="h-9 w-9" />
              </div>
              <p className="text-muted-foreground font-medium">{t("whatsAppTemplatesPage.noTemplatesYet")}</p>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {t("whatsAppTemplatesPage.noTemplatesDesc")}
              </p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t("whatsAppTemplatesPage.createFirstTemplate")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const mediaChip = t.header_type && t.header_type !== "TEXT" && t.header_type !== "NONE"
                ? (t.header_type === "IMAGE" ? { icon: "🖼", label: translate("whatsAppTemplatesPage.mediaImageCap") }
                  : t.header_type === "VIDEO" ? { icon: "🎬", label: translate("whatsAppTemplatesPage.mediaVideoCap") }
                  : t.header_type === "DOCUMENT" ? { icon: "📄", label: translate("whatsAppTemplatesPage.mediaDocumentCap") } : null)
                : null;
              return (
              <Card
                key={t.id}
                className="group relative overflow-hidden border-border/70 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all cursor-pointer"
                onClick={() => setViewTemplate(t)}
              >
                {/* left accent bar */}
                <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/15">
                        <WhatsAppIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{t.name}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.category}</span>
                          <span className="text-[10px] text-muted-foreground">{t.language}</span>
                        </div>
                      </div>
                    </div>
                    <TemplateStatusBadge status={t.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {t.header_text && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t.header_text}
                    </p>
                  )}
                  {mediaChip && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      <span>{mediaChip.icon}</span>{mediaChip.label}
                    </span>
                  )}
                  <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap leading-relaxed">{t.body_text}</p>
                  {t.footer_text && (
                    <p className="text-xs text-muted-foreground italic">{t.footer_text}</p>
                  )}
                  {t.buttons && t.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {t.buttons.map((b, i) => (
                        <span key={i} className="text-xs border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 rounded-md px-2 py-0.5 font-medium">
                          {b.text}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.rejection_reason && t.rejection_reason !== "NONE" && (
                    <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2">
                      ⚠️ {t.rejection_reason}
                    </p>
                  )}
                  <div className="flex justify-end gap-1 pt-1 border-t mt-1" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => setConfirmDelete(t.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── VIEW DETAIL DIALOG ── */}
      <Dialog open={!!viewTemplate} onOpenChange={() => setViewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewTemplate?.name}
              {viewTemplate && <TemplateStatusBadge status={viewTemplate.status} />}
            </DialogTitle>
          </DialogHeader>
          {viewTemplate && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">{t("whatsAppTemplatesPage.categoryLabel")} </span><strong>{viewTemplate.category}</strong></div>
                <div><span className="text-muted-foreground">{t("whatsAppTemplatesPage.languageLabel")} </span><strong>{viewTemplate.language}</strong></div>
              </div>

              {/* WhatsApp preview */}
              <div className="bg-[#e5ddd5] rounded-lg p-4">
                <div className="bg-white rounded-lg p-3 shadow-sm max-w-xs space-y-1.5">
                  {viewTemplate.header_text && (
                    <p className="font-bold text-sm">{viewTemplate.header_text}</p>
                  )}
                  {viewTemplate.header_type && !["TEXT", "NONE", null].includes(viewTemplate.header_type) && (
                    <div className="bg-gray-100 rounded p-2 text-center text-xs text-muted-foreground">
                      {viewTemplate.header_type === "IMAGE" ? `🖼 ${t("whatsAppTemplatesPage.mediaImageCap")}` : viewTemplate.header_type === "VIDEO" ? `🎬 ${t("whatsAppTemplatesPage.mediaVideoCap")}` : `📄 ${t("whatsAppTemplatesPage.mediaDocumentCap")}`}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{viewTemplate.body_text}</p>
                  {viewTemplate.footer_text && (
                    <p className="text-xs text-gray-400 italic">{viewTemplate.footer_text}</p>
                  )}
                  {viewTemplate.buttons && viewTemplate.buttons.length > 0 && (
                    <div className="border-t pt-1.5 flex flex-wrap gap-1">
                      {viewTemplate.buttons.map((b, i) => (
                        <span key={i} className="text-xs text-blue-500 font-medium">{b.text}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {viewTemplate.rejection_reason && viewTemplate.rejection_reason !== "NONE" && (
                <p className="text-xs text-red-600 bg-red-50 rounded p-2">⚠️ {viewTemplate.rejection_reason}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTemplate(null)}>{t("whatsAppTemplatesPage.close")}</Button>
            <Button onClick={() => viewTemplate && openEdit(viewTemplate)}>
              <Pencil className="h-4 w-4 mr-1" /> {t("whatsAppTemplatesPage.editTemplate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("whatsAppTemplatesPage.editDialogTitle", { name: editTemplate?.name })}</DialogTitle>
          </DialogHeader>
          {editTemplate && (
            <div className="space-y-4 py-2">
              {/* Warning for approved templates */}
              {editTemplate.status === "APPROVED" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  {t("whatsAppTemplatesPage.editApprovedWarning")}
                </div>
              )}
              {/* Info for DRAFT templates */}
              {(!editTemplate.template_id || editTemplate.status === "DRAFT") && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  {t("whatsAppTemplatesPage.draftInfoPart1")} <strong>{t("whatsAppTemplatesPage.resubmitToMeta")}</strong> {t("whatsAppTemplatesPage.draftInfoPart2")}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">{t("whatsAppTemplatesPage.categoryLabel")}</span> <strong>{editTemplate.category}</strong></div>
                <div><span className="text-muted-foreground">{t("whatsAppTemplatesPage.languageLabel")}</span> <strong>{editTemplate.language}</strong></div>
              </div>

              {/* Header type */}
              <div className="space-y-1.5">
                <Label>{t("whatsAppTemplatesPage.headerTypeLabel")}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {HEADER_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, headerType: opt.value, headerText: "" }))}
                      className={cn(
                        "border rounded-lg p-2 text-center transition-colors text-xs",
                        editForm.headerType === opt.value
                          ? "border-primary bg-primary/5 text-primary font-semibold"
                          : "hover:bg-accent"
                      )}
                    >
                      <div className="text-base mb-0.5">{opt.icon}</div>
                      <div>{opt.label}</div>
                    </button>
                  ))}
                </div>
                {editForm.headerType === "TEXT" && (
                  <Input
                    placeholder={t("whatsAppTemplatesPage.headerTextPlaceholder")}
                    value={editForm.headerText}
                    onChange={e => setEditForm(f => ({ ...f, headerText: e.target.value }))}
                    maxLength={60}
                    className="mt-2"
                  />
                )}
                {(editForm.headerType === "IMAGE" || editForm.headerType === "VIDEO" || editForm.headerType === "DOCUMENT") && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="text-red-500 font-semibold">{t("whatsAppTemplatesPage.requiredLabel")} </span>
                      {t("whatsAppTemplatesPage.uploadSampleHintEditPart1")} <strong>{t("whatsAppTemplatesPage.sendWord")}</strong>.
                    </p>
                    <MediaUploader
                      headerType={editForm.headerType}
                      mediaId={editForm.headerMediaId}
                      preview={editForm.headerPreview}
                      uploading={editForm.headerUploading}
                      onUpload={file => uploadMediaFile(file, setEditForm)}
                      onClear={() => setEditForm(f => ({ ...f, headerMediaId: "", headerPreview: "" }))}
                    />
                    {!editForm.headerMediaId && !editForm.headerUploading && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {t("whatsAppTemplatesPage.noFileNoSave")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label>{t("whatsAppTemplatesPage.bodyLabel")} <span className="text-red-500">*</span></Label>
                <Textarea
                  ref={editBodyRef}
                  value={editForm.bodyText}
                  onChange={e => setEditForm(f => ({ ...f, bodyText: e.target.value }))}
                  rows={4}
                  maxLength={1024}
                />
                <VariableInserter
                  value={editForm.bodyText}
                  onChange={v => setEditForm(f => ({ ...f, bodyText: v }))}
                  textareaRef={editBodyRef}
                />
                <p className="text-xs text-muted-foreground text-right">{editForm.bodyText.length}/1024</p>
              </div>

              {/* Variable examples */}
              {extractVarNums(editForm.bodyText).length > 0 && (
                <div className="space-y-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-800">
                    {t("whatsAppTemplatesPage.examplesForMeta")} <span className="font-normal text-blue-600">{t("whatsAppTemplatesPage.examplesHintEdit")}</span>
                  </p>
                  {extractVarNums(editForm.bodyText).map((n, i) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="font-mono text-xs text-blue-700 w-10 shrink-0">{`{{${n}}}`}</span>
                      <Input
                        placeholder={n === 1
                          ? t("whatsAppTemplatesPage.exampleName")
                          : n === 2
                            ? t("whatsAppTemplatesPage.exampleProduct")
                            : t("whatsAppTemplatesPage.exampleValue", { n })}
                        value={editForm.variableExamples[i] || ""}
                        onChange={e => setEditForm(f => {
                          const ex = [...f.variableExamples];
                          ex[i] = e.target.value;
                          return { ...f, variableExamples: ex };
                        })}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="space-y-1.5">
                <Label>{t("whatsAppTemplatesPage.footerLabel")} <span className="text-muted-foreground text-xs">{t("whatsAppTemplatesPage.optional")}</span></Label>
                <Input
                  placeholder={t("whatsAppTemplatesPage.footerPlaceholder")}
                  value={editForm.footerText}
                  onChange={e => setEditForm(f => ({ ...f, footerText: e.target.value }))}
                  maxLength={60}
                />
              </div>

              {/* Buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("whatsAppTemplatesPage.buttonsLabel")} <span className="text-muted-foreground text-xs">{t("whatsAppTemplatesPage.max3")}</span></Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton(setEditForm)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> {t("whatsAppTemplatesPage.add")}
                  </Button>
                </div>
                {editForm.buttons.map((btn, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={btn.type} onValueChange={v => updateButton(i, "type", v, setEditForm)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUICK_REPLY">{t("whatsAppTemplatesPage.quickReply")}</SelectItem>
                        <SelectItem value="URL">URL</SelectItem>
                        <SelectItem value="PHONE_NUMBER">{t("whatsAppTemplatesPage.phone")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={t("whatsAppTemplatesPage.buttonTextPlaceholder")}
                      value={btn.text}
                      onChange={e => updateButton(i, "text", e.target.value, setEditForm)}
                      maxLength={25}
                      className="flex-1"
                    />
                    {btn.type === "URL" && (
                      <Input
                        placeholder="https://..."
                        value={btn.url || ""}
                        onChange={e => updateButton(i, "url", e.target.value, setEditForm)}
                        className="flex-1"
                      />
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                      <Input
                        placeholder="+57300..."
                        value={btn.phone_number || ""}
                        onChange={e => updateButton(i, "phone_number", e.target.value, setEditForm)}
                        className="flex-1"
                      />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeButton(i, setEditForm)} className="px-2">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {editForm.bodyText && (
                <div className="bg-[#dcf8c6] rounded-lg p-3 space-y-1 border">
                  <p className="text-xs text-muted-foreground font-medium mb-1">{t("whatsAppTemplatesPage.preview")}</p>
                  {editForm.headerText && <p className="text-sm font-bold">{editForm.headerText}</p>}
                  <p className="text-sm whitespace-pre-wrap">{editForm.bodyText}</p>
                  {editForm.footerText && <p className="text-xs text-gray-500 italic">{editForm.footerText}</p>}
                  {editForm.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-green-200 mt-1">
                      {editForm.buttons.map((b, i) => (
                        <span key={i} className="text-xs text-blue-600 font-medium">{b.text || t("whatsAppTemplatesPage.buttonFallback")}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTemplate(null)}>{t("whatsAppTemplatesPage.cancel")}</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{t("whatsAppTemplatesPage.sending")}</>
                : (!editTemplate?.template_id || editTemplate?.status === "DRAFT")
                  ? t("whatsAppTemplatesPage.resubmitToMeta")
                  : t("whatsAppTemplatesPage.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CREATE DIALOG ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("whatsAppTemplatesPage.createDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("whatsAppTemplatesPage.nameLabel")} <span className="text-red-500">*</span></Label>
                <Input
                  placeholder={t("whatsAppTemplatesPage.namePlaceholder")}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                />
                <p className="text-xs text-muted-foreground">{t("whatsAppTemplatesPage.nameHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("whatsAppTemplatesPage.languageLabelReq")} <span className="text-red-500">*</span></Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("whatsAppTemplatesPage.categoryLabelReq")} <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setForm(f => ({ ...f, category: c.value }))}
                    className={cn(
                      "border rounded-lg p-2.5 text-left transition-colors text-xs",
                      form.category === c.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    <div className="font-semibold">{c.label}</div>
                    <div className="text-muted-foreground mt-0.5 leading-tight">{c.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("whatsAppTemplatesPage.headerTypeLabel")} <span className="text-muted-foreground text-xs">{t("whatsAppTemplatesPage.optional")}</span></Label>
              <div className="grid grid-cols-4 gap-2">
                {HEADER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, headerType: opt.value, headerText: "" }))}
                    className={cn(
                      "border rounded-lg p-2 text-center transition-colors text-xs",
                      form.headerType === opt.value
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "hover:bg-accent"
                    )}
                  >
                    <div className="text-base mb-0.5">{opt.icon}</div>
                    <div>{opt.label}</div>
                  </button>
                ))}
              </div>
              {form.headerType === "TEXT" && (
                <Input
                  placeholder={t("whatsAppTemplatesPage.headerTextPlaceholder")}
                  value={form.headerText}
                  onChange={e => setForm(f => ({ ...f, headerText: e.target.value }))}
                  maxLength={60}
                  className="mt-2"
                />
              )}
              {(form.headerType === "IMAGE" || form.headerType === "VIDEO" || form.headerType === "DOCUMENT") && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-red-500 font-semibold">{t("whatsAppTemplatesPage.requiredLabel")} </span>
                    {t("whatsAppTemplatesPage.uploadSampleHintCreatePart1")} <strong>{t("whatsAppTemplatesPage.sendWord")}</strong> {t("whatsAppTemplatesPage.uploadSampleHintCreatePart2")}
                  </p>
                  <MediaUploader
                    headerType={form.headerType}
                    mediaId={form.headerMediaId}
                    preview={form.headerPreview}
                    uploading={form.headerUploading}
                    onUpload={file => uploadMediaFile(file, setForm)}
                    onClear={() => setForm(f => ({ ...f, headerMediaId: "", headerPreview: "" }))}
                  />
                  {!form.headerMediaId && !form.headerUploading && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {t("whatsAppTemplatesPage.noFileNoSend")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("whatsAppTemplatesPage.bodyLabel")} <span className="text-red-500">*</span></Label>
              <Textarea
                ref={createBodyRef}
                placeholder={t("whatsAppTemplatesPage.bodyPlaceholder", { v1: "{{1}}", v2: "{{2}}" })}
                value={form.bodyText}
                onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                rows={4}
                maxLength={1024}
              />
              <VariableInserter
                value={form.bodyText}
                onChange={v => setForm(f => ({ ...f, bodyText: v }))}
                textareaRef={createBodyRef}
              />
              <p className="text-xs text-muted-foreground text-right">{form.bodyText.length}/1024</p>
            </div>

            {/* Variable examples */}
            {extractVarNums(form.bodyText).length > 0 && (
              <div className="space-y-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-800">
                  {t("whatsAppTemplatesPage.examplesForMeta")} <span className="font-normal text-blue-600">{t("whatsAppTemplatesPage.examplesHintCreate")}</span>
                </p>
                {extractVarNums(form.bodyText).map((n, i) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-700 w-10 shrink-0">{`{{${n}}}`}</span>
                    <Input
                      placeholder={n === 1
                        ? t("whatsAppTemplatesPage.exampleName")
                        : n === 2
                          ? t("whatsAppTemplatesPage.exampleProduct")
                          : t("whatsAppTemplatesPage.exampleValue", { n })}
                      value={form.variableExamples[i] || ""}
                      onChange={e => setForm(f => {
                        const ex = [...f.variableExamples];
                        ex[i] = e.target.value;
                        return { ...f, variableExamples: ex };
                      })}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("whatsAppTemplatesPage.footerLabel")} <span className="text-muted-foreground text-xs">{t("whatsAppTemplatesPage.optional")}</span></Label>
              <Input
                placeholder={t("whatsAppTemplatesPage.footerPlaceholder")}
                value={form.footerText}
                onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))}
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("whatsAppTemplatesPage.buttonsLabel")} <span className="text-muted-foreground text-xs">{t("whatsAppTemplatesPage.max3Optional")}</span></Label>
                <Button type="button" variant="outline" size="sm" onClick={() => addButton(setForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("whatsAppTemplatesPage.add")}
                </Button>
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={btn.type} onValueChange={v => updateButton(i, "type", v, setForm)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QUICK_REPLY">{t("whatsAppTemplatesPage.quickReply")}</SelectItem>
                      <SelectItem value="URL">URL</SelectItem>
                      <SelectItem value="PHONE_NUMBER">{t("whatsAppTemplatesPage.phone")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t("whatsAppTemplatesPage.buttonTextPlaceholder")}
                    value={btn.text}
                    onChange={e => updateButton(i, "text", e.target.value, setForm)}
                    maxLength={25}
                    className="flex-1"
                  />
                  {btn.type === "URL" && (
                    <Input
                      placeholder="https://..."
                      value={btn.url || ""}
                      onChange={e => updateButton(i, "url", e.target.value, setForm)}
                      className="flex-1"
                    />
                  )}
                  {btn.type === "PHONE_NUMBER" && (
                    <Input
                      placeholder="+57300..."
                      value={btn.phone_number || ""}
                      onChange={e => updateButton(i, "phone_number", e.target.value, setForm)}
                      className="flex-1"
                    />
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removeButton(i, setForm)} className="px-2">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Preview */}
            {form.bodyText && (
              <div className="bg-[#dcf8c6] rounded-lg p-3 space-y-1 border">
                <p className="text-xs text-muted-foreground font-medium mb-1">{t("whatsAppTemplatesPage.preview")}</p>
                {form.headerText && <p className="text-sm font-bold">{form.headerText}</p>}
                <p className="text-sm whitespace-pre-wrap">{form.bodyText}</p>
                {form.footerText && <p className="text-xs text-gray-500 italic">{form.footerText}</p>}
                {form.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-green-200 mt-1">
                    {form.buttons.map((b, i) => (
                      <span key={i} className="text-xs text-blue-600 font-medium">{b.text || t("whatsAppTemplatesPage.buttonFallback")}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("whatsAppTemplatesPage.cancel")}</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{t("whatsAppTemplatesPage.sending")}</> : t("whatsAppTemplatesPage.submitForReview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DELETE ── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("whatsAppTemplatesPage.deleteDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("whatsAppTemplatesPage.deleteConfirmPart1")} <strong>{confirmDelete}</strong> {t("whatsAppTemplatesPage.deleteConfirmPart2")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t("whatsAppTemplatesPage.cancel")}</Button>
            <Button variant="destructive" onClick={() => { deleteTemplate(confirmDelete!); setConfirmDelete(null); }}>
              {t("whatsAppTemplatesPage.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

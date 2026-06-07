import { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWhatsAppInbox, WaConversation, WaMessage } from "@/hooks/useWhatsAppInbox";
import { useWhatsAppIntegration } from "@/hooks/useWhatsAppIntegration";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import type { WaTemplateButton } from "@/hooks/useWhatsAppTemplates";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Search, Plus, Send, MessageCircle, ChevronRight, ArrowLeft,
  Check, Loader2, LayoutTemplate, AlertCircle, User, Clock, ExternalLink,
  Paperclip, Mic, X, Play, Pause
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Date helpers ─────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
function fmtConvTime(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return fmtTime(iso);
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7)
    return d.toLocaleDateString("es", { weekday: "short" });
  return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}
function fmtDaySep(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}
function sameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

// ── Status icons ─────────────────────────────────────────────────────────────
function MsgStatus({ status }: { status: string }) {
  if (status === "sending") return <Loader2 className="h-3 w-3 animate-spin text-gray-400" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-400" />;
  if (status === "read")
    return (
      <span className="text-blue-500 text-[10px] font-bold leading-none">✓✓</span>
    );
  if (status === "delivered")
    return <span className="text-gray-400 text-[10px] font-bold leading-none">✓✓</span>;
  // sent
  return <Check className="h-3 w-3 text-gray-400" />;
}

// ── Conversation item ─────────────────────────────────────────────────────────
function ConvItem({
  conv, selected, onClick, onMarkUnread,
}: {
  conv: WaConversation;
  selected: boolean;
  onClick: () => void;
  onMarkUnread: () => void;
}) {
  const initials = conv.contact_name
    ? conv.contact_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : conv.phone_number.slice(-2);

  // Right-click → mark as unread (when conversation has been read)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (conv.unread_count === 0) onMarkUnread();
  };

  return (
    <button
      onClick={onClick}
      onContextMenu={handleContextMenu}
      title={conv.unread_count === 0 ? "Clic derecho para marcar como no leído" : ""}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent border-b border-border/50",
        selected && "bg-primary/5 border-l-2 border-l-primary"
      )}
    >
      {/* Avatar */}
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center shrink-0">
        {initials}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="font-medium text-sm truncate">
            {conv.contact_name || conv.phone_number}
          </p>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {fmtConvTime(conv.last_message_time)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {conv.last_direction === "outgoing" && (
              <span className="text-primary/60">Tú: </span>
            )}
            {conv.last_message}
          </p>
          {conv.unread_count > 0 && (
            <Badge className="h-4 min-w-[1rem] px-1 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Custom audio player ────────────────────────────────────────────────────────
function AudioPlayer({ src, outgoing }: { src: string; outgoing: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      setLoading(true);
      try { await a.play(); } catch (_) { /* ignored */ }
      setLoading(false);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 my-1 w-[220px]">
      {/* Hidden native element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
      />

      {/* Play / pause button */}
      <button
        onClick={toggle}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
          outgoing
            ? "bg-green-700/30 hover:bg-green-700/50"
            : "bg-primary/15 hover:bg-primary/25"
        )}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : playing
            ? <Pause className="h-4 w-4" />
            : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>

      {/* Waveform / progress + time */}
      <div className="flex-1 space-y-1">
        {/* Progress bar */}
        <div
          className="relative h-1.5 rounded-full bg-gray-300/60 cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const t = ratio * (duration || 0);
            if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t); }
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary/70 rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Times */}
        <div className="flex justify-between text-[10px] text-gray-400 leading-none">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
const MEDIA_MSG_TYPES = ["image", "audio", "voice", "video", "document", "sticker"];

function MsgBubble({
  msg, onFetchMedia,
}: {
  msg: WaMessage;
  onFetchMedia?: (id: string, mediaId: string) => void;
}) {
  const out = msg.direction === "outgoing";
  const isMedia = MEDIA_MSG_TYPES.includes(msg.message_type);
  const text = msg.message_text || (!isMedia && msg.message_type !== "text" ? `[${msg.message_type}]` : "");

  // "meta:{id}" means webhook stored the media_id but download failed; frontend can retry
  const isMetaRef = typeof msg.media_url === "string" && msg.media_url.startsWith("meta:");
  const metaMediaId = isMetaRef ? msg.media_url!.slice(5) : null;
  const realUrl = isMetaRef ? null : (msg.media_url || null);

  const LoadBtn = ({ icon, label }: { icon: string; label: string }) => (
    <button
      onClick={() => onFetchMedia && metaMediaId && onFetchMedia(msg.id, metaMediaId)}
      className="flex items-center gap-1.5 text-sm text-primary underline py-1 hover:opacity-80 transition-opacity"
    >
      {icon} {label} — toca para cargar
    </button>
  );

  const renderMedia = () => {
    if (!isMedia) return null;
    const type = msg.message_type;

    if (type === "image" || type === "sticker") {
      if (realUrl) return (
        <a href={realUrl} target="_blank" rel="noopener noreferrer">
          <img src={realUrl} alt="imagen" className="max-w-full rounded-lg max-h-64 object-contain mb-1 cursor-pointer hover:opacity-90 transition-opacity" />
        </a>
      );
      return isMetaRef
        ? <LoadBtn icon="🖼" label="Imagen" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🖼 Imagen no disponible</div>;
    }
    if (type === "video") {
      if (realUrl) return <video src={realUrl} controls className="max-w-full rounded-lg max-h-48 mb-1" />;
      return isMetaRef
        ? <LoadBtn icon="🎬" label="Video" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎬 Video no disponible</div>;
    }
    if (type === "audio" || type === "voice") {
      if (realUrl) return <AudioPlayer src={realUrl} outgoing={out} />;
      return isMetaRef
        ? <LoadBtn icon="🎤" label="Audio" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎤 Audio no disponible</div>;
    }
    if (type === "document") {
      if (realUrl) return (
        <a href={realUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm underline py-1">
          📄 Ver documento
        </a>
      );
      return isMetaRef
        ? <LoadBtn icon="📄" label="Documento" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">📄 Documento no disponible</div>;
    }
    return null;
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          out
            ? "bg-[#dcf8c6] dark:bg-green-800/50 text-gray-900 dark:text-gray-100 rounded-br-sm"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm border border-border/40"
        )}
      >
        {renderMedia()}
        {text && <p className="whitespace-pre-wrap break-words leading-snug">{text}</p>}
        <div className={cn("flex items-center gap-1 mt-1", out ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-gray-400">{fmtTime(msg.created_at)}</span>
          {out && <MsgStatus status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

// ── Template picker dialog ────────────────────────────────────────────────────
const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

// Upload a file directly to Meta's media endpoint → returns numeric media_id
async function uploadTemplateMedia(file: File, orgId?: string | null): Promise<string> {
  const base64 = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  const { data, error } = await supabase.functions.invoke("whatsapp-api", {
    body: { action: "upload_template_media", file_base64: base64, mime_type: file.type, filename: file.name, organization_id: orgId ?? null },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message);
  return data.media_id as string;
}

// Media uploader for template sending dialogs — shows drag-drop zone + preview
function MediaUploadZone({
  headerType, mediaId, onChange,
}: { headerType: string; mediaId: string; onChange: (id: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = headerType === "IMAGE" ? "image/jpeg,image/png,image/webp" : headerType === "VIDEO" ? "video/mp4,video/3gpp" : "application/pdf";
  const label = headerType === "IMAGE" ? "imagen" : headerType === "VIDEO" ? "video" : "documento";
  const maxMb = headerType === "VIDEO" ? 16 : 5;

  const handleFile = async (file: File) => {
    if (file.size > maxMb * 1024 * 1024) { toast.error(`Máximo ${maxMb}MB`); return; }
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);
    try {
      const id = await uploadTemplateMedia(file);
      onChange(id);
      toast.success("Imagen lista ✓");
    } catch (e: any) {
      setPreview("");
      onChange("");
      toast.error("Error al subir: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>
        {headerType === "IMAGE" ? "Imagen" : headerType === "VIDEO" ? "Video" : "Documento"}{" "}
        <span className="text-red-500">*</span>
      </Label>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent"
        )}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        <input ref={inputRef} type="file" accept={accept} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Subiendo...</p>
          </div>
        ) : preview && mediaId ? (
          <div className="space-y-1.5">
            {headerType === "IMAGE" ? (
              <img src={preview} alt="preview" className="max-h-28 mx-auto rounded object-contain" />
            ) : (
              <video src={preview} className="max-h-28 mx-auto rounded" controls />
            )}
            <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
              <Check className="h-3 w-3" /> Listo — haz clic para cambiar
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-2xl">{headerType === "IMAGE" ? "🖼" : headerType === "VIDEO" ? "🎬" : "📄"}</div>
            <p className="text-sm font-medium">Haz clic o arrastra tu {label} aquí</p>
            <p className="text-xs text-muted-foreground">
              {headerType === "IMAGE" ? "JPG, PNG, WebP" : headerType === "VIDEO" ? "MP4, 3GPP" : "PDF"} · máx. {maxMb}MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatePicker({
  open, onClose, onSend, sending,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (name: string, lang: string, vars: string[], mediaId: string) => void;
  sending: boolean;
}) {
  const { templates, fetchTemplates } = useWhatsAppTemplates();
  const approved = templates.filter((t) => t.status === "APPROVED");
  const [selected, setSelected] = useState<string>("");
  const [vars, setVars] = useState<string[]>([]);
  const [mediaId, setMediaId] = useState("");

  useEffect(() => { if (open) fetchTemplates(); }, [open, fetchTemplates]);

  const tpl = approved.find((t) => t.name === selected);
  const needsMedia = tpl && MEDIA_HEADER_TYPES.includes(tpl.header_type || "");
  const varNums = tpl
    ? [...new Set((tpl.body_text.match(/\{\{(\d+)\}\}/g) || []).map((m) => parseInt(m.replace(/[{}]/g, ""))))].sort((a, b) => a - b)
    : [];

  useEffect(() => { setVars(varNums.map(() => "")); setMediaId(""); }, [selected]); // eslint-disable-line

  const preview = tpl
    ? varNums.reduce((text, n, i) => text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), vars[i] || `{{${n}}}`), tpl.body_text)
    : "";

  const canSend = selected && (!needsMedia || mediaId.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Enviar plantilla</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Plantilla aprobada</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Selecciona una plantilla..." /></SelectTrigger>
              <SelectContent>
                {approved.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}{t.header_type && MEDIA_HEADER_TYPES.includes(t.header_type) ? ` 🖼` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {approved.length === 0 && <p className="text-xs text-muted-foreground">No hay plantillas aprobadas.</p>}
          </div>

          {/* Media uploader for image/video templates */}
          {needsMedia && (
            <MediaUploadZone headerType={tpl!.header_type!} mediaId={mediaId} onChange={setMediaId} />
          )}

          {tpl && varNums.length > 0 && (
            <div className="space-y-2">
              <Label>Variables</Label>
              {varNums.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{`{{${n}}}`}</span>
                  <Input
                    placeholder={`Valor para {{${n}}}`}
                    value={vars[i] || ""}
                    onChange={(e) => setVars((v) => { const nv = [...v]; nv[i] = e.target.value; return nv; })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {tpl && (
            <div className="bg-[#e5ddd5] rounded-lg p-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm text-sm space-y-1">
                {tpl.header_text && <p className="font-bold text-xs">{tpl.header_text}</p>}
                {needsMedia && (
                  <div className="bg-gray-100 rounded p-1.5 text-center text-xs text-muted-foreground">
                    {tpl.header_type === "IMAGE" ? "🖼 Imagen" : tpl.header_type === "VIDEO" ? "🎬 Video" : "📄 Documento"}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm">{preview}</p>
                {tpl.footer_text && <p className="text-xs text-gray-400 italic">{tpl.footer_text}</p>}
                {tpl.buttons && (tpl.buttons as WaTemplateButton[]).length > 0 && (
                  <div className="border-t pt-1 flex flex-wrap gap-1">
                    {(tpl.buttons as WaTemplateButton[]).map((b, i) => <span key={i} className="text-xs text-blue-500 font-medium">{b.text}</span>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canSend || sending} onClick={() => tpl && onSend(tpl.name, tpl.language, vars, mediaId)}>
            {sending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando...</> : <><Send className="h-4 w-4 mr-1" />Enviar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New conversation dialog ───────────────────────────────────────────────────
function NewConvDialog({
  open, onClose, onStart, sending,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (phone: string, templateName: string, lang: string, vars: string[], mediaId: string) => void;
  sending: boolean;
}) {
  const { templates, fetchTemplates } = useWhatsAppTemplates();
  const approved = templates.filter((t) => t.status === "APPROVED");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [vars, setVars] = useState<string[]>([]);
  const [mediaId, setMediaId] = useState("");

  useEffect(() => { if (open) fetchTemplates(); }, [open, fetchTemplates]);

  const tpl = approved.find((t) => t.name === selected);
  const needsMedia = tpl && MEDIA_HEADER_TYPES.includes(tpl.header_type || "");
  const varNums = tpl
    ? [...new Set((tpl.body_text.match(/\{\{(\d+)\}\}/g) || []).map((m) => parseInt(m.replace(/[{}]/g, ""))))].sort((a, b) => a - b)
    : [];
  useEffect(() => { setVars(varNums.map(() => "")); setMediaId(""); }, [selected]); // eslint-disable-line

  const preview = tpl
    ? varNums.reduce((text, n, i) => text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), vars[i] || `{{${n}}}`), tpl.body_text)
    : "";

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const canStart = cleanPhone && selected && (!needsMedia || mediaId.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva conversación</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Para iniciar una conversación debes enviar una plantilla aprobada por Meta.
          </p>
          <div className="space-y-1.5">
            <Label>Número de WhatsApp <span className="text-red-500">*</span></Label>
            <Input
              placeholder="ej: 573001234567 (código de país + número)"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\s\-()]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">Solo dígitos con código de país (ej: 573001234567)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Plantilla <span className="text-red-500">*</span></Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Selecciona una plantilla..." /></SelectTrigger>
              <SelectContent>
                {approved.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}{t.header_type && MEDIA_HEADER_TYPES.includes(t.header_type) ? " 🖼" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Media uploader for image/video templates */}
          {needsMedia && (
            <MediaUploadZone headerType={tpl!.header_type!} mediaId={mediaId} onChange={setMediaId} />
          )}

          {tpl && varNums.length > 0 && (
            <div className="space-y-2">
              <Label>Variables</Label>
              {varNums.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{`{{${n}}}`}</span>
                  <Input
                    placeholder={`Valor para {{${n}}}`}
                    value={vars[i] || ""}
                    onChange={(e) => setVars((v) => { const nv = [...v]; nv[i] = e.target.value; return nv; })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          {tpl && (
            <div className="bg-[#e5ddd5] rounded-lg p-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm text-sm">
                {needsMedia && (
                  <div className="bg-gray-100 rounded p-1.5 text-center text-xs text-muted-foreground mb-1">
                    {tpl.header_type === "IMAGE" ? "🖼 Imagen" : "🎬 Video"}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{preview}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canStart || sending} onClick={() => tpl && onStart(cleanPhone, tpl.name, tpl.language, vars, mediaId)}>
            {sending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando...</> : <><Send className="h-4 w-4 mr-1" />Iniciar conversación</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 24h window helper ────────────────────────────────────────────────────────
type WindowStatus = "open" | "closing" | "closed";
function getWindowStatus(messages: WaMessage[]): { status: WindowStatus; lastIncoming: Date | null } {
  const lastIncoming = messages
    .filter((m) => m.direction === "incoming")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!lastIncoming) return { status: "closed", lastIncoming: null };
  const diffH = (Date.now() - new Date(lastIncoming.created_at).getTime()) / 3_600_000;
  if (diffH < 20) return { status: "open", lastIncoming: new Date(lastIncoming.created_at) };
  if (diffH < 24) return { status: "closing", lastIncoming: new Date(lastIncoming.created_at) };
  return { status: "closed", lastIncoming: new Date(lastIncoming.created_at) };
}

function WindowBanner({
  status, lastIncoming, onTemplate,
}: { status: WindowStatus; lastIncoming: Date | null; onTemplate: () => void }) {
  if (status === "open") return null;
  const hoursLeft = lastIncoming
    ? Math.max(0, 24 - (Date.now() - lastIncoming.getTime()) / 3_600_000)
    : 0;
  if (status === "closing") {
    return (
      <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Ventana de 24h cerrando — quedan ≈{Math.round(hoursLeft)}h para enviar mensajes libres.</span>
      </div>
    );
  }
  return (
    <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="flex-1">
        <span className="font-semibold">Ventana de 24h cerrada.</span> El contacto debe escribirte primero, o envía una{" "}
        <button className="underline font-medium" onClick={onTemplate}>plantilla aprobada</button> para reanudar.
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WhatsAppInboxPage() {
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { isConnected, loading: waLoading } = useWhatsAppIntegration();
  const {
    conversations, messages, selectedPhone,
    loadingConversations, loadingMessages, sending,
    fetchConversations, selectConversation, setSelectedPhone, markAsUnread,
    sendMessage, sendMedia, fetchMedia, sendTemplate,
  } = useWhatsAppInbox();

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ── Voice recording state ──────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const selectedConv = conversations.find((c) => c.phone_number === selectedPhone);
  const { status: windowStatus, lastIncoming } = getWindowStatus(messages);
  const windowClosed = windowStatus === "closed";

  useEffect(() => {
    if (isConnected) fetchConversations();
  }, [isConnected, fetchConversations]);

  // Auto-select a conversation from ?phone=NNN in the URL (used when arriving
  // from "WhatsApp" quick action on a contact detail page).  We wait until
  // conversations have loaded so we can pick the matching one.  If no match
  // exists yet, we still seed the inbox with that phone — the user can start
  // a new conversation via a template.
  useEffect(() => {
    if (!isConnected) return;
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone");
    if (!phone) return;
    const digits = phone.replace(/[^\d]/g, "");
    // Try exact match against conversations once they've loaded
    const match = conversations.find((c) => c.phone_number.replace(/[^\d]/g, "") === digits);
    if (match) {
      selectConversation(match.phone_number);
    } else {
      // No prior conversation — pre-seed the phone so the user can send a template
      setSelectedPhone(digits);
    }
    // Strip the query so refreshes don't keep re-selecting
    const url = new URL(window.location.href);
    url.searchParams.delete("phone");
    window.history.replaceState({}, "", url.pathname + url.search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, conversations.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!draft.trim() || !selectedPhone) return;
    const text = draft.trim();
    setDraft("");
    sendMessage(selectedPhone, text, selectedConv?.contact_id);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [draft, selectedPhone, selectedConv, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Voice recording helpers ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!selectedPhone || windowClosed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Priority: audio/mp4 (Chrome 112+, Safari — Meta ✓), ogg/opus (Firefox — Meta ✓),
      // webm/opus (older Chrome — Meta may or may not accept).
      const mimeType = [
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/webm;codecs=opus",
        "audio/webm",
      ].find((m) => MediaRecorder.isTypeSupported(m)) || "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("Micrófono no disponible: " + e.message);
    }
  }, [selectedPhone, windowClosed]);

  const stopAndSendRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr || !selectedPhone) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);

    await new Promise<void>((resolve) => {
      mr.onstop = async () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (blob.size < 500) { resolve(); return; }

        try {
          const base64 = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
            reader.readAsDataURL(blob);
          });
          const baseMime = mimeType.split(";")[0].trim();
          const ext = baseMime.includes("ogg") ? "ogg"
            : baseMime.includes("mp4") ? "mp4"
            : "webm";
          const fname = `voice-${Date.now()}.${ext}`;
          await sendMedia(selectedPhone, base64, baseMime, fname, selectedConv?.contact_id);
        } catch (e: any) {
          toast.error("Error al enviar audio: " + e.message);
        }
        resolve();
      };
      mr.stop();
    });
  }, [selectedPhone, selectedConv, sendMedia]);

  const cancelRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    mr.onstop = () => { mr.stream.getTracks().forEach((t) => t.stop()); };
    try { mr.stop(); } catch (_) { /* ignore */ }
    audioChunksRef.current = [];
    setRecording(false);
    setRecSeconds(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleMediaFile = useCallback(async (file: File) => {
    if (!selectedPhone) return;
    const MAX_MB = file.type.startsWith("video/") ? 16 : 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Archivo demasiado grande (máx. ${MAX_MB}MB)`);
      return;
    }
    setUploadingMedia(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await sendMedia(selectedPhone, base64, file.type, file.name, selectedConv?.contact_id);
    } catch (e: any) {
      toast.error("Error al enviar archivo: " + e.message);
    } finally {
      setUploadingMedia(false);
    }
  }, [selectedPhone, selectedConv, sendMedia]);

  // Build date separators + messages list
  const messageItems = messages.reduce<Array<{ type: "sep"; label: string } | { type: "msg"; msg: WaMessage }>>((acc, msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameDay(prev.created_at, msg.created_at)) {
      acc.push({ type: "sep", label: fmtDaySep(msg.created_at) });
    }
    acc.push({ type: "msg", msg });
    return acc;
  }, []);

  const filteredConvs = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.phone_number.includes(q) ||
      (c.contact_name || "").toLowerCase().includes(q) ||
      (c.last_message || "").toLowerCase().includes(q)
    );
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  // ── Not connected ──────────────────────────────────────────────────────────
  if (waLoading) {
    return (
      <AppLayout>
        <AppHeader title="WhatsApp Inbox" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }
  if (!isConnected) {
    return (
      <AppLayout>
        <AppHeader title="WhatsApp Inbox" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <MessageCircle className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">WhatsApp no conectado</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Conecta tu cuenta de WhatsApp Business para ver y responder mensajes.
          </p>
          <Button onClick={() => navigate(path("/integrations"))}>
            Ir a Integraciones <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </AppLayout>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <AppHeader
        title={
          <span className="flex items-center gap-2">
            WhatsApp Inbox
            {totalUnread > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs px-1.5">
                {totalUnread}
              </Badge>
            )}
          </span>
        }
      />

      {/* Split layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: conversation list ─────────────────────────────────────── */}
        <div
          className={cn(
            "flex flex-col border-r border-border bg-background",
            "w-full md:w-80 lg:w-96 shrink-0",
            // On mobile hide list when a conversation is open
            selectedPhone ? "hidden md:flex" : "flex"
          )}
        >
          {/* Search + New */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversaciones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowNewConv(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Nueva conversación
            </Button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
                <MessageCircle className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {search ? "Sin resultados" : "Sin conversaciones"}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground">
                    Inicia una nueva conversación o espera mensajes entrantes.
                  </p>
                )}
              </div>
            ) : (
              filteredConvs.map((conv) => (
                <ConvItem
                  key={conv.phone_number}
                  conv={conv}
                  selected={conv.phone_number === selectedPhone}
                  onClick={() => selectConversation(conv.phone_number)}
                  onMarkUnread={() => markAsUnread(conv.phone_number)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: chat window ──────────────────────────────────────────── */}
        {selectedPhone && selectedConv ? (
          <div
            className={cn(
              "flex flex-col flex-1 overflow-hidden",
              "w-full md:flex"
            )}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
              {/* Mobile back button */}
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 md:hidden"
                onClick={() => setSelectedPhone(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center shrink-0">
                {selectedConv.contact_name
                  ? selectedConv.contact_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
                  : selectedConv.phone_number.slice(-2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {selectedConv.contact_name || selectedConv.phone_number}
                </p>
                {selectedConv.contact_name && (
                  <p className="text-xs text-muted-foreground">{selectedConv.phone_number}</p>
                )}
              </div>
              {/* Link to contact */}
              {selectedConv.contact_id && (
                <Link to={path(`/contacts/${selectedConv.contact_id}`)}>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ver contacto</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>

            {/* 24h window banner */}
            <WindowBanner
              status={windowStatus}
              lastIncoming={lastIncoming}
              onTemplate={() => setShowTemplatePicker(true)}
            />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f0f2f5] dark:bg-gray-900/50">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messageItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Sin mensajes aún</p>
                </div>
              ) : (
                messageItems.map((item, i) =>
                  item.type === "sep" ? (
                    <div key={`sep-${i}`} className="flex items-center justify-center py-2">
                      <span className="text-[11px] text-muted-foreground bg-white/80 dark:bg-gray-800/80 px-3 py-1 rounded-full shadow-sm">
                        {item.label}
                      </span>
                    </div>
                  ) : (
                    <MsgBubble key={item.msg.id} msg={item.msg} onFetchMedia={fetchMedia} />
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border bg-background p-3 flex gap-2 items-end shrink-0">
              {/* Hidden file input for media attachment */}
              <input
                ref={mediaInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,audio/ogg,audio/mpeg,audio/mp4,audio/aac,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleMediaFile(f);
                  e.target.value = "";
                }}
              />

              {/* Left action buttons — hidden while recording */}
              {!recording && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Enviar plantilla aprobada"
                    onClick={() => setShowTemplatePicker(true)}
                  >
                    <LayoutTemplate className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Adjuntar imagen, video, audio o documento"
                    disabled={uploadingMedia || sending || windowClosed}
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    {uploadingMedia ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}

              {/* Middle: text area OR recording indicator */}
              {recording ? (
                <div className="flex-1 flex items-center gap-3 h-9 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-sm font-medium text-red-600 dark:text-red-400 flex-1 tabular-nums">
                    Grabando — {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
                  </span>
                  <button
                    onClick={cancelRecording}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    title="Cancelar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  placeholder={
                    windowClosed
                      ? "Ventana cerrada — usa el botón 📋 para enviar una plantilla"
                      : "Escribe un mensaje..."
                  }
                  value={draft}
                  onChange={(e) => !windowClosed && setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  disabled={windowClosed}
                  className={cn(
                    "resize-none min-h-[36px] max-h-32 text-sm py-2 flex-1",
                    windowClosed && "opacity-50 cursor-not-allowed"
                  )}
                />
              )}

              {/* Right: Send (when text) | Stop+Send (when recording) | Mic (idle, no text) */}
              {!recording && draft.trim() ? (
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={sending}
                  onClick={handleSend}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              ) : recording ? (
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-green-600 hover:bg-green-700"
                  title="Enviar audio"
                  disabled={sending}
                  onClick={stopAndSendRecording}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  title="Grabar audio"
                  disabled={windowClosed || sending || uploadingMedia}
                  onClick={startRecording}
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          // Empty state when no conversation selected (desktop)
          <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center p-8 bg-[#f0f2f5] dark:bg-gray-900/20">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Selecciona una conversación para ver los mensajes, o inicia una nueva.
            </p>
            <Button onClick={() => setShowNewConv(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Nueva conversación
            </Button>
          </div>
        )}
      </div>

      {/* ── Template picker (for existing conversations) ── */}
      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        sending={sending}
        onSend={(name, lang, vars, mediaId) => {
          setShowTemplatePicker(false);
          if (selectedPhone && selectedConv) {
            sendTemplate(selectedPhone, name, lang, vars, selectedConv.contact_id, mediaId);
          }
        }}
      />

      {/* ── New conversation ── */}
      <NewConvDialog
        open={showNewConv}
        onClose={() => setShowNewConv(false)}
        sending={sending}
        onStart={(phone, name, lang, vars, mediaId) => {
          sendTemplate(phone, name, lang, vars, null, mediaId).then(() => {
            setShowNewConv(false);
            selectConversation(phone);
            fetchConversations();
          });
        }}
      />
    </AppLayout>
  );
}

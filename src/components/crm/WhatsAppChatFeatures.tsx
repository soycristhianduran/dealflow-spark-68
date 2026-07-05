/**
 * Reusable WhatsApp-specific chat features extracted so both the legacy
 * WhatsAppInboxPage and the unified ConversationsPage can share them
 * without duplication.
 *
 * Exports:
 *   - AudioPlayer        Custom audio player for incoming WA voice notes
 *   - MsgStatus          Single/double/blue checkmark indicator
 *   - MediaUploadZone    Drag-drop uploader for template media (img/video/doc)
 *   - TemplatePicker     Full dialog to pick an approved template + variables
 *   - uploadTemplateMedia  Helper that uploads a file to Meta and returns media_id
 *   - MEDIA_HEADER_TYPES   Template header types that require a media file
 *   - MEDIA_MSG_TYPES      Message types that carry a media payload
 */

import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, Loader2, AlertCircle, Send, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import type { WaTemplateButton } from "@/hooks/useWhatsAppTemplates";

export const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];
export const MEDIA_MSG_TYPES = ["image", "audio", "voice", "video", "document", "sticker"];

// ───────────────────────────── Status icons ──────────────────────────────────
// Exact WhatsApp color palette
const WA_GREY  = "#8696a0";
const WA_BLUE  = "#53bdeb";

/** Single checkmark — "sent" state */
function WaSingleTick({ color }: { color: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block align-middle">
      <path
        d="M1.5 5L5 8.5L12.5 1.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Double checkmark — "delivered" (grey) or "read" (blue) state */
function WaDoubleTick({ color }: { color: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none" className="inline-block align-middle">
      {/* left tick */}
      <path
        d="M1.5 5L5 8.5L12.5 1.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* right tick — offset +4px right */}
      <path
        d="M5.5 5L9 8.5L16.5 1.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MsgStatus({ status }: { status: string }) {
  if (status === "sending") return <Loader2 className="h-3 w-3 animate-spin" style={{ color: WA_GREY }} />;
  if (status === "failed")  return <AlertCircle className="h-3 w-3 text-red-400" />;
  if (status === "read")      return <WaDoubleTick color={WA_BLUE} />;
  if (status === "delivered") return <WaDoubleTick color={WA_GREY} />;
  // "sent" or any unknown status → single grey tick
  return <WaSingleTick color={WA_GREY} />;
}

// ───────────────────────────── Audio Player ──────────────────────────────────
export function AudioPlayer({ src, outgoing }: { src: string; outgoing: boolean }) {
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
    if (playing) a.pause();
    else {
      setLoading(true);
      try { await a.play(); } catch (_) { /* ignored */ }
      setLoading(false);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 my-1 w-[220px]">
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
      <button
        onClick={toggle}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
          outgoing ? "bg-green-700/30 hover:bg-green-700/50" : "bg-primary/15 hover:bg-primary/25",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" />
          : playing ? <Pause className="h-4 w-4" />
          : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          className="relative h-1.5 rounded-full bg-gray-300/60 cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const t = ratio * (duration || 0);
            if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t); }
          }}
        >
          <div className="absolute inset-y-0 left-0 bg-primary/70 rounded-full transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 leading-none">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Media upload helper ───────────────────────────
export async function uploadTemplateMedia(file: File, orgId?: string | null): Promise<string> {
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

// ───────────────────────────── MediaUploadZone ───────────────────────────────
export function MediaUploadZone({
  headerType, mediaId, onChange,
}: { headerType: string; mediaId: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = headerType === "IMAGE" ? "image/jpeg,image/png,image/webp"
               : headerType === "VIDEO" ? "video/mp4,video/3gpp"
               : "application/pdf";
  const label = headerType === "IMAGE" ? t("whatsAppChatFeatures.imageLower") : headerType === "VIDEO" ? t("whatsAppChatFeatures.videoLower") : t("whatsAppChatFeatures.documentLower");
  const maxMb = headerType === "VIDEO" ? 16 : 5;

  const handleFile = async (file: File) => {
    if (file.size > maxMb * 1024 * 1024) { toast.error(t("whatsAppChatFeatures.maxSize", { size: maxMb })); return; }
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);
    try {
      const id = await uploadTemplateMedia(file);
      onChange(id);
      toast.success(t("whatsAppChatFeatures.uploadDone"));
    } catch (e: any) {
      setPreview("");
      onChange("");
      toast.error(t("whatsAppChatFeatures.uploadError", { message: e.message }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{headerType === "IMAGE" ? t("whatsAppChatFeatures.image") : headerType === "VIDEO" ? t("whatsAppChatFeatures.video") : t("whatsAppChatFeatures.document")} <span className="text-red-500">*</span></Label>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent",
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
            <p className="text-xs text-muted-foreground">{t("whatsAppChatFeatures.uploading")}</p>
          </div>
        ) : preview && mediaId ? (
          <div className="space-y-1.5">
            {headerType === "IMAGE" ? (
              <img src={preview} alt="preview" className="max-h-28 mx-auto rounded object-contain" />
            ) : (
              <video src={preview} className="max-h-28 mx-auto rounded" controls />
            )}
            <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
              <Check className="h-3 w-3" /> {t("whatsAppChatFeatures.doneClickToChange")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-2xl">{headerType === "IMAGE" ? "🖼" : headerType === "VIDEO" ? "🎬" : "📄"}</div>
            <p className="text-sm font-medium">{t("whatsAppChatFeatures.clickOrDrag", { label })}</p>
            <p className="text-xs text-muted-foreground">
              {headerType === "IMAGE" ? "JPG, PNG, WebP" : headerType === "VIDEO" ? "MP4, 3GPP" : "PDF"} · máx. {maxMb}MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── TemplatePicker ────────────────────────────────
export function TemplatePicker({
  open, onClose, onSend, sending,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (name: string, lang: string, vars: string[], mediaId: string) => void;
  sending: boolean;
}) {
  const { t } = useTranslation();
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
        <DialogHeader><DialogTitle>{t("whatsAppChatFeatures.sendTemplate")}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>{t("whatsAppChatFeatures.approvedTemplate")}</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder={t("whatsAppChatFeatures.selectTemplatePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {approved.map((tpl) => (
                  <SelectItem key={tpl.name} value={tpl.name}>
                    {tpl.name}{tpl.header_type && MEDIA_HEADER_TYPES.includes(tpl.header_type) ? " 🖼" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {approved.length === 0 && <p className="text-xs text-muted-foreground">{t("whatsAppChatFeatures.noApprovedTemplates")}</p>}
          </div>

          {needsMedia && (
            <MediaUploadZone headerType={tpl!.header_type!} mediaId={mediaId} onChange={setMediaId} />
          )}

          {tpl && varNums.length > 0 && (
            <div className="space-y-2">
              <Label>{t("whatsAppChatFeatures.variables")}</Label>
              {varNums.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{`{{${n}}}`}</span>
                  <Input
                    placeholder={t("whatsAppChatFeatures.valueForVariable", { variable: `{{${n}}}` })}
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
                    {tpl.header_type === "IMAGE" ? `🖼 ${t("whatsAppChatFeatures.image")}` : tpl.header_type === "VIDEO" ? `🎬 ${t("whatsAppChatFeatures.video")}` : `📄 ${t("whatsAppChatFeatures.document")}`}
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
          <Button variant="outline" onClick={onClose}>{t("whatsAppChatFeatures.cancel")}</Button>
          <Button disabled={!canSend || sending} onClick={() => tpl && onSend(tpl.name, tpl.language, vars, mediaId)}>
            {sending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{t("whatsAppChatFeatures.sending")}</> : <><Send className="h-4 w-4 mr-1" />{t("whatsAppChatFeatures.send")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

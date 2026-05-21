/**
 * WhatsAppConversationPanel — the full WhatsApp chat experience for one
 * phone, reusable across:
 *   - The standalone /whatsapp/inbox page (right-hand chat pane)
 *   - The inline "WhatsApp" tab inside ContactDetailPage
 *
 * Feature parity:
 *   - Message thread with date separators + media bubbles (image / video /
 *     audio / voice / document / sticker), tap-to-load for not-yet-fetched
 *     media, message status ticks
 *   - 24h Meta messaging window banner (open / closing / closed) with
 *     "Send template" CTA
 *   - Composer with text area, attach file (image/video/audio/PDF), voice
 *     recording (auto-picks best MIME for the browser), send + cancel
 *   - Template picker dialog (with media upload + variable substitution)
 *
 * The hook (`useWhatsAppInbox`) is consumed INSIDE this component so callers
 * don't have to wire up its state. Pass `phone` + optional `contactId` and
 * the panel handles selection.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Send, LayoutTemplate, Paperclip, Mic, X, Loader2, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useWhatsAppInbox, type WaMessage } from "@/hooks/useWhatsAppInbox";
import { MsgBubble } from "./MsgBubble";
import { WindowBanner } from "./WindowBanner";
import { TemplatePicker } from "./TemplatePicker";
import { getWindowStatus, fmtDaySep, sameDay } from "./helpers";

interface Props {
  /** Phone with country code, digits only (e.g. "573001234567") */
  phone: string;
  /** UUID of the linked contact (so outgoing messages get attached) */
  contactId?: string | null;
  /** Optional fixed height. Default: fill available space. */
  heightClass?: string;
  /** Optional header content rendered above the banner */
  header?: React.ReactNode;
}

export function WhatsAppConversationPanel({
  phone,
  contactId = null,
  heightClass = "h-[600px]",
  header,
}: Props) {
  const {
    messages,
    selectedPhone,
    setSelectedPhone,
    selectConversation,
    loadingMessages,
    sending,
    sendMessage,
    sendMedia,
    fetchMedia,
    sendTemplate,
  } = useWhatsAppInbox();

  // Local UI state
  const [draft, setDraft] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const { status: windowStatus, lastIncoming } = getWindowStatus(messages);
  const windowClosed = windowStatus === "closed";

  const phoneDigits = phone.replace(/[^\d]/g, "");

  // Sync hook's selected phone with our prop. Must use `selectConversation`
  // (not `setSelectedPhone`) because the former also fires `fetchMessages`
  // for the picked phone — otherwise the panel would render with an empty
  // thread until the user manually refreshed.
  useEffect(() => {
    if (phoneDigits && phoneDigits !== selectedPhone) {
      selectConversation(phoneDigits);
    }
    return () => {
      // On unmount, clear the hook's selection so the standalone inbox
      // doesn't open stuck on this phone next time.
      setSelectedPhone(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneDigits]);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Send text ───────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!draft.trim() || windowClosed) return;
    const text = draft.trim();
    setDraft("");
    sendMessage(phoneDigits, text, contactId);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [draft, windowClosed, phoneDigits, contactId, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Voice recording ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (windowClosed) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Priority: audio/mp4 (Chrome 112+, Safari — Meta ✓), ogg/opus (Firefox — Meta ✓),
      // webm/opus (older Chrome — Meta may or may not accept).
      const mimeType =
        ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"]
          .find((m) => MediaRecorder.isTypeSupported(m)) || "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("Micrófono no disponible: " + e.message);
    }
  }, [windowClosed]);

  const stopAndSendRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
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
          const ext = baseMime.includes("ogg") ? "ogg" : baseMime.includes("mp4") ? "mp4" : "webm";
          const fname = `voice-${Date.now()}.${ext}`;
          await sendMedia(phoneDigits, base64, baseMime, fname, contactId);
        } catch (e: any) {
          toast.error("Error al enviar audio: " + e.message);
        }
        resolve();
      };
      mr.stop();
    });
  }, [phoneDigits, contactId, sendMedia]);

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

  // ── Media attachment ────────────────────────────────────────────────────
  const handleMediaFile = useCallback(
    async (file: File) => {
      if (!phoneDigits) return;
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
        await sendMedia(phoneDigits, base64, file.type, file.name, contactId);
      } catch (e: any) {
        toast.error("Error al enviar archivo: " + e.message);
      } finally {
        setUploadingMedia(false);
      }
    },
    [phoneDigits, contactId, sendMedia],
  );

  // ── Build interleaved date-separator + message list ──────────────────────
  const messageItems = messages.reduce<
    Array<{ type: "sep"; label: string } | { type: "msg"; msg: WaMessage }>
  >((acc, msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameDay(prev.created_at, msg.created_at)) {
      acc.push({ type: "sep", label: fmtDaySep(msg.created_at) });
    }
    acc.push({ type: "msg", msg });
    return acc;
  }, []);

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border bg-background", heightClass)}>
      {header}

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
            <p className="text-xs text-muted-foreground">
              {windowClosed
                ? "Envía una plantilla para iniciar la conversación"
                : "Escribe el primer mensaje abajo"}
            </p>
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
            ),
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background p-3 flex gap-2 items-end shrink-0">
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
              Grabando — {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:
              {String(recSeconds % 60).padStart(2, "0")}
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
              windowClosed && "opacity-50 cursor-not-allowed",
            )}
          />
        )}

        {/* Right: Send (when text) | Stop+Send (when recording) | Mic (idle, no text) */}
        {!recording && draft.trim() ? (
          <Button size="icon" className="h-9 w-9 shrink-0" disabled={sending} onClick={handleSend}>
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

      {/* Template picker */}
      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        sending={sending}
        onSend={(name, lang, vars, mediaId) => {
          setShowTemplatePicker(false);
          sendTemplate(phoneDigits, name, lang, vars, contactId, mediaId);
        }}
      />
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { WaMessage } from "@/hooks/useWhatsAppInbox";
import { AudioPlayer } from "./AudioPlayer";
import { MsgStatus } from "./MsgStatus";
import { MEDIA_MSG_TYPES, fmtTime } from "./helpers";

/**
 * A single WhatsApp message bubble — handles text, image, video, audio,
 * voice, document, and sticker. For media that wasn't downloaded by the
 * webhook (`media_url = "meta:<id>"`), shows a "tap to load" button that
 * triggers the on-demand fetch via `onFetchMedia`.
 */
export function MsgBubble({
  msg,
  onFetchMedia,
}: {
  msg: WaMessage;
  onFetchMedia?: (id: string, mediaId: string) => void;
}) {
  const out = msg.direction === "outgoing";
  const isMedia = MEDIA_MSG_TYPES.includes(msg.message_type);
  const text =
    msg.message_text ||
    (!isMedia && msg.message_type !== "text" ? `[${msg.message_type}]` : "");

  // "meta:{id}" means webhook stored the media_id but download failed — frontend can retry
  const isMetaRef =
    typeof msg.media_url === "string" && msg.media_url.startsWith("meta:");
  const metaMediaId = isMetaRef ? msg.media_url!.slice(5) : null;
  const realUrl = isMetaRef ? null : (msg.media_url || null);

  const LoadBtn = ({ icon, label }: { icon: string; label: string }) => (
    <button
      onClick={() =>
        onFetchMedia && metaMediaId && onFetchMedia(msg.id, metaMediaId)
      }
      className="flex items-center gap-1.5 text-sm text-primary underline py-1 hover:opacity-80 transition-opacity"
    >
      {icon} {label} — toca para cargar
    </button>
  );

  const renderMedia = () => {
    if (!isMedia) return null;
    const type = msg.message_type;

    if (type === "image" || type === "sticker") {
      if (realUrl) {
        return (
          <a href={realUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={realUrl}
              alt="imagen"
              className="max-w-full rounded-lg max-h-64 object-contain mb-1 cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
        );
      }
      return isMetaRef ? (
        <LoadBtn icon="🖼" label="Imagen" />
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">
          🖼 Imagen no disponible
        </div>
      );
    }
    if (type === "video") {
      if (realUrl) {
        return (
          <video
            src={realUrl}
            controls
            className="max-w-full rounded-lg max-h-48 mb-1"
          />
        );
      }
      return isMetaRef ? (
        <LoadBtn icon="🎬" label="Video" />
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">
          🎬 Video no disponible
        </div>
      );
    }
    if (type === "audio" || type === "voice") {
      if (realUrl) return <AudioPlayer src={realUrl} outgoing={out} />;
      return isMetaRef ? (
        <LoadBtn icon="🎤" label="Audio" />
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">
          🎤 Audio no disponible
        </div>
      );
    }
    if (type === "document") {
      if (realUrl) {
        return (
          <a
            href={realUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm underline py-1"
          >
            📄 Ver documento
          </a>
        );
      }
      return isMetaRef ? (
        <LoadBtn icon="📄" label="Documento" />
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">
          📄 Documento no disponible
        </div>
      );
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
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm border border-border/40",
        )}
      >
        {renderMedia()}
        {text && (
          <p className="whitespace-pre-wrap break-words leading-snug">{text}</p>
        )}
        <div
          className={cn(
            "flex items-center gap-1 mt-1",
            out ? "justify-end" : "justify-start",
          )}
        >
          <span className="text-[10px] text-gray-400">
            {fmtTime(msg.created_at)}
          </span>
          {out && <MsgStatus status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

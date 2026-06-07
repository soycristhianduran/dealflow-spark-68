/**
 * Shared helpers for the WhatsApp conversation UI.
 *
 * Lives here so both the standalone inbox page and the embedded
 * ContactWhatsAppThread can use identical formatting / window-status
 * logic without duplicating code.
 */

import { supabase } from "@/integrations/supabase/client";
import type { WaMessage } from "@/hooks/useWhatsAppInbox";

// ── Message-type constants ────────────────────────────────────────────────
export const MEDIA_MSG_TYPES = [
  "image", "audio", "voice", "video", "document", "sticker",
];

export const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

// ── Date formatters ───────────────────────────────────────────────────────
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDaySep(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

export function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// ── 24-hour window status ─────────────────────────────────────────────────
// WhatsApp Business API: outside the 24h window since the contact's last
// incoming message, you can only send pre-approved templates — free-form
// messages are rejected by Meta.
export type WindowStatus = "open" | "closing" | "closed";

export function getWindowStatus(
  messages: WaMessage[],
): { status: WindowStatus; lastIncoming: Date | null } {
  const lastIncoming = messages
    .filter((m) => m.direction === "incoming")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

  if (!lastIncoming) {
    return { status: "closed", lastIncoming: null };
  }

  const diffH =
    (Date.now() - new Date(lastIncoming.created_at).getTime()) / 3_600_000;

  if (diffH < 20) return { status: "open", lastIncoming: new Date(lastIncoming.created_at) };
  if (diffH < 24) return { status: "closing", lastIncoming: new Date(lastIncoming.created_at) };
  return { status: "closed", lastIncoming: new Date(lastIncoming.created_at) };
}

// ── Upload file directly to Meta's media endpoint (for templates) ─────────
// Used by template-sending dialogs to attach images/video/PDF as the
// template header. Returns the numeric media_id Meta needs in the
// template send payload.
export async function uploadTemplateMedia(file: File, orgId?: string | null): Promise<string> {
  const base64 = await new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  const { data, error } = await supabase.functions.invoke("whatsapp-api", {
    body: {
      action: "upload_template_media",
      file_base64: base64,
      mime_type: file.type,
      filename: file.name,
      organization_id: orgId ?? null,
    },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message);
  return data.media_id as string;
}

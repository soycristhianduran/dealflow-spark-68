/**
 * ContactWhatsAppThread — embedded WhatsApp conversation for a single contact.
 *
 * Used inside ContactDetailPage's "WhatsApp" tab so the user never has to
 * leave the lead's page to chat with them.
 *
 * Reuses `useWhatsAppInbox` for the messaging logic (load, send, realtime),
 * but renders only the message thread + composer — no conversation sidebar
 * (we already know which contact we're looking at).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Phone as PhoneIcon } from "lucide-react";
import { useWhatsAppInbox, type WaMessage } from "@/hooks/useWhatsAppInbox";

interface Props {
  /** Raw phone (with country code) — same value stored in contacts.primary_phone */
  phone: string;
  /** UUID of the contact, so outgoing messages can be linked back to them */
  contactId: string;
  /** Display name to show in the header */
  contactName?: string | null;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDateBreak(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

export function ContactWhatsAppThread({ phone, contactId, contactName }: Props) {
  const {
    messages,
    setSelectedPhone,
    sendMessage,
    sending,
    loadingMessages,
  } = useWhatsAppInbox();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Normalize phone (digits only) — the inbox hook keys by digits-only string
  const phoneDigits = phone.replace(/[^\d]/g, "");

  // Activate this conversation in the hook on mount / when phone changes
  useEffect(() => {
    if (phoneDigits) setSelectedPhone(phoneDigits);
    return () => {
      // Clean up on unmount so navigating away doesn't leave the hook stuck
      // on this phone if the user opens the standalone /whatsapp/inbox later.
      setSelectedPhone(null);
    };
  }, [phoneDigits, setSelectedPhone]);

  // Auto-scroll to the latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Group consecutive messages from the same day so we can show a date break
  const groupedByDay = (() => {
    const groups: Array<{ date: string; items: WaMessage[] }> = [];
    for (const msg of messages) {
      const dayKey = msg.created_at.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.date === dayKey) {
        last.items.push(msg);
      } else {
        groups.push({ date: dayKey, items: [msg] });
      }
    }
    return groups;
  })();

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    await sendMessage(phoneDigits, text, contactId);
  }

  return (
    <div className="flex flex-col h-[520px] rounded-lg border bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 shrink-0">
        <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {contactName || phone}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <PhoneIcon className="h-3 w-3" /> {phone}
          </p>
        </div>
      </div>

      {/* Messages thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-muted/10">
        {loadingMessages && messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">Cargando mensajes...</p>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Aún no hay mensajes con este contacto</p>
            <p className="text-xs text-muted-foreground mt-1">Envía el primer mensaje desde el cuadro de abajo</p>
          </div>
        ) : (
          groupedByDay.map((group) => (
            <div key={group.date} className="space-y-2">
              <div className="flex items-center justify-center">
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {formatDateBreak(group.date + "T12:00:00")}
                </Badge>
              </div>
              {group.items.map((msg) => {
                const outgoing = msg.direction === "outgoing";
                const failed = msg.status === "failed";
                const sendingState = msg.status === "sending";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        outgoing
                          ? "bg-emerald-600 text-white rounded-br-sm"
                          : "bg-card border rounded-bl-sm",
                        failed ? "bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 border border-red-300" : "",
                      ].join(" ")}
                    >
                      {msg.message_text ? (
                        <p className="whitespace-pre-wrap break-words leading-snug">
                          {msg.message_text}
                        </p>
                      ) : (
                        <p className="italic opacity-70 text-xs">
                          [{msg.message_type}] {msg.media_url ? "ver media" : "media"}
                        </p>
                      )}
                      <div
                        className={[
                          "flex items-center justify-end gap-1 mt-0.5 text-[10px]",
                          outgoing ? "text-emerald-100" : "text-muted-foreground",
                          failed ? "text-red-700 dark:text-red-300" : "",
                        ].join(" ")}
                      >
                        <span>{formatTime(msg.created_at)}</span>
                        {outgoing && !failed && (
                          <span>
                            {sendingState ? "⏳" : msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                          </span>
                        )}
                        {failed && <span title="Falló el envío">⚠️</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t bg-background p-2 shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="resize-none min-h-[40px] max-h-32"
          />
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Enter para enviar · Shift+Enter para salto de línea
        </p>
      </div>
    </div>
  );
}

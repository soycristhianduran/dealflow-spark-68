/**
 * ContactSocialThread — embedded Instagram/Messenger conversation for the
 * contact detail page, mirroring ContactWhatsAppThread. Loads the linked
 * conversation's messages with realtime updates and a text composer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { InstagramIcon, MessengerIcon } from "@/components/icons/BrandIcons";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  direction: "incoming" | "outgoing";
  message_type: string;
  message_text: string | null;
  attachment_url: string | null;
  sent_at: string;
}

export function ContactSocialThread({ channel, conversationId, contactName }: {
  channel: "ig" | "ms";
  conversationId: string;
  contactName?: string | null;
}) {
  const { t } = useTranslation();
  const ig = useInstagramIntegration();
  const isIg = channel === "ig";
  const msgTable = isIg ? "instagram_messages" : "messenger_messages";
  const [messages, setMessages] = useState<Msg[]>([]);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from(msgTable)
      .select("id, direction, message_type, message_text, attachment_url, sent_at")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(500);
    setMessages(((data || []) as Msg[]).reverse());
    setLoading(false);
  }, [msgTable, conversationId]);

  useEffect(() => {
    load();
    if (isIg) {
      supabase.from("instagram_conversations").select("participant_id").eq("id", conversationId)
        .maybeSingle().then(({ data }) => setParticipantId(data?.participant_id ?? null));
    }
    const ch = supabase
      .channel(`contact-social-${conversationId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: msgTable, filter: `conversation_id=eq.${conversationId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, msgTable, isIg, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    try {
      if (isIg) {
        if (!participantId) throw new Error(t("contactSocialThread.noParticipant"));
        await ig.sendDm({ recipient_id: participantId, text, conversation_id: conversationId });
      } else {
        const { data, error } = await supabase.functions.invoke("facebook-api", {
          body: { action: "messenger_send", conversation_id: conversationId, text },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
      }
      await load();
    } catch (e: any) {
      toast.error(t("contactSocialThread.sendError") + e.message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2 shrink-0">
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center",
          isIg ? "bg-pink-100 dark:bg-pink-900/40" : "bg-blue-100 dark:bg-blue-900/40")}>
          {isIg ? <InstagramIcon size={16} /> : <MessengerIcon size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactName || (isIg ? "Instagram" : "Messenger")}</p>
          <p className="text-xs text-muted-foreground">{isIg ? "Instagram Direct" : "Messenger"}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">{t("contactSocialThread.empty")}</p>
        ) : messages.map((m) => {
          const out = m.direction === "outgoing";
          return (
            <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                out
                  ? isIg ? "bg-pink-500 text-white" : "bg-[#007FFF] text-white"
                  : "bg-background border")}>
                {m.attachment_url && (
                  m.message_type === "image" ? (
                    <img src={m.attachment_url} alt="" className="rounded-lg max-h-48 mb-1" loading="lazy" />
                  ) : m.message_type === "audio" || m.message_type === "voice" ? (
                    <audio controls src={m.attachment_url} className="max-w-full mb-1" />
                  ) : m.message_type === "video" ? (
                    <video controls src={m.attachment_url} className="rounded-lg max-h-48 mb-1" />
                  ) : (
                    <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline text-xs">
                      📎 {t("contactSocialThread.attachment")}
                    </a>
                  )
                )}
                {m.message_text && <p className="whitespace-pre-wrap break-words">{m.message_text}</p>}
                <p className={cn("text-[10px] mt-0.5", out ? "text-white/70" : "text-muted-foreground")}>
                  {new Date(m.sent_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer (text — full media composer lives in the Conversations inbox) */}
      <div className="p-3 border-t flex items-center gap-2 shrink-0">
        <Input
          className="flex-1 min-w-0"
          placeholder={t("contactSocialThread.placeholder", { channel: isIg ? "Instagram" : "Messenger" })}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={sending}
        />
        <Button
          onClick={send}
          disabled={sending || !draft.trim()}
          className={cn("h-10 shrink-0",
            isIg ? "bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600"
                 : "bg-[#007FFF] hover:bg-[#0066CC]")}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

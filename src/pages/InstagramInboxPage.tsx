import { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Instagram, Send, Loader2, MessageCircle, Search,
  RefreshCw, Wifi, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface IgConversation {
  id: string;
  participant_id: string;
  participant_username: string | null;
  participant_name: string | null;
  participant_profile_pic: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
}

interface IgMessage {
  id: string;
  ig_message_id: string | null;
  direction: "incoming" | "outgoing";
  message_type: string;
  message_text: string | null;
  attachment_url: string | null;
  sender_id: string | null;
  status: string;
  sent_at: string;
}

export default function InstagramInboxPage() {
  const { user } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const ig = useInstagramIntegration();

  const [conversations, setConversations] = useState<IgConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<IgConversation | null>(null);
  const [messages, setMessages] = useState<IgMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ---- Load conversations -----------------------------------------------
  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConvs(true);
    const { data, error } = await supabase
      .from("instagram_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });
    if (error) {
      console.error("loadConversations:", error);
    } else {
      setConversations((data || []) as IgConversation[]);
    }
    setLoadingConvs(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ---- Load messages for selected conversation --------------------------
  const loadMessages = useCallback(async (conv: IgConversation) => {
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from("instagram_messages")
      .select("id, ig_message_id, direction, message_type, message_text, attachment_url, sender_id, status, sent_at")
      .eq("conversation_id", conv.id)
      .order("sent_at", { ascending: true });
    if (error) console.error("loadMessages:", error);
    setMessages((data || []) as IgMessage[]);
    setLoadingMsgs(false);

    // Mark as read (zero out unread_count)
    if (conv.unread_count > 0) {
      await supabase
        .from("instagram_conversations")
        .update({ unread_count: 0 })
        .eq("id", conv.id);
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)),
      );
    }
  }, []);

  // Manual "mark as unread" for IG conversations
  const markAsUnread = useCallback(async (convId: string) => {
    try {
      await supabase.rpc("ig_mark_conversation_unread", { p_conversation_id: convId });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: Math.max(1, c.unread_count) } : c)),
      );
      if (selectedConv?.id === convId) setSelectedConv(null);
    } catch (e: any) {
      toast.error("Error al marcar como no leído: " + e.message);
    }
  }, [selectedConv]);

  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv);
    else setMessages([]);
  }, [selectedConv, loadMessages]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Realtime subscription to new messages ----------------------------
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ig-inbox-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "instagram_messages",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newMsg = payload.new as IgMessage & { conversation_id: string };
          if (selectedConv && newMsg.conversation_id === selectedConv.id) {
            setMessages((prev) => [...prev, newMsg]);
          }
          // Refresh conversation list to update last_message_preview & unread_count
          loadConversations();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedConv, loadConversations]);

  // ---- Send a DM ---------------------------------------------------------
  const handleSend = async () => {
    if (!selectedConv || !draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await ig.sendDm({
        recipient_id: selectedConv.participant_id,
        text,
        conversation_id: selectedConv.id,
      });
      // Reload to show the outgoing message
      await loadMessages(selectedConv);
      await loadConversations();
    } catch (e: any) {
      toast.error("Error al enviar: " + e.message);
      setDraft(text); // restore so user doesn't lose it
    } finally {
      setSending(false);
    }
  };

  // ---- Filter conversations by search -----------------------------------
  const filteredConvs = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.participant_username || "").toLowerCase().includes(q) ||
      (c.participant_name || "").toLowerCase().includes(q) ||
      (c.last_message_preview || "").toLowerCase().includes(q)
    );
  });

  // ===== Not connected state ==============================================
  if (!ig.loading && !ig.isConnected) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-500/10">
                <Instagram className="h-8 w-8 text-pink-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold">Conecta Instagram</h2>
            <p className="text-sm text-muted-foreground">
              Aún no has conectado tu cuenta de Instagram. Ve a Integraciones para vincular tu cuenta y empezar a recibir DMs.
            </p>
            <Button onClick={() => navigate(path("/integrations"))} className="gap-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
              <Instagram className="h-4 w-4" /> Ir a Integraciones
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ===== Main view =========================================================
  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* ===== Conversation list ===== */}
        <aside className="w-80 border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-orange-500">
                <Instagram className="h-4 w-4 text-white" />
              </div>
              <h1 className="font-semibold text-sm">Instagram Inbox</h1>
              <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0" onClick={loadConversations}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {search ? "Sin resultados" : "No hay conversaciones todavía"}
                </p>
              </div>
            ) : (
              <div>
                {filteredConvs.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full flex items-start gap-3 p-3 text-left border-b transition-colors hover:bg-muted/50 ${
                      selectedConv?.id === conv.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedConv(conv)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (conv.unread_count === 0) markAsUnread(conv.id);
                    }}
                    title={conv.unread_count === 0 ? "Clic derecho para marcar como no leído" : ""}
                  >
                    {conv.participant_profile_pic ? (
                      <img src={conv.participant_profile_pic} alt="" className="h-10 w-10 rounded-full shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-semibold">
                          {(conv.participant_username || conv.participant_id || "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">
                          {conv.participant_username || conv.participant_name || conv.participant_id}
                        </p>
                        {conv.unread_count > 0 && (
                          <span className="ml-auto text-[10px] bg-pink-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.last_message_preview || "(sin mensajes)"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* ===== Chat view ===== */}
        <main className="flex-1 flex flex-col">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Selecciona una conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b p-4 flex items-center gap-3">
                {selectedConv.participant_profile_pic ? (
                  <img src={selectedConv.participant_profile_pic} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center">
                    <Instagram className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {selectedConv.participant_username || selectedConv.participant_id}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedConv.participant_name || "Instagram DM"}</p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMsgs ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No hay mensajes en esta conversación</div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const out = msg.direction === "outgoing";
                      return (
                        <div key={msg.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              out ? "bg-pink-500 text-white" : "bg-muted"
                            }`}
                          >
                            {msg.attachment_url && (
                              msg.message_type === "image" ? (
                                <img src={msg.attachment_url} alt="" className="rounded mb-1 max-h-60" />
                              ) : (
                                <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block text-xs underline mb-1">
                                  Ver adjunto
                                </a>
                              )
                            )}
                            {msg.message_text && (
                              <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                            )}
                            <p className={`text-[10px] mt-1 ${out ? "text-white/70" : "text-muted-foreground"}`}>
                              {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true, locale: es })}
                              {out && msg.status && ` · ${msg.status}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="border-t p-3 flex gap-2">
                <Input
                  placeholder="Escribe un mensaje..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={!draft.trim() || sending} className="gap-1 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

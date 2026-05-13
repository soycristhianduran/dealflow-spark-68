import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { useWhatsAppInbox } from "@/hooks/useWhatsAppInbox";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Send, Loader2, RefreshCw,
  ExternalLink, MoreVertical, MailOpen, MessageCircle,
} from "lucide-react";
import { WhatsAppIcon, InstagramIcon } from "@/components/icons/BrandIcons";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Channel = "whatsapp" | "instagram";
type FilterMode = "all" | Channel;

interface UnifiedConversation {
  channel: Channel;
  id: string;                     // phone for WA, conv UUID for IG
  contact_id: string | null;
  display_name: string;
  subtitle: string;               // phone/username
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  last_direction: "incoming" | "outgoing";
  unread_count: number;
}

interface UnifiedMessage {
  channel: Channel;
  id: string;
  direction: "incoming" | "outgoing";
  text: string;
  attachment_url?: string | null;
  message_type: string;
  status: string;
  sent_at: string;
}

interface IgConvRow {
  id: string;
  contact_id: string | null;
  participant_id: string;
  participant_username: string | null;
  participant_name: string | null;
  participant_profile_pic: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
}

interface IgMessageRow {
  id: string;
  ig_message_id: string | null;
  direction: "incoming" | "outgoing";
  message_type: string;
  message_text: string | null;
  attachment_url: string | null;
  status: string;
  sent_at: string;
}

export default function ConversationsPage() {
  const { user } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const wa = useWhatsAppInbox();
  const ig = useInstagramIntegration();

  const [channelFilter, setChannelFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedConversation | null>(null);
  const [igConversations, setIgConversations] = useState<IgConvRow[]>([]);
  const [igMessages, setIgMessages] = useState<IgMessageRow[]>([]);
  const [loadingIg, setLoadingIg] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load IG conversations from DB ─────────────────────────────────────────
  const loadIgConversations = useCallback(async () => {
    if (!user) return;
    setLoadingIg(true);
    const { data } = await supabase
      .from("instagram_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });
    setIgConversations((data || []) as IgConvRow[]);
    setLoadingIg(false);
  }, [user]);

  useEffect(() => { loadIgConversations(); }, [loadIgConversations]);

  // ── Initial WA fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    wa.fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: keep both inboxes live ──────────────────────────────────────
  useRealtimeRefresh({
    table: "whatsapp_messages",
    channelKey: `conv-page-wa-${user?.id || "anon"}`,
    onChange: () => wa.fetchConversations(),
    enabled: !!user,
  });
  useRealtimeRefresh({
    table: "instagram_conversations",
    filter: user ? `user_id=eq.${user.id}` : undefined,
    channelKey: `conv-page-ig-${user?.id || "anon"}`,
    onChange: loadIgConversations,
    enabled: !!user,
  });

  // ── Merge both into a unified list ───────────────────────────────────────
  const unifiedList = useMemo<UnifiedConversation[]>(() => {
    const waList: UnifiedConversation[] = wa.conversations.map((c) => ({
      channel: "whatsapp",
      id: c.phone_number,
      contact_id: c.contact_id,
      display_name: c.contact_name || c.phone_number,
      subtitle: c.phone_number,
      avatar_url: null,
      last_message: c.last_message,
      last_message_time: c.last_message_time,
      last_direction: c.last_direction,
      unread_count: c.unread_count,
    }));
    const igList: UnifiedConversation[] = igConversations.map((c) => ({
      channel: "instagram",
      id: c.id,
      contact_id: c.contact_id,
      display_name: c.participant_username || c.participant_name || c.participant_id,
      subtitle: c.participant_username ? `@${c.participant_username}` : c.participant_id,
      avatar_url: c.participant_profile_pic,
      last_message: c.last_message_preview || "",
      last_message_time: c.last_message_at,
      last_direction: "incoming",
      unread_count: c.unread_count,
    }));
    return [...waList, ...igList].sort(
      (a, b) =>
        new Date(b.last_message_time).getTime() -
        new Date(a.last_message_time).getTime(),
    );
  }, [wa.conversations, igConversations]);

  // ── Apply filters (channel + search) ──────────────────────────────────────
  const filtered = useMemo(() => {
    return unifiedList.filter((c) => {
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.display_name.toLowerCase().includes(q) ||
          c.subtitle.toLowerCase().includes(q) ||
          (c.last_message || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedList, channelFilter, search]);

  // Counters for the tab labels
  const counts = useMemo(() => {
    const total = unifiedList.length;
    const wa = unifiedList.filter((c) => c.channel === "whatsapp").length;
    const ig = unifiedList.filter((c) => c.channel === "instagram").length;
    return { total, wa, ig };
  }, [unifiedList]);

  // ── When user selects a conversation, fetch its messages ──────────────────
  const handleSelect = useCallback((conv: UnifiedConversation) => {
    setSelected(conv);
    if (conv.channel === "whatsapp") {
      wa.selectConversation(conv.id);
    } else {
      // Load IG messages
      (async () => {
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", conv.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
        // Mark IG conversation as read
        if (conv.unread_count > 0) {
          await supabase
            .from("instagram_conversations")
            .update({ unread_count: 0 })
            .eq("id", conv.id);
        }
      })();
    }
  }, [wa]);

  // ── Mark as unread (right-click) ──────────────────────────────────────────
  const handleMarkUnread = useCallback(async (conv: UnifiedConversation) => {
    if (conv.unread_count > 0) return; // only flips if already read
    if (conv.channel === "whatsapp") {
      await wa.markAsUnread(conv.id);
    } else {
      await supabase.rpc("ig_mark_conversation_unread", { p_conversation_id: conv.id });
      loadIgConversations();
    }
    if (selected?.channel === conv.channel && selected?.id === conv.id) {
      setSelected(null);
    }
  }, [wa, selected, loadIgConversations]);

  // ── Active message list (whichever channel is selected) ───────────────────
  const activeMessages: UnifiedMessage[] = useMemo(() => {
    if (!selected) return [];
    if (selected.channel === "whatsapp") {
      return wa.messages.map((m) => ({
        channel: "whatsapp" as const,
        id: m.id,
        direction: m.direction,
        text: m.message_text || "",
        attachment_url: m.media_url || null,
        message_type: m.message_type,
        status: m.status,
        sent_at: m.created_at,
      }));
    }
    return igMessages.map((m) => ({
      channel: "instagram" as const,
      id: m.id,
      direction: m.direction,
      text: m.message_text || "",
      attachment_url: m.attachment_url || null,
      message_type: m.message_type,
      status: m.status,
      sent_at: m.sent_at,
    }));
  }, [selected, wa.messages, igMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  // ── Send a message (channel-aware) ────────────────────────────────────────
  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      if (selected.channel === "whatsapp") {
        await wa.sendMessage(selected.id, text, selected.contact_id);
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error("Conversación no encontrada");
        await ig.sendDm({
          recipient_id: igConv.participant_id,
          text,
          conversation_id: igConv.id,
        });
        // Reload IG messages for this conversation
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", selected.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
      }
    } catch (e: any) {
      toast.error("Error al enviar: " + e.message);
      setDraft(text); // restore
    } finally {
      setSending(false);
    }
  };

  const handleOpenFullView = () => {
    if (!selected) return;
    if (selected.channel === "whatsapp") {
      navigate(path("/whatsapp/inbox"));
    } else {
      navigate(path("/instagram/inbox"));
    }
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* ===== Left pane: list ===== */}
        <aside className="w-80 border-r flex flex-col">
          {/* Header */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="font-bold text-base">Conversaciones</h1>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => { wa.fetchConversations(); loadIgConversations(); }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <FilterTab active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>
                Todos ({counts.total})
              </FilterTab>
              <FilterTab active={channelFilter === "whatsapp"} onClick={() => setChannelFilter("whatsapp")}>
                <span className="inline-flex items-center gap-1">
                  <WhatsAppIcon size={14} /> WA ({counts.wa})
                </span>
              </FilterTab>
              <FilterTab active={channelFilter === "instagram"} onClick={() => setChannelFilter("instagram")}>
                <span className="inline-flex items-center gap-1">
                  <InstagramIcon size={14} /> IG ({counts.ig})
                </span>
              </FilterTab>
            </div>

            {/* Search */}
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

          {/* List */}
          <ScrollArea className="flex-1">
            {(wa.loadingConversations || loadingIg) && filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {search ? "Sin resultados" : "No hay conversaciones"}
                </p>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConvItem
                  key={`${conv.channel}-${conv.id}`}
                  conv={conv}
                  selected={
                    selected?.channel === conv.channel && selected?.id === conv.id
                  }
                  onClick={() => handleSelect(conv)}
                  onMarkUnread={() => handleMarkUnread(conv)}
                />
              ))
            )}
          </ScrollArea>
        </aside>

        {/* ===== Right pane: chat ===== */}
        <main className="flex-1 flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 max-w-sm">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Selecciona una conversación para empezar
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="border-b p-4 flex items-center gap-3">
                <ChannelBadge channel={selected.channel} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selected.display_name}</p>
                  <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleOpenFullView}
                  title={selected.channel === "whatsapp" ? "Abrir en WA Inbox (templates, audio, etc.)" : "Abrir en IG Inbox"}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Vista completa</span>
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {(selected.channel === "whatsapp" && wa.loadingMessages) ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Sin mensajes en esta conversación todavía.
                  </div>
                ) : (
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {activeMessages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} channel={selected.channel} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="border-t p-3 flex gap-2">
                <Input
                  placeholder={`Mensaje de ${selected.channel === "whatsapp" ? "WhatsApp" : "Instagram"}...`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  disabled={sending}
                />
                <Button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className={cn(
                    "gap-1",
                    selected.channel === "whatsapp" && "bg-green-600 hover:bg-green-700",
                    selected.channel === "instagram" && "bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600",
                  )}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components

function FilterTab({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <div className="h-10 w-10 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
      {channel === "whatsapp" ? <WhatsAppIcon size={28} /> : <InstagramIcon size={28} />}
    </div>
  );
}

function ConvItem({
  conv, selected, onClick, onMarkUnread,
}: {
  conv: UnifiedConversation;
  selected: boolean;
  onClick: () => void;
  onMarkUnread: () => void;
}) {
  const initials = conv.display_name
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent border-b border-border/50 cursor-pointer",
        selected && "bg-primary/5 border-l-2 border-l-primary",
      )}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); if (conv.unread_count === 0) onMarkUnread(); }}
    >
      {/* Avatar with brand-icon channel badge overlay */}
      <div className="relative shrink-0">
        {conv.avatar_url ? (
          <img src={conv.avatar_url} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted text-foreground flex items-center justify-center font-semibold text-sm">
            {initials || "?"}
          </div>
        )}
        {/* Channel badge in bottom-right of avatar — uses real brand logo */}
        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-background flex items-center justify-center overflow-hidden">
          {conv.channel === "whatsapp" ? <WhatsAppIcon size={20} /> : <InstagramIcon size={20} />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn("font-medium text-sm truncate", conv.unread_count > 0 && "font-bold")}>
            {conv.display_name}
          </p>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {fmtConvTime(conv.last_message_time)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={cn("text-xs truncate", conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
            {conv.last_direction === "outgoing" && <span className="text-primary/60">Tú: </span>}
            {conv.last_message || <span className="italic">Sin mensajes</span>}
          </p>
          {conv.unread_count > 0 && (
            <Badge className="h-4 min-w-[1rem] px-1 text-[10px] bg-red-500 text-white rounded-full shrink-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
      </div>

      {/* Kebab menu — always visible (subtle, gets emphasis on hover) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-background transition-colors"
            aria-label="Acciones"
            title="Más acciones"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {conv.unread_count > 0 ? (
            <DropdownMenuItem onClick={onClick}>
              <MailOpen className="h-3.5 w-3.5 mr-2" /> Marcar como leído
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onMarkUnread}>
              <MessageCircle className="h-3.5 w-3.5 mr-2" /> Marcar como no leído
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MessageBubble({ msg, channel }: { msg: UnifiedMessage; channel: Channel }) {
  const out = msg.direction === "outgoing";
  const bubbleColor = out
    ? channel === "whatsapp"
      ? "bg-green-600 text-white"
      : "bg-pink-500 text-white"
    : "bg-muted";

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[70%] rounded-2xl px-4 py-2", bubbleColor)}>
        {msg.attachment_url && (
          msg.message_type === "image" ? (
            <img src={msg.attachment_url} alt="" className="rounded mb-1 max-h-60" />
          ) : (
            <a
              href={msg.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs underline mb-1"
            >
              Ver adjunto
            </a>
          )
        )}
        {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
        <p className={cn("text-[10px] mt-1", out ? "text-white/70" : "text-muted-foreground")}>
          {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true, locale: es })}
          {out && msg.status && ` · ${msg.status}`}
        </p>
      </div>
    </div>
  );
}

function fmtConvTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 24) return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    if (diffH < 24 * 7) return d.toLocaleDateString("es", { weekday: "short" });
    return d.toLocaleDateString("es", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWhatsAppInbox } from "@/hooks/useWhatsAppInbox";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Send, Loader2, RefreshCw, MailOpen, MessageCircle,
  Paperclip, Mic, X, FileText, AlertTriangle, Bot, BotOff,
} from "lucide-react";
import { WhatsAppIcon, InstagramIcon } from "@/components/icons/BrandIcons";
import {
  AudioPlayer, MsgStatus, TemplatePicker, MEDIA_MSG_TYPES,
} from "@/components/crm/WhatsAppChatFeatures";
import { ensureWhatsAppCompatibleImage } from "@/lib/image-convert";
// opus-recorder produces native ogg/opus audio — the exact format WhatsApp
// uses for voice notes.  We use it instead of the browser MediaRecorder
// (which on Chrome produces fragmented mp4 audio that Meta accepts at upload
// time but silently drops when trying to deliver it to the recipient).
//
// The encoder worker file is served from /opus-encoder-worker.js (copied
// from node_modules/opus-recorder/dist/encoderWorker.min.js to public/ at
// build time).  We avoid Vite's ?url import here because the resulting URL
// includes a hash that's awkward to pass into the library's worker loader.
// @ts-expect-error — opus-recorder ships without bundled types
import Recorder from "opus-recorder";
// WavRecorder is used ONLY for Instagram outgoing voice notes.  Meta's IG
// Messaging API rejects ogg/opus AND mp3 (only aac/m4a/wav/mp4 are accepted).
// We pick WAV because it's the only one that can be produced in the browser
// without WASM/native dependencies.  WhatsApp keeps using opus-recorder so
// its voice notes render as native voice messages with waveform.
import { WavRecorder } from "@/lib/wav-recorder";

const OPUS_ENCODER_WORKER_PATH = "/opus-encoder-worker.js";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Channel = "whatsapp" | "instagram";
type FilterMode = "all" | Channel;

interface UnifiedConversation {
  channel: Channel;
  id: string;
  contact_id: string | null;
  display_name: string;
  subtitle: string;
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
  sent_by_name?: string | null;
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
  const wa = useWhatsAppInbox();
  const ig = useInstagramIntegration();

  const [channelFilter, setChannelFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedConversation | null>(null);

  // AI Agent pause state per conversation key
  const [agentPaused, setAgentPaused] = useState<boolean>(false);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [igConversations, setIgConversations] = useState<IgConvRow[]>([]);
  const [igMessages, setIgMessages] = useState<IgMessageRow[]>([]);
  const [loadingIg, setLoadingIg] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Template picker (WhatsApp only)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Voice recording state — channel-aware: opus-recorder for WhatsApp (ogg
  // voice notes render natively with waveform), WavRecorder for Instagram
  // (Meta IG only accepts aac/m4a/wav/mp4 for outgoing audio attachments).
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<any>(null);
  const recorderKindRef = useRef<"opus" | "wav" | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // ── Load IG conversations ─────────────────────────────────────────────────
  const loadIgConversations = useCallback(async () => {
    if (!user) return;
    setLoadingIg(true);
    // No user_id filter — RLS (get_org_member_ids) exposes all org conversations
    const { data } = await supabase
      .from("instagram_conversations")
      .select("*")
      .order("last_message_at", { ascending: false });
    setIgConversations((data || []) as IgConvRow[]);
    setLoadingIg(false);
  }, [user]);

  useEffect(() => { loadIgConversations(); }, [loadIgConversations]);

  // ── Initial WA fetch ─────────────────────────────────────────────────────
  useEffect(() => { wa.fetchConversations(); /* eslint-disable-next-line */ }, []);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useRealtimeRefresh({
    table: "whatsapp_messages",
    channelKey: `conv-page-wa-${user?.id || "anon"}`,
    onChange: () => wa.fetchConversations(),
    enabled: !!user,
  });
  useRealtimeRefresh({
    table: "instagram_conversations",
    // No user_id filter — org-scoped via RLS
    channelKey: `conv-page-ig-org`,
    onChange: loadIgConversations,
    enabled: !!user,
  });

  // ── Merge conversations ──────────────────────────────────────────────────
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
      (a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime(),
    );
  }, [wa.conversations, igConversations]);

  const filtered = useMemo(() => unifiedList.filter((c) => {
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.display_name.toLowerCase().includes(q)
        || c.subtitle.toLowerCase().includes(q)
        || (c.last_message || "").toLowerCase().includes(q);
    }
    return true;
  }), [unifiedList, channelFilter, search]);

  const counts = useMemo(() => ({
    total: unifiedList.length,
    wa: unifiedList.filter((c) => c.channel === "whatsapp").length,
    ig: unifiedList.filter((c) => c.channel === "instagram").length,
  }), [unifiedList]);

  // ── Selection ────────────────────────────────────────────────────────────
  const handleSelect = useCallback((conv: UnifiedConversation) => {
    setSelected(conv);
    if (conv.channel === "whatsapp") {
      wa.selectConversation(conv.id);
    } else {
      (async () => {
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", conv.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
        if (conv.unread_count > 0) {
          await supabase.from("instagram_conversations").update({ unread_count: 0 }).eq("id", conv.id);
        }
      })();
    }
  }, [wa]);

  const handleMarkUnread = useCallback(async (conv: UnifiedConversation) => {
    if (conv.unread_count > 0) return;
    try {
      if (conv.channel === "whatsapp") {
        await wa.markAsUnread(conv.id);
      } else {
        // Direct UPDATE — no RPC dependency. RLS filters by user_id.
        const { error } = await supabase
          .from("instagram_conversations")
          .update({ unread_count: 1 })
          .eq("id", conv.id);
        if (error) throw error;
        loadIgConversations();
      }
      if (selected?.channel === conv.channel && selected?.id === conv.id) setSelected(null);
    } catch (e: any) {
      toast.error("Error al marcar como no leído: " + (e?.message || "desconocido"));
    }
  }, [wa, selected, loadIgConversations]);

  // ── Messages ─────────────────────────────────────────────────────────────
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
        sent_by_name: m.sent_by_name || null,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  // Load AI agent pause state when conversation changes
  useEffect(() => {
    if (!selected) { setAgentPaused(false); return; }
    (async () => {
      const sessionKey = selected.channel === "whatsapp"
        ? (selected.id.startsWith("+") ? selected.id : `+${selected.id}`)
        : selected.id;
      const { data } = await (supabase as any)
        .from("ai_agent_paused")
        .select("paused_at")
        .eq("channel", selected.channel)
        .eq("session_key", sessionKey)
        .maybeSingle();
      setAgentPaused(!!data);
    })();
  }, [selected?.id, selected?.channel]);

  async function toggleAgentPause() {
    if (!selected) return;
    setTogglingAgent(true);
    try {
      const sessionKey = selected.channel === "whatsapp"
        ? (selected.id.startsWith("+") ? selected.id : `+${selected.id}`)
        : selected.id;

      if (agentPaused) {
        // Resume AI agent
        await (supabase as any)
          .from("ai_agent_paused")
          .delete()
          .eq("channel", selected.channel)
          .eq("session_key", sessionKey);
        setAgentPaused(false);
        toast.success("Agente IA reactivado para esta conversación");
      } else {
        // Pause AI agent — human taking over
        await (supabase as any)
          .from("ai_agent_paused")
          .upsert({ channel: selected.channel, session_key: sessionKey, paused_at: new Date().toISOString() },
            { onConflict: "organization_id,channel,session_key" });
        setAgentPaused(true);
        toast.success("Agente IA pausado — puedes responder tú");
      }
    } catch (e) {
      toast.error("Error al cambiar estado del agente");
    } finally {
      setTogglingAgent(false);
    }
  }

  // ── Send text message ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      if (selected.channel === "whatsapp") {
        // Pass which of our numbers this conversation came in on so the reply
        // goes out from the same number (multi-number routing)
        const waConv = wa.conversations.find((c) => c.phone_number === selected.id);
        await wa.sendMessage(selected.id, text, selected.contact_id, waConv?.from_phone_number_id);
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error("Conversación no encontrada");
        await ig.sendDm({ recipient_id: igConv.participant_id, text, conversation_id: igConv.id });
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", selected.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  // ── Audio recording (channel-aware) ───────────────────────────────────────
  // WhatsApp: opus-recorder → ogg/opus → renders as a native voice note.
  // Instagram: WavRecorder → wav → IG accepts this format for outgoing
  // attachments (it rejects ogg/opus AND mp3 — only aac/m4a/wav/mp4 allowed).
  const startRecording = useCallback(async () => {
    if (!selected) return;
    try {
      if (selected.channel === "whatsapp") {
        const rec = new Recorder({
          encoderPath: OPUS_ENCODER_WORKER_PATH,
          encoderApplication: 2048,   // VOIP — optimized for speech
          encoderFrameSize: 20,
          encoderSampleRate: 48000,
          numberOfChannels: 1,
          bitRate: 32000,             // 32 kbps mono — good speech quality, small file
          streamPages: false,         // single final blob is easier to handle
        });
        await rec.start();
        recorderRef.current = rec;
        recorderKindRef.current = "opus";
      } else {
        // Instagram path: Web Audio + 16-bit PCM WAV (no library)
        const rec = new WavRecorder();
        await rec.start();
        recorderRef.current = rec;
        recorderKindRef.current = "wav";
      }

      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      console.warn("recorder start failed:", e);
      toast.error("Micrófono no disponible: " + (e?.message || e));
    }
  }, [selected]);

  /** Cleanly tear down whichever recorder was active. */
  const teardownRecorder = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    recorderRef.current = null;
    recorderKindRef.current = null;
  }, []);

  const stopAndSendRecording = useCallback(async () => {
    const rec = recorderRef.current;
    const kind = recorderKindRef.current;
    if (!rec || !selected || !kind) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);

    // Capture the final blob from whichever recorder is active.  Each has
    // its own quirky API: opus-recorder uses `ondataavailable(Uint8Array)`
    // while WavRecorder returns the Blob directly from `stop()`.
    let audioBlob: Blob;
    let mime: string;
    let ext: string;

    if (kind === "opus") {
      audioBlob = await new Promise<Blob>((resolve) => {
        let resolved = false;
        rec.ondataavailable = (chunk: Uint8Array) => {
          if (resolved) return;
          resolved = true;
          resolve(new Blob([chunk], { type: "audio/ogg;codecs=opus" }));
        };
        rec.stop();
      });
      mime = "audio/ogg";
      ext = "ogg";
    } else {
      audioBlob = await (rec as WavRecorder).stop();
      mime = "audio/wav";
      ext = "wav";
    }

    teardownRecorder();

    if (audioBlob.size < 500) return;

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(audioBlob);
      });
      const fname = `voice-${Date.now()}.${ext}`;
      if (selected.channel === "whatsapp") {
        await wa.sendMedia(selected.id, base64, mime, fname, selected.contact_id);
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error("Conversación de Instagram no encontrada");
        await ig.sendDmMedia({
          recipient_id: igConv.participant_id,
          file_base64: base64,
          mime_type: mime,
          filename: fname,
          conversation_id: igConv.id,
        });
        // Realtime might not catch outgoing IG messages — reload manually
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", igConv.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
      }
    } catch (e: any) {
      toast.error("Error al enviar audio: " + e.message);
    }
  }, [selected, wa, ig, igConversations, teardownRecorder]);

  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    const kind = recorderKindRef.current;
    if (rec) {
      try {
        if (kind === "opus") {
          rec.ondataavailable = () => { /* discard */ };
          rec.stop();
        } else {
          // WavRecorder exposes a dedicated cancel() that releases mic + ctx
          (rec as WavRecorder).cancel();
        }
      } catch (_) { /* ignore */ }
    }
    teardownRecorder();
    setRecording(false);
    setRecSeconds(0);
  }, [teardownRecorder]);

  useEffect(() => () => {
    teardownRecorder();
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch (_) { /* ignore */ }
    }
  }, [teardownRecorder]);

  // ── Media file upload (WhatsApp + Instagram) ──────────────────────────────
  const handleMediaFile = useCallback(async (rawFile: File) => {
    if (!selected) return;
    setUploadingMedia(true);
    try {
      // Re-encode AVIF/HEIC/etc. to JPEG since neither WhatsApp nor Instagram
      // accepts those formats; both happily accept JPEG.
      let file = rawFile;
      if (rawFile.type.startsWith("image/")) {
        try {
          file = await ensureWhatsAppCompatibleImage(rawFile);
          if (file !== rawFile) {
            toast.info(`Imagen convertida de ${rawFile.type} a JPEG`);
          }
        } catch (e: any) {
          throw new Error("No se pudo convertir la imagen: " + e.message);
        }
      }

      const MAX_MB = file.type.startsWith("video/") ? 16 : 10;
      if (file.size > MAX_MB * 1024 * 1024) {
        throw new Error(`Archivo demasiado grande (máx. ${MAX_MB}MB)`);
      }
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      if (selected.channel === "whatsapp") {
        await wa.sendMedia(selected.id, base64, file.type, file.name, selected.contact_id);
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error("Conversación de Instagram no encontrada");
        await ig.sendDmMedia({
          recipient_id: igConv.participant_id,
          file_base64: base64,
          mime_type: file.type,
          filename: file.name,
          conversation_id: igConv.id,
        });
        // Reload IG messages so the newly-sent attachment shows up
        const { data } = await supabase
          .from("instagram_messages")
          .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
          .eq("conversation_id", igConv.id)
          .order("sent_at", { ascending: true });
        setIgMessages((data || []) as IgMessageRow[]);
      }
    } catch (e: any) {
      toast.error("Error al enviar archivo: " + e.message);
    } finally {
      setUploadingMedia(false);
    }
  }, [selected, wa, ig, igConversations]);

  // ── Send WA template ──────────────────────────────────────────────────────
  const handleSendTemplate = async (name: string, lang: string, vars: string[], mediaId: string) => {
    if (!selected || selected.channel !== "whatsapp") return;
    setSending(true);
    try {
      // Hook signature: sendTemplate(phone, templateName, language, vars, contactId, headerMediaId)
      await wa.sendTemplate(selected.id, name, lang, vars, selected.contact_id, mediaId || undefined);
      setShowTemplatePicker(false);
    } catch (e: any) {
      toast.error("Error al enviar plantilla: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const isWA = selected?.channel === "whatsapp";

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* ===== LEFT: list ===== */}
        <aside className="w-96 border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="font-bold text-base">Conversaciones</h1>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => { wa.fetchConversations(); loadIgConversations(); }}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <FilterTab active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>
                Todos ({counts.total})
              </FilterTab>
              <FilterTab active={channelFilter === "whatsapp"} onClick={() => setChannelFilter("whatsapp")}>
                <span className="inline-flex items-center gap-1"><WhatsAppIcon size={14} /> WA ({counts.wa})</span>
              </FilterTab>
              <FilterTab active={channelFilter === "instagram"} onClick={() => setChannelFilter("instagram")}>
                <span className="inline-flex items-center gap-1"><InstagramIcon size={14} /> IG ({counts.ig})</span>
              </FilterTab>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm" />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {(wa.loadingConversations || loadingIg) && filtered.length === 0 ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{search ? "Sin resultados" : "No hay conversaciones"}</p>
              </div>
            ) : filtered.map((conv) => (
              <ConvItem
                key={`${conv.channel}-${conv.id}`}
                conv={conv}
                selected={selected?.channel === conv.channel && selected?.id === conv.id}
                onClick={() => handleSelect(conv)}
                onMarkUnread={() => handleMarkUnread(conv)}
              />
            ))}
          </ScrollArea>
        </aside>

        {/* ===== RIGHT: chat ===== */}
        <main className="flex-1 flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 max-w-sm">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Selecciona una conversación</p>
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
                {/* AI Agent toggle */}
                <button
                  onClick={toggleAgentPause}
                  disabled={togglingAgent}
                  title={agentPaused ? "Reactivar agente IA" : "Pausar agente IA (tomar control)"}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                    agentPaused
                      ? "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                      : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  }`}
                >
                  {togglingAgent ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : agentPaused ? (
                    <BotOff className="h-3 w-3" />
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                  {agentPaused ? "IA pausada" : "IA activa"}
                </button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {(isWA && wa.loadingMessages) ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
                ) : activeMessages.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">Sin mensajes todavía.</div>
                ) : (
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {activeMessages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        channel={selected.channel}
                        onFetchMedia={isWA ? wa.fetchMedia : undefined}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="border-t p-3">
                {recording ? (
                  /* Recording indicator (WA only) */
                  <div className="flex items-center gap-3 px-2">
                    <div className="flex-1 flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-mono">{Math.floor(recSeconds / 60)}:{(recSeconds % 60).toString().padStart(2, "0")}</span>
                      <span className="text-xs text-muted-foreground">Grabando audio...</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={cancelRecording} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={stopAndSendRecording} className="gap-1 bg-green-600 hover:bg-green-700">
                      <Send className="h-3.5 w-3.5" /> Enviar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    {/* File input — shared for both channels */}
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*,video/*,audio/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMediaFile(f);
                        e.target.value = "";
                      }}
                    />

                    {/* Templates — WhatsApp only (Instagram has no templates) */}
                    {isWA && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 w-10 p-0 shrink-0"
                        onClick={() => setShowTemplatePicker(true)}
                        title="Enviar plantilla"
                        disabled={sending}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Attach — both channels */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-10 p-0 shrink-0"
                      onClick={() => mediaInputRef.current?.click()}
                      title="Adjuntar archivo"
                      disabled={sending || uploadingMedia}
                    >
                      {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>

                    <Input
                      placeholder={`Mensaje de ${isWA ? "WhatsApp" : "Instagram"}...`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      disabled={sending}
                    />

                    {/* Send (when there's text) or Mic (when empty) — both channels */}
                    {draft.trim() ? (
                      <Button
                        onClick={handleSend}
                        disabled={sending}
                        className={cn("h-10 gap-1 shrink-0",
                          isWA ? "bg-green-600 hover:bg-green-700"
                               : "bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600",
                        )}
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <Button
                        onClick={startRecording}
                        variant="outline"
                        className="h-10 w-10 p-0 shrink-0"
                        title="Grabar audio"
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* WhatsApp template picker dialog */}
      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSend={handleSendTemplate}
        sending={sending}
      />
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
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
  const initials = conv.display_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const isUnread = conv.unread_count > 0;

  return (
    <div
      className={cn(
        "group relative w-full px-3 py-3 text-left transition-colors hover:bg-accent border-b border-border/50 cursor-pointer",
        // Explicit 3-column grid: avatar (fixed) | content (flex) | action (fixed).
        // Grid columns force the action button into its own reserved space so
        // it can never be clipped or pushed off-screen by long preview text.
        "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3",
        selected && "bg-primary/5 border-l-2 border-l-primary",
      )}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); if (!isUnread) onMarkUnread(); }}
    >
      {/* Col 1: avatar */}
      <div className="relative h-10 w-10">
        {conv.avatar_url ? (
          <img src={conv.avatar_url} alt="" className="h-10 w-10 rounded-full" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted text-foreground flex items-center justify-center font-semibold text-sm">
            {initials || "?"}
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-background flex items-center justify-center overflow-hidden">
          {conv.channel === "whatsapp" ? <WhatsAppIcon size={20} /> : <InstagramIcon size={20} />}
        </div>
      </div>

      {/* Col 2: name + preview. min-w-0 on grid column already enforced by minmax(0,1fr). */}
      <div className="overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-medium text-sm truncate", isUnread && "font-bold")}>{conv.display_name}</p>
          <span className="text-[11px] text-muted-foreground shrink-0">{fmtConvTime(conv.last_message_time)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={cn("text-xs truncate", isUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
            {conv.last_direction === "outgoing" && <span className="text-primary/60">Tú: </span>}
            {conv.last_message || <span className="italic">Sin mensajes</span>}
          </p>
          {isUnread && (
            <Badge className="h-4 min-w-[1rem] px-1 text-[10px] bg-red-500 text-white rounded-full shrink-0">
              {conv.unread_count}
            </Badge>
          )}
        </div>
      </div>

      {/* Col 3: quick action pill. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isUnread) onClick();
          else onMarkUnread();
        }}
        className={cn(
          "inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-sm",
          isUnread
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "bg-slate-100 text-slate-700 border border-slate-300 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700",
        )}
        aria-label={isUnread ? "Marcar como leído" : "Marcar como no leído"}
        title={isUnread ? "Marcar como leído" : "Marcar como no leído"}
      >
        {isUnread ? (
          <>
            <MailOpen className="h-3.5 w-3.5" />
            <span>Leer</span>
          </>
        ) : (
          <>
            <MessageCircle className="h-3.5 w-3.5" />
            <span>No leído</span>
          </>
        )}
      </button>
    </div>
  );
}

function MessageBubble({
  msg, channel, onFetchMedia,
}: {
  msg: UnifiedMessage;
  channel: Channel;
  onFetchMedia?: (messageId: string, waMediaId: string) => void;
}) {
  const out = msg.direction === "outgoing";
  // Format as HH:MM (exact time, same as Kommo)
  const timeLabel = (() => {
    try {
      return new Date(msg.sent_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  })();
  // WhatsApp uses chat-style green-on-light bubbles; IG uses pink for outgoing
  const bubbleColor = out
    ? channel === "whatsapp"
      ? "bg-[#dcf8c6] dark:bg-green-800/40 text-gray-900 dark:text-gray-100"
      : "bg-pink-500 text-white"
    : channel === "whatsapp"
      ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-border/40"
      : "bg-muted";

  const isAudio = ["audio", "voice"].includes(msg.message_type);
  const isImage = msg.message_type === "image" || msg.message_type === "sticker";
  const isVideo = msg.message_type === "video";
  const isDocument = msg.message_type === "document";

  // "meta:{id}" is a placeholder when the webhook stored the media reference
  // but the actual download failed — the user can click to retry the fetch.
  const isMetaRef = typeof msg.attachment_url === "string" && msg.attachment_url.startsWith("meta:");
  const metaMediaId = isMetaRef ? msg.attachment_url!.slice(5) : null;
  const realUrl = isMetaRef ? null : msg.attachment_url || null;

  const LoadBtn = ({ icon, label }: { icon: string; label: string }) => (
    <button
      onClick={() => onFetchMedia && metaMediaId && onFetchMedia(msg.id, metaMediaId)}
      className="flex items-center gap-1.5 text-sm text-primary underline py-1 hover:opacity-80 transition-opacity"
    >
      {icon} {label} — toca para cargar
    </button>
  );

  const renderMedia = () => {
    if (isImage) {
      if (realUrl)
        return (
          <a href={realUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={realUrl}
              alt="imagen"
              className="max-w-full rounded-lg max-h-64 object-contain mb-1 cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
        );
      return isMetaRef
        ? <LoadBtn icon="🖼" label="Imagen" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🖼 Imagen no disponible</div>;
    }
    if (isVideo) {
      if (realUrl)
        return <video src={realUrl} controls className="max-w-full rounded-lg max-h-48 mb-1" />;
      return isMetaRef
        ? <LoadBtn icon="🎬" label="Video" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎬 Video no disponible</div>;
    }
    if (isAudio) {
      if (realUrl) return <AudioPlayer src={realUrl} outgoing={out} />;
      return isMetaRef
        ? <LoadBtn icon="🎤" label="Audio" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎤 Audio no disponible</div>;
    }
    if (isDocument) {
      if (realUrl)
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
      return isMetaRef
        ? <LoadBtn icon="📄" label="Documento" />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">📄 Documento no disponible</div>;
    }
    return null;
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", bubbleColor)}>
        {renderMedia()}
        {msg.text && <p className="whitespace-pre-wrap break-words leading-snug">{msg.text}</p>}
        <div className={cn("flex items-center gap-1.5 mt-1", out ? "justify-end" : "justify-start")}>
          {/* Agent name — only on outgoing, only when we have a name */}
          {out && msg.sent_by_name && (
            <span className={cn(
              "text-[10px] font-semibold",
              channel === "whatsapp" ? "text-gray-500 dark:text-gray-400" : "text-white/80"
            )}>
              {msg.sent_by_name}
            </span>
          )}
          <span className={cn(
            "text-[10px]",
            out && channel === "whatsapp" ? "text-gray-500 dark:text-gray-400" : out ? "text-white/70" : "text-gray-400"
          )}>
            {timeLabel}
          </span>
          {out && channel === "whatsapp" && <MsgStatus status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function fmtConvTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffH < 24) return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    if (diffH < 24 * 7) return d.toLocaleDateString("es", { weekday: "short" });
    return d.toLocaleDateString("es", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

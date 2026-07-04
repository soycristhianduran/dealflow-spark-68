import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWhatsAppInbox } from "@/hooks/useWhatsAppInbox";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Send, Loader2, RefreshCw, MailOpen, MessageCircle,
  Paperclip, Mic, X, FileText, AlertTriangle, AlertCircle, Bot, BotOff, ExternalLink, Eye, UserPlus,
} from "lucide-react";
import { WhatsAppIcon, InstagramIcon, MessengerIcon } from "@/components/icons/BrandIcons";
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
import { EnableNotifications } from "@/components/EnableNotifications";
import { NotificationsBanner } from "@/components/NotificationsBanner";

type Channel = "whatsapp" | "instagram" | "messenger";
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
  /** IG only: the participant's IGSID — the session_key the AI agent uses. */
  participant_id?: string;
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
  error_details?: string | null;
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

interface MsConvRow {
  id: string;
  contact_id: string | null;
  participant_id: string;
  participant_name: string | null;
  participant_profile_pic: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
}

interface MsMessageRow {
  id: string;
  direction: "incoming" | "outgoing";
  message_type: string;
  message_text: string | null;
  attachment_url: string | null;
  status: string;
  sent_at: string;
}

export default function ConversationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organizationId, defaultCurrency } = useOrganizationContext();
  const { canEditContacts: canEditConversations } = usePermissions();
  const wa = useWhatsAppInbox();
  const ig = useInstagramIntegration();

  const [channelFilter, setChannelFilter] = useState<FilterMode>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  // Mark unread conversations as read for the org — scoped to the active channel
  // tab: "all" → WhatsApp + Instagram, "whatsapp" → only WA, "instagram" → only IG.
  const markAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const ops: Promise<any>[] = [];
      if (channelFilter === "all" || channelFilter === "whatsapp") {
        let waU = supabase.from("whatsapp_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("direction", "incoming").is("read_at", null);
        if (organizationId) waU = waU.eq("organization_id", organizationId);
        else if (user) waU = waU.eq("user_id", user.id);
        ops.push(waU);
      }
      if (channelFilter === "all" || channelFilter === "instagram") {
        let igU = supabase.from("instagram_conversations")
          .update({ unread_count: 0 }).gt("unread_count", 0);
        if (organizationId) igU = igU.eq("organization_id", organizationId);
        else if (user) igU = igU.eq("user_id", user.id);
        ops.push(igU);
      }
      if (channelFilter === "all" || channelFilter === "messenger") {
        let msU = supabase.from("messenger_conversations")
          .update({ unread_count: 0 }).gt("unread_count", 0);
        if (organizationId) msU = msU.eq("organization_id", organizationId);
        else if (user) msU = msU.eq("user_id", user.id);
        ops.push(msU);
      }
      await Promise.all(ops);
      const scope = channelFilter === "whatsapp" ? t("conversationsPage.scopeWhatsApp") : channelFilter === "instagram" ? t("conversationsPage.scopeInstagram") : channelFilter === "messenger" ? "Messenger" : "";
      toast.success(t("conversationsPage.markedReadMsg", { scope }).replace("  ", " "));
      wa.fetchConversations(); loadIgConversations(); loadMsConversations();
    } catch (e: any) {
      toast.error(t("conversationsPage.markReadError") + (e?.message || ""));
    } finally {
      setMarkingAll(false);
    }
  };
  const [selected, setSelected] = useState<UnifiedConversation | null>(null);

  // AI Agent pause state per conversation key
  const [agentPaused, setAgentPaused] = useState<boolean>(false);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [agentGloballyActive, setAgentGloballyActive] = useState<boolean>(true);
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const [igConversations, setIgConversations] = useState<IgConvRow[]>([]);
  const [igMessages, setIgMessages] = useState<IgMessageRow[]>([]);
  const [loadingIg, setLoadingIg] = useState(true);
  const [msConversations, setMsConversations] = useState<MsConvRow[]>([]);
  const [msMessages, setMsMessages] = useState<MsMessageRow[]>([]);
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
    if (!user) { setLoadingIg(false); return; }
    // Multi-org: scope to the current workspace, otherwise RLS exposes IG
    // conversations from EVERY org the user belongs to and mixes inboxes.
    if (!organizationId) { setIgConversations([]); setLoadingIg(false); return; }
    setLoadingIg(true);
    const { data } = await supabase
      .from("instagram_conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });
    setIgConversations((data || []) as IgConvRow[]);
    setLoadingIg(false);
  }, [user, organizationId]);

  useEffect(() => { loadIgConversations(); }, [loadIgConversations]);

  // ── Load Messenger conversations (org-scoped, same rules as IG) ───────────
  const loadMsConversations = useCallback(async () => {
    if (!user || !organizationId) { setMsConversations([]); return; }
    const { data } = await supabase
      .from("messenger_conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false });
    setMsConversations((data || []) as MsConvRow[]);
  }, [user, organizationId]);

  useEffect(() => { loadMsConversations(); }, [loadMsConversations]);

  // ── Initial WA fetch — wait for the auth session so RLS sees auth.uid()
  //    (otherwise the first fetch runs with no session → 0 rows → empty inbox). ─
  useEffect(() => { if (user) wa.fetchConversations(); /* eslint-disable-next-line */ }, [user, organizationId]);

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
  useRealtimeRefresh({
    table: "messenger_conversations",
    channelKey: `conv-page-ms-org`,
    onChange: loadMsConversations,
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
      participant_id: c.participant_id,
    }));
    const msList: UnifiedConversation[] = msConversations.map((c) => ({
      channel: "messenger",
      id: c.id,
      contact_id: c.contact_id,
      display_name: c.participant_name || c.participant_id,
      subtitle: "Messenger",
      avatar_url: c.participant_profile_pic,
      last_message: c.last_message_preview || "",
      last_message_time: c.last_message_at,
      last_direction: "incoming",
      unread_count: c.unread_count,
      participant_id: c.participant_id,
    }));
    return [...waList, ...igList, ...msList].sort(
      (a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime(),
    );
  }, [wa.conversations, igConversations, msConversations]);

  const filtered = useMemo(() => unifiedList.filter((c) => {
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;
    if (readFilter === "unread" && !(c.unread_count > 0)) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.display_name.toLowerCase().includes(q)
        || c.subtitle.toLowerCase().includes(q)
        || (c.last_message || "").toLowerCase().includes(q);
    }
    return true;
  }), [unifiedList, channelFilter, readFilter, search]);

  const counts = useMemo(() => ({
    total: unifiedList.length,
    wa: unifiedList.filter((c) => c.channel === "whatsapp").length,
    ig: unifiedList.filter((c) => c.channel === "instagram").length,
    ms: unifiedList.filter((c) => c.channel === "messenger").length,
    unread: unifiedList.filter((c) => c.unread_count > 0).length,
  }), [unifiedList]);

  // ── Thread loaders (shared by selection, sends and realtime) ─────────────
  const loadIgThread = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from("instagram_messages")
      .select("id, ig_message_id, direction, message_type, message_text, attachment_url, status, sent_at")
      .eq("conversation_id", convId)
      .order("sent_at", { ascending: true });
    // Keep optimistic temp bubbles that haven't landed in the DB yet
    setIgMessages(prev => {
      const real = (data || []) as IgMessageRow[];
      const temps = prev.filter(m => m.id.startsWith("temp-") &&
        !real.some(r => r.direction === "outgoing" && (r.message_text || "") === (m.message_text || "") && r.message_type === m.message_type));
      return [...real, ...temps];
    });
  }, []);

  const loadMsThread = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from("messenger_messages")
      .select("id, direction, message_type, message_text, attachment_url, status, sent_at")
      .eq("conversation_id", convId)
      .order("sent_at", { ascending: true });
    setMsMessages(prev => {
      const real = (data || []) as MsMessageRow[];
      const temps = prev.filter(m => m.id.startsWith("temp-") &&
        !real.some(r => r.direction === "outgoing" && (r.message_text || "") === (m.message_text || "") && r.message_type === m.message_type));
      return [...real, ...temps];
    });
  }, []);

  // ── Live thread updates for IG/Messenger (WhatsApp already handles this
  //    inside useWhatsAppInbox). New incoming/outgoing rows and status changes
  //    on the OPEN conversation reload the thread instantly. ────────────────
  useEffect(() => {
    if (!selected || selected.channel === "whatsapp") return;
    const isMsCh = selected.channel === "messenger";
    const table = isMsCh ? "messenger_messages" : "instagram_messages";
    const convId = selected.id;
    const reload = () => {
      (isMsCh ? loadMsThread : loadIgThread)(convId);
      // Whatever arrives while the chat is open is instantly read
      supabase.from(isMsCh ? "messenger_conversations" : "instagram_conversations")
        .update({ unread_count: 0 }).eq("id", convId).gt("unread_count", 0).then(() => {}, () => {});
    };
    const channel = supabase
      .channel(`thread-${table}-${convId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table, filter: `conversation_id=eq.${convId}` },
        reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id, selected?.channel, loadIgThread, loadMsThread]);

  // ── Selection ────────────────────────────────────────────────────────────
  const handleSelect = useCallback((conv: UnifiedConversation) => {
    setSelected(conv);
    if (conv.channel === "whatsapp") {
      wa.selectConversation(conv.id);
    } else if (conv.channel === "messenger") {
      (async () => {
        setMsMessages([]);
        await loadMsThread(conv.id);
        if (conv.unread_count > 0) {
          await supabase.from("messenger_conversations").update({ unread_count: 0 }).eq("id", conv.id);
        }
      })();
    } else {
      (async () => {
        setIgMessages([]);
        await loadIgThread(conv.id);
        if (conv.unread_count > 0) {
          await supabase.from("instagram_conversations").update({ unread_count: 0 }).eq("id", conv.id);
        }
        // Backfill from the Instagram API in the background — captures replies the
        // owner sent from the phone (Instagram doesn't webhook those). Reload if
        // anything new came in. Non-blocking; failures are silent.
        try {
          const { data: sync } = await supabase.functions.invoke("instagram-api", {
            body: { action: "sync_thread", conversation_id: conv.id },
          });
          if ((sync as any)?.synced > 0) await loadIgThread(conv.id);
        } catch { /* ignore */ }
      })();
    }
  }, [wa, loadIgThread, loadMsThread]);

  // Deep-link from a push notification: /conversations?ch=wa&id=<phone|convId>
  // → auto-open that specific chat once its data has loaded.
  const [searchParams] = useSearchParams();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const ch = searchParams.get("ch");
    const id = searchParams.get("id");
    if (!ch || !id) return;
    const channel = ch === "ig" ? "instagram" : ch === "ms" ? "messenger" : "whatsapp";
    const match = unifiedList.find((c) => c.channel === channel && c.id === id);
    if (match) { autoOpenedRef.current = true; handleSelect(match); }
  }, [searchParams, unifiedList, handleSelect]);

  const handleMarkUnread = useCallback(async (conv: UnifiedConversation) => {
    if (conv.unread_count > 0) return;
    try {
      if (conv.channel === "whatsapp") {
        await wa.markAsUnread(conv.id);
      } else if (conv.channel === "messenger") {
        const { error } = await supabase
          .from("messenger_conversations")
          .update({ unread_count: 1 })
          .eq("id", conv.id);
        if (error) throw error;
        loadMsConversations();
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
      toast.error(t("conversationsPage.markUnreadError") + (e?.message || t("conversationsPage.unknown")));
    }
  }, [wa, selected, loadIgConversations]);

  // ── Messages ─────────────────────────────────────────────────────────────
  const activeMessages: UnifiedMessage[] = useMemo(() => {
    if (!selected) return [];
    if (selected.channel === "whatsapp") {
      // De-duplicate: an optimistic (temp) message + its real DB row can both
      // end up in state when the realtime INSERT wins the race before the temp
      // gets its wa_message_id. Drop dups by wa_message_id, and drop a temp
      // (no wa_message_id yet) when a real row with the same text already exists.
      const realOutgoingTexts = new Set(
        wa.messages.filter(m => m.direction === "outgoing" && m.wa_message_id).map(m => m.message_text || ""),
      );
      const seenWamid = new Set<string>();
      const deduped = wa.messages.filter((m) => {
        if (m.wa_message_id) {
          if (seenWamid.has(m.wa_message_id)) return false;
          seenWamid.add(m.wa_message_id);
          return true;
        }
        // temp message with no wa_message_id: drop if a real one matches its text
        if (m.direction === "outgoing" && realOutgoingTexts.has(m.message_text || "")) return false;
        return true;
      });
      return deduped.map((m) => ({
        channel: "whatsapp" as const,
        id: m.id,
        direction: m.direction,
        text: m.message_text || "",
        attachment_url: m.media_url || null,
        message_type: m.message_type,
        status: m.status,
        sent_at: m.created_at,
        sent_by_name: m.sent_by_name || null,
        error_details: (m as any).error_details ?? null,
      }));
    }
    if (selected.channel === "messenger") {
      return msMessages.map((m) => ({
        channel: "messenger" as const,
        id: m.id,
        direction: m.direction,
        text: m.message_text || "",
        attachment_url: m.attachment_url || null,
        message_type: m.message_type,
        status: m.status,
        sent_at: m.sent_at,
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
  }, [selected, wa.messages, igMessages, msMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  // Load whether the AI agent is globally active for this org (once).
  // MUST be org-scoped: multi-org users have several configs and an unfiltered
  // maybeSingle() errors out → the badge wrongly showed "IA apagada".
  useEffect(() => {
    if (!organizationId) { setAgentGloballyActive(false); return; }
    (async () => {
      const { data } = await supabase.from("ai_agent_configs")
        .select("is_active")
        .eq("organization_id", organizationId)
        .maybeSingle();
      setAgentGloballyActive(data?.is_active ?? false);
    })();
  }, [user?.id, organizationId]);

  // Load AI agent pause state when conversation changes
  useEffect(() => {
    if (!selected || !organizationId) { setAgentPaused(false); return; }
    (async () => {
      // Must match the session_key the webhooks send to ai-agent:
      // WhatsApp → +<phone>, Instagram → the participant's IGSID.
      const sessionKey = selected.channel === "whatsapp"
        ? (selected.id.startsWith("+") ? selected.id : `+${selected.id}`)
        : (selected.participant_id || selected.id);
      const { data } = await supabase
        .from("ai_agent_paused")
        .select("paused_at")
        .eq("organization_id", organizationId)
        .eq("channel", selected.channel)
        .eq("session_key", sessionKey)
        .maybeSingle();
      setAgentPaused(!!data);
    })();
  }, [selected?.id, selected?.channel, organizationId]);

  async function toggleAgentPause() {
    if (!selected || !organizationId) return;
    setTogglingAgent(true);
    try {
      const sessionKey = selected.channel === "whatsapp"
        ? (selected.id.startsWith("+") ? selected.id : `+${selected.id}`)
        : (selected.participant_id || selected.id);

      if (agentPaused) {
        // Resume AI agent
        const { error } = await supabase
          .from("ai_agent_paused")
          .delete()
          .eq("organization_id", organizationId)
          .eq("channel", selected.channel)
          .eq("session_key", sessionKey);
        if (error) throw error;
        setAgentPaused(false);
        toast.success(t("conversationsPage.agentResumedMsg"));
      } else {
        // Pause AI agent — human taking over
        const { error } = await supabase
          .from("ai_agent_paused")
          .upsert({ organization_id: organizationId, channel: selected.channel, session_key: sessionKey, paused_at: new Date().toISOString() },
            { onConflict: "organization_id,channel,session_key" });
        if (error) throw error;
        setAgentPaused(true);
        toast.success(t("conversationsPage.agentPausedMsg"));
      }
    } catch (e) {
      toast.error(t("conversationsPage.agentToggleError"));
    } finally {
      setTogglingAgent(false);
    }
  }

  // ── Create a lead from an IG/Messenger conversation (manual, one click) ───
  const [creatingLead, setCreatingLead] = useState(false);
  const createLeadFromConversation = async () => {
    if (!selected || selected.contact_id || creatingLead || !organizationId) return;
    if (selected.channel === "whatsapp") return; // WA links contacts by phone already
    setCreatingLead(true);
    try {
      const fullName = selected.display_name || selected.participant_id || "Lead";
      const nameParts = fullName.split(" ");
      const { data: pipeline } = await supabase.from("pipelines").select("id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      const { data: stage } = pipeline
        ? await supabase.from("pipeline_stages").select("id")
            .eq("pipeline_id", pipeline.id).order("order", { ascending: true }).limit(1).maybeSingle()
        : { data: null };
      const { data: newContact, error } = await supabase.from("contacts").insert({
        full_name: fullName,
        first_name: nameParts[0] || fullName,
        last_name: nameParts.slice(1).join(" ") || null,
        source: selected.channel,
        lead_status: "active",
        organization_id: organizationId,
        owner_id: user?.id ?? null,
        pipeline_id: pipeline?.id ?? null,
        stage_id: stage?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      const table = selected.channel === "messenger" ? "messenger_conversations" : "instagram_conversations";
      await supabase.from(table).update({ contact_id: newContact.id }).eq("id", selected.id);
      setSelected(prev => prev ? { ...prev, contact_id: newContact.id } : prev);
      if (selected.channel === "messenger") loadMsConversations(); else loadIgConversations();

      // Fire contact_created automations (fire-and-forget)
      supabase.functions.invoke("automation-runner", {
        body: { action: "trigger_event", trigger_type: "contact_created", contact_id: newContact.id, trigger_data: { origin: selected.channel } },
      }).catch(() => {});

      toast.success(t("conversationsPage.leadCreated"));
    } catch (e: any) {
      toast.error(t("conversationsPage.leadCreateError") + (e?.message || ""));
    } finally {
      setCreatingLead(false);
    }
  };

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
      } else if (selected.channel === "messenger") {
        // Optimistic bubble — appears instantly, replaced by the real row
        const tempId = `temp-${Date.now()}`;
        setMsMessages(prev => [...prev, { id: tempId, direction: "outgoing", message_type: "text", message_text: text, attachment_url: null, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          const { data, error } = await supabase.functions.invoke("facebook-api", {
            body: { action: "messenger_send", conversation_id: selected.id, text },
          });
          if (error || data?.error) throw new Error(data?.error || error?.message);
          await loadMsThread(selected.id);
        } catch (err) {
          setMsMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error(t("conversationsPage.conversationNotFound"));
        const tempId = `temp-${Date.now()}`;
        setIgMessages(prev => [...prev, { id: tempId, ig_message_id: null, direction: "outgoing", message_type: "text", message_text: text, attachment_url: null, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          await ig.sendDm({ recipient_id: igConv.participant_id, text, conversation_id: igConv.id });
          await loadIgThread(selected.id);
        } catch (err) {
          setIgMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      }
    } catch (e: any) {
      toast.error(t("conversationsPage.errorPrefix") + e.message);
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
      toast.error(t("conversationsPage.micUnavailable") + (e?.message || e));
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
      } else if (selected.channel === "messenger") {
        const tempId = `temp-${Date.now()}`;
        const localUrl = URL.createObjectURL(audioBlob);
        setMsMessages(prev => [...prev, { id: tempId, direction: "outgoing", message_type: "audio", message_text: null, attachment_url: localUrl, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          const { data, error } = await supabase.functions.invoke("facebook-api", {
            body: { action: "messenger_send_media", conversation_id: selected.id, file_base64: base64, mime_type: mime, filename: fname },
          });
          if (error || data?.error) throw new Error(data?.error || error?.message);
          await loadMsThread(selected.id);
        } catch (err) {
          setMsMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error(t("conversationsPage.instagramConversationNotFound"));
        const tempId = `temp-${Date.now()}`;
        const localUrl = URL.createObjectURL(audioBlob);
        setIgMessages(prev => [...prev, { id: tempId, ig_message_id: null, direction: "outgoing", message_type: "audio", message_text: null, attachment_url: localUrl, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          await ig.sendDmMedia({
            recipient_id: igConv.participant_id,
            file_base64: base64,
            mime_type: mime,
            filename: fname,
            conversation_id: igConv.id,
          });
          await loadIgThread(igConv.id);
        } catch (err) {
          setIgMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      }
    } catch (e: any) {
      toast.error(t("conversationsPage.audioSendError") + e.message);
    }
  }, [selected, wa, ig, igConversations, teardownRecorder, loadIgThread, loadMsThread]);

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
            toast.info(t("conversationsPage.imageConverted", { type: rawFile.type }));
          }
        } catch (e: any) {
          throw new Error(t("conversationsPage.imageConvertError") + e.message);
        }
      }

      const MAX_MB = file.type.startsWith("video/") ? 16 : 10;
      if (file.size > MAX_MB * 1024 * 1024) {
        throw new Error(t("conversationsPage.fileTooLarge", { max: MAX_MB }));
      }
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      if (selected.channel === "whatsapp") {
        await wa.sendMedia(selected.id, base64, file.type, file.name, selected.contact_id);
      } else if (selected.channel === "messenger") {
        const tempId = `temp-${Date.now()}`;
        const mType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file";
        const localUrl = URL.createObjectURL(file);
        setMsMessages(prev => [...prev, { id: tempId, direction: "outgoing", message_type: mType, message_text: null, attachment_url: localUrl, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          const { data, error } = await supabase.functions.invoke("facebook-api", {
            body: { action: "messenger_send_media", conversation_id: selected.id, file_base64: base64, mime_type: file.type, filename: file.name },
          });
          if (error || data?.error) throw new Error(data?.error || error?.message);
          await loadMsThread(selected.id);
        } catch (err) {
          setMsMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      } else {
        const igConv = igConversations.find((c) => c.id === selected.id);
        if (!igConv) throw new Error(t("conversationsPage.instagramConversationNotFound"));
        const tempId = `temp-${Date.now()}`;
        const mType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file";
        const localUrl = URL.createObjectURL(file);
        setIgMessages(prev => [...prev, { id: tempId, ig_message_id: null, direction: "outgoing", message_type: mType, message_text: null, attachment_url: localUrl, status: "sending", sent_at: new Date().toISOString() }]);
        try {
          await ig.sendDmMedia({
            recipient_id: igConv.participant_id,
            file_base64: base64,
            mime_type: file.type,
            filename: file.name,
            conversation_id: igConv.id,
          });
          await loadIgThread(igConv.id);
        } catch (err) {
          setIgMessages(prev => prev.filter(m => m.id !== tempId));
          throw err;
        }
      }
    } catch (e: any) {
      toast.error(t("conversationsPage.fileSendError") + e.message);
    } finally {
      setUploadingMedia(false);
    }
  }, [selected, wa, ig, igConversations, loadIgThread, loadMsThread]);

  // ── Send WA template ──────────────────────────────────────────────────────
  const handleSendTemplate = async (name: string, lang: string, vars: string[], mediaId: string) => {
    if (!selected || selected.channel !== "whatsapp") return;
    setSending(true);
    try {
      // Hook signature: sendTemplate(phone, templateName, language, vars, contactId, headerMediaId)
      await wa.sendTemplate(selected.id, name, lang, vars, selected.contact_id, mediaId || undefined);
      setShowTemplatePicker(false);
    } catch (e: any) {
      toast.error(t("conversationsPage.templateSendError") + e.message);
    } finally {
      setSending(false);
    }
  };

  const isWA = selected?.channel === "whatsapp";
  const isMS = selected?.channel === "messenger";

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* ===== LEFT: list ===== */}
        <aside className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-96 border-r flex-col`}>
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-bold text-base truncate min-w-0">{t("conversationsPage.title")}</h1>
              <div className="flex items-center gap-1 shrink-0">
                <EnableNotifications />
                {canEditConversations && counts.unread > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
                    onClick={markAllRead} disabled={markingAll}
                    title={channelFilter === "whatsapp" ? t("conversationsPage.markWhatsAppReadTitle") : channelFilter === "instagram" ? t("conversationsPage.markInstagramReadTitle") : t("conversationsPage.markAllReadTitle")}>
                    {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailOpen className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">
                      {channelFilter === "whatsapp" ? t("conversationsPage.markWAReadShort") : channelFilter === "instagram" ? t("conversationsPage.markIGReadShort") : t("conversationsPage.markReadShort")}
                    </span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => { wa.fetchConversations(); loadIgConversations(); }}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              <FilterTab active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>
                {t("conversationsPage.filterAll")} ({counts.total})
              </FilterTab>
              <FilterTab active={channelFilter === "whatsapp"} onClick={() => setChannelFilter("whatsapp")}>
                <span className="inline-flex items-center gap-1"><WhatsAppIcon size={14} /> WA ({counts.wa})</span>
              </FilterTab>
              <FilterTab active={channelFilter === "messenger"} onClick={() => setChannelFilter("messenger")}>
                <span className="inline-flex items-center gap-1"><MessengerIcon size={14} /> MS ({counts.ms})</span>
              </FilterTab>
              <FilterTab active={channelFilter === "instagram"} onClick={() => setChannelFilter("instagram")}>
                <span className="inline-flex items-center gap-1"><InstagramIcon size={14} /> IG ({counts.ig})</span>
              </FilterTab>
              <FilterTab active={readFilter === "unread"} onClick={() => setReadFilter(readFilter === "unread" ? "all" : "unread")}>
                <span className="inline-flex items-center gap-1">
                  {t("conversationsPage.filterUnread")}
                  {counts.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{counts.unread}</span>
                  )}
                </span>
              </FilterTab>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder={t("conversationsPage.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm" />
            </div>
          </div>

          <NotificationsBanner />

          <ScrollArea className="flex-1">
            {(wa.loadingConversations || loadingIg) && filtered.length === 0 ? (
              <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{search ? t("conversationsPage.noResults") : t("conversationsPage.noConversations")}</p>
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
        <main className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 max-w-sm">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t("conversationsPage.selectConversation")}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="border-b p-4 flex items-center gap-3">
                {/* Back button — mobile only */}
                <button
                  className="md:hidden mr-1 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(null)}
                  aria-label={t("conversationsPage.back")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <ChannelBadge channel={selected.channel} />
                <div className="flex-1 min-w-0">
                  {selected.contact_id ? (
                    <button
                      onClick={() => navigate(path(`/contacts/${selected.contact_id}`))}
                      className="group flex items-center gap-1 text-sm font-semibold truncate hover:text-primary transition-colors"
                      title={t("conversationsPage.openContact")}
                    >
                      <span className="truncate">{selected.display_name}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                    </button>
                  ) : (
                    <p className="text-sm font-semibold truncate">{selected.display_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
                </div>

                {/* Quick stage / pipeline changer */}
                {selected.contact_id && <StagePipelinePicker contactId={selected.contact_id} />}

                {/* Create lead from an IG/MS chat that isn't linked to a contact yet */}
                {!selected.contact_id && selected.channel !== "whatsapp" && canEditConversations && (
                  <button
                    onClick={createLeadFromConversation}
                    disabled={creatingLead}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                    title={t("conversationsPage.createLeadTitle")}
                  >
                    {creatingLead ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                    <span className="hidden sm:inline">{t("conversationsPage.createLead")}</span>
                  </button>
                )}

                {/* AI Agent toggle / status */}
                {!agentGloballyActive ? (
                  <button
                    onClick={() => navigate(path("/ai-agent"))}
                    title={t("conversationsPage.agentOffTitle")}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  >
                    <BotOff className="h-3 w-3" /> {t("conversationsPage.aiOff")}
                  </button>
                ) : (
                  <button
                    onClick={toggleAgentPause}
                    disabled={togglingAgent}
                    title={agentPaused ? t("conversationsPage.resumeAgentTitle") : t("conversationsPage.pauseAgentTitle")}
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
                    {agentPaused ? t("conversationsPage.aiPaused") : t("conversationsPage.aiActive")}
                  </button>
                )}
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {(isWA && wa.loadingMessages) ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
                ) : activeMessages.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">{t("conversationsPage.noMessagesYet")}</div>
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
                {!canEditConversations ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" /> {t("conversationsPage.readOnlyMode")}
                  </div>
                ) : recording ? (
                  /* Recording indicator (WA only) */
                  <div className="flex items-center gap-3 px-2">
                    <div className="flex-1 flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-mono">{Math.floor(recSeconds / 60)}:{(recSeconds % 60).toString().padStart(2, "0")}</span>
                      <span className="text-xs text-muted-foreground">{t("conversationsPage.recordingAudio")}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={cancelRecording} className="gap-1">
                      <X className="h-3.5 w-3.5" /> {t("conversationsPage.cancel")}
                    </Button>
                    <Button size="sm" onClick={stopAndSendRecording} className="gap-1 bg-green-600 hover:bg-green-700">
                      <Send className="h-3.5 w-3.5" /> {t("conversationsPage.send")}
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
                        title={t("conversationsPage.sendTemplate")}
                        disabled={sending}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Attach — all channels */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-10 p-0 shrink-0"
                      onClick={() => mediaInputRef.current?.click()}
                      title={t("conversationsPage.attachFile")}
                      disabled={sending || uploadingMedia}
                    >
                      {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>

                    <Input
                      className="flex-1 min-w-0"
                      placeholder={t("conversationsPage.messagePlaceholder", { channel: isWA ? "WhatsApp" : isMS ? "Messenger" : "Instagram" })}
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
                               : isMS ? "bg-[#007FFF] hover:bg-[#0066CC]"
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
                        title={t("conversationsPage.recordAudio")}
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
      {channel === "whatsapp" ? <WhatsAppIcon size={28} /> : channel === "messenger" ? <MessengerIcon size={28} /> : <InstagramIcon size={28} />}
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
  const { t } = useTranslation();
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
        <div className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full bg-background p-[1.5px] shadow-sm">
          {conv.channel === "whatsapp" ? <WhatsAppIcon size={18} /> : conv.channel === "messenger" ? <MessengerIcon size={18} /> : <InstagramIcon size={18} />}
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
            {conv.last_direction === "outgoing" && <span className="text-primary/60">{t("conversationsPage.youPrefix")} </span>}
            {conv.last_message || <span className="italic">{t("conversationsPage.noMessages")}</span>}
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
        aria-label={isUnread ? t("conversationsPage.markAsRead") : t("conversationsPage.markAsUnread")}
        title={isUnread ? t("conversationsPage.markAsRead") : t("conversationsPage.markAsUnread")}
      >
        {isUnread ? (
          <>
            <MailOpen className="h-3.5 w-3.5" />
            <span>{t("conversationsPage.read")}</span>
          </>
        ) : (
          <>
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{t("conversationsPage.unread")}</span>
          </>
        )}
      </button>
    </div>
  );
}

// Human-friendly reason for a failed WhatsApp/Instagram message.
function failReason(errorDetails?: string | null): string {
  let code = 0, detail = "";
  try {
    const arr = JSON.parse(errorDetails || "[]");
    const e = Array.isArray(arr) ? arr[0] : arr;
    code = Number(e?.code) || 0;
    detail = e?.error_data?.details || e?.message || e?.title || "";
  } catch { /* ignore */ }
  if (code === 131047) return "No se pudo enviar: pasaron más de 24 h desde la última respuesta del cliente. Usa una plantilla para reactivar la conversación.";
  if (code === 131049) return "Meta limitó la entrega de este mensaje de marketing (el cliente ya recibió muchos mensajes promocionales recientemente). Es un tope de frecuencia de Meta, no un error del CRM.";
  if (code === 130472) return "No se entregó: el cliente está en un experimento de Meta que limita mensajes de marketing. Vuelve a intentar más adelante o usa un mensaje de utilidad.";
  if (code === 131026) return "No se pudo entregar: el número no tiene WhatsApp o no puede recibir mensajes.";
  if (code === 131051) return "No se pudo enviar: tipo de mensaje no permitido fuera de la ventana de 24 h. Usa una plantilla.";
  if (code === 131053) return "No se pudo enviar el medio (formato/codec no soportado).";
  if (code === 131050) return "El cliente optó por no recibir mensajes (opt-out).";
  return detail ? `No se pudo enviar: ${detail}` : "No se pudo enviar el mensaje.";
}

// Shared Instagram content (reels/posts/stories shared from OTHER accounts).
// Meta gives us a CDN url; guess video vs image and fall back to a link if the
// CDN asset expired (Meta keeps them for a limited time).
function SharedIgMedia({ url, kind }: { url: string; kind: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [vidFailed, setVidFailed] = useState(false);
  const label =
    kind === "ig_reel" ? "🎬 Reel compartido"
    : kind === "ig_post" || kind === "share" ? "📎 Publicación compartida"
    : kind === "story_mention" ? "📖 Te mencionó en su historia"
    : "📖 Historia";
  const looksVideo = kind === "ig_reel" || /\.mp4(\?|$)|video/i.test(url);
  return (
    <div className="mb-1">
      <div className="text-[10px] font-semibold opacity-70 mb-1">{label}</div>
      {looksVideo && !vidFailed ? (
        <video src={url} controls playsInline className="max-w-full rounded-lg max-h-64" onError={() => setVidFailed(true)} />
      ) : !imgFailed && !looksVideo ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt="Contenido compartido" className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90" onError={() => setImgFailed(true)} />
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
          Ver contenido compartido ↗
        </a>
      )}
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
  const { t } = useTranslation();
  const out = msg.direction === "outgoing";
  const isFailed = out && msg.status === "failed";
  // Format as HH:MM (exact time, same as Kommo)
  const timeLabel = (() => {
    try {
      return new Date(msg.sent_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  })();
  // WhatsApp: green-on-light bubbles; IG: pink; Messenger: blue (official)
  const bubbleColor = out
    ? channel === "whatsapp"
      ? "bg-[#dcf8c6] dark:bg-green-800/40 text-gray-900 dark:text-gray-100"
      : channel === "messenger"
      ? "bg-[#007FFF] text-white"
      : "bg-pink-500 text-white"
    : channel === "whatsapp"
      ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-border/40"
      : "bg-muted";

  const isAudio = ["audio", "voice"].includes(msg.message_type);
  const isImage = msg.message_type === "image" || msg.message_type === "sticker";
  const isVideo = msg.message_type === "video";
  const isDocument = msg.message_type === "document" || msg.message_type === "file";

  // "meta:{id}" is a placeholder when the webhook stored the media reference
  // but the actual download failed — the user can click to retry the fetch.
  const isMetaRef = typeof msg.attachment_url === "string" && msg.attachment_url.startsWith("meta:");
  const metaMediaId = isMetaRef ? msg.attachment_url!.slice(5) : null;
  const realUrl = isMetaRef ? null : msg.attachment_url || null;

  // Auto-resolve media placeholders (templates, undownloaded media) once, so the
  // image/video shows in history without the user tapping "load".
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!autoLoadedRef.current && isMetaRef && metaMediaId && onFetchMedia) {
      autoLoadedRef.current = true;
      onFetchMedia(msg.id, metaMediaId);
    }
  }, [isMetaRef, metaMediaId, onFetchMedia, msg.id]);

  const LoadBtn = ({ icon, label }: { icon: string; label: string }) => (
    <button
      onClick={() => onFetchMedia && metaMediaId && onFetchMedia(msg.id, metaMediaId)}
      className="flex items-center gap-1.5 text-sm text-primary underline py-1 hover:opacity-80 transition-opacity"
    >
      {icon} {label} {t("conversationsPage.tapToLoad")}
    </button>
  );

  const renderMedia = () => {
    // Instagram shared content (reels/posts/stories from other accounts)
    if (channel === "instagram" && realUrl &&
        ["ig_reel", "ig_post", "share", "story_mention", "story_reply", "ig_story"].includes(msg.message_type)) {
      return <SharedIgMedia url={realUrl} kind={msg.message_type} />;
    }
    if (isImage) {
      if (realUrl)
        return (
          <a href={realUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={realUrl}
              alt={t("conversationsPage.imageAlt")}
              className="max-w-full rounded-lg max-h-64 object-contain mb-1 cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
        );
      return isMetaRef
        ? <LoadBtn icon="🖼" label={t("conversationsPage.image")} />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🖼 {t("conversationsPage.imageUnavailable")}</div>;
    }
    if (isVideo) {
      if (realUrl)
        return <video src={realUrl} controls className="max-w-full rounded-lg max-h-48 mb-1" />;
      return isMetaRef
        ? <LoadBtn icon="🎬" label={t("conversationsPage.video")} />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎬 {t("conversationsPage.videoUnavailable")}</div>;
    }
    if (isAudio) {
      if (realUrl) return <AudioPlayer src={realUrl} outgoing={out} />;
      return isMetaRef
        ? <LoadBtn icon="🎤" label={t("conversationsPage.audio")} />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">🎤 {t("conversationsPage.audioUnavailable")}</div>;
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
            📄 {t("conversationsPage.viewDocument")}
          </a>
        );
      return isMetaRef
        ? <LoadBtn icon="📄" label={t("conversationsPage.document")} />
        : <div className="flex items-center gap-1.5 text-sm text-muted-foreground py-1">📄 {t("conversationsPage.documentUnavailable")}</div>;
    }
    return null;
  };

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", bubbleColor)}>
        {renderMedia()}
        {msg.text && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">{msg.text}</p>}
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
        {isFailed && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] leading-snug text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>{failReason(msg.error_details)}</span>
          </div>
        )}
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

// ── Quick pipeline + stage changer for the conversation header ────────────────
function StagePipelinePicker({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const { canEditContacts } = usePermissions();
  const { defaultCurrency, organizationId } = useOrganizationContext();
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    (async () => {
      setLoaded(false);
      const [{ data: c }, { data: pls }, { data: sts }] = await Promise.all([
        supabase.from("contacts").select("pipeline_id, stage_id").eq("id", contactId).maybeSingle(),
        supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at"),
        supabase.from("pipeline_stages").select("id, name, pipeline_id").eq("organization_id", organizationId).order("order"),
      ]);
      if (!active) return;
      setPipelines((pls as any) || []);
      setStages((sts as any) || []);
      const pid = c?.pipeline_id || (pls?.[0] as any)?.id || "";
      setPipelineId(pid);
      setStageId(c?.stage_id || "");
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [contactId, organizationId]);

  const stagesForPipeline = stages.filter(s => s.pipeline_id === pipelineId);

  const changePipeline = async (pid: string) => {
    const firstStage = stages.find(s => s.pipeline_id === pid)?.id || null;
    setPipelineId(pid); setStageId(firstStage || "");
    const { error } = await supabase.from("contacts").update({ pipeline_id: pid, stage_id: firstStage }).eq("id", contactId);
    if (error) toast.error(t("conversationsPage.pipelineChangeError")); else toast.success(t("conversationsPage.pipelineUpdated"));
  };
  const changeStage = async (sid: string) => {
    const stageName = stages.find(s => s.id === sid)?.name || "";
    const isWon = /ganad|won/i.test(stageName);
    const update: Record<string, any> = { stage_id: sid };
    // Moving to a WON stage requires a closing budget (enforced by DB trigger).
    if (isWon) {
      const { data: c } = await supabase.from("contacts").select("budget, budget_currency").eq("id", contactId).maybeSingle();
      if (!c?.budget || Number(c.budget) <= 0) {
        const raw = window.prompt(t("conversationsPage.closingBudgetPrompt", { stageName }), "");
        if (raw === null) return; // cancelled
        const amount = Number(raw.replace(/[^\d.]/g, ""));
        if (!(amount > 0)) { toast.error(t("conversationsPage.invalidBudget")); return; }
        update.budget = amount;
        update.budget_currency = c?.budget_currency || defaultCurrency;
      }
      update.lead_status = "won";
    }
    setStageId(sid);
    const { error } = await supabase.from("contacts").update(update).eq("id", contactId);
    if (error) {
      const won = error.message?.includes("BUDGET") || error.message?.includes("WON_") || error.message?.toLowerCase().includes("presupuesto");
      toast.error(won ? t("conversationsPage.budgetRequiredForWon") : t("conversationsPage.stageChangeError"));
    } else toast.success(t("conversationsPage.stageUpdated"));
  };

  if (!loaded) return null;

  // Read-only members see the current stage as a static badge (no editing).
  if (!canEditContacts) {
    const stName = stages.find(s => s.id === stageId)?.name;
    if (!stName) return null;
    return (
      <div className="hidden md:flex items-center">
        <span className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground">{stName}</span>
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-1.5">
      {pipelines.length > 1 && (
        <Select value={pipelineId} onValueChange={changePipeline}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder={t("conversationsPage.pipelinePlaceholder")} /></SelectTrigger>
          <SelectContent>
            {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={stageId} onValueChange={changeStage}>
        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder={t("conversationsPage.stagePlaceholder")} /></SelectTrigger>
        <SelectContent>
          {stagesForPipeline.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

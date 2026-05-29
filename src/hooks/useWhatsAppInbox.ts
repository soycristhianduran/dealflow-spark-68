import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WaConversation {
  phone_number: string;
  contact_id: string | null;
  contact_name: string | null;
  last_message: string;
  last_message_time: string;
  last_direction: "incoming" | "outgoing";
  unread_count: number;
  /** Which of our WhatsApp numbers this conversation came in on (for reply routing) */
  from_phone_number_id: string | null;
}

export interface WaMessage {
  id: string;
  wa_message_id: string | null;
  phone_number: string;
  from_phone_number_id?: string | null;
  direction: "incoming" | "outgoing";
  message_type: string;
  message_text: string | null;
  status: string;
  created_at: string;
  media_url?: string | null;
  sent_by_name?: string | null;
}

export function useWhatsAppInbox() {
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Derive conversation list from raw messages grouped by phone_number
  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const { data: msgs, error } = await supabase
        .from("whatsapp_messages")
        .select("id, phone_number, contact_id, direction, message_text, message_type, status, created_at, read_at, from_phone_number_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const phoneMap = new Map<string, WaConversation>();

      for (const msg of (msgs || [])) {
        const phone = msg.phone_number;
        if (!phoneMap.has(phone)) {
          phoneMap.set(phone, {
            phone_number: phone,
            contact_id: msg.contact_id || null,
            contact_name: null,
            last_message:
              msg.message_text ||
              (msg.message_type !== "text" ? `[${msg.message_type}]` : ""),
            last_message_time: msg.created_at,
            last_direction: msg.direction as "incoming" | "outgoing",
            unread_count: 0,
            from_phone_number_id: msg.from_phone_number_id || null,
          });
        }
        // Unread = incoming message where read_at is NULL (persisted in DB)
        if (msg.direction === "incoming" && !msg.read_at) {
          const c = phoneMap.get(phone)!;
          c.unread_count += 1;
        }
      }

      // Resolve contact names
      const contactIds = [
        ...new Set(
          [...phoneMap.values()].map((c) => c.contact_id).filter(Boolean)
        ),
      ] as string[];
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .in("id", contactIds);
        for (const conv of phoneMap.values()) {
          if (conv.contact_id) {
            const c = contacts?.find((x) => x.id === conv.contact_id);
            if (c)
              conv.contact_name =
                `${c.first_name || ""} ${c.last_name || ""}`.trim();
          }
        }
      }

      const list = [...phoneMap.values()].sort(
        (a, b) =>
          new Date(b.last_message_time).getTime() -
          new Date(a.last_message_time).getTime()
      );
      setConversations(list);
    } catch (e: any) {
      toast.error("Error al cargar conversaciones: " + e.message);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const fetchMessages = useCallback(async (phone: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("phone_number", phone)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      setMessages((data as WaMessage[]) || []);
    } catch (e: any) {
      toast.error("Error al cargar mensajes: " + e.message);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectConversation = useCallback(
    async (phone: string) => {
      setSelectedPhone(phone);
      fetchMessages(phone);
      // Optimistic local clear
      setConversations((prev) =>
        prev.map((c) =>
          c.phone_number === phone ? { ...c, unread_count: 0 } : c
        )
      );
      // Persist read state in DB so it survives refresh.
      // Done as a direct UPDATE (no RPC) so RLS handles authorization and
      // we don't depend on a server-side function existing.
      try {
        await supabase
          .from("whatsapp_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("phone_number", phone)
          .eq("direction", "incoming")
          .is("read_at", null);
      } catch (_) { /* non-fatal — at worst the badge comes back on refresh */ }
    },
    [fetchMessages]
  );

  // Manually mark a conversation as unread (sets the most recent incoming
  // message's read_at back to NULL so the badge re-appears).
  // Implemented as a direct query (no RPC) for robustness.
  const markAsUnread = useCallback(async (phone: string) => {
    try {
      // Find the most recent incoming message for this phone
      const { data: latest, error: selErr } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("phone_number", phone)
        .eq("direction", "incoming")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!latest) {
        toast.error("No hay mensajes entrantes para marcar como no leído");
        return;
      }
      const { error: updErr } = await supabase
        .from("whatsapp_messages")
        .update({ read_at: null })
        .eq("id", latest.id);
      if (updErr) throw updErr;

      // Optimistic local update — bump unread count
      setConversations((prev) =>
        prev.map((c) =>
          c.phone_number === phone ? { ...c, unread_count: Math.max(1, c.unread_count) } : c,
        ),
      );
      // If this is the currently-open conversation, clear selection so the
      // badge is visible (no real "unread while viewing" state)
      if (selectedPhone === phone) setSelectedPhone(null);
      toast.success("Marcado como no leído");
    } catch (e: any) {
      toast.error("Error al marcar como no leído: " + (e?.message || "desconocido"));
    }
  }, [selectedPhone]);

  const sendMessage = useCallback(
    async (phone: string, message: string, contactId?: string | null, phoneNumberId?: string | null) => {
      setSending(true);
      // Optimistic local add
      const tempMsg: WaMessage = {
        id: crypto.randomUUID(),
        wa_message_id: null,
        phone_number: phone,
        direction: "outgoing",
        message_type: "text",
        message_text: message,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);
      try {
        const { data, error } = await supabase.functions.invoke(
          "send-whatsapp",
          { body: { phone, message, contact_id: contactId || null, phone_number_id: phoneNumberId || null } }
        );
        if (error || data?.error)
          throw new Error(data?.error || error?.message);
        // Update optimistic message with real id + status
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsg.id
              ? { ...m, wa_message_id: data.message_id, status: "sent" }
              : m
          )
        );
        setConversations((prev) =>
          prev
            .map((c) =>
              c.phone_number === phone
                ? {
                    ...c,
                    last_message: message,
                    last_message_time: new Date().toISOString(),
                    last_direction: "outgoing" as const,
                  }
                : c
            )
            .sort(
              (a, b) =>
                new Date(b.last_message_time).getTime() -
                new Date(a.last_message_time).getTime()
            )
        );
      } catch (e: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsg.id ? { ...m, status: "failed" } : m
          )
        );
        toast.error("Error al enviar: " + e.message);
      } finally {
        setSending(false);
      }
    },
    []
  );

  const fetchMedia = useCallback(async (messageId: string, waMediaId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "fetch_media", wa_media_id: waMediaId, message_id: messageId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data?.media_url) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, media_url: data.media_url } : m))
        );
      }
    } catch (e: any) {
      toast.error("No se pudo cargar el media: " + e.message);
    }
  }, []);

  const sendMedia = useCallback(
    async (phone: string, fileBase64: string, mimeType: string, filename: string, contactId?: string | null) => {
      setSending(true);
      const mimeBase = mimeType.split(";")[0].trim();
      const msgType = mimeBase.startsWith("image/") ? "image"
        : mimeBase.startsWith("video/") ? "video"
        : mimeBase.startsWith("audio/") ? "audio"
        : "document";

      // Optimistic local add
      const tempMsg: WaMessage = {
        id: crypto.randomUUID(),
        wa_message_id: null,
        phone_number: phone,
        direction: "outgoing",
        message_type: msgType,
        message_text: null,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-api", {
          body: {
            action: "send_media",
            phone,
            file_base64: fileBase64,
            mime_type: mimeType,
            filename,
            contact_id: contactId || null,
          },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsg.id
              ? { ...m, wa_message_id: data.message_id, status: "sent", media_url: data.media_url || null }
              : m
          )
        );
        setConversations((prev) =>
          prev
            .map((c) =>
              c.phone_number === phone
                ? {
                    ...c,
                    last_message: `[${msgType}]`,
                    last_message_time: new Date().toISOString(),
                    last_direction: "outgoing" as const,
                  }
                : c
            )
            .sort(
              (a, b) =>
                new Date(b.last_message_time).getTime() -
                new Date(a.last_message_time).getTime()
            )
        );
      } catch (e: any) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempMsg.id ? { ...m, status: "failed" } : m))
        );
        toast.error("Error al enviar: " + e.message);
      } finally {
        setSending(false);
      }
    },
    []
  );

  const sendTemplate = useCallback(
    async (
      phone: string,
      templateName: string,
      language: string,
      variables: string[],
      contactId?: string | null,
      headerMediaId?: string
    ) => {
      setSending(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "whatsapp-api",
          {
            body: {
              action: "send_template",
              phone,
              template_name: templateName,
              language,
              variables,
              header_media_id: headerMediaId || undefined,
              contact_id: contactId || null,
            },
          }
        );
        if (error || data?.error)
          throw new Error(data?.error || error?.message);
        toast.success("Plantilla enviada ✓");
        // Refresh messages for this phone
        await fetchMessages(phone);
        setConversations((prev) =>
          prev
            .map((c) =>
              c.phone_number === phone
                ? {
                    ...c,
                    last_message: `[Plantilla: ${templateName}]`,
                    last_message_time: new Date().toISOString(),
                    last_direction: "outgoing" as const,
                  }
                : c
            )
            .sort(
              (a, b) =>
                new Date(b.last_message_time).getTime() -
                new Date(a.last_message_time).getTime()
            )
        );
      } catch (e: any) {
        toast.error("Error al enviar plantilla: " + e.message);
      } finally {
        setSending(false);
      }
    },
    [fetchMessages]
  );

  // Realtime: new messages
  useEffect(() => {
    let userId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
    });

    const channel = supabase
      .channel("wa_inbox_realtime")
      // ── Status updates (delivered / read) ────────────────────────────────
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const msg = payload.new as WaMessage;
          // Reflect status change in the currently open conversation
          if (msg.phone_number === selectedPhone) {
            setMessages((prev) =>
              prev.map((m) => m.id === msg.id ? { ...m, ...msg } : m)
            );
          }
        }
      )
      // ── New incoming / outgoing messages ─────────────────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const msg = payload.new as WaMessage;

          // Add to open conversation (with dedup against optimistic temp messages)
          if (msg.phone_number === selectedPhone) {
            setMessages((prev) => {
              // Dedup by DB id OR by wa_message_id matching a recent optimistic
              // outgoing temp.  When sendMedia/sendMessage finishes successfully
              // it sets wa_message_id on the temp row; the realtime INSERT then
              // arrives with the real DB row.  Without this check the temp +
              // real both stay in state → visible duplicate.
              const dup = prev.find(
                (m) =>
                  m.id === msg.id ||
                  (msg.wa_message_id != null &&
                    m.wa_message_id === msg.wa_message_id),
              );
              if (dup) {
                // Merge the real DB row into the optimistic placeholder so we
                // pick up the canonical id + any server-side fields.
                return prev.map((m) =>
                  m === dup ? ({ ...m, ...msg } as WaMessage) : m,
                );
              }
              return [...prev, msg];
            });
          }

          // Update conversations list
          setConversations((prev) => {
            const exists = prev.find(
              (c) => c.phone_number === msg.phone_number
            );
            if (exists) {
              return prev
                .map((c) =>
                  c.phone_number === msg.phone_number
                    ? {
                        ...c,
                        last_message:
                          msg.message_text || `[${msg.message_type}]`,
                        last_message_time: msg.created_at,
                        last_direction: msg.direction,
                        unread_count:
                          msg.direction === "incoming" &&
                          msg.phone_number !== selectedPhone
                            ? c.unread_count + 1
                            : c.unread_count,
                      }
                    : c
                )
                .sort(
                  (a, b) =>
                    new Date(b.last_message_time).getTime() -
                    new Date(a.last_message_time).getTime()
                );
            } else {
              // Brand-new conversation — reload list
              fetchConversations();
              return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPhone, fetchConversations]);

  return {
    conversations,
    messages,
    selectedPhone,
    loadingConversations,
    loadingMessages,
    sending,
    fetchConversations,
    selectConversation,
    setSelectedPhone,
    markAsUnread,
    sendMessage,
    sendMedia,
    fetchMedia,
    sendTemplate,
  };
}

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
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
  const { organizationId } = useOrganizationContext();
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  // Paginación + búsqueda en servidor. La org puede tener MILES de conversaciones
  // (una por destinatario de envío masivo); cargarlas todas es imposible de
  // renderizar y buscar en cliente solo veía las cargadas. Ahora:
  //  - searchRef: término de búsqueda actual (server-side, sobre TODA la base).
  //  - limitRef: cuántas filas queremos ver (crece con "cargar más").
  // Toda recarga (realtime, marcar leído, etc.) reusa estos refs, así el filtro y
  // la paginación no se pierden al llegar un mensaje nuevo.
  const PAGE = 500;
  const searchRef = useRef<string | null>(null);
  const limitRef = useRef(PAGE);
  // Modo "solo no leídas": trae del servidor TODAS las conversaciones con
  // mensajes entrantes sin leer, aunque estén fuera de las más recientes. Sin
  // esto el filtro "No leídos" solo veía las cargadas y el conteo mentía.
  const unreadOnlyRef = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  // Guard "última recarga gana": durante ráfagas se disparan varias recargas en
  // paralelo; una vieja puede terminar después de una nueva y pisar la lista con
  // datos desordenados. Solo la más reciente aplica su resultado.
  const fetchSeqRef = useRef(0);

  // Derive conversation list from raw messages grouped by phone_number
  const fetchConversations = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    // Multi-org: never query without an org scope, or RLS would return rows from
    // EVERY org the user belongs to (a gestor/owner is in many) and mix inboxes.
    // NO vaciar la lista ya cargada: durante un refresh de sesión o el cambio de
    // organización el id puede quedar null por un instante; si una recarga
    // realtime cae en ese momento y hace setConversations([]), el inbox
    // "desaparece". Solo salimos sin tocar el estado (el efecto de montaje
    // recarga cuando la org resuelve). El cambio real de org sí reemplaza la
    // lista, porque entonces organizationId es un id válido distinto.
    if (!organizationId) { setLoadingConversations(false); return; }
    setLoadingConversations(true);
    try {
      // Una sola consulta (RPC) trae la ÚLTIMA conversación de CADA número, con
      // búsqueda y paginación en servidor. Siempre desde offset 0 hasta limitRef,
      // así una recarga refresca TODO lo que hay a la vista de una vez (sin merges
      // ni duplicados) y respeta el término de búsqueda vigente.
      const limit = limitRef.current;
      const { data: rows, error } = await supabase.rpc("wa_conversations", {
        p_org: organizationId,
        p_limit: limit,
        p_offset: 0,
        p_search: searchRef.current,
        p_unread_only: unreadOnlyRef.current,
      });
      if (error) throw error;
      const list: WaConversation[] = (rows || []).map((r: any) => ({
        phone_number: r.phone_number,
        contact_id: r.contact_id || null,
        contact_name: r.contact_name || null,
        last_message: r.last_message || "",
        last_message_time: r.last_message_time,
        last_direction: (r.last_direction === "incoming" ? "incoming" : "outgoing") as "incoming" | "outgoing",
        unread_count: Number(r.unread_count) || 0,
        from_phone_number_id: r.from_phone_number_id || null,
      }));
      // Descartar si otra recarga más reciente ya empezó (evita pisar con datos viejos).
      if (seq !== fetchSeqRef.current) return;
      // Si volvió exactamente el límite pedido, es probable que haya más → "cargar más".
      setHasMore(list.length >= limit);
      setConversations(list);
    } catch (e: any) {
      toast.error("Error al cargar conversaciones: " + e.message);
    } finally {
      if (seq === fetchSeqRef.current) setLoadingConversations(false);
    }
  }, [organizationId]);

  // Buscar en servidor sobre TODA la base (nombre/teléfono/email). term vacío
  // vuelve a la vista reciente. Reinicia la paginación.
  const searchConversations = useCallback((term: string) => {
    const t = term.trim();
    searchRef.current = t ? t : null;
    limitRef.current = PAGE;
    fetchConversations();
  }, [fetchConversations]);

  // Cargar la siguiente página (crece el límite y recarga desde 0, barato con el
  // índice compuesto y sin duplicar filas).
  const loadMoreConversations = useCallback(() => {
    limitRef.current += PAGE;
    fetchConversations();
  }, [fetchConversations]);

  // Alternar el modo "solo no leídas". Al activarlo sube el límite para traerlas
  // todas (suelen ser pocas). Al desactivarlo vuelve a la vista reciente normal.
  const setUnreadOnly = useCallback((on: boolean) => {
    unreadOnlyRef.current = on;
    limitRef.current = on ? 1000 : PAGE;
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (phone: string) => {
    if (!organizationId) return;
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("organization_id", organizationId)
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
  }, [organizationId]);

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
        let upd = supabase
          .from("whatsapp_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("phone_number", phone)
          .eq("direction", "incoming")
          .is("read_at", null);
        if (organizationId) upd = upd.eq("organization_id", organizationId);
        await upd;
      } catch (_) { /* non-fatal — at worst the badge comes back on refresh */ }
    },
    [fetchMessages, organizationId]
  );

  // Manually mark a conversation as unread (sets the most recent incoming
  // message's read_at back to NULL so the badge re-appears).
  // Implemented as a direct query (no RPC) for robustness.
  const markAsUnread = useCallback(async (phone: string) => {
    try {
      // Find the most recent incoming message for this phone (scoped to org)
      let latestQ = supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("phone_number", phone)
        .eq("direction", "incoming");
      if (organizationId) latestQ = latestQ.eq("organization_id", organizationId);
      const { data: latest, error: selErr } = await latestQ
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
        body: { action: "fetch_media", wa_media_id: waMediaId, message_id: messageId, organization_id: organizationId ?? null },
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
    // organizationId in deps — with [] this closed over the first-render value
    // (null), so the backend fell back to the viewer's own config and media
    // downloads failed for multi-org users with a 190 from the wrong token.
  }, [organizationId]);

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
            organization_id: organizationId ?? null,
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
    // organizationId in deps — [] froze the first-render null and the backend
    // rejected send_media for multi-org users ("organization_id es obligatorio").
    [organizationId]
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
              organization_id: organizationId ?? null,
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
    [fetchMessages, organizationId]
  );

  // Realtime: new messages
  useEffect(() => {
    let userId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
    });

    if (!organizationId) return;
    const channel = supabase
      .channel(`wa_inbox_realtime_${organizationId}`)
      // ── Status updates (delivered / read) ────────────────────────────────
      // Filtrado por organización: el mismo número puede existir como contacto
      // en varias orgs (usuarios multi-org) y sin filtro los mensajes de otra
      // organización se inyectaban en el hilo abierto.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `organization_id=eq.${organizationId}` },
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
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `organization_id=eq.${organizationId}` },
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
  }, [selectedPhone, fetchConversations, organizationId]);

  return {
    conversations,
    messages,
    selectedPhone,
    loadingConversations,
    loadingMessages,
    sending,
    hasMore,
    fetchConversations,
    searchConversations,
    loadMoreConversations,
    setUnreadOnly,
    selectConversation,
    setSelectedPhone,
    markAsUnread,
    sendMessage,
    sendMedia,
    fetchMedia,
    sendTemplate,
  };
}

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";

/**
 * Tracks unread message counts for WhatsApp and Instagram inboxes for the
 * current user.  Subscribes to realtime changes so the badges in the sidebar
 * stay live without polling.
 */
export function useUnreadCounts() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [waUnread, setWaUnread] = useState(0);
  const [igUnread, setIgUnread] = useState(0);
  const [msUnread, setMsUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setWaUnread(0);
      setIgUnread(0);
      setMsUnread(0);
      return;
    }
    // Badge counts unread CONVERSATIONS (matching the inbox "No leídos"), not raw
    // messages. Scoped ORG-WIDE so it reflects the whole team's inbox.
    // WhatsApp — distinct conversations (phone numbers) with unread incoming msgs.
    let waQ = supabase
      .from("whatsapp_messages")
      .select("phone_number")
      .eq("direction", "incoming")
      .is("read_at", null)
      .limit(1000);
    waQ = organizationId ? waQ.eq("organization_id", organizationId) : waQ.eq("user_id", user.id);
    const { data: waRows } = await waQ;
    const waConvs = new Set((waRows || []).map((r: any) => r.phone_number).filter(Boolean));
    setWaUnread(waConvs.size);

    // Instagram — count-only (no rows transferred)
    let igQ = supabase.from("instagram_conversations").select("id", { count: "exact", head: true }).gt("unread_count", 0);
    igQ = organizationId ? igQ.eq("organization_id", organizationId) : igQ.eq("user_id", user.id);
    const { count: igCount } = await igQ;
    setIgUnread(igCount || 0);

    // Messenger — count-only
    let msQ = supabase.from("messenger_conversations").select("id", { count: "exact", head: true }).gt("unread_count", 0);
    msQ = organizationId ? msQ.eq("organization_id", organizationId) : msQ.eq("user_id", user.id);
    const { count: msCount } = await msQ;
    setMsUnread(msCount || 0);
  }, [user, organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Debounced refresh — coalesce event bursts into one query round
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refresh(), 2000);
  }, [refresh]);

  // Realtime subscriptions — refresh on any change to incoming-message tables
  useEffect(() => {
    if (!user) return;
    const waFilter = organizationId ? `organization_id=eq.${organizationId}` : `user_id=eq.${user.id}`;
    const channel = supabase
      .channel(`unread-${organizationId || user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: waFilter },
        () => debouncedRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instagram_conversations", filter: waFilter },
        () => debouncedRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messenger_conversations", filter: waFilter },
        () => debouncedRefresh(),
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, organizationId, refresh, debouncedRefresh]);

  return { waUnread, igUnread, msUnread, totalUnread: waUnread + igUnread + msUnread, refresh };
}

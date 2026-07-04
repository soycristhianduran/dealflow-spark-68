import { useEffect, useState, useCallback } from "react";
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
      .limit(5000);
    waQ = organizationId ? waQ.eq("organization_id", organizationId) : waQ.eq("user_id", user.id);
    const { data: waRows } = await waQ;
    const waConvs = new Set((waRows || []).map((r: any) => r.phone_number).filter(Boolean));
    setWaUnread(waConvs.size);

    // Instagram — conversations with unread_count > 0.
    let igQ = supabase.from("instagram_conversations").select("id").gt("unread_count", 0);
    igQ = organizationId ? igQ.eq("organization_id", organizationId) : igQ.eq("user_id", user.id);
    const { data: igConvs } = await igQ;
    setIgUnread((igConvs || []).length);

    // Messenger — conversations with unread_count > 0.
    let msQ = supabase.from("messenger_conversations").select("id").gt("unread_count", 0);
    msQ = organizationId ? msQ.eq("organization_id", organizationId) : msQ.eq("user_id", user.id);
    const { data: msConvs } = await msQ;
    setMsUnread((msConvs || []).length);
  }, [user, organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime subscriptions — refresh on any change to incoming-message tables
  useEffect(() => {
    if (!user) return;
    const waFilter = organizationId ? `organization_id=eq.${organizationId}` : `user_id=eq.${user.id}`;
    const channel = supabase
      .channel(`unread-${organizationId || user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: waFilter },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instagram_conversations", filter: waFilter },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messenger_conversations", filter: waFilter },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, organizationId, refresh]);

  return { waUnread, igUnread, msUnread, totalUnread: waUnread + igUnread + msUnread, refresh };
}

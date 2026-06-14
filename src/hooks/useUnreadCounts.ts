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

  const refresh = useCallback(async () => {
    if (!user) {
      setWaUnread(0);
      setIgUnread(0);
      return;
    }
    // Inboxes are shared ORG-WIDE — scope by organization so badges reflect the
    // whole team's inbox, not just messages tied to the current user.
    // WhatsApp — count incoming messages with read_at IS NULL
    let waQ = supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "incoming")
      .is("read_at", null);
    waQ = organizationId ? waQ.eq("organization_id", organizationId) : waQ.eq("user_id", user.id);
    const { count: waCount } = await waQ;
    setWaUnread(waCount || 0);

    // Instagram — sum unread_count across conversations
    let igQ = supabase.from("instagram_conversations").select("unread_count");
    igQ = organizationId ? igQ.eq("organization_id", organizationId) : igQ.eq("user_id", user.id);
    const { data: igConvs } = await igQ;
    const total = (igConvs || []).reduce((s, c: any) => s + (c.unread_count || 0), 0);
    setIgUnread(total);
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, organizationId, refresh]);

  return { waUnread, igUnread, totalUnread: waUnread + igUnread, refresh };
}

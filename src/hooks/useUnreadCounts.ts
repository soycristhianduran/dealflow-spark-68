import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks unread message counts for WhatsApp and Instagram inboxes for the
 * current user.  Subscribes to realtime changes so the badges in the sidebar
 * stay live without polling.
 */
export function useUnreadCounts() {
  const { user } = useAuth();
  const [waUnread, setWaUnread] = useState(0);
  const [igUnread, setIgUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setWaUnread(0);
      setIgUnread(0);
      return;
    }
    // WhatsApp — count incoming messages with read_at IS NULL
    const { count: waCount } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("direction", "incoming")
      .is("read_at", null);
    setWaUnread(waCount || 0);

    // Instagram — sum unread_count across conversations
    const { data: igConvs } = await supabase
      .from("instagram_conversations")
      .select("unread_count")
      .eq("user_id", user.id);
    const total = (igConvs || []).reduce((s, c: any) => s + (c.unread_count || 0), 0);
    setIgUnread(total);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime subscriptions — refresh on any change to incoming-message tables
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instagram_conversations", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  return { waUnread, igUnread, totalUnread: waUnread + igUnread, refresh };
}

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RealtimeRefreshOptions {
  /** Table name to subscribe to */
  table: string;
  /** Optional filter, e.g. `contact_id=eq.${id}` */
  filter?: string;
  /** Which events to listen for */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Channel name suffix to avoid collisions */
  channelKey: string;
  /** Called every time a relevant change happens */
  onChange: (payload?: any) => void;
  /** Set to false to skip subscription (e.g. while id is undefined) */
  enabled?: boolean;
}

/**
 * Generic helper that subscribes to Supabase postgres_changes and calls
 * onChange whenever a relevant row event arrives.  Cleans up on unmount.
 *
 * Use this in any page that needs to stay in sync with database changes
 * without manual refresh.  Common pattern:
 *
 *   useRealtimeRefresh({
 *     table: "deals",
 *     filter: `contact_id=eq.${contactId}`,
 *     channelKey: `deals-${contactId}`,
 *     onChange: () => fetchDeals(),
 *   });
 */
export function useRealtimeRefresh({
  table,
  filter,
  event = "*",
  channelKey,
  onChange,
  enabled = true,
}: RealtimeRefreshOptions) {
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        // @ts-expect-error supabase types are loose for postgres_changes
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: any) => onChange(payload),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, enabled]);
}

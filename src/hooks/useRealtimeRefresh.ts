import { useEffect, useRef } from "react";
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
  /** Coalesce bursts: wait this long after the last event before firing
   *  onChange once. Prevents refetch storms on busy inboxes (mobile freeze). */
  debounceMs?: number;
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
  debounceMs = 0,
}: RealtimeRefreshOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const fire = (payload: any) => {
      if (!debounceMs) { onChange(payload); return; }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(payload), debounceMs);
    };
    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        // @ts-expect-error supabase types are loose for postgres_changes
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: any) => fire(payload),
      )
      .subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, enabled]);
}

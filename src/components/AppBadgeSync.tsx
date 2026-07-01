import { useEffect } from "react";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";

/**
 * Keeps the installed-PWA app-icon badge (iOS/Android Badging API) in sync with
 * the real unread count. Also tells the service worker the authoritative count so
 * its push-time increments start from the right base. Renders nothing.
 */
export function AppBadgeSync() {
  const { waUnread, igUnread } = useUnreadCounts();
  const unread = waUnread + igUnread;

  useEffect(() => {
    try {
      if ("setAppBadge" in navigator) {
        if (unread > 0) (navigator as any).setAppBadge(unread);
        else (navigator as any).clearAppBadge?.();
      }
    } catch { /* ignore */ }
    // Sync the authoritative count to the SW (so push increments are accurate).
    navigator.serviceWorker?.controller?.postMessage({ type: "setBadge", count: unread });
  }, [unread]);

  return null;
}

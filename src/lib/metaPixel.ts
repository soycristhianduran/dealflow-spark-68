/**
 * Meta Pixel + Conversions API (CAPI) helper.
 *
 * Every event is sent TWICE with the same `event_id`:
 *  1. Browser pixel (`fbq`) — fast, has the user's cookies.
 *  2. Server (CAPI edge function) — reliable, survives ad-blockers/iOS.
 * Meta deduplicates the pair by `event_id`, so you don't double-count.
 *
 * The access token lives ONLY server-side (Supabase secret). Nothing secret
 * is shipped in this client bundle — just the public Pixel ID.
 */

export const META_PIXEL_ID = "895291419505730";

const CAPI_URL = `${import.meta.env.VITE_SUPABASE_URL ?? "https://oqwcgvemrvimrdrzjzil.supabase.co"}/functions/v1/meta-capi`;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

type UserData = { email?: string; phone?: string; firstName?: string; lastName?: string };

/**
 * Track a Meta event on both the browser pixel and the Conversions API.
 * @param eventName  Standard event ("PageView", "Lead", "CompleteRegistration", "Purchase", …) or custom.
 * @param customData Optional value/currency/content fields.
 * @param userData   Optional PII — hashed server-side before sending to Meta.
 */
export function trackEvent(
  eventName: string,
  customData: Record<string, unknown> = {},
  userData: UserData = {},
): void {
  const eventId = uuid();

  // 1) Browser pixel (with eventID for dedup)
  try {
    window.fbq?.("track", eventName, customData, { eventID: eventId });
  } catch {
    /* pixel may be blocked — CAPI still covers it */
  }

  // 2) Conversions API (server) — fire and forget
  try {
    const payload = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      fbp: getCookie("_fbp"),
      fbc: getCookie("_fbc"),
      custom_data: customData,
      user_data: userData,
    };
    fetch(CAPI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let analytics break the app */
  }
}

/** Fire a deduplicated PageView (call once per route view). */
export function trackPageView(): void {
  trackEvent("PageView");
}

import { supabase } from "@/integrations/supabase/client";

// VAPID public key (safe to expose). Private key lives only as a Supabase secret.
const VAPID_PUBLIC_KEY = "BLni30xzu8RHrm7HoQ9gmDrdPVa7nyW41eln-shw577W4ac_tVEf7hsWsxYnGTOfNEg0JR6gnmUQtxG4RJ3PIpA";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Ask permission, subscribe, and store the subscription for the current user/org. */
export async function enablePush(organizationId: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json: any = sub.toJSON();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return { ok: false, reason: "no_user" };

  await supabase.from("push_subscriptions").upsert({
    user_id: uid,
    organization_id: organizationId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
  }, { onConflict: "endpoint" });

  return { ok: true };
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub && Notification.permission === "granted";
}

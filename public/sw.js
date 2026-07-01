// Klosify CRM — service worker
// Enables PWA install + push notifications. Deliberately does NOT cache the app
// shell aggressively (a CRM must show fresh data), so navigation is network-first.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Network-first pass-through (keeps the SW "active" for installability without
// serving stale app data).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Let the browser handle it normally; we don't cache to avoid stale UI.
});

// ── Tiny IndexedDB counter for the app-icon badge ─────────────────────────────
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("klosify-badge", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("meta");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function getBadge() {
  try { const db = await idb(); return await new Promise((res) => { const t = db.transaction("meta").objectStore("meta").get("count"); t.onsuccess = () => res(t.result || 0); t.onerror = () => res(0); }); }
  catch { return 0; }
}
async function setBadge(n) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction("meta", "readwrite").objectStore("meta").put(n, "count"); t.onsuccess = () => res(); t.onerror = () => res(); }); } catch { /* ignore */ }
  try { if (n > 0) await self.navigator.setAppBadge?.(n); else await self.navigator.clearAppBadge?.(); } catch { /* ignore */ }
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Klosify";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil((async () => {
    const next = (await getBadge()) + 1;
    await setBadge(next);
    await self.registration.showNotification(title, options);
  })());
});

// The app syncs the real unread count (or clears it when messages are read).
self.addEventListener("message", (event) => {
  if (event.data?.type === "setBadge") event.waitUntil(setBadge(Number(event.data.count) || 0));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});

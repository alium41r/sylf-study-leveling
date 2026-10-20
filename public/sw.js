// Sylf Lightweight PWA Service Worker
// Enables standalone Web App installation (beforeinstallprompt) without
// caching authenticated APIs or page responses. Notes gets only a public locked offline fallback.

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("sylf-notes-public-shell-v1").then(cache => cache.add("/notes-offline.html")).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate" && url.origin === self.location.origin && url.pathname === "/notes") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open("sylf-notes-public-shell-v1")).match("/notes-offline.html").then(response => response || new Response("Reconnect to Sylf to unlock Notes.", { status: 503, headers: { "Content-Type": "text/plain" } }))));
  }
  // Network-native pass-through to preserve real-time study sessions, SSE, and auth state.
});

// Alerts are requested by a running authenticated client. No push/background
// scheduling is promised, and no personal calendar content is cached here.
self.addEventListener("notificationclick", (event) => {
  const date = event.notification.data?.calendarDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(`/calendar?date=${date}`, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(item => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  })());
});

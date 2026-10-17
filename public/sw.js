// Sylf Lightweight PWA Service Worker
// Enables standalone Web App installation (beforeinstallprompt) without
// intercepting or caching authenticated API/navigation requests.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-native pass-through to preserve real-time study sessions, SSE, and auth state.
});

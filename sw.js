/* ============================================================
   QeyasQuiz — Service Worker
   ============================================================ */

const CACHE_NAME = "qeyasquiz-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] pre-cache failed:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase Auth و Google — متعترضهمش أبدا
  if (
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("accounts.google.com") ||
    url.pathname.includes("/__/auth/") ||
    url.hostname.includes("googleapis.com")
  ) {
    return;
  }

  // API requests - network first, no cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }))
    );
    return;
  }

  // Cloudinary - cache first
  if (url.hostname.includes("cloudinary.com")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Static - cache first, fallback network
  if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          if (request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503 });
        });
      })
    );
    return;
  }
});

// Message
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

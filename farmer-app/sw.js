const FARMER_CACHE = "utsav-farmer-v1";
const FARMER_ASSETS = [
  "/farmer-app/",
  "/farmer-app/index.html",
  "/farmer-app/styles.css?v=20260554",
  "/farmer-app/app.js?v=20260557",
  "/farmer-app/manifest.webmanifest",
  "/farmer-app/icons/icon-192.png",
  "/farmer-app/icons/icon-512.png",
  "/farmer-app/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(FARMER_CACHE).then((cache) => cache.addAll(FARMER_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== FARMER_CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(FARMER_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match("/farmer-app/dashboard.html")) ||
            (await caches.match("/farmer-app/index.html"))
          );
        })
    );
    return;
  }

  if (url.pathname.startsWith("/farmer-app/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(FARMER_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        });
      })
    );
  }
});

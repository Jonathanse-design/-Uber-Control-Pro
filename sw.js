const CACHE_NAME = "uber-control-pro-v25";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=25",
  "./historical-data.js?v=25",
  "./app.js?v=25",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/logo-dashboard.svg",
  "./icons/logo-full.svg",
  "./icons/logo-white.svg",
  "./icons/logo-black.svg",
  "./icons/icon-1024.png",
  "./icons/icon-512.png",
  "./icons/icon-256.png",
  "./icons/icon-192.png",
  "./icons/icon-180.png",
  "./icons/favicon.png",
  "./icons/splash-logo.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(
      ASSETS.map(asset => cache.add(asset).catch(() => null))
    ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});

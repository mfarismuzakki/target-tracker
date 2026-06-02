/* Service Worker — cache "app shell" agar aplikasi bisa dibuka saat offline.
   Data (panggilan ke Apps Script) TIDAK di-cache; selalu lewat jaringan. */
const CACHE = "target-keluarga-v1";
const SHELL = [
  ".",
  "index.html",
  "css/styles.css",
  "js/config.js",
  "js/api.js",
  "js/store.js",
  "js/hijri.js",
  "js/captcha.js",
  "js/stats.js",
  "js/ui.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Hanya tangani GET untuk file di origin kita; biarkan request data lewat apa adanya.
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Network-first: saat online selalu pakai versi terbaru (perubahan langsung terlihat),
  // dan simpan salinannya. Saat offline, pakai salinan dari cache.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});

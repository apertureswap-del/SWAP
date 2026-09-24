/* SWAP 입출고 — 서비스 워커 (설치 가능 조건 + 오프라인 대비)
   항상 서버에 새 파일이 있는지 먼저 확인(no-cache)하고, 실패할 때만 저장해 둔 사본을 쓴다. */
const CACHE = 'swap-v2';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  // 우리 사이트의 화면 파일만 다룬다. API(구글)나 CDN은 건드리지 않음.
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});

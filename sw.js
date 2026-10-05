/* SWAP 입출고 — 서비스 워커 (설치 가능 조건 + 오프라인 대비 + 작업보고 알림)
   항상 서버에 새 파일이 있는지 먼저 확인(no-cache)하고, 실패할 때만 저장해 둔 사본을 쓴다. */
const CACHE = 'swap-v3';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  // 우리 사이트의 화면 파일만 다룬다. API(구글)나 CDN은 건드리지 않음.
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  if (/\.(mp4|webm|m4v)$/i.test(url.pathname)) return;   // 영상은 브라우저가 부분 요청(Range)으로 직접 받게 둔다 (캐시 저장 불가)
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});

/* 작업보고 알림 (v10.30 · v10.31): 서버(pushTick)가 암호화해 보낸 {title, body, url, tag} (예: "10월 5일 작업보고를 하지 않은 상태에요! 보고해주세요.")
   내용이 없거나 못 읽으면 기본 문구. 누르면 앱의 업무보고 화면(그 날짜)으로 · 날짜마다 따로 쌓임(tag) */
self.addEventListener('push', function (e) {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  const url = (typeof d.url === 'string' && /^\.\/\?go=report(&d=\d{4}-\d{2}-\d{2})?$/.test(d.url)) ? d.url : './?go=report';   // 우리 앱 안 주소만
  e.waitUntil(self.registration.showNotification(String(d.title || 'S&P 워크+ · 작업보고').slice(0, 80), {
    body: String(d.body || '아직 작업보고를 안 했어요. 눌러서 업무보고를 보내 주세요.').slice(0, 200),
    icon: 'icon-192.png', badge: 'icon-192.png', tag: String(d.tag || 'report-remind').slice(0, 40), renotify: true,
    data: { url: url }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const rel = (e.notification.data && e.notification.data.url) || './?go=report', url = new URL(rel, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (w.url.indexOf(self.registration.scope) === 0 && 'focus' in w) { try { w.postMessage({ go: 'report', url: url }); } catch (x) {} return w.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});

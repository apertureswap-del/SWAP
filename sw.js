/* SWAP 입출고 — 서비스 워커 (설치 가능 조건 + 오프라인 대비 + 작업보고 알림)
   서버에 새 파일이 있는지 먼저 확인(no-cache)하고, 실패하거나 1.5초 안에 안 오면 저장해 둔 사본을 쓴다 (v10.41 — 창고처럼 신호가 약하면 흰 화면으로 오래 기다리던 것).
   늦게 온 새 파일은 받는 대로 저장 → 다음에 열 때 새 버전. */
const CACHE = 'swap-v4';
const NET_WAIT_MS = 1500;
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
  const nav = e.request.mode === 'navigate';
  const key = nav ? new Request(url.origin + url.pathname) : e.request;   // 화면(index.html)은 주소 뒤 ?q= 등과 상관없이 한 벌만 저장
  const net = fetch(e.request, { cache: 'no-cache' });
  // 받은 파일 저장 (화면엔 저장이 끝나길 기다리지 않고 바로 줌 · 이 then 이 먼저 등록돼 있어 화면이 읽기 전에 복사본을 뜸) · 저장본을 먼저 줬어도 끝까지 받아 저장
  e.waitUntil(net.then(function (res) { if (res && res.ok) { const copy = res.clone(); return caches.open(CACHE).then(function (c) { return c.put(key, copy); }); } }).catch(function () {}));
  e.respondWith(new Promise(function (resolve) {
    let done = false;
    const give = function (r) { if (!done && r) { done = true; resolve(r); } };
    const cached = function () { return caches.match(key, { ignoreSearch: nav }); };
    const bust = nav && /[?&]r=/.test(url.search);   // ?r= (새 버전 바로 보기 · README) 은 저장본으로 대신하지 않음 (네트워크가 아예 안 되면만)
    const t = bust ? 0 : setTimeout(function () { cached().then(give); }, NET_WAIT_MS);   // 1.5초 안에 안 오면 저장본 (없으면 계속 기다림)
    net.then(function (res) { clearTimeout(t); give(res); },
      function () { clearTimeout(t); cached().then(function (hit) { give(hit || Response.error()); }); });
  }));
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

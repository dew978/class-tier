/* 클래스 티어 서비스 워커 — 태블릿·PC에 「앱으로 설치」하기 위한 파일
   화면 파일은 인터넷이 되면 늘 새로 받고(새 버전이 바로 보임), 인터넷이 끊겼을 때만 저장해 둔 것을 씁니다.
   Firebase·글꼴·아바타 같은 다른 주소의 요청은 건드리지 않습니다. */
const CACHE = 'class-tier-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = await caches.match('./');
        if (home) return home;
      }
      throw err;
    }
  })());
});

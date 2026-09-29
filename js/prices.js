/* 실제 주식 시세 반영
   1) 시세 봇(tools/price-bot.gs, 선생님 Google 계정의 Apps Script)이 평일 장중 1분마다 Firebase에 바로 저장
      → 선생님 화면이 꺼져 있어도 학생 화면의 가격이 바뀜
   2) 봇이 없거나 5분 넘게 조용할 때만: GitHub Actions가 받아 둔 prices.json(prices 브랜치)을
      선생님 화면이 켜져 있는 동안 읽어 저장 (GitHub 예약 실행은 몇 시간씩 밀릴 수 있음)
   학생 화면은 가격을 바꿀 수 없고(보안 규칙), 시세가 30분 넘게 오래되면 실제 주식 거래가 멈춥니다. */
(function () {
  const A = window.App;
  const { S, B } = A;
  // GitHub Pages(아이디.github.io/저장소)에서 열면 그 저장소의 시세를, 아니면 기본 저장소의 시세를 씀
  function repo() {
    if (window.CLASSTIER_PRICE_REPO) return window.CLASSTIER_PRICE_REPO;
    const h = location.hostname;
    const first = location.pathname.split('/')[1];
    if (h.endsWith('.github.io') && first) return `${h.split('.')[0]}/${first}`;
    return 'dew978/class-tier';
  }
  let timer = null, last = 0, lastSyms = null, busy = false, unsub = null;
  async function fetchFeed() {
    const r = repo();
    // raw 주소는 호출 한도가 없음 (?t= 로 캐시를 피함), 안 되면 GitHub API (한 시간 60번 한도)
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${r}/prices/prices.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* 아래 주소로 다시 시도 */ }
    const res = await fetch(`https://api.github.com/repos/${r}/contents/prices.json?ref=prices`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('아직 시세 파일이 없어요');
    return res.json();
  }
  const reals = () => Object.entries(S.market || {}).filter(([, s]) => s && s.ty === 'real' && s.sym);
  // 시세 봇이 5분 안에 일했으면 봇에게 맡김
  const botOk = () => !!(S.priceBot && Date.now() - (S.priceBot.at || 0) < 5 * 60000);
  // 시세 봇이 받아 올 종목 목록 (공개 경로: 종목 번호만 있고 학생 정보는 없음)
  async function publishSymbols() {
    const syms = [...new Set(reals().map(([, s]) => `${s.mk === 'US' ? 'US' : 'KRX'}:${s.sym}`))].sort().join(',');
    if (syms === lastSyms) return;
    const cur = await B.get('pub/symbols').catch(() => undefined);
    if (cur === undefined) return;
    if ((cur || '') !== syms) await B.set('pub/symbols', syms || null);
    lastSyms = syms;
  }
  async function refresh(force) {
    if (!S.isTeacher || busy) return;
    busy = true;
    try {
      await publishSymbols();
      const list = reals();
      if (!list.length || (!force && (botOk() || Date.now() - last < 55000))) return;
      last = Date.now();
      const d = await fetchFeed();
      const upd = {};
      for (const [sid, s] of list) {
        const us = s.mk === 'US';
        const q = us ? d.US && d.US[s.sym] : d.KRX && d.KRX[s.sym];
        if (!q || !(q.p > 0) || (us && !(d.fx > 0))) continue;
        // 저장된 시세가 파일보다 새것이면(시세 봇이 먼저 저장) 옛 값으로 되돌리지 않음
        if ((s.ut || 0) >= d.at) continue;
        const base = `market/${sid}/`;
        upd[base + 'p'] = Math.round(us ? q.p * d.fx : q.p);
        upd[base + 'ch'] = Number(q.ch) || 0;
        upd[base + 'ut'] = d.at;
        if (us) upd[base + 'usd'] = q.p;
      }
      if (Object.keys(upd).length) await B.update('', upd);
      S.priceInfo = { at: d.at, ok: true, err: d.err && Object.keys(d.err).length ? Object.keys(d.err).join(', ') : '' };
    } catch (e) {
      S.priceInfo = { ok: false, msg: e.message };
      console.info('[시세]', e.message);
    } finally { busy = false; }
  }
  window.PriceFeed = {
    start() {
      if (timer) return;
      unsub = B.on('pub/priceBot', (v) => { S.priceBot = v || null; A.render(); });
      setTimeout(() => refresh(true), 1500);
      timer = setInterval(() => refresh(false), 60000);
    },
    stop() { clearInterval(timer); timer = null; lastSyms = null; last = 0; if (unsub) { unsub(); unsub = null; } },
    refresh,
    botOk,
  };
})();

/* 클래스 티어 주식 시세 봇 — Google Apps Script (선생님 Google 계정에서 실행)
   평일 장중에는 1분마다 네이버 증권(안 되면 야후)에서 실제 주식 시세를 받아 Firebase에 바로 저장합니다.
   → 선생님 화면을 켜 두지 않아도 학생 화면의 실제 주식 가격이 1분마다 바뀝니다.
   (GitHub Actions 예약 실행은 몇 시간씩 밀리는 일이 많아 이 봇으로 바꿈)

   처음 한 번만:
   1) https://script.google.com 에서 새 프로젝트 → 이 코드를 Code.gs 에 붙여 넣기
   2) 프로젝트 설정 → 「appsscript.json 매니페스트 파일 표시」 체크 → appsscript.json 을 tools/price-bot.appsscript.json 내용으로 바꾸기
   3) 위쪽 함수 목록에서 setup 고르고 실행 → 권한 허용
      (Firebase 프로젝트를 만든 Google 계정이어야 Firebase에 쓸 수 있어요)
   멈추려면 stop 실행. */
const DB = 'https://class-tier-default-rtdb.asia-southeast1.firebasedatabase.app';
const UA = { 'User-Agent': 'Mozilla/5.0 (class-tier price bot)', Accept: 'application/json' };

// 1분마다 실행되도록 예약하고, 한 번 바로 받아 봄
function setup() {
  stop();
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  Logger.log(run(true));
}
function stop() {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
}
function tick() { run(false); }

// 한국 시간 평일 08:55~15:40에만 받음 (그 밖에는 바로 끝내 하루 실행 시간 한도를 아낌)
function inSession() {
  const k = new Date(Date.now() + 9 * 3600e3);
  const day = k.getUTCDay(), min = k.getUTCHours() * 60 + k.getUTCMinutes();
  return day >= 1 && day <= 5 && min >= 535 && min <= 940;
}

function run(force) {
  if (!force && !inSession()) return '장 시간이 아니라 쉬어요';
  const token = ScriptApp.getOAuthToken();
  const market = getJson(DB + '/market.json?access_token=' + token) || {};
  const upd = {}, err = {};
  let n = 0, fx = null;
  for (const sid of Object.keys(market)) {
    const s = market[sid];
    if (!s || s.ty !== 'real' || !s.sym) continue;
    try {
      const us = s.mk === 'US';
      const q = us ? yahoo(s.sym) : krx(s.sym);
      let p = q.p;
      if (us) {
        if (fx === null) fx = yahoo('KRW=X').p;
        p = Math.round(q.p * fx);
        upd['market/' + sid + '/usd'] = q.p;
      }
      upd['market/' + sid + '/p'] = p;
      upd['market/' + sid + '/ch'] = q.ch;
      // 장이 열려 있을 때만 시세 시각을 새로 씀 → 휴장일에는 30분 뒤 실제 주식 거래가 저절로 멈춤
      if (q.open) upd['market/' + sid + '/ut'] = Date.now();
      n++;
    } catch (e) { err[s.sym] = String(e.message || e).slice(0, 80); }
  }
  upd['pub/priceBot'] = { at: Date.now(), n: n, err: Object.keys(err).length ? err : null };
  const r = UrlFetchApp.fetch(DB + '/.json?access_token=' + token, { method: 'patch', contentType: 'application/json', payload: JSON.stringify(upd), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Firebase에 저장하지 못했어요 (' + r.getResponseCode() + ') ' + r.getContentText().slice(0, 200));
  return n + '개 종목 시세 저장' + (Object.keys(err).length ? ' · 못 받은 종목 ' + JSON.stringify(err) : '');
}

function getJson(url) {
  const r = UrlFetchApp.fetch(url, { headers: UA, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error(r.getResponseCode() + ' ' + url.replace(/access_token=[^&]+/, 'access_token=…'));
  return JSON.parse(r.getContentText());
}
function num(s) { return Number(String(s == null ? '' : s).replace(/,/g, '')); }

function naver(code) {
  const j = getJson('https://m.stock.naver.com/api/stock/' + code + '/basic');
  const p = num(j.closePrice);
  if (!(p > 0)) throw new Error('가격 없음');
  return { p: p, ch: num(j.fluctuationsRatio) || 0, open: j.marketStatus === 'OPEN' };
}
function yahoo(sym) {
  const j = getJson('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=5m');
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error('가격 없음');
  const prev = m.chartPreviousClose || m.previousClose || 0;
  const reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  const now = Date.now() / 1000;
  return { p: m.regularMarketPrice, ch: prev ? Math.round(((m.regularMarketPrice - prev) / prev) * 10000) / 100 : 0, open: !!(reg && now >= reg.start && now <= reg.end) };
}
function krx(code) {
  try { return naver(code); } catch (e) { /* 네이버가 막히면 야후로 */ }
  try { return yahoo(code + '.KS'); } catch (e) { /* 코스닥 */ }
  return yahoo(code + '.KQ');
}

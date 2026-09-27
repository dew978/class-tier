// 주식 시세 받기 — GitHub Actions(.github/workflows/prices.yml)가 5~10분마다 실행
// 1) Firebase의 공개 경로 pub/symbols 에서 연결된 종목 목록을 읽고 (예: "KRX:005930,KRX:000660,US:AAPL")
// 2) 한국 주식은 네이버 증권(안 되면 야후 .KS/.KQ), 미국 주식과 환율은 야후에서 받아
// 3) prices.json 으로 저장 → 워크플로가 prices 브랜치에 올림 → 선생님 화면이 읽어 Firebase에 반영
// 사용: node tools/prices.mjs out/prices.json   (환경 변수 DB_URL = Firebase 실시간 데이터베이스 주소)
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DB = (process.env.DB_URL || '').replace(/\/$/, '');
const OUT = process.argv[2] || 'prices.json';
const UA = { 'User-Agent': 'Mozilla/5.0 (class-tier price bot)', Accept: 'application/json' };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const num = (s) => Number(String(s ?? '').replace(/,/g, ''));

async function naver(code) {
  const j = await getJson(`https://m.stock.naver.com/api/stock/${code}/basic`);
  const p = num(j.closePrice);
  if (!(p > 0)) throw new Error('가격 없음');
  return { p, ch: num(j.fluctuationsRatio) || 0, n: j.stockName || '', st: j.marketStatus || '', src: 'naver' };
}
async function yahoo(sym) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`);
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error('가격 없음');
  const prev = m.chartPreviousClose || m.previousClose || 0;
  return { p: m.regularMarketPrice, ch: prev ? Math.round(((m.regularMarketPrice - prev) / prev) * 10000) / 100 : 0, n: m.shortName || m.longName || '', cur: m.currency || '', src: 'yahoo' };
}
async function krx(code) {
  try { return await naver(code); } catch (e) { /* 네이버가 막히면 야후로 */ }
  try { return await yahoo(`${code}.KS`); } catch (e) { /* 코스닥 */ }
  return yahoo(`${code}.KQ`);
}

const raw = DB ? await getJson(`${DB}/pub/symbols.json`).catch((e) => { console.warn('종목 목록을 읽지 못함:', e.message); return ''; }) : '';
const list = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
const res = { at: Date.now(), KRX: {}, US: {}, fx: null, err: {} };
for (const item of list) {
  const [mk, sym] = item.split(':');
  if (!sym) continue;
  try {
    if (mk === 'KRX' && /^\d{6}$/.test(sym)) res.KRX[sym] = await krx(sym);
    else if (mk === 'US' && /^[A-Z.\-]{1,10}$/.test(sym)) res.US[sym] = await yahoo(sym);
  } catch (e) { res.err[item] = e.message; }
}
if (Object.keys(res.US).length) {
  try { res.fx = (await yahoo('KRW=X')).p; } catch (e) { res.err.fx = e.message; }
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(res));
console.log(`시세 ${Object.keys(res.KRX).length + Object.keys(res.US).length}/${list.length}개 저장`, Object.keys(res.err).length ? res.err : '');

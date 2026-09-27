/* 학급 경제 — 공용 로직 (학생·선생님 화면이 함께 씀)
   돈이 움직일 때마다 활동 기록(feed) 한 줄을 남기고, 계좌의 last를 그 기록으로 바꿉니다.
   잔액은 서버에서 더하기(inc)로 바꿔 여러 명이 동시에 거래해도 꼬이지 않고,
   보안 규칙(database.rules.json)이 기록과 잔액·아이템·예금·주식이 서로 맞는지 검사합니다. */
(function () {
  const A = window.App;
  const { S, B, esc } = A;
  const GOV = '_gov';
  const KST = 9 * 3600e3, DAY = 864e5;

  const DEFAULTS = {
    unit: '원',
    // 급여 소득세: 뗄지 말지(taxOn)와 세율(%) — 선생님이 급여 화면에서 정함
    taxOn: true,
    tax: 10,
    cats: ['권리', '고정지출', '공동구매'],
    bank: { on: true, days: 7, min: 1000, rates: { S: 2, A: 1.5, B: 1 }, def: 'B' },
    trade: { on: true, rs: 540, re: 930, cs: 0, ce: 1439, max: 30 },
    menus: { shop: true, jobs: true, bank: true, stock: true, quest: true, board: true },
    // 아바타 상점: 모양별 가격 (없으면 팔지 않음), 하루에 보여 줄 후보 수
    av: { on: true, n: 12, styles: { thumbs: 100000, 'fun-emoji': 150000, 'big-smile': 200000, 'lorelei-neutral': 200000, 'notionists-neutral': 200000, 'adventurer-neutral': 300000, 'croodles-neutral': 300000, 'bottts-neutral': 300000, 'pixel-art-neutral': 400000, dylan: 500000 } },
  };
  function cfg() {
    const c = JSON.parse(JSON.stringify(DEFAULTS));
    const r = S.econRaw;
    if (!r) return c;
    if (r.unit) c.unit = r.unit;
    if (r.tax !== undefined && isFinite(r.tax)) c.tax = Number(r.tax);
    if (r.taxOn === false) c.taxOn = false;
    if (Array.isArray(r.cats)) c.cats = r.cats.filter(Boolean);
    if (r.bank) { Object.assign(c.bank, r.bank); if (r.bank.rates) c.bank.rates = Object.assign({}, r.bank.rates); }
    if (r.trade) Object.assign(c.trade, r.trade);
    if (r.menus) Object.assign(c.menus, r.menus);
    if (r.av) { c.av.on = r.av.on !== false; if (r.av.n) c.av.n = r.av.n; c.av.styles = Object.assign({}, r.av.styles || {}); }
    else c.av.on = false;
    c.imported = r.imported || null;
    c.lastPay = r.lastPay || null;
    return c;
  }
  // 신용 등급: 이자율 높은 순
  const grades = () => Object.entries(cfg().bank.rates).sort((a, b) => b[1] - a[1]).map(([g]) => g);

  /* ── 표시 ── */
  const num = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
  const won = (n) => `${num(n)}${cfg().unit}`;
  const swon = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}${cfg().unit}`;
  const qty = (q) => (Number.isInteger(q) ? String(q) : Number(q).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
  const kday = (t) => Math.floor((t + KST) / DAY);
  const kmin = (t) => Math.floor(((t + KST) % DAY) / 60000);
  const kwd = (t) => (kday(t) + 4) % 7;
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

  /* ── 아바타 (DiceBear, 수페에서 쓰던 모양 그대로) ── */
  const AV_STYLES = ['thumbs', 'lorelei-neutral', 'notionists-neutral', 'big-smile', 'croodles-neutral', 'adventurer-neutral', 'fun-emoji', 'bottts-neutral', 'pixel-art-neutral', 'dylan', 'icons', 'shapes', 'rings', 'identicon', 'initials'];
  const STYLE_NAMES = { thumbs: '엄지', 'lorelei-neutral': '로렐라이', 'notionists-neutral': '스케치', 'big-smile': '큰 웃음', 'croodles-neutral': '낙서', 'adventurer-neutral': '모험가', 'fun-emoji': '이모지', 'bottts-neutral': '로봇', 'pixel-art-neutral': '픽셀', dylan: '딜런', icons: '아이콘', shapes: '도형', rings: '고리', identicon: '무늬', initials: '글자' };
  function acctOf(uid) {
    if (uid === S.uid && !S.isTeacher) return S.acct || {};
    return (S.accts && S.accts[uid]) || {};
  }
  function avatarUrl(style, seed) { return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`; }
  function avatar(uid, cls = '') {
    const av = acctOf(uid).avatar || {};
    const name = A.nameOf(uid);
    const style = av.style || 'thumbs';
    const seed = style === 'initials' ? name.slice(1) || name : av.seed || uid;
    return `<span class="av ${cls}"><b>${esc(name.slice(1, 2) || name.slice(0, 1) || '?')}</b><img src="${avatarUrl(style, seed)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }

  /* ── 자산 ── */
  const depMat = (d) => (d.s || 0) + (d.dd || 0) * DAY;
  const price = (sid) => { const m = S.market && S.market[sid]; return (m && m.p) || 0; };
  function worth(a) {
    a = a || {};
    const cash = a.cash || 0;
    let dep = 0, depI = 0, stock = 0, cost = 0;
    for (const d of Object.values(a.dep || {})) { dep += d.p || 0; depI += d.i || 0; }
    for (const [sid, h] of Object.entries(a.hold || {})) { stock += Math.floor((h.q || 0) * price(sid)); cost += h.c || 0; }
    return { cash, dep, depI, stock, cost, total: cash + dep + stock };
  }
  const itemCount = (a) => Object.values((a && a.items) || {}).reduce((s, n) => s + (n || 0), 0);

  // 기록 목록(오래된 것 → 최근)에 각 기록 뒤의 잔액(bal)을 붙임: 지금 잔액에서 거꾸로 계산
  function withBalance(list, cash) {
    let b = cash || 0;
    for (let i = list.length - 1; i >= 0; i--) { list[i].bal = b; b -= list[i].a || 0; }
    return list;
  }
  const toList = (obj) => Object.entries(obj || {}).map(([id, e]) => Object.assign({ id }, e)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  /* ── 기록 설명 ── */
  const KINDS = {
    send: ['💰', '선생님이 보낸 돈'], take: ['📤', '선생님이 가져간 돈'], wage: ['💼', '급여'], prize: ['🏅', '상금'], reward: ['🏆', '티어 보상금'],
    adj: ['🛠️', '잔액 조정'], item: ['🎁', '아이템 조정'], imp: ['📥', '가져온 잔액'], buy: ['🛒', '구매'], use: ['✨', '아이템 사용'],
    grp: ['🤝', '공동구매 참여'], ref: ['↩️', '공동구매 환불'], dep: ['🏦', '예금 가입'], wd: ['🏦', '예금 찾기'], sbuy: ['📈', '주식 매수'],
    ssell: ['📉', '주식 매도'], quest: ['🎯', '퀘스트 보상'], write: ['✏️', '글쓰기 통과'], av: ['🙂', '아바타 구매'], tax: ['🧾', '소득세'], gsend: ['🏛️', '국고 지출'], gtake: ['🏛️', '국고 수입'], gadj: ['🏛️', '국고 조정'],
  };
  function describe(e) {
    const [ic, base] = KINDS[e.k] || ['•', e.k];
    let t = base, sub = '';
    switch (e.k) {
      case 'send': t = e.m || base; if (e.src === 'gov') sub = '국고에서'; if (e.x) sub = `${sub ? sub + ' · ' : ''}세전 ${won(e.g)} · 세금 ${won(e.x)}`; break;
      case 'take': t = e.m || base; if (e.src === 'gov') sub = '국고로'; break;
      case 'wage': t = `급여${e.n ? ` · ${e.n}` : ''}`; sub = [e.x ? `세전 ${won(e.g)} · 소득세 ${won(e.x)}` : '', e.m].filter(Boolean).join(' · '); break;
      case 'prize': case 'reward': case 'adj': case 'gadj': t = e.m || base; if (e.x) sub = `세전 ${won(e.g)} · 세금 ${won(e.x)}`; break;
      case 'item': t = `${e.n || '아이템'} ${e.q > 0 ? '+' : ''}${e.q}개`; sub = e.m || '선생님이 조정'; break;
      case 'buy': t = `${e.n || '아이템'} ${e.q}개 구매`; break;
      case 'use': t = `${e.n || '아이템'} ${e.q}개 사용`; break;
      case 'grp': t = `${e.n || ''} 공동구매 참여`; break;
      case 'ref': t = `${e.n || ''} 공동구매 환불`; break;
      case 'dep': t = '예금 가입'; break;
      case 'wd': t = e.a > (e.p || 0) ? '예금 만기 (원금 + 이자)' : '예금 찾기 (중도 해지)'; if (e.a > (e.p || 0)) sub = `이자 ${won(e.a - e.p)}`; break;
      case 'sbuy': t = `${e.n || '주식'} ${qty(e.q)}주 매수`; sub = `1주 ${won(e.p)}`; break;
      case 'ssell': t = `${e.n || '주식'} ${qty(e.q)}주 매도`; sub = `1주 ${won(e.p)} · 손익 ${swon(e.a - (e.c || 0))}`; break;
      case 'quest': t = `퀘스트 보상${e.n ? ` · ${e.n}` : ''}`; sub = [e.m, e.i && e.q ? `아이템 +${e.q}개` : ''].filter(Boolean).join(' · '); break;
      case 'write': t = `글쓰기 통과${e.n ? ` · ${e.n}` : ''}`; sub = e.m || ''; break;
      case 'av': t = '아바타 구매'; sub = e.s || ''; break;
      case 'tax': t = e.m || '소득세'; break;
      case 'gsend': case 'gtake': t = e.m || base; break;
      case 'imp': t = e.m || base; break;
      default: if (e.m) t = e.m;
    }
    if (e.by === 'T' && ['buy', 'use', 'wd', 'ssell'].includes(e.k)) sub = `${sub ? sub + ' · ' : ''}선생님 처리`;
    return { ic, t, sub };
  }

  /* ── 거래 만들기: upd에 모아 한 번에 저장 (모두 성공하거나 모두 실패) ── */
  function addOp(upd, u, e) {
    const lid = B.newKey();
    const entry = Object.assign({ u, t: B.ts(), by: S.isTeacher ? 'T' : 'S' }, e);
    for (const k of Object.keys(entry)) if (entry[k] === undefined || entry[k] === null || entry[k] === '') delete entry[k];
    entry.a = Math.round(Number(e.a) || 0);
    if (entry.m) entry.m = String(entry.m).slice(0, 100);
    if (entry.n) entry.n = String(entry.n).slice(0, 60);
    upd['feed/' + lid] = entry;
    const base = u === GOV ? 'gov' : 'acct/' + u;
    if (entry.a) upd[base + '/cash'] = B.inc(entry.a);
    upd[base + '/last'] = lid;
    return lid;
  }
  const denyMsg = '처리하지 못했어요. 잔액·개수·거래 시간을 확인하고 다시 해 보세요.';
  async function commit(upd, okMsg) {
    try {
      await B.update('', upd);
      if (okMsg) A.toast(okMsg, 'good');
      return true;
    } catch (err) {
      console.warn('경제 처리 실패', err, upd);
      A.toast(/권한/.test(err.message) ? denyMsg : err.message, 'bad');
      return false;
    }
  }
  const taxOf = (gross, rate) => Math.floor((gross * rate) / 100);

  const ops = {
    /* 학생 */
    buy(iid, q) {
      const it = S.store[iid];
      const upd = {};
      addOp(upd, S.uid, { k: 'buy', a: -(it.p * q), i: iid, q, p: it.p, n: it.n });
      upd[`acct/${S.uid}/items/${iid}`] = B.inc(q);
      if (typeof it.st === 'number') upd[`store/items/${iid}/st`] = B.inc(-q);
      return commit(upd, `${it.n} ${q}개를 샀어요!`);
    },
    use(iid, q, name) {
      const upd = {};
      addOp(upd, S.uid, { k: 'use', a: 0, i: iid, q, n: name });
      upd[`acct/${S.uid}/items/${iid}`] = B.inc(-q);
      return commit(upd, `${name} ${q}개를 사용했어요. 선생님께 알림이 갔어요.`);
    },
    contribute(iid, amt) {
      const it = S.store[iid];
      const upd = {};
      addOp(upd, S.uid, { k: 'grp', a: -amt, i: iid, n: it.n });
      upd[`store/items/${iid}/r`] = B.inc(amt);
      upd[`store/contrib/${iid}/${S.uid}`] = B.inc(amt);
      return commit(upd, `${it.n} 공동구매에 ${won(amt)}을 보탰어요!`);
    },
    deposit(p) {
      const bank = cfg().bank;
      const a = S.acct || {};
      const r = bank.rates[a.grade] ?? bank.rates[bank.def];
      const did = B.newKey();
      const upd = {};
      addOp(upd, S.uid, { k: 'dep', a: -p, d: did });
      upd[`acct/${S.uid}/dep/${did}`] = { p, i: Math.floor((p * r) / 100), r, s: B.ts(), dd: bank.days };
      return commit(upd, `${won(p)}을 예금했어요. ${bank.days}일 뒤 이자를 받아요!`);
    },
    withdraw(did, uid) {
      uid = uid || S.uid;
      const d = acctOf(uid).dep[did];
      // 서버 시각과 몇 초 차이가 날 수 있어 만기 직전·직후 몇 초는 잠시 기다림
      const gap = B.now() - depMat(d);
      if (Math.abs(gap) < 5000) { A.toast('만기 시각이에요. 몇 초 뒤에 다시 눌러 주세요.', 'bad'); return Promise.resolve(false); }
      const matured = gap > 0;
      const upd = {};
      addOp(upd, uid, { k: 'wd', a: matured ? d.p + d.i : d.p, d: did, p: d.p });
      upd[`acct/${uid}/dep/${did}`] = null;
      return commit(upd, matured ? `원금과 이자 ${won(d.p + d.i)}을 받았어요!` : `중도 해지로 원금 ${won(d.p)}을 돌려받았어요.`);
    },
    stockBuy(sid, amt) {
      const s = S.market[sid];
      const a = S.acct || {};
      const upd = {};
      const q = amt / s.p;
      addOp(upd, S.uid, { k: 'sbuy', a: -amt, s: sid, p: s.p, q, n: s.n });
      upd[`acct/${S.uid}/hold/${sid}/q`] = B.inc(q);
      upd[`acct/${S.uid}/hold/${sid}/c`] = B.inc(amt);
      const today = kday(B.now());
      upd[`acct/${S.uid}/tc`] = { d: today, n: a.tc && a.tc.d === today ? a.tc.n + 1 : 1 };
      return commit(upd, `${s.n} ${qty(q)}주를 샀어요!`);
    },
    // 학생 매도(또는 선생님이 강제 매도: uid 지정)
    stockSell(sid, q, uid) {
      uid = uid || S.uid;
      const s = S.market[sid];
      const a = acctOf(uid);
      const h = a.hold[sid];
      const all = q >= h.q - 1e-9;
      if (all) q = h.q;
      const c = all ? h.c : Math.min(h.c, Math.round((h.c * q) / h.q));
      const upd = {};
      addOp(upd, uid, { k: 'ssell', a: Math.floor(q * s.p), s: sid, p: s.p, q, c, n: s.n });
      if (S.isTeacher && all) upd[`acct/${uid}/hold/${sid}`] = null;
      else {
        upd[`acct/${uid}/hold/${sid}/q`] = B.inc(-q);
        upd[`acct/${uid}/hold/${sid}/c`] = B.inc(-c);
      }
      if (!S.isTeacher) {
        const today = kday(B.now());
        upd[`acct/${uid}/tc`] = { d: today, n: a.tc && a.tc.d === today ? a.tc.n + 1 : 1 };
      }
      return commit(upd, `${s.n} ${qty(q)}주를 팔아 ${won(Math.floor(q * s.p))}을 받았어요.`);
    },

    /* 선생님 */
    // 보내기: 새로 만든 돈 또는 국고에서. taxRate가 있으면 세금을 떼어 국고로
    send(uids, amt, memo, { fromGov = false, taxRate = 0, kind = 'send' } = {}) {
      const upd = {};
      const pr = B.newKey();
      let taxSum = 0;
      for (const u of uids) {
        const x = taxRate ? taxOf(amt, taxRate) : 0;
        taxSum += x;
        addOp(upd, u, { k: kind, a: amt - x, m: memo, src: fromGov ? 'gov' : null, g: x ? amt : null, x: x || null, pr });
      }
      const govDelta = (fromGov ? -amt * uids.length : 0) + taxSum;
      if (govDelta || fromGov) addOp(upd, GOV, { k: fromGov ? 'gsend' : 'tax', a: govDelta, m: fromGov ? `${memo || '지원금'} (${uids.length}명)${taxSum ? ` · 세금 ${won(taxSum)} 포함` : ''}` : `${memo || '소득'} 세금 (${uids.length}명)`, pr });
      return commit(upd, `${uids.length}명에게 ${won(amt)}씩 보냈어요.${taxSum ? ` (세금 ${won(taxSum)} → 국고)` : ''}`);
    },
    take(uids, amt, memo, { toGov = false } = {}) {
      const upd = {};
      const pr = B.newKey();
      for (const u of uids) addOp(upd, u, { k: 'take', a: -amt, m: memo, src: toGov ? 'gov' : null, pr });
      if (toGov) addOp(upd, GOV, { k: 'gtake', a: amt * uids.length, m: `${memo || '회수'} (${uids.length}명)`, pr });
      return commit(upd, `${uids.length}명에게서 ${won(amt)}씩 가져왔어요.${toGov ? ' (국고로)' : ''}`);
    },
    // 급여: rows = [{u, g(세전), x(세금), n(직업 이름)}]
    payroll(rows, memo) {
      const upd = {};
      const pr = B.newKey();
      let taxSum = 0;
      for (const r of rows) {
        taxSum += r.x;
        addOp(upd, r.u, { k: 'wage', a: r.g - r.x, g: r.g, x: r.x, n: r.n, m: memo, pr });
      }
      if (taxSum) addOp(upd, GOV, { k: 'tax', a: taxSum, m: `소득세 (${rows.length}명)`, pr });
      upd['config/econ/lastPay'] = B.ts();
      return commit(upd, `${rows.length}명에게 급여를 보냈어요.${taxSum ? ` 소득세 ${won(taxSum)}은 국고로 들어갔어요.` : ''}`);
    },
    adjust(uid, newCash, memo) {
      const cur = acctOf(uid).cash || 0;
      if (newCash === cur) return Promise.resolve(true);
      const upd = {};
      addOp(upd, uid, { k: 'adj', a: newCash - cur, m: memo || '잔액 조정' });
      return commit(upd, '잔액을 고쳤어요.');
    },
    govAdjust(delta, memo) {
      const upd = {};
      addOp(upd, GOV, { k: 'gadj', a: delta, m: memo || '국고 조정' });
      return commit(upd, '국고를 고쳤어요.');
    },
    // changes: {iid: 새 개수}. 한 번 저장할 때 계좌마다 기록은 한 줄만 쓸 수 있어 아이템마다 따로 저장
    async setItems(uid, changes, memo) {
      const a = acctOf(uid);
      let n = 0;
      for (const [iid, q] of Object.entries(changes)) {
        const old = (a.items && a.items[iid]) || 0;
        if (q === old) continue;
        const it = (S.store || {})[iid];
        const upd = {};
        addOp(upd, uid, { k: 'item', a: 0, i: iid, q: q - old, n: it ? it.n : iid, m: memo });
        upd[`acct/${uid}/items/${iid}`] = q > 0 ? q : null;
        if (!(await commit(upd))) return false;
        n++;
      }
      if (n) A.toast('아이템을 고쳤어요.', 'good');
      return true;
    },
    groupRefund(iid) {
      const it = S.store[iid];
      const con = (S.storeContrib || {})[iid] || {};
      const upd = {};
      const pr = B.newKey();
      let n = 0;
      for (const [u, amt] of Object.entries(con)) if (amt > 0 && S.users[u]) { addOp(upd, u, { k: 'ref', a: amt, i: iid, n: it.n, pr }); n++; }
      upd[`store/contrib/${iid}`] = null;
      upd[`store/items/${iid}/r`] = 0;
      upd[`store/items/${iid}/done`] = null;
      return commit(upd, `${n}명에게 환불했어요.`);
    },
    markUse(lid, done) { return B.set(`feedMark/${lid}`, done ? { done: B.ts() } : null); },
    // 아바타 사서 바로 쓰기 / 가진 아바타로 바꾸기 (id 'base' = 기본 아바타)
    buyAvatar(style, seed) {
      const price = cfg().av.styles[style];
      const aid = B.newKey();
      const upd = {};
      addOp(upd, S.uid, { k: 'av', a: -price, i: aid, s: style, n: '아바타' });
      upd[`acct/${S.uid}/avs/${aid}`] = { style, seed };
      upd[`acct/${S.uid}/avatar`] = { style, seed, id: aid };
      return commit(upd, '새 아바타를 샀어요! 바로 바꿨어요.');
    },
    equipAvatar(id) {
      const a = S.acct || {};
      const av = id === 'base' ? { style: 'thumbs', seed: S.uid } : a.avs && a.avs[id];
      if (!av) return Promise.resolve(false);
      return commit({ [`acct/${S.uid}/avatar`]: { style: av.style, seed: av.seed, id } }, '아바타를 바꿨어요.');
    },
  };

  /* ── 통계 ── 학생 돈 기준 발행(새로 생긴 돈)·소각(사라진 돈)과 사유 */
  function flows(e) {
    const a = e.a || 0;
    switch (e.k) {
      case 'send': return e.src === 'gov' ? [] : [['선생님 지급', e.g || a]];
      case 'take': return e.src === 'gov' ? [] : [['회수', a]];
      case 'wage': return [['급여', e.g || a]];
      case 'prize': case 'reward': return [['보상·상금', e.g || a]];
      case 'quest': return [['퀘스트 보상', a]];
      case 'write': return [['글쓰기 보상', a]];
      case 'ref': return [['환불', a]];
      case 'adj': return [['조정', a]];
      case 'buy': return [['상점 구매', a]];
      case 'grp': return [['공동구매', a]];
      case 'av': return [['아바타 구매', a]];
      case 'wd': return a > (e.p || 0) ? [['은행 이자', a - (e.p || 0)]] : [];
      case 'ssell': { const pl = a - (e.c || 0); return pl > 0 ? [['주식 이익', pl]] : pl < 0 ? [['주식 손실', pl]] : []; }
      default: return [];
    }
  }
  function stats(list, from, to) {
    const r = { issued: 0, burned: 0, byIssue: {}, byBurn: {}, daily: {}, items: {}, per: {}, tax: 0, n: 0 };
    for (const e of list) {
      if (!e.t || e.t < from || e.t > to) continue;
      r.n++;
      const d = kday(e.t);
      r.daily[d] = r.daily[d] || { i: 0, b: 0 };
      if (e.u === GOV) { if (e.k === 'tax') r.tax += e.a || 0; continue; }
      for (const [why, amt] of flows(e)) {
        if (amt > 0) { r.issued += amt; r.byIssue[why] = (r.byIssue[why] || 0) + amt; r.daily[d].i += amt; }
        else if (amt < 0) { r.burned -= amt; r.byBurn[why] = (r.byBurn[why] || 0) - amt; r.daily[d].b -= amt; }
      }
      const p = (r.per[e.u] = r.per[e.u] || { inc: 0, out: 0, buy: 0, n: 0 });
      p.n++;
      if (e.a > 0) p.inc += e.a; else if (e.a < 0) p.out -= e.a;
      if (e.k === 'buy') p.buy -= e.a;
      if (e.k === 'buy' || e.k === 'use' || e.k === 'grp') {
        const it = (r.items[e.i] = r.items[e.i] || { n: e.n || e.i, sold: 0, rev: 0, used: 0, grp: 0 });
        if (e.k === 'buy') { it.sold += e.q || 0; it.rev -= e.a; }
        else if (e.k === 'use') it.used += e.q || 0;
        else it.grp -= e.a;
      }
    }
    return r;
  }

  window.Econ = {
    GOV, DAY, DEFAULTS, cfg, grades, num, won, swon, qty, kday, kmin, kwd, hhmm, toMin,
    AV_STYLES, STYLE_NAMES, avatar, avatarUrl, acctOf, depMat, price, worth, itemCount, withBalance, toList, describe, KINDS,
    addOp, commit, ops, taxOf, stats, flows,
  };
})();

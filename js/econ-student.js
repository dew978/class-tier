/* 학급 경제 — 학생 화면: 내 지갑 · 상점 · 은행 · 주식 · 직업
   입력은 모두 작은 창(모달)에서 받아, 데이터가 바뀌어 화면을 다시 그려도 입력이 지워지지 않습니다. */
(function () {
  const A = window.App, E = window.Econ;
  const { S, B, esc, modal, toast, confirmBox, fmtTime, fmtDate } = A;
  const TABS = ['wallet', 'shop', 'bank', 'stock', 'jobs'];
  let feed = {}, feedUnsub = null, feedLimit = 60;
  const contribSubs = {};
  let shopCat = '전체';

  function ensureFeed() {
    if (feedUnsub || !S.uid) return;
    feedUnsub = B.on('feed', (v) => { feed = v || {}; A.render(); }, { child: 'u', equalTo: S.uid, last: feedLimit });
  }
  // 공동구매 상품마다 내가 낸 돈 구독 (다른 친구 기여는 볼 수 없음)
  function syncContrib() {
    for (const [iid, it] of Object.entries(S.store || {})) {
      if (it && it.g && !contribSubs[iid]) {
        contribSubs[iid] = B.on(`store/contrib/${iid}/${S.uid}`, (v) => { S.storeContrib[iid] = { [S.uid]: v || 0 }; A.render(); });
      }
    }
  }
  const me = () => S.acct || {};
  const myContrib = (iid) => ((S.storeContrib[iid] || {})[S.uid]) || 0;
  const myJobs = () => Object.entries(S.jobs || {}).filter(([, j]) => j && j.on !== false && j.mem && j.mem[S.uid]);
  function wageBonus() {
    const lv = S.myLevels || {};
    return window.Tracks.wageBonusAll(lv);
  }
  const sortItems = (list) => list.sort((a, b) => (a[1].ord ?? 999) - (b[1].ord ?? 999) || String(a[1].n).localeCompare(String(b[1].n)));

  // 내용이 그대로면 다시 그리지 않음 (아바타 이미지 깜빡임 방지)
  let lastHtml = '', lastEl = null;
  function render(main, tab) {
    syncContrib();
    if (tab === 'wallet') ensureFeed();
    const html = VIEW[tab]();
    if (html === lastHtml && lastEl && main.contains(lastEl)) return;
    lastHtml = html;
    main.innerHTML = html;
    lastEl = main.firstElementChild;
    main.onclick = onClick;
  }
  // 만기·거래 시간처럼 시간에 따라 바뀌는 표시를 30초마다 새로 고침
  setInterval(() => { if (S.screen === 'student' && TABS.includes(S.tab)) A.render(); }, 30000);

  /* ── 내 지갑 ── */
  function wallet() {
    const a = me();
    const w = E.worth(a);
    const items = sortItems(Object.entries(a.items || {}).filter(([, n]) => n > 0).map(([iid, n]) => [iid, Object.assign({ have: n }, S.store[iid] || { n: '(없어진 아이템)' })]));
    const jobs = myJobs();
    const list = E.withBalance(E.toList(feed), a.cash || 0).reverse();
    return `
      <div class="panel wallet-hero">
        <div class="wh-top">${E.avatar(S.uid, 'lg')}<div><div class="muted">총 자산</div><div class="wh-total">${E.won(w.total)}</div></div></div>
        <div class="grid4">
          <div class="stat"><div class="k">👛 쓸 수 있는 돈</div><div class="v ${w.cash < 0 ? 'down' : ''}">${E.won(w.cash)}</div></div>
          <div class="stat"><div class="k">🏦 예금</div><div class="v">${E.won(w.dep)}</div></div>
          <div class="stat"><div class="k">📈 주식 평가액</div><div class="v">${E.won(w.stock)}</div></div>
          <div class="stat"><div class="k">🎒 아이템</div><div class="v">${E.itemCount(a)}개</div></div>
        </div>
        ${w.cash < 0 ? '<p class="note" style="color:var(--bad)">돈이 마이너스예요. 급여를 받으면 먼저 채워져요.</p>' : ''}
      </div>
      <div class="grid2" style="margin-top:16px">
        <div class="panel"><h3>🎒 내 아이템 <span class="muted">사용하면 선생님께 알림이 가요</span></h3>
          ${items.length ? `<ul class="rows">${items.map(([iid, it]) => `<li><span class="it-ic">${esc(it.ic || '🎁')}</span><b>${esc(it.n)}</b><span class="muted">${esc(it.c || '')}</span>
            <span class="right"><b>${it.have}개</b><button class="btn xs primary" data-use="${esc(iid)}">사용</button></span></li>`).join('')}</ul>` : '<p class="empty">아직 아이템이 없어요. 「상점」에서 살 수 있어요.</p>'}
        </div>
        <div class="panel"><h3>💼 내 직업</h3>
          ${jobs.length ? `<ul class="rows">${jobs.map(([, j]) => `<li><b>${esc(j.t)}</b><span class="muted">${esc(j.d || '')}</span><span class="right">${E.won(j.w || 0)}</span></li>`).join('')}</ul>` : '<p class="empty">아직 직업이 없어요.</p>'}
          ${payPreview(jobs)}
        </div>
      </div>
      <div class="panel" style="margin-top:16px"><h3>🧾 거래 내역 <span class="muted">최근 ${list.length}건</span></h3>
        ${list.length ? `<div class="tbl-wrap"><table class="tbl feed-tbl"><thead><tr><th>날짜</th><th>내용</th><th class="num">변동</th><th class="num">잔액</th></tr></thead><tbody>
          ${list.map((e) => { const d = E.describe(e); return `<tr><td class="muted">${fmtTime(e.t)}</td><td><span class="f-ic">${d.ic}</span><b>${esc(d.t)}</b>${d.sub ? `<div class="muted f-sub">${esc(d.sub)}</div>` : ''}</td>
            <td class="num"><b class="delta ${e.a > 0 ? 'up' : e.a < 0 ? 'down' : ''}">${e.a ? E.swon(e.a) : '-'}</b></td><td class="num">${E.won(e.bal)}</td></tr>`; }).join('')}
        </tbody></table></div>${Object.keys(feed).length >= feedLimit ? '<div class="foot"><button class="btn sm" data-more="1">더 보기</button></div>' : ''}` : '<p class="empty">아직 거래가 없어요.</p>'}
      </div>`;
  }
  function payPreview(jobs) {
    const base = jobs.reduce((n, [, j]) => n + (j.w || 0), 0);
    const bonus = wageBonus();
    const gross = base + bonus;
    if (!gross) return '';
    const c = E.cfg();
    const rate = c.taxOn ? c.tax : 0;
    const x = E.taxOf(gross, rate);
    return `<div class="pay-prev"><div>급여 ${E.won(base)}${bonus ? ` + 급수 수당 ${E.won(bonus)}` : ''}</div>
      ${x ? `<div>− 소득세 ${rate}% ${E.won(x)}</div>` : ''}<div class="net">= 받는 돈 <b>${E.won(gross - x)}</b></div>
      ${x ? `<p class="note">소득세는 우리 반 국고에 모여요.${S.gov && S.gov.cash !== undefined ? ` (지금 국고 ${E.won(S.gov.cash)})` : ''}</p>` : ''}</div>`;
  }

  /* ── 상점 ── */
  let shopMode = 'item', avStyle = null;
  function shop() {
    const c = E.cfg();
    const a = me();
    const avOn = c.av.on && Object.values(c.av.styles).some((p) => typeof p === 'number');
    const modes = avOn ? `<div class="seg" style="margin-bottom:12px"><button data-sm="item" class="${shopMode !== 'av' ? 'on' : ''}">🎁 아이템 상점</button><button data-sm="av" class="${shopMode === 'av' ? 'on' : ''}">🙂 아바타 상점</button></div>` : '';
    if (avOn && shopMode === 'av') return modes + avatarShop();
    const all = sortItems(Object.entries(S.store || {}).filter(([, it]) => it && it.on !== false));
    const cats = ['전체', ...c.cats.filter((k) => all.some(([, it]) => it.c === k)), ...[...new Set(all.map(([, it]) => it.c).filter((k) => k && !c.cats.includes(k)))]];
    if (!cats.includes(shopCat)) shopCat = '전체';
    const list = all.filter(([, it]) => shopCat === '전체' || it.c === shopCat);
    return `${modes}<div class="panel"><div class="a-head" style="margin-bottom:10px"><h3 style="margin:0">🛒 상점</h3><span class="sp"></span><span class="muted">쓸 수 있는 돈</span><b>${E.won(a.cash || 0)}</b></div>
      <div class="chips">${cats.map((k) => `<button data-cat="${esc(k)}" class="${k === shopCat ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>
      ${list.length ? `<div class="shop-grid">${list.map(([iid, it]) => (it.g ? groupCard(iid, it) : itemCard(iid, it, a))).join('')}</div>` : '<p class="empty">지금은 살 수 있는 물건이 없어요.</p>'}</div>`;
  }
  // 아바타 상점: 모양마다 오늘의 얼굴 후보 (학생마다·날마다 다름)
  function avatarShop() {
    const c = E.cfg();
    const a = me();
    const styles = Object.entries(c.av.styles).filter(([, p]) => typeof p === 'number').sort((x, y) => x[1] - y[1]);
    if (!avStyle || typeof c.av.styles[avStyle] !== 'number') avStyle = styles[0][0];
    const cur = a.avatar || { style: 'thumbs', seed: S.uid, id: 'base' };
    const owned = [['base', { style: 'thumbs', seed: S.uid }], ...Object.entries(a.avs || {})];
    const isCur = (id, v) => (cur.id ? cur.id === id : cur.style === v.style && cur.seed === v.seed);
    const today = E.kday(B.now());
    const seeds = Array.from({ length: c.av.n || 12 }, (_, i) => `${S.uid.slice(-4)}-${today}-${i}`);
    const mine = new Set(Object.values(a.avs || {}).map((v) => `${v.style}|${v.seed}`));
    return `<div class="panel"><h3>🙂 내 아바타 <span class="muted">눌러서 바꿔요</span></h3>
        <div class="av-grid">${owned.map(([id, v]) => `<button class="av-pick ${isCur(id, v) ? 'on' : ''}" data-aveq="${esc(id)}"><img src="${E.avatarUrl(v.style, v.seed)}" alt="" loading="lazy"><small>${id === 'base' ? '기본' : esc(E.STYLE_NAMES[v.style] || v.style)}</small></button>`).join('')}</div></div>
      <div class="panel" style="margin-top:16px"><h3>🛍️ 아바타 상점 <span class="muted">날마다 새 얼굴이 나와요 · 쓸 수 있는 돈 ${E.won(a.cash || 0)}</span></h3>
        <div class="chips">${styles.map(([s, p]) => `<button data-avs="${esc(s)}" class="${s === avStyle ? 'on' : ''}">${esc(E.STYLE_NAMES[s] || s)} · ${E.won(p)}</button>`).join('')}</div>
        <div class="av-grid">${seeds.map((seed) => { const own = mine.has(`${avStyle}|${seed}`); return `<div class="av-buy"><img src="${E.avatarUrl(avStyle, seed)}" alt="" loading="lazy"><button class="btn xs ${own ? '' : 'primary'}" data-avbuy="${esc(seed)}" ${own ? 'disabled' : ''}>${own ? '가짐' : E.won(c.av.styles[avStyle])}</button></div>`; }).join('')}</div></div>`;
  }
  async function buyAvatar(seed) {
    const c = E.cfg();
    const price = c.av.styles[avStyle];
    if ((me().cash || 0) < price) return toast('돈이 부족해요.', 'bad');
    if (!(await confirmBox('아바타 사기', `<div style="text-align:center"><img src="${E.avatarUrl(avStyle, seed)}" alt="" style="width:120px;height:120px;border-radius:50%;background:#f4f1ff"></div><br>${esc(E.STYLE_NAMES[avStyle] || avStyle)} 아바타를 ${E.won(price)}에 살까요? 사면 바로 바뀌어요.`, '사기'))) return;
    await E.ops.buyAvatar(avStyle, seed);
  }
  function itemCard(iid, it, a) {
    const have = (a.items && a.items[iid]) || 0;
    const soldOut = typeof it.st === 'number' && it.st <= 0;
    const full = it.lim && have >= it.lim;
    return `<div class="shop-card"><div class="sc-top"><span class="it-ic big">${esc(it.ic || '🎁')}</span><span class="pill">${esc(it.c || '')}</span></div>
      <div class="sc-name">${esc(it.n)}</div>${it.d ? `<div class="muted sc-desc">${esc(it.d)}</div>` : ''}
      <div class="sc-price">${E.won(it.p)}</div>
      <div class="muted sc-meta">${typeof it.st === 'number' ? `남은 수량 ${it.st}개 · ` : ''}가진 개수 ${have}개${it.lim ? ` (최대 ${it.lim}개)` : ''}</div>
      <button class="btn ${soldOut || full ? '' : 'primary'} sm" data-buy="${esc(iid)}" ${soldOut || full ? 'disabled' : ''}>${soldOut ? '다 팔렸어요' : full ? '더 가질 수 없어요' : '사기'}</button></div>`;
  }
  function groupCard(iid, it) {
    const r = it.r || 0;
    const pct = Math.min(100, Math.round((r / it.g) * 100));
    const mine = myContrib(iid);
    return `<div class="shop-card group"><div class="sc-top"><span class="it-ic big">${esc(it.ic || '🤝')}</span><span class="pill warn">공동구매</span></div>
      <div class="sc-name">${esc(it.n)}</div>${it.d ? `<div class="muted sc-desc">${esc(it.d)}</div>` : ''}
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="sc-meta"><b>${E.won(r)}</b> / ${E.won(it.g)} (${pct}%)</div>
      <div class="muted sc-meta">내가 낸 돈 ${E.won(mine)}</div>
      ${it.done ? '<span class="pill good">목표 달성!</span>' : `<button class="btn primary sm" data-grp="${esc(iid)}" ${r >= it.g ? 'disabled' : ''}>함께 모으기</button>`}</div>`;
  }
  function buyDialog(iid) {
    const it = S.store[iid];
    const a = me();
    const have = (a.items && a.items[iid]) || 0;
    const byMoney = Math.floor((a.cash || 0) / Math.max(1, it.p));
    const max = Math.max(0, Math.min(99, it.p ? byMoney : 99, typeof it.st === 'number' ? it.st : 99, it.lim ? it.lim - have : 99));
    if (max < 1) return toast(it.p > (a.cash || 0) ? '돈이 부족해요.' : '살 수 없어요.', 'bad');
    const m = modal(`<h3>${esc(it.ic || '🎁')} ${esc(it.n)} 사기</h3>
      <div class="qty-row"><button class="btn" data-q="-1">−</button><input id="bq" type="number" min="1" max="${max}" value="1" inputmode="numeric"><button class="btn" data-q="1">+</button><span class="muted">최대 ${max}개</span></div>
      <dl class="kv" id="bsum"></dl>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>사기</button></div>`);
    const inp = m.el.querySelector('#bq');
    const sync = () => {
      const q = Math.max(1, Math.min(max, Math.floor(Number(inp.value) || 1)));
      m.el.querySelector('#bsum').innerHTML = `<dt>값</dt><dd><b>${E.won(it.p * q)}</b> (${E.won(it.p)} × ${q}개)</dd><dt>사고 난 뒤 남는 돈</dt><dd>${E.won((a.cash || 0) - it.p * q)}</dd>`;
      return q;
    };
    sync();
    inp.oninput = sync;
    m.el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { inp.value = Math.max(1, Math.min(max, (Number(inp.value) || 1) + Number(b.dataset.q))); sync(); }));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const q = sync();
      e.target.disabled = true;
      if (await E.ops.buy(iid, q)) m.close(); else e.target.disabled = false;
    };
  }
  function groupDialog(iid) {
    const it = S.store[iid];
    const a = me();
    const room = it.g - (it.r || 0);
    const max = Math.min(room, Math.max(0, a.cash || 0));
    if (max < 1) return toast(room < 1 ? '이미 목표 금액이 다 모였어요.' : '돈이 부족해요.', 'bad');
    const m = modal(`<h3>🤝 ${esc(it.n)} 공동구매</h3>
      <p class="note" style="margin-top:0">반 친구들과 함께 돈을 모아요. 목표 ${E.won(it.g)} 중 ${E.won(it.r || 0)} 모였어요. 목표를 못 채우면 선생님이 돌려줄 수 있어요.</p>
      <label>보탤 돈 (최대 ${E.won(max)})<input id="ga" type="number" min="1" max="${max}" step="1000" inputmode="numeric" placeholder="예: 10000"></label>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>보태기</button></div>`);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const amt = Math.floor(Number(m.el.querySelector('#ga').value) || 0);
      if (amt < 1 || amt > max) return toast(`1 ~ ${E.num(max)} 사이로 적어 주세요.`, 'bad');
      e.target.disabled = true;
      if (await E.ops.contribute(iid, amt)) m.close(); else e.target.disabled = false;
    };
  }
  function useDialog(iid) {
    const a = me();
    const have = (a.items && a.items[iid]) || 0;
    const it = S.store[iid] || { n: '(없어진 아이템)' };
    if (have < 1) return;
    const m = modal(`<h3>✨ ${esc(it.n)} 사용</h3>
      <div class="qty-row"><button class="btn" data-q="-1">−</button><input id="uq" type="number" min="1" max="${have}" value="1"><button class="btn" data-q="1">+</button><span class="muted">가진 개수 ${have}개</span></div>
      <p class="note">사용하면 선생님 화면에 알림이 가요. 선생님께 사용했다고 말씀드리세요.</p>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>사용하기</button></div>`);
    const inp = m.el.querySelector('#uq');
    m.el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { inp.value = Math.max(1, Math.min(have, (Number(inp.value) || 1) + Number(b.dataset.q))); }));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const q = Math.max(1, Math.min(have, Math.floor(Number(inp.value) || 1)));
      e.target.disabled = true;
      if (await E.ops.use(iid, q, it.n)) m.close(); else e.target.disabled = false;
    };
  }

  /* ── 은행 ── */
  function bank() {
    const c = E.cfg();
    const a = me();
    const g = a.grade || c.bank.def;
    const rate = c.bank.rates[g] ?? c.bank.rates[c.bank.def];
    const now = B.now();
    const deps = Object.entries(a.dep || {}).sort((x, y) => E.depMat(x[1]) - E.depMat(y[1]));
    return `<div class="panel"><div class="bank-top">
        <div class="grade-badge g-${esc(g)}"><small>신용 등급</small><b>${esc(g)}</b></div>
        <div><div class="muted">이자율 (${c.bank.days}일 예금)</div><div class="wh-total">${rate}%</div>
          <div class="muted" style="font-size:.9em">예: 100,000원을 맡기면 ${c.bank.days}일 뒤 ${E.won(100000 + Math.floor(100000 * rate / 100))}</div></div>
        <span class="sp"></span>
        ${c.bank.on ? `<button class="btn primary lg" data-dep="1">🏦 예금하기</button>` : '<span class="pill warn">지금은 예금을 받지 않아요</span>'}
      </div>
      <p class="note">신용 등급은 선생님이 정해요 (${E.grades().map((k) => `${k} ${c.bank.rates[k]}%`).join(' · ')}). 만기 전에 찾으면 이자 없이 원금만 돌려받아요. 최소 ${E.won(c.bank.min)}.</p></div>
      <div class="panel" style="margin-top:16px"><h3>📒 내 예금 <span class="muted">${deps.length}개 · 원금 ${E.won(deps.reduce((n, [, d]) => n + d.p, 0))}</span></h3>
        ${deps.length ? `<div class="dep-list">${deps.map(([did, d]) => {
          const mat = E.depMat(d);
          const done = now >= mat;
          const pct = Math.min(100, Math.max(0, Math.round(((now - d.s) / (mat - d.s)) * 100)));
          return `<div class="dep-card ${done ? 'done' : ''}"><div class="dc-top"><b>${E.won(d.p)}</b><span class="pill ${done ? 'good' : ''}">${done ? '만기!' : `${Math.ceil((mat - now) / E.DAY)}일 남음`}</span></div>
            <div class="progress"><i style="width:${pct}%"></i></div>
            <div class="muted dc-meta">${fmtDate(d.s)} 가입 · ${fmtDate(mat)} 만기 · 이자율 ${d.r}% · 이자 ${E.won(d.i)}</div>
            <button class="btn sm ${done ? 'good' : 'ghost'}" data-wd="${esc(did)}">${done ? `원금 + 이자 ${E.won(d.p + d.i)} 받기` : '중도 해지 (원금만)'}</button></div>`;
        }).join('')}</div>` : '<p class="empty">아직 예금이 없어요.</p>'}</div>`;
  }
  function depositDialog() {
    const c = E.cfg();
    const a = me();
    const rate = c.bank.rates[a.grade || c.bank.def] ?? c.bank.rates[c.bank.def];
    if (rate === undefined) return toast('신용 등급의 이자율이 없어요. 선생님께 말씀드리세요.', 'bad');
    const max = Math.max(0, a.cash || 0);
    if (max < c.bank.min) return toast(`최소 ${E.won(c.bank.min)}이 있어야 예금할 수 있어요.`, 'bad');
    const m = modal(`<h3>🏦 예금하기</h3>
      <label>맡길 돈 (최소 ${E.won(c.bank.min)} · 최대 ${E.won(max)})<input id="da" type="number" min="${c.bank.min}" max="${max}" step="1000" inputmode="numeric"></label>
      <div class="chips">${[0.25, 0.5, 1].map((f) => `<button data-f="${f}">${f === 1 ? '전부' : `${f * 100}%`}</button>`).join('')}</div>
      <dl class="kv" id="dsum"></dl>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>예금하기</button></div>`);
    const inp = m.el.querySelector('#da');
    const sync = () => {
      const p = Math.floor(Number(inp.value) || 0);
      m.el.querySelector('#dsum').innerHTML = p ? `<dt>이자 (${rate}%)</dt><dd>${E.won(Math.floor((p * rate) / 100))}</dd><dt>${c.bank.days}일 뒤 받는 돈</dt><dd><b>${E.won(p + Math.floor((p * rate) / 100))}</b></dd>` : '';
      return p;
    };
    inp.oninput = sync;
    m.el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { inp.value = Math.floor(max * Number(b.dataset.f)); sync(); }));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const p = sync();
      if (p < c.bank.min || p > max) return toast(`${E.num(c.bank.min)} ~ ${E.num(max)} 사이로 적어 주세요.`, 'bad');
      e.target.disabled = true;
      if (await E.ops.deposit(p)) m.close(); else e.target.disabled = false;
    };
  }

  /* ── 주식 ── */
  function tradeState(s) {
    const t = E.cfg().trade;
    const now = B.now();
    const m = E.kmin(now);
    if (!t.on) return [false, '선생님이 주식 거래를 잠시 멈췄어요'];
    if (s.ty === 'real') {
      const wd = E.kwd(now);
      if (wd < 1 || wd > 5) return [false, '실제 주식은 평일에만 거래할 수 있어요'];
      if (m < t.rs || m >= t.re) return [false, `실제 주식 거래 시간 ${E.hhmm(t.rs)}~${E.hhmm(t.re)}`];
      if (now - (s.ut || 0) > 30 * 60000) return [false, '시세를 받아오는 중이에요 (조금 뒤에 다시 해 보세요)'];
    } else if (m < t.cs || m > t.ce) return [false, `학급 증권 거래 시간 ${E.hhmm(t.cs)}~${E.hhmm(t.ce)}`];
    const tc = me().tc;
    const n = tc && tc.d === E.kday(now) ? tc.n : 0;
    if (n >= t.max) return [false, `오늘 거래 한도 ${t.max}회를 다 썼어요`];
    return [true, ''];
  }
  function stock() {
    const c = E.cfg();
    const a = me();
    const now = B.now();
    const tc = a.tc && a.tc.d === E.kday(now) ? a.tc.n : 0;
    const list = Object.entries(S.market || {}).filter(([sid, s]) => s && (s.on !== false || (a.hold && a.hold[sid]))).sort((x, y) => (x[1].ord ?? 999) - (y[1].ord ?? 999));
    const w = E.worth(a);
    return `<div class="panel"><div class="a-head" style="margin-bottom:6px"><h3 style="margin:0">📈 주식</h3><span class="sp"></span>
        <span class="muted">오늘 거래 ${tc}/${c.trade.max}회</span></div>
      <div class="grid3"><div class="stat"><div class="k">쓸 수 있는 돈</div><div class="v">${E.won(a.cash || 0)}</div></div>
        <div class="stat"><div class="k">주식 평가액</div><div class="v">${E.won(w.stock)}</div></div>
        <div class="stat"><div class="k">평가 손익</div><div class="v ${w.stock - w.cost > 0 ? 'up' : w.stock - w.cost < 0 ? 'down' : ''}">${E.swon(w.stock - w.cost)}</div></div></div>
      <p class="note">학급 증권은 ${E.hhmm(c.trade.cs)}~${E.hhmm(c.trade.ce)}, 실제 주식은 평일 ${E.hhmm(c.trade.rs)}~${E.hhmm(c.trade.re)}에 거래해요. 실제 주식 시세는 장중에 1분마다 바뀌어요. 원하는 금액만큼 소수점 주식으로 살 수 있어요.</p></div>
      <div class="stock-list">${list.map(([sid, s]) => stockCard(sid, s, a)).join('') || '<div class="panel"><p class="empty">아직 증권이 없어요.</p></div>'}</div>`;
  }
  function stockCard(sid, s, a) {
    const h = (a.hold && a.hold[sid]) || null;
    const val = h ? Math.floor(h.q * s.p) : 0;
    const pl = h ? val - h.c : 0;
    const [ok, why] = tradeState(s);
    const ch = Number(s.ch) || 0;
    return `<div class="panel stock-card"><div class="stk-head"><div><b class="stk-name">${esc(s.n)}</b>
        <span class="pill ${s.ty === 'real' ? 'warn' : ''}">${s.ty === 'real' ? `실제 주식 ${esc(s.sym || '')}` : '학급 증권'}</span></div>
        <div class="stk-price"><b>${E.won(s.p)}</b> <span class="delta ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch > 0 ? '▲' : ch < 0 ? '▼' : ''}${Math.abs(ch).toFixed(2)}%</span></div></div>
      ${s.d ? `<div class="muted" style="font-size:.9em">${esc(s.d)}</div>` : ''}
      <div class="muted" style="font-size:.8em">시세 ${s.ut ? fmtTime(s.ut) : '-'}</div>
      ${h && h.q > 0 ? `<div class="stk-hold"><span>보유 <b>${E.qty(h.q)}주</b></span><span>투자금 ${E.won(h.c)}</span><span>평가 <b>${E.won(val)}</b></span><span class="delta ${pl > 0 ? 'up' : pl < 0 ? 'down' : ''}">${E.swon(pl)}${h.c ? ` (${((pl / h.c) * 100).toFixed(1)}%)` : ''}</span></div>` : ''}
      <div class="foot" style="margin-top:8px">${ok ? '' : `<span class="muted" style="margin-right:auto;font-size:.88em">⏸ ${esc(why)}</span>`}
        <button class="btn sm" data-sell="${esc(sid)}" ${ok && h && h.q > 0 ? '' : 'disabled'}>팔기</button>
        <button class="btn sm primary" data-sbuy="${esc(sid)}" ${ok && s.on !== false ? '' : 'disabled'}>사기</button></div></div>`;
  }
  function stockBuyDialog(sid) {
    const s = S.market[sid];
    const a = me();
    const max = Math.max(0, a.cash || 0);
    if (max < 1) return toast('돈이 부족해요.', 'bad');
    const m = modal(`<h3>📈 ${esc(s.n)} 사기</h3>
      <p class="muted" style="margin-top:0">지금 1주 ${E.won(s.p)} — 원하는 금액만큼 소수점 주식으로 사요.</p>
      <label>살 금액 (최대 ${E.won(max)})<input id="sa" type="number" min="1" max="${max}" step="1000" inputmode="numeric"></label>
      <div class="chips">${[0.1, 0.25, 0.5, 1].map((f) => `<button data-f="${f}">${f === 1 ? '전부' : `${f * 100}%`}</button>`).join('')}</div>
      <dl class="kv" id="ssum"></dl>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>사기</button></div>`);
    const inp = m.el.querySelector('#sa');
    const sync = () => {
      const amt = Math.floor(Number(inp.value) || 0);
      m.el.querySelector('#ssum').innerHTML = amt ? `<dt>사는 수량</dt><dd><b>${E.qty(amt / s.p)}주</b></dd><dt>남는 돈</dt><dd>${E.won(max - amt)}</dd>` : '';
      return amt;
    };
    inp.oninput = sync;
    m.el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { inp.value = Math.floor(max * Number(b.dataset.f)); sync(); }));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const amt = sync();
      if (amt < 1 || amt > max) return toast(`1 ~ ${E.num(max)} 사이로 적어 주세요.`, 'bad');
      const cur = S.market[sid];
      if (cur.p !== s.p) { toast('가격이 바뀌었어요. 다시 확인해 주세요.', 'bad'); m.close(); return; }
      e.target.disabled = true;
      if (await E.ops.stockBuy(sid, amt)) m.close(); else e.target.disabled = false;
    };
  }
  function stockSellDialog(sid) {
    const s = S.market[sid];
    const h = me().hold[sid];
    const m = modal(`<h3>📉 ${esc(s.n)} 팔기</h3>
      <p class="muted" style="margin-top:0">지금 1주 ${E.won(s.p)} · 가진 수량 ${E.qty(h.q)}주 (투자금 ${E.won(h.c)})</p>
      <label>팔 수량 (주)<input id="sq" type="number" min="0" step="any" inputmode="decimal"></label>
      <div class="chips">${[0.25, 0.5, 1].map((f) => `<button data-f="${f}">${f === 1 ? '전부' : `${f * 100}%`}</button>`).join('')}</div>
      <dl class="kv" id="qsum"></dl>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>팔기</button></div>`);
    const inp = m.el.querySelector('#sq');
    let all = false;
    const sync = () => {
      let q = Number(inp.value) || 0;
      if (all) q = h.q;
      q = Math.min(q, h.q);
      const got = Math.floor(q * s.p);
      const c = q >= h.q - 1e-9 ? h.c : Math.min(h.c, Math.round((h.c * q) / h.q));
      m.el.querySelector('#qsum').innerHTML = q > 0 ? `<dt>받는 돈</dt><dd><b>${E.won(got)}</b></dd><dt>손익</dt><dd class="delta ${got - c > 0 ? 'up' : got - c < 0 ? 'down' : ''}">${E.swon(got - c)}</dd>` : '';
      return q;
    };
    inp.oninput = () => { all = false; sync(); };
    m.el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { const f = Number(b.dataset.f); all = f === 1; inp.value = all ? E.qty(h.q) : E.qty(h.q * f); sync(); }));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const q = sync();
      if (!(q > 0)) return toast('팔 수량을 적어 주세요.', 'bad');
      if (S.market[sid].p !== s.p) { toast('가격이 바뀌었어요. 다시 확인해 주세요.', 'bad'); m.close(); return; }
      e.target.disabled = true;
      if (await E.ops.stockSell(sid, q)) m.close(); else e.target.disabled = false;
    };
  }

  /* ── 직업 ── */
  function jobs() {
    const c = E.cfg();
    const list = Object.entries(S.jobs || {}).filter(([, j]) => j && j.on !== false).sort((a, b) => (a[1].ord ?? 999) - (b[1].ord ?? 999) || (b[1].w || 0) - (a[1].w || 0));
    const mine = myJobs();
    return `${A.svCard ? A.svCard().replace('style="margin-top:16px"', 'style="margin-bottom:16px"') : ''}<div class="panel"><h3>💼 우리 반 직업 <span class="muted">${c.taxOn && c.tax ? `급여에서 소득세 ${c.tax}%를 떼어 국고에 모아요` : '급여에서 소득세를 떼지 않아요'}</span></h3>
      ${mine.length ? `<div class="my-jobs">나의 직업: ${mine.map(([, j]) => `<span class="pill good">${esc(j.t)}</span>`).join(' ')}</div>` : ''}
      ${payPreview(mine)}
      ${list.length ? `<div class="job-grid">${list.map(([, j]) => {
        const mem = Object.keys(j.mem || {}).filter((u) => S.users[u]);
        return `<div class="job-card ${j.mem && j.mem[S.uid] ? 'mine' : ''}"><div class="jc-top"><b>${esc(j.t)}</b><span>${E.won(j.w || 0)}</span></div>
          ${j.d ? `<div class="muted" style="font-size:.88em">${esc(j.d)}</div>` : ''}
          <div class="jc-mem">${mem.map((u) => `<span>${esc(A.nameOf(u))}</span>`).join('') || '<span class="muted">아직 없음</span>'}</div></div>`;
      }).join('')}</div>` : '<p class="empty">아직 직업이 없어요.</p>'}</div>`;
  }

  const VIEW = { wallet, shop, bank, stock, jobs };

  async function onClick(e) {
    const av = e.target.closest('[data-sm],[data-avs],[data-avbuy],[data-aveq]');
    if (av) {
      if (av.dataset.sm) { shopMode = av.dataset.sm; A.render(); return; }
      if (av.dataset.avs) { avStyle = av.dataset.avs; A.render(); return; }
      if (av.dataset.avbuy) return buyAvatar(av.dataset.avbuy);
      if (av.dataset.aveq) return E.ops.equipAvatar(av.dataset.aveq);
    }
    const t = e.target.closest('[data-use],[data-buy],[data-grp],[data-cat],[data-more],[data-dep],[data-wd],[data-sbuy],[data-sell]');
    if (!t) return;
    if (t.dataset.cat !== undefined) { shopCat = t.dataset.cat; A.render(); return; }
    if (t.dataset.use) return useDialog(t.dataset.use);
    if (t.dataset.buy) return buyDialog(t.dataset.buy);
    if (t.dataset.grp) return groupDialog(t.dataset.grp);
    if (t.dataset.more) { feedLimit += 60; if (feedUnsub) feedUnsub(); feedUnsub = null; ensureFeed(); return; }
    if (t.dataset.dep) return depositDialog();
    if (t.dataset.sbuy) return stockBuyDialog(t.dataset.sbuy);
    if (t.dataset.sell) return stockSellDialog(t.dataset.sell);
    if (t.dataset.wd) {
      const d = me().dep[t.dataset.wd];
      const done = B.now() >= E.depMat(d);
      if (!done && !(await confirmBox('중도 해지', `만기 전에 찾으면 이자 ${E.won(d.i)}을 받지 못하고 원금 ${E.won(d.p)}만 돌려받아요. 해지할까요?`, '해지하기', true))) return;
      t.disabled = true;
      await E.ops.withdraw(t.dataset.wd);
    }
  }

  // 티어 홈 화면의 지갑 카드
  function homeCard() {
    const a = S.acct;
    if (!a) return '';
    const w = E.worth(a);
    const jobs = myJobs();
    return `<div class="panel wallet-card" style="margin-top:16px"><span class="wc-ic">👛</span>
      <div><div class="muted">쓸 수 있는 돈</div><b class="${w.cash < 0 ? 'down' : ''}">${E.won(w.cash)}</b></div>
      <div><div class="muted">총 자산</div><b>${E.won(w.total)}</b></div>
      ${jobs.length ? `<div><div class="muted">직업</div><b>${jobs.map(([, j]) => esc(j.t)).join(', ')}</b></div>` : ''}
      <span class="sp"></span><button class="btn primary sm" data-go="econ/wallet">지갑 열기</button></div>`;
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (!g || S.isTeacher || S.screen !== 'student') return;
    const [sec, tab] = g.dataset.go.split('/');
    A.go(sec, tab);
  });

  window.EconStudent = {
    handles: (tab) => TABS.includes(tab),
    render,
    homeCard,
    badges() {
      const a = S.acct || {};
      const now = B.now();
      return { bank: Object.values(a.dep || {}).filter((d) => now >= E.depMat(d)).length };
    },
    reset() {
      if (feedUnsub) feedUnsub();
      feedUnsub = null;
      feed = {};
      feedLimit = 60;
      for (const k of Object.keys(contribSubs)) { contribSubs[k](); delete contribSubs[k]; }
      shopCat = '전체';
    },
  };
})();

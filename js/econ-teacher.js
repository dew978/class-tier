/* 학급 경제 — 선생님 화면
   학급 홈(보내기·받기·뽑기·자산 살피기) · 상점 · 직업·급여 · 재테크(신용 등급·예금·증권) · 활동 기록 · 통계 · 경제 설정 */
(function () {
  const A = window.App, E = window.Econ, TC = window.Teacher;
  const { S, B, $, $$, esc, nameTag, nameOf, toast, modal, confirmBox, fmtDate, fmtTime } = A;
  let subs = [];
  let recent = {}, recentLimit = 300, recentUnsub = null, marks = {};
  const homeSel = new Set();
  const main = () => $('#tc-main');
  const stuIds = () => Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
  // 내용이 바뀐 경우에만 다시 그림 (아바타 이미지 깜빡임 방지)
  const setHtml = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };
  const sortBy = (obj, extra) => Object.entries(obj || {}).filter(([, x]) => x).sort((a, b) => (a[1].ord ?? 999) - (b[1].ord ?? 999) || (extra ? extra(a[1], b[1]) : 0));

  function subRecent() {
    if (recentUnsub) recentUnsub();
    recentUnsub = B.on('feed', (v) => { recent = v || {}; A.render(); }, { key: true, last: recentLimit });
  }
  // 경제 설정이 없으면 기본값으로 만들고, 나중에 생긴 항목(아바타 상점 등)은 채워 넣음
  async function ensureConfig() {
    try {
      const cur = await B.get('config/econ');
      if (!cur) { await B.set('config/econ', E.DEFAULTS); return; }
      const miss = {};
      for (const k of ['bank', 'trade', 'menus', 'av', 'cats']) if (!cur[k]) miss[`config/econ/${k}`] = E.DEFAULTS[k];
      if (Object.keys(miss).length) await B.update('', miss);
    } catch (e) { console.warn('경제 설정 만들기 실패', e); }
  }
  const pendingUses = () => E.toList(recent).filter((e) => e.k === 'use' && !marks[e.id] && S.users[e.u]).reverse();

  window.EconTeacher = {
    enter() {
      const sub = (p, f, q) => subs.push(B.on(p, f, q));
      sub('acct', (v) => { S.accts = v || {}; A.render(); });
      sub('store/contrib', (v) => { S.storeContrib = v || {}; A.render(); });
      sub('feedMark', (v) => { marks = v || {}; A.render(); });
      subRecent();
      ensureConfig();
      if (window.PriceFeed) window.PriceFeed.start();
    },
    leave() {
      if (window.PriceFeed) window.PriceFeed.stop();
      subs.forEach((u) => u());
      subs = [];
      if (recentUnsub) recentUnsub();
      recentUnsub = null;
      recent = {}; marks = {}; recentLimit = 300;
      homeSel.clear();
      statCache = null;
    },
    recent: () => recent,
  };
  TC.addBadges(() => ({ home: pendingUses().length }));

  // 기록 목록에 계좌별 잔액(bal) 붙이기 — 불러온 범위 안에서 지금 잔액부터 거꾸로
  function withBalances(list) {
    const run = {};
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!(e.u in run)) run[e.u] = e.u === E.GOV ? (S.gov && S.gov.cash) || 0 : (S.accts[e.u] && S.accts[e.u].cash) || 0;
      e.bal = run[e.u];
      run[e.u] -= e.a || 0;
    }
    return list;
  }
  const whoTag = (u) => (u === E.GOV ? '<span class="ntag"><span class="nm">🏛️ 국고</span></span>' : S.users[u] ? nameTag(u) : '<span class="muted">(삭제된 학생)</span>');
  function feedRows(list, { showWho = true, showMark = true } = {}) {
    return list.map((e) => {
      const d = E.describe(e);
      const use = e.k === 'use' && showMark;
      return `<tr class="${use && !marks[e.id] ? 'hl' : ''}"><td class="muted nowrap">${fmtTime(e.t)}</td>${showWho ? `<td>${whoTag(e.u)}</td>` : ''}
        <td><span class="f-ic">${d.ic}</span><b>${esc(d.t)}</b>${d.sub ? `<div class="muted f-sub">${esc(d.sub)}</div>` : ''}</td>
        <td class="num"><b class="delta ${e.a > 0 ? 'up' : e.a < 0 ? 'down' : ''}">${e.a ? E.swon(e.a) : '-'}</b></td>
        <td class="num muted">${e.bal !== undefined ? E.won(e.bal) : ''}</td>
        ${showMark ? `<td>${use ? (marks[e.id] ? `<button class="btn xs ghost" data-mark="${e.id}" data-v="0">✅ 처리됨</button>` : `<button class="btn xs good" data-mark="${e.id}" data-v="1">처리 완료</button>`) : ''}</td>` : ''}</tr>`;
    }).join('');
  }

  /* ───────────── 학급 홈 ───────────── */
  TC.addTab('home', '학급 홈', () => {
    main().innerHTML = `<div class="a-head"><h2>학급 홈</h2><span class="muted" id="hm-sel"></span><span class="sp"></span>
        <button class="btn sm ghost" data-h="all">전체 선택</button><button class="btn sm ghost" data-h="none">선택 해제</button>
        <button class="btn sm primary" data-h="send">💸 보내기</button><button class="btn sm" data-h="take">📤 받기</button>
        <button class="btn sm" data-h="pick">🎲 뽑기</button><button class="btn sm" data-h="look">🔍 자산 살피기</button></div>
      <div class="econ-sum" id="hm-sum"></div>
      <div class="stu-cards" id="hm-grid" style="margin-top:16px"></div>
      <div class="grid2" style="margin-top:16px"><div class="panel" id="hm-use"></div><div class="panel" id="hm-recent"></div></div>`;
    main().onclick = onHome;
  }, () => {
    const ids = stuIds();
    for (const u of [...homeSel]) if (!S.users[u]) homeSel.delete(u);
    $('#hm-sel').textContent = homeSel.size ? `${homeSel.size}명 선택` : '학생을 눌러 선택하세요';
    setHtml($('#hm-sum'), summaryCards());
    setHtml($('#hm-grid'), ids.map((u) => {
      const w = E.worth(S.accts[u]);
      return `<button class="stu-card ${homeSel.has(u) ? 'sel' : ''}" data-hs="${u}">${E.avatar(u)}<span class="sc-nm">${nameTag(u)}</span>
        <span class="sc-cash ${w.cash < 0 ? 'down' : ''}">${E.won(w.cash)}</span><span class="sc-total">총 ${E.won(w.total)}</span>
        <span class="sc-look" data-look="${u}" title="자산 살피기">🔍</span></button>`;
    }).join('') || '<p class="empty">「관리 → 학생 관리」에서 학생을 먼저 등록하세요.</p>');
    const uses = pendingUses();
    setHtml($('#hm-use'), `<h3>✨ 아이템 사용 알림 <span class="muted">${uses.length}건</span></h3>${uses.length ? feedList(uses, true) : '<p class="empty">새 알림이 없어요</p>'}`);
    const rec = E.toList(recent).slice(-10).reverse();
    setHtml($('#hm-recent'), `<h3>🧾 최근 활동 <a class="muted link" href="#" data-h="feed">전체 보기 →</a></h3>${rec.length ? feedList(rec, false) : '<p class="empty">아직 활동이 없어요</p>'}`);
  });
  // 짧은 목록 (학급 홈)
  function feedList(list, mark) {
    return `<ul class="rows feed-rows">${list.map((e) => {
      const d = E.describe(e);
      return `<li><span class="muted fr-t">${fmtTime(e.t)}</span>${e.u === E.GOV ? '<b>🏛️ 국고</b>' : `<b>${esc(nameOf(e.u))}</b>`}<span class="fr-d">${d.ic} ${esc(d.t)}</span>
        <span class="right">${e.a ? `<b class="delta ${e.a > 0 ? 'up' : 'down'}">${E.swon(e.a)}</b>` : ''}${mark ? `<button class="btn xs good" data-mark="${e.id}" data-v="1">처리 완료</button>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }
  function summaryCards() {
    let total = 0, cash = 0, dep = 0, stock = 0;
    for (const u of Object.keys(S.users)) { const w = E.worth(S.accts[u]); total += w.total; cash += w.cash; dep += w.dep; stock += w.stock; }
    const today = E.kday(B.now());
    const nToday = Object.values(recent).filter((e) => e && e.t && E.kday(e.t) === today).length;
    return `<div class="stat"><div class="k">💰 유통 화폐 (학생 총자산)</div><div class="v">${E.won(total)}</div></div>
      <div class="stat"><div class="k">👛 쓸 수 있는 돈</div><div class="v">${E.won(cash)}</div></div>
      <div class="stat"><div class="k">🏦 예금</div><div class="v">${E.won(dep)}</div></div>
      <div class="stat"><div class="k">📈 주식</div><div class="v">${E.won(stock)}</div></div>
      <div class="stat"><div class="k">🏛️ 국고</div><div class="v">${E.won((S.gov && S.gov.cash) || 0)}</div></div>
      <div class="stat"><div class="k">🧾 오늘 활동</div><div class="v">${nToday}건</div></div>`;
  }
  async function onHome(e) {
    const mk = e.target.closest('[data-mark]');
    if (mk) { await E.ops.markUse(mk.dataset.mark, mk.dataset.v === '1'); return; }
    const look = e.target.closest('[data-look]');
    if (look) return inspect(look.dataset.look);
    const c = e.target.closest('[data-hs]');
    if (c) { homeSel.has(c.dataset.hs) ? homeSel.delete(c.dataset.hs) : homeSel.add(c.dataset.hs); A.render(); return; }
    const h = e.target.closest('[data-h]');
    if (!h) return;
    e.preventDefault();
    const act = h.dataset.h;
    if (act === 'all') { stuIds().forEach((u) => homeSel.add(u)); A.render(); return; }
    if (act === 'none') { homeSel.clear(); A.render(); return; }
    if (act === 'feed') return TC.go('econ', 'feed');
    if (act === 'pick') return picker([...homeSel]);
    const ids = [...homeSel];
    if (act === 'look') { if (ids.length !== 1) return toast('자산을 볼 학생을 한 명만 선택하세요. (카드의 🔍를 눌러도 돼요)', 'bad'); return inspect(ids[0]); }
    if (!ids.length) return toast('먼저 학생을 선택하세요.', 'bad');
    if (act === 'send') sendDialog(ids);
    if (act === 'take') takeDialog(ids);
  }
  const namesLine = (ids) => `${ids.slice(0, 8).map((u) => esc(nameOf(u))).join(', ')}${ids.length > 8 ? ` 외 ${ids.length - 8}명` : ''}`;
  function sendDialog(ids) {
    const c = E.cfg();
    const gov = (S.gov && S.gov.cash) || 0;
    const m = modal(`<h3>💸 보내기 · ${ids.length}명</h3><p class="muted" style="margin-top:0">${namesLine(ids)}</p>
      <div class="form-grid"><label>한 명에게 보낼 돈<input id="sd-amt" type="number" min="1" step="1000" inputmode="numeric" placeholder="예: 50000"></label>
      <label>사유 (학생에게 보여요)<input id="sd-memo" maxlength="60" placeholder="예: 발표 잘함"></label></div>
      <div class="seg" id="sd-src"><button data-v="new" class="on">새로 만든 돈</button><button data-v="gov">국고에서 (${E.won(gov)})</button></div>
      <label class="chk-line"><input type="checkbox" class="chk" id="sd-tax"> 소득세 ${c.tax}% 떼기 (떼인 세금은 국고로)</label>
      <p class="note" id="sd-sum"></p>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>보내기</button></div>`);
    let src = 'new';
    const sum = () => {
      const amt = Math.floor(Number(m.el.querySelector('#sd-amt').value) || 0);
      const tax = m.el.querySelector('#sd-tax').checked ? E.taxOf(amt, c.tax) : 0;
      m.el.querySelector('#sd-sum').innerHTML = amt ? `모두 ${E.won(amt * ids.length)}${tax ? ` · 한 명당 세금 ${E.won(tax)} → 받는 돈 ${E.won(amt - tax)}` : ''}${src === 'gov' && amt * ids.length > gov ? ' · <b style="color:var(--bad)">국고가 모자라 마이너스가 돼요</b>' : ''}` : '';
      return amt;
    };
    m.el.querySelector('#sd-amt').oninput = sum;
    m.el.querySelector('#sd-tax').onchange = sum;
    m.el.querySelector('#sd-src').onclick = (e2) => { const b = e2.target.closest('[data-v]'); if (!b) return; src = b.dataset.v; m.el.querySelectorAll('#sd-src button').forEach((x) => x.classList.toggle('on', x === b)); sum(); };
    m.el.querySelector('[data-ok]').onclick = async (e2) => {
      const amt = sum();
      if (amt < 1) return toast('보낼 돈을 적어 주세요.', 'bad');
      e2.target.disabled = true;
      const ok = await E.ops.send(ids, amt, m.el.querySelector('#sd-memo').value.trim(), { fromGov: src === 'gov', taxRate: m.el.querySelector('#sd-tax').checked ? c.tax : 0 });
      if (ok) m.close(); else e2.target.disabled = false;
    };
  }
  function takeDialog(ids) {
    const m = modal(`<h3>📤 받기 · ${ids.length}명</h3><p class="muted" style="margin-top:0">${namesLine(ids)}</p>
      <div class="form-grid"><label>한 명에게서 가져올 돈<input id="tk-amt" type="number" min="1" step="1000" inputmode="numeric"></label>
      <label>사유 (학생에게 보여요)<input id="tk-memo" maxlength="60" placeholder="예: 벌금"></label></div>
      <div class="seg" id="tk-dst"><button data-v="burn" class="on">없애기 (회수)</button><button data-v="gov">국고로 보내기</button></div>
      <p class="note" id="tk-sum"></p>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn danger" data-ok>가져오기</button></div>`);
    let dst = 'burn';
    const sum = () => {
      const amt = Math.floor(Number(m.el.querySelector('#tk-amt').value) || 0);
      const short = ids.filter((u) => ((S.accts[u] && S.accts[u].cash) || 0) < amt);
      m.el.querySelector('#tk-sum').innerHTML = amt ? `모두 ${E.won(amt * ids.length)}${short.length ? ` · <b style="color:var(--warn)">${short.map((u) => esc(nameOf(u))).join(', ')}은(는) 잔액이 모자라 마이너스가 돼요</b>` : ''}` : '';
      return amt;
    };
    m.el.querySelector('#tk-amt').oninput = sum;
    m.el.querySelector('#tk-dst').onclick = (e2) => { const b = e2.target.closest('[data-v]'); if (!b) return; dst = b.dataset.v; m.el.querySelectorAll('#tk-dst button').forEach((x) => x.classList.toggle('on', x === b)); };
    m.el.querySelector('[data-ok]').onclick = async (e2) => {
      const amt = sum();
      if (amt < 1) return toast('가져올 돈을 적어 주세요.', 'bad');
      e2.target.disabled = true;
      if (await E.ops.take(ids, amt, m.el.querySelector('#tk-memo').value.trim(), { toGov: dst === 'gov' })) m.close(); else e2.target.disabled = false;
    };
  }

  /* 뽑기: 선택한 학생(없으면 전체) 중에서 무작위로 */
  const picked = new Set();
  function picker(pool0) {
    const pool = (pool0.length ? pool0 : stuIds()).filter((u) => S.users[u]);
    if (!pool.length) return toast('학생이 없어요.', 'bad');
    const m = modal(`<h3>🎲 뽑기 <span class="muted" style="font-size:.7em">${pool0.length ? `선택한 ${pool.length}명 중` : `전체 ${pool.length}명 중`}</span></h3>
      <div class="row-flex"><label>몇 명<input id="pk-n" type="number" min="1" max="${pool.length}" value="1" style="width:90px"></label>
        <label class="chk-line" style="margin:0 0 8px"><input type="checkbox" class="chk" id="pk-ex" checked> 이미 뽑힌 학생 빼기</label>
        <button class="btn ghost sm" id="pk-reset" style="margin-bottom:6px">뽑힌 기록 지우기</button></div>
      <div class="pick-board" id="pk-board">${pool.map((u) => `<span data-pk="${u}" class="${picked.has(u) ? 'was' : ''}">${esc(nameOf(u))}</span>`).join('')}</div>
      <div class="pick-result" id="pk-res"></div>
      <div class="foot"><button class="btn ghost" data-close>닫기</button><button class="btn primary lg" id="pk-go">🎲 뽑기!</button></div>`, { wide: true });
    const board = m.el.querySelector('#pk-board');
    const mark = () => board.querySelectorAll('[data-pk]').forEach((s) => s.classList.toggle('was', picked.has(s.dataset.pk)));
    m.el.querySelector('#pk-reset').onclick = () => { picked.clear(); mark(); };
    m.el.querySelector('#pk-go').onclick = (e2) => {
      const ex = m.el.querySelector('#pk-ex').checked;
      const cand = pool.filter((u) => !ex || !picked.has(u));
      const n = Math.max(1, Math.min(cand.length, Math.floor(Number(m.el.querySelector('#pk-n').value) || 1)));
      if (!cand.length) return toast('더 뽑을 학생이 없어요. 「뽑힌 기록 지우기」를 누르세요.', 'bad');
      const res = [];
      const bag = cand.slice();
      for (let i = 0; i < n; i++) res.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
      e2.target.disabled = true;
      const spans = [...board.querySelectorAll('[data-pk]')].filter((s) => cand.includes(s.dataset.pk));
      let t = 0;
      const spin = setInterval(() => {
        spans.forEach((s) => s.classList.remove('hot'));
        spans[Math.floor(Math.random() * spans.length)].classList.add('hot');
        if ((t += 80) >= 1600) {
          clearInterval(spin);
          spans.forEach((s) => s.classList.remove('hot'));
          res.forEach((u) => picked.add(u));
          mark();
          board.querySelectorAll('[data-pk]').forEach((s) => s.classList.toggle('win', res.includes(s.dataset.pk)));
          m.el.querySelector('#pk-res').innerHTML = res.map((u) => `<div class="pk-win">${E.avatar(u, 'lg')}<b>${esc(nameOf(u))}</b></div>`).join('');
          e2.target.disabled = false;
        }
      }, 80);
    };
  }

  /* 자산 살피기: 한 학생의 계좌·아이템·기록 */
  function inspect(u) {
    let view = 'acct';
    let feedOne = null, unsub = null;
    const m = modal('<div id="ins"></div>', { wide: true, onClose: () => { if (unsub) unsub(); stop(); } });
    const box = m.el.querySelector('#ins');
    const draw = () => {
      if (!S.users[u]) { m.close(); return; }
      const a = S.accts[u] || {};
      const w = E.worth(a);
      const c = E.cfg();
      const av = a.avatar || {};
      let body = '';
      if (view === 'acct') {
        const deps = Object.entries(a.dep || {}).sort((x, y) => E.depMat(x[1]) - E.depMat(y[1]));
        const holds = Object.entries(a.hold || {}).filter(([, h]) => h && h.q > 0);
        body = `<div class="grid4"><div class="stat"><div class="k">총 자산</div><div class="v">${E.won(w.total)}</div></div>
          <div class="stat"><div class="k">쓸 수 있는 돈</div><div class="v ${w.cash < 0 ? 'down' : ''}">${E.won(w.cash)}</div><button class="btn xs" data-i="cash" style="margin-top:6px">잔액 고치기</button></div>
          <div class="stat"><div class="k">예금</div><div class="v">${E.won(w.dep)}</div></div><div class="stat"><div class="k">주식</div><div class="v">${E.won(w.stock)}</div></div></div>
          <h4>🏦 예금</h4>${deps.length ? `<table class="tbl"><tbody>${deps.map(([did, d]) => { const done = B.now() >= E.depMat(d); return `<tr><td>${E.won(d.p)}</td><td>이자율 ${d.r}% · 이자 ${E.won(d.i)}</td><td>${fmtDate(d.s)} → ${fmtDate(E.depMat(d))}</td><td>${done ? '<span class="pill good">만기</span>' : '<span class="pill">진행 중</span>'}</td>
            <td><button class="btn xs" data-i="wd" data-id="${esc(did)}">${done ? '원금+이자 지급' : '중도 해지'}</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">없음</p>'}
          <h4>📈 주식</h4>${holds.length ? `<table class="tbl"><tbody>${holds.map(([sid, h]) => { const s = S.market[sid] || { n: '(없는 증권)', p: 0 }; const val = Math.floor(h.q * s.p); return `<tr><td><b>${esc(s.n)}</b></td><td>${E.qty(h.q)}주</td><td>투자금 ${E.won(h.c)}</td><td>평가 ${E.won(val)} <span class="delta ${val - h.c > 0 ? 'up' : val - h.c < 0 ? 'down' : ''}">${E.swon(val - h.c)}</span></td>
            <td>${s.p ? `<button class="btn xs" data-i="sell" data-id="${esc(sid)}">전부 팔아 주기</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">없음</p>'}`;
      } else if (view === 'items') {
        const ids = new Set([...Object.keys(S.store || {}), ...Object.keys(a.items || {})]);
        const rows = [...ids].map((iid) => [iid, S.store[iid] || { n: '(없어진 아이템)', ord: 9999 }]).filter(([, it]) => !it.g).sort((x, y) => (x[1].ord ?? 999) - (y[1].ord ?? 999));
        body = `<p class="note" style="margin-top:0">개수를 고치고 저장하면 학생 기록에 「아이템 조정」으로 남아요.</p>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>아이템</th><th>분류</th><th class="num">개수</th></tr></thead><tbody>
          ${rows.map(([iid, it]) => `<tr><td>${esc(it.ic || '🎁')} ${esc(it.n)}</td><td class="muted">${esc(it.c || '')}</td><td class="num"><input type="number" min="0" data-iq="${esc(iid)}" value="${(a.items && a.items[iid]) || 0}" style="width:90px"></td></tr>`).join('')}
          </tbody></table></div><div class="form-grid" style="margin-top:10px"><label>사유<input id="ins-memo" maxlength="60" placeholder="예: 쿠폰 지급"></label></div>
          <div class="foot"><button class="btn primary" data-i="items">아이템 저장</button></div>`;
      } else {
        if (!unsub) unsub = B.on('feed', (v) => { feedOne = v || {}; draw(); }, { child: 'u', equalTo: u, last: 200 });
        const list = feedOne ? E.withBalance(E.toList(feedOne), a.cash || 0).reverse() : null;
        body = !list ? '<p class="empty">불러오는 중…</p>' : list.length ? `<div class="tbl-wrap" style="max-height:50vh"><table class="tbl"><tbody>${feedRows(list, { showWho: false, showMark: false })}</tbody></table></div>` : '<p class="empty">기록이 없어요</p>';
      }
      box.innerHTML = `<div class="ins-head">${E.avatar(u, 'lg')}<div><h3 style="margin:0">${nameTag(u)}</h3><div class="muted">${esc(S.users[u].loginId || '')}</div></div><span class="sp"></span>
          <label class="mini">신용 등급<select data-i="grade">${E.grades().map((g) => `<option ${(a.grade || c.bank.def) === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
          <label class="mini">아바타<select data-i="avstyle">${E.AV_STYLES.map((s) => `<option ${(av.style || 'thumbs') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <button class="btn xs ghost" data-i="avnew" title="다른 얼굴">🔄</button></div>
        <div class="seg" style="margin:12px 0">${[['acct', '계좌'], ['items', '아이템'], ['log', '기록']].map(([k, n]) => `<button data-v="${k}" class="${view === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        ${body}<div class="foot"><button class="btn" data-close>닫기</button></div>`;
    };
    // 계좌가 바뀌면 다시 그림 (아이템 입력 중에는 그대로)
    let last = '';
    const tick = setInterval(() => { const k = JSON.stringify([S.accts[u], S.market]); if (k !== last && view !== 'items') { last = k; draw(); } }, 700);
    const stop = () => clearInterval(tick);
    draw();
    box.onchange = async (e) => {
      const g = e.target.closest('[data-i="grade"]');
      if (g) { await B.set(`acct/${u}/grade`, g.value); toast(`${nameOf(u)} 신용 등급 ${g.value}`, 'good'); return; }
      const st = e.target.closest('[data-i="avstyle"]');
      if (st) { await B.set(`acct/${u}/avatar`, { style: st.value, seed: (S.accts[u] && S.accts[u].avatar && S.accts[u].avatar.seed) || u }); draw(); }
    };
    box.onclick = async (e) => {
      const v = e.target.closest('[data-v]');
      if (v) { view = v.dataset.v; draw(); return; }
      const b = e.target.closest('[data-i]');
      if (!b || b.tagName === 'SELECT') return;
      const a = S.accts[u] || {};
      if (b.dataset.i === 'avnew') { await B.set(`acct/${u}/avatar`, { style: (a.avatar && a.avatar.style) || 'thumbs', seed: 's' + Math.random().toString(36).slice(2, 8) }); draw(); }
      if (b.dataset.i === 'cash') {
        const mm = modal(`<h3>잔액 고치기 · ${esc(nameOf(u))}</h3><label>새 잔액 (지금 ${E.won(a.cash || 0)})<input id="nc" type="number" value="${a.cash || 0}"></label>
          <label>사유<input id="ncm" maxlength="60" placeholder="예: 잘못 보낸 돈 바로잡기"></label>
          <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
        mm.el.querySelector('[data-ok]').onclick = async () => {
          const v2 = Math.round(Number(mm.el.querySelector('#nc').value));
          if (!isFinite(v2)) return;
          if (await E.ops.adjust(u, v2, mm.el.querySelector('#ncm').value.trim())) mm.close();
        };
      }
      if (b.dataset.i === 'wd') {
        const d = a.dep[b.dataset.id];
        const done = B.now() >= E.depMat(d);
        if (await confirmBox(done ? '예금 지급' : '중도 해지', done ? `원금과 이자 ${E.won(d.p + d.i)}을 학생 계좌로 넣을까요?` : `만기 전이라 원금 ${E.won(d.p)}만 돌려줘요. 해지할까요?`, done ? '지급' : '해지', !done)) await E.ops.withdraw(b.dataset.id, u);
      }
      if (b.dataset.i === 'sell') {
        const s = S.market[b.dataset.id];
        const h = a.hold[b.dataset.id];
        if (await confirmBox('전부 팔아 주기', `${esc(s.n)} ${E.qty(h.q)}주를 지금 가격 ${E.won(s.p)}에 팔아 ${E.won(Math.floor(h.q * s.p))}을 계좌에 넣을까요?`, '팔기')) await E.ops.stockSell(b.dataset.id, h.q, u);
      }
      if (b.dataset.i === 'items') {
        const ch = {};
        box.querySelectorAll('[data-iq]').forEach((i) => { ch[i.dataset.iq] = Math.max(0, Math.floor(Number(i.value) || 0)); });
        b.disabled = true;
        await E.ops.setItems(u, ch, box.querySelector('#ins-memo').value.trim());
        b.disabled = false;
        view = 'acct';
        draw();
      }
    };
  }

  /* ───────────── 상점 ───────────── */
  TC.addTab('shop', '상점', () => {
    main().innerHTML = `<div class="a-head"><h2>상점</h2><span class="muted">학생이 산 돈은 사라져요(소각). 공동구매는 반 친구들이 함께 돈을 모아요.</span><span class="sp"></span>
        <button class="btn primary" data-s="new">+ 새 상품</button></div>
      <div class="tbl-wrap" id="sh-table"></div>
      <div class="panel" style="margin-top:16px" id="sh-group"></div>`;
    main().onclick = onShop;
  }, () => {
    const items = sortBy(S.store);
    const sold = {};
    for (const e of Object.values(recent)) if (e && e.k === 'buy') sold[e.i] = (sold[e.i] || 0) + (e.q || 0);
    const holders = (iid) => Object.values(S.accts).reduce((n, a) => n + ((a && a.items && a.items[iid]) || 0), 0);
    $('#sh-table').innerHTML = items.length ? `<table class="tbl"><thead><tr><th></th><th>상품</th><th>분류</th><th class="num">가격</th><th class="num">재고</th><th class="num">보유 한도</th><th class="num">학생 보유</th><th class="num">최근 판매</th><th>판매</th><th></th></tr></thead><tbody>
      ${items.map(([iid, it]) => `<tr class="${it.on === false ? 'off' : ''}"><td>${esc(it.ic || '🎁')}</td><td><b>${esc(it.n)}</b>${it.d ? `<div class="muted f-sub">${esc(it.d)}</div>` : ''}</td><td>${it.g ? '<span class="pill warn">공동구매</span>' : esc(it.c || '')}</td>
        <td class="num">${it.g ? `목표 ${E.won(it.g)}` : E.won(it.p)}</td><td class="num">${typeof it.st === 'number' ? it.st : '∞'}</td><td class="num">${it.lim || '-'}</td>
        <td class="num">${it.g ? '-' : holders(iid)}</td><td class="num">${sold[iid] || 0}</td>
        <td><label class="switch"><input type="checkbox" data-on="${esc(iid)}" ${it.on !== false ? 'checked' : ''}><i></i></label></td>
        <td><div class="row-actions"><button class="btn xs" data-s="edit" data-id="${esc(iid)}">수정</button><button class="btn xs danger" data-s="del" data-id="${esc(iid)}">삭제</button></div></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty" style="padding:30px">아직 상품이 없어요. 「+ 새 상품」 또는 「관리 → 수페에서 가져오기」로 만들 수 있어요.</p>';
    const groups = items.filter(([, it]) => it.g);
    $('#sh-group').innerHTML = `<h3>🤝 공동구매 현황</h3>${groups.length ? groups.map(([iid, it]) => {
      const con = Object.entries(S.storeContrib[iid] || {}).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
      const pct = Math.min(100, Math.round(((it.r || 0) / it.g) * 100));
      return `<div class="grp-row"><div class="a-head" style="margin:0 0 6px"><b>${esc(it.ic || '🤝')} ${esc(it.n)}</b><span class="muted">${E.won(it.r || 0)} / ${E.won(it.g)} (${pct}%) · ${con.length}명 참여</span><span class="sp"></span>
          ${it.done ? `<span class="pill good">달성 처리함 ${fmtDate(it.done)}</span>` : `<button class="btn xs good" data-s="done" data-id="${esc(iid)}" ${(it.r || 0) < it.g ? 'disabled' : ''}>목표 달성 처리</button>`}
          <button class="btn xs danger" data-s="refund" data-id="${esc(iid)}" ${con.length ? '' : 'disabled'}>모두 환불</button></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="grp-con">${con.map(([u, v]) => `<span>${esc(S.users[u] ? nameOf(u) : '(삭제됨)')} <b>${E.won(v)}</b></span>`).join('') || '<span class="muted">아직 참여한 학생이 없어요</span>'}</div></div>`;
    }).join('') : '<p class="empty">공동구매 상품이 없어요</p>'}`;
  });
  async function onShop(e) {
    const sw = e.target.closest('[data-on]');
    if (sw) { await B.set(`store/items/${sw.dataset.on}/on`, sw.checked); return; }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.s === 'new') return editItem(null);
    if (b.dataset.s === 'edit') return editItem(id);
    const it = S.store[id];
    if (b.dataset.s === 'del') {
      const held = Object.values(S.accts).filter((a) => a && a.items && a.items[id] > 0).length;
      if (!(await confirmBox('상품 삭제', `「${esc(it.n)}」을 지울까요?${held ? `<br><b>${held}명</b>이 가지고 있어요. 가진 아이템은 남지만 이름이 「없어진 아이템」으로 보여요. 판매만 멈추려면 「판매」 스위치를 끄세요.` : ''}${it.g && it.r ? '<br><b style="color:var(--bad)">공동구매에 모인 돈이 있어요. 먼저 「모두 환불」하세요.</b>' : ''}`, '삭제', true))) return;
      if (it.g && it.r) return;
      await B.update('', { [`store/items/${id}`]: null, [`store/contrib/${id}`]: null });
    }
    if (b.dataset.s === 'done') {
      if (await confirmBox('공동구매 달성', `「${esc(it.n)}」 목표 금액이 모였어요. 달성 처리하면 더 이상 돈을 받지 않아요. 약속한 보상은 직접 챙겨 주세요.`, '달성 처리')) await B.set(`store/items/${id}/done`, B.now());
    }
    if (b.dataset.s === 'refund') {
      if (await confirmBox('공동구매 환불', `「${esc(it.n)}」에 모인 ${E.won(it.r || 0)}을 낸 학생들에게 모두 돌려줄까요?`, '환불', true)) await E.ops.groupRefund(id);
    }
  }
  function editItem(iid) {
    const c = E.cfg();
    const it = iid ? S.store[iid] : { n: '', c: c.cats.find((k) => k !== '공동구매') || '', p: 0, on: true, ic: '🎁' };
    const isGroup = !!it.g;
    const cats = [...new Set([...c.cats.filter((k) => k !== '공동구매'), it.c].filter(Boolean))];
    const m = modal(`<h3>${iid ? '상품 수정' : '새 상품'}</h3>
      <div class="seg" id="it-type"><button data-v="n" class="${isGroup ? '' : 'on'}">일반 상품</button><button data-v="g" class="${isGroup ? 'on' : ''}">공동구매</button></div>
      <div class="form-grid" style="margin-top:10px">
        <label>이름<input id="it-n" maxlength="40" value="${esc(it.n)}" placeholder="예: 자리 선택권 (1일)"></label>
        <label>아이콘 (이모지)<input id="it-ic" maxlength="4" value="${esc(it.ic || '')}" placeholder="🎁"></label>
        <label data-t="n">분류<select id="it-c">${cats.map((k) => `<option ${k === it.c ? 'selected' : ''}>${esc(k)}</option>`).join('')}<option value="__new">+ 새 분류…</option></select></label>
        <label data-t="n">가격<input id="it-p" type="number" min="0" step="1000" value="${it.p || 0}"></label>
        <label data-t="n">재고 <small>비우면 무제한</small><input id="it-st" type="number" min="0" value="${typeof it.st === 'number' ? it.st : ''}"></label>
        <label data-t="n">한 사람 보유 한도 <small>비우면 없음</small><input id="it-lim" type="number" min="1" value="${it.lim || ''}"></label>
        <label data-t="g">목표 금액<input id="it-g" type="number" min="1" step="10000" value="${it.g || ''}"></label>
        <label>순서<input id="it-ord" type="number" value="${it.ord ?? ''}" placeholder="작을수록 앞"></label>
      </div>
      <label>설명 (학생에게 보여요)<input id="it-d" maxlength="80" value="${esc(it.d || '')}"></label>
      <label class="chk-line"><input type="checkbox" class="chk" id="it-on" ${it.on !== false ? 'checked' : ''}> 지금 판매하기</label>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
    let type = isGroup ? 'g' : 'n';
    const syncType = () => m.el.querySelectorAll('[data-t]').forEach((l) => l.classList.toggle('hidden', l.dataset.t !== type));
    syncType();
    m.el.querySelector('#it-type').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b || (iid && b.dataset.v !== type)) { if (b && iid) toast('저장한 상품의 종류는 바꿀 수 없어요.', 'bad'); return; } type = b.dataset.v; m.el.querySelectorAll('#it-type button').forEach((x) => x.classList.toggle('on', x === b)); syncType(); };
    m.el.querySelector('#it-c').onchange = async (e) => {
      if (e.target.value !== '__new') return;
      const name = (prompt('새 분류 이름') || '').trim();
      if (!name) { e.target.value = cats[0] || ''; return; }
      const raw = Object.assign({}, S.econRaw || E.DEFAULTS);
      raw.cats = [...new Set([...(raw.cats || []), name])];
      await B.set('config/econ/cats', raw.cats);
      const o = document.createElement('option');
      o.textContent = name;
      e.target.insertBefore(o, e.target.lastElementChild);
      e.target.value = name;
    };
    m.el.querySelector('[data-ok]').onclick = async () => {
      const v = (id) => m.el.querySelector(id).value.trim();
      const n = v('#it-n');
      if (!n) return toast('이름을 적어 주세요.', 'bad');
      const x = { n, ic: v('#it-ic') || null, d: v('#it-d') || null, on: m.el.querySelector('#it-on').checked, ord: v('#it-ord') === '' ? null : Number(v('#it-ord')) };
      if (type === 'g') {
        const g = Math.floor(Number(v('#it-g')) || 0);
        if (g < 1) return toast('목표 금액을 적어 주세요.', 'bad');
        Object.assign(x, { g, c: '공동구매', p: 0 });
        // 모인 돈(r)은 학생들이 보태는 곳이라 새로 만들 때만 0으로 (고칠 때 덮어쓰면 방금 낸 돈이 사라질 수 있음)
        if (!iid) x.r = 0;
      } else {
        const p = Math.floor(Number(v('#it-p')));
        if (!(p >= 0)) return toast('가격을 확인하세요.', 'bad');
        Object.assign(x, { p, c: v('#it-c') === '__new' ? '' : v('#it-c'), st: v('#it-st') === '' ? null : Math.max(0, Math.floor(Number(v('#it-st')))), lim: v('#it-lim') === '' ? null : Math.max(1, Math.floor(Number(v('#it-lim')))) });
      }
      const key = iid || B.newKey();
      const upd = {};
      for (const [k, val] of Object.entries(x)) upd[`store/items/${key}/${k}`] = val;
      if (!iid && type === 'n') upd[`store/items/${key}/g`] = null;
      await B.update('', upd);
      m.close();
      toast('저장했어요.', 'good');
    };
  }

  /* ───────────── 직업·급여 ───────────── */
  const payExtra = {};
  let payMemo = '';
  let payOff = new Set();
  let taxDraft = null; // 세율을 고치는 중이면 저장 전에도 표에 바로 보여 줌
  const clampRate = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  // 이번 급여에 쓸 소득세율: 「소득세 떼기」를 끄면 0
  const payRate = () => { const c = E.cfg(); return c.taxOn ? (taxDraft ?? c.tax) : 0; };
  TC.addTab('jobs', '직업·급여', () => {
    main().innerHTML = `<div class="a-head"><h2>직업·급여</h2><span class="muted" id="jb-info"></span><span class="sp"></span><button class="btn primary" data-j="new">+ 새 직업</button></div>
      <div class="tbl-wrap" id="jb-table"></div><div class="panel" id="jb-pay" style="margin-top:16px"></div>`;
    main().onclick = onJobs;
    main().oninput = (e) => {
      const x = e.target.closest('[data-extra]');
      if (x) { payExtra[x.dataset.extra] = Math.round(Number(x.value) || 0); drawPayTotals(); }
      if (e.target.id === 'pay-memo') payMemo = e.target.value;
      if (e.target.id === 'pay-rate') { taxDraft = clampRate(e.target.value); drawPayTotals(); }
    };
    main().onchange = async (e) => {
      const c = e.target.closest('[data-payon]');
      if (c) { c.checked ? payOff.delete(c.dataset.payon) : payOff.add(c.dataset.payon); drawPayTotals(); }
      if (e.target.id === 'pay-taxon') {
        const on = e.target.checked;
        await B.set('config/econ/taxOn', on);
        drawPayTotals();
        toast(on ? '급여에서 소득세를 떼요.' : '급여에서 소득세를 떼지 않아요.', 'good');
      }
      if (e.target.id === 'pay-rate') {
        const r = clampRate(e.target.value);
        e.target.value = r;
        await B.set('config/econ/tax', r);
        taxDraft = null;
        drawPayTotals();
        toast(`소득세율을 ${r}%로 정했어요.`, 'good');
      }
    };
  }, () => {
    const c = E.cfg();
    $('#jb-info').textContent = `마지막 급여 ${c.lastPay ? fmtTime(c.lastPay) : '없음'}`;
    const jobs = sortBy(S.jobs, (a, b) => (b.w || 0) - (a.w || 0));
    $('#jb-table').innerHTML = jobs.length ? `<table class="tbl"><thead><tr><th>직업</th><th class="num">급여</th><th>맡은 학생</th><th>사용</th><th></th></tr></thead><tbody>
      ${jobs.map(([jid, j]) => { const mem = Object.keys(j.mem || {}).filter((u) => S.users[u]); return `<tr class="${j.on === false ? 'off' : ''}"><td><b>${esc(j.t)}</b>${j.d ? `<div class="muted f-sub">${esc(j.d)}</div>` : ''}</td><td class="num">${E.won(j.w || 0)}</td>
        <td><div class="chips-sm">${mem.map((u) => `<span>${esc(nameOf(u))}</span>`).join('') || '<span class="muted">없음</span>'}</div></td>
        <td><label class="switch"><input type="checkbox" data-jon="${esc(jid)}" ${j.on !== false ? 'checked' : ''}><i></i></label></td>
        <td><div class="row-actions"><button class="btn xs" data-j="edit" data-id="${esc(jid)}">수정</button><button class="btn xs danger" data-j="del" data-id="${esc(jid)}">삭제</button></div></td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty" style="padding:30px">아직 직업이 없어요.</p>';
    drawPay();
  });
  function payRows() {
    const rate = payRate();
    const lv = (u) => TC.levelsOf(u);
    return stuIds().map((u) => {
      const js = Object.values(S.jobs || {}).filter((j) => j && j.on !== false && j.mem && j.mem[u]);
      const base = js.reduce((n, j) => n + (j.w || 0), 0);
      const L = lv(u);
      const bonus = window.Tracks.wageBonusAll(L);
      const extra = payExtra[u] || 0;
      const g = Math.max(0, base + bonus + extra);
      const x = E.taxOf(g, rate);
      return { u, js, base, bonus, extra, g, x, n: [...js.map((j) => j.t), bonus ? '급수 수당' : ''].filter(Boolean).join(', ') };
    });
  }
  function drawPay() {
    const el = $('#jb-pay');
    if (!el) return;
    const focused = document.activeElement && el.contains(document.activeElement);
    if (focused) { drawPayTotals(); return; }
    const c = E.cfg();
    const rows = payRows();
    const svd = (u) => (TC.svDaysThisWeek ? TC.svDaysThisWeek(u) : 0);
    el.innerHTML = `<h3>💰 급여 보내기 <span class="muted">급수 수당 = 타자·리코더 급수표의 「주급 추가」 · 1인1역 = 이번 주(월~일) 인정된 날 · 「추가」에 −를 넣으면 깎여요</span></h3>
      <div class="pay-tax"><label class="pay-on"><span class="switch"><input type="checkbox" id="pay-taxon" ${c.taxOn ? 'checked' : ''}><i></i></span>소득세 떼기</label>
        <label class="pay-rate">세율<input id="pay-rate" type="number" min="0" max="100" step="0.5" value="${taxDraft ?? c.tax}" ${c.taxOn ? '' : 'disabled'}>%</label>
        <span class="muted">떼인 세금은 국고로 가요 · 바꾸면 바로 저장되고 학생 「직업」 화면에도 보여요</span></div>
      <div class="tbl-wrap"><table class="tbl pay-tbl"><thead><tr><th></th><th>학생</th><th>직업</th><th class="num">1인1역</th><th class="num">기본급</th><th class="num">급수 수당</th><th class="num">추가</th><th class="num">세전</th><th class="num" id="pay-thx"></th><th class="num">받는 돈</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.g ? '' : 'off'}"><td><input type="checkbox" class="chk" data-payon="${r.u}" ${payOff.has(r.u) || !r.g ? '' : 'checked'} ${r.g ? '' : 'disabled'}></td><td>${esc(nameOf(r.u))}</td><td class="muted">${esc(r.js.map((j) => j.t).join(', ') || '-')}</td>
        <td class="num">${r.js.length ? `${svd(r.u)}일` : '-'}</td>
        <td class="num">${E.num(r.base)}</td><td class="num">${r.bonus ? E.num(r.bonus) : '-'}</td><td class="num"><input type="number" step="10000" data-extra="${r.u}" value="${payExtra[r.u] || ''}" placeholder="0" style="width:95px"></td>
        <td class="num" data-pg="${r.u}">${E.num(r.g)}</td><td class="num" data-px="${r.u}">${r.x ? E.num(r.x) : '-'}</td><td class="num"><b data-pn="${r.u}">${E.num(r.g - r.x)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="form-grid" style="margin-top:10px"><label>메모 (학생 기록에 보여요)<input id="pay-memo" maxlength="40" value="${esc(payMemo)}" placeholder="예: 9월 4주 주급"></label></div>
      <p class="note" id="pay-sum"></p>
      <div class="foot"><button class="btn primary lg" data-j="pay">급여 보내기</button></div>`;
    drawPayTotals();
  }
  function drawPayTotals() {
    const c = E.cfg();
    const rate = payRate();
    const rows = payRows();
    let g = 0, x = 0, n = 0;
    for (const r of rows) {
      const on = r.g > 0 && !payOff.has(r.u);
      const pg = $(`[data-pg="${r.u}"]`);
      if (pg) { pg.textContent = E.num(r.g); $(`[data-px="${r.u}"]`).textContent = r.x ? E.num(r.x) : '-'; $(`[data-pn="${r.u}"]`).textContent = E.num(r.g - r.x); }
      if (on) { g += r.g; x += r.x; n++; }
    }
    const th = $('#pay-thx');
    if (th) th.textContent = c.taxOn ? `소득세 ${rate}%` : '소득세 (안 뗌)';
    const ri = $('#pay-rate');
    if (ri) ri.disabled = !c.taxOn;
    const el = $('#pay-sum');
    if (el) el.innerHTML = `${n}명 · 세전 ${E.won(g)} · ${c.taxOn ? `소득세 ${rate}% ${E.won(x)} (국고로)` : '소득세 안 뗌'} · 학생이 받는 돈 <b>${E.won(g - x)}</b>`;
  }
  async function onJobs(e) {
    const sw = e.target.closest('[data-jon]');
    if (sw) { await B.set(`jobs/${sw.dataset.jon}/on`, sw.checked); return; }
    const b = e.target.closest('[data-j]');
    if (!b) return;
    if (b.dataset.j === 'new') return editJob(null);
    if (b.dataset.j === 'edit') return editJob(b.dataset.id);
    if (b.dataset.j === 'del') {
      const j = S.jobs[b.dataset.id];
      if (await confirmBox('직업 삭제', `「${esc(j.t)}」 직업을 지울까요? 맡은 학생도 함께 빠져요.`, '삭제', true)) await B.remove(`jobs/${b.dataset.id}`);
      return;
    }
    if (b.dataset.j === 'pay') {
      const rows = payRows().filter((r) => r.g > 0 && !payOff.has(r.u));
      if (!rows.length) return toast('급여를 받을 학생이 없어요. 직업을 먼저 정해 주세요.', 'bad');
      const g = rows.reduce((n, r) => n + r.g, 0), x = rows.reduce((n, r) => n + r.x, 0);
      const q = x ? `${rows.length}명에게 세전 ${E.won(g)}을 보내고, 소득세 ${E.won(x)}은 국고에 넣을까요?` : `${rows.length}명에게 급여 ${E.won(g)}을 보낼까요? (소득세 안 뗌)`;
      if (!(await confirmBox('급여 보내기', `${q}${payMemo ? `<br>메모: ${esc(payMemo)}` : ''}`, '보내기'))) return;
      b.disabled = true;
      if (await E.ops.payroll(rows, payMemo)) { for (const k of Object.keys(payExtra)) delete payExtra[k]; payMemo = ''; $('#jb-pay').innerHTML = ''; drawPay(); }
      b.disabled = false;
    }
  }
  function editJob(jid) {
    const j = jid ? S.jobs[jid] : { t: '', w: 0, on: true, mem: {} };
    const m = modal(`<h3>${jid ? '직업 수정' : '새 직업'}</h3>
      <div class="form-grid"><label>이름<input id="jb-t" maxlength="30" value="${esc(j.t)}" placeholder="예: 칠판 지킴이"></label>
        <label>급여 (한 번 줄 때)<input id="jb-w" type="number" min="0" step="10000" value="${j.w || 0}"></label>
        <label>순서<input id="jb-o" type="number" value="${j.ord ?? ''}"></label></div>
      <label>하는 일<input id="jb-d" maxlength="60" value="${esc(j.d || '')}" placeholder="예: 쉬는 시간마다 칠판 지우기"></label>
      <h4>맡은 학생</h4><div class="stu-grid" id="jb-mem">${stuIds().map((u) => `<button data-mu="${u}" class="${j.mem && j.mem[u] ? 'sel' : ''}"><span class="nm">${esc(nameOf(u))}</span>
        <span class="sub">${Object.entries(S.jobs || {}).filter(([k, x]) => k !== jid && x && x.mem && x.mem[u]).map(([, x]) => esc(x.t)).join(', ') || '&nbsp;'}</span></button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`, { wide: true });
    const mem = new Set(Object.keys(j.mem || {}));
    m.el.querySelector('#jb-mem').onclick = (e) => { const b = e.target.closest('[data-mu]'); if (!b) return; mem.has(b.dataset.mu) ? mem.delete(b.dataset.mu) : mem.add(b.dataset.mu); b.classList.toggle('sel', mem.has(b.dataset.mu)); };
    m.el.querySelector('[data-ok]').onclick = async () => {
      const t = m.el.querySelector('#jb-t').value.trim();
      if (!t) return toast('이름을 적어 주세요.', 'bad');
      const o = m.el.querySelector('#jb-o').value.trim();
      const memObj = {};
      for (const u of mem) if (S.users[u]) memObj[u] = true;
      await B.set(`jobs/${jid || B.newKey()}`, { t, w: Math.max(0, Math.floor(Number(m.el.querySelector('#jb-w').value) || 0)), d: m.el.querySelector('#jb-d').value.trim() || null, ord: o === '' ? null : Number(o), on: j.on !== false, mem: memObj });
      m.close();
      toast('저장했어요.', 'good');
    };
  }

  /* ───────────── 재테크: 신용 등급·예금 · 증권 ───────────── */
  TC.addTab('bank', '재테크', () => {
    main().innerHTML = `<div class="a-head"><h2>재테크</h2><span class="sp"></span><button class="btn" data-b="class">+ 학급 증권 만들기</button><button class="btn primary" data-b="real">+ 실제 주식 연결</button></div>
      <div class="panel" id="bk-stocks"></div>
      <div class="panel" style="margin-top:16px" id="bk-bank"></div>`;
    main().onclick = onBank;
    main().onchange = async (e) => {
      const g = e.target.closest('[data-grade]');
      if (g) { await B.set(`acct/${g.dataset.grade}/grade`, g.value); toast(`${nameOf(g.dataset.grade)} 신용 등급 ${g.value}`, 'good'); }
      const so = e.target.closest('[data-son]');
      if (so) await B.set(`market/${so.dataset.son}/on`, so.checked);
    };
  }, () => {
    const c = E.cfg();
    const now = B.now();
    const stocks = sortBy(S.market);
    const holders = (sid) => Object.entries(S.accts).filter(([u, a]) => S.users[u] && a && a.hold && a.hold[sid] && a.hold[sid].q > 0);
    $('#bk-stocks').innerHTML = `<h3>📈 증권 <span class="muted">학급 증권은 선생님이 가격을 정하고, 실제 주식은 시세를 따라가요 (평일 장중 1분마다)</span></h3>
      ${stocks.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>증권</th><th>종류</th><th class="num">가격</th><th class="num">등락</th><th>시세 시각</th><th class="num">투자자</th><th class="num">투자금 / 평가액</th><th>거래</th><th></th></tr></thead><tbody>
        ${stocks.map(([sid, s]) => { const hs = holders(sid); const cost = hs.reduce((n, [, a]) => n + (a.hold[sid].c || 0), 0); const val = hs.reduce((n, [, a]) => n + Math.floor(a.hold[sid].q * s.p), 0); const ch = Number(s.ch) || 0; const stale = s.ty === 'real' && now - (s.ut || 0) > 30 * 60000;
          return `<tr class="${s.on === false ? 'off' : ''}"><td><b>${esc(s.n)}</b>${s.d ? `<div class="muted f-sub">${esc(s.d)}</div>` : ''}</td><td>${s.ty === 'real' ? `<span class="pill warn">${esc(s.mk || 'KRX')} ${esc(s.sym || '')}</span>` : '<span class="pill">학급 증권</span>'}</td>
            <td class="num"><b>${E.won(s.p)}</b></td><td class="num"><span class="delta ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch > 0 ? '+' : ''}${ch.toFixed(2)}%</span></td>
            <td class="${stale ? 'warn-txt' : 'muted'}">${s.ut ? fmtTime(s.ut) : '-'}${stale ? ' (오래됨)' : ''}</td><td class="num">${hs.length}명</td><td class="num">${E.won(cost)} / ${E.won(val)}</td>
            <td><label class="switch"><input type="checkbox" data-son="${esc(sid)}" ${s.on !== false ? 'checked' : ''}><i></i></label></td>
            <td><div class="row-actions">${s.ty === 'real' ? '' : `<button class="btn xs primary" data-b="price" data-id="${esc(sid)}">가격 바꾸기</button>`}<button class="btn xs" data-b="edit" data-id="${esc(sid)}">수정</button><button class="btn xs" data-b="who" data-id="${esc(sid)}">투자자</button><button class="btn xs danger" data-b="del" data-id="${esc(sid)}">삭제</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="empty">아직 증권이 없어요.</p>'}
      <p class="note">거래 시간: 학급 증권 ${E.hhmm(c.trade.cs)}~${E.hhmm(c.trade.ce)} · 실제 주식 평일 ${E.hhmm(c.trade.rs)}~${E.hhmm(c.trade.re)} · 하루 ${c.trade.max}회 (경제 설정에서 변경).
        ${stocks.some(([, s]) => s.ty === 'real') ? `<br>${priceStatus()} <button class="btn xs" data-b="feed">지금 받기</button>` : ''}</p>`;
    const ids = stuIds();
    $('#bk-bank').innerHTML = `<h3>🏦 신용 등급·예금 <span class="muted">${E.grades().map((g) => `${g} ${c.bank.rates[g]}%`).join(' · ')} · ${c.bank.days}일 · 기본 등급 ${esc(c.bank.def)}</span></h3>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>학생</th><th>신용 등급</th><th class="num">예금</th><th class="num">원금</th><th>만기 도래</th><th class="num">주식 평가</th><th class="num">총 자산</th></tr></thead><tbody>
      ${ids.map((u) => { const a = S.accts[u] || {}; const w = E.worth(a); const deps = Object.values(a.dep || {}); const due = deps.filter((d) => now >= E.depMat(d)).length;
        return `<tr><td>${nameTag(u)}</td><td><select data-grade="${u}" style="width:auto">${E.grades().map((g) => `<option ${(a.grade || c.bank.def) === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></td>
          <td class="num">${deps.length}개</td><td class="num">${E.won(w.dep)}</td><td>${due ? `<span class="pill good">${due}개 만기</span>` : '-'}</td><td class="num">${E.won(w.stock)}</td><td class="num"><b>${E.won(w.total)}</b></td></tr>`; }).join('')}
      </tbody></table></div><p class="note">만기가 된 예금은 학생이 「은행」에서 직접 받아요. 「학급 홈 → 🔍 자산 살피기」에서 선생님이 대신 지급할 수도 있어요.</p>`;
  });
  // 실제 주식 시세가 어디서 오는지: 시세 봇(1분마다, 선생님 화면 없어도 됨) → 없으면 GitHub 시세 파일(선생님 화면이 켜져 있을 때만)
  function priceStatus() {
    const pb = S.priceBot;
    const bot = pb
      ? `🤖 시세 봇: ${fmtTime(pb.at)}에 ${pb.n}개 종목 저장${pb.err ? ` (못 받은 종목: ${esc(Object.keys(pb.err).join(', '))})` : ''}${window.PriceFeed && window.PriceFeed.botOk() ? ' · 평일 장중 1분마다 저장해요 (선생님 화면을 꺼도 돼요)' : ' · 지금은 쉬는 중 (평일 08:55~15:40에 1분마다 일해요)'}`
      : '🤖 시세 봇이 아직 없어요 — 지금은 선생님 화면이 켜져 있을 때만 GitHub 시세 파일로 저장해요 (몇 시간 늦을 수 있음)';
    const gh = S.priceInfo ? (S.priceInfo.ok ? `GitHub 시세 파일: ${fmtTime(S.priceInfo.at)}${S.priceInfo.err ? ` (못 받은 종목: ${esc(S.priceInfo.err)})` : ''}` : `GitHub 시세 파일을 받지 못했어요 — ${esc(S.priceInfo.msg)}`) : 'GitHub 시세 파일 확인 중…';
    return `${bot}<br>${gh}`;
  }
  async function onBank(e) {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const sid = b.dataset.id;
    if (b.dataset.b === 'feed') { if (window.PriceFeed) { b.disabled = true; await window.PriceFeed.refresh(true); A.render(); } return; }
    if (b.dataset.b === 'class') return editStock(null, 'class');
    if (b.dataset.b === 'real') return editStock(null, 'real');
    if (b.dataset.b === 'edit') return editStock(sid);
    const s = S.market[sid];
    if (b.dataset.b === 'price') {
      const m = modal(`<h3>${esc(s.n)} 가격 바꾸기</h3><p class="muted" style="margin-top:0">지금 ${E.won(s.p)}</p>
        <div class="form-grid"><label>새 가격<input id="np" type="number" min="1" value="${s.p}"></label><label>또는 변화율 (%)<input id="npc" type="number" step="0.1" placeholder="예: 5 또는 -3"></label></div>
        <div class="chips">${[-10, -5, -2, 2, 5, 10].map((p) => `<button data-pc="${p}">${p > 0 ? '+' : ''}${p}%</button>`).join('')}</div>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>바꾸기</button></div>`);
      const np = m.el.querySelector('#np'), npc = m.el.querySelector('#npc');
      npc.oninput = () => { const p = Number(npc.value); if (isFinite(p)) np.value = Math.max(1, Math.round(s.p * (1 + p / 100))); };
      m.el.querySelectorAll('[data-pc]').forEach((x) => (x.onclick = () => { npc.value = x.dataset.pc; npc.oninput(); }));
      m.el.querySelector('[data-ok]').onclick = async () => {
        const p = Math.round(Number(np.value));
        if (!(p >= 1)) return toast('가격을 확인하세요.', 'bad');
        await B.update(`market/${sid}`, { p, pc: s.p, ch: Math.round(((p - s.p) / s.p) * 10000) / 100, ut: B.ts() });
        m.close();
        toast('가격을 바꿨어요.', 'good');
      };
    }
    if (b.dataset.b === 'who') {
      const hs = Object.entries(S.accts).filter(([u, a]) => S.users[u] && a && a.hold && a.hold[sid] && a.hold[sid].q > 0);
      modal(`<h3>${esc(s.n)} 투자자</h3>${hs.length ? `<table class="tbl"><tbody>${hs.map(([u, a]) => { const h = a.hold[sid]; const v = Math.floor(h.q * s.p); return `<tr><td>${esc(nameOf(u))}</td><td class="num">${E.qty(h.q)}주</td><td class="num">${E.won(h.c)}</td><td class="num">${E.won(v)} <span class="delta ${v - h.c > 0 ? 'up' : v - h.c < 0 ? 'down' : ''}">${E.swon(v - h.c)}</span></td></tr>`; }).join('')}</tbody></table>` : '<p class="empty">아직 없어요</p>'}
        <div class="foot"><button class="btn" data-close>닫기</button></div>`);
    }
    if (b.dataset.b === 'del') {
      const n = Object.entries(S.accts).filter(([u, a]) => S.users[u] && a && a.hold && a.hold[sid] && a.hold[sid].q > 0).length;
      if (n) return toast(`${n}명이 가지고 있어요. 「거래」를 끄거나, 자산 살피기에서 먼저 팔아 주세요.`, 'bad');
      if (await confirmBox('증권 삭제', `「${esc(s.n)}」을 지울까요?`, '삭제', true)) await B.remove(`market/${sid}`);
    }
  }
  function editStock(sid, ty) {
    const s = sid ? S.market[sid] : { n: '', ty, p: ty === 'real' ? 0 : 10000, on: true, mk: 'KRX' };
    const real = s.ty === 'real';
    const m = modal(`<h3>${sid ? '증권 수정' : real ? '실제 주식 연결' : '학급 증권 만들기'}</h3>
      <div class="form-grid"><label>이름<input id="sk-n" maxlength="30" value="${esc(s.n)}" placeholder="${real ? '예: 삼성전자' : '예: 선생님의 기분'}"></label>
        ${real ? `<label>시장<select id="sk-mk"><option value="KRX" ${s.mk !== 'US' ? 'selected' : ''}>한국 (종목 번호 6자리)</option><option value="US" ${s.mk === 'US' ? 'selected' : ''}>미국 (티커)</option></select></label>
          <label>종목 번호 / 티커<input id="sk-sym" value="${esc(s.sym || '')}" placeholder="예: 005930 또는 AAPL" autocapitalize="characters"></label>` : `<label>처음 가격<input id="sk-p" type="number" min="1" value="${s.p}" ${sid ? 'disabled' : ''}></label>`}
        <label>순서<input id="sk-o" type="number" value="${s.ord ?? ''}"></label></div>
      <label>설명 (학생에게 보여요)<input id="sk-d" maxlength="80" value="${esc(s.d || '')}" placeholder="${real ? '' : '예: 선생님 기분이 좋으면 오르고, 나쁘면 내려가요'}"></label>
      ${real ? '<p class="note">시세는 5~10분 간격으로 받아와요. 선생님 화면이 켜져 있을 때 학생들의 가격이 바뀌어요. (평일 장중에만 거래)</p>' : ''}
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
    m.el.querySelector('[data-ok]').onclick = async () => {
      const v = (id) => { const el = m.el.querySelector(id); return el ? el.value.trim() : ''; };
      const n = v('#sk-n');
      if (!n) return toast('이름을 적어 주세요.', 'bad');
      const x = { n, d: v('#sk-d') || null, ord: v('#sk-o') === '' ? null : Number(v('#sk-o')), ty: real ? 'real' : 'class', on: s.on !== false };
      if (real) {
        x.mk = v('#sk-mk') || 'KRX';
        x.sym = v('#sk-sym').toUpperCase();
        if (x.mk === 'KRX' && !/^\d{6}$/.test(x.sym)) return toast('한국 주식은 종목 번호 6자리를 적어 주세요. (예: 005930)', 'bad');
        if (x.mk === 'US' && !/^[A-Z.\-]{1,10}$/.test(x.sym)) return toast('미국 주식은 티커를 적어 주세요. (예: AAPL)', 'bad');
      } else if (!sid) {
        x.p = Math.max(1, Math.round(Number(v('#sk-p')) || 0));
        x.ut = B.ts();
        x.ch = 0;
      }
      const key = sid || B.newKey();
      await B.update(`market/${key}`, x);
      m.close();
      toast(real && !sid ? '연결했어요. 시세를 받아오면 가격이 표시돼요.' : '저장했어요.', 'good');
      if (real && window.PriceFeed) window.PriceFeed.refresh(true);
    };
  }

  /* ───────────── 활동 기록 ───────────── */
  let fWho = '', fKind = '', fText = '', whoFeed = null, whoUnsub = null, whoFor = '';
  const KIND_GROUPS = { '': '전체', money: '보내기·받기', wage: '급여·상금·보상·퀘스트', shop: '구매·사용', bank: '예금', stock: '주식', gov: '국고' };
  const inGroup = (e, g) => !g || (g === 'money' ? ['send', 'take', 'adj', 'imp'].includes(e.k) : g === 'wage' ? ['wage', 'prize', 'reward', 'quest', 'write'].includes(e.k)
    : g === 'shop' ? ['buy', 'use', 'grp', 'ref', 'item'].includes(e.k) : g === 'bank' ? ['dep', 'wd'].includes(e.k) : g === 'stock' ? ['sbuy', 'ssell'].includes(e.k) : e.u === E.GOV);
  TC.addTab('feed', '활동 기록', () => {
    main().innerHTML = `<div class="a-head"><h2>활동 기록</h2><span class="muted" id="fd-cnt"></span><span class="sp"></span>
        <select id="fd-who" style="width:auto"></select><select id="fd-kind" style="width:auto">${Object.entries(KIND_GROUPS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <input id="fd-q" placeholder="내용 검색" style="width:160px"></div>
      <div class="tbl-wrap" id="fd-table"></div><div class="foot" id="fd-more"></div>`;
    $('#fd-kind').value = fKind;
    $('#fd-q').value = fText;
    $('#fd-who').onchange = (e) => { fWho = e.target.value; A.render(); };
    $('#fd-kind').onchange = (e) => { fKind = e.target.value; A.render(); };
    $('#fd-q').oninput = (e) => { fText = e.target.value.trim(); A.render(); };
    main().onclick = async (e) => {
      const mk = e.target.closest('[data-mark]');
      if (mk) { await E.ops.markUse(mk.dataset.mark, mk.dataset.v === '1'); return; }
      if (e.target.closest('[data-more]')) { recentLimit += 300; subRecent(); }
    };
  }, () => {
    const sel = $('#fd-who');
    const opts = `<option value="">모든 학생</option><option value="${E.GOV}">🏛️ 국고</option>${stuIds().map((u) => `<option value="${u}">${esc(nameOf(u))}</option>`).join('')}`;
    if (sel.dataset.o !== opts) { sel.innerHTML = opts; sel.dataset.o = opts; }
    sel.value = fWho;
    // 한 학생만 볼 때는 그 학생 기록을 따로 불러옴 (더 오래된 기록까지)
    if (fWho && fWho !== whoFor) {
      if (whoUnsub) whoUnsub();
      whoFor = fWho; whoFeed = null;
      whoUnsub = B.on('feed', (v) => { whoFeed = v || {}; A.render(); }, { child: 'u', equalTo: fWho, last: 300 });
    } else if (!fWho && whoUnsub) { whoUnsub(); whoUnsub = null; whoFor = ''; whoFeed = null; }
    const src = fWho ? whoFeed : recent;
    if (!src) { $('#fd-table').innerHTML = '<p class="empty">불러오는 중…</p>'; return; }
    let list = withBalances(E.toList(src)).reverse();
    const q = fText.toLowerCase();
    list = list.filter((e) => inGroup(e, fKind) && (!q || JSON.stringify([E.describe(e), nameOf(e.u)]).toLowerCase().includes(q)));
    $('#fd-cnt').textContent = `${list.length}건${fWho ? '' : ` (최근 ${Object.keys(recent).length}건 중)`}`;
    $('#fd-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>일시</th><th>누구</th><th>내용</th><th class="num">변동</th><th class="num">잔액</th><th></th></tr></thead><tbody>${feedRows(list.slice(0, 500))}</tbody></table>` : '<p class="empty" style="padding:30px">기록이 없어요</p>';
    $('#fd-more').innerHTML = !fWho && Object.keys(recent).length >= recentLimit ? '<button class="btn sm" data-more="1">더 오래된 기록 불러오기</button>' : '';
  });

  /* ───────────── 통계 ───────────── */
  let statDays = 30, statCache = null, statBusy = false;
  async function loadStats(force) {
    if (statBusy || (statCache && statCache.days === statDays && !force)) return;
    statBusy = true;
    try {
      const from = B.now() - statDays * E.DAY;
      const v = await B.get('feed', { child: 't', startAt: from });
      statCache = { days: statDays, from, list: E.toList(v), at: B.now() };
    } catch (e) { toast(e.message, 'bad'); }
    statBusy = false;
    A.render();
  }
  TC.addTab('stats', '통계', () => {
    main().innerHTML = `<div class="a-head"><h2>통계</h2><span class="muted" id="st-at"></span><span class="sp"></span>
        <div class="seg" id="st-days">${[7, 30, 60, 90].map((d) => `<button data-d="${d}" class="${d === statDays ? 'on' : ''}">${d}일</button>`).join('')}</div><button class="btn sm" id="st-re">새로 고침</button></div>
      <div id="st-body"></div>`;
    $('#st-days').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; statDays = Number(b.dataset.d); $$('#st-days button').forEach((x) => x.classList.toggle('on', x === b)); loadStats(); };
    $('#st-re').onclick = () => loadStats(true);
    loadStats();
  }, () => {
    const body = $('#st-body');
    if (!statCache || statCache.days !== statDays) { body.innerHTML = '<p class="empty">불러오는 중…</p>'; loadStats(); return; }
    $('#st-at').textContent = `${fmtTime(statCache.at)} 기준 · 최근 ${statDays}일`;
    const r = E.stats(statCache.list, statCache.from, B.now() + 60000);
    let total = 0, cash = 0, dep = 0, stock = 0;
    const per = stuIds().map((u) => { const w = E.worth(S.accts[u]); total += w.total; cash += w.cash; dep += w.dep; stock += w.stock; return [u, w]; });
    const bars = (obj, cls) => { const ent = Object.entries(obj).sort((a, b) => b[1] - a[1]); const sum = ent.reduce((n, [, v]) => n + v, 0) || 1; return ent.length ? ent.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div class="bar"><i class="${cls}" style="width:${(v / sum) * 100}%"></i></div><b>${E.won(v)}</b><small>${Math.round((v / sum) * 100)}%</small></div>`).join('') : '<p class="empty">없음</p>'; };
    // 일별 막대 (발행 위, 소각 아래)
    const d0 = E.kday(statCache.from), d1 = E.kday(B.now());
    const days = [];
    for (let d = d0; d <= d1; d++) days.push([d, r.daily[d] || { i: 0, b: 0 }]);
    const mx = Math.max(1, ...days.map(([, x]) => Math.max(x.i, x.b)));
    const lbl = (d) => { const t = new Date(d * E.DAY); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; };
    const items = Object.values(r.items).sort((a, b) => b.rev - a.rev || b.used - a.used);
    body.innerHTML = `<div class="econ-sum"><div class="stat"><div class="k">💰 유통 화폐 (학생 총자산)</div><div class="v">${E.won(total)}</div></div>
        <div class="stat"><div class="k">👛 쓸 수 있는 돈</div><div class="v">${E.won(cash)}</div></div><div class="stat"><div class="k">🏦 예금</div><div class="v">${E.won(dep)}</div></div>
        <div class="stat"><div class="k">📈 주식</div><div class="v">${E.won(stock)}</div></div><div class="stat"><div class="k">🏛️ 국고</div><div class="v">${E.won((S.gov && S.gov.cash) || 0)}</div></div></div>
      <div class="econ-sum" style="margin-top:12px"><div class="stat"><div class="k">발행 (새로 생긴 돈)</div><div class="v up">${E.won(r.issued)}</div></div>
        <div class="stat"><div class="k">소각 (사라진 돈)</div><div class="v down">${E.won(r.burned)}</div></div>
        <div class="stat"><div class="k">순발행</div><div class="v ${r.issued - r.burned >= 0 ? 'up' : 'down'}">${E.swon(r.issued - r.burned)}</div></div>
        <div class="stat"><div class="k">소득세 (국고 수입)</div><div class="v">${E.won(r.tax)}</div></div><div class="stat"><div class="k">거래 수</div><div class="v">${r.n}건</div></div></div>
      <div class="panel" style="margin-top:16px"><h3>📅 날짜별 발행·소각 <span class="muted"><i class="lg-i up"></i>발행 <i class="lg-i down"></i>소각</span></h3>
        <div class="day-chart">${days.map(([d, x]) => `<div class="dc" title="${lbl(d)} 발행 ${E.won(x.i)} · 소각 ${E.won(x.b)}"><div class="h"><i class="up" style="height:${(x.i / mx) * 100}%"></i></div><div class="h"><i class="down" style="height:${(x.b / mx) * 100}%"></i></div><small>${days.length <= 10 || (d - d0) % Math.ceil(days.length / 8) === 0 ? lbl(d) : ''}</small></div>`).join('')}</div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><h3>발행 사유</h3>${bars(r.byIssue, 'up')}</div><div class="panel"><h3>소각 사유</h3>${bars(r.byBurn, 'down')}</div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><h3>🛒 상점 <span class="muted">최근 ${statDays}일</span></h3>
          ${items.length ? `<table class="tbl"><thead><tr><th>상품</th><th class="num">판매</th><th class="num">매출</th><th class="num">사용</th></tr></thead><tbody>${items.map((it) => `<tr><td>${esc(it.n)}</td><td class="num">${it.sold}개</td><td class="num">${E.won(it.rev + it.grp)}</td><td class="num">${it.used}개</td></tr>`).join('')}</tbody></table>` : '<p class="empty">없음</p>'}</div>
        <div class="panel"><h3>👥 학생별 <span class="muted">총자산 순</span></h3><div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>학생</th><th class="num">총자산</th><th class="num">수입</th><th class="num">지출</th><th class="num">거래</th></tr></thead><tbody>
          ${per.sort((a, b) => b[1].total - a[1].total).map(([u, w]) => { const p = r.per[u] || { inc: 0, out: 0, n: 0 }; return `<tr><td>${esc(nameOf(u))}</td><td class="num"><b>${E.won(w.total)}</b></td><td class="num up-txt">${E.won(p.inc)}</td><td class="num down-txt">${E.won(p.out)}</td><td class="num">${p.n}</td></tr>`; }).join('')}
        </tbody></table></div></div></div>`;
  });

  /* ───────────── 경제 설정 ───────────── */
  TC.addTab('econset', '경제 설정', () => {
    const c = E.cfg();
    const menuNames = { shop: '🛒 상점', bank: '🏦 은행', stock: '📈 주식', jobs: '💼 직업', quest: '🎯 퀘스트', board: '📌 판' };
    main().innerHTML = `<div class="a-head"><h2>경제 설정</h2><span class="sp"></span><button class="btn primary" id="es-save">저장</button></div>
      <div class="two-col"><div class="col" style="gap:16px">
        <div class="panel"><h3>기본</h3><div class="form-grid"><label>화폐 단위<input id="es-unit" maxlength="6" value="${esc(c.unit)}"></label>
          <label>소득세율 (%)<input id="es-tax" type="number" min="0" max="100" step="0.5" value="${c.tax}"><small>급여에서 떼어 국고로 보내요</small></label></div>
          <label class="chk-line"><input type="checkbox" class="chk" id="es-taxon" ${c.taxOn ? 'checked' : ''}> 급여에서 소득세 떼기 <span class="muted">(「직업·급여」 화면에서도 바꿀 수 있어요)</span></label></div>
        <div class="panel"><h3>학생 화면 메뉴</h3><div class="chk-grid">${Object.entries(menuNames).map(([k, n]) => `<label class="chk-line"><input type="checkbox" class="chk" data-menu="${k}" ${c.menus[k] !== false ? 'checked' : ''}> ${n}</label>`).join('')}</div>
          <p class="note">끄면 학생 화면에서 그 메뉴가 사라지고, 그 기능(구매·예금·거래)도 막혀요.</p></div>
        <div class="panel"><h3>상점 분류</h3><input id="es-cats" value="${esc(c.cats.join(', '))}"><p class="note">쉼표로 나눠 적어요. 예: 권리, 고정지출, 간식</p></div>
      </div><div class="col" style="gap:16px">
        <div class="panel"><h3>🏦 은행 (예금)</h3><label class="chk-line"><input type="checkbox" class="chk" id="es-bon" ${c.bank.on ? 'checked' : ''}> 예금 받기</label>
          <div class="form-grid"><label>예금 기간 (일)<input id="es-days" type="number" min="1" max="60" value="${c.bank.days}"></label><label>최소 금액<input id="es-min" type="number" min="1" value="${c.bank.min}"></label>
            <label>처음 신용 등급<select id="es-def">${E.grades().map((g) => `<option ${g === c.bank.def ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label></div>
          <h4>신용 등급별 이자율 (기간 동안, %)</h4><div id="es-rates">${E.grades().map((g) => rateRow(g, c.bank.rates[g])).join('')}</div>
          <button class="btn xs" id="es-addr">+ 등급 추가</button></div>
        <div class="panel"><h3>📈 주식 거래</h3><label class="chk-line"><input type="checkbox" class="chk" id="es-ton" ${c.trade.on ? 'checked' : ''}> 거래 허용</label>
          <div class="form-grid"><label>실제 주식 시작<input id="es-rs" type="time" value="${E.hhmm(c.trade.rs)}"></label><label>실제 주식 끝<input id="es-re" type="time" value="${E.hhmm(c.trade.re)}"></label>
            <label>학급 증권 시작<input id="es-cs" type="time" value="${E.hhmm(c.trade.cs)}"></label><label>학급 증권 끝<input id="es-ce" type="time" value="${E.hhmm(c.trade.ce)}"></label>
            <label>하루 최대 거래 (회)<input id="es-max" type="number" min="1" max="200" value="${c.trade.max}"></label></div>
          <p class="note">실제 주식은 평일에만, 시세가 30분 안에 받아진 경우에만 거래돼요.</p></div>
        <div class="panel"><h3>🙂 아바타 상점</h3><label class="chk-line"><input type="checkbox" class="chk" id="es-avon" ${c.av.on ? 'checked' : ''}> 아바타 팔기 (학생 「상점 → 아바타 상점」)</label>
          <div class="form-grid"><label>하루에 보여 줄 얼굴 수<input id="es-avn" type="number" min="4" max="24" value="${c.av.n || 12}"></label></div>
          <h4>모양별 가격 <span class="muted" style="font-weight:400">비우면 팔지 않음 · 산 돈은 사라져요(소각)</span></h4>
          ${E.AV_STYLES.map((s) => `<div class="av-price-row"><img src="${E.avatarUrl(s, 'class-tier')}" alt="" loading="lazy"><span>${esc(E.STYLE_NAMES[s] || s)}</span><input type="number" min="0" step="10000" data-avp="${s}" value="${c.av.styles[s] ?? ''}" placeholder="팔지 않음"></div>`).join('')}</div>
        <div class="panel"><h3>🏛️ 국고</h3><div class="stat"><div class="k">지금 국고</div><div class="v">${E.won((S.gov && S.gov.cash) || 0)}</div></div>
          <div class="foot"><button class="btn sm" id="es-gov">국고 조정</button></div></div>
      </div></div>`;
    $('#es-addr').onclick = () => { const g = (prompt('새 등급 이름 (예: C)') || '').trim().slice(0, 4); if (g && !$(`[data-rate="${g}"]`)) $('#es-rates').insertAdjacentHTML('beforeend', rateRow(g, 0.5)); };
    $('#es-rates').onclick = (e) => { const x = e.target.closest('[data-rdel]'); if (x && $$('[data-rate]').length > 1) x.closest('.rate-row').remove(); };
    $('#es-gov').onclick = () => {
      const m = modal(`<h3>국고 조정</h3><label>더할 돈 (빼려면 −)<input id="gd" type="number" step="10000"></label><label>사유<input id="gm" maxlength="60" placeholder="예: 학급 행사 지출"></label>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
      m.el.querySelector('[data-ok]').onclick = async () => { const d = Math.round(Number(m.el.querySelector('#gd').value) || 0); if (!d) return; if (await E.ops.govAdjust(d, m.el.querySelector('#gm').value.trim())) m.close(); };
    };
    $('#es-save').onclick = async () => {
      const raw = JSON.parse(JSON.stringify(S.econRaw || E.DEFAULTS));
      const v = (id) => $(id).value.trim();
      raw.unit = v('#es-unit') || '원';
      raw.tax = Math.max(0, Math.min(100, Number(v('#es-tax')) || 0));
      raw.taxOn = $('#es-taxon').checked;
      raw.menus = {};
      $$('[data-menu]').forEach((i) => (raw.menus[i.dataset.menu] = i.checked));
      raw.cats = [...new Set(v('#es-cats').split(',').map((x) => x.trim()).filter(Boolean))];
      const rates = {};
      for (const r of $$('[data-rate]')) { const g = r.dataset.rate; const x = Number(r.value); if (!isFinite(x) || x < 0) return toast('이자율을 확인하세요.', 'bad'); rates[g] = x; }
      raw.bank = { on: $('#es-bon').checked, days: Math.max(1, Math.min(60, Math.floor(Number(v('#es-days')) || 7))), min: Math.max(1, Math.floor(Number(v('#es-min')) || 1000)), rates, def: rates[v('#es-def')] !== undefined ? v('#es-def') : Object.keys(rates)[0] };
      raw.trade = { on: $('#es-ton').checked, rs: E.toMin(v('#es-rs')), re: E.toMin(v('#es-re')), cs: E.toMin(v('#es-cs')), ce: E.toMin(v('#es-ce')), max: Math.max(1, Math.floor(Number(v('#es-max')) || 30)) };
      if (raw.trade.rs >= raw.trade.re || raw.trade.cs > raw.trade.ce) return toast('거래 시작 시각이 끝 시각보다 빨라야 해요.', 'bad');
      const styles = {};
      $$('[data-avp]').forEach((i) => { if (i.value.trim() !== '') styles[i.dataset.avp] = Math.max(0, Math.floor(Number(i.value) || 0)); });
      raw.av = { on: $('#es-avon').checked, n: Math.max(4, Math.min(24, Math.floor(Number($('#es-avn').value) || 12))), styles };
      await B.set('config/econ', raw);
      toast('저장했어요.', 'good');
    };
  }, () => {});
  const rateRow = (g, r) => `<div class="rate-row"><b class="grade-badge sm g-${esc(g)}">${esc(g)}</b><input type="number" step="0.1" min="0" data-rate="${esc(g)}" value="${r}" style="width:110px">%<button class="btn xs ghost" data-rdel="${esc(g)}">삭제</button></div>`;
})();

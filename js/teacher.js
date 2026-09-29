/* 클래스 티어 — 선생님 화면
   순위 현황 · 승인 대기 · 경쟁 활동 · 칭찬·감점 · 학생 관리 · 월 마감·보상 · 설정
   점수 계산은 선생님 화면에서 이뤄지며, 결과(공개 순위 standings / 학생별 세부 myDetail)를 저장합니다. */
(function () {
  const A = window.App;
  const { S, B, T, $, $$, esc, emblem, tierChip, tierName, nameTag, nameOf, toast, modal, confirmBox, fmtDate, fmtTime, signed } = A;
  const MAX_STUDENTS = 25;
  let sec = 'home', tab = 'home';
  const secTab = {};
  let subs = [];
  let acts = {}, ents = {}, secrets = {}, levels = {}, hanjaAll = {};
  let boardMonth = null, actMonth = null;
  const sel = new Set();
  const main = () => $('#tc-main');

  // 위쪽 = 영역, 아래쪽 = 영역 안의 탭 (다른 파일이 addTab으로 탭을 더함)
  const SECS = [
    { k: 'home', name: '🏠 학급 홈', tabs: ['home'] },
    { k: 'tier', name: '🏆 티어', tabs: ['board', 'approve', 'acts', 'praise', 'levels', 'close'] },
    { k: 'econ', name: '💰 경제', tabs: ['shop', 'jobs', 'bank', 'feed', 'stats', 'econset'] },
    { k: 'quest', name: '🎯 퀘스트', tabs: ['qreq', 'quest'] },
    { k: 'board', name: '📌 판', tabs: ['boards'] },
    { k: 'admin', name: '⚙️ 관리', tabs: ['students', 'settings', 'import'] },
  ];
  const TAB_NAMES = {
    board: '순위 현황', approve: '승인 대기', acts: '경쟁 활동', praise: '칭찬·1인1역', levels: '급수·한자', close: '월 마감·보상',
    students: '학생 관리', settings: '티어 설정',
  };
  const badgeFns = [];
  function badges() {
    const b = { approve: pendingList().length };
    for (const f of badgeFns) Object.assign(b, f());
    return b;
  }
  function renderNav() {
    const secs = SECS.map((s) => Object.assign({}, s, { tabs: s.tabs.filter((t) => SK[t]) })).filter((s) => s.tabs.length);
    let cur = secs.find((s) => s.k === sec) || secs[0];
    if (!cur.tabs.includes(tab)) tab = secTab[cur.k] && cur.tabs.includes(secTab[cur.k]) ? secTab[cur.k] : cur.tabs[0];
    sec = cur.k;
    const bd = badges();
    const cnt = (n) => (n ? `<span class="cnt">${n}</span>` : '');
    const secHtml = secs.map((s) => `<button data-sec="${s.k}" class="${s.k === sec ? 'on' : ''}">${s.name}${s.k !== sec ? cnt(s.tabs.reduce((n, t) => n + (bd[t] || 0), 0)) : ''}</button>`).join('');
    const tabHtml = cur.tabs.length > 1 ? cur.tabs.map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${esc(TAB_NAMES[t] || t)}${cnt(bd[t])}</button>`).join('') : '';
    if ($('#tc-secs').innerHTML !== secHtml) $('#tc-secs').innerHTML = secHtml;
    if ($('#tc-tabs').innerHTML !== tabHtml) $('#tc-tabs').innerHTML = tabHtml;
    $('#tc-tabs').classList.toggle('hidden', !tabHtml);
  }

  const Teacher = {
    enter() {
      subs.push(B.on('activities', (v) => { acts = v || {}; A.render(); }));
      subs.push(B.on('entries', (v) => { ents = v || {}; A.render(); }));
      subs.push(B.on('secrets', (v) => { secrets = v || {}; if (tab === 'students') A.render(); }));
      subs.push(B.on('levels', (v) => { levels = v || {}; A.render(); }));
      subs.push(B.on('hanja', (v) => { hanjaAll = v || {}; if (tab === 'levels') A.render(); }));
      for (const m of ['EconTeacher', 'QuestTeacher', 'BoardTeacher']) if (window[m] && window[m].enter) window[m].enter();
      main().dataset.tab = '';
      A.render();
    },
    leave() {
      subs.forEach((u) => u());
      subs = [];
      acts = {}; ents = {}; secrets = {}; levels = {};
      lastWritten = {};
      for (const m of ['EconTeacher', 'QuestTeacher', 'BoardTeacher']) if (window[m] && window[m].leave) window[m].leave();
      main().dataset.tab = '';
      main().innerHTML = '';
      sec = 'home'; tab = 'home';
    },
    render() {
      schedule();
      $('#tc-brand').innerHTML = `${emblem('gold')}<span class="brand-txt">${esc(S.className || '클래스')}</span> <span class="pill">선생님</span>`;
      renderNav();
      if (main().dataset.tab !== tab) {
        main().dataset.tab = tab;
        main().onclick = null;
        main().onchange = null;
        main().oninput = null;
        sel.clear();
        SK[tab]();
      }
      RD[tab]();
    },
    // 다른 파일(경제·퀘스트·판)이 탭을 더할 때
    addTab(key, name, sk, rd) { SK[key] = sk; RD[key] = rd || (() => {}); TAB_NAMES[key] = name; },
    addBadges(fn) { badgeFns.push(fn); },
    go(s, t) { secTab[sec] = tab; sec = s; tab = t || null; A.render(); window.scrollTo(0, 0); },
    get tab() { return tab; },
    levelsOf: (u) => levels[u] || {},
    addStudent: (...a) => addStudent(...a),
    genPw: () => genPw(),
    sel,
  };
  $('#tc-secs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (b && b.dataset.sec !== sec) Teacher.go(b.dataset.sec);
  });
  $('#tc-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    secTab[sec] = tab;
    A.render();
  });

  const isClosed = (m) => !!(S.seasons[m] && S.seasons[m].closedAt);
  function allMonths() {
    const set = new Set([A.curMonth(), ...Object.keys(S.seasons || {}), ...Object.keys(S.standings || {})]);
    for (const a of Object.values(acts)) if (a && a.month) set.add(a.month);
    for (const l of Object.values(ents)) for (const e of Object.values(l || {})) if (e && e.month) set.add(e.month);
    return [...set].sort().reverse();
  }
  const monthOptions = (cur) => allMonths().map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(T.monthLabel(k))}${isClosed(k) ? ' (마감)' : k === A.curMonth() ? ' (이번 달)' : ''}</option>`).join('');
  function pendingList() {
    const out = [];
    for (const [uid, l] of Object.entries(ents)) {
      if (!S.users[uid]) continue;
      for (const [id, e] of Object.entries(l || {})) if (e && e.status === 'pending') out.push(Object.assign({ id, uid }, e));
    }
    return out.sort((a, b) => a.ts - b.ts);
  }
  const computeMonth = (m) => T.compute(m, S.users, acts, ents, S.settingsRaw);

  /* ───────────── 자동 재계산 → 순위·세부 저장 ───────────── */
  let lastWritten = {};
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(recompute, 600);
  }
  async function recompute() {
    if (!S.isTeacher) return;
    const upd = {};
    for (const m of allMonths()) {
      if (isClosed(m)) continue;
      const r = computeMonth(m);
      const has = !!r.champion;
      const key = JSON.stringify(has ? [r.rows, r.champion, r.detail] : null);
      if (lastWritten[m] === key) continue;
      lastWritten[m] = key;
      upd[`standings/${m}`] = has ? { rows: r.rows, champion: r.champion, updatedAt: B.now() } : null;
      for (const u of Object.keys(S.users)) upd[`myDetail/${m}/${u}`] = has ? r.detail[u] : null;
    }
    if (Object.keys(upd).length) await B.update('', upd).catch((e) => console.warn('recompute', e));
  }

  /* ───────────── 순위 현황 ───────────── */
  const SK = {}, RD = {};
  SK.board = () => {
    main().innerHTML = `<div class="a-head"><h2>순위 현황</h2><span class="sp"></span><div class="month-select"><select id="bd-month"></select></div></div>
      <div class="two-col"><div class="tbl-wrap" id="bd-table"></div><div class="col" style="gap:16px"><div class="panel" id="bd-dist"></div><div class="panel note" id="bd-note"></div></div></div>`;
    $('#bd-month').onchange = (e) => { boardMonth = e.target.value; RD.board(); };
    $('#bd-table').onclick = (e) => { const b = e.target.closest('[data-u]'); if (b) showDetail(b.dataset.u, boardMonth); };
  };
  RD.board = () => {
    const months = allMonths();
    if (!boardMonth || !months.includes(boardMonth)) boardMonth = months[0];
    $('#bd-month').innerHTML = monthOptions(boardMonth);
    const m = boardMonth;
    const closed = isClosed(m);
    const r = closed ? null : computeMonth(m);
    const rows = closed ? S.seasons[m].rows || {} : r.rows;
    const champ = closed ? S.seasons[m].champion : r.champion;
    const pend = {};
    pendingList().forEach((e) => { if (e.month === m) pend[e.uid] = (pend[e.uid] || 0) + 1; });
    const ids = Object.keys(S.users).sort((a, b) => ((rows[a] && rows[a].rank) || 999) - ((rows[b] && rows[b].rank) || 999));
    $('#bd-table').innerHTML = `<table class="tbl"><thead><tr><th>순위</th><th>학생</th><th>${closed ? '확정 티어' : '예상 티어'}</th><th class="num">총점</th>${closed ? '' : '<th class="num">경쟁</th><th class="num">생활</th><th class="num">대기</th>'}<th></th></tr></thead><tbody>
      ${ids.map((u) => {
        const x = rows[u] || { score: T.START, rank: '-', tier: T.tierOf(T.START).id };
        const tid = u === champ ? 'champion' : x.tier;
        const d = r && r.detail[u];
        return `<tr><td><b>${x.rank}</b></td><td>${nameTag(u)}</td><td>${tierChip(tid)}</td><td class="num"><b>${x.score}</b></td>
          ${closed ? '' : `<td class="num">${d ? signed(d.comp) : 0}</td><td class="num">${d ? signed(d.accum) : 0}</td><td class="num">${pend[u] ? `<span class="pill warn">${pend[u]}</span>` : ''}</td>`}
          <td><button class="btn xs" data-u="${u}">상세</button></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="empty">「학생 관리」에서 학생을 먼저 등록하세요</td></tr>'}</tbody></table>`;
    const dist = {};
    ['champion', 'diamond', 'platinum', 'gold', 'silver', 'bronze'].forEach((k) => (dist[k] = 0));
    ids.forEach((u) => { const x = rows[u]; if (x) dist[u === champ ? 'champion' : x.tier]++; });
    const max = Math.max(1, ...Object.values(dist));
    const col = { champion: 'var(--c-champion)', diamond: 'var(--c-diamond)', platinum: 'var(--c-platinum)', gold: 'var(--c-gold)', silver: 'var(--c-silver)', bronze: 'var(--c-bronze)' };
    $('#bd-dist').innerHTML = `<h3>티어 분포 <span class="muted">${esc(T.monthLabel(m))}${closed ? ' 확정' : ' 현재'}</span></h3><div class="tier-bars">${Object.keys(dist).map((k) => `<div class="tb">${tierChip(k)}<div class="bar"><i style="width:${(dist[k] / max) * 100}%;background:${col[k]}"></i></div><b>${dist[k]}</b></div>`).join('')}</div>`;
    const st = A.settings();
    $('#bd-note').innerHTML = `<b>계산 방식</b><br>· 매달 1000점에서 시작<br>
      · 순위·점수 방식: 반 안 상대평가(작게 최대 ±${T.K_PRESETS.small.k / 2} / 보통 ±${T.K_PRESETS.normal.k / 2} / 크게 ±${T.K_PRESETS.large.k / 2}). 점수 방식에 기준 점수를 정하면 기준보다 높으면 오르고 낮으면 내려감<br>
      · 등급 방식: 기준 점수 × ${T.GRADES.map((g) => `${g} ${st.gradePct[g]}%`).join(' · ')}<br>
      · 생활 점수: ${Object.values(st.cats).map((c) => `${esc(c.name)} ${signed(c.points)}${c.cap ? `(월 ${c.cap}회)` : ''}`).join(' · ')}<br>
      · 티어: 실버 ${st.thresholds.silver} · 골드 ${st.thresholds.gold} · 플래티넘 ${st.thresholds.platinum} · 다이아 ${st.thresholds.diamond}, 챔피언 = 1위<br>
      · 활동·기록을 고치거나 지우면 그달 점수가 자동으로 다시 계산돼요.`;
  };
  function showDetail(uid, m) {
    const r = computeMonth(m);
    const d = r.detail[uid];
    const st = A.settings();
    if (!d) return;
    const x = (isClosed(m) ? S.seasons[m].rows : r.rows)[uid] || {};
    modal(`<h3>${nameTag(uid)} · ${esc(T.monthLabel(m))}</h3>
      <div class="grid3"><div class="stat"><div class="k">총점 / 순위</div><div class="v">${x.score ?? T.START} · ${x.rank ?? '-'}위</div></div>
      <div class="stat"><div class="k">경쟁</div><div class="v">${signed(d.comp)}</div></div><div class="stat"><div class="k">생활</div><div class="v">${signed(d.accum)}</div></div></div>
      <h3 style="margin-top:16px">경쟁 활동</h3>${d.acts.length ? `<table class="tbl"><tbody>${d.acts.map((a) => `<tr><td>${fmtDate(a.at)}</td><td>${esc(a.name)}</td><td>${esc(a.raw)}${a.mode === 'rank' ? '위' : a.mode === 'score' ? '점' : ''}</td><td>${a.place}/${a.n}</td><td class="num"><b>${signed(a.delta)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}
      <h3 style="margin-top:16px">생활 점수</h3>${d.logs.length ? `<table class="tbl"><tbody>${d.logs.map((l) => `<tr><td>${fmtDate(l.at)}</td><td>${esc(st.cats[l.cat] ? st.cats[l.cat].name : l.cat)}</td><td>${esc(l.text)}</td><td class="num"><b>${l.capped ? '한도 초과 0' : signed(l.points)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted">없음</p>'}
      <div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
  }

  /* ───────────── 승인 대기 ───────────── */
  SK.approve = () => {
    main().innerHTML = `<div class="a-head"><h2>승인 대기</h2><span class="muted" id="ap-cnt"></span><span class="sp"></span>
      <button class="btn sm ghost" data-ap="all">전체 선택</button><button class="btn sm good" data-ap="ok">선택 승인</button><button class="btn sm danger" data-ap="no">선택 반려</button></div>
      <div class="tbl-wrap" id="ap-table"></div>
      <div class="panel" style="margin-top:16px"><h3>최근 처리한 기록</h3><div id="ap-done"></div></div>`;
    main().onclick = onApprove;
    main().onchange = (e) => { if (e.target.matches('[data-ck]')) { e.target.checked ? sel.add(e.target.dataset.ck) : sel.delete(e.target.dataset.ck); } };
  };
  RD.approve = () => {
    const st = A.settings();
    const list = pendingList();
    const keys = new Set(list.map((e) => e.uid + '/' + e.id));
    for (const k of [...sel]) if (!keys.has(k)) sel.delete(k);
    $('#ap-cnt').textContent = `${list.length}건`;
    $('#ap-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th></th><th>제출</th><th>학생</th><th>항목</th><th>내용</th><th></th></tr></thead><tbody>
      ${list.map((e) => { const k = e.uid + '/' + e.id; return `<tr><td><input type="checkbox" class="chk" data-ck="${k}" ${sel.has(k) ? 'checked' : ''}></td><td>${fmtTime(e.ts)}${isClosed(e.month) ? ' <span class="pill warn">마감된 달</span>' : ''}</td><td>${nameTag(e.uid)}</td>
        <td><b>${esc(catLabel(e))}</b></td><td>${esc(e.text)}${e.cat === 'unit' && !acts[e.aid] ? ' <span class="pill warn">삭제된 단원평가</span>' : ''}</td>
        <td><div class="row-actions"><button class="btn xs good" data-one="ok" data-k="${k}">승인</button><button class="btn xs danger" data-one="no" data-k="${k}">반려</button></div></td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty" style="padding:30px">승인할 기록이 없어요 👍</p>';
    const done = [];
    for (const [uid, l] of Object.entries(ents)) for (const [id, e] of Object.entries(l || {})) if (e && e.by === 'student' && e.status !== 'pending' && e.reviewedAt) done.push(Object.assign({ id, uid }, e));
    done.sort((a, b) => b.reviewedAt - a.reviewedAt);
    $('#ap-done').innerHTML = done.length ? `<ul class="rows">${done.slice(0, 15).map((e) => `<li><span class="status ${e.status}">${e.status === 'approved' ? '승인' : '반려'}</span>${nameTag(e.uid)}<span>${esc(catLabel(e))} · ${esc(e.text)}</span>
      <span class="right"><button class="btn xs ghost" data-undo="${e.uid}/${e.id}">되돌리기</button></span></li>`).join('')}</ul>` : '<p class="empty">아직 없어요</p>';
  };
  async function review(keys, ok) {
    let reason = '';
    if (!ok) {
      reason = await new Promise((res) => {
        let v = null;
        const m = modal(`<h3>반려 사유 (선택)</h3><label>학생에게 보여요<input id="rj" maxlength="60" placeholder="예: 책 제목을 정확히 적어 주세요"></label>
          <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn danger" data-ok>반려</button></div>`, { onClose: () => res(v) });
        m.el.querySelector('[data-ok]').onclick = () => { v = m.el.querySelector('#rj').value.trim(); m.close(); };
      });
      if (reason === null) return;
    }
    const upd = {};
    const now = B.now();
    const prizes = [];
    let skipped = 0, done = 0;
    for (const k of keys) {
      const [uid, id] = k.split('/');
      const e = ents[uid] && ents[uid][id];
      if (!e) continue;
      if (ok && isClosed(e.month)) { skipped++; continue; }
      upd[`entries/${uid}/${id}/status`] = ok ? 'approved' : 'rejected';
      upd[`entries/${uid}/${id}/reviewedAt`] = now;
      if (!ok && reason) upd[`entries/${uid}/${id}/reason`] = reason;
      // 타자·리코더 승급 심사 승인 → 급수 올리기 (+ 상금이 있는 급수면 상금 안내)
      if (ok && e.track && window.Tracks.TRACKS[e.track]) {
        const cur = (levels[uid] && levels[uid][e.track]) || 0;
        const next = Math.max(cur, Number(e.level) || cur + 1);
        upd[`levels/${uid}/${e.track}`] = next;
        if (next > cur) prizes.push(...prizesFor(uid, e.track, cur, next));
      }
      sel.delete(k);
      done++;
    }
    if (done) await B.update('', upd);
    toast(`${done}건 ${ok ? '승인' : '반려'}${skipped ? ` · 마감된 달 ${skipped}건은 승인할 수 없어요` : ''}`, skipped ? 'bad' : 'good');
    payPrizes(prizes);
  }
  // 급수가 cur → next로 오를 때 받는 상금 (급수표의 「상금 ○만」)
  function prizesFor(uid, track, cur, next) {
    const t = window.Tracks.TRACKS[track];
    const out = [];
    for (let n = cur + 1; n <= next; n++) { const lv = t.levels[n - 1]; if (lv && lv.prize) out.push({ u: uid, amt: lv.prize, label: `${t.name} ${lv.name}` }); }
    return out;
  }
  async function payPrizes(list) {
    const E = window.Econ;
    if (!list.length || !E) return;
    const ok = await confirmBox('🏅 승급 상금', `${list.map((p) => `<b>${esc(nameOf(p.u))}</b> · ${esc(p.label)} — <b>${E.won(p.amt)}</b>`).join('<br>')}<br><br>급수표의 상금을 지금 보낼까요? (새로 만든 돈 · 세금 없음)`, '상금 보내기');
    if (!ok) return;
    for (const p of list) await E.ops.send([p.u], p.amt, `${p.label} 승급 상금`, { kind: 'prize' });
  }
  async function onApprove(e) {
    const b = e.target.closest('[data-ap],[data-one],[data-undo]');
    if (!b) return;
    if (b.dataset.ap === 'all') { pendingList().forEach((x) => sel.add(x.uid + '/' + x.id)); RD.approve(); return; }
    if (b.dataset.ap) { if (!sel.size) return toast('먼저 기록을 선택하세요.', 'bad'); return review([...sel], b.dataset.ap === 'ok'); }
    if (b.dataset.one) return review([b.dataset.k], b.dataset.one === 'ok');
    if (b.dataset.undo) {
      const [uid, id] = b.dataset.undo.split('/');
      const x = ents[uid] && ents[uid][id];
      if (x && isClosed(x.month)) return toast('마감된 달의 기록은 되돌릴 수 없어요.', 'bad');
      const upd = { [`entries/${uid}/${id}/status`]: 'pending', [`entries/${uid}/${id}/reviewedAt`]: null, [`entries/${uid}/${id}/reason`]: null };
      // 승인했던 승급을 되돌리면 급수도 한 단계 내림
      if (x && x.status === 'approved' && x.track && levels[uid] && levels[uid][x.track] === Number(x.level)) upd[`levels/${uid}/${x.track}`] = Number(x.level) - 1;
      await B.update('', upd);
    }
  }
  function catLabel(e) {
    if (e.cat === 'unit') return '단원평가';
    const c = A.settings().cats[e.cat];
    return c ? c.name : e.cat;
  }

  /* ───────────── 경쟁 활동 ───────────── */
  SK.acts = () => {
    main().innerHTML = `<div class="a-head"><h2>경쟁 활동</h2><span class="muted">수행평가·단원평가·학급 대회 결과로 점수가 오가요</span><span class="sp"></span>
      <div class="month-select"><select id="ac-month"></select></div><button class="btn primary" id="ac-new">+ 새 활동</button></div>
      <div class="tbl-wrap" id="ac-table"></div>`;
    $('#ac-month').onchange = (e) => { actMonth = e.target.value; RD.acts(); };
    $('#ac-new').onclick = () => editActivity(null);
    $('#ac-table').onclick = async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.a === 'edit') editActivity(id);
      else if (b.dataset.a === 'toggle') {
        const a = acts[id];
        const open = !a.open;
        await B.update('', { [`activities/${id}/open`]: open, ['openUnits/' + id]: open ? { name: a.name, at: a.at, month: a.month } : null });
        toast(open ? '학생들이 다시 점수를 입력할 수 있어요.' : '제출을 마감했어요.', 'good');
      }
      else if (b.dataset.a === 'del') {
        const a = acts[id];
        if (isClosed(a.month)) return toast('마감된 달의 활동은 지울 수 없어요.', 'bad');
        if (!(await confirmBox('활동 삭제', `「${esc(a.name)}」을 지울까요? 그달 점수가 다시 계산돼요.`, '삭제', true))) return;
        await B.update('', { ['activities/' + id]: null, ['openUnits/' + id]: null });
      }
    };
  };
  RD.acts = () => {
    const months = allMonths();
    if (!actMonth || !months.includes(actMonth)) actMonth = months[0];
    $('#ac-month').innerHTML = monthOptions(actMonth);
    const list = Object.entries(acts).map(([id, a]) => Object.assign({ id }, a)).filter((a) => a.month === actMonth).sort((a, b) => b.at - a.at);
    const closed = isClosed(actMonth);
    const rule = (a) => {
      const k = T.K_PRESETS[a.weight] || T.K_PRESETS.normal;
      if (a.mode === 'grade') return `매우잘함 +${T.gradeBase(a)} (기준 점수)`;
      if (T.hasCut(a)) return `기준 ${a.cut}점 · 최대 ±${k.k / 2}`;
      return `상대평가 · ${k.name} (±${k.k / 2})`;
    };
    $('#ac-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>날짜</th><th>활동</th><th>종류</th><th>입력 방식</th><th>점수 규칙</th><th class="num">참가</th><th></th></tr></thead><tbody>
      ${list.map((a) => `<tr><td>${fmtDate(a.at)}</td><td><b>${esc(a.name)}</b></td><td>${esc(T.KIND_NAMES[a.kind] || '')}</td><td>${esc((T.MODE_NAMES[a.mode] || '').split(' ')[0])}</td>
        <td>${esc(rule(a))}</td>
        <td class="num">${a.studentInput ? unitSummary(a.id, a) : `${Object.values(a.results || {}).filter((v) => v !== '' && v !== null).length}명`}</td>
        <td><div class="row-actions"><button class="btn xs" data-a="edit" data-id="${a.id}">${closed ? '보기' : '수정'}</button>${closed ? '' : `<button class="btn xs danger" data-a="del" data-id="${a.id}">삭제</button>`}</div></td></tr>`).join('')}
      </tbody></table>` : `<p class="empty" style="padding:30px">${esc(T.monthLabel(actMonth))}에 입력한 활동이 없어요.</p>`;
  };
  // 학생 입력 단원평가: 제출·확인 현황과 제출 마감/다시 열기
  function unitSummary(aid, a) {
    let pend = 0, ok = 0;
    for (const l of Object.values(ents)) for (const e of Object.values(l || {})) if (e && e.cat === 'unit' && e.aid === aid) { if (e.status === 'pending') pend++; else if (e.status === 'approved') ok++; }
    return `확인 ${ok}명${pend ? ` · <span class="pill warn">대기 ${pend}</span>` : ''} <button class="btn xs ${a.open ? '' : 'primary'}" data-a="toggle" data-id="${aid}">${a.open ? '제출 마감' : '다시 열기'}</button>`;
  }
  function todayStr(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function editActivity(id) {
    const a0 = id ? acts[id] : null;
    const draft = a0 ? JSON.parse(JSON.stringify(a0)) : { name: '', kind: 'perf', mode: 'score', weight: 'normal', results: {} };
    const date0 = a0 ? todayStr(a0.at) : todayStr(B.now());
    const readonly = a0 && isClosed(a0.month);
    const ids = Object.keys(S.users).sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
    const m = modal(`<h3>${a0 ? (readonly ? '활동 보기' : '활동 수정') : '새 경쟁 활동'}</h3>
      <div class="form-grid">
        <label>활동 이름<input id="af-name" value="${esc(draft.name)}" placeholder="예: 5단원 수행평가 (글쓰기)"></label>
        <label>종류<select id="af-kind">${Object.entries(T.KIND_NAMES).map(([k, v]) => `<option value="${k}" ${draft.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>입력 방식<select id="af-mode">${Object.entries(T.MODE_NAMES).map(([k, v]) => `<option value="${k}" ${draft.mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label data-show="score rank">점수 변동 폭<select id="af-weight">${Object.entries(T.K_PRESETS).map(([k, v]) => `<option value="${k}" ${draft.weight === k ? 'selected' : ''}>${v.name} (최대 ±${v.k / 2})</option>`).join('')}</select></label>
        <label data-show="score">기준 점수 <span style="font-size:.85em">(선택)</span><input id="af-cut" type="number" step="any" value="${esc(draft.cut ?? '')}" placeholder="예: 80 — 비우면 순수 상대평가"></label>
        <label data-show="score" style="display:flex;align-items:center;gap:8px;margin-top:28px"><input type="checkbox" class="chk" id="af-student" ${draft.studentInput ? 'checked' : ''}> 학생이 점수 입력 → 선생님 확인</label>
        <label data-show="grade">기준 점수 <span style="font-size:.85em">(매우잘함일 때 오르는 점수)</span><input id="af-base" type="number" min="1" value="${esc(draft.base ?? T.DEFAULT_GRADE_BASE)}"></label>
        <label>날짜<input id="af-date" type="date" value="${date0}"></label>
      </div>
      <p class="note" id="af-help"></p>
      <p class="note">빈칸 = 불참(점수 변화 없음). 결과는 <b>선생님과 본인만</b> 볼 수 있어요.</p>
      <div class="tbl-wrap"><table class="tbl res-table"><thead><tr><th>학생</th><th>결과</th><th class="num">예상 변동</th></tr></thead><tbody id="af-rows"></tbody></table></div>
      <div class="foot"><button class="btn ghost" data-close>닫기</button>${readonly ? '' : '<button class="btn" id="af-prev">변동 미리보기</button><button class="btn primary" id="af-save">저장</button>'}</div>`, { wide: true, dismissable: false });
    const el = m.el;
    if (readonly) el.querySelectorAll('.form-grid input, .form-grid select').forEach((i) => (i.disabled = true));
    // 입력 방식에 따라 필요한 칸과 설명만 보이기
    const syncFields = () => {
      const mode = el.querySelector('#af-mode').value;
      el.querySelectorAll('[data-show]').forEach((l) => l.classList.toggle('hidden', !l.dataset.show.split(' ').includes(mode)));
      const pct = A.settings().gradePct;
      const base = Number(el.querySelector('#af-base').value) || T.DEFAULT_GRADE_BASE;
      el.querySelector('#af-help').innerHTML = mode === 'grade'
        ? `<b>등급 방식(절대평가)</b>: ${T.GRADES.map((g) => `${g} ${signed(Math.round((base * pct[g]) / 100))}`).join(' · ')} <span class="muted">(등급별 비율은 「설정」에서 변경)</span>`
        : mode === 'score'
          ? '<b>점수 방식</b>: 기준 점수를 적으면 <b>기준보다 높은 학생은 오르고 낮은 학생은 내려가요.</b> 기준에서 가장 멀리 떨어진 학생이 최대 변동을 받고, 나머지는 거리에 비례해요. 이번 달 점수가 높은 학생은 조금 덜 오르고 조금 더 내려가요(상대 보정). 기준 점수를 비우면 반 친구들끼리 비교하는 순수 상대평가예요.'
          : '<b>순위 방식</b>: 반 친구들끼리 비교하는 상대평가예요. 모둠 활동은 같은 모둠에 같은 순위를 입력하세요.';
    };
    syncFields();
    el.querySelector('#af-base').oninput = syncFields;
    const drawRows = () => {
      const mode = el.querySelector('#af-mode').value;
      el.querySelector('#af-rows').innerHTML = ids.map((u) => {
        const v0 = draft.results[u] ?? '';
        const v = T.GRADE_ALIAS[v0] || v0;
        const input = mode === 'grade'
          ? `<select data-r="${u}" ${readonly ? 'disabled' : ''}><option value=""></option>${T.GRADES.map((g) => `<option ${v === g ? 'selected' : ''}>${g}</option>`).join('')}</select>`
          : `<input data-r="${u}" type="number" step="any" value="${esc(v)}" placeholder="${mode === 'rank' ? '순위' : el.querySelector('#af-student').checked ? '(학생 입력)' : '점수'}" ${readonly ? 'disabled' : ''}>`;
        // 학생이 입력한 점수 현황
        const sub = id ? Object.values(ents[u] || {}).find((e) => e.cat === 'unit' && e.aid === id && e.status !== 'rejected') : null;
        const subTxt = sub ? ` <span class="pill ${sub.status === 'approved' ? 'good' : 'warn'}">학생 ${esc(sub.score)}점 · ${sub.status === 'approved' ? '확인' : '대기'}</span>` : '';
        return `<tr><td>${nameTag(u)}</td><td>${input}${subTxt}</td><td class="num delta-cell" data-d="${u}"></td></tr>`;
      }).join('');
    };
    const collect = () => {
      draft.name = el.querySelector('#af-name').value.trim();
      draft.kind = el.querySelector('#af-kind').value;
      draft.mode = el.querySelector('#af-mode').value;
      draft.weight = el.querySelector('#af-weight').value;
      const cut = el.querySelector('#af-cut').value.trim();
      draft.cut = draft.mode === 'score' && cut !== '' && isFinite(Number(cut)) ? Number(cut) : null;
      draft.base = draft.mode === 'grade' ? Math.max(1, Number(el.querySelector('#af-base').value) || T.DEFAULT_GRADE_BASE) : null;
      draft.studentInput = draft.mode === 'score' && el.querySelector('#af-student').checked;
      if (draft.studentInput && draft.open === undefined) draft.open = true;
      draft.results = {};
      el.querySelectorAll('[data-r]').forEach((i) => { if (i.value !== '') draft.results[i.dataset.r] = draft.mode === 'grade' ? i.value : Number(i.value); });
      const date = el.querySelector('#af-date').value || todayStr(B.now());
      const keepAt = a0 && todayStr(a0.at) === date;
      draft.at = keepAt ? a0.at : new Date(`${date}T00:00:00`).getTime() + (Date.now() % 86400000);
      draft.month = T.monthKey(draft.at);
    };
    const preview = () => {
      collect();
      const tmpId = id || '__draft__';
      const r = T.compute(draft.month, S.users, Object.assign({}, acts, { [tmpId]: draft }), ents, S.settingsRaw);
      for (const u of ids) {
        const a = (r.detail[u].acts || []).find((x) => x.id === tmpId);
        const cell = el.querySelector(`[data-d="${u}"]`);
        cell.innerHTML = a ? `<span class="delta ${a.delta > 0 ? 'up' : a.delta < 0 ? 'down' : ''}">${signed(a.delta)}</span> <span class="muted">(${a.place}/${a.n})</span>` : '<span class="muted">불참</span>';
      }
    };
    drawRows();
    el.querySelector('#af-mode').onchange = () => { collect(); draft.results = {}; drawRows(); syncFields(); };
    el.querySelector('#af-student').onchange = () => { collect(); drawRows(); };
    // 종류를 단원평가로 고르면 점수 방식 + 학생 입력을 기본으로
    el.querySelector('#af-kind').onchange = (e) => {
      if (e.target.value !== 'unit' || id) return;
      el.querySelector('#af-mode').value = 'score';
      el.querySelector('#af-student').checked = true;
      collect(); drawRows(); syncFields();
    };
    if (readonly || a0) preview();
    if (!readonly) {
      el.querySelector('#af-prev').onclick = preview;
      el.querySelector('#af-save').onclick = async () => {
        collect();
        if (!draft.name) return toast('활동 이름을 입력하세요.', 'bad');
        if (isClosed(draft.month)) return toast(`${T.monthLabel(draft.month)}은 마감되었어요. 날짜를 확인하세요.`, 'bad');
        if (!draft.studentInput) {
          if (draft.mode !== 'grade' && Object.keys(draft.results).length < 2) return toast('2명 이상의 결과를 입력하세요.', 'bad');
          if (!Object.keys(draft.results).length) return toast('결과를 입력하세요.', 'bad');
        }
        const aid = id || B.newKey();
        draft.createdAt = draft.createdAt || B.now();
        await B.update('', {
          ['activities/' + aid]: draft,
          // 학생 입력 단원평가는 학생 화면 「기록하기」에 열어 둠
          ['openUnits/' + aid]: draft.studentInput && draft.open ? { name: draft.name, at: draft.at, month: draft.month } : null,
        });
        actMonth = draft.month;
        m.close();
        toast('저장했어요. 점수가 다시 계산돼요.', 'good');
      };
    }
  }

  /* ───────────── 칭찬·감점 ───────────── */
  let praiseKind = 'praise';
  let svSel = new Set(), svFor = null;
  // 1인1역 기록: 새 키 svd{한국 날짜 번호}(학생 직접 체크와 같은 키) · 예전 키 sv-YYYY-MM-DD
  const kdayOfDate = (date) => Math.floor((new Date(`${date}T12:00:00+09:00`).getTime() + 9 * 3600e3) / 864e5);
  function svEntry(u, date) {
    const l = ents[u] || {};
    const k1 = 'svd' + kdayOfDate(date), k2 = 'sv-' + date;
    if (l[k1]) return { key: k1, e: l[k1] };
    if (l[k2]) return { key: k2, e: l[k2] };
    return null;
  }
  const jobTitles = (u) => Object.values(S.jobs || {}).filter((j) => j && j.on !== false && j.mem && j.mem[u]).map((j) => j.t);
  // 저장: 고른 학생 = 인정(새로 만들거나 확인 대기를 승인), 고르지 않은 학생 = 인정 취소·확인 안 함
  // mode 'pend' = 학생 체크(확인 대기)만 모두 인정
  async function saveService(mode) {
    const date = $('#sv-date').value;
    if (!date) return;
    const ts = new Date(`${date}T15:00:00`).getTime();
    const month = T.monthKey(ts);
    if (isClosed(month)) return toast(`${T.monthLabel(month)}은 마감되었어요.`, 'bad');
    const upd = {};
    const now = B.now();
    let on = 0, ok = 0, no = 0;
    for (const u of Object.keys(S.users)) {
      const x = svEntry(u, date);
      const want = mode === 'pend' ? !!(x && x.e.status === 'pending') || !!(x && x.e.status === 'approved') : svSel.has(u);
      const base = x && `entries/${u}/${x.key}`;
      if (want) {
        on++;
        if (!x) upd[`entries/${u}/svd${kdayOfDate(date)}`] = { cat: 'service', text: `1인1역·봉사 (${date.slice(5).replace('-', '/')})`, month, ts, by: 'teacher', status: 'approved' };
        else if (x.e.status !== 'approved') { upd[base + '/status'] = 'approved'; upd[base + '/reviewedAt'] = now; upd[base + '/reason'] = null; ok++; }
      } else if (x) {
        if (x.e.status === 'pending') { upd[base + '/status'] = 'rejected'; upd[base + '/reviewedAt'] = now; upd[base + '/reason'] = '1인1역 확인 안 됨'; no++; }
        else if (x.e.status === 'approved') upd[base] = null;
      }
    }
    if (Object.keys(upd).length) await B.update('', upd);
    svFor = null;
    toast(`${date.slice(5).replace('-', '/')} 1인1역·봉사 ${on}명 인정${ok ? ` (학생 체크 ${ok}명 확인)` : ''}${no ? ` · 확인 안 함 ${no}명` : ''}`, 'good');
  }
  // 이번 주(월~일) 인정된 1인1역 날 수 — 급여 표에 보여 줌
  Teacher.svDaysThisWeek = (u) => {
    const kd = Math.floor((B.now() + 9 * 3600e3) / 864e5);
    const start = kd - ((kd + 3) % 7);
    const days = new Set();
    for (const [k, e] of Object.entries(ents[u] || {})) {
      if (!e || e.cat !== 'service' || e.status !== 'approved') continue;
      const d = k.startsWith('svd') ? Number(k.slice(3)) : Math.floor(((e.ts || 0) + 9 * 3600e3) / 864e5);
      if (d >= start && d <= kd) days.add(d);
    }
    return days.size;
  };
  SK.praise = () => {
    main().innerHTML = `<div class="a-head"><h2>칭찬·감점·1인1역</h2><span class="muted">감점 기록은 본인과 선생님만 봐요</span></div>
      <div class="panel" style="margin-bottom:16px"><div class="a-head" style="margin:0 0 10px"><h3 style="margin:0">🤝 1인1역·봉사 체크</h3>
        <div class="seg" id="sv-mode"><button data-m="teacher">선생님이 체크</button><button data-m="student">학생이 직접 체크 → 확인</button></div><span class="sp"></span>
        <input type="date" id="sv-date" style="width:auto"><button class="btn xs good hidden" data-sv="pend">학생 체크 모두 확인</button><button class="btn xs ghost" data-sv="all">모두 체크</button><button class="btn xs ghost" data-sv="none">모두 해제</button><button class="btn sm primary" id="sv-save">저장</button></div>
        <div class="stu-grid" id="sv-grid"></div>
        <p class="note" id="sv-note"></p></div>
      <div class="two-col"><div class="panel"><div class="a-head" style="margin-bottom:10px"><h3 style="margin:0">학생 선택</h3><span class="sp"></span>
        <button class="btn xs ghost" data-pr="all">전체</button><button class="btn xs ghost" data-pr="none">해제</button></div><div class="stu-grid" id="pr-grid"></div></div>
      <div class="col" style="gap:16px"><div class="panel"><h3>주기</h3>
        <div class="seg" id="pr-kind"><button data-k="praise" class="on">👏 칭찬</button><button data-k="penalty">⚠️ 감점</button></div>
        <div class="form-grid" style="margin-top:8px"><label>점수<input id="pr-pts" type="number"></label><label>사유<input id="pr-reason" maxlength="60" placeholder="예: 친구를 도와줌"></label></div>
        <div class="foot"><button class="btn primary" id="pr-go">선택한 학생에게 주기</button></div></div>
        <div class="panel"><h3>이번 달 기록</h3><div id="pr-log"></div></div></div></div>`;
    const setKind = (k) => {
      praiseKind = k;
      $$('#pr-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      $('#pr-pts').value = A.settings().cats[k].points;
    };
    setKind(praiseKind);
    $('#pr-kind').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); };
    // 1인1역·봉사: 날짜별로 체크 (하루 1번, 기록 키 = sv-날짜)
    $('#sv-date').value = todayStr(B.now());
    svFor = null;
    $('#sv-date').onchange = () => { svFor = null; RD.praise(); };
    // 1인1역 체크 방식: 학생이 직접 체크하면 「확인 대기」로 들어오고, 선생님이 저장(또는 모두 확인)하면 인정
    $('#sv-mode').onclick = async (e) => {
      const b = e.target.closest('[data-m]');
      if (!b || A.settings().svMode === b.dataset.m) return;
      await B.set('config/settings/svMode', b.dataset.m);
      toast(b.dataset.m === 'student' ? '이제 직업이 있는 학생이 홈 화면에서 「오늘 역할 다 했어요」를 눌러 체크해요.' : '선생님이 날짜별로 체크해요.', 'good');
    };
    $('#sv-save').onclick = () => saveService(null);
    main().onclick = async (e) => {
      const sv = e.target.closest('[data-svu]');
      if (sv) { svSel.has(sv.dataset.svu) ? svSel.delete(sv.dataset.svu) : svSel.add(sv.dataset.svu); RD.praise(); return; }
      const sa = e.target.closest('[data-sv]');
      if (sa && sa.dataset.sv === 'pend') return saveService('pend');
      if (sa) { if (sa.dataset.sv === 'all') Object.keys(S.users).forEach((u) => svSel.add(u)); else svSel.clear(); RD.praise(); return; }
      const g = e.target.closest('[data-g]');
      if (g) { sel.has(g.dataset.g) ? sel.delete(g.dataset.g) : sel.add(g.dataset.g); RD.praise(); return; }
      const p = e.target.closest('[data-pr]');
      if (p) { if (p.dataset.pr === 'all') Object.keys(S.users).forEach((u) => sel.add(u)); else sel.clear(); RD.praise(); return; }
      const d = e.target.closest('[data-pdel]');
      if (d) {
        const [uid, id] = d.dataset.pdel.split('/');
        if (!(await confirmBox('기록 삭제', '이 칭찬/감점 기록을 지울까요?', '삭제', true))) return;
        await B.remove(`entries/${uid}/${id}`);
      }
    };
    $('#pr-go').onclick = async () => {
      const m = A.curMonth();
      if (isClosed(m)) return toast('이번 달은 마감되었어요.', 'bad');
      const pts = Number($('#pr-pts').value);
      const reason = $('#pr-reason').value.trim();
      if (!sel.size) return toast('학생을 선택하세요.', 'bad');
      if (!isFinite(pts) || pts === 0) return toast('점수를 입력하세요.', 'bad');
      if (praiseKind === 'penalty' && !reason) return toast('감점은 사유를 적어 주세요.', 'bad');
      const signedPts = praiseKind === 'penalty' ? -Math.abs(pts) : Math.abs(pts);
      const upd = {};
      const now = B.now();
      for (const u of sel) upd[`entries/${u}/${B.newKey()}`] = { cat: praiseKind, text: reason || A.settings().cats[praiseKind].name, points: signedPts, month: m, ts: now, by: 'teacher', status: 'approved' };
      await B.update('', upd);
      toast(`${sel.size}명에게 ${praiseKind === 'praise' ? '칭찬' : '감점'} ${signed(signedPts)}점`, 'good');
      sel.clear();
      $('#pr-reason').value = '';
    };
  };
  RD.praise = () => {
    const m = A.curMonth();
    const r = computeMonth(m);
    const st = A.settings();
    const ids = Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const date = $('#sv-date').value;
    const stat = (u) => { const x = svEntry(u, date); return x ? x.e.status : ''; };
    // 날짜를 바꾸면: 인정된 학생 + (학생 직접 체크 방식이면) 확인 대기 학생을 선택한 상태로 시작
    if (svFor !== date) { svFor = date; svSel = new Set(ids.filter((u) => stat(u) === 'approved' || stat(u) === 'pending')); }
    const saved = new Set(ids.filter((u) => stat(u) === 'approved'));
    const pend = ids.filter((u) => stat(u) === 'pending');
    const dirty = ids.some((u) => (stat(u) === 'approved') !== svSel.has(u) || (stat(u) === 'pending'));
    $$('#sv-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.svMode));
    $('[data-sv="pend"]').classList.toggle('hidden', !pend.length);
    $('#sv-grid').innerHTML = ids.map((u) => {
      const s = stat(u);
      const jobs = jobTitles(u);
      return `<button data-svu="${u}" class="${svSel.has(u) ? 'sel' : ''} ${s === 'pending' ? 'pend' : ''}"><span class="nm">${svSel.has(u) ? '✅ ' : ''}${esc(nameOf(u))}</span>
        ${jobs.length ? `<span class="job">💼 ${esc(jobs.join(', '))}</span>` : ''}
        <span class="sub">${s === 'pending' ? '🕒 학생 체크 · 확인 대기' : s === 'rejected' ? '확인 안 함' : `이번 달 ${r.detail[u] && r.detail[u].cats.service ? r.detail[u].cats.service.count : 0}회`}</span></button>`;
    }).join('') || '<p class="empty">학생이 없어요</p>';
    const c = st.cats.service;
    $('#sv-note').innerHTML = `${st.svMode === 'student' ? '직업이 있는 학생이 홈 화면에서 「오늘 역할 다 했어요」를 누르면 여기 「확인 대기」로 보여요. 확인할 학생을 고른 채 저장하면 인정되고, 고르지 않은 학생의 체크는 「확인 안 함」이 돼요.<br>' : ''}
      체크한 학생에게 ${signed(c.points)}점 (하루 1번${c.cap ? `, 월 ${c.cap}회까지` : ''}) · 인정 ${saved.size}명${pend.length ? ` · 확인 대기 ${pend.length}명` : ''}${dirty ? ' · <b style="color:var(--warn)">저장하지 않은 변경이 있어요</b>' : ''}`;
    $('#pr-grid').innerHTML = ids.map((u) => {
      const c = r.detail[u] && r.detail[u].cats;
      return `<button data-g="${u}" class="${sel.has(u) ? 'sel' : ''}"><span class="nm">${esc(nameOf(u))}</span>
        <span class="sub">👏 ${c && c.praise ? c.praise.count : 0} · ⚠️ ${c && c.penalty ? c.penalty.count : 0} · ${r.rows[u] ? r.rows[u].score : T.START}점</span></button>`;
    }).join('') || '<p class="empty">학생이 없어요</p>';
    const logs = [];
    for (const [uid, l] of Object.entries(ents)) for (const [id, e] of Object.entries(l || {})) if (e && e.month === m && (e.cat === 'praise' || e.cat === 'penalty') && S.users[uid]) logs.push(Object.assign({ id, uid }, e));
    logs.sort((a, b) => b.ts - a.ts);
    $('#pr-log').innerHTML = logs.length ? `<ul class="rows">${logs.slice(0, 40).map((e) => `<li>${e.cat === 'praise' ? '👏' : '⚠️'} ${nameTag(e.uid)}<span>${esc(e.text)}</span>
      <span class="right"><b class="delta ${e.points > 0 ? 'up' : 'down'}">${signed(e.points)}</b><span class="muted" style="font-size:.8em">${fmtDate(e.ts)}</span><button class="btn xs ghost" data-pdel="${e.uid}/${e.id}">삭제</button></span></li>`).join('')}</ul>` : '<p class="empty">아직 없어요</p>';
  };

  /* ───────────── 급수·한자 ───────────── */
  SK.levels = () => {
    main().innerHTML = `<div class="a-head"><h2>급수·한자</h2><span class="sp"></span>
      <span class="muted" style="font-size:.88em">급수 칸을 바꾸면 점수 없이 급수만 바뀌어요(처음 설정용). 「승급」은 한 단계 올리고 점수도 줘요.</span></div>
      <div class="tbl-wrap" id="lv-table"></div>
      <div class="a-head" style="margin:22px 0 10px"><h2 style="font-size:1.15em">📋 급수표</h2><span class="muted" style="font-size:.88em">기준·보상·상금·주급 추가를 고치고, 단계와 급수표를 더하거나 뺄 수 있어요</span><span class="sp"></span>
        <button class="btn primary sm" data-tr="new">+ 새 급수표</button></div>
      <div class="track-cards" id="lv-refs"></div>`;
    main().onchange = async (e) => {
      const s = e.target.closest('[data-lvset]');
      if (!s) return;
      const [u, tk] = s.dataset.lvset.split('|');
      await B.set(`levels/${u}/${tk}`, Number(s.value));
      toast(`${nameOf(u)} ${window.Tracks.TRACKS[tk].name} 급수를 ${window.Tracks.levelName(tk, Number(s.value))}(으)로 맞췄어요.`, 'good');
    };
    main().onclick = async (e) => {
      const tr = e.target.closest('[data-tr]');
      if (tr) return editTrack(tr.dataset.tr === 'new' ? null : tr.dataset.tr);
      const up = e.target.closest('[data-up]');
      if (up) {
        const TR = window.Tracks.TRACKS;
        const [u, tk] = up.dataset.up.split('|');
        const cur = (levels[u] && levels[u][tk]) || 0;
        const t = TR[tk];
        if (!t) return;
        if (cur >= t.levels.length) return;
        const m = A.curMonth();
        if (isClosed(m)) return toast('이번 달은 마감되었어요.', 'bad');
        if (!(await confirmBox(`${t.name} 승급`, `<b>${esc(nameOf(u))}</b> — ${esc(window.Tracks.levelName(tk, cur))} → <b>${esc(t.levels[cur].name)}</b><br>심사를 통과했나요? 점수 ${signed(A.settings().cats[t.cat].points)}점(한 달에 1번까지)`, '승급'))) return;
        await B.update('', {
          [`levels/${u}/${tk}`]: cur + 1,
          [`entries/${u}/${B.newKey()}`]: { cat: t.cat, track: tk, level: cur + 1, text: `${t.name} ${t.levels[cur].name} 승급 (선생님 심사)`, month: m, ts: B.now(), by: 'teacher', status: 'approved' },
        });
        toast('승급했어요! 🎉', 'good');
        payPrizes(prizesFor(u, tk, cur, cur + 1));
        return;
      }
      const hj = e.target.closest('[data-hj]');
      if (hj) editHanja(hj.dataset.hj);
    };
  };
  RD.levels = () => {
    const TR = window.Tracks.TRACKS;
    const tids = window.Tracks.ids();
    const st = A.settings();
    const H = window.Hanja;
    const m = A.curMonth();
    const ids = Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const today = todayStr(B.now());
    const sel = (u, tk) => {
      const cur = (levels[u] && levels[u][tk]) || 0;
      return `<div class="row-flex" style="gap:6px;flex-wrap:nowrap"><select data-lvset="${u}|${esc(tk)}" style="width:auto">${['시작 전', ...TR[tk].levels.map((l) => l.name)].map((n, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}${cur > TR[tk].levels.length ? `<option selected>${cur}단계</option>` : ''}</select>
        ${cur < TR[tk].levels.length ? `<button class="btn xs good" data-up="${u}|${esc(tk)}">승급</button>` : ''}</div>`;
    };
    const tableHtml = ids.length ? `<table class="tbl"><thead><tr><th>학생</th>${tids.map((tk) => `<th>${esc(TR[tk].ic)} ${esc(TR[tk].name)}</th>`).join('')}<th>🀄 한자 급수</th><th class="num">배운 한자</th><th>오늘</th><th class="num">이번 달 학습</th><th>최근 시험</th><th></th></tr></thead><tbody>
      ${ids.map((u) => {
        const h = Object.assign({ learned: 0, level: 0 }, hanjaAll[u] || {});
        const daily = Object.entries(ents[u] || {}).filter(([k, e]) => e.cat === 'hanjaDaily' && e.month === m).length;
        const lt = h.lastTest;
        return `<tr><td>${nameTag(u)}</td>${tids.map((tk) => `<td>${sel(u, tk)}</td>`).join('')}
          <td><b>${esc(window.Tracks.levelName('hanja', h.level))}</b></td><td class="num">${h.learned} / ${H.LIST.length}</td>
          <td>${h.lastDone === today ? '✅' : '-'}</td><td class="num">${daily}회</td>
          <td>${lt ? `${fmtDate(lt.ts)} ${esc(H.LEVELS[lt.level] || '')} ${lt.right}/${lt.total} ${lt.passed ? '<span class="pill good">통과</span>' : '<span class="pill warn">재도전</span>'}` : '-'}</td>
          <td><button class="btn xs" data-hj="${u}">한자 조정</button></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty" style="padding:30px">학생이 없어요</p>';
    // 선택 상자를 바꾸는 중에는 다시 그리지 않음
    const tb = $('#lv-table');
    if (!(document.activeElement && tb.contains(document.activeElement)) && tb._h !== tableHtml) { tb._h = tableHtml; tb.innerHTML = tableHtml; }
    const won = (n) => (window.Econ ? window.Econ.won(n) : `${n}`);
    const refs = tids.map((tk) => {
      const t = TR[tk];
      const c = st.cats[t.cat] || { points: 10, cap: 1 };
      return `<div class="panel track-card"><div class="a-head" style="margin:0 0 8px"><h3 style="margin:0">${esc(t.ic)} ${esc(t.name)} 급수표</h3><span class="muted" style="font-size:.85em">승급 ${signed(c.points)}점 · 한 달 ${c.cap ? `${c.cap}번까지` : '제한 없음'}</span><span class="sp"></span>
          <button class="btn xs primary" data-tr="${esc(tk)}">✏️ 고치기</button></div>
        ${t.levels.length ? `<table class="tbl"><thead><tr><th>단계</th><th>기준</th><th>보상</th><th class="num">상금</th><th class="num">주급 추가</th></tr></thead><tbody>${t.levels.map((l, i) => `<tr><td class="nowrap"><b>${i + 1}. ${esc(l.name)}</b></td><td>${l.songs ? `${esc(l.songs)}<br>` : ''}<span class="muted">${esc(l.cond)}</span></td><td class="muted">${esc(l.reward)}</td>
          <td class="num">${l.prize ? won(l.prize) : '-'}</td><td class="num">${l.wage ? won(l.wage) : '-'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">단계가 없어요. 「고치기」에서 더해 주세요.</p>'}</div>`;
    }).join('') || '<p class="empty">급수표가 없어요. 「+ 새 급수표」로 만들어요.</p>';
    const rf = $('#lv-refs');
    if (rf._h !== refs) { rf._h = refs; rf.innerHTML = refs; }
  };
  /* 급수표 고치기: 단계(이름·곡/과제·기준·보상·상금·주급 추가) 더하기·빼기·순서 바꾸기, 급수표 이름·아이콘·승급 점수·한 달 횟수
     단계를 빼거나 끼워 넣으면 학생들의 급수를 「같은 이름의 단계」에 맞춰 옮김 */
  function editTrack(tid) {
    const TRK = window.Tracks;
    const cur = tid ? TRK.editable()[tid] : null;
    const st = A.settings();
    const cat = tid ? TRK.catOf(tid) : null;
    const cv = (cat && st.cats[cat]) || { points: 10, cap: 1 };
    let nk = 0;
    let rows = cur ? cur.levels.map((l, i) => Object.assign({ k: i + 1 }, l)) : [{ k: 'n0', name: '', songs: '', cond: '', reward: '', prize: 0, wage: 0 }];
    const blank = () => ({ k: `n${++nk}`, name: '', songs: '', cond: '', reward: '', prize: 0, wage: 0 });
    const m = modal(`<h3>${cur ? `${esc(cur.ic)} ${esc(cur.name)} 급수표 고치기` : '새 급수표'}</h3>
      <div class="form-grid"><label>이름<input id="te-name" maxlength="20" value="${esc(cur ? cur.name : '')}" placeholder="예: 줄넘기"></label>
        <label>아이콘 (이모지)<input id="te-ic" maxlength="4" value="${esc(cur ? cur.ic : '🏅')}"></label>
        <label>승급 점수 (티어)<input id="te-pts" type="number" value="${cv.points}"></label>
        <label>한 달 최대 승급 인정 (회) <small>0 = 제한 없음</small><input id="te-cap" type="number" min="0" value="${cv.cap}"></label></div>
      <div class="tbl-wrap te-wrap"><table class="tbl te-tbl"><thead><tr><th>#</th><th>단계 이름</th><th>곡·과제 (선택)</th><th>통과 기준</th><th>보상 (학생에게 보이는 글)</th><th>상금 (원)</th><th>주급 추가 (원)</th><th></th></tr></thead><tbody id="te-rows"></tbody></table></div>
      <div class="row-flex" style="margin-top:8px"><button class="btn sm" data-te="add">+ 단계 더하기</button><span class="muted" style="font-size:.85em">상금은 승급을 승인할 때 보낼지 물어보고, 주급 추가는 급여를 줄 때 급수 수당으로 더해져요.</span></div>
      <div class="foot">${cur ? '<button class="btn danger" data-te="del" style="margin-right:auto">급수표 삭제</button>' : ''}<button class="btn ghost" data-close>취소</button><button class="btn primary" data-te="save">저장</button></div>`, { wide: true, dismissable: false });
    const el = (s) => m.el.querySelector(s);
    const draw = () => {
      el('#te-rows').innerHTML = rows.map((r, i) => `<tr><td class="num">${i + 1}</td>
        <td><input data-f="name" data-i="${i}" value="${esc(r.name)}" maxlength="20" placeholder="예: 초보"></td>
        <td><input data-f="songs" data-i="${i}" value="${esc(r.songs || '')}" maxlength="120"></td>
        <td><input data-f="cond" data-i="${i}" value="${esc(r.cond || '')}" maxlength="120" placeholder="예: 1분에 100번"></td>
        <td><input data-f="reward" data-i="${i}" value="${esc(r.reward || '')}" maxlength="60" placeholder="예: 마이쮸 1"></td>
        <td><input data-f="prize" data-i="${i}" type="number" min="0" step="10000" value="${r.prize || ''}" placeholder="0" class="num-in"></td>
        <td><input data-f="wage" data-i="${i}" type="number" min="0" step="10000" value="${r.wage || ''}" placeholder="0" class="num-in"></td>
        <td class="nowrap"><button class="btn xs ghost" data-te="up" data-i="${i}" ${i ? '' : 'disabled'} title="위로">↑</button><button class="btn xs ghost" data-te="down" data-i="${i}" ${i < rows.length - 1 ? '' : 'disabled'} title="아래로">↓</button>
          <button class="btn xs ghost" data-te="ins" data-i="${i}" title="아래에 끼워 넣기">＋</button><button class="btn xs ghost danger-txt" data-te="rm" data-i="${i}" title="빼기">✕</button></td></tr>`).join('');
    };
    draw();
    el('#te-rows').oninput = (e) => {
      const i = e.target.dataset.i, f = e.target.dataset.f;
      if (i === undefined || !f) return;
      rows[Number(i)][f] = f === 'prize' || f === 'wage' ? Math.max(0, Math.round(Number(e.target.value) || 0)) : e.target.value;
    };
    m.el.onclick = async (e) => {
      const b = e.target.closest('[data-te]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const act = b.dataset.te;
      if (act === 'add') { rows.push(blank()); draw(); return; }
      if (act === 'ins') { rows.splice(i + 1, 0, blank()); draw(); return; }
      if (act === 'rm') { rows.splice(i, 1); draw(); return; }
      if (act === 'up' && i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); return; }
      if (act === 'down' && i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); return; }
      if (act === 'del') {
        const n = Object.keys(S.users).filter((u) => levels[u] && levels[u][tid] > 0).length;
        if (!(await confirmBox('급수표 삭제', `「${esc(cur.name)}」 급수표를 지울까요?${n ? `<br>학생 ${n}명의 이 급수 기록도 함께 지워져요.` : ''}<br>이미 받은 승급 점수는 그대로 남아요.`, '삭제', true))) return;
        const raw = trackRaw();
        delete raw.tracks[tid];
        const upd = { 'config/settings': raw };
        for (const u of Object.keys(S.users)) if (levels[u] && levels[u][tid] !== undefined) upd[`levels/${u}/${tid}`] = null;
        await B.update('', upd);
        m.close();
        toast('급수표를 지웠어요.');
        return;
      }
      if (act === 'save') {
        const name = el('#te-name').value.trim();
        if (!name) return toast('급수표 이름을 적어 주세요.', 'bad');
        const clean = rows.map((r) => Object.assign({}, r, { name: String(r.name || '').trim() })).filter((r) => r.name);
        if (clean.length !== rows.length) return toast('이름이 빈 단계가 있어요. 이름을 적거나 ✕로 빼 주세요.', 'bad');
        const pts = Number(el('#te-pts').value), cap = Math.max(0, Math.floor(Number(el('#te-cap').value) || 0));
        if (!isFinite(pts)) return toast('승급 점수를 확인하세요.', 'bad');
        const key = tid || `t${Date.now().toString(36).slice(-6)}`;
        const raw = trackRaw();
        raw.tracks[key] = {
          name, ic: el('#te-ic').value.trim() || '🏅', ord: cur ? cur.ord : 10 + Object.keys(raw.tracks).length,
          levels: clean.map((r) => { const o = { name: r.name }; for (const f of ['songs', 'cond', 'reward']) if (String(r[f] || '').trim()) o[f] = String(r[f]).trim(); if (r.prize > 0) o.prize = r.prize; if (r.wage > 0) o.wage = r.wage; return o; }),
        };
        raw.cats = raw.cats || {};
        raw.cats[TRK.catOf(key)] = { name: `${name} 승급`, points: pts, cap };
        const upd = { 'config/settings': raw };
        // 학생 급수 옮기기: 학생이 달성한 가장 높은 (남아 있는) 단계가 새 표에서 몇 번째인지
        let moved = 0;
        if (tid) {
          for (const u of Object.keys(S.users)) {
            const L = (levels[u] && levels[u][tid]) || 0;
            if (!L) continue;
            let pos = 0;
            clean.forEach((r, i) => { if (typeof r.k === 'number' && r.k <= L) pos = Math.max(pos, i + 1); });
            if (pos !== L) { upd[`levels/${u}/${tid}`] = pos; moved++; }
          }
          if (moved && !(await confirmBox('학생 급수 맞추기', `단계가 바뀌어 학생 ${moved}명의 급수를 같은 이름의 단계로 옮길게요. 저장할까요?`, '저장'))) return;
        }
        await B.update('', upd);
        m.close();
        toast(`${name} 급수표를 저장했어요.${moved ? ` (학생 ${moved}명 급수 맞춤)` : ''}`, 'good');
      }
    };
    // 설정에 저장할 급수표 원본 (처음 고칠 때는 기본 급수표를 옮겨 담음)
    function trackRaw() {
      const raw = JSON.parse(JSON.stringify(S.settingsRaw || {}));
      if (!raw.tracksSet) {
        raw.tracks = {};
        for (const [k, t] of Object.entries(TRK.DEFAULTS)) raw.tracks[k] = JSON.parse(JSON.stringify(t));
      }
      raw.tracks = raw.tracks || {};
      raw.tracksSet = true;
      return raw;
    }
  }
  function editHanja(u) {
    const H = window.Hanja;
    const h = Object.assign({ learned: 0, level: 0 }, hanjaAll[u] || {});
    const md = modal(`<h3>${esc(nameOf(u))} 한자 진도 조정</h3>
      <div class="form-grid"><label>배운 한자 수 (0~${H.LIST.length})<input id="hj-l" type="number" min="0" max="${H.LIST.length}" value="${h.learned}"></label>
      <label>한자 급수<select id="hj-v">${['시작 전', ...H.LEVELS].map((n, i) => `<option value="${i}" ${i === h.level ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" class="chk" id="hj-f"> 오늘 떨어진 승급 시험을 다시 볼 수 있게 하기</label>
      <p class="note">점수는 바뀌지 않아요. 전학 온 학생의 진도를 맞추거나 오류를 고칠 때 쓰세요.</p>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
    md.el.querySelector('[data-ok]').onclick = async () => {
      const learned = Math.max(0, Math.min(H.LIST.length, Number(md.el.querySelector('#hj-l').value) || 0));
      const level = Number(md.el.querySelector('#hj-v').value);
      const upd = { [`hanja/${u}/learned`]: learned, [`hanja/${u}/level`]: level };
      if (md.el.querySelector('#hj-f').checked) upd[`hanja/${u}/failDay`] = null;
      await B.update('', upd);
      md.close();
      toast('저장했어요.', 'good');
    };
  }

  /* ───────────── 학생 관리 ───────────── */
  const genPw = () => String(Math.floor(100000 + Math.random() * 900000));
  SK.students = () => {
    main().innerHTML = `<div class="a-head"><h2>학생 관리</h2><span class="muted" id="sm-cnt"></span></div>
      <div class="two-col" style="margin-bottom:16px">
        <div class="panel"><h3>한 명 추가</h3><form id="sm-add" class="form-grid">
          <label>아이디 (영문·숫자)<input name="id" required pattern="[A-Za-z0-9_]{2,20}" autocapitalize="none"></label>
          <label>이름<input name="name" required></label>
          <label>비밀번호 (6자 이상)<input name="pw" required minlength="6" value="${genPw()}"></label>
          <div style="display:flex;align-items:flex-end"><button class="btn primary" style="width:100%">추가</button></div></form></div>
        <div class="panel"><h3>여러 명 한꺼번에</h3><p class="note" style="margin-top:0">한 줄에 <b>아이디,이름,비밀번호</b> — 비밀번호를 비우면 6자리 숫자가 자동으로 만들어져요.</p>
          <textarea id="sm-bulk" rows="5" placeholder="kim01,김민준&#10;lee02,이서연,123456"></textarea>
          <div class="foot"><button class="btn primary" id="sm-bulk-go">일괄 등록</button></div></div>
      </div>
      <div class="panel" style="margin-bottom:16px"><h3>📄 엑셀로 아이디·비밀번호 바꾸기</h3>
        <p class="note" style="margin-top:0">첫 줄이 <b>학생 이름 · 아이디 · 비밀번호</b>인 엑셀 파일을 고르거나, 엑셀에서 표를 복사해 아래 칸에 붙여 넣으세요. 이름이 같은 학생의 아이디와 비밀번호를 바꿔요. 파일은 이 브라우저에서만 읽고 어디에도 올리지 않아요.</p>
        <div class="form-grid"><label>엑셀 파일 (.xlsx)<input type="file" id="sm-xl" accept=".xlsx"></label>
          <label>또는 붙여 넣기<textarea id="sm-xl-paste" rows="2" placeholder="학생 이름	아이디	비밀번호"></textarea></label></div>
        <div id="sm-xl-prev"></div></div>
      <div class="tbl-wrap" id="sm-table"></div>`;
    $('#sm-xl').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { xlPlan(await window.XlsxLite.read(await f.arrayBuffer())); }
      catch (err) { toast(err.message || '파일을 읽지 못했어요.', 'bad'); }
      e.target.value = '';
    };
    $('#sm-xl-paste').oninput = (e) => {
      const rows = e.target.value.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/\t|,/));
      if (rows.length) xlPlan(rows);
    };
    $('#sm-xl-prev').onclick = async (e) => {
      const b = e.target.closest('[data-x]');
      if (!b || !xl) return;
      if (b.dataset.x === 'cancel') { xl = null; $('#sm-xl-prev').innerHTML = ''; $('#sm-xl-paste').value = ''; }
      if (b.dataset.x === 'recheck') checkIdChange();
      if (b.dataset.x === 'go') runXl();
    };
    $('#sm-xl-prev').onchange = (e) => { if (e.target.id === 'sm-xl-must' && xl) xl.must = e.target.checked; };
    $('#sm-add').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await addStudent(f.id.value.trim(), f.name.value.trim(), f.pw.value.trim()); toast(`${f.name.value} 학생을 추가했어요.`, 'good'); f.reset(); f.pw.value = genPw(); }
      catch (err) { toast(err.message, 'bad'); }
    };
    $('#sm-bulk-go').onclick = async (e) => {
      const lines = $('#sm-bulk').value.split('\n').map((l) => l.trim()).filter(Boolean);
      e.target.disabled = true;
      let ok = 0; const fails = [];
      for (const line of lines) {
        const [id, name, pw] = line.split(/[,\t]/).map((x) => (x || '').trim());
        try { await addStudent(id, name, pw || genPw()); ok++; } catch (err) { fails.push(`${id || line}: ${err.message}`); }
      }
      e.target.disabled = false;
      $('#sm-bulk').value = '';
      toast(`${ok}명 등록${fails.length ? ` · 실패 ${fails.length}명` : ''}`, fails.length ? 'bad' : 'good');
      if (fails.length) modal(`<h3>등록하지 못한 학생</h3><ul>${fails.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><div class="foot"><button class="btn" data-close>닫기</button></div>`);
    };
    $('#sm-table').onclick = onStudent;
  };
  RD.students = () => {
    const ids = Object.keys(S.users).sort((a, b) => String(S.users[a].loginId).localeCompare(S.users[b].loginId));
    $('#sm-cnt').textContent = `${ids.length} / ${MAX_STUDENTS}명 · 학생 로그인 = 아이디 + 비밀번호`;
    const m = A.curMonth();
    const rows = (S.standings[m] && S.standings[m].rows) || {};
    $('#sm-table').innerHTML = ids.length ? `<table class="tbl"><thead><tr><th>이름</th><th>아이디</th><th>비밀번호</th><th class="num">이번 달</th><th>관리</th></tr></thead><tbody>
      ${ids.map((u) => `<tr><td>${nameTag(u)}</td><td>${esc(S.users[u].loginId)}</td>
        <td>${secrets[u] ? `<button class="btn xs ghost" data-s="pw-show" data-u="${u}">보기</button>` : '-'}</td>
        <td class="num">${rows[u] ? `${rows[u].score}점 · ${rows[u].rank}위` : `${T.START}점`}</td>
        <td><div class="row-actions"><button class="btn xs" data-s="name" data-u="${u}">이름 변경</button><button class="btn xs" data-s="pw" data-u="${u}">비밀번호 변경</button><button class="btn xs danger" data-s="del" data-u="${u}">삭제</button></div></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty" style="padding:30px">아직 학생이 없어요.</p>';
  };
  /* ── 엑셀로 아이디·비밀번호 바꾸기 ── */
  let xl = null; // { items: [{ u, name, oldId, newId, pw, err, done, fail }], must, check, busy }
  const normName = (s) => String(s || '').replace(/\s+/g, '');
  function xlPlan(rows) {
    rows = rows.map((r) => r.map((x) => String(x == null ? '' : x).trim()));
    const hi = rows.findIndex((r) => r.some((x) => /이름/.test(x)) && r.some((x) => /아이디/.test(x)));
    let cn = 0, ci = 1, cp = 2;
    if (hi >= 0) {
      const h = rows[hi];
      cn = h.findIndex((x) => /이름/.test(x)); ci = h.findIndex((x) => /아이디/.test(x)); cp = h.findIndex((x) => /비밀번호|비번/.test(x));
    }
    const byName = {};
    for (const [u, x] of Object.entries(S.users)) byName[normName(x.name)] = u;
    const items = rows.slice(hi + 1).filter((r) => r[cn]).map((r) => {
      const name = r[cn], u = byName[normName(name)];
      const it = { u, name, oldId: u ? S.users[u].loginId : '', newId: String(r[ci] || '').toLowerCase(), pw: cp >= 0 ? String(r[cp] || '') : '', err: '' };
      if (!u) it.err = '클래스 티어에 없는 이름';
      else if (!/^[a-z0-9_]{2,20}$/.test(it.newId)) it.err = '아이디는 영문·숫자·_ 2~20자';
      else if (it.newId === 'teacher') it.err = 'teacher는 선생님 전용 아이디';
      else if (it.pw && it.pw.length < 6) it.err = '비밀번호는 6자 이상';
      else if (!secrets[u] || !secrets[u].pw) it.err = '저장된 지금 비밀번호가 없어 바꿀 수 없음';
      return it;
    });
    // 새 아이디가 겹치거나, 이번에 바뀌지 않는 다른 학생이 쓰고 있는 아이디면 막음
    for (let pass = 0; pass < 5; pass++) {
      const moving = new Set(items.filter((x) => !x.err).map((x) => x.u));
      let changed = false;
      for (const it of items) {
        if (it.err) continue;
        const owner = Object.keys(S.users).find((u) => S.users[u].loginId === it.newId);
        if (items.filter((x) => !x.err && x.newId === it.newId).length > 1) it.err = '새 아이디가 겹쳐요';
        else if (items.filter((x) => x.u === it.u).length > 1) it.err = '같은 학생이 두 번 있어요';
        else if (owner && owner !== it.u && !moving.has(owner)) it.err = `${nameOf(owner)} 학생이 쓰는 아이디`;
        if (it.err) changed = true;
      }
      if (!changed) break;
    }
    xl = { items, must: true, check: null, busy: false };
    checkIdChange();
  }
  // 아이디가 바뀌는 학생이 있으면 Firebase가 아이디(이메일) 바꾸기를 허락하는지 먼저 확인
  async function checkIdChange() {
    if (!xl) return;
    const any = xl.items.find((x) => !x.err && x.newId !== x.oldId);
    xl.check = any ? null : true;
    drawXl();
    if (any) { xl.check = await B.canChangeIds(any.oldId); drawXl(); }
  }
  function drawXl() {
    const el = $('#sm-xl-prev');
    if (!el || !xl) return;
    const ok = xl.items.filter((x) => !x.err && !x.done);
    const blocked = xl.check === false && ok.some((x) => x.newId !== x.oldId);
    const ready = ok.length && xl.check === true && !xl.busy;
    el.innerHTML = `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>이름</th><th>지금 아이디</th><th>새 아이디</th><th>새 비밀번호</th><th>상태</th></tr></thead><tbody>
      ${xl.items.map((x) => `<tr class="${x.err ? 'off' : ''}"><td>${esc(x.name)}</td><td>${esc(x.oldId || '-')}</td>
        <td><b>${esc(x.newId)}</b>${x.oldId && x.newId !== x.oldId ? ' <span class="pill warn">바뀜</span>' : ''}</td>
        <td>${x.pw ? `${'●'.repeat(Math.min(x.pw.length, 12))} <span class="muted">(${x.pw.length}자)</span>` : '<span class="muted">그대로</span>'}</td>
        <td>${x.err ? `<span class="down-txt">${esc(x.err)}</span>` : x.done ? '<span class="pill good">바꿈</span>' : x.fail ? `<span class="down-txt">${esc(x.fail)}</span>` : '준비됨'}</td></tr>`).join('')}
      </tbody></table></div>
      ${blocked ? `<div class="banner warn-banner" style="margin-top:12px">⚠️ 아이디를 바꾸려면 Firebase에서 <b>「이메일 열거 보호」</b>를 먼저 꺼야 해요.
        <a href="https://console.firebase.google.com/project/class-tier/authentication/settings" target="_blank" rel="noopener">Firebase 콘솔 → Authentication → 설정 → 사용자 작업</a>에서 「이메일 열거 보호(권장)」 체크를 풀고 저장한 뒤
        <button class="btn xs" data-x="recheck">다시 확인</button></div>` : ''}
      <label class="chk-line"><input type="checkbox" class="chk" id="sm-xl-must" ${xl.must ? 'checked' : ''}> 첫 로그인 때 학생이 비밀번호를 직접 새로 정하게 하기</label>
      <div class="foot"><span class="muted" id="sm-xl-prog" style="margin-right:auto">${xl.check === null ? '확인 중…' : ''}</span><button class="btn ghost" data-x="cancel">닫기</button>
        <button class="btn primary" data-x="go" ${ready ? '' : 'disabled'}>${ok.length}명 바꾸기</button></div>`;
  }
  async function runXl() {
    const plan = xl.items.filter((x) => !x.err && !x.done);
    if (!plan.length) return;
    const idCh = plan.filter((x) => x.newId !== x.oldId).length;
    if (!(await confirmBox('아이디·비밀번호 바꾸기', `${plan.length}명의 ${idCh ? `아이디(${idCh}명)와 ` : ''}비밀번호를 바꿀까요?${xl.must ? '<br>학생들은 첫 로그인 때 비밀번호를 직접 새로 정해요.' : ''}`, '바꾸기'))) return;
    xl.busy = true;
    const owner = {}, idOf = {}, pwOf = {};
    for (const [u, x] of Object.entries(S.users)) owner[x.loginId] = u;
    for (const x of plan) { idOf[x.u] = S.users[x.u].loginId; pwOf[x.u] = secrets[x.u].pw; x.fail = ''; }
    const pending = plan.slice();
    let n = 0;
    for (let guard = 0; pending.length && guard < 400; guard++) {
      // 새 아이디가 비어 있는 학생부터 → 한 칸씩 밀릴 때는 큰 번호부터 저절로 순서가 맞음
      let i = pending.findIndex((x) => !owner[x.newId] || owner[x.newId] === x.u);
      const tmp = i < 0; // 서로 아이디를 맞바꾸는 경우: 한 명을 잠깐 임시 아이디로
      if (tmp) i = 0;
      const x = pending[i];
      const target = tmp ? `tmp_${Math.random().toString(36).slice(2, 8)}` : x.newId;
      xl.busy = true; drawXl();
      const pg = $('#sm-xl-prog'); if (pg) pg.textContent = `${n + 1}/${plan.length} ${x.name}…`;
      try {
        const r = await B.changeLogin(idOf[x.u], pwOf[x.u], target, tmp ? null : x.pw || null);
        const pw = r.pwChanged ? x.pw : pwOf[x.u];
        const upd = { [`users/${x.u}/loginId`]: target, [`secrets/${x.u}`]: { loginId: target, pw } };
        if (!tmp && xl.must) upd[`users/${x.u}/pwc`] = true;
        await B.update('', upd);
        delete owner[idOf[x.u]]; owner[target] = x.u; idOf[x.u] = target; pwOf[x.u] = pw;
        if (!tmp) { pending.splice(i, 1); n++; if (r.error) x.fail = `아이디는 바꿨지만 비밀번호는 못 바꿈: ${r.error}`; else x.done = true; }
      } catch (err) {
        pending.splice(i, 1); n++;
        x.fail = err.message;
        if (/열거 보호/.test(err.message)) { xl.check = false; for (const p of pending) p.fail = ''; break; }
      }
    }
    xl.busy = false;
    drawXl();
    const done = plan.filter((x) => x.done).length, fails = plan.filter((x) => x.fail).length;
    toast(`${done}명 바꿨어요${fails ? ` · 못 바꾼 학생 ${fails}명` : ''}`, fails ? 'bad' : 'good');
  }
  async function addStudent(id, name, pw) {
    id = String(id || '').toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(id)) throw new Error('아이디는 영문·숫자·_ 2~20자');
    if (id === 'teacher') throw new Error('teacher는 선생님 전용 아이디입니다');
    if (!name) throw new Error('이름을 입력하세요');
    if (String(pw).length < 6) throw new Error('비밀번호는 6자 이상');
    if (Object.keys(S.users).length >= MAX_STUDENTS) throw new Error(`최대 ${MAX_STUDENTS}명까지 등록할 수 있어요`);
    if (Object.values(S.users).some((u) => u.loginId === id)) throw new Error('이미 있는 아이디');
    const uid = await B.createAccount(id, pw);
    await B.update('', { ['users/' + uid]: { loginId: id, name, createdAt: B.now() }, ['secrets/' + uid]: { pw, loginId: id } });
    S.users[uid] = { loginId: id, name };
  }
  async function onStudent(e) {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const u = b.dataset.u, x = S.users[u];
    if (!x) return;
    if (b.dataset.s === 'pw-show') { b.outerHTML = `<code>${esc(secrets[u].pw)}</code>`; return; }
    if (b.dataset.s === 'name') {
      const m = modal(`<h3>이름 변경</h3><label>이름<input id="nn" value="${esc(x.name)}"></label><div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`);
      m.el.querySelector('[data-ok]').onclick = async () => { const v = m.el.querySelector('#nn').value.trim(); if (v) await B.set(`users/${u}/name`, v); m.close(); };
    } else if (b.dataset.s === 'pw') {
      const m = modal(`<h3>${esc(x.name)} 비밀번호 변경</h3><label>새 비밀번호 (6자 이상)<input id="np" value="${genPw()}"></label><div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>변경</button></div>`);
      m.el.querySelector('[data-ok]').onclick = async () => {
        const np = m.el.querySelector('#np').value.trim();
        try {
          if (!secrets[u]) throw new Error('저장된 기존 비밀번호가 없어요.');
          await B.setPassword(x.loginId, secrets[u].pw, np);
          await B.set('secrets/' + u, { pw: np, loginId: x.loginId });
          m.close(); toast('비밀번호를 변경했어요.', 'good');
        } catch (err) { toast(err.message, 'bad'); }
      };
    } else if (b.dataset.s === 'del') {
      if (!(await confirmBox('학생 삭제', `<b>${esc(x.name)}</b> 학생을 삭제할까요? 기록과 점수가 모두 사라지고 되돌릴 수 없어요.`, '삭제', true))) return;
      try { await B.deleteAccount(x.loginId, secrets[u] && secrets[u].pw); } catch (err) { console.warn('계정 삭제 실패', err); }
      const upd = { ['users/' + u]: null, ['secrets/' + u]: null, ['entries/' + u]: null, ['levels/' + u]: null, ['hanja/' + u]: null, ['acct/' + u]: null };
      for (const m of allMonths()) upd[`myDetail/${m}/${u}`] = null;
      for (const [jid, j] of Object.entries(S.jobs || {})) if (j && j.mem && j.mem[u]) upd[`jobs/${jid}/mem/${u}`] = null;
      await B.update('', upd);
      toast('삭제했어요.');
    }
  }

  /* ───────────── 월 마감·보상 ───────────── */
  const REWARD_KEYS = ['champion', 'diamond', 'platinum', 'gold', 'silver', 'bronze'];
  let openSeason = null;
  SK.close = () => {
    const st = A.settings();
    main().innerHTML = `<div class="a-head"><h2>월 마감·보상</h2></div>
      <div class="two-col"><div class="col" style="gap:16px" id="cl-months"></div>
      <div class="panel"><h3>티어별 보상</h3><p class="note" style="margin-top:0">마감하면 학생마다 해당 티어의 보상이 자동으로 정해지고, 학생 화면에도 보여요. <b>보상금</b>을 적으면 마감 뒤 「보상금 보내기」로 한 번에 보낼 수 있어요.</p>
        ${REWARD_KEYS.map((k) => `<div class="rw-row"><label>${tierChip(k)}<input data-rw="${k}" value="${esc(st.rewards[k] || '')}" placeholder="${{ champion: '예: 자리 우선 선택권 + 상장', diamond: '예: 간식 쿠폰 2장', platinum: '예: 간식 쿠폰 1장', gold: '예: 칭찬 도장 3개', silver: '예: 칭찬 도장 1개', bronze: '예: 다음 달 응원 메시지' }[k]}"></label>
          <label>보상금<input data-rm="${k}" type="number" min="0" step="10000" value="${st.rewardMoney[k] || ''}" placeholder="0"></label></div>`).join('')}
        <div class="foot"><button class="btn primary" id="rw-save">보상 저장</button></div></div></div>`;
    $('#rw-save').onclick = async () => {
      const raw = JSON.parse(JSON.stringify(S.settingsRaw || {}));
      raw.rewards = {};
      raw.rewardMoney = {};
      $$('[data-rw]').forEach((i) => (raw.rewards[i.dataset.rw] = i.value.trim()));
      $$('[data-rm]').forEach((i) => (raw.rewardMoney[i.dataset.rm] = Math.max(0, Math.round(Number(i.value) || 0))));
      await B.set('config/settings', raw);
      toast('보상을 저장했어요. (이미 마감된 달에는 적용되지 않아요)', 'good');
    };
    $('#cl-months').onclick = onCloseAction;
  };
  RD.close = () => {
    const cur = A.curMonth();
    const html = allMonths().map((m) => {
      const closed = isClosed(m);
      const pend = pendingList().filter((e) => e.month === m).length;
      if (!closed) {
        return `<div class="panel"><div class="a-head" style="margin:0"><h3 style="margin:0">${esc(T.monthLabel(m))} ${m === cur ? '<span class="pill">진행 중</span>' : '<span class="pill warn">마감 전</span>'}</h3><span class="sp"></span>
          ${pend ? `<span class="pill warn">승인 대기 ${pend}건</span>` : ''}<button class="btn ${m === cur ? '' : 'primary'}" data-cl="close" data-m="${m}">${esc(T.monthLabel(m))} 마감하기</button></div></div>`;
      }
      const s = S.seasons[m];
      const rw = s.rewards || {};
      const ids = Object.keys(s.rows || {}).sort((a, b) => s.rows[a].rank - s.rows[b].rank);
      const given = ids.filter((u) => rw[u] && rw[u].given).length;
      const money = ids.reduce((n, u) => n + ((rw[u] && S.users[u] && rw[u].money) || 0), 0);
      const E = window.Econ;
      const open = openSeason === m;
      return `<div class="panel"><div class="a-head" style="margin:0"><h3 style="margin:0">${esc(T.monthLabel(m))} <span class="pill good">마감</span></h3>
        <span class="muted">챔피언 👑 ${esc(s.championName || '-')} · 보상 지급 ${given}/${ids.length}</span><span class="sp"></span>
        ${money && E ? (s.paidAt ? '<span class="pill good">보상금 보냄</span>' : `<button class="btn sm primary" data-cl="pay" data-m="${m}">💰 보상금 보내기 (${E.won(money)})</button>`) : ''}
        <button class="btn sm" data-cl="toggle" data-m="${m}">${open ? '접기' : '결과·보상 보기'}</button><button class="btn sm ghost" data-cl="reopen" data-m="${m}">마감 취소</button></div>
        ${open ? `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>순위</th><th>학생</th><th>티어</th><th class="num">점수</th><th>보상</th>${money && E ? '<th class="num">보상금</th>' : ''}<th>지급</th></tr></thead><tbody>
          ${ids.map((u) => { const r = s.rows[u]; const tid = s.champion === u ? 'champion' : r.tier; const w = rw[u] || {}; return `<tr><td><b>${r.rank}</b></td><td>${esc(S.users[u] ? S.users[u].name : (r.name || '(삭제됨)'))}</td><td>${tierChip(tid)}</td><td class="num">${r.score}</td><td>${esc(w.text || '-')}</td>
            ${money && E ? `<td class="num">${w.money ? E.won(w.money) : '-'}</td>` : ''}<td>${w.text ? `<input type="checkbox" class="chk" data-give="${m}/${u}" ${w.given ? 'checked' : ''}>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : ''}</div>`;
    }).join('');
    $('#cl-months').innerHTML = html;
    $$('[data-give]').forEach((c) => (c.onchange = () => { const [m, u] = c.dataset.give.split('/'); B.set(`seasons/${m}/rewards/${u}/given`, c.checked); }));
  };
  async function onCloseAction(e) {
    const b = e.target.closest('[data-cl]');
    if (!b) return;
    const m = b.dataset.m;
    if (b.dataset.cl === 'toggle') { openSeason = openSeason === m ? null : m; RD.close(); return; }
    if (b.dataset.cl === 'pay') {
      const s = S.seasons[m];
      const E = window.Econ;
      const groups = {};
      for (const [u, w] of Object.entries(s.rewards || {})) if (w && w.money > 0 && S.users[u]) (groups[w.money] = groups[w.money] || []).push(u);
      const total = Object.entries(groups).reduce((n, [amt, us]) => n + amt * us.length, 0);
      if (!(await confirmBox('티어 보상금', `${esc(T.monthLabel(m))} 티어 보상금 <b>${E.won(total)}</b>을 ${Object.values(groups).flat().length}명에게 보낼까요? (새로 만든 돈 · 세금 없음)`, '보내기'))) return;
      b.disabled = true;
      for (const [amt, us] of Object.entries(groups)) if (!(await E.ops.send(us, Number(amt), `${T.monthLabel(m)} 티어 보상금`, { kind: 'reward' }))) { b.disabled = false; return; }
      await B.set(`seasons/${m}/paidAt`, B.now());
      return;
    }
    if (b.dataset.cl === 'reopen') {
      if (!(await confirmBox('마감 취소', `${T.monthLabel(m)} 마감을 취소할까요? 확정된 티어와 보상 지급 기록이 지워지고, 다시 진행 중 상태가 돼요.`, '마감 취소', true))) return;
      await B.remove('seasons/' + m);
      lastWritten = {};
      return;
    }
    // 마감
    const pend = pendingList().filter((x) => x.month === m).length;
    if (pend) return toast(`승인 대기 ${pend}건을 먼저 처리하세요. (「승인 대기」 탭)`, 'bad');
    const r = computeMonth(m);
    if (!r.champion) return toast('이 달에는 반영된 활동이 없어요.', 'bad');
    const st = A.settings();
    const early = m === A.curMonth();
    if (!(await confirmBox(`${T.monthLabel(m)} 마감`, `${early ? '<b style="color:var(--warn)">아직 이번 달이 끝나지 않았어요.</b> 마감하면 이번 달에는 더 기록할 수 없어요.<br>' : ''}챔피언 👑 <b>${esc(nameOf(r.champion))}</b> (${r.rows[r.champion].score}점)<br>티어와 보상을 확정할까요?`, '마감하기'))) return;
    const rows = {};
    const rewards = {};
    for (const [u, x] of Object.entries(r.rows)) {
      rows[u] = Object.assign({}, x, { name: nameOf(u) });
      const tid = u === r.champion ? 'champion' : x.tier;
      rewards[u] = { tier: tid, text: st.rewards[tid] || '', given: false, money: st.rewardMoney[tid] || 0 };
    }
    await B.set('seasons/' + m, { closedAt: B.now(), rows, champion: r.champion, championName: nameOf(r.champion), rewards });
    await B.set('standings/' + m, { rows: r.rows, champion: r.champion, updatedAt: B.now() });
    openSeason = m;
    toast(`${T.monthLabel(m)}을 마감했어요!`, 'good');
  }

  /* ───────────── 설정 ───────────── */
  SK.settings = () => {
    const st = A.settings();
    main().innerHTML = `<div class="a-head"><h2>설정</h2></div>
      <div class="two-col"><div class="col" style="gap:16px">
        <div class="panel"><h3>생활 점수 항목</h3><p class="note" style="margin-top:0">월 한도 0 = 무제한. 한도를 넘은 기록은 0점으로 반영돼요.</p>
          <table class="tbl"><thead><tr><th>항목</th><th>입력</th><th>1건 점수</th><th>월 한도(회)</th></tr></thead><tbody>
          ${Object.entries(st.cats).filter(([, c]) => !c.gone).map(([k, c]) => `<tr><td><input data-cn="${k}" value="${esc(c.name)}"></td><td>${k === 'service' && st.svMode === 'student' ? '학생 체크→확인' : { teacher: '선생님', student: '학생→승인', system: '자동(앱 채점)' }[c.who] || ''}</td>
            <td><input data-cp="${k}" type="number" value="${c.points}" style="width:90px"></td><td><input data-cc="${k}" type="number" min="0" value="${c.cap}" style="width:90px"></td></tr>`).join('')}
          </tbody></table></div>
        <div class="panel"><h3>🀄 한자 학습</h3><p class="note" style="margin-top:0">가정 학습은 인정하지 않아요 — 아래 요일·시간에만 학습과 승급 시험이 열려요.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">${['일', '월', '화', '수', '목', '금', '토'].map((d, i) => `<label style="display:flex;align-items:center;gap:4px;margin:0;color:var(--text)"><input type="checkbox" class="chk" data-hday="${i}" ${st.hanja.days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
          <div class="form-grid"><label>시작 시각<input id="hj-start" type="time" value="${esc(st.hanja.start)}"></label><label>끝 시각<input id="hj-end" type="time" value="${esc(st.hanja.end)}"></label>
            <label>하루 새 한자 수<input id="hj-daily" type="number" min="1" max="10" value="${st.hanja.daily}"></label></div>
          <div class="form-grid">${window.Hanja.LEVELS.map((n, i) => `<label>${n} 승급 시험 문항 수<input data-htc="${i}" type="number" min="5" max="60" value="${st.hanja.testCount[i]}"><small data-htr="${i}"></small></label>`).join('')}</div>
          <p class="note">통과 기준: 10문항 이하 90% · 11~29문항 80% · 30문항 이상 70%</p></div>
        <div class="panel"><h3>등급 방식 비율 (수행평가 등)</h3><p class="note" style="margin-top:0">활동의 <b>기준 점수</b>에 곱하는 비율(%)이에요. 예: 기준 40점, 잘함 50% → +20점. 음수는 감점.</p>
          <div class="form-grid">${T.GRADES.map((g) => `<label>${g} (%)<input data-gp="${g}" type="number" value="${st.gradePct[g]}"></label>`).join('')}</div></div>
        <div class="panel"><h3>티어 기준 점수</h3><div class="form-grid">
          ${[['silver', '실버'], ['gold', '골드'], ['platinum', '플래티넘'], ['diamond', '다이아']].map(([k, l]) => `<label>${l} 이상<input data-th="${k}" type="number" value="${st.thresholds[k]}"></label>`).join('')}
          </div><label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input type="checkbox" class="chk" id="st-show" ${st.showScores ? 'checked' : ''}> 학생 순위표에 다른 친구의 총점도 보여주기</label>
          <div class="foot"><button class="btn primary" id="st-save">저장</button></div></div>
      </div><div class="col" style="gap:16px">
        <div class="panel"><h3>반 정보</h3><label>반 이름<input id="ci-class" value="${esc(S.className)}"></label><label>선생님 표시 이름<input id="ci-teacher" value="${esc(S.teacherName)}"></label>
          <div class="foot"><button class="btn" id="ci-save">저장</button></div></div>
        <div class="panel" id="acct-panel"><h3>선생님 계정</h3>
          ${B.google ? `<div class="g-link"><svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            <div><b>Google 계정</b><div class="muted">${B.googleEmail() ? `${esc(B.googleEmail())} · 연결됨` : '연결 안 됨'}</div></div><span class="sp"></span>
            ${B.googleEmail() ? (B.hasPassword() ? '<button class="btn sm ghost" id="g-unlink">연결 끊기</button>' : '') : '<button class="btn sm primary" id="g-link">Google 계정 연결</button>'}</div>
            <p class="note">연결하면 어느 기기에서든 로그인 화면의 「Google 계정으로 로그인」으로 이 선생님 계정에 들어올 수 있어요.</p>` : ''}
          ${B.hasPassword() ? `<label>현재 비밀번호<input id="tp-old" type="password"></label><label>새 비밀번호 (6자 이상)<input id="tp-new" type="password"></label>
          <div class="foot"><button class="btn" id="tp-go">비밀번호 변경</button></div>` : '<p class="note">Google 계정으로 만든 선생님 계정이에요 (비밀번호 없음).</p>'}
          ${B.mode === 'demo' ? '<p class="note">데모 모드입니다. (Google 로그인은 실제 사이트에서만 돼요)</p><button class="btn danger sm" id="demo-reset2">데모 데이터 초기화</button>' : ''}</div>
      </div></div>`;
    // 문항 수에 따라 통과 기준 표시
    const showRate = () => $$('[data-htc]').forEach((i) => {
      const n = Math.round(Number(i.value) || 0);
      $(`[data-htr="${i.dataset.htc}"]`).textContent = n ? `통과: ${Math.round(T.passRate(n) * 100)}% (${Math.ceil(n * T.passRate(n))}문항 이상)` : '';
    });
    $$('[data-htc]').forEach((i) => (i.oninput = showRate));
    showRate();
    $('#st-save').onclick = async () => {
      const raw = JSON.parse(JSON.stringify(S.settingsRaw || {}));
      const oldCats = raw.cats || {};
      raw.cats = {}; raw.thresholds = {};
      for (const k of Object.keys(st.cats)) {
        // 지운 급수표의 승급 점수는 화면에 없지만 지난 기록 계산을 위해 그대로 둠
        if (!$(`[data-cp="${k}"]`)) { if (oldCats[k]) raw.cats[k] = oldCats[k]; continue; }
        const pts = Number($(`[data-cp="${k}"]`).value), cap = Number($(`[data-cc="${k}"]`).value);
        if (!isFinite(pts) || !isFinite(cap) || cap < 0) return toast('점수·한도를 확인하세요.', 'bad');
        raw.cats[k] = { name: $(`[data-cn="${k}"]`).value.trim() || st.cats[k].name, points: k === 'penalty' ? -Math.abs(pts) : pts, cap: Math.floor(cap) };
      }
      for (const k of ['silver', 'gold', 'platinum', 'diamond']) raw.thresholds[k] = Number($(`[data-th="${k}"]`).value);
      const t = raw.thresholds;
      if (!(t.silver < t.gold && t.gold < t.platinum && t.platinum < t.diamond)) return toast('티어 기준은 실버 < 골드 < 플래티넘 < 다이아 순이어야 해요.', 'bad');
      const days = $$('[data-hday]').filter((c) => c.checked).map((c) => Number(c.dataset.hday));
      const testCount = $$('[data-htc]').map((i) => Math.max(5, Math.min(60, Math.round(Number(i.value) || 20))));
      raw.hanja = { days, start: $('#hj-start').value || '08:30', end: $('#hj-end').value || '16:30', daily: Math.max(1, Math.min(10, Math.round(Number($('#hj-daily').value) || 5))), testCount };
      if (raw.hanja.start >= raw.hanja.end) return toast('한자 학습 시작 시각이 끝 시각보다 빨라야 해요.', 'bad');
      raw.gradePct = {};
      for (const g of T.GRADES) {
        const v = Number($(`[data-gp="${g}"]`).value);
        if (!isFinite(v)) return toast('등급 비율을 확인하세요.', 'bad');
        raw.gradePct[g] = v;
      }
      raw.showScores = $('#st-show').checked;
      await B.set('config/settings', raw);
      toast('저장했어요. 진행 중인 달의 점수가 다시 계산돼요.', 'good');
    };
    $('#ci-save').onclick = async () => {
      await B.update('config', { className: $('#ci-class').value.trim(), teacherName: $('#ci-teacher').value.trim() || '선생님' });
      toast('저장했어요.', 'good');
    };
    const tp = $('#tp-go');
    if (tp) tp.onclick = async () => {
      try { await B.setPassword('teacher', $('#tp-old').value, $('#tp-new').value); toast('비밀번호를 변경했어요.', 'good'); $('#tp-old').value = $('#tp-new').value = ''; }
      catch (err) { toast(err.message, 'bad'); }
    };
    const redraw = () => { main().dataset.tab = ''; A.render(); };
    const gl = $('#g-link');
    if (gl) gl.onclick = async () => {
      gl.disabled = true;
      try { const em = await B.linkGoogle(); toast(`${em} 계정을 연결했어요. 이제 Google 계정으로 로그인할 수 있어요.`, 'good'); redraw(); }
      catch (err) { gl.disabled = false; toast(err.message, 'bad'); }
    };
    const gu = $('#g-unlink');
    if (gu) gu.onclick = async () => {
      if (!(await confirmBox('Google 연결 끊기', '연결을 끊으면 Google로는 로그인할 수 없고, 아이디(teacher)와 비밀번호로만 들어올 수 있어요.', '연결 끊기', true))) return;
      try { await B.unlinkGoogle(); toast('연결을 끊었어요.'); redraw(); } catch (err) { toast(err.message, 'bad'); }
    };
    const dr = $('#demo-reset2');
    if (dr) dr.onclick = async () => { if (await confirmBox('데모 초기화', '모든 데모 데이터를 지울까요?', '초기화', true)) { B.resetDemo(); location.reload(); } };
  };
  RD.settings = () => {};

  window.Teacher = Teacher;
})();

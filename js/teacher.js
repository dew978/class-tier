/* 클래스 티어 — 선생님 화면
   순위 현황 · 승인 대기 · 경쟁 활동 · 칭찬·감점 · 학생 관리 · 월 마감·보상 · 설정
   점수 계산은 선생님 화면에서 이뤄지며, 결과(공개 순위 standings / 학생별 세부 myDetail)를 저장합니다. */
(function () {
  const A = window.App;
  const { S, B, T, $, $$, esc, emblem, tierChip, tierName, nameTag, nameOf, toast, modal, confirmBox, fmtDate, fmtTime, signed } = A;
  const MAX_STUDENTS = 25;
  let tab = 'board';
  let subs = [];
  let acts = {}, ents = {}, secrets = {}, levels = {}, hanjaAll = {};
  let boardMonth = null, actMonth = null;
  const sel = new Set();
  const main = () => $('#tc-main');

  const Teacher = {
    enter() {
      subs.push(B.on('activities', (v) => { acts = v || {}; A.render(); }));
      subs.push(B.on('entries', (v) => { ents = v || {}; A.render(); }));
      subs.push(B.on('secrets', (v) => { secrets = v || {}; if (tab === 'students') A.render(); }));
      subs.push(B.on('levels', (v) => { levels = v || {}; if (tab === 'levels' || tab === 'approve') A.render(); }));
      subs.push(B.on('hanja', (v) => { hanjaAll = v || {}; if (tab === 'levels') A.render(); }));
      main().dataset.tab = '';
      A.render();
    },
    leave() {
      subs.forEach((u) => u());
      subs = [];
      acts = {}; ents = {}; secrets = {};
      lastWritten = {};
      main().dataset.tab = '';
      main().innerHTML = '';
    },
    render() {
      schedule();
      $('#tc-brand').innerHTML = `${emblem('gold')}${esc(S.className || '클래스')} 티어 <span class="pill">선생님</span>`;
      const n = pendingList().length;
      $('#tc-tabs [data-tab="approve"]').innerHTML = `승인 대기${n ? `<span class="cnt">${n}</span>` : ''}`;
      if (main().dataset.tab !== tab) {
        main().dataset.tab = tab;
        main().onclick = null;
        main().onchange = null;
        sel.clear();
        SK[tab]();
      }
      RD[tab]();
    },
  };
  $('#tc-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    $$('#tc-tabs button').forEach((x) => x.classList.toggle('on', x === b));
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
    let skipped = 0, done = 0;
    for (const k of keys) {
      const [uid, id] = k.split('/');
      const e = ents[uid] && ents[uid][id];
      if (!e) continue;
      if (ok && isClosed(e.month)) { skipped++; continue; }
      upd[`entries/${uid}/${id}/status`] = ok ? 'approved' : 'rejected';
      upd[`entries/${uid}/${id}/reviewedAt`] = now;
      if (!ok && reason) upd[`entries/${uid}/${id}/reason`] = reason;
      // 타자·리코더 승급 심사 승인 → 급수 올리기
      if (ok && e.track && window.Tracks.TRACKS[e.track]) {
        const cur = (levels[uid] && levels[uid][e.track]) || 0;
        upd[`levels/${uid}/${e.track}`] = Math.max(cur, Number(e.level) || cur + 1);
      }
      sel.delete(k);
      done++;
    }
    if (done) await B.update('', upd);
    toast(`${done}건 ${ok ? '승인' : '반려'}${skipped ? ` · 마감된 달 ${skipped}건은 승인할 수 없어요` : ''}`, skipped ? 'bad' : 'good');
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
  SK.praise = () => {
    main().innerHTML = `<div class="a-head"><h2>칭찬·감점·1인1역</h2><span class="muted">감점 기록은 본인과 선생님만 봐요</span></div>
      <div class="panel" style="margin-bottom:16px"><div class="a-head" style="margin:0 0 10px"><h3 style="margin:0">🤝 1인1역·봉사 체크</h3><span class="sp"></span>
        <input type="date" id="sv-date" style="width:auto"><button class="btn xs ghost" data-sv="all">모두 체크</button><button class="btn xs ghost" data-sv="none">모두 해제</button><button class="btn sm primary" id="sv-save">저장</button></div>
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
    $('#sv-save').onclick = async () => {
      const date = $('#sv-date').value;
      if (!date) return;
      const ts = new Date(`${date}T15:00:00`).getTime();
      const month = T.monthKey(ts);
      if (isClosed(month)) return toast(`${T.monthLabel(month)}은 마감되었어요.`, 'bad');
      const upd = {};
      let on = 0;
      for (const u of Object.keys(S.users)) {
        const has = !!(ents[u] && ents[u]['sv-' + date]);
        if (svSel.has(u)) { on++; if (!has) upd[`entries/${u}/sv-${date}`] = { cat: 'service', text: `1인1역·봉사 (${date.slice(5).replace('-', '/')})`, month, ts, by: 'teacher', status: 'approved' }; }
        else if (has) upd[`entries/${u}/sv-${date}`] = null;
      }
      if (Object.keys(upd).length) await B.update('', upd);
      toast(`${date.slice(5).replace('-', '/')} 1인1역·봉사 ${on}명 저장`, 'good');
    };
    main().onclick = async (e) => {
      const sv = e.target.closest('[data-svu]');
      if (sv) { svSel.has(sv.dataset.svu) ? svSel.delete(sv.dataset.svu) : svSel.add(sv.dataset.svu); RD.praise(); return; }
      const sa = e.target.closest('[data-sv]');
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
    const ids = Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const date = $('#sv-date').value;
    if (svFor !== date) { svFor = date; svSel = new Set(ids.filter((u) => ents[u] && ents[u]['sv-' + date])); }
    const saved = new Set(ids.filter((u) => ents[u] && ents[u]['sv-' + date]));
    const dirty = ids.some((u) => saved.has(u) !== svSel.has(u));
    $('#sv-grid').innerHTML = ids.map((u) => `<button data-svu="${u}" class="${svSel.has(u) ? 'sel' : ''}"><span class="nm">${svSel.has(u) ? '✅ ' : ''}${esc(nameOf(u))}</span>
      <span class="sub">이번 달 ${r.detail[u] && r.detail[u].cats.service ? r.detail[u].cats.service.count : 0}회</span></button>`).join('') || '<p class="empty">학생이 없어요</p>';
    const c = A.settings().cats.service;
    $('#sv-note').innerHTML = `체크한 학생에게 ${signed(c.points)}점 (하루 1번${c.cap ? `, 월 ${c.cap}회까지` : ''}) · 저장된 ${saved.size}명${dirty ? ' · <b style="color:var(--warn)">저장하지 않은 변경이 있어요</b>' : ''}`;
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
      <div class="grid2" style="margin-top:16px"><div class="panel" id="lv-ref-typing"></div><div class="panel" id="lv-ref-recorder"></div></div>`;
    const TR = window.Tracks.TRACKS;
    for (const tk of ['typing', 'recorder']) {
      $('#lv-ref-' + tk).innerHTML = `<h3>${TR[tk].ic} ${TR[tk].name} 급수표</h3><table class="tbl"><tbody>${TR[tk].levels.map((l, i) => `<tr><td><b>${i + 1}. ${esc(l.name)}</b></td><td>${l.songs ? `${esc(l.songs)}<br>` : ''}<span class="muted">${esc(l.cond)}</span></td><td class="muted">${esc(l.reward)}</td></tr>`).join('')}</tbody></table>`;
    }
    main().onchange = async (e) => {
      const s = e.target.closest('[data-lvset]');
      if (!s) return;
      const [u, tk] = s.dataset.lvset.split('|');
      await B.set(`levels/${u}/${tk}`, Number(s.value));
      toast(`${nameOf(u)} ${TR[tk].name} 급수를 ${window.Tracks.levelName(tk, Number(s.value))}(으)로 맞췄어요.`, 'good');
    };
    main().onclick = async (e) => {
      const up = e.target.closest('[data-up]');
      if (up) {
        const [u, tk] = up.dataset.up.split('|');
        const cur = (levels[u] && levels[u][tk]) || 0;
        const t = TR[tk];
        if (cur >= t.levels.length) return;
        const m = A.curMonth();
        if (isClosed(m)) return toast('이번 달은 마감되었어요.', 'bad');
        if (!(await confirmBox(`${t.name} 승급`, `<b>${esc(nameOf(u))}</b> — ${esc(window.Tracks.levelName(tk, cur))} → <b>${esc(t.levels[cur].name)}</b><br>심사를 통과했나요? 점수 ${signed(A.settings().cats[t.cat].points)}점(한 달에 1번까지)`, '승급'))) return;
        await B.update('', {
          [`levels/${u}/${tk}`]: cur + 1,
          [`entries/${u}/${B.newKey()}`]: { cat: t.cat, track: tk, level: cur + 1, text: `${t.name} ${t.levels[cur].name} 승급 (선생님 심사)`, month: m, ts: B.now(), by: 'teacher', status: 'approved' },
        });
        toast('승급했어요! 🎉', 'good');
        return;
      }
      const hj = e.target.closest('[data-hj]');
      if (hj) editHanja(hj.dataset.hj);
    };
  };
  RD.levels = () => {
    const TR = window.Tracks.TRACKS;
    const H = window.Hanja;
    const m = A.curMonth();
    const ids = Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const today = todayStr(B.now());
    const sel = (u, tk) => {
      const cur = (levels[u] && levels[u][tk]) || 0;
      return `<div class="row-flex" style="gap:6px;flex-wrap:nowrap"><select data-lvset="${u}|${tk}" style="width:auto">${['시작 전', ...TR[tk].levels.map((l) => l.name)].map((n, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        ${cur < TR[tk].levels.length ? `<button class="btn xs good" data-up="${u}|${tk}">승급</button>` : ''}</div>`;
    };
    $('#lv-table').innerHTML = ids.length ? `<table class="tbl"><thead><tr><th>학생</th><th>⌨️ 타자</th><th>🎵 리코더</th><th>🀄 한자 급수</th><th class="num">배운 한자</th><th>오늘</th><th class="num">이번 달 학습</th><th>최근 시험</th><th></th></tr></thead><tbody>
      ${ids.map((u) => {
        const h = Object.assign({ learned: 0, level: 0 }, hanjaAll[u] || {});
        const daily = Object.entries(ents[u] || {}).filter(([k, e]) => e.cat === 'hanjaDaily' && e.month === m).length;
        const lt = h.lastTest;
        return `<tr><td>${nameTag(u)}</td><td>${sel(u, 'typing')}</td><td>${sel(u, 'recorder')}</td>
          <td><b>${esc(window.Tracks.levelName('hanja', h.level))}</b></td><td class="num">${h.learned} / ${H.LIST.length}</td>
          <td>${h.lastDone === today ? '✅' : '-'}</td><td class="num">${daily}회</td>
          <td>${lt ? `${fmtDate(lt.ts)} ${esc(H.LEVELS[lt.level] || '')} ${lt.right}/${lt.total} ${lt.passed ? '<span class="pill good">통과</span>' : '<span class="pill warn">재도전</span>'}` : '-'}</td>
          <td><button class="btn xs" data-hj="${u}">한자 조정</button></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty" style="padding:30px">학생이 없어요</p>';
  };
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
      </div><div class="tbl-wrap" id="sm-table"></div>`;
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
      const upd = { ['users/' + u]: null, ['secrets/' + u]: null, ['entries/' + u]: null, ['levels/' + u]: null, ['hanja/' + u]: null };
      for (const m of allMonths()) upd[`myDetail/${m}/${u}`] = null;
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
      <div class="panel"><h3>티어별 보상</h3><p class="note" style="margin-top:0">마감하면 학생마다 해당 티어의 보상이 자동으로 정해지고, 학생 화면에도 보여요.</p>
        ${REWARD_KEYS.map((k) => `<label>${tierChip(k)}<input data-rw="${k}" value="${esc(st.rewards[k] || '')}" placeholder="${{ champion: '예: 자리 우선 선택권 + 상장', diamond: '예: 간식 쿠폰 2장', platinum: '예: 간식 쿠폰 1장', gold: '예: 칭찬 도장 3개', silver: '예: 칭찬 도장 1개', bronze: '예: 다음 달 응원 메시지' }[k]}"></label>`).join('')}
        <div class="foot"><button class="btn primary" id="rw-save">보상 저장</button></div></div></div>`;
    $('#rw-save').onclick = async () => {
      const raw = JSON.parse(JSON.stringify(S.settingsRaw || {}));
      raw.rewards = {};
      $$('[data-rw]').forEach((i) => (raw.rewards[i.dataset.rw] = i.value.trim()));
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
      const open = openSeason === m;
      return `<div class="panel"><div class="a-head" style="margin:0"><h3 style="margin:0">${esc(T.monthLabel(m))} <span class="pill good">마감</span></h3>
        <span class="muted">챔피언 👑 ${esc(s.championName || '-')} · 보상 지급 ${given}/${ids.length}</span><span class="sp"></span>
        <button class="btn sm" data-cl="toggle" data-m="${m}">${open ? '접기' : '결과·보상 보기'}</button><button class="btn sm ghost" data-cl="reopen" data-m="${m}">마감 취소</button></div>
        ${open ? `<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>순위</th><th>학생</th><th>티어</th><th class="num">점수</th><th>보상</th><th>지급</th></tr></thead><tbody>
          ${ids.map((u) => { const r = s.rows[u]; const tid = s.champion === u ? 'champion' : r.tier; const w = rw[u] || {}; return `<tr><td><b>${r.rank}</b></td><td>${esc(S.users[u] ? S.users[u].name : (r.name || '(삭제됨)'))}</td><td>${tierChip(tid)}</td><td class="num">${r.score}</td><td>${esc(w.text || '-')}</td>
            <td>${w.text ? `<input type="checkbox" class="chk" data-give="${m}/${u}" ${w.given ? 'checked' : ''}>` : ''}</td></tr>`; }).join('')}
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
      rewards[u] = { tier: tid, text: st.rewards[tid] || '', given: false };
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
          ${Object.entries(st.cats).map(([k, c]) => `<tr><td><input data-cn="${k}" value="${esc(c.name)}"></td><td>${{ teacher: '선생님', student: '학생→승인', system: '자동(앱 채점)' }[c.who] || ''}</td>
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
        <div class="panel"><h3>선생님 계정</h3><label>현재 비밀번호<input id="tp-old" type="password"></label><label>새 비밀번호 (6자 이상)<input id="tp-new" type="password"></label>
          <div class="foot"><button class="btn" id="tp-go">비밀번호 변경</button></div>
          ${B.mode === 'demo' ? '<p class="note">데모 모드입니다.</p><button class="btn danger sm" id="demo-reset2">데모 데이터 초기화</button>' : ''}</div>
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
      raw.cats = {}; raw.thresholds = {};
      for (const k of Object.keys(st.cats)) {
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
    $('#tp-go').onclick = async () => {
      try { await B.setPassword('teacher', $('#tp-old').value, $('#tp-new').value); toast('비밀번호를 변경했어요.', 'good'); $('#tp-old').value = $('#tp-new').value = ''; }
      catch (err) { toast(err.message, 'bad'); }
    };
    const dr = $('#demo-reset2');
    if (dr) dr.onclick = async () => { if (await confirmBox('데모 초기화', '모든 데모 데이터를 지울까요?', '초기화', true)) { B.resetDemo(); location.reload(); } };
  };
  RD.settings = () => {};

  window.Teacher = Teacher;
})();

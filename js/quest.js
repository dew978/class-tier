/* 퀘스트 — 학생: 완료 요청(확인만·글·사진 인증) / 선생님: 확인 요청 승인(보상 지급)·반려, 퀘스트 관리
   보상(돈·아이템)은 선생님이 승인할 때 활동 기록과 함께 지급됩니다. 학생은 「요청」만 쓸 수 있어요(보안 규칙).
   반복: 한 번(once) · 매일(d날짜번호, 요일 선택) · 매주(w주번호, 월요일 시작) */
(function () {
  const A = window.App, E = window.Econ, TC = window.Teacher;
  const { S, B, $, esc, toast, modal, confirmBox, fmtDate, fmtTime, nameOf, nameTag } = A;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const kweek = (t) => Math.floor((E.kday(t) + 3) / 7);
  const perKey = (q, t) => (q.rep === 'daily' ? 'd' + E.kday(t) : q.rep === 'weekly' ? 'w' + kweek(t) : 'once');
  function perLabel(per) {
    if (!per || per === 'once') return '';
    const n = Number(per.slice(1));
    const d = new Date((per[0] === 'd' ? n : n * 7 - 3) * E.DAY);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}${per[0] === 'w' ? ' 주' : ''}`;
  }
  const daysOf = (q) => { if (!q.days) return null; const out = []; for (let i = 0; i < 7; i++) if (q.days[i]) out.push(i); return out; };
  function repLabel(q) {
    if (q.rep === 'daily') { const ds = daysOf(q); return ds && ds.length < 7 ? `매일 (${ds.map((i) => WD[i]).join('·')})` : '매일'; }
    return q.rep === 'weekly' ? '매주' : '한 번';
  }
  const PROOF = { simple: '확인만', text: '글로 인증', photo: '사진 인증' };
  function rewardText(q) {
    const it = q.ri && S.store && S.store[q.ri];
    return [q.rw ? `💰 ${E.won(q.rw)}` : '', it ? `${esc(it.ic || '🎁')} ${esc(it.n)} ×${q.rq || 1}` : ''].filter(Boolean).join(' + ') || '칭찬';
  }
  const ord = (a, b) => (a[1].ord ?? 999) - (b[1].ord ?? 999) || String(a[1].t).localeCompare(String(b[1].t));
  // 지금 이 학생이 요청할 수 있는지 (보안 규칙과 같은 조건)
  function availability(q, uid) {
    const now = B.now();
    if (q.on === false) return [false, '잠시 멈춘 퀘스트예요'];
    if (q.to && !q.to[uid]) return [false, '대상이 아니에요'];
    if (q.s && now < q.s) return [false, `${fmtDate(q.s)}부터 할 수 있어요`];
    if (q.e && now > q.e) return [false, '기간이 끝났어요'];
    if (q.rep === 'daily') { const ds = daysOf(q); if (ds && !ds.includes(E.kwd(now))) return [false, `${ds.map((i) => WD[i]).join('·')}요일에 할 수 있어요`]; }
    const per = perKey(q, now);
    if (q.cap && ((q.cnt && q.cnt[per]) || 0) >= q.cap) return [false, '자리가 다 찼어요'];
    return [true, '', per];
  }

  /* ───────────── 학생 ───────────── */
  const progSubs = {};
  let prog = {}, filter = 'todo', lastHtml = '', lastEl = null;
  function syncSubs() {
    for (const qid of Object.keys(S.quests || {})) if (!progSubs[qid]) progSubs[qid] = B.on(`qprog/${qid}/${S.uid}`, (v) => { prog[qid] = v || {}; A.render(); });
  }
  function studentCard(qid, q) {
    const now = B.now();
    const mine = prog[qid] || {};
    const [ok, why, per] = availability(q, S.uid);
    const cur = mine[per || perKey(q, now)];
    const done = Object.values(mine).filter((r) => r && r.st === 'ok').length;
    let status;
    if (cur && cur.st === 'ok') status = `<div class="q-st ok">✅ 완료! 보상을 받았어요</div>`;
    else if (cur && cur.st === 'req') status = `<div class="q-st req">🕒 선생님이 확인하고 있어요</div><button class="btn sm ghost" data-qcancel="${esc(qid)}">요청 취소</button>`;
    else if (cur && cur.st === 'no') status = `<div class="q-st no">↩️ 다시 해 보세요${cur.why ? `: ${esc(cur.why)}` : ''}</div>${ok ? `<button class="btn sm primary" data-qreq="${esc(qid)}">다시 요청</button>` : ''}`;
    else status = ok ? `<button class="btn primary" data-qreq="${esc(qid)}">완료 요청</button>` : `<div class="q-st off">⏸ ${esc(why)}</div>`;
    return `<div class="q-card ${cur && cur.st === 'ok' ? 'done' : ''}"><div class="q-top"><b class="q-title">${esc(q.t)}</b><span class="pill">${repLabel(q)}</span></div>
      ${q.d ? `<div class="muted q-desc">${esc(q.d)}</div>` : ''}
      <div class="q-reward">${rewardText(q)}</div>
      <div class="muted q-meta">${PROOF[q.proof] || '확인만'}${q.e ? ` · ${fmtDate(q.e)}까지` : ''}${q.cap ? ` · 남은 자리 ${Math.max(0, q.cap - ((q.cnt && q.cnt[per || perKey(q, now)]) || 0))}/${q.cap}` : ''}${q.rep && q.rep !== 'none' && done ? ` · 지금까지 ${done}번 완료` : ''}</div>
      <div class="q-foot">${status}</div></div>`;
  }
  function renderStudent(main) {
    syncSubs();
    const now = B.now();
    const all = Object.entries(S.quests || {}).filter(([, q]) => q && q.on !== false && (!q.to || q.to[S.uid])).sort(ord);
    const state = ([qid, q]) => { const p = (prog[qid] || {})[perKey(q, now)]; return p ? p.st : ''; };
    const todo = all.filter((x) => state(x) !== 'ok' && availability(x[1], S.uid)[0]);
    const done = all.filter((x) => state(x) === 'ok');
    const list = filter === 'todo' ? todo : filter === 'done' ? done : all;
    const html = `<div class="panel"><div class="a-head" style="margin-bottom:10px"><h3 style="margin:0">🎯 퀘스트</h3><span class="muted">선생님이 확인하면 보상을 받아요</span><span class="sp"></span></div>
      <div class="chips">${[['todo', `할 수 있는 퀘스트 ${todo.length}`], ['done', `완료 ${done.length}`], ['all', `전체 ${all.length}`]].map(([k, n]) => `<button data-qf="${k}" class="${filter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${list.length ? `<div class="q-grid">${list.map(([qid, q]) => studentCard(qid, q)).join('')}</div>` : `<p class="empty">${filter === 'todo' ? '지금 할 수 있는 퀘스트가 없어요.' : '아직 없어요.'}</p>`}</div>`;
    if (html === lastHtml && lastEl && main.contains(lastEl)) return;
    lastHtml = html;
    main.innerHTML = html;
    lastEl = main.firstElementChild;
    main.onclick = onStudentClick;
  }
  async function onStudentClick(e) {
    const f = e.target.closest('[data-qf]');
    if (f) { filter = f.dataset.qf; A.render(); return; }
    const r = e.target.closest('[data-qreq]');
    if (r) return requestDialog(r.dataset.qreq);
    const c = e.target.closest('[data-qcancel]');
    if (c) {
      const q = S.quests[c.dataset.qcancel];
      const per = Object.keys(prog[c.dataset.qcancel] || {}).find((k) => prog[c.dataset.qcancel][k].st === 'req' && k === perKey(q, B.now())) || perKey(q, B.now());
      if (!(await confirmBox('요청 취소', `「${esc(q.t)}」 완료 요청을 취소할까요?`, '취소하기'))) return;
      await B.update('', { [`qprog/${c.dataset.qcancel}/${S.uid}/${per}`]: null, [`qimg/${c.dataset.qcancel}/${S.uid}/${per}`]: null }).catch((err) => toast(err.message, 'bad'));
    }
  }
  function requestDialog(qid) {
    const q = S.quests[qid];
    const [ok, why, per] = availability(q, S.uid);
    if (!ok) return toast(why, 'bad');
    let img = null;
    const m = modal(`<h3>🎯 ${esc(q.t)}</h3>${q.d ? `<p class="muted" style="margin-top:0">${esc(q.d)}</p>` : ''}
      <p class="note" style="margin-top:0">보상: ${rewardText(q)}</p>
      ${q.proof === 'text' ? '<label>무엇을 했는지 적어 주세요<textarea id="qx" rows="4" maxlength="500" placeholder="예: 오늘 줄넘기 100번을 했어요"></textarea></label>'
        : q.proof === 'photo' ? '<div class="photo-pick"><button class="btn" id="qp">📷 인증 사진 고르기</button><div id="qpv" class="muted">사진이 필요해요</div></div><label>한마디 (선택)<input id="qx" maxlength="200"></label>'
          : '<p class="note">퀘스트를 마쳤으면 「완료 요청」을 눌러요. 선생님이 확인하면 보상을 받아요.</p>'}
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>완료 요청</button></div>`);
    const pickBtn = m.el.querySelector('#qp');
    if (pickBtn) pickBtn.onclick = async () => {
      const f = await window.Media.pick();
      if (!f) return;
      try {
        m.el.querySelector('#qpv').textContent = '사진 줄이는 중…';
        img = await window.Media.compress(f);
        m.el.querySelector('#qpv').innerHTML = `<img src="${img}" alt="" class="proof-img">`;
      } catch (err) { m.el.querySelector('#qpv').textContent = err.message; img = null; }
    };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const xi = m.el.querySelector('#qx');
      const txt = xi ? xi.value.trim() : '';
      if (q.proof === 'text' && txt.length < 2) return toast('무엇을 했는지 적어 주세요.', 'bad');
      if (q.proof === 'photo' && !img) return toast('인증 사진을 골라 주세요.', 'bad');
      const rec = { st: 'req', t: B.ts() };
      if (txt) rec.txt = txt;
      if (img) rec.img = true;
      const upd = { [`qprog/${qid}/${S.uid}/${per}`]: rec };
      if (img) upd[`qimg/${qid}/${S.uid}/${per}`] = img;
      e.target.disabled = true;
      try { await B.update('', upd); m.close(); toast('완료 요청을 보냈어요! 선생님이 확인하면 보상을 받아요.', 'good'); }
      catch (err) { e.target.disabled = false; toast(/권한/.test(err.message) ? '지금은 요청할 수 없어요. (기간·자리·요일을 확인해 주세요)' : err.message, 'bad'); }
    };
  }
  window.QuestStudent = {
    handles: (tab) => tab === 'quest',
    render: renderStudent,
    // 완료 요청이 반려되었거나 새로 할 수 있는 퀘스트 수
    badges() {
      if (!S.quests || S.isTeacher || !S.uid) return {};
      syncSubs();
      const now = B.now();
      let n = 0;
      for (const [qid, q] of Object.entries(S.quests)) {
        if (!q || q.on === false || (q.to && !q.to[S.uid])) continue;
        if (!(qid in prog)) continue;
        const p = prog[qid][perKey(q, now)];
        if ((!p && availability(q, S.uid)[0]) || (p && p.st === 'no')) n++;
      }
      return { quest: n };
    },
    reset() { for (const k of Object.keys(progSubs)) { progSubs[k](); delete progSubs[k]; } prog = {}; filter = 'todo'; lastHtml = ''; },
  };

  /* ───────────── 선생님 ───────────── */
  let qall = {}, qsub = null;
  const main = () => $('#tc-main');
  const stuIds = () => Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
  window.QuestTeacher = {
    enter() { qsub = B.on('qprog', (v) => { qall = v || {}; A.render(); }); },
    leave() { if (qsub) qsub(); qsub = null; qall = {}; },
  };
  function pending() {
    const out = [];
    for (const [qid, byU] of Object.entries(qall)) {
      if (!S.quests[qid]) continue;
      for (const [uid, byP] of Object.entries(byU || {})) {
        if (!S.users[uid]) continue;
        for (const [per, r] of Object.entries(byP || {})) if (r && r.st === 'req') out.push({ qid, uid, per, r });
      }
    }
    return out.sort((a, b) => (a.r.t || 0) - (b.r.t || 0));
  }
  TC.addBadges(() => ({ qreq: pending().length }));

  // 승인: 보상 지급 + 완료 표시 (학생마다 따로 저장 — 계좌당 기록 한 줄)
  async function approve(list) {
    let n = 0;
    const full = [];
    const used = {};
    for (const { qid, uid, per } of list) {
      const q = S.quests[qid];
      const key = `${qid}|${per}`;
      if (!(key in used)) used[key] = (q.cnt && q.cnt[per]) || 0;
      if (q.cap && used[key] >= q.cap) { full.push(nameOf(uid)); continue; }
      const had = (((qall[qid] || {})[uid] || {})[per]) || null;
      if (had && had.st === 'ok') continue;
      const upd = {};
      const lid = E.addOp(upd, uid, { k: 'quest', a: q.rw || 0, n: q.t, i: q.ri && S.store[q.ri] ? q.ri : null, q: q.ri && S.store[q.ri] ? q.rq || 1 : null, m: perLabel(per) || null });
      if (q.ri && S.store[q.ri]) upd[`acct/${uid}/items/${q.ri}`] = B.inc(q.rq || 1);
      const base = `qprog/${qid}/${uid}/${per}`;
      if (had) { upd[base + '/st'] = 'ok'; upd[base + '/rt'] = B.ts(); upd[base + '/lid'] = lid; upd[base + '/why'] = null; }
      else upd[base] = { st: 'ok', t: B.ts(), rt: B.ts(), lid };
      upd[`quests/${qid}/cnt/${per}`] = B.inc(1);
      if (!(await E.commit(upd))) break;
      used[key]++;
      n++;
    }
    toast(`${n}건 승인하고 보상을 보냈어요.${full.length ? ` (자리가 다 차서 못 한 학생: ${full.join(', ')})` : ''}`, full.length ? 'bad' : 'good');
  }
  async function reject(list) {
    const why = await new Promise((res) => {
      let v = null;
      const m = modal(`<h3>반려 사유</h3><label>학생에게 보여요 (선택)<input id="qw" maxlength="100" placeholder="예: 사진이 잘 안 보여요"></label>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn danger" data-ok>반려</button></div>`, { onClose: () => res(v) });
      m.el.querySelector('[data-ok]').onclick = () => { v = m.el.querySelector('#qw').value.trim(); m.close(); };
    });
    if (why === null) return;
    const upd = {};
    for (const { qid, uid, per } of list) {
      const base = `qprog/${qid}/${uid}/${per}`;
      upd[base + '/st'] = 'no';
      upd[base + '/rt'] = B.ts();
      upd[base + '/why'] = why || null;
    }
    await B.update('', upd);
    toast(`${list.length}건 반려했어요.`);
  }
  async function showPhoto(qid, uid, per) {
    const img = await B.get(`qimg/${qid}/${uid}/${per}`).catch(() => null);
    modal(`<h3>${esc(nameOf(uid))} · ${esc(S.quests[qid].t)}</h3>${img ? `<img src="${img}" alt="" class="proof-big">` : '<p class="empty">사진이 없어요 (정리되었을 수 있어요)</p>'}<div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
  }

  const qsel = new Set();
  TC.addTab('qreq', '확인 요청', () => {
    main().innerHTML = `<div class="a-head"><h2>퀘스트 확인 요청</h2><span class="muted" id="qr-cnt"></span><span class="sp"></span>
        <button class="btn sm ghost" data-q="all">전체 선택</button><button class="btn sm good" data-q="ok">선택 승인·보상</button><button class="btn sm danger" data-q="no">선택 반려</button></div>
      <div class="tbl-wrap" id="qr-table"></div>
      <div class="panel" style="margin-top:16px"><h3>최근 처리</h3><div id="qr-done"></div></div>`;
    main().onclick = async (e) => {
      const ph = e.target.closest('[data-ph]');
      if (ph) { const [q, u, p] = ph.dataset.ph.split('|'); return showPhoto(q, u, p); }
      const one = e.target.closest('[data-q1]');
      if (one) { const [q, u, p] = one.dataset.k.split('|'); return one.dataset.q1 === 'ok' ? approve([{ qid: q, uid: u, per: p }]) : reject([{ qid: q, uid: u, per: p }]); }
      const b = e.target.closest('[data-q]');
      if (!b) return;
      if (b.dataset.q === 'all') { pending().forEach((x) => qsel.add(`${x.qid}|${x.uid}|${x.per}`)); A.render(); return; }
      if (!qsel.size) return toast('먼저 요청을 선택하세요.', 'bad');
      const list = [...qsel].map((k) => { const [qid, uid, per] = k.split('|'); return { qid, uid, per }; });
      qsel.clear();
      if (b.dataset.q === 'ok') await approve(list); else await reject(list);
    };
    main().onchange = (e) => { const c = e.target.closest('[data-qk]'); if (c) { c.checked ? qsel.add(c.dataset.qk) : qsel.delete(c.dataset.qk); } };
  }, () => {
    const list = pending();
    const keys = new Set(list.map((x) => `${x.qid}|${x.uid}|${x.per}`));
    for (const k of [...qsel]) if (!keys.has(k)) qsel.delete(k);
    $('#qr-cnt').textContent = `${list.length}건`;
    $('#qr-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th></th><th>요청</th><th>학생</th><th>퀘스트</th><th>인증</th><th>보상</th><th></th></tr></thead><tbody>
      ${list.map(({ qid, uid, per, r }) => { const q = S.quests[qid]; const k = `${qid}|${uid}|${per}`; return `<tr><td><input type="checkbox" class="chk" data-qk="${k}" ${qsel.has(k) ? 'checked' : ''}></td><td class="muted nowrap">${fmtTime(r.t)}</td><td>${nameTag(uid)}</td>
        <td><b>${esc(q.t)}</b>${perLabel(per) ? ` <span class="pill">${perLabel(per)}</span>` : ''}</td>
        <td>${r.txt ? `<div class="q-txt">${esc(r.txt)}</div>` : ''}${r.img ? `<button class="btn xs" data-ph="${k}">📷 사진 보기</button>` : ''}${!r.txt && !r.img ? '<span class="muted">확인만</span>' : ''}</td>
        <td class="nowrap">${rewardText(q)}</td>
        <td><div class="row-actions"><button class="btn xs good" data-q1="ok" data-k="${k}">승인</button><button class="btn xs danger" data-q1="no" data-k="${k}">반려</button></div></td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty" style="padding:30px">확인할 요청이 없어요 👍</p>';
    const done = [];
    for (const [qid, byU] of Object.entries(qall)) for (const [uid, byP] of Object.entries(byU || {})) for (const [per, r] of Object.entries(byP || {})) if (r && r.rt && S.quests[qid] && S.users[uid]) done.push({ qid, uid, per, r });
    done.sort((a, b) => b.r.rt - a.r.rt);
    $('#qr-done').innerHTML = done.length ? `<ul class="rows">${done.slice(0, 15).map(({ qid, uid, per, r }) => `<li><span class="status ${r.st === 'ok' ? 'approved' : 'rejected'}">${r.st === 'ok' ? '승인' : '반려'}</span>${nameTag(uid)}<span>${esc(S.quests[qid].t)}${perLabel(per) ? ` · ${perLabel(per)}` : ''}${r.why ? ` <span class="muted">(${esc(r.why)})</span>` : ''}</span><span class="right muted" style="font-size:.85em">${fmtTime(r.rt)}</span></li>`).join('')}</ul>` : '<p class="empty">아직 없어요</p>';
  });

  TC.addTab('quest', '퀘스트 관리', () => {
    main().innerHTML = `<div class="a-head"><h2>퀘스트 관리</h2><span class="muted">보상은 「확인 요청」에서 승인할 때 지급돼요</span><span class="sp"></span>
        <button class="btn sm ghost" data-qm="clean">오래된 인증 사진 정리</button><button class="btn primary" data-qm="new">+ 새 퀘스트</button></div>
      <div class="tbl-wrap" id="qm-table"></div>`;
    main().onclick = onManage;
    main().onchange = async (e) => { const s = e.target.closest('[data-qon]'); if (s) await B.set(`quests/${s.dataset.qon}/on`, s.checked); };
  }, () => {
    const now = B.now();
    const list = Object.entries(S.quests || {}).filter(([, q]) => q).sort(ord);
    $('#qm-table').innerHTML = list.length ? `<table class="tbl"><thead><tr><th>퀘스트</th><th>보상</th><th>반복</th><th>인증</th><th>기간</th><th class="num">이번 기간</th><th class="num">누적 완료</th><th>사용</th><th></th></tr></thead><tbody>
      ${list.map(([qid, q]) => {
        const per = perKey(q, now);
        const targets = stuIds().filter((u) => !q.to || q.to[u]);
        const byU = qall[qid] || {};
        const nowDone = targets.filter((u) => byU[u] && byU[u][per] && byU[u][per].st === 'ok').length;
        const total = Object.values(byU).reduce((n, byP) => n + Object.values(byP || {}).filter((r) => r && r.st === 'ok').length, 0);
        const req = Object.values(byU).reduce((n, byP) => n + Object.values(byP || {}).filter((r) => r && r.st === 'req').length, 0);
        return `<tr class="${q.on === false ? 'off' : ''}"><td><b>${esc(q.t)}</b>${q.d ? `<div class="muted f-sub">${esc(q.d)}</div>` : ''}</td><td class="nowrap">${rewardText(q)}</td><td>${repLabel(q)}</td><td>${PROOF[q.proof] || '확인만'}</td>
          <td class="nowrap muted">${q.s || q.e ? `${q.s ? fmtDate(q.s) : ''}~${q.e ? fmtDate(q.e) : ''}` : '-'}</td>
          <td class="num">${nowDone}/${targets.length}${q.cap ? ` (정원 ${q.cap})` : ''}${req ? ` <span class="pill warn">요청 ${req}</span>` : ''}</td><td class="num">${total}</td>
          <td><label class="switch"><input type="checkbox" data-qon="${esc(qid)}" ${q.on !== false ? 'checked' : ''}><i></i></label></td>
          <td><div class="row-actions"><button class="btn xs" data-qm="who" data-id="${esc(qid)}">현황</button><button class="btn xs" data-qm="edit" data-id="${esc(qid)}">수정</button><button class="btn xs danger" data-qm="del" data-id="${esc(qid)}">삭제</button></div></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty" style="padding:30px">아직 퀘스트가 없어요.</p>';
  });
  async function onManage(e) {
    const b = e.target.closest('[data-qm]');
    if (!b) return;
    const qid = b.dataset.id;
    if (b.dataset.qm === 'new') return editQuest(null);
    if (b.dataset.qm === 'edit') return editQuest(qid);
    if (b.dataset.qm === 'who') return questStatus(qid);
    if (b.dataset.qm === 'del') {
      if (!(await confirmBox('퀘스트 삭제', `「${esc(S.quests[qid].t)}」을 지울까요? 완료 기록도 함께 지워져요. (이미 받은 보상은 그대로)`, '삭제', true))) return;
      await B.update('', { [`quests/${qid}`]: null, [`qprog/${qid}`]: null, [`qimg/${qid}`]: null });
    }
    if (b.dataset.qm === 'clean') {
      const cut = B.now() - 14 * E.DAY;
      const upd = {};
      for (const [qid2, byU] of Object.entries(qall)) for (const [uid, byP] of Object.entries(byU || {})) for (const [per, r] of Object.entries(byP || {})) if (r && r.img && r.st !== 'req' && (r.rt || r.t) < cut) upd[`qimg/${qid2}/${uid}/${per}`] = null;
      const n = Object.keys(upd).length;
      if (!n) return toast('정리할 사진이 없어요. (확인한 지 14일이 지난 사진만 정리해요)');
      if (!(await confirmBox('인증 사진 정리', `확인이 끝난 지 14일이 지난 인증 사진 ${n}장을 지워 저장 공간을 비울까요? (기록과 보상은 그대로)`, '정리'))) return;
      await B.update('', upd);
      toast(`${n}장을 정리했어요.`, 'good');
    }
  }
  function questStatus(qid) {
    const q = S.quests[qid];
    const per = perKey(q, B.now());
    const m = modal('<div id="qs"></div>', { wide: true });
    const draw = () => {
      const byU = qall[qid] || {};
      const rows = stuIds().filter((u) => !q.to || q.to[u]).map((u) => {
        const r = (byU[u] || {})[per];
        const total = Object.values(byU[u] || {}).filter((x) => x && x.st === 'ok').length;
        const st = r ? r.st : '';
        return `<tr><td>${nameTag(u)}</td><td>${st === 'ok' ? '<span class="status approved">완료</span>' : st === 'req' ? '<span class="status pending">요청</span>' : st === 'no' ? '<span class="status rejected">반려</span>' : '<span class="muted">-</span>'}</td>
          <td class="num">${total}</td><td>${st === 'ok' ? '' : `<button class="btn xs good" data-qd="${u}">${st === 'req' ? '승인·보상' : '완료 처리·보상'}</button>`}</td></tr>`;
      }).join('');
      m.el.querySelector('#qs').innerHTML = `<h3>${esc(q.t)} 현황 ${perLabel(per) ? `<span class="pill">${perLabel(per)}</span>` : ''}</h3>
        <p class="note" style="margin-top:0">보상: ${rewardText(q)} · ${repLabel(q)}${q.cap ? ` · 정원 ${q.cap}명` : ''}. 요청하지 않은 학생도 「완료 처리」로 바로 보상을 줄 수 있어요.</p>
        <div class="tbl-wrap" style="max-height:55vh"><table class="tbl"><thead><tr><th>학생</th><th>이번 기간</th><th class="num">누적 완료</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="foot"><button class="btn" data-close>닫기</button></div>`;
    };
    draw();
    m.el.onclick = async (e) => {
      const d = e.target.closest('[data-qd]');
      if (!d) return;
      d.disabled = true;
      await approve([{ qid, uid: d.dataset.qd, per }]);
      setTimeout(draw, 400);
    };
  }
  function editQuest(qid) {
    const q = qid ? S.quests[qid] : { t: '', rw: 10000, rep: 'none', proof: 'simple', on: true };
    const items = Object.entries(S.store || {}).filter(([, it]) => it && !it.g).sort(ord);
    const dateVal = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const ds = daysOf(q) || [1, 2, 3, 4, 5];
    const tgt = new Set(Object.keys(q.to || {}));
    const m = modal(`<h3>${qid ? '퀘스트 수정' : '새 퀘스트'}</h3>
      <div class="form-grid"><label>이름<input id="qe-t" maxlength="40" value="${esc(q.t)}" placeholder="예: 줄넘기 100번"></label>
        <label>보상 (돈)<input id="qe-rw" type="number" min="0" step="1000" value="${q.rw || 0}"></label>
        <label>보상 아이템 (선택)<select id="qe-ri"><option value="">없음</option>${items.map(([iid, it]) => `<option value="${esc(iid)}" ${q.ri === iid ? 'selected' : ''}>${esc(it.ic || '🎁')} ${esc(it.n)}</option>`).join('')}</select></label>
        <label>아이템 개수<input id="qe-rq" type="number" min="1" value="${q.rq || 1}"></label>
        <label>반복<select id="qe-rep"><option value="none" ${q.rep !== 'daily' && q.rep !== 'weekly' ? 'selected' : ''}>한 번</option><option value="daily" ${q.rep === 'daily' ? 'selected' : ''}>매일</option><option value="weekly" ${q.rep === 'weekly' ? 'selected' : ''}>매주</option></select></label>
        <label>인증 방법<select id="qe-pf">${Object.entries(PROOF).map(([k, n]) => `<option value="${k}" ${(q.proof || 'simple') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>정원 <small>기간마다 먼저 완료한 N명까지 (비우면 제한 없음)</small><input id="qe-cap" type="number" min="1" value="${q.cap || ''}"></label>
        <label>순서<input id="qe-ord" type="number" value="${q.ord ?? ''}"></label>
        <label>시작일 (선택)<input id="qe-s" type="date" value="${dateVal(q.s)}"></label><label>종료일 (선택)<input id="qe-e" type="date" value="${dateVal(q.e)}"></label></div>
      <div id="qe-days-box"><h4>할 수 있는 요일 (매일 반복)</h4><div class="chips" id="qe-days">${WD.map((w, i) => `<button data-d="${i}" class="${ds.includes(i) ? 'on' : ''}">${w}</button>`).join('')}</div></div>
      <label>설명 (학생에게 보여요)<input id="qe-d" maxlength="200" value="${esc(q.d || '')}" placeholder="예: 쉬는 시간에 줄넘기 100번을 하고 요청해요"></label>
      <h4>대상 <span class="muted" style="font-weight:400">아무도 고르지 않으면 반 전체</span></h4>
      <div class="stu-grid" id="qe-to">${stuIds().map((u) => `<button data-tu="${u}" class="${tgt.has(u) ? 'sel' : ''}"><span class="nm">${esc(nameOf(u))}</span></button>`).join('')}</div>
      <label class="chk-line"><input type="checkbox" class="chk" id="qe-on" ${q.on !== false ? 'checked' : ''}> 학생에게 보이기</label>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`, { wide: true });
    const el = (id) => m.el.querySelector(id);
    const days = new Set(ds);
    const syncRep = () => el('#qe-days-box').classList.toggle('hidden', el('#qe-rep').value !== 'daily');
    syncRep();
    el('#qe-rep').onchange = syncRep;
    el('#qe-days').onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; const d = Number(b.dataset.d); days.has(d) ? days.delete(d) : days.add(d); b.classList.toggle('on', days.has(d)); };
    el('#qe-to').onclick = (e) => { const b = e.target.closest('[data-tu]'); if (!b) return; tgt.has(b.dataset.tu) ? tgt.delete(b.dataset.tu) : tgt.add(b.dataset.tu); b.classList.toggle('sel', tgt.has(b.dataset.tu)); };
    el('[data-ok]').onclick = async () => {
      const t = el('#qe-t').value.trim();
      if (!t) return toast('이름을 적어 주세요.', 'bad');
      const rep = el('#qe-rep').value;
      if (rep === 'daily' && !days.size) return toast('요일을 하나 이상 고르세요.', 'bad');
      const sv = el('#qe-s').value, ev = el('#qe-e').value;
      const s = sv ? new Date(`${sv}T00:00:00`).getTime() : null;
      const e = ev ? new Date(`${ev}T23:59:59`).getTime() : null;
      if (s && e && s > e) return toast('시작일이 종료일보다 늦어요.', 'bad');
      const ri = el('#qe-ri').value || null;
      const daysObj = {};
      if (rep === 'daily' && days.size < 7) for (const d of days) daysObj[d] = true;
      const toObj = {};
      for (const u of tgt) if (S.users[u]) toObj[u] = true;
      const cap = Math.floor(Number(el('#qe-cap').value) || 0);
      const val = Object.assign({}, qid ? q : {}, {
        t, d: el('#qe-d').value.trim() || null, rw: Math.max(0, Math.floor(Number(el('#qe-rw').value) || 0)), ri, rq: ri ? Math.max(1, Math.floor(Number(el('#qe-rq').value) || 1)) : null,
        rep, proof: el('#qe-pf').value, cap: cap > 0 ? cap : null, s, e, ord: el('#qe-ord').value === '' ? null : Number(el('#qe-ord').value), on: el('#qe-on').checked,
        days: Object.keys(daysObj).length ? daysObj : null, to: Object.keys(toObj).length ? toObj : null,
      });
      await B.set(`quests/${qid || B.newKey()}`, val);
      m.close();
      toast('저장했어요.', 'good');
    };
  }
})();

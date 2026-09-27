/* 판 — 자유 판(게시판)과 글쓰기 판(주제 글쓰기)
   자유 판: 모눈·칸·목록 배치, 색, 사진, 반응, 댓글, 선생님 확인 뒤 공개, 잠금, 대상 학생
   글쓰기 판: 선생님이 주제와 기간(일정)을 정하면 학생이 주제마다 한 편씩 쓰고,
             선생님이 「통과」(보상) 또는 「다시 쓰기」(의견)를 줌. 학생별 모아보기. 친구 글 공유(선택) */
(function () {
  const A = window.App, E = window.Econ, TC = window.Teacher;
  const { S, B, $, esc, toast, modal, confirmBox, fmtDate, fmtTime, nameOf, nameTag } = A;
  const COLORS = { w: '기본', y: '노랑', p: '분홍', b: '파랑', g: '초록', v: '보라' };
  const RX = { like: '👍', heart: '❤️', wow: '😮', laugh: '😂', clap: '👏' };
  const BGS = { dark: '밤하늘', blue: '파랑', purple: '보라', green: '초록', orange: '주황', pink: '분홍' };
  const LAYS = { grid: '모눈 (자유 배치)', cols: '칸 나누기', list: '목록' };

  // ── 공용 상태 ──
  const V = { bid: null, subs: [], posts: {}, pend: {}, cmts: {}, rxs: {}, topics: {}, writes: {}, allWrites: null, openTopic: null };
  let boardsSub = null;
  const imgCache = new Map();
  const isT = () => S.isTeacher;
  const who = (u) => (u === 'T' ? `${esc(S.teacherName || '선생님')} 👩‍🏫` : esc(S.users[u] ? nameOf(u) : '(나간 학생)'));
  const canSee = (b) => b && (isT() || (b.vis !== false && (!b.to || b.to[S.uid])));
  const stuIds = () => Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko'));
  const targets = (to) => stuIds().filter((u) => !to || to[u]);

  function ensureBoards() {
    if (!boardsSub && S.uid) boardsSub = B.on('boards', (v) => { S.boards = v || {}; A.render(); });
  }
  function close() { V.subs.forEach((u) => u()); Object.assign(V, { bid: null, subs: [], posts: {}, pend: {}, cmts: {}, rxs: {}, topics: {}, writes: {}, allWrites: null, openTopic: null }); }
  function open(bid) {
    close();
    const b = S.boards[bid];
    if (!b) return;
    V.bid = bid;
    const sub = (p, f, q) => V.subs.push(B.on(p, (v) => { f(v || {}); A.render(); }, q));
    if (b.ty === 'write') {
      sub(`btopic/${bid}`, (v) => (V.topics = v));
      if (isT()) sub(`bwrite/${bid}`, (v) => (V.allWrites = v));
      else {
        sub(`bwrite/${bid}/${S.uid}`, (v) => (V.writes = v));
        if (b.share) sub(`bwrite/${bid}`, (v) => (V.allWrites = v));
      }
    } else {
      sub(`bposts/${bid}`, (v) => (V.posts = v));
      sub(`bcmt/${bid}`, (v) => (V.cmts = v));
      sub(`brx/${bid}`, (v) => (V.rxs = v));
      if (isT()) sub(`bpend/${bid}`, (v) => (V.pend = v));
      else if (b.appr) sub(`bpend/${bid}`, (v) => (V.pend = v), { child: 'u', equalTo: S.uid });
    }
    A.render();
    window.scrollTo(0, 0);
  }
  // 사진은 필요할 때만 불러옴
  function loadImages(root) {
    root.querySelectorAll('img[data-src]').forEach((img) => {
      const p = img.dataset.src;
      if (imgCache.has(p)) { const v = imgCache.get(p); if (v) img.src = v; else img.remove(); return; }
      imgCache.set(p, '');
      B.get(p).then((v) => { imgCache.set(p, v || ''); root.querySelectorAll(`img[data-src="${p}"]`).forEach((x) => { if (v) x.src = v; else x.remove(); }); }).catch(() => imgCache.delete(p));
    });
  }
  let lastHtml = '', lastEl = null;
  function paint(main, html, onclick) {
    if (html === lastHtml && lastEl && main.contains(lastEl)) return;
    lastHtml = html;
    main.innerHTML = html;
    lastEl = main.firstElementChild;
    main.onclick = onclick;
    loadImages(main);
  }

  /* ───────────── 판 목록 ───────────── */
  function listHtml() {
    const list = Object.entries(S.boards || {}).filter(([, b]) => canSee(b)).sort((a, b) => (b[1].pin ? 1 : 0) - (a[1].pin ? 1 : 0) || (a[1].ord ?? 999) - (b[1].ord ?? 999) || (b[1].at || 0) - (a[1].at || 0));
    return `<div class="${isT() ? '' : 'panel'}"><div class="a-head"><h2>📌 판</h2><span class="muted">${isT() ? '자유 판(게시판)과 글쓰기 판(주제 글쓰기)을 만들어요' : '친구들과 생각을 나누는 곳'}</span><span class="sp"></span>
      ${isT() ? '<button class="btn" data-bn="free">+ 자유 판</button><button class="btn primary" data-bn="write">+ 글쓰기 판</button>' : ''}</div>
      ${list.length ? `<div class="board-list">${list.map(([bid, b]) => `<button class="board-card bg-${esc(b.bg || 'dark')}" data-bo="${esc(bid)}">
        <span class="bc-ic">${b.ty === 'write' ? '✏️' : '📌'}</span><b>${esc(b.t)}</b>${b.d ? `<span class="bc-d">${esc(b.d)}</span>` : ''}
        <span class="bc-tags">${b.ty === 'write' ? '<i>글쓰기 판</i>' : `<i>${esc((LAYS[b.lay] || '모눈').split(' ')[0])}</i>`}${b.pin ? '<i>📌 고정</i>' : ''}${isT() && b.vis === false ? '<i>숨김</i>' : ''}${b.lock ? '<i>🔒 잠김</i>' : ''}${b.appr ? '<i>확인 후 공개</i>' : ''}${b.to ? `<i>대상 ${Object.keys(b.to).length}명</i>` : ''}</span></button>`).join('')}</div>`
        : `<p class="empty">${isT() ? '아직 판이 없어요. 「+ 자유 판」이나 「+ 글쓰기 판」을 눌러 만들어요.' : '아직 열린 판이 없어요.'}</p>`}</div>`;
  }

  /* ───────────── 자유 판 ───────────── */
  function postCard(pid, p, pending) {
    const b = S.boards[V.bid];
    const mine = p.u === S.uid || (isT() && p.u === 'T');
    const rx = V.rxs[pid] || {};
    const counts = {};
    for (const k of Object.values(rx)) counts[k] = (counts[k] || 0) + 1;
    const cm = Object.keys(V.cmts[pid] || {}).length;
    return `<div class="bp-card c-${esc(p.clr || 'w')} ${pending ? 'pending' : ''}" data-pid="${esc(pid)}">
      ${pending ? '<span class="pill warn">선생님 확인 중</span>' : ''}${p.pin ? '<span class="bp-pin">📌</span>' : ''}
      ${p.ti ? `<b class="bp-ti">${esc(p.ti)}</b>` : ''}${p.tx ? `<div class="bp-tx">${esc(p.tx)}</div>` : ''}
      ${p.img ? `<img data-src="bimg/${esc(V.bid)}/${esc(pid)}" alt="" class="bp-img">` : ''}
      <div class="bp-meta"><span>${who(p.u)}</span><span>${fmtTime(p.t)}${p.e ? ' · 고침' : ''}</span></div>
      ${!pending && (b.rx !== false || b.cmt !== false) ? `<div class="bp-act">${b.rx !== false ? Object.entries(RX).map(([k, ic]) => `<button class="rx ${rx[S.uid] === k ? 'on' : ''}" data-rx="${esc(pid)}|${k}" ${isT() ? 'disabled' : ''}>${ic}${counts[k] ? `<small>${counts[k]}</small>` : ''}</button>`).join('') : ''}
        ${b.cmt !== false ? `<button class="rx cm" data-cm="${esc(pid)}">💬${cm ? `<small>${cm}</small>` : ''}</button>` : ''}</div>` : ''}
      ${mine || isT() ? `<div class="bp-tools">${mine ? `<button class="btn xs ghost" data-pe="${esc(pid)}|${pending ? 1 : 0}">고치기</button>` : ''}
        ${isT() && pending ? `<button class="btn xs good" data-pa="${esc(pid)}">공개</button>` : ''}
        ${isT() && !pending ? `<button class="btn xs ghost" data-pp="${esc(pid)}">${p.pin ? '고정 풀기' : '📌 고정'}</button>` : ''}
        <button class="btn xs ghost danger-txt" data-pd="${esc(pid)}|${pending ? 1 : 0}">지우기</button></div>` : ''}</div>`;
  }
  function sortPosts(entries, b) {
    const dir = b.sort === 'old' ? 1 : -1;
    return entries.sort((x, y) => (y[1].pin ? 1 : 0) - (x[1].pin ? 1 : 0) || dir * ((x[1].t || 0) - (y[1].t || 0)));
  }
  function freeHtml(b) {
    const posts = sortPosts(Object.entries(V.posts || {}).filter(([, p]) => p), b);
    const pend = sortPosts(Object.entries(V.pend || {}).filter(([, p]) => p), b);
    const writers = new Set([...posts, ...pend].map(([, p]) => p.u).filter((u) => S.users[u]));
    const tg = targets(b.to);
    const cards = (list, pending) => list.map(([pid, p]) => postCard(pid, p, pending)).join('');
    let body;
    if (b.lay === 'cols') {
      const cols = (b.cols && b.cols.length ? b.cols : ['첫째 칸', '둘째 칸', '셋째 칸']);
      body = `<div class="bp-cols" style="--n:${cols.length}">${cols.map((c, i) => `<div class="bp-col"><div class="bp-col-h">${esc(c)}</div>
        ${cards(pend.filter(([, p]) => (p.col || 0) === i), true)}${cards(posts.filter(([, p]) => (p.col || 0) === i || (i === 0 && (p.col || 0) >= cols.length)), false)}</div>`).join('')}</div>`;
    } else body = `<div class="${b.lay === 'list' ? 'bp-list' : 'bp-grid'}">${cards(pend, true)}${cards(posts, false)}</div>`;
    const canPost = isT() || b.lock !== true;
    return `<div class="board-view bg-${esc(b.bg || 'dark')}"><div class="a-head bv-head"><button class="btn sm ghost" data-back="1">← 판 목록</button><h2>${esc(b.t)}</h2>
        <span class="muted">${b.d ? esc(b.d) : ''}</span><span class="sp"></span>
        <span class="pill">참여 ${[...writers].filter((u) => tg.includes(u)).length}/${tg.length}</span>
        ${isT() ? `<button class="btn sm" data-bs="${esc(V.bid)}">⚙️ 판 설정</button>` : ''}
        ${canPost ? '<button class="btn sm primary" data-pn="1">+ 게시물 붙이기</button>' : '<span class="pill">🔒 선생님이 잠갔어요</span>'}</div>
      ${!isT() && b.appr ? '<p class="note">이 판은 선생님이 확인한 뒤 친구들에게 보여요.</p>' : ''}
      ${isT() && pend.length ? `<p class="note">확인을 기다리는 글 ${pend.length}개 — 「공개」를 누르면 학생들에게 보여요.</p>` : ''}
      ${posts.length || pend.length ? body : '<p class="empty">아직 게시물이 없어요. 첫 글을 붙여 보세요!</p>'}</div>`;
  }
  function postDialog(pid, pending) {
    const b = S.boards[V.bid];
    const src = pid ? (pending ? V.pend : V.posts)[pid] : null;
    const p = src || { clr: 'w', col: 0 };
    let img = null, dropImg = false;
    const cols = b.lay === 'cols' ? (b.cols && b.cols.length ? b.cols : ['첫째 칸', '둘째 칸', '셋째 칸']) : null;
    const m = modal(`<h3>${pid ? '게시물 고치기' : '게시물 붙이기'} · ${esc(b.t)}</h3>
      <label>제목 (선택)<input id="pt" maxlength="60" value="${esc(p.ti || '')}"></label>
      <label>내용<textarea id="px" rows="6" maxlength="2000">${esc(p.tx || '')}</textarea></label>
      ${cols ? `<label>칸<select id="pc">${cols.map((c, i) => `<option value="${i}" ${(p.col || 0) === i ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
      <div class="chips" id="pclr">${Object.entries(COLORS).map(([k, n]) => `<button data-c="${k}" class="clr-chip c-${k} ${(p.clr || 'w') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${b.img !== false ? `<div class="photo-pick"><div class="row-flex"><button class="btn sm" id="pi">📷 사진 ${p.img ? '바꾸기' : '넣기'}</button>${p.img ? '<button class="btn sm ghost" id="pir">사진 빼기</button>' : ''}</div><div id="piv">${p.img ? `<img data-src="bimg/${esc(V.bid)}/${esc(pid)}" alt="" class="proof-img">` : ''}</div></div>` : ''}
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>${pid ? '저장' : '붙이기'}</button></div>`, { wide: true });
    loadImages(m.el);
    let clr = p.clr || 'w';
    m.el.querySelector('#pclr').onclick = (e) => { const c = e.target.closest('[data-c]'); if (!c) return; clr = c.dataset.c; m.el.querySelectorAll('#pclr [data-c]').forEach((x) => x.classList.toggle('on', x === c)); };
    const pi = m.el.querySelector('#pi');
    if (pi) pi.onclick = async () => {
      const f = await window.Media.pick();
      if (!f) return;
      try { m.el.querySelector('#piv').textContent = '사진 줄이는 중…'; img = await window.Media.compress(f); dropImg = false; m.el.querySelector('#piv').innerHTML = `<img src="${img}" alt="" class="proof-img">`; }
      catch (err) { m.el.querySelector('#piv').textContent = err.message; img = null; }
    };
    const pir = m.el.querySelector('#pir');
    if (pir) pir.onclick = () => { dropImg = true; img = null; m.el.querySelector('#piv').innerHTML = '<span class="muted">사진을 뺄게요</span>'; };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const ti = m.el.querySelector('#pt').value.trim(), tx = m.el.querySelector('#px').value.trim();
      const hasImg = !!img || (!!p.img && !dropImg);
      if (!ti && !tx && !hasImg) return toast('제목이나 내용, 사진 중 하나는 있어야 해요.', 'bad');
      const key = pid || B.newKey();
      const toPend = pid ? pending : !isT() && b.appr;
      const base = `${toPend ? 'bpend' : 'bposts'}/${V.bid}/${key}`;
      const val = { u: pid ? p.u : isT() ? 'T' : S.uid, t: pid ? p.t : B.ts(), ti: ti || null, tx: tx || null, clr: clr !== 'w' ? clr : null, img: hasImg || null, col: cols ? Number(m.el.querySelector('#pc').value) : null };
      if (pid) { val.e = B.ts(); if (p.pin && !toPend) val.pin = true; }
      const upd = { [base]: val };
      if (img) upd[`bimg/${V.bid}/${key}`] = img;
      else if (dropImg) upd[`bimg/${V.bid}/${key}`] = null;
      e.target.disabled = true;
      try { await B.update('', upd); imgCache.delete(`bimg/${V.bid}/${key}`); m.close(); toast(toPend && !pid ? '붙였어요! 선생님이 확인하면 친구들에게 보여요.' : '저장했어요.', 'good'); }
      catch (err) { e.target.disabled = false; toast(/권한/.test(err.message) ? '지금은 이 판에 쓸 수 없어요.' : err.message, 'bad'); }
    };
  }
  function commentsDialog(pid) {
    const b = S.boards[V.bid];
    const m = modal(`<div id="cmv"></div><div class="cm-new"><input id="cmi" maxlength="300" placeholder="댓글을 적어요"><button class="btn primary" id="cms">달기</button></div><div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true, onClose: () => { live = null; } });
    const draw = () => {
      const p = V.posts[pid];
      if (!p) { m.close(); return; }
      const list = Object.entries(V.cmts[pid] || {}).sort((x, y) => (x[1].t || 0) - (y[1].t || 0));
      m.el.querySelector('#cmv').innerHTML = `<div class="bp-card c-${esc(p.clr || 'w')} flat">${p.ti ? `<b class="bp-ti">${esc(p.ti)}</b>` : ''}${p.tx ? `<div class="bp-tx">${esc(p.tx)}</div>` : ''}<div class="bp-meta"><span>${who(p.u)}</span><span>${fmtTime(p.t)}</span></div></div>
        <h4>💬 댓글 ${list.length}</h4><ul class="rows cm-list">${list.map(([cid, c]) => `<li><b>${who(c.u)}</b><span class="cm-tx">${esc(c.tx)}</span><span class="right muted" style="font-size:.8em">${fmtTime(c.t)}${c.u === S.uid || isT() ? ` <button class="btn xs ghost" data-cd="${esc(cid)}">지우기</button>` : ''}</span></li>`).join('') || '<li class="empty">첫 댓글을 달아 보세요</li>'}</ul>`;
    };
    live = draw;
    draw();
    const inp = m.el.querySelector('#cmi');
    const send = async () => {
      const tx = inp.value.trim();
      if (!tx) return;
      if (b.cmt === false && !isT()) return toast('댓글이 꺼진 판이에요.', 'bad');
      try { await B.set(`bcmt/${V.bid}/${pid}/${B.newKey()}`, { u: isT() ? 'T' : S.uid, t: B.ts(), tx }); inp.value = ''; }
      catch (err) { toast(err.message, 'bad'); }
    };
    m.el.querySelector('#cms').onclick = send;
    inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) send(); };
    m.el.querySelector('#cmv').onclick = async (e) => {
      const d = e.target.closest('[data-cd]');
      if (d && (await confirmBox('댓글 지우기', '이 댓글을 지울까요?', '지우기', true))) await B.remove(`bcmt/${V.bid}/${pid}/${d.dataset.cd}`).catch((err) => toast(err.message, 'bad'));
    };
  }
  let live = null;
  async function onFree(e) {
    const t = e.target;
    const rx = t.closest('[data-rx]');
    if (rx) {
      const [pid, k] = rx.dataset.rx.split('|');
      const cur = (V.rxs[pid] || {})[S.uid];
      await B.set(`brx/${V.bid}/${pid}/${S.uid}`, cur === k ? null : k).catch((err) => toast(err.message, 'bad'));
      return;
    }
    const cm = t.closest('[data-cm]');
    if (cm) return commentsDialog(cm.dataset.cm);
    if (t.closest('[data-pn]')) return postDialog(null, false);
    const pe = t.closest('[data-pe]');
    if (pe) { const [pid, pend] = pe.dataset.pe.split('|'); return postDialog(pid, pend === '1'); }
    const pd = t.closest('[data-pd]');
    if (pd) {
      const [pid, pend] = pd.dataset.pd.split('|');
      if (!(await confirmBox('게시물 지우기', '이 게시물을 지울까요? 댓글과 반응도 함께 지워져요.', '지우기', true))) return;
      const upd = { [`${pend === '1' ? 'bpend' : 'bposts'}/${V.bid}/${pid}`]: null, [`bimg/${V.bid}/${pid}`]: null };
      if (pend !== '1') { upd[`bcmt/${V.bid}/${pid}`] = null; upd[`brx/${V.bid}/${pid}`] = null; }
      await B.update('', upd).catch((err) => toast(err.message, 'bad'));
      return;
    }
    const pa = t.closest('[data-pa]');
    if (pa) { const p = V.pend[pa.dataset.pa]; await B.update('', { [`bpend/${V.bid}/${pa.dataset.pa}`]: null, [`bposts/${V.bid}/${pa.dataset.pa}`]: p }); toast('공개했어요.', 'good'); return; }
    const pp = t.closest('[data-pp]');
    if (pp) { const p = V.posts[pp.dataset.pp]; await B.set(`bposts/${V.bid}/${pp.dataset.pp}/pin`, p.pin ? null : true); }
  }

  /* ───────────── 글쓰기 판 ───────────── */
  function topicState(tp) {
    const now = B.now();
    if (tp.s && now < tp.s) return ['soon', '예정'];
    if (tp.e && now > tp.e) return ['end', '마감'];
    return ['open', '진행 중'];
  }
  const ST = { wait: ['확인 중', 'pending'], ok: ['통과', 'approved'], back: ['다시 쓰기', 'rejected'] };
  const period = (tp) => `${tp.s ? fmtTime(tp.s) : ''} ~ ${tp.e ? fmtTime(tp.e) : ''}`;
  function sortTopics(obj) {
    const rank = { open: 0, soon: 1, end: 2 };
    return Object.entries(obj || {}).filter(([, tp]) => tp).sort((a, b) => rank[topicState(a[1])[0]] - rank[topicState(b[1])[0]] || (a[1].ord ?? 999) - (b[1].ord ?? 999) || (b[1].s || 0) - (a[1].s || 0));
  }
  function writeHtmlStudent(b) {
    const list = sortTopics(V.topics).filter(([, tp]) => !tp.to || tp.to[S.uid]);
    return `<div class="board-view bg-${esc(b.bg || 'dark')}"><div class="a-head bv-head"><button class="btn sm ghost" data-back="1">← 판 목록</button><h2>✏️ ${esc(b.t)}</h2><span class="muted">${b.d ? esc(b.d) : ''}</span></div>
      ${list.length ? `<div class="topic-list">${list.map(([tid, tp]) => {
        const [sk, sn] = topicState(tp);
        const w = V.writes[tid];
        const st = w ? ST[w.st] : null;
        const rw = tp.rw ?? b.rw;
        return `<div class="topic-card ${sk}"><div class="tc-top"><span class="pill ${sk === 'open' ? 'good' : sk === 'soon' ? '' : 'warn'}">${sn}</span><b>${esc(tp.t)}</b>${st ? `<span class="status ${st[1]}">${st[0]}</span>` : ''}</div>
          ${tp.d ? `<div class="tc-d">${esc(tp.d)}</div>` : ''}
          <div class="muted tc-meta">${period(tp)}${tp.min ? ` · ${tp.min}자 이상` : ''}${rw ? ` · 통과하면 💰 ${E.won(rw)}` : ''}</div>
          ${w && w.fb ? `<div class="tc-fb">💬 선생님: ${esc(w.fb)}</div>` : ''}
          <div class="tc-foot">${sk === 'open' && (!w || w.st !== 'ok') ? `<button class="btn sm primary" data-tw="${esc(tid)}">${!w ? '✏️ 쓰기' : w.st === 'back' ? '다시 쓰기' : '고치기'}</button>` : ''}
            ${w ? `<button class="btn sm ghost" data-tv="${esc(tid)}">내 글 보기</button>` : ''}
            ${b.share ? `<button class="btn sm ghost" data-tf="${esc(tid)}">친구 글</button>` : ''}</div></div>`;
      }).join('')}</div>` : '<p class="empty">아직 주제가 없어요.</p>'}</div>`;
  }
  function writeDialog(tid) {
    const b = S.boards[V.bid], tp = V.topics[tid];
    const w = V.writes[tid] || null;
    let img = null;
    const m = modal(`<h3>✏️ ${esc(tp.t)}</h3>${tp.d ? `<div class="tc-d" style="margin-bottom:10px">${esc(tp.d)}</div>` : ''}
      ${w && w.fb ? `<div class="tc-fb">💬 선생님: ${esc(w.fb)}</div>` : ''}
      <label>제목 (선택)<input id="wt" maxlength="60" value="${esc((w && w.ti) || '')}"></label>
      <label>글<textarea id="wx" rows="12" maxlength="5000">${esc((w && w.tx) || '')}</textarea><small id="wn" class="muted"></small></label>
      ${tp.img ? `<div class="photo-pick"><button class="btn sm" id="wi">📷 사진 ${w && w.img ? '바꾸기' : '넣기'}</button><div id="wiv">${w && w.img ? `<img data-src="bwimg/${esc(V.bid)}/${esc(S.uid)}/${esc(tid)}" class="proof-img" alt="">` : ''}</div></div>` : ''}
      <div class="foot"><span class="muted" style="margin-right:auto">${period(tp)}</span><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>${w ? '다시 제출' : '제출'}</button></div>`, { wide: true, dismissable: false });
    loadImages(m.el);
    const tx = m.el.querySelector('#wx');
    const count = () => { m.el.querySelector('#wn').textContent = `${tx.value.trim().length}자${tp.min ? ` / ${tp.min}자 이상` : ''}`; };
    tx.oninput = count;
    count();
    const wi = m.el.querySelector('#wi');
    if (wi) wi.onclick = async () => {
      const f = await window.Media.pick();
      if (!f) return;
      try { m.el.querySelector('#wiv').textContent = '사진 줄이는 중…'; img = await window.Media.compress(f); m.el.querySelector('#wiv').innerHTML = `<img src="${img}" class="proof-img" alt="">`; }
      catch (err) { m.el.querySelector('#wiv').textContent = err.message; }
    };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const text = tx.value.trim();
      if (text.length < Math.max(2, tp.min || 0)) return toast(tp.min ? `${tp.min}자 이상 써 주세요.` : '글을 써 주세요.', 'bad');
      const val = { tx: text, ti: m.el.querySelector('#wt').value.trim() || null, st: 'wait', t: w ? w.t : B.ts(), e: B.ts(), fb: (w && w.fb) || null, img: img || (w && w.img) ? true : null };
      const upd = { [`bwrite/${V.bid}/${S.uid}/${tid}`]: val };
      if (img) upd[`bwimg/${V.bid}/${S.uid}/${tid}`] = img;
      e.target.disabled = true;
      try { await B.update('', upd); imgCache.delete(`bwimg/${V.bid}/${S.uid}/${tid}`); m.close(); toast('제출했어요! 선생님이 읽고 확인해 줄 거예요.', 'good'); }
      catch (err) { e.target.disabled = false; toast(/권한/.test(err.message) ? '지금은 제출할 수 없어요. (주제 기간을 확인해 주세요)' : err.message, 'bad'); }
    };
  }
  function writingView(tid, uid, w, withTools) {
    const tp = V.topics[tid] || {};
    const st = ST[w.st] || ['', ''];
    return `<div class="writing"><div class="wr-head"><b>${esc(w.ti || tp.t || '')}</b><span class="status ${st[1]}">${st[0]}</span><span class="muted" style="font-size:.85em">${fmtTime(w.e || w.t)} · ${(w.tx || '').length}자</span></div>
      <div class="wr-tx">${esc(w.tx || '')}</div>${w.img ? `<img data-src="bwimg/${esc(V.bid)}/${esc(uid)}/${esc(tid)}" class="proof-img" alt="">` : ''}
      ${w.fb && !withTools ? `<div class="tc-fb">💬 선생님: ${esc(w.fb)}</div>` : ''}</div>`;
  }
  function viewMine(tid) {
    const m = modal(`<h3>내 글 · ${esc(V.topics[tid].t)}</h3>${writingView(tid, S.uid, V.writes[tid], false)}<div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
    loadImages(m.el);
  }
  function viewFriends(tid) {
    const all = V.allWrites || {};
    const list = Object.entries(all).map(([u, byT]) => [u, byT && byT[tid]]).filter(([u, w]) => w && w.st === 'ok' && u !== S.uid && S.users[u]);
    const m = modal(`<h3>친구 글 · ${esc(V.topics[tid].t)}</h3><p class="note" style="margin-top:0">선생님이 통과시킨 글만 보여요.</p>
      ${list.length ? list.map(([u, w]) => `<div class="friend-w"><div class="muted">${esc(nameOf(u))}</div>${writingView(tid, u, w, true)}</div>`).join('') : '<p class="empty">아직 통과한 친구 글이 없어요</p>'}
      <div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
    loadImages(m.el);
  }
  async function onWriteStudent(e) {
    const t = e.target;
    const w = t.closest('[data-tw]');
    if (w) return writeDialog(w.dataset.tw);
    const v = t.closest('[data-tv]');
    if (v) return viewMine(v.dataset.tv);
    const f = t.closest('[data-tf]');
    if (f) return viewFriends(f.dataset.tf);
  }

  // 선생님: 글쓰기 판
  function writeHtmlTeacher(b) {
    const list = sortTopics(V.topics);
    const all = V.allWrites || {};
    return `<div class="board-view bg-${esc(b.bg || 'dark')}"><div class="a-head bv-head"><button class="btn sm ghost" data-back="1">← 판 목록</button><h2>✏️ ${esc(b.t)}</h2><span class="muted">${b.d ? esc(b.d) : ''}</span><span class="sp"></span>
        <button class="btn sm" data-bs="${esc(V.bid)}">⚙️ 판 설정</button><button class="btn sm" data-wstu="1">👤 학생별 모아보기</button><button class="btn sm primary" data-tn="1">+ 주제 (일정)</button></div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>상태</th><th>주제</th><th>기간</th><th class="num">통과</th><th class="num">확인 대기</th><th class="num">다시 쓰기</th><th class="num">안 씀</th><th></th></tr></thead><tbody>
        ${list.map(([tid, tp]) => {
          const [sk, sn] = topicState(tp);
          const tg = targets(tp.to || b.to);
          const sts = tg.map((u) => (all[u] && all[u][tid] ? all[u][tid].st : ''));
          const n = (k) => sts.filter((s) => s === k).length;
          return `<tr><td><span class="pill ${sk === 'open' ? 'good' : sk === 'soon' ? '' : 'warn'}">${sn}</span></td><td><b>${esc(tp.t)}</b>${tp.d ? `<div class="muted f-sub">${esc(tp.d.slice(0, 60))}${tp.d.length > 60 ? '…' : ''}</div>` : ''}</td>
            <td class="muted nowrap">${period(tp)}</td><td class="num">${n('ok')}/${tg.length}</td><td class="num">${n('wait') ? `<span class="pill warn">${n('wait')}</span>` : 0}</td><td class="num">${n('back')}</td><td class="num">${n('')}</td>
            <td><div class="row-actions"><button class="btn xs primary" data-tr="${esc(tid)}">글 보기</button><button class="btn xs" data-te="${esc(tid)}">수정</button><button class="btn xs danger" data-td="${esc(tid)}">삭제</button></div></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="empty">「+ 주제 (일정)」로 첫 주제를 만들어요. 주제마다 쓸 수 있는 기간을 정할 수 있어요.</p>'}</div>`;
  }
  function topicDialog(tid) {
    const b = S.boards[V.bid];
    const tp = tid ? V.topics[tid] : null;
    const pad = (n) => String(n).padStart(2, '0');
    const dt = (ts, h, mi) => { const d = ts ? new Date(ts) : new Date(); if (!ts) d.setHours(h, mi, 0, 0); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const tgt = new Set(Object.keys((tp && tp.to) || {}));
    const m = modal(`<h3>${tid ? '주제 수정' : '새 주제'} · ${esc(b.t)}</h3>
      <label>주제<input id="tt" maxlength="60" value="${esc((tp && tp.t) || '')}" placeholder="예: 가을에 가장 기억에 남는 일"></label>
      <label>안내 (학생에게 보여요)<textarea id="td" rows="3" maxlength="500">${esc((tp && tp.d) || '')}</textarea></label>
      <div class="form-grid"><label>시작<input id="ts" type="datetime-local" value="${dt(tp && tp.s, 9, 0)}"></label><label>마감<input id="te" type="datetime-local" value="${dt(tp && tp.e, 23, 59)}"></label>
        <label>최소 글자 수 <small>비우면 없음</small><input id="tm" type="number" min="0" value="${(tp && tp.min) || ''}"></label>
        <label>통과 보상 <small>비우면 판 기본값 ${E.won(b.rw || 0)}</small><input id="trw" type="number" min="0" step="1000" value="${tp && tp.rw !== undefined && tp.rw !== null ? tp.rw : ''}"></label></div>
      <label class="chk-line"><input type="checkbox" class="chk" id="ti" ${tp && tp.img ? 'checked' : ''}> 사진 넣기 허용</label>
      <h4>대상 <span class="muted" style="font-weight:400">아무도 고르지 않으면 판의 대상 전체</span></h4>
      <div class="stu-grid" id="tto">${targets(b.to).map((u) => `<button data-tu="${u}" class="${tgt.has(u) ? 'sel' : ''}"><span class="nm">${esc(nameOf(u))}</span></button>`).join('')}</div>
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`, { wide: true });
    m.el.querySelector('#tto').onclick = (e) => { const x = e.target.closest('[data-tu]'); if (!x) return; tgt.has(x.dataset.tu) ? tgt.delete(x.dataset.tu) : tgt.add(x.dataset.tu); x.classList.toggle('sel', tgt.has(x.dataset.tu)); };
    m.el.querySelector('[data-ok]').onclick = async () => {
      const t = m.el.querySelector('#tt').value.trim();
      if (!t) return toast('주제를 적어 주세요.', 'bad');
      const s = new Date(m.el.querySelector('#ts').value).getTime(), e = new Date(m.el.querySelector('#te').value).getTime();
      if (!(s < e)) return toast('시작이 마감보다 빨라야 해요.', 'bad');
      const to = {};
      for (const u of tgt) if (S.users[u]) to[u] = true;
      const rwv = m.el.querySelector('#trw').value.trim();
      await B.set(`btopic/${V.bid}/${tid || B.newKey()}`, Object.assign({}, tp || {}, {
        t, d: m.el.querySelector('#td').value.trim() || null, s, e, min: Math.max(0, Math.floor(Number(m.el.querySelector('#tm').value) || 0)) || null,
        rw: rwv === '' ? null : Math.max(0, Math.floor(Number(rwv) || 0)), img: m.el.querySelector('#ti').checked || null, to: Object.keys(to).length ? to : null,
      }));
      m.close();
      toast('저장했어요.', 'good');
    };
  }
  // 글 확인: 통과(+보상) / 다시 쓰기(의견) / 의견만 저장
  function reviewDialog(tid, uid) {
    const b = S.boards[V.bid], tp = V.topics[tid];
    const w = ((V.allWrites || {})[uid] || {})[tid];
    if (!w) return;
    const rw = tp.rw ?? b.rw ?? 0;
    const m = modal(`<h3>${nameTag(uid)} · ${esc(tp.t)}</h3>${writingView(tid, uid, w, true)}
      <label>선생님 의견 (학생에게 보여요)<textarea id="fb" rows="3" maxlength="500">${esc(w.fb || '')}</textarea></label>
      <div class="foot"><button class="btn ghost" data-close>닫기</button><button class="btn" data-r="fb">의견만 저장</button>
        ${w.st !== 'ok' ? `<button class="btn danger" data-r="back">다시 쓰기</button><button class="btn good" data-r="ok">통과${rw ? ` + 💰 ${E.won(rw)}` : ''}</button>` : '<span class="pill good">이미 통과</span>'}</div>`, { wide: true });
    loadImages(m.el);
    m.el.onclick = async (e) => {
      const r = e.target.closest('[data-r]');
      if (!r) return;
      const fb = m.el.querySelector('#fb').value.trim() || null;
      const base = `bwrite/${V.bid}/${uid}/${tid}`;
      r.disabled = true;
      if (r.dataset.r === 'fb') { await B.set(base + '/fb', fb); toast('의견을 저장했어요.', 'good'); }
      else if (r.dataset.r === 'back') { await B.update('', { [base + '/st']: 'back', [base + '/fb']: fb, [base + '/rt']: B.ts() }); toast('다시 쓰기로 돌려보냈어요.'); }
      else {
        const upd = { [base + '/st']: 'ok', [base + '/fb']: fb, [base + '/rt']: B.ts() };
        if (rw) upd[base + '/lid'] = E.addOp(upd, uid, { k: 'write', a: rw, n: tp.t, m: b.t });
        if (!(await E.commit(upd, rw ? `통과! ${nameOf(uid)}에게 ${E.won(rw)}을 보냈어요.` : '통과했어요.'))) { r.disabled = false; return; }
      }
      m.close();
    };
  }
  function topicReview(tid) {
    const b = S.boards[V.bid];
    const tp = V.topics[tid];
    const m = modal('<div id="trv"></div>', { wide: true, onClose: () => { live = null; } });
    const draw = () => {
      const all = V.allWrites || {};
      const rows = targets(tp.to || b.to).map((u) => {
        const w = all[u] && all[u][tid];
        const st = w ? ST[w.st] : null;
        return `<tr><td>${nameTag(u)}</td><td>${st ? `<span class="status ${st[1]}">${st[0]}</span>` : '<span class="muted">안 씀</span>'}</td><td class="num">${w ? `${(w.tx || '').length}자` : ''}</td><td class="muted">${w ? fmtTime(w.e || w.t) : ''}</td>
          <td>${w ? `<button class="btn xs ${w.st === 'wait' ? 'primary' : ''}" data-rv="${u}">${w.st === 'wait' ? '확인하기' : '보기'}</button>` : ''}</td></tr>`;
      }).join('');
      m.el.querySelector('#trv').innerHTML = `<h3>${esc(tp.t)} <span class="muted" style="font-size:.7em">${period(tp)}</span></h3>
        <div class="tbl-wrap" style="max-height:60vh"><table class="tbl"><thead><tr><th>학생</th><th>상태</th><th class="num">글자</th><th>제출</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="foot"><button class="btn" data-close>닫기</button></div>`;
    };
    live = draw;
    draw();
    m.el.querySelector('#trv').onclick = (e) => { const r = e.target.closest('[data-rv]'); if (r) reviewDialog(tid, r.dataset.rv); };
  }
  function byStudent() {
    const b = S.boards[V.bid];
    let u = targets(b.to)[0];
    const m = modal(`<h3>👤 학생별 모아보기 · ${esc(b.t)}</h3><select id="wsu" style="width:auto">${targets(b.to).map((x) => `<option value="${x}">${esc(nameOf(x))}</option>`).join('')}</select><div id="wsv" style="margin-top:12px"></div><div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
    const draw = () => {
      const mine = (V.allWrites || {})[u] || {};
      const list = sortTopics(V.topics).filter(([tid]) => mine[tid]);
      m.el.querySelector('#wsv').innerHTML = list.length ? list.map(([tid]) => `<div class="friend-w">${writingView(tid, u, mine[tid], false)}<div class="foot" style="margin-top:6px"><button class="btn xs" data-rv="${esc(tid)}">확인·의견</button></div></div>`).join('') : '<p class="empty">아직 쓴 글이 없어요</p>';
      loadImages(m.el);
    };
    m.el.querySelector('#wsu').onchange = (e) => { u = e.target.value; draw(); };
    m.el.querySelector('#wsv').onclick = (e) => { const r = e.target.closest('[data-rv]'); if (r) reviewDialog(r.dataset.rv, u); };
    draw();
  }
  async function onWriteTeacher(e) {
    const t = e.target;
    if (t.closest('[data-tn]')) return topicDialog(null);
    if (t.closest('[data-wstu]')) return byStudent();
    const te = t.closest('[data-te]');
    if (te) return topicDialog(te.dataset.te);
    const tr = t.closest('[data-tr]');
    if (tr) return topicReview(tr.dataset.tr);
    const td = t.closest('[data-td]');
    if (td) {
      if (!(await confirmBox('주제 삭제', `「${esc(V.topics[td.dataset.td].t)}」 주제와 학생들이 쓴 글을 모두 지울까요?`, '삭제', true))) return;
      const upd = { [`btopic/${V.bid}/${td.dataset.td}`]: null };
      for (const u of Object.keys(V.allWrites || {})) { upd[`bwrite/${V.bid}/${u}/${td.dataset.td}`] = null; upd[`bwimg/${V.bid}/${u}/${td.dataset.td}`] = null; }
      await B.update('', upd);
    }
  }

  /* ───────────── 판 설정 (선생님) ───────────── */
  function boardDialog(bid, ty) {
    const b = bid ? S.boards[bid] : { ty, t: '', lay: 'grid', bg: ty === 'write' ? 'purple' : 'blue', vis: true, img: true, cmt: true, rx: true };
    const write = b.ty === 'write';
    const tgt = new Set(Object.keys(b.to || {}));
    const m = modal(`<h3>${bid ? '판 설정' : write ? '새 글쓰기 판' : '새 자유 판'}</h3>
      <div class="form-grid"><label>이름<input id="bt" maxlength="40" value="${esc(b.t)}" placeholder="${write ? '예: 국어 주제 글쓰기' : '예: 우리 반 아이디어'}"></label>
        <label>배경<select id="bbg">${Object.entries(BGS).map(([k, n]) => `<option value="${k}" ${(b.bg || 'dark') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        ${write ? `<label>통과 보상 기본값<input id="brw" type="number" min="0" step="1000" value="${b.rw || ''}" placeholder="0"></label>` : `<label>배치<select id="blay">${Object.entries(LAYS).map(([k, n]) => `<option value="${k}" ${(b.lay || 'grid') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>정렬<select id="bsort"><option value="new" ${b.sort !== 'old' ? 'selected' : ''}>새 글이 먼저</option><option value="old" ${b.sort === 'old' ? 'selected' : ''}>오래된 글이 먼저</option></select></label>`}
        <label>순서<input id="bord" type="number" value="${b.ord ?? ''}"></label></div>
      <label>설명<input id="bd" maxlength="200" value="${esc(b.d || '')}"></label>
      ${write ? '' : `<label id="bcols-l">칸 이름 (쉼표로 나눔, 칸 나누기 배치)<input id="bcols" value="${esc((b.cols || ['생각', '질문', '정리']).join(', '))}"></label>`}
      <div class="chk-grid">
        <label class="chk-line"><input type="checkbox" class="chk" id="bvis" ${b.vis !== false ? 'checked' : ''}> 학생에게 보이기</label>
        <label class="chk-line"><input type="checkbox" class="chk" id="bpin" ${b.pin ? 'checked' : ''}> 목록 맨 위에 고정</label>
        ${write ? `<label class="chk-line"><input type="checkbox" class="chk" id="bshare" ${b.share ? 'checked' : ''}> 통과한 글을 친구들도 보기</label>` : `
        <label class="chk-line"><input type="checkbox" class="chk" id="block" ${b.lock ? 'checked' : ''}> 학생 글쓰기 잠그기</label>
        <label class="chk-line"><input type="checkbox" class="chk" id="bappr" ${b.appr ? 'checked' : ''}> 선생님이 확인한 뒤 공개</label>
        <label class="chk-line"><input type="checkbox" class="chk" id="bimg" ${b.img !== false ? 'checked' : ''}> 사진 허용</label>
        <label class="chk-line"><input type="checkbox" class="chk" id="bcmt" ${b.cmt !== false ? 'checked' : ''}> 댓글</label>
        <label class="chk-line"><input type="checkbox" class="chk" id="brx" ${b.rx !== false ? 'checked' : ''}> 반응(👍❤️😮😂👏)</label>`}
      </div>
      <h4>대상 <span class="muted" style="font-weight:400">아무도 고르지 않으면 반 전체</span></h4>
      <div class="stu-grid" id="bto">${stuIds().map((u) => `<button data-tu="${u}" class="${tgt.has(u) ? 'sel' : ''}"><span class="nm">${esc(nameOf(u))}</span></button>`).join('')}</div>
      <div class="foot">${bid ? '<button class="btn danger" data-bdel="1" style="margin-right:auto">판 삭제</button>' : ''}<button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>저장</button></div>`, { wide: true });
    const el = (id) => m.el.querySelector(id);
    const chk = (id) => { const x = el(id); return x ? x.checked : undefined; };
    el('#bto').onclick = (e) => { const x = e.target.closest('[data-tu]'); if (!x) return; tgt.has(x.dataset.tu) ? tgt.delete(x.dataset.tu) : tgt.add(x.dataset.tu); x.classList.toggle('sel', tgt.has(x.dataset.tu)); };
    const del = el('[data-bdel]');
    if (del) del.onclick = async () => {
      if (!(await confirmBox('판 삭제', `「${esc(b.t)}」 판과 안의 글·사진·댓글을 모두 지울까요? 되돌릴 수 없어요.`, '삭제', true))) return;
      const upd = {};
      for (const p of ['boards', 'bposts', 'bpend', 'bimg', 'bcmt', 'brx', 'btopic', 'bwrite', 'bwimg']) upd[`${p}/${bid}`] = null;
      await B.update('', upd);
      m.close();
      if (V.bid === bid) close();
      toast('판을 지웠어요.');
    };
    el('[data-ok]').onclick = async () => {
      const t = el('#bt').value.trim();
      if (!t) return toast('이름을 적어 주세요.', 'bad');
      const to = {};
      for (const u of tgt) if (S.users[u]) to[u] = true;
      const val = Object.assign({}, b, {
        t, d: el('#bd').value.trim() || null, bg: el('#bbg').value, ord: el('#bord').value === '' ? null : Number(el('#bord').value),
        vis: chk('#bvis'), pin: chk('#bpin') || null, to: Object.keys(to).length ? to : null, at: b.at || B.ts(),
      });
      if (write) Object.assign(val, { ty: 'write', share: chk('#bshare') || null, rw: Math.max(0, Math.floor(Number(el('#brw').value) || 0)) || null });
      else Object.assign(val, {
        ty: 'free', lay: el('#blay').value, sort: el('#bsort').value, lock: chk('#block') || null, appr: chk('#bappr') || null,
        img: chk('#bimg'), cmt: chk('#bcmt'), rx: chk('#brx'), cols: el('#bcols').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6),
      });
      const key = bid || B.newKey();
      await B.set(`boards/${key}`, val);
      m.close();
      toast('저장했어요.', 'good');
      if (!bid) open(key);
    };
  }

  /* ───────────── 그리기 ───────────── */
  function render(main) {
    ensureBoards();
    if (V.bid && !canSee(S.boards[V.bid])) close();
    const b = V.bid && S.boards[V.bid];
    if (live) live();
    if (!b) return paint(main, listHtml(), onList);
    if (b.ty === 'write') return paint(main, isT() ? writeHtmlTeacher(b) : writeHtmlStudent(b), (e) => { if (!common(e)) (isT() ? onWriteTeacher : onWriteStudent)(e); });
    paint(main, freeHtml(b), (e) => { if (!common(e)) onFree(e); });
  }
  function common(e) {
    if (e.target.closest('[data-back]')) { close(); A.render(); return true; }
    const s = e.target.closest('[data-bs]');
    if (s) { boardDialog(s.dataset.bs); return true; }
    return false;
  }
  function onList(e) {
    const o = e.target.closest('[data-bo]');
    if (o) return open(o.dataset.bo);
    const n = e.target.closest('[data-bn]');
    if (n) boardDialog(null, n.dataset.bn);
  }

  window.BoardStudent = {
    handles: (tab) => tab === 'board',
    render,
    reset() { close(); if (boardsSub) boardsSub(); boardsSub = null; S.boards = {}; imgCache.clear(); lastHtml = ''; },
  };
  window.BoardTeacher = {
    enter() { ensureBoards(); },
    leave() { close(); if (boardsSub) boardsSub(); boardsSub = null; S.boards = {}; imgCache.clear(); lastHtml = ''; },
  };
  TC.addTab('boards', '판', () => { lastHtml = ''; }, () => render($('#tc-main')));
})();

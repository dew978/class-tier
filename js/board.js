/* 판 — 자유 판(게시판)과 글쓰기 판(주제 글쓰기)
   자유 판: 수페처럼 넓은 판과 흰 카드. 모눈·칸·목록 배치, 사진, ❤️ 좋아요, 글 밑 댓글, 선생님 확인 뒤 공개, 잠금, 대상 학생
   글쓰기 판: 선생님이 주제와 기간(일정)을 정하면 학생이 주제마다 한 편씩 쓰고,
             선생님이 「통과」(보상) 또는 「다시 쓰기」(의견)를 줌. 학생별 모아보기. 친구 글 공유(선택) */
(function () {
  const A = window.App, E = window.Econ, TC = window.Teacher;
  const { S, B, $, esc, toast, modal, confirmBox, fmtDate, fmtTime, nameOf, nameTag } = A;
  let live = null; // 열려 있는 글쓰기 판 창을 데이터가 바뀔 때 다시 그림
  const BGS = { dark: '밤하늘', blue: '파랑', purple: '보라', green: '초록', orange: '주황', pink: '분홍' };
  const LAYS = { grid: '모눈 (자유 배치)', cols: '칸 나누기', list: '목록' };

  // ── 공용 상태 ──
  const V = { bid: null, subs: [], posts: {}, pend: {}, cmts: {}, rxs: {}, topics: {}, writes: {}, allWrites: null, openTopic: null };
  let boardsSub = null;
  const imgCache = new Map();
  const isT = () => S.isTeacher;
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
      else sub(`bpend/${bid}`, (v) => (V.pend = v), { child: 'u', equalTo: S.uid }); // 판을 연 뒤에 「확인한 뒤 공개」가 켜져도 내 대기 글이 보이게 늘 들음
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
  let lastHtml = '', lastEl = null, held = null, pressing = false;
  const drafts = new Map(); // 쓰다 만 댓글 (다시 그려도 남게)
  const typing = (main) => { const a = document.activeElement; return !!(a && a.dataset && a.dataset.ci && main.contains(a)); };
  // 미뤄 둔 그리기: 댓글 칸을 벗어났고, 무언가를 누르는 중이 아닐 때 그림 (누르는 도중에 화면이 바뀌면 그 누름이 사라지므로)
  function flush() {
    if (!held || pressing) return;
    const [main, h, c] = held;
    if (typing(main)) return;
    held = null;
    if (main.querySelector('.board-view.free')) paint(main, h, c); // 그사이 다른 화면으로 갔으면 그리지 않음
  }
  document.addEventListener('pointerdown', () => { pressing = true; }, true);
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => { pressing = false; setTimeout(flush, 0); }, true);
  function paint(main, html, onclick) {
    // 댓글을 쓰는 중이면 다시 그리지 않고 기다렸다가, 칸을 벗어나면 그림 (한글 입력이 끊기지 않게)
    if (typing(main)) { held = [main, html, onclick]; return; }
    held = null;
    if (html === lastHtml && lastEl && main.contains(lastEl)) return;
    main.querySelectorAll('[data-ci]').forEach((i) => { if (i.value) drafts.set(i.dataset.ci, i.value); else drafts.delete(i.dataset.ci); });
    lastHtml = html;
    main.innerHTML = html;
    lastEl = main.firstElementChild;
    main.onclick = onclick;
    main.querySelectorAll('[data-ci]').forEach((i) => { const d = drafts.get(i.dataset.ci); if (d) i.value = d; });
    // 댓글 칸은 form이라 Enter·「게시」·태블릿 자판의 보내기 키가 모두 submit으로 옴 (한글 조합 중 Enter도 브라우저가 알아서 처리)
    main.onsubmit = (e) => { const f = e.target.closest('[data-cf]'); if (!f) return; e.preventDefault(); sendCmt(main, f.dataset.cf); };
    main.onmousedown = (e) => { if (e.target.closest('[data-cf] button')) e.preventDefault(); }; // 「게시」를 눌러도 댓글 칸에서 커서가 빠지지 않게
    main.onfocusout = () => setTimeout(flush, 0);
    loadImages(main);
  }

  /* ───────────── 판 목록 ───────────── */
  function listHtml() {
    const list = Object.entries(S.boards || {}).filter(([, b]) => canSee(b)).sort((a, b) => (b[1].pin ? 1 : 0) - (a[1].pin ? 1 : 0) || (a[1].ord ?? 999) - (b[1].ord ?? 999) || (b[1].at || 0) - (a[1].at || 0));
    return `<div class="${isT() ? '' : 'panel'}"><div class="a-head"><h2>📌 판</h2><span class="muted">${isT() ? '자유 판(게시판)과 글쓰기 판(주제 글쓰기)을 만들어요' : '친구들과 생각을 나누는 곳'}</span><span class="sp"></span>
      ${isT() ? '<button class="btn" data-bn="free">+ 자유 판</button><button class="btn primary" data-bn="write">+ 글쓰기 판</button>' : ''}</div>
      ${list.length ? `<div class="board-list">${list.map(([bid, b]) => `<button class="board-card ${b.ty === 'write' ? 'bg-' : 'fb-prev fbg-'}${esc(b.bg || 'dark')}" data-bo="${esc(bid)}">
        <span class="bc-ic">${b.ty === 'write' ? '✏️' : '📌'}</span><b>${esc(b.t)}</b>${b.d ? `<span class="bc-d">${esc(b.d)}</span>` : ''}
        <span class="bc-tags">${b.ty === 'write' ? '<i>글쓰기 판</i>' : `<i>${esc((LAYS[b.lay] || '모눈').split(' ')[0])}</i>`}${b.pin ? '<i>📌 고정</i>' : ''}${isT() && b.vis === false ? '<i>숨김</i>' : ''}${b.lock ? '<i>🔒 잠김</i>' : ''}${b.appr ? '<i>확인 후 공개</i>' : ''}${b.to ? `<i>대상 ${Object.keys(b.to).length}명</i>` : ''}</span></button>`).join('')}</div>`
        : `<p class="empty">${isT() ? '아직 판이 없어요. 「+ 자유 판」이나 「+ 글쓰기 판」을 눌러 만들어요.' : '아직 열린 판이 없어요.'}</p>`}</div>`;
  }

  /* ───────────── 자유 판 (수페처럼: 넓은 판 · 흰 카드 · 이름이 잘 보이게 · 시간 없음 · ❤️만 · 댓글은 글 바로 밑에) ───────────── */
  const F = { menu: null, openCm: new Set() }; // ⋮ 메뉴가 열린 글, 댓글을 모두 펼친 글
  const avatarOf = (u) => (u === 'T' ? '<span class="av xs t-av">👩‍🏫</span>' : S.users[u] && E ? E.avatar(u, 'xs') : '<span class="av xs"><b>?</b></span>');
  const nameOnly = (u) => (u === 'T' ? esc(S.teacherName || '선생님') : esc(S.users[u] ? nameOf(u) : '(나간 학생)'));
  const IC_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const IC_CMT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9.5L5 21.5V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
  function postCard(pid, p, pending) {
    const b = S.boards[V.bid];
    const mine = p.u === S.uid || (isT() && p.u === 'T');
    const rx = V.rxs[pid] || {};
    const hearts = Object.keys(rx).length; // 예전 반응(👍😮😂👏)도 ❤️로 셈
    const liked = !!rx[S.uid];
    const cms = Object.entries(V.cmts[pid] || {}).sort((x, y) => (x[1].t || 0) - (y[1].t || 0));
    const all = F.openCm.has(pid);
    const shown = all ? cms : cms.slice(-2);
    return `<article class="fb-card ${pending ? 'pending' : ''}" data-pid="${esc(pid)}">
      <header class="fb-head">${avatarOf(p.u)}<b class="fb-name">${nameOnly(p.u)}</b>${p.pin ? '<span class="fb-pin" title="맨 앞에 고정">📌</span>' : ''}
        ${mine || isT() ? `<button class="fb-more" data-mn="${esc(pid)}" aria-label="더 보기">⋮</button>` : ''}
        ${F.menu === pid ? `<div class="fb-menu">${mine ? `<button data-pe="${esc(pid)}|${pending ? 1 : 0}">고치기</button>` : ''}
          ${isT() && !pending ? `<button data-pp="${esc(pid)}">${p.pin ? '고정 풀기' : '맨 앞에 고정'}</button>` : ''}
          <button class="danger-txt" data-pd="${esc(pid)}|${pending ? 1 : 0}">지우기</button></div>` : ''}</header>
      ${pending ? '<span class="fb-wait">선생님 확인 중</span>' : ''}
      ${p.ti ? `<h4 class="fb-ti">${esc(p.ti)}</h4>` : ''}${p.tx ? `<div class="fb-tx">${esc(p.tx)}</div>` : ''}
      ${p.img ? `<img data-src="bimg/${esc(V.bid)}/${esc(pid)}" alt="" class="fb-img">` : ''}
      ${isT() && pending ? `<button class="btn sm good fb-approve" data-pa="${esc(pid)}">공개하기</button>` : ''}
      ${!pending && (b.rx !== false || (b.cmt !== false && cms.length)) ? `<div class="fb-act">
        ${b.rx !== false ? `<button class="fb-heart ${liked ? 'on' : ''}" data-hx="${esc(pid)}" aria-label="좋아요" aria-pressed="${liked}">${IC_HEART}${hearts ? `<span>${hearts}</span>` : ''}</button>` : ''}
        ${b.cmt !== false && cms.length ? `<span class="fb-cmn">${IC_CMT}${cms.length}</span>` : ''}</div>` : ''}
      ${!pending && b.cmt !== false ? `<div class="fb-cmts">
        ${cms.length > 2 ? `<button class="fb-more-cm" data-cmall="${esc(pid)}">${all ? '댓글 접기' : `댓글 ${cms.length - 2}개 더 보기`}</button>` : ''}
        ${shown.map(([cid, c]) => `<div class="fb-cm">${avatarOf(c.u)}<div class="fb-cm-body"><b>${nameOnly(c.u)}</b><span>${esc(c.tx)}</span></div>
          ${c.u === S.uid || isT() ? `<button class="fb-cm-x" data-cd="${esc(pid)}|${esc(cid)}" aria-label="댓글 지우기">✕</button>` : ''}</div>`).join('')}
        <form class="fb-cm-new" data-cf="${esc(pid)}"><input data-ci="${esc(pid)}" maxlength="300" placeholder="댓글 추가..." enterkeyhint="send" autocomplete="off" aria-label="댓글 쓰기"><button type="submit">게시</button></form></div>` : ''}
    </article>`;
  }
  // 모눈 배치의 세로 줄 수 (카드 한 장이 270px쯤 되게)
  let gridN = 0;
  const gridCols = () => Math.max(1, Math.round((window.innerWidth - 68) / 270));
  window.addEventListener('resize', () => {
    const b = V.bid && S.boards[V.bid];
    if (b && b.ty !== 'write' && b.lay !== 'cols' && b.lay !== 'list' && gridCols() !== gridN) A.render();
  });
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
      body = `<div class="fb-cols" style="--n:${cols.length}">${cols.map((c, i) => `<section class="fb-col"><h3 class="fb-col-h">${esc(c)}</h3>
        ${cards(pend.filter(([, p]) => (p.col || 0) === i), true)}${cards(posts.filter(([, p]) => (p.col || 0) === i || (i === 0 && (p.col || 0) >= cols.length)), false)}</section>`).join('')}</div>`;
    } else if (b.lay === 'list') body = `<div class="fb-list">${cards(pend, true)}${cards(posts, false)}</div>`;
    else {
      // 모눈: 화면 폭에 맞춘 세로 줄에 글을 왼쪽부터 차례로 담아, 길이가 달라도 빈틈 없이 쌓임
      gridN = gridCols();
      const all = [...pend.map(([pid, p]) => postCard(pid, p, true)), ...posts.map(([pid, p]) => postCard(pid, p, false))];
      body = `<div class="fb-grid" style="--n:${gridN}">${Array.from({ length: gridN }, (_, c) => `<div class="fb-gcol">${all.filter((_, i) => i % gridN === c).join('')}</div>`).join('')}</div>`;
    }
    const canPost = isT() || b.lock !== true;
    return `<div class="board-view free fbg-${esc(b.bg || 'dark')}">
      <div class="fb-top"><div class="fb-tt"><h2 class="fb-title">${esc(b.t)}</h2>${b.d ? `<span class="fb-desc">${esc(b.d)}</span>` : ''}</div>
        ${isT() ? `<span class="fb-count">참여 ${[...writers].filter((u) => tg.includes(u)).length}/${tg.length}</span><button class="fb-tbtn" data-bs="${esc(V.bid)}">⚙️ 판 설정</button>` : ''}
        ${canPost ? '' : '<span class="fb-count">🔒 선생님이 잠갔어요</span>'}
        <button class="fb-tbtn fb-close" data-back="1" aria-label="판 목록으로" title="판 목록으로">✕</button></div>
      ${!isT() && b.appr ? '<p class="fb-note">이 판은 선생님이 확인한 뒤 친구들에게 보여요.</p>' : ''}
      ${isT() && pend.length ? `<p class="fb-note">확인을 기다리는 글 ${pend.length}개 — 「공개하기」를 누르면 학생들에게 보여요.</p>` : ''}
      ${posts.length || pend.length ? body : '<p class="fb-empty">아직 게시물이 없어요. 첫 글을 붙여 보세요!</p>'}
      ${canPost ? '<button class="fb-add" data-pn="1">＋ 게시물 붙이기</button>' : ''}</div>`;
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
      ${b.img !== false ? `<div class="photo-pick"><div class="row-flex"><button class="btn sm" id="pi">📷 사진 ${p.img ? '바꾸기' : '넣기'}</button>${p.img ? '<button class="btn sm ghost" id="pir">사진 빼기</button>' : ''}</div><div id="piv">${p.img ? `<img data-src="bimg/${esc(V.bid)}/${esc(pid)}" alt="" class="proof-img">` : ''}</div></div>` : ''}
      <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>${pid ? '저장' : '붙이기'}</button></div>`, { wide: true });
    loadImages(m.el);
    const clr = p.clr || 'w'; // 카드는 모두 흰색 (예전 글의 색 정보는 그대로 둠)
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
  // 댓글은 글 바로 밑의 칸에서 곧바로 달기
  async function sendCmt(main, pid) {
    const b = S.boards[V.bid];
    const inp = [...main.querySelectorAll('[data-ci]')].find((i) => i.dataset.ci === pid);
    const tx = inp ? inp.value.trim() : '';
    if (!tx) return;
    if (b.cmt === false && !isT()) return toast('댓글이 꺼진 판이에요.', 'bad');
    // 칸을 먼저 비움 (두 번 눌러도 한 번만 올라가고, 그사이 화면이 다시 그려져도 글이 남지 않게)
    inp.value = '';
    drafts.delete(pid);
    try {
      await B.set(`bcmt/${V.bid}/${pid}/${B.newKey()}`, { u: isT() ? 'T' : S.uid, t: B.ts(), tx });
      if (document.activeElement && document.activeElement.dataset.ci === pid) document.activeElement.blur(); // 새 댓글이 바로 보이게 다시 그림
    } catch (err) {
      // 올리지 못했으면 쓴 글을 되돌려 놓음
      const cur = [...main.querySelectorAll('[data-ci]')].find((i) => i.dataset.ci === pid);
      if (cur && !cur.value) cur.value = tx;
      drafts.set(pid, tx);
      toast(/권한/.test(err.message) ? '지금은 댓글을 달 수 없어요.' : err.message, 'bad');
    }
  }
  async function onFree(e) {
    const t = e.target;
    // ⋮ 메뉴: 열기/닫기, 메뉴 밖을 누르면 닫힘
    const mn = t.closest('[data-mn]');
    if (mn) { F.menu = F.menu === mn.dataset.mn ? null : mn.dataset.mn; A.render(); return; }
    if (F.menu) { F.menu = null; A.render(); }
    const hx = t.closest('[data-hx]');
    if (hx) {
      const pid = hx.dataset.hx;
      const cur = (V.rxs[pid] || {})[S.uid];
      await B.set(`brx/${V.bid}/${pid}/${S.uid}`, cur ? null : 'heart').catch((err) => toast(err.message, 'bad'));
      return;
    }
    const all = t.closest('[data-cmall]');
    if (all) { const pid = all.dataset.cmall; F.openCm.has(pid) ? F.openCm.delete(pid) : F.openCm.add(pid); A.render(); return; }
    const cd = t.closest('[data-cd]');
    if (cd) {
      const [pid, cid] = cd.dataset.cd.split('|');
      if (await confirmBox('댓글 지우기', '이 댓글을 지울까요?', '지우기', true)) await B.remove(`bcmt/${V.bid}/${pid}/${cid}`).catch((err) => toast(err.message, 'bad'));
      return;
    }
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
    const b = bid ? S.boards[bid] : { ty, t: '', lay: 'grid', bg: ty === 'write' ? 'purple' : 'dark', vis: true, img: true, cmt: true, rx: true };
    const write = b.ty === 'write';
    const tgt = new Set(Object.keys(b.to || {}));
    const m = modal(`<h3>${bid ? '판 설정' : write ? '새 글쓰기 판' : '새 자유 판'}</h3>
      <div class="form-grid"><label>이름<input id="bt" maxlength="40" value="${esc(b.t)}" placeholder="${write ? '예: 국어 주제 글쓰기' : '예: 우리 반 아이디어'}"></label>
        <label>배경<select id="bbg">${Object.entries(BGS).map(([k, n]) => `<option value="${k}" ${(b.bg || 'dark') === k ? 'selected' : ''}>${k === 'dark' && !write ? '베이지 (기본)' : n}</option>`).join('')}</select></label>
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
        <label class="chk-line"><input type="checkbox" class="chk" id="brx" ${b.rx !== false ? 'checked' : ''}> ❤️ 좋아요</label>`}
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
    // 자유 판은 화면 폭을 다 씀 (수페처럼)
    main.classList.toggle('fb-wide', !!(b && b.ty !== 'write'));
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

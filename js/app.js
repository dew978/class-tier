/* 클래스 티어 — 앱 본체 (로그인, 공용 UI, 학생 화면) */
(function () {
  const B = window.Backend, T = window.Tier;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = {
    uid: null, isTeacher: false, teacherUid: null, settingUp: false,
    className: '', teacherName: '선생님', settingsRaw: null,
    users: {}, standings: {}, seasons: {}, myEntries: {}, myDetail: {},
    subs: [], detailSubs: {}, screen: null, tab: 'home', pick: 'reading', mineMonth: null,
  };
  const settings = () => T.mergeSettings(S.settingsRaw);
  const curMonth = () => T.monthKey(B.now());

  /* ───────────── 공용 UI ───────────── */
  const SHIELD = 'M12 1.8 20.5 5v6.2c0 5.6-3.6 9.7-8.5 11.2C7.1 20.9 3.5 16.8 3.5 11.2V5z';
  const EMB = {
    bronze: `<path d="${SHIELD}" fill="url(#g-bronze)" stroke="#4a230c" stroke-width=".8"/><path d="M12 5.4 16.8 7.3v4c0 3.4-2 6-4.8 7.1-2.8-1.1-4.8-3.7-4.8-7.1v-4z" fill="none" stroke="#ffd9b8" stroke-opacity=".6"/><circle cx="12" cy="11.6" r="2" fill="#ffd9b8" fill-opacity=".7"/>`,
    silver: `<path d="${SHIELD}" fill="url(#g-silver)" stroke="#4d5668" stroke-width=".8"/><path d="M8 8.8l4 2.8 4-2.8M8 12.6l4 2.8 4-2.8" fill="none" stroke="#4d5668" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    gold: `<path d="${SHIELD}" fill="url(#g-gold)" stroke="#7a4a05" stroke-width=".8"/><path d="M12 6.4l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff6cf" stroke="#9a6308" stroke-width=".6"/>`,
    platinum: '<path d="M12 1.5 21 6.8v10.4l-9 5.3-9-5.3V6.8z" fill="url(#g-platinum)" stroke="#0b5752" stroke-width=".8"/><path d="M12 5.6 17.4 8.8v6.4L12 18.4l-5.4-3.2V8.8z" fill="#e9fffb" fill-opacity=".28" stroke="#e9fffb" stroke-opacity=".75" stroke-width=".8"/><path d="M12 5.6v12.8M6.6 8.8l10.8 6.4M17.4 8.8 6.6 15.2" stroke="#e9fffb" stroke-opacity=".35" stroke-width=".6"/>',
    diamond: '<path d="M6.3 3h11.4L22.2 9 12 22.2 1.8 9z" fill="url(#g-diamond)" stroke="#2e1f7a" stroke-width=".8"/><path d="M1.8 9h20.4M6.3 3 9 9l3 13.2L15 9l2.7-6M9 9l3-6 3 6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/><path d="M6.3 3 9 9H1.8z" fill="#fff" fill-opacity=".25"/>',
    champion: '<path d="M2.4 8.2 7 12.2l5-8.4 5 8.4 4.6-4-2.1 11.3h-15z" fill="url(#g-champion)" stroke="#7a200c" stroke-width=".8" stroke-linejoin="round"/><rect x="4.4" y="19.7" width="15.2" height="2.6" rx="1.1" fill="url(#g-champion)" stroke="#7a200c" stroke-width=".6"/><circle cx="12" cy="14.3" r="1.9" fill="#ff3d6e" stroke="#fff" stroke-width=".6"/><circle cx="7.6" cy="15.6" r="1" fill="#4fd1ff"/><circle cx="16.4" cy="15.6" r="1" fill="#4fd1ff"/><circle cx="2.4" cy="8.2" r="1.4" fill="#fff3a6"/><circle cx="12" cy="3.6" r="1.4" fill="#fff3a6"/><circle cx="21.6" cy="8.2" r="1.4" fill="#fff3a6"/>',
    placement: '<circle cx="12" cy="12" r="10" fill="url(#g-placement)" stroke="#2c3550"/><text x="12" y="16.6" text-anchor="middle" font-size="13" font-weight="800" fill="#e6ebf7" font-family="system-ui,sans-serif">?</text>',
    none: '<circle cx="12" cy="12" r="9" fill="#2a3350"/>',
  };
  const emblem = (id) => `<svg class="emb" viewBox="0 0 24 24">${EMB[id] || EMB.none}</svg>`;
  const TIER_NAMES = { champion: '챔피언', placement: '첫 시즌', bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘', diamond: '다이아' };
  const tierName = (id) => TIER_NAMES[id] || '';
  const tierChip = (id) => `<span class="tchip tier-color-${id}">${emblem(id)}${esc(tierName(id))}</span>`;

  // 지난달(마지막으로 마감된 달) 기준 티어 — 이름 앞 엠블럼
  function lastSeasonKey() {
    const ks = Object.keys(S.seasons || {}).filter((k) => S.seasons[k] && S.seasons[k].closedAt).sort();
    return ks[ks.length - 1] || null;
  }
  function badgeTier(uid) {
    const k = lastSeasonKey();
    const s = k && S.seasons[k];
    if (!s || !s.rows || !s.rows[uid]) return 'placement';
    return s.champion === uid ? 'champion' : s.rows[uid].tier;
  }
  // 이번 달 진행 중 티어(예상)
  function liveTier(uid, month) {
    const r = S.standings[month] && S.standings[month].rows && S.standings[month].rows[uid];
    if (!r) return T.tierOf(T.START, settings().thresholds).id;
    return r.champion ? 'champion' : r.tier;
  }
  const nameOf = (uid) => (S.users[uid] && S.users[uid].name) || '(삭제된 학생)';
  function nameTag(uid, cls = '') {
    const id = badgeTier(uid);
    return `<span class="ntag t-${id} ${cls}" title="지난달 티어: ${esc(tierName(id))}">${emblem(id)}<span class="nm">${esc(nameOf(uid))}</span></span>`;
  }

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function modal(html, opts = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">${html}</div>`;
    $('#modal-root').appendChild(bg);
    let closed = false;
    const close = () => { if (closed) return; closed = true; bg.remove(); opts.onClose && opts.onClose(); };
    if (opts.dismissable !== false) bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); });
    bg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    return { el: bg.firstElementChild, close };
  }
  function confirmBox(title, msg, ok = '확인', danger = false) {
    return new Promise((res) => {
      let v = false;
      const m = modal(`<h3>${esc(title)}</h3><p class="muted" style="line-height:1.6">${msg}</p>
        <div class="foot"><button class="btn ghost" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`, { onClose: () => res(v) });
      m.el.querySelector('[data-ok]').onclick = () => { v = true; m.close(); };
    });
  }
  const fmtDate = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const fmtTime = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
  function daysLeftInMonth() {
    const d = new Date(B.now());
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return end.getDate() - d.getDate();
  }

  function show(name) {
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    $('#scr-' + name).classList.remove('hidden');
    S.screen = name;
    render();
  }
  let renderPending = false;
  function render() {
    if (renderPending) return;
    renderPending = true;
    const run = () => {
      if (!renderPending) return;
      renderPending = false;
      if (S.screen === 'student') renderStudent();
      else if (S.screen === 'teacher' && window.Teacher) window.Teacher.render();
    };
    if (document.hidden) setTimeout(run, 0); else requestAnimationFrame(run);
  }
  document.addEventListener('visibilitychange', () => { renderPending = false; render(); });

  /* ───────────── 시작 / 로그인 ───────────── */
  async function boot() {
    try { await B.init(); } catch (e) { $('#loading-msg').textContent = e.message; return; }
    if (B.mode === 'demo') $('#demo-note').classList.remove('hidden');
    $('#login-logo').innerHTML = emblem('champion');
    $('#setup-logo').innerHTML = emblem('gold');
    B.onAuth(async (uid) => {
      if (S.settingUp) return;
      endSession();
      if (!uid) {
        const t = await B.get('config/teacher').catch(() => null);
        const cn = await B.get('config/className').catch(() => null);
        if (cn) $('#login-title').textContent = `${cn} 클래스 티어`;
        show(t ? 'login' : 'setup');
        return;
      }
      await startSession(uid);
    });
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-err').textContent = '';
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try { await B.signIn($('#login-id').value.trim().toLowerCase(), $('#login-pw').value); }
    catch (err) { $('#login-err').textContent = err.message; }
    btn.disabled = false;
  });
  $('#demo-reset').addEventListener('click', async () => {
    if (!(await confirmBox('데모 데이터 초기화', '이 브라우저의 모든 데모 데이터가 삭제됩니다.', '초기화', true))) return;
    B.resetDemo();
    location.reload();
  });
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#setup-pw').value, pw2 = $('#setup-pw2').value;
    $('#setup-err').textContent = '';
    if (pw !== pw2) { $('#setup-err').textContent = '비밀번호가 서로 다릅니다.'; return; }
    S.settingUp = true;
    try {
      const uid = await B.signUpSelf('teacher', pw);
      const r = await B.tx('config/teacher', (cur) => (cur ? undefined : uid));
      if (!r.committed) throw new Error('이미 선생님 계정이 있습니다.');
      await B.set('config/className', $('#setup-class').value.trim());
      await B.set('config/teacherName', $('#setup-name').value.trim() || '선생님');
      S.settingUp = false;
      await startSession(uid);
    } catch (err) {
      S.settingUp = false;
      $('#setup-err').textContent = err.message;
    }
  });

  async function startSession(uid) {
    S.uid = uid;
    try {
      S.teacherUid = await B.get('config/teacher');
      S.isTeacher = uid === S.teacherUid;
      if (!S.isTeacher && !(await B.get('users/' + uid))) throw new Error('등록되지 않은 계정입니다. 선생님께 문의하세요.');
    } catch (err) {
      await B.signOut();
      show('login');
      $('#login-err').textContent = err.message;
      return;
    }
    const sub = (p, f) => S.subs.push(B.on(p, f));
    sub('config/className', (v) => { S.className = v || ''; render(); });
    sub('config/teacherName', (v) => { S.teacherName = v || '선생님'; render(); });
    sub('config/settings', (v) => { S.settingsRaw = v; render(); });
    sub('users', (v) => {
      S.users = v || {};
      if (!S.isTeacher && S.uid && !S.users[S.uid]) { toast('계정이 삭제되었습니다.', 'bad'); logout(); return; }
      render();
    });
    sub('standings', (v) => { S.standings = v || {}; render(); });
    sub('seasons', (v) => { S.seasons = v || {}; render(); });
    if (!S.isTeacher) {
      sub('entries/' + uid, (v) => { S.myEntries = v || {}; render(); });
      watchDetail(curMonth());
      S.tab = 'home';
      show('student');
    } else {
      show('teacher');
      if (window.Teacher) window.Teacher.enter();
    }
  }
  // 학생 본인의 월별 세부 점수 구독
  function watchDetail(month) {
    if (!month || S.detailSubs[month]) return;
    S.detailSubs[month] = B.on(`myDetail/${month}/${S.uid}`, (v) => { S.myDetail[month] = v; render(); });
  }
  function endSession() {
    S.subs.forEach((u) => u());
    Object.values(S.detailSubs).forEach((u) => u());
    if (window.Teacher) window.Teacher.leave();
    $('#modal-root').innerHTML = '';
    Object.assign(S, { uid: null, isTeacher: false, subs: [], detailSubs: {}, users: {}, standings: {}, seasons: {}, myEntries: {}, myDetail: {}, mineMonth: null });
  }
  async function logout() { await B.signOut(); }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-act="logout"]')) logout(); });

  /* ───────────── 학생 화면 ───────────── */
  $('#st-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    $$('#st-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });

  function myRow(month) {
    const st = S.standings[month];
    return st && st.rows && st.rows[S.uid];
  }

  function renderStudent() {
    const me = S.users[S.uid];
    if (!me) return;
    $('#st-brand').innerHTML = `${emblem('gold')}${esc(S.className || '클래스')} 티어`;
    $('#st-me').innerHTML = nameTag(S.uid);
    const pending = Object.values(S.myEntries).filter((e) => e.status === 'pending').length;
    const sb = $('#st-tabs [data-tab="submit"]');
    sb.innerHTML = `✍️ 기록하기${pending ? `<span class="cnt">${pending}</span>` : ''}`;
    const main = $('#st-main');
    const fn = { home: stHome, rank: stRank, submit: stSubmit, mine: stMine, fame: stFame }[S.tab];
    // 입력 중인 폼은 다시 그리지 않음
    if (S.tab === 'submit' && main.dataset.tab === 'submit') { stSubmitList(); return; }
    main.dataset.tab = S.tab;
    main.innerHTML = fn();
    if (S.tab === 'submit') bindSubmit();
    if (S.tab === 'mine') bindMine();
  }

  function stHome() {
    const st = settings();
    const m = curMonth();
    const row = myRow(m);
    const score = row ? row.score : T.START;
    const tid = liveTier(S.uid, m);
    const total = Object.keys(S.users).length;
    const th = st.thresholds;
    const order = [['silver', th.silver], ['gold', th.gold], ['platinum', th.platinum], ['diamond', th.diamond]];
    const next = order.find(([, v]) => score < v);
    const d = S.myDetail[m];
    const closed = !!(S.seasons[m] && S.seasons[m].closedAt);
    // 지난달 결과와 보상
    const lk = lastSeasonKey();
    let last = '';
    if (lk) {
      const s = S.seasons[lk];
      const r = s.rows && s.rows[S.uid];
      const rw = s.rewards && s.rewards[S.uid];
      if (r) {
        const lid = s.champion === S.uid ? 'champion' : r.tier;
        last = `<div class="last-reward"><div class="muted" style="font-size:.85em">${esc(T.monthLabel(lk))} 확정 결과</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px">${tierChip(lid)}<span>반 ${r.rank}위 · ${r.score}점</span></div>
          ${rw && rw.text ? `<div style="margin-top:6px">🎁 보상: <b>${esc(rw.text)}</b> ${rw.given ? '<span class="pill good">받음</span>' : '<span class="pill warn">받을 예정</span>'}</div>` : ''}</div>`;
      }
    }
    return `
      <div class="panel">
        <div class="hero">
          <div class="emb-big">${emblem(tid)}</div>
          <div class="info">
            <span class="month-pill">📅 ${esc(T.monthLabel(m))} 시즌 ${closed ? '· 마감됨' : `· 마감까지 ${daysLeftInMonth()}일`}</span>
            <div class="muted" style="margin-top:8px">이번 달 현재 티어 (예상)</div>
            <div class="tier-name tier-color-${tid}">${esc(tierName(tid))}</div>
            <div class="score"><b>${score}</b>점 ${row ? `· 반 <b>${row.rank}</b>위 / ${total}명` : '· 아직 이번 달 활동이 없어요'}</div>
            ${next ? `<div class="muted" style="margin-top:6px;font-size:.9em">${tierName(next[0])}까지 ${next[1] - score}점</div>` : ''}
          </div>
        </div>
        ${last}
      </div>
      <div class="grid3" style="margin-top:16px">
        <div class="stat"><div class="k">경쟁 활동 (수행평가·대회)</div><div class="v ${d && d.comp > 0 ? 'up' : d && d.comp < 0 ? 'down' : ''}">${d ? signed(d.comp) : 0}</div></div>
        <div class="stat"><div class="k">생활 점수 (칭찬·독서·과제·역할)</div><div class="v ${d && d.accum > 0 ? 'up' : d && d.accum < 0 ? 'down' : ''}">${d ? signed(d.accum) : 0}</div></div>
        <div class="stat"><div class="k">승인 대기 중인 기록</div><div class="v">${Object.values(S.myEntries).filter((e) => e.status === 'pending').length}건</div></div>
      </div>
      <div class="panel" style="margin-top:16px"><h3>📘 티어는 이렇게 정해져요</h3>
        <div class="note">
          · 매달 1일, 모두 <b>1000점</b>에서 새로 시작해요. 월말에 선생님이 마감하면 그달 티어와 보상이 확정돼요.<br>
          · <b>수행평가·학급 대회</b>는 반 친구들과 결과를 비교해 점수가 오르내려요. 나보다 점수가 높은 친구보다 잘하면 더 많이 올라요.<br>
          · <b>칭찬, 독서, 과제, 1인1역·봉사</b>는 할수록 점수가 쌓여요. (독서·과제·역할은 「기록하기」에서 제출 → 선생님 승인)<br>
          · 티어: 브론즈 ~${th.silver - 1} · 실버 ${th.silver}~ · 골드 ${th.gold}~ · 플래티넘 ${th.platinum}~ · 다이아 ${th.diamond}~ · <b>챔피언 = 그달 1위</b><br>
          · 이름 앞 엠블럼은 <b>지난달 확정 티어</b>예요.
        </div></div>`;
  }

  function stRank() {
    const st = settings();
    const m = curMonth();
    const rows = (S.standings[m] && S.standings[m].rows) || {};
    const ids = Object.keys(S.users).sort((a, b) => ((rows[a] && rows[a].rank) || 999) - ((rows[b] && rows[b].rank) || 999) || nameOf(a).localeCompare(nameOf(b)));
    const any = Object.keys(rows).length > 0;
    return `<div class="panel"><h3>📊 ${esc(T.monthLabel(m))} 순위 <span class="muted">이름 앞 = 지난달 티어 · 오른쪽 = 이번 달 예상 티어</span></h3>
      ${any ? '' : '<p class="empty">아직 이번 달 활동이 없어요. 모두 1000점에서 출발!</p>'}
      <ul class="rows">${ids.map((u) => {
        const r = rows[u];
        return `<li class="${u === S.uid ? 'me' : ''}"><span class="no">${r ? r.rank : '-'}</span>${nameTag(u)}
          <span class="right">${tierChip(liveTier(u, m))}${st.showScores || u === S.uid ? `<span class="sc">${r ? r.score : T.START}</span>` : ''}</span></li>`;
      }).join('')}</ul></div>`;
  }

  const CAT_UI = {
    reading: { ic: '📚', fields: [['title', '책 제목', true], ['note', '한 줄 감상 (선택)', false]] },
    homework: { ic: '📝', fields: [['title', '과제 이름', true]] },
    service: { ic: '🤝', fields: [['title', '한 일 (예: 급식 도우미, 교실 정리)', true]] },
  };
  function approvedCount(cat, month) {
    return Object.values(S.myEntries).filter((e) => e.cat === cat && e.month === month && e.status === 'approved').length;
  }
  function stSubmit() {
    const st = settings();
    const m = curMonth();
    const closed = !!(S.seasons[m] && S.seasons[m].closedAt);
    const cat = st.cats[S.pick];
    return `<div class="panel"><h3>✍️ 기록하기 <span class="muted">선생님이 승인하면 점수에 반영돼요</span></h3>
      ${closed ? `<p class="empty">${esc(T.monthLabel(m))}은 이미 마감되었어요. 다음 달 1일부터 다시 기록할 수 있어요.</p>` : `
      <div class="cat-pick">${T.STUDENT_CATS.map((k) => {
        const c = st.cats[k];
        const n = approvedCount(k, m);
        return `<button data-pick="${k}" class="${S.pick === k ? 'on' : ''}"><span class="ic">${CAT_UI[k].ic}</span><span class="t">${esc(c.name)}</span>
          <span class="d">1건 ${signed(c.points)}점${c.cap ? ` · 이번 달 ${n}/${c.cap}` : ''}</span></button>`;
      }).join('')}</div>
      <form id="sub-form">
        ${CAT_UI[S.pick].fields.map(([k, l, req]) => `<label>${esc(l)}<input name="${k}" ${req ? 'required' : ''} maxlength="80"></label>`).join('')}
        <div class="foot"><button class="btn primary lg" type="submit">${esc(cat.name)} 제출</button></div>
      </form>`}
      </div>
      <div class="panel" style="margin-top:16px"><h3>🕘 이번 달 내 기록</h3><ul class="rows" id="sub-list"></ul></div>`;
  }
  function stSubmitList() {
    const el = $('#sub-list');
    if (!el) return;
    const st = settings();
    const m = curMonth();
    const list = Object.entries(S.myEntries).map(([id, e]) => Object.assign({ id }, e))
      .filter((e) => e.month === m && e.by === 'student').sort((a, b) => b.ts - a.ts);
    el.innerHTML = list.map((e) => `<li><span class="status ${e.status}">${{ pending: '대기', approved: '승인', rejected: '반려' }[e.status]}</span>
      <span>${CAT_UI[e.cat] ? CAT_UI[e.cat].ic : ''} <b>${esc(st.cats[e.cat] ? st.cats[e.cat].name : e.cat)}</b> · ${esc(e.text)}</span>
      ${e.status === 'rejected' && e.reason ? `<span class="muted" style="font-size:.85em">사유: ${esc(e.reason)}</span>` : ''}
      <span class="right"><span class="muted" style="font-size:.85em">${fmtDate(e.ts)}</span>${e.status === 'pending' ? `<button class="btn xs ghost" data-del="${e.id}">취소</button>` : ''}</span></li>`).join('')
      || '<li class="empty">아직 기록이 없어요</li>';
  }
  function bindSubmit() {
    stSubmitList();
    $$('[data-pick]').forEach((b) => (b.onclick = () => { S.pick = b.dataset.pick; $('#st-main').dataset.tab = ''; render(); }));
    const f = $('#sub-form');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      const note = f.note ? f.note.value.trim() : '';
      if (!title) return;
      const text = S.pick === 'reading' ? `『${title}』${note ? ' — ' + note : ''}` : title;
      const btn = f.querySelector('button');
      btn.disabled = true;
      try {
        await B.set(`entries/${S.uid}/${B.newKey()}`, { cat: S.pick, text, month: curMonth(), ts: B.now(), by: 'student', status: 'pending' });
        f.reset();
        toast('제출했어요! 선생님이 승인하면 점수에 반영돼요.', 'good');
      } catch (err) { toast(err.message, 'bad'); }
      btn.disabled = false;
    };
    $('#sub-list').onclick = async (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (!(await confirmBox('제출 취소', '이 기록을 취소할까요?', '취소하기'))) return;
      await B.remove(`entries/${S.uid}/${b.dataset.del}`).catch((err) => toast(err.message, 'bad'));
    };
  }

  function monthsWithData() {
    const set = new Set([curMonth(), ...Object.keys(S.standings || {}), ...Object.keys(S.seasons || {})]);
    return [...set].sort().reverse();
  }
  function stMine() {
    const st = settings();
    const months = monthsWithData();
    const m = S.mineMonth && months.includes(S.mineMonth) ? S.mineMonth : months[0];
    watchDetail(m);
    const d = S.myDetail[m];
    const row = myRow(m) || (S.seasons[m] && S.seasons[m].rows && S.seasons[m].rows[S.uid]);
    const modeTxt = (a) => a.mode === 'rank' ? `${a.raw}위` : a.mode === 'grade' ? a.raw : `${a.raw}점`;
    return `<div class="panel"><div class="a-head"><h2>📋 내 점수</h2><span class="sp"></span>
        <div class="month-select"><select id="mine-month">${months.map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${esc(T.monthLabel(k))}</option>`).join('')}</select></div></div>
      <div class="grid3">
        <div class="stat"><div class="k">총점</div><div class="v">${row ? row.score : T.START}</div></div>
        <div class="stat"><div class="k">경쟁 활동 합계</div><div class="v ${d && d.comp > 0 ? 'up' : d && d.comp < 0 ? 'down' : ''}">${d ? signed(d.comp) : 0}</div></div>
        <div class="stat"><div class="k">생활 점수 합계</div><div class="v ${d && d.accum > 0 ? 'up' : d && d.accum < 0 ? 'down' : ''}">${d ? signed(d.accum) : 0}</div></div>
      </div></div>
      <div class="panel" style="margin-top:16px"><h3>🏅 경쟁 활동</h3>
        ${d && d.acts && d.acts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>활동</th><th>내 결과</th><th>반 등수</th><th class="num">점수</th></tr></thead><tbody>
          ${d.acts.map((a) => `<tr><td>${fmtDate(a.at)}</td><td><b>${esc(a.name)}</b> <span class="muted">${esc(T.KIND_NAMES[a.kind] || '')}</span></td><td>${esc(modeTxt(a))}</td><td>${a.place} / ${a.n}명</td><td class="num"><b class="delta ${a.delta > 0 ? 'up' : a.delta < 0 ? 'down' : ''}">${signed(a.delta)}</b></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">아직 반영된 경쟁 활동이 없어요</p>'}</div>
      <div class="panel" style="margin-top:16px"><h3>🌱 생활 점수</h3>
        ${d && d.logs && d.logs.length ? `<ul class="rows">${d.logs.slice().reverse().map((l) => `<li><b>${esc(st.cats[l.cat] ? st.cats[l.cat].name : l.cat)}</b><span>${esc(l.text)}</span>
          <span class="right"><span class="muted" style="font-size:.85em">${fmtDate(l.at)}</span><b class="delta ${l.points > 0 ? 'up' : l.points < 0 ? 'down' : ''}">${l.capped ? '월 한도 초과 0' : signed(l.points)}</b></span></li>`).join('')}</ul>` : '<p class="empty">아직 반영된 생활 점수가 없어요</p>'}</div>`;
  }
  function bindMine() {
    const sel = $('#mine-month');
    if (sel) sel.onchange = () => { S.mineMonth = sel.value; render(); };
  }

  function stFame() {
    const ks = Object.keys(S.seasons || {}).filter((k) => S.seasons[k].closedAt).sort().reverse();
    if (!ks.length) return '<div class="panel"><h3>🏆 명예의 전당</h3><p class="empty">첫 시즌이 마감되면 이곳에 매달 챔피언이 기록돼요.</p></div>';
    return `<div class="panel"><h3>🏆 명예의 전당 <span class="muted">매달 챔피언</span></h3><div class="fame">${ks.map((k) => {
      const s = S.seasons[k];
      const mine = s.rows && s.rows[S.uid];
      const myT = mine ? (s.champion === S.uid ? 'champion' : mine.tier) : null;
      return `<div class="card"><div class="m">${esc(T.monthLabel(k))}</div>${emblem('champion')}<div class="who">${esc(s.championName || '-')}</div>
        ${myT ? `<div style="margin-top:8px;font-size:.9em">나: ${tierChip(myT)} · ${mine.rank}위</div>` : ''}</div>`;
    }).join('')}</div></div>`;
  }

  window.App = {
    S, B, T, $, $$, esc, emblem, tierChip, tierName, nameTag, nameOf, badgeTier, liveTier, lastSeasonKey,
    toast, modal, confirmBox, fmtDate, fmtTime, signed, settings, curMonth, render, show, logout,
  };
  window.addEventListener('DOMContentLoaded', boot);
})();

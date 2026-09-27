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
    subs: [], detailSubs: {}, screen: null, sec: 'tier', tab: 'home', secTab: {}, pick: 'unit', mineMonth: null,
    myLevels: {}, hanja: null, openUnits: {},
    // 학급 경제
    econRaw: null, acct: null, accts: {}, store: {}, storeContrib: {}, jobs: {}, market: {}, gov: null, quests: {}, boards: {},
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
    // 화면 갱신 신호(requestAnimationFrame)가 오지 않는 경우를 대비해 0.25초 뒤 한 번 더 시도
    if (document.hidden) setTimeout(run, 0);
    else { requestAnimationFrame(run); setTimeout(run, 250); }
  }
  document.addEventListener('visibilitychange', () => { renderPending = false; render(); });

  /* ───────────── 시작 / 로그인 ───────────── */
  async function boot() {
    try { await B.init(); } catch (e) { $('#loading-msg').textContent = e.message; return; }
    if (B.mode === 'demo') $('#demo-note').classList.remove('hidden');
    if (B.google) $$('.google-only').forEach((x) => x.classList.remove('hidden'));
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
  // Google 계정으로 선생님 로그인 (선생님 계정에 연결된 Google 계정만)
  $('#login-google').addEventListener('click', async (e) => {
    $('#login-err').textContent = '';
    e.currentTarget.disabled = true;
    try { await B.signInGoogle(); } catch (err) { $('#login-err').textContent = err.message; }
    e.currentTarget.disabled = false;
  });
  // 새 반: Google 계정으로 선생님 계정 만들기
  $('#setup-google').addEventListener('click', async () => {
    const cls = $('#setup-class').value.trim();
    $('#setup-err').textContent = '';
    if (!cls) { $('#setup-err').textContent = '반 이름을 먼저 적어 주세요.'; return; }
    S.settingUp = true;
    try {
      const r = await B.signInGoogle();
      if (!r) return;
      const t = await B.tx('config/teacher', (cur) => (cur ? undefined : r.uid));
      if (!t.committed) { await B.dropNewGoogleUser(); throw new Error('이미 선생님 계정이 있습니다.'); }
      await B.set('config/className', cls);
      await B.set('config/teacherName', $('#setup-name').value.trim() || '선생님');
      S.settingUp = false;
      await startSession(r.uid);
    } catch (err) {
      S.settingUp = false;
      $('#setup-err').textContent = err.message;
    }
  });

  async function startSession(uid) {
    S.uid = uid;
    const fail = async (msg, dropGoogle) => {
      if (dropGoogle) await B.dropNewGoogleUser(); else await B.signOut();
      show('login');
      $('#login-err').textContent = msg;
    };
    try { S.teacherUid = await B.get('config/teacher'); }
    catch (err) { return fail(err.message, false); }
    S.isTeacher = uid === S.teacherUid;
    if (!S.isTeacher) {
      let me = null;
      try { me = await B.get('users/' + uid); }
      catch (err) { if (!/권한/.test(err.message)) return fail(err.message, false); }
      // 선생님도 학생도 아닌 계정: Google로 새로 생긴 계정이면 지워서 나중에 연결할 수 있게 함
      if (!me) {
        const google = B.isGoogleOnly && B.isGoogleOnly();
        return fail(google ? '이 Google 계정은 선생님 계정과 연결되어 있지 않아요. 선생님 아이디로 로그인해 「관리 → 티어 설정 → 선생님 계정」에서 Google 계정을 먼저 연결해 주세요.' : '등록되지 않은 계정입니다. 선생님께 문의하세요.', google);
      }
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
    // 학급 경제 (공용)
    sub('config/econ', (v) => { S.econRaw = v; render(); });
    sub('store/items', (v) => { S.store = v || {}; render(); });
    sub('jobs', (v) => { S.jobs = v || {}; render(); });
    sub('market', (v) => { S.market = v || {}; render(); });
    sub('gov', (v) => { S.gov = v || {}; render(); });
    sub('quests', (v) => { S.quests = v || {}; render(); });
    if (!S.isTeacher) {
      sub('entries/' + uid, (v) => { S.myEntries = v || {}; render(); });
      sub('levels/' + uid, (v) => { S.myLevels = v || {}; render(); });
      sub('hanja/' + uid, (v) => { S.hanja = v || { learned: 0, level: 0, review: {} }; render(); });
      sub('openUnits', (v) => { S.openUnits = v || {}; render(); });
      sub('acct/' + uid, (v) => { S.acct = v || {}; render(); });
      watchDetail(curMonth());
      S.sec = 'tier';
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
    if (window.HanjaStudy) window.HanjaStudy.reset();
    for (const m of ['EconStudent', 'QuestStudent', 'BoardStudent']) if (window[m]) window[m].reset();
    Object.assign(S, {
      uid: null, isTeacher: false, subs: [], detailSubs: {}, users: {}, standings: {}, seasons: {}, myEntries: {}, myDetail: {}, mineMonth: null, myLevels: {}, hanja: null, openUnits: {},
      econRaw: null, acct: null, accts: {}, store: {}, storeContrib: {}, jobs: {}, market: {}, gov: null, quests: {}, boards: {}, secTab: {},
    });
  }
  async function logout() { await B.signOut(); }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-act="logout"]')) logout(); });

  /* ───────────── 학생 화면 ───────────── */
  // 위쪽 = 영역(티어·경제·퀘스트·판), 아래쪽 = 영역 안의 탭. 세 번째 값 = 선생님이 끌 수 있는 메뉴 이름
  const ST_SECS = [
    { k: 'tier', name: '🏆 티어', tabs: [['home', '🏠 홈'], ['rank', '📊 순위'], ['submit', '✍️ 기록하기'], ['hanja', '🀄 한자'], ['mine', '📋 내 점수'], ['fame', '🏆 명예의 전당']] },
    { k: 'econ', name: '💰 경제', tabs: [['wallet', '👛 내 지갑'], ['shop', '🛒 상점', 'shop'], ['bank', '🏦 은행', 'bank'], ['stock', '📈 주식', 'stock'], ['jobs', '💼 직업', 'jobs']] },
    { k: 'quest', name: '🎯 퀘스트', mod: 'QuestStudent', tabs: [['quest', '🎯 퀘스트', 'quest']] },
    { k: 'board', name: '📌 판', mod: 'BoardStudent', tabs: [['board', '📌 판', 'board']] },
  ];
  function stSecs() {
    const menus = window.Econ ? window.Econ.cfg().menus : {};
    return ST_SECS.filter((s) => !s.mod || window[s.mod])
      .map((s) => Object.assign({}, s, { tabs: s.tabs.filter((t) => !t[2] || menus[t[2]] !== false) }))
      .filter((s) => s.tabs.length);
  }
  function go(sec, tab) {
    S.secTab[S.sec] = S.tab;
    S.sec = sec;
    S.tab = tab || null;
    render();
    window.scrollTo(0, 0);
  }
  function renderStudentNav() {
    const secs = stSecs();
    const sec = secs.find((s) => s.k === S.sec) || secs[0];
    if (!sec.tabs.some((t) => t[0] === S.tab)) {
      const remembered = S.secTab[sec.k];
      S.tab = remembered && sec.tabs.some((t) => t[0] === remembered) ? remembered : sec.tabs[0][0];
    }
    S.sec = sec.k;
    const pending = Object.values(S.myEntries).filter((e) => e.status === 'pending').length;
    const badges = Object.assign({ submit: pending }, window.EconStudent ? window.EconStudent.badges() : {}, window.QuestStudent ? window.QuestStudent.badges() : {});
    const secBadge = (s) => s.tabs.reduce((n, t) => n + (badges[t[0]] || 0), 0);
    const cnt = (n) => (n ? `<span class="cnt">${n}</span>` : '');
    const secHtml = secs.length > 1 ? secs.map((s) => `<button data-sec="${s.k}" class="${s.k === sec.k ? 'on' : ''}">${s.name}${s.k !== sec.k ? cnt(secBadge(s)) : ''}</button>`).join('') : '';
    const tabHtml = sec.tabs.length > 1 ? sec.tabs.map(([k, name]) => `<button data-tab="${k}" class="${k === S.tab ? 'on' : ''}">${name}${cnt(badges[k])}</button>`).join('') : '';
    if ($('#st-secs').innerHTML !== secHtml) $('#st-secs').innerHTML = secHtml;
    if ($('#st-tabs').innerHTML !== tabHtml) $('#st-tabs').innerHTML = tabHtml;
    $('#st-tabs').classList.toggle('hidden', !tabHtml);
  }
  $('#st-secs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (b && b.dataset.sec !== S.sec) go(b.dataset.sec);
  });
  $('#st-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    S.secTab[S.sec] = S.tab;
    render();
  });

  function myRow(month) {
    const st = S.standings[month];
    return st && st.rows && st.rows[S.uid];
  }

  function renderStudent() {
    const me = S.users[S.uid];
    if (!me) return;
    $('#st-brand').innerHTML = `${emblem('gold')}<span class="brand-txt">${esc(S.className || '클래스')} 티어</span>`;
    $('#st-me').innerHTML = nameTag(S.uid);
    renderStudentNav();
    const main = $('#st-main');
    if (S.tab === 'hanja') { if (window.HanjaStudy) window.HanjaStudy.render(main); return; }
    for (const mod of ['EconStudent', 'QuestStudent', 'BoardStudent']) {
      if (window[mod] && window[mod].handles(S.tab)) { main.dataset.tab = S.tab; main.dataset.key = ''; window[mod].render(main, S.tab); return; }
    }
    const fn = { home: stHome, rank: stRank, submit: stSubmit, mine: stMine, fame: stFame }[S.tab];
    // 입력 중인 폼은 다시 그리지 않음 (선택지가 바뀐 경우에만 다시 그림)
    const formKey = JSON.stringify([S.pick, Object.keys(S.openUnits || {}), S.myLevels, Object.values(S.myEntries).filter((e) => e.status !== 'rejected').map((e) => [e.cat, e.aid || '', e.status, e.ts])]);
    if (S.tab === 'submit' && main.dataset.tab === 'submit' && main.dataset.key === formKey) { stSubmitList(); return; }
    main.dataset.key = S.tab === 'submit' ? formKey : '';
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
          ${rw && rw.text ? `<div style="margin-top:6px">🎁 보상: <b>${esc(rw.text)}</b> ${rw.given ? '<span class="pill good">받음</span>' : '<span class="pill warn">받을 예정</span>'}</div>` : ''}
          ${rw && rw.money && window.Econ ? `<div style="margin-top:6px">💰 보상금: <b>${window.Econ.won(rw.money)}</b> ${s.paidAt ? '<span class="pill good">받음</span>' : '<span class="pill warn">받을 예정</span>'}</div>` : ''}</div>`;
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
      ${svCard()}
      ${window.EconStudent ? window.EconStudent.homeCard() : ''}
      ${installCard()}
      <div class="grid3" style="margin-top:16px">
        <div class="stat"><div class="k">경쟁 활동 (수행평가·대회)</div><div class="v ${d && d.comp > 0 ? 'up' : d && d.comp < 0 ? 'down' : ''}">${d ? signed(d.comp) : 0}</div></div>
        <div class="stat"><div class="k">생활 점수 (칭찬·독서·과제·역할)</div><div class="v ${d && d.accum > 0 ? 'up' : d && d.accum < 0 ? 'down' : ''}">${d ? signed(d.accum) : 0}</div></div>
        <div class="stat"><div class="k">승인 대기 중인 기록</div><div class="v">${Object.values(S.myEntries).filter((e) => e.status === 'pending').length}건</div></div>
      </div>
      <div class="panel" style="margin-top:16px"><h3>🎖️ 나의 급수</h3><div class="grid3">
        ${['typing', 'recorder', 'hanja'].map((tk) => {
          const t = window.Tracks.TRACKS[tk];
          const cur = myLevel(tk);
          return `<div class="stat"><div class="k">${t.ic} ${t.name}</div><div class="v" style="font-size:1.3em">${esc(window.Tracks.levelName(tk, cur))}</div>
            <div class="muted" style="font-size:.8em;margin-top:4px">${cur < t.levels.length ? `다음: ${esc(t.levels[cur].name)}` : '최고 급수!'}</div></div>`;
        }).join('')}</div></div>
      <div class="panel" style="margin-top:16px"><h3>📘 티어는 이렇게 정해져요</h3>
        <div class="note">
          · 매달 1일, 모두 <b>1000점</b>에서 새로 시작해요. 월말에 선생님이 마감하면 그달 티어와 보상이 확정돼요.<br>
          · <b>수행평가·학급 대회</b>는 반 친구들과 결과를 비교해 점수가 오르내려요. 나보다 점수가 높은 친구보다 잘하면 더 많이 올라요.
            기준 점수가 있는 활동은 기준보다 잘하면 오르고, 못하면 내려가요.<br>
          · <b>등급 평가</b>는 ${T.GRADES.map((g) => `${g} ${st.gradePct[g] > 0 ? '+' : ''}${st.gradePct[g]}%`).join(' · ')} (활동의 기준 점수 기준)<br>
          · <b>단원평가</b>는 「기록하기」에서 내 점수를 입력하면 선생님이 확인해요.<br>
          · <b>칭찬, 독후감, 과제, 1인1역·봉사, 한자 매일 학습</b>은 할수록 점수가 쌓여요.<br>
          · <b>타자·리코더·한자 급수</b>가 오르면 +${st.cats.lvTyping.points}점 (한 달에 종목별 1번까지)<br>
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

  const CAT_IC = { unit: '📝', reading: '📚', homework: '✅', lvTyping: '⌨️', lvRecorder: '🎵', lvHanja: '🀄', hanjaDaily: '🀄', service: '🤝', praise: '👏', penalty: '⚠️' };
  const PICKS = [
    { k: 'unit', ic: '📝', t: '단원평가', d: '내 점수 입력 → 선생님 확인' },
    { k: 'reading', ic: '📚', t: '독후감', d: '이번 주 통과 O / X' },
    { k: 'homework', ic: '✅', t: '과제·숙제', d: '완료한 과제 기록' },
    { k: 'levelup', ic: '⬆️', t: '승급 심사', d: '타자·리코더 다음 급수' },
  ];
  function approvedCount(cat, month) {
    return Object.values(S.myEntries).filter((e) => e.cat === cat && e.month === month && e.status === 'approved' && e.ox !== 'X').length;
  }
  function weekKey(ts) {
    const d = new Date(ts);
    const day = (d.getDay() + 6) % 7; // 월요일 = 0
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return `${mon.getFullYear()}-${mon.getMonth() + 1}-${mon.getDate()}`;
  }
  const myLevel = (track) => (track === 'hanja' ? (S.hanja && S.hanja.level) || 0 : (S.myLevels && S.myLevels[track]) || 0);
  function stSubmit() {
    const st = settings();
    const m = curMonth();
    const closed = !!(S.seasons[m] && S.seasons[m].closedAt);
    let form = '';
    if (S.pick === 'unit') {
      const done = new Set(Object.values(S.myEntries).filter((e) => e.cat === 'unit' && e.status !== 'rejected').map((e) => e.aid));
      const open = Object.entries(S.openUnits || {}).filter(([aid]) => !done.has(aid)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
      form = open.length ? `<form id="sub-form"><label>단원평가<select name="aid">${open.map(([aid, u]) => `<option value="${esc(aid)}">${esc(u.name)}</option>`).join('')}</select></label>
          <label>내 점수<input name="score" type="number" min="0" max="100" step="any" required inputmode="decimal" placeholder="예: 85"></label>
          <div class="foot"><button class="btn primary lg" type="submit">점수 제출</button></div></form>`
        : '<p class="empty">지금 입력할 단원평가가 없어요. 선생님이 단원평가를 열면 여기에 나타나요.</p>';
    } else if (S.pick === 'reading') {
      const wk = weekKey(B.now());
      const thisWeek = Object.values(S.myEntries).find((e) => e.cat === 'reading' && e.status !== 'rejected' && weekKey(e.ts) === wk);
      const c = st.cats.reading;
      form = thisWeek ? `<p class="empty">이번 주 독후감은 이미 제출했어요 (${esc(thisWeek.ox || '')}). 다음 주에 다시 제출해요.</p>`
        : `<p class="note">이번 주 독후감을 선생님께 통과받았나요? 통과(O)는 ${signed(c.points)}점${c.cap ? ` · 이번 달 ${approvedCount('reading', m)}/${c.cap}` : ''}</p>
          <div class="grid2"><button class="btn good lg" data-ox="O">⭕ 통과했어요</button><button class="btn lg" data-ox="X">❌ 아직 못 했어요</button></div>`;
    } else if (S.pick === 'homework') {
      const c = st.cats.homework;
      form = `<form id="sub-form"><label>과제 이름<input name="title" required maxlength="60" placeholder="예: 수학 익힘 42~43쪽"></label>
        <p class="note">${signed(c.points)}점${c.cap ? ` · 이번 달 ${approvedCount('homework', m)}/${c.cap}` : ''}</p>
        <div class="foot"><button class="btn primary lg" type="submit">과제 완료 제출</button></div></form>`;
    } else {
      const TR = window.Tracks.TRACKS;
      form = ['typing', 'recorder'].map((tk) => {
        const t = TR[tk];
        const cur = myLevel(tk);
        const next = t.levels[cur];
        const pending = Object.values(S.myEntries).some((e) => e.cat === t.cat && e.status === 'pending');
        return `<div class="stat" style="margin-bottom:10px"><div class="k">${t.ic} ${t.name} · 현재 <b style="color:var(--text)">${esc(window.Tracks.levelName(tk, cur))}</b></div>
          ${next ? `<div style="margin:6px 0"><b>다음: ${esc(next.name)}</b>${next.songs ? ` <span class="muted">(${esc(next.songs)})</span>` : ''}<br><span class="muted">${esc(next.cond)}</span></div>
            ${pending ? '<span class="pill warn">심사 신청함 — 선생님 확인 대기</span>' : `<button class="btn primary" data-lv="${tk}">${esc(next.name)} 승급 심사 신청</button>`}`
            : '<div style="margin-top:6px">🏆 최고 급수 달성!</div>'}</div>`;
      }).join('') + `<p class="note">선생님 앞에서 심사를 통과하면 선생님이 승인해 줘요. 승급하면 ${signed(st.cats.lvTyping.points)}점 (한 달에 트랙별 1번까지)</p>`;
    }
    return `<div class="panel"><h3>✍️ 기록하기 <span class="muted">선생님이 확인하면 점수에 반영돼요</span></h3>
      ${closed ? `<p class="empty">${esc(T.monthLabel(m))}은 이미 마감되었어요. 다음 달 1일부터 다시 기록할 수 있어요.</p>` : `
      <div class="cat-pick four">${PICKS.map((p) => `<button data-pick="${p.k}" class="${S.pick === p.k ? 'on' : ''}"><span class="ic">${p.ic}</span><span class="t">${p.t}</span><span class="d">${p.d}</span></button>`).join('')}</div>
      <div id="sub-body">${form}</div>`}
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
      <span>${CAT_IC[e.cat] || ''} <b>${esc(e.cat === 'unit' ? '단원평가' : st.cats[e.cat] ? st.cats[e.cat].name : e.cat)}</b> · ${esc(e.text)}</span>
      ${e.status === 'rejected' && e.reason ? `<span class="muted" style="font-size:.85em">사유: ${esc(e.reason)}</span>` : ''}
      <span class="right"><span class="muted" style="font-size:.85em">${fmtDate(e.ts)}</span>${e.status === 'pending' ? `<button class="btn xs ghost" data-del="${e.id}">취소</button>` : ''}</span></li>`).join('')
      || '<li class="empty">아직 기록이 없어요</li>';
  }
  function bindSubmit() {
    stSubmitList();
    $$('[data-pick]').forEach((b) => (b.onclick = () => { S.pick = b.dataset.pick; $('#st-main').dataset.tab = ''; render(); }));
    const submit = async (data, btn) => {
      if (btn) btn.disabled = true;
      try {
        await B.set(`entries/${S.uid}/${B.newKey()}`, Object.assign({ month: curMonth(), ts: B.now(), by: 'student', status: 'pending' }, data));
        toast('제출했어요! 선생님이 확인하면 점수에 반영돼요.', 'good');
        $('#st-main').dataset.tab = '';
        render();
      } catch (err) { toast(err.message, 'bad'); if (btn) btn.disabled = false; }
    };
    const f = $('#sub-form');
    if (f) f.onsubmit = (e) => {
      e.preventDefault();
      const btn = f.querySelector('button');
      if (S.pick === 'unit') {
        const u = S.openUnits[f.aid.value];
        const score = Number(f.score.value);
        if (!u || !isFinite(score) || score < 0 || score > 100) return toast('점수를 0~100 사이로 입력하세요.', 'bad');
        submit({ cat: 'unit', aid: f.aid.value, score, text: `${u.name} ${score}점` }, btn);
      } else if (S.pick === 'homework') {
        const title = f.title.value.trim();
        if (title) submit({ cat: 'homework', text: title }, btn);
      }
    };
    $$('[data-ox]').forEach((b) => (b.onclick = () => submit({ cat: 'reading', ox: b.dataset.ox, text: `이번 주 독후감 ${b.dataset.ox === 'O' ? '통과 ⭕' : '미통과 ❌'}` }, b)));
    $$('[data-lv]').forEach((b) => (b.onclick = () => {
      const tk = b.dataset.lv;
      const t = window.Tracks.TRACKS[tk];
      const next = myLevel(tk) + 1;
      submit({ cat: t.cat, track: tk, level: next, text: `${t.name} ${t.levels[next - 1].name} 승급 심사` }, b);
    }));
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

  /* ───────────── 1인1역 = 직업: 학생이 오늘 역할을 스스로 체크 → 선생님 확인 ───────────── */
  // 기록 키: svd{한국 날짜 번호} — 선생님 체크와 같은 키라 하루에 한 번만 인정
  const svKey = (t) => 'svd' + Math.floor((t + 9 * 3600e3) / 864e5);
  const myJobTitles = () => Object.values(S.jobs || {}).filter((j) => j && j.on !== false && j.mem && j.mem[S.uid]).map((j) => j.t);
  function svCard() {
    if (settings().svMode !== 'student' || S.isTeacher) return '';
    const jobs = myJobTitles();
    if (!jobs.length) return '';
    const e = S.myEntries[svKey(B.now())];
    const closed = !!(S.seasons[curMonth()] && S.seasons[curMonth()].closedAt);
    let right;
    if (e && e.status === 'approved') right = '<span class="pill good">✅ 선생님이 확인했어요</span>';
    else if (e && e.status === 'pending') right = '<span class="pill warn">🕒 선생님 확인 기다리는 중</span><button class="btn xs ghost" data-svcancel="1">취소</button>';
    else if (e) right = `<span class="pill">선생님께 말씀드려요${e.reason ? ` (${esc(e.reason)})` : ''}</span>`;
    else right = closed ? '<span class="muted">이번 달은 마감되었어요</span>' : '<button class="btn primary" data-svdo="1">🤝 오늘 역할 다 했어요!</button>';
    return `<div class="panel sv-card" style="margin-top:16px"><span class="wc-ic">🤝</span><div><div class="muted">오늘의 1인1역</div><b>${jobs.map(esc).join(', ')}</b></div><span class="sp"></span>${right}</div>`;
  }
  document.addEventListener('click', async (e) => {
    if (S.screen !== 'student') return;
    const d = e.target.closest('[data-svdo]');
    if (d) {
      d.disabled = true;
      try {
        await B.set(`entries/${S.uid}/${svKey(B.now())}`, { cat: 'service', text: `1인1역: ${myJobTitles().join(', ')}`, month: curMonth(), ts: B.now(), by: 'student', status: 'pending' });
        toast('잘했어요! 선생님이 확인하면 1인1역 점수를 받아요.', 'good');
      } catch (err) { d.disabled = false; toast(/권한/.test(err.message) ? '지금은 체크할 수 없어요. 선생님께 말씀드려요.' : err.message, 'bad'); }
      return;
    }
    if (e.target.closest('[data-svcancel]')) await B.remove(`entries/${S.uid}/${svKey(B.now())}`).catch((err) => toast(err.message, 'bad'));
  });

  /* ───────────── 앱으로 설치 (홈 화면·바탕화면 아이콘) ───────────── */
  let installEvt = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canInstall = () => !standalone() && (!!installEvt || isIOS());
  function syncInstall() { $$('[data-install]').forEach((b) => b.classList.toggle('hidden', !canInstall())); }
  function installCard() {
    if (!canInstall()) return '';
    return `<div class="panel install-card" style="margin-top:16px"><span class="wc-ic">📲</span><div><b>앱으로 설치하기</b><div class="muted" style="font-size:.88em">태블릿 바탕화면에 아이콘이 생겨서 바로 열 수 있어요</div></div><span class="sp"></span><button class="btn primary sm" data-install="1">설치</button></div>`;
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; syncInstall(); render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; syncInstall(); render(); toast('설치했어요! 바탕화면의 「클래스 티어」 아이콘으로 열 수 있어요.', 'good'); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-install]');
    if (!b) return;
    if (installEvt) {
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (err) { /* 무시 */ }
      installEvt = null;
      syncInstall();
      render();
    } else {
      modal(`<h3>📲 홈 화면에 추가하기</h3><ol class="note" style="font-size:1em;line-height:1.9;padding-left:1.2em">
        <li>Safari 아래(또는 위)의 <b>공유 버튼</b>(네모에서 화살표가 나온 모양)을 눌러요.</li>
        <li><b>홈 화면에 추가</b>를 눌러요.</li><li>오른쪽 위 <b>추가</b>를 누르면 바탕화면에 아이콘이 생겨요.</li></ol>
        <p class="note">크롬에서는 주소창 오른쪽의 설치 아이콘이나 메뉴(⋮) → <b>앱 설치</b>(홈 화면에 추가)를 눌러요.</p>
        <div class="foot"><button class="btn" data-close>알겠어요</button></div>`);
    }
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.info('[앱 설치] 서비스 워커 등록 실패', e)));
  }

  window.App = {
    S, B, T, $, $$, esc, emblem, tierChip, tierName, nameTag, nameOf, badgeTier, liveTier, lastSeasonKey,
    toast, modal, confirmBox, fmtDate, fmtTime, signed, settings, curMonth, render, show, logout, go, svCard, svKey, syncInstall,
  };
  window.addEventListener('DOMContentLoaded', () => { syncInstall(); boot(); });
})();

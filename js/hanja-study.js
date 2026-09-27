/* 한자 학습 (학생) — 7급 150자, 개인 진도
   · 매일 학습: 새 한자 카드(획순 애니메이션·따라 쓰기) → 퀴즈(새 한자 + 복습) → 80% 이상이면 완료(+1점, 하루 1번)
   · 학교에서만: 설정된 요일·시간에만 학습·시험 가능 (가정 학습 불인정)
   · 승급 시험: 현재 급수의 한자를 모두 배우면 개인별로 응시. 문항 수에 따라 통과 기준 90/80/70%. 떨어지면 다음 날 재도전
   · 복습: 틀린 한자는 다음 날, 맞힌 한자는 3일·7일·14일 뒤 다시 나옴 */
(function () {
  const A = window.App;
  const { S, B, T, $, esc, toast } = A;
  const H = window.Hanja;
  const HW_SRC = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.7/dist/hanzi-writer.min.js';
  const GAPS = [1, 3, 7, 14];

  let HS = { mode: 'home' };
  let lastKey = '';
  let hwLoading = null;

  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const today = () => dayStr(B.now());
  const addDays = (n) => dayStr(B.now() + n * 86400000);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const huneum = (x) => `${x.hun} ${x.eum}`;
  const plainMean = (m) => m.replace(/\s*\([^)]*읽어요\)/, '');
  // 한자어 목록: 배우는 한자를 강조하고 읽기·뜻을 함께 보여줌 (문해력)
  const wordList = (x) => `<div class="hj-words">${x.words.map((w) => `<div><b>${[...w.word].map((c) => (c === x.h ? `<em>${esc(c)}</em>` : esc(c))).join('')}</b><span class="rd">${esc(w.read)}</span><span class="mn">${esc(w.mean)}</span></div>`).join('')}</div>`;
  const prog = () => Object.assign({ learned: 0, level: 0, review: {} }, S.hanja || {});

  function windowInfo() {
    const h = A.settings().hanja;
    const d = new Date(B.now());
    const mins = d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = h.start.split(':').map(Number), [eh, em] = h.end.split(':').map(Number);
    const okDay = (h.days || []).includes(d.getDay());
    const ok = okDay && mins >= sh * 60 + sm && mins <= eh * 60 + em;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return { ok, text: `${(h.days || []).map((x) => days[x]).join('·')} ${h.start}~${h.end}` };
  }
  function levelRange(level) {
    const start = level === 0 ? 0 : H.BOUNDS[level - 1];
    return { start, end: H.BOUNDS[Math.min(level, H.BOUNDS.length - 1)] };
  }

  function loadWriter() {
    if (window.HanziWriter) return Promise.resolve(true);
    if (!hwLoading) hwLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = HW_SRC; s.onload = () => res(true); s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    return hwLoading;
  }
  // 획순 애니메이션 (데이터가 없는 글자는 정적 글자로 표시)
  async function mountGlyph(el, ch, mode) {
    el.innerHTML = `<span class="static">${esc(ch)}</span>`;
    const ok = await loadWriter();
    if (!ok || !el.isConnected) return null;
    let failed = false;
    const w = window.HanziWriter.create(el, ch, {
      width: 200, height: 200, padding: 14, showOutline: true, strokeColor: '#1d1d22', outlineColor: '#d9ccb0',
      strokeAnimationSpeed: 1, delayBetweenStrokes: 250, drawingColor: '#1f5bff', highlightColor: '#2fd08a',
      onLoadCharDataError: () => { failed = true; },
      onLoadCharDataSuccess: () => { const st = el.querySelector('.static'); if (st) st.remove(); },
    });
    if (failed) return null;
    if (mode === 'quiz') w.quiz({ showHintAfterMisses: 2, onComplete: () => toast('잘 썼어요! 👏', 'good') });
    else w.animateCharacter();
    return w;
  }

  /* ───── 문제 만들기 ───── */
  function makeQuestion(x, learnedSet) {
    const types = ['hun', 'char', 'meaning'];
    const words = x.words.filter((w) => [...w.word].every((c) => learnedSet.has(c)));
    if (words.length) types.push('word');
    const type = types[Math.floor(Math.random() * types.length)];
    const others = shuffle(H.LIST.filter((y) => y.h !== x.h));
    if (type === 'hun') {
      const opts = [huneum(x)];
      for (const y of others) { if (opts.length >= 4) break; if (!opts.includes(huneum(y))) opts.push(huneum(y)); }
      return { type, x, prompt: '이 한자의 뜻과 소리는?', show: x.h, opts: shuffle(opts), answer: huneum(x) };
    }
    if (type === 'char') {
      const opts = [x.h, ...others.slice(0, 3).map((y) => y.h)];
      return { type, x, prompt: '뜻과 소리에 맞는 한자는?', show: huneum(x), opts: shuffle(opts), answer: x.h };
    }
    if (type === 'meaning') {
      // 뜻풀이를 보고 알맞은 낱말 고르기 (보기: 읽기 + 한자)
      const w = x.words[Math.floor(Math.random() * x.words.length)];
      const label = (ww) => `${ww.read} ${ww.word}`;
      const opts = [label(w)];
      // 뜻이 같은 다른 낱말(예: 인간·인물 = 사람)은 보기에서 제외
      for (const y of others) for (const ww of y.words) { if (opts.length >= 4) break; if (ww.read !== w.read && plainMean(ww.mean) !== plainMean(w.mean) && !opts.includes(label(ww))) opts.push(label(ww)); }
      return { type, x, prompt: '다음 뜻을 가진 낱말은?', show: plainMean(w.mean), opts: shuffle(opts), answer: label(w) };
    }
    const w = words[Math.floor(Math.random() * words.length)];
    const reads = [w.read];
    for (const y of others) for (const ww of y.words) { if (reads.length >= 4) break; if (!reads.includes(ww.read) && ww.read.length === w.read.length) reads.push(ww.read); }
    for (const y of others) for (const ww of y.words) { if (reads.length >= 4) break; if (!reads.includes(ww.read)) reads.push(ww.read); }
    return { type, x, prompt: '이 한자어를 바르게 읽은 것은?', show: w.word, opts: shuffle(reads), answer: w.read };
  }
  function pickReviews(p, n, exclude) {
    const t = today();
    const learned = H.LIST.slice(0, p.learned).filter((x) => !exclude.has(x.h));
    const due = learned.filter((x) => !p.review[x.h] || p.review[x.h].due <= t)
      .sort((a, b) => ((p.review[a.h] || {}).due || '').localeCompare((p.review[b.h] || {}).due || ''));
    const out = due.slice(0, n);
    if (out.length < n) for (const x of shuffle(learned.filter((y) => !out.includes(y)))) { if (out.length >= n) break; out.push(x); }
    return out;
  }

  /* ───── 화면 ───── */
  function render(main) {
    const p = prog();
    const key = JSON.stringify([HS.mode, HS.step, HS.i, p.learned, p.level, p.lastDone, p.failDay, windowInfo().ok, A.settings().hanja]);
    if (main.dataset.tab === 'hanja' && key === lastKey) return;
    // 학습·시험 도중에는 진행 화면을 유지
    if (main.dataset.tab === 'hanja' && HS.mode !== 'home') return;
    lastKey = key;
    main.dataset.tab = 'hanja';
    main.dataset.key = '';
    if (HS.mode === 'home') drawHome(main); else drawSession(main);
  }
  function redraw() { lastKey = ''; const m = $('#st-main'); m.dataset.tab = ''; if (HS.mode === 'home') render(m); else { m.dataset.tab = 'hanja'; drawSession(m); } }

  function drawHome(main) {
    const p = prog();
    const st = A.settings();
    const win = windowInfo();
    const t = today();
    const lv = p.level;
    const done = lv >= H.LEVELS.length;
    const range = levelRange(lv);
    const doneToday = p.lastDone === t;
    const testReady = !done && p.learned >= range.end;
    const nq = done ? 0 : st.hanja.testCount[lv] || 20;
    const rate = Math.round(T.passRate(nq) * 100);
    const learnedSet = new Set(H.LIST.slice(0, p.learned).map((x) => x.h));
    main.innerHTML = `
      <div class="panel"><div class="hero">
        <div class="info"><span class="month-pill">🀄 한자 7급 과정 · 150자</span>
          <div class="muted" style="margin-top:8px">나의 한자 급수</div>
          <div class="tier-name" style="font-size:1.8em">${esc(window.Tracks.levelName('hanja', lv))}</div>
          <div>배운 한자 <b>${p.learned}</b> / 150자 ${done ? '· 🎉 7급 과정 완료!' : `· 지금 단계: <b>${H.LEVELS[lv]}</b> (${p.learned - range.start}/${range.end - range.start}자)`}</div>
          <div class="hj-progress"><i style="width:${(p.learned / 150) * 100}%"></i></div>
          <div class="hj-steps">${H.LEVELS.map((n, i) => `<span class="${i < lv ? 'done' : i === lv ? 'on' : ''}">${i < lv ? '✓ ' : ''}${n}</span>`).join('')}</div>
        </div></div></div>
      <div class="grid2" style="margin-top:16px">
        <div class="panel"><h3>📖 오늘의 학습</h3>
          ${doneToday ? `<p>오늘 학습을 마쳤어요 ✅ <span class="pill good">+${st.cats.hanjaDaily.points}점</span></p><p class="note">내일 또 만나요!</p>`
            : !win.ok ? `<p class="empty">지금은 학습 시간이 아니에요.<br>한자 학습은 <b>학교에서</b> ${esc(win.text)}에 할 수 있어요.</p>`
            : `<p class="note">${testReady || done ? '새 한자 없이 <b>복습 퀴즈</b>를 풀어요.' : `새 한자 <b>${Math.min(st.hanja.daily, range.end - p.learned)}자</b>를 배우고 퀴즈를 풀어요.`} 80% 이상 맞히면 완료! (+${st.cats.hanjaDaily.points}점)</p>
               <button class="btn primary lg" data-hs="study">오늘의 학습 시작</button>`}
        </div>
        <div class="panel"><h3>🏅 승급 시험</h3>
          ${done ? '<p>모든 급수를 통과했어요! 🎉</p>'
            : !testReady ? `<p class="note">${H.LEVELS[lv]} 한자 ${range.end - range.start}자를 모두 배우면 시험을 볼 수 있어요. (지금 ${p.learned - range.start}자)</p>`
            : p.failDay === t ? '<p class="note">오늘은 이미 도전했어요. <b>내일 다시</b> 도전해요! 복습하면서 준비해 봐요.</p>'
            : !win.ok ? `<p class="empty">승급 시험도 학교에서 ${esc(win.text)}에만 볼 수 있어요.</p>`
            : `<p><b>${H.LEVELS[lv]} 승급 시험</b> · ${nq}문항 · <b>${rate}%</b> 이상(${Math.ceil(nq * T.passRate(nq))}문항) 맞히면 통과</p>
               <p class="note">통과하면 급수가 오르고 +${st.cats.lvHanja.points}점!</p><button class="btn good lg" data-hs="test">시험 시작</button>`}
        </div>
      </div>
      <div class="panel" style="margin-top:16px"><h3>📚 내가 배운 한자 <span class="muted">누르면 획순을 볼 수 있어요</span></h3>
        <div class="hj-chars">${H.LIST.map((x) => `<div class="${learnedSet.has(x.h) ? '' : 'locked'}" ${learnedSet.has(x.h) ? `data-view="${x.h}"` : ''}><b>${x.h}</b><span>${learnedSet.has(x.h) ? esc(huneum(x)) : x.levelName}</span></div>`).join('')}</div>
      </div>`;
    main.onclick = (e) => {
      const b = e.target.closest('[data-hs]');
      if (b) { if (b.dataset.hs === 'study') startStudy(); else startTest(); return; }
      const v = e.target.closest('[data-view]');
      if (v) viewChar(v.dataset.view);
    };
  }
  function viewChar(ch) {
    const x = H.BY[ch];
    const m = A.modal(`<div class="hj-card"><div class="hj-glyph" id="hv-g"></div>
      <div class="hj-info"><div class="muted">${x.levelName}</div><div class="hun">${esc(huneum(x))}</div>
      ${wordList(x)}
      <div class="foot" style="justify-content:flex-start"><button class="btn sm" id="hv-a">획순 다시 보기</button><button class="btn sm" id="hv-q">따라 쓰기</button></div></div></div>
      <div class="foot"><button class="btn" data-close>닫기</button></div>`, { wide: true });
    const g = m.el.querySelector('#hv-g');
    mountGlyph(g, ch, 'anim');
    m.el.querySelector('#hv-a').onclick = () => mountGlyph(g, ch, 'anim');
    m.el.querySelector('#hv-q').onclick = () => mountGlyph(g, ch, 'quiz');
  }

  /* ───── 매일 학습 ───── */
  function startStudy() {
    if (!windowInfo().ok) return toast('지금은 학습 시간이 아니에요.', 'bad');
    const p = prog();
    const st = A.settings();
    const range = levelRange(p.level);
    const newOnes = p.level < H.LEVELS.length && p.learned < range.end ? H.LIST.slice(p.learned, Math.min(p.learned + st.hanja.daily, range.end)) : [];
    const learnedSet = new Set(H.LIST.slice(0, p.learned + newOnes.length).map((x) => x.h));
    const reviews = pickReviews(p, newOnes.length ? 3 : 8, new Set(newOnes.map((x) => x.h)));
    const qs = shuffle([...newOnes, ...reviews].map((x) => makeQuestion(x, learnedSet)));
    HS = { mode: 'study', step: newOnes.length ? 'cards' : 'quiz', i: 0, cards: newOnes, qs, results: [], isNew: new Set(newOnes.map((x) => x.h)) };
    redraw();
  }
  /* ───── 승급 시험 ───── */
  function startTest() {
    if (!windowInfo().ok) return toast('지금은 시험 시간이 아니에요.', 'bad');
    const p = prog();
    const st = A.settings();
    const n = st.hanja.testCount[p.level] || 20;
    const range = levelRange(p.level);
    const cur = H.LIST.slice(range.start, range.end);
    const prev = H.LIST.slice(0, range.start);
    const nPrev = prev.length ? Math.round(n * 0.2) : 0;
    const pool = [...shuffle(cur.slice()).slice(0, n - nPrev), ...shuffle(prev.slice()).slice(0, nPrev)];
    while (pool.length < n) pool.push(cur[Math.floor(Math.random() * cur.length)]);
    const learnedSet = new Set(H.LIST.slice(0, range.end).map((x) => x.h));
    HS = { mode: 'test', step: 'quiz', i: 0, qs: shuffle(pool).map((x) => makeQuestion(x, learnedSet)), results: [] };
    redraw();
  }

  function drawSession(main) {
    main.onclick = null;
    if (HS.step === 'cards') return drawCard(main);
    if (HS.step === 'quiz') return drawQuestion(main);
    return drawResult(main);
  }
  function header(title, cur, total) {
    return `<div class="a-head"><h2>${title}</h2><span class="sp"></span><button class="btn sm ghost" id="hs-quit">그만하기</button></div>
      <div class="hj-progress"><i style="width:${(cur / total) * 100}%"></i></div>`;
  }
  function bindQuit() {
    const q = $('#hs-quit');
    if (q) q.onclick = async () => {
      if (!(await A.confirmBox('그만할까요?', HS.mode === 'test' ? '지금 그만두면 시험이 저장되지 않아요.' : '지금 그만두면 오늘 학습이 저장되지 않아요.', '그만하기'))) return;
      HS = { mode: 'home' };
      redraw();
    };
  }
  function drawCard(main) {
    const x = HS.cards[HS.i];
    main.innerHTML = `<div class="panel">${header(`📖 새 한자 ${HS.i + 1} / ${HS.cards.length}`, HS.i, HS.cards.length + HS.qs.length)}
      <div class="hj-card"><div class="hj-glyph" id="hs-g"></div>
        <div class="hj-info"><div class="muted">${x.levelName}</div><div class="hun">${esc(huneum(x))}</div>
          ${wordList(x)}
          <div class="foot" style="justify-content:flex-start"><button class="btn sm" id="hs-a">🔁 획순 다시 보기</button><button class="btn sm" id="hs-q">✍️ 따라 쓰기</button></div>
        </div></div>
      <div class="foot"><button class="btn primary lg" id="hs-next">${HS.i + 1 < HS.cards.length ? '다음 한자 →' : '퀴즈 풀기 →'}</button></div></div>`;
    const g = $('#hs-g');
    mountGlyph(g, x.h, 'anim');
    $('#hs-a').onclick = () => mountGlyph(g, x.h, 'anim');
    $('#hs-q').onclick = () => mountGlyph(g, x.h, 'quiz');
    $('#hs-next').onclick = () => { HS.i++; if (HS.i >= HS.cards.length) { HS.step = 'quiz'; HS.i = 0; } drawSession($('#st-main')); };
    bindQuit();
  }
  function drawQuestion(main) {
    const q = HS.qs[HS.i];
    const test = HS.mode === 'test';
    const doneBefore = HS.mode === 'study' ? HS.cards.length : 0;
    const hanOpts = q.type === 'char';
    main.innerHTML = `<div class="panel">${header(test ? `🏅 승급 시험 ${HS.i + 1} / ${HS.qs.length}` : `✏️ 퀴즈 ${HS.i + 1} / ${HS.qs.length}`, doneBefore + HS.i, doneBefore + HS.qs.length)}
      <div class="hj-q"><div class="prompt">${esc(q.prompt)}</div><div class="big ${q.type === 'char' ? 'txt' : q.type === 'meaning' ? 'mean' : ''}">${esc(q.show)}</div>
        <div class="hj-opts">${q.opts.map((o) => `<button class="${hanOpts ? 'han' : ''}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div></div></div>`;
    bindQuit();
    let answered = false;
    $$('.hj-opts button').forEach((b) => (b.onclick = () => {
      if (answered) return;
      answered = true;
      const ok = b.dataset.o === q.answer;
      HS.results.push({ q, ok, chosen: b.dataset.o });
      const next = () => { HS.i++; if (HS.i >= HS.qs.length) HS.step = 'result'; drawSession($('#st-main')); };
      if (test) { b.classList.add('ok'); setTimeout(next, 180); return; }
      // 연습에서는 정답을 바로 보여줌
      $$('.hj-opts button').forEach((x) => { if (x.dataset.o === q.answer) x.classList.add('ok'); });
      if (!ok) b.classList.add('no');
      setTimeout(next, ok ? 600 : 1300);
    }));
  }
  function $$(s) { return [...document.querySelectorAll(s)]; }

  async function drawResult(main) {
    const total = HS.results.length;
    const right = HS.results.filter((r) => r.ok).length;
    const p = prog();
    const st = A.settings();
    const t = today();
    let passed, msg;
    if (HS.mode === 'study') {
      passed = right / total >= 0.8;
      msg = passed ? (p.lastDone === t ? '오늘 학습은 이미 완료했어요. 복습 잘했어요!' : `오늘 학습 완료! +${st.cats.hanjaDaily.points}점`) : '80% 이상 맞혀야 완료돼요. 다시 도전해 봐요!';
    } else {
      const need = Math.ceil(total * T.passRate(total));
      passed = right >= need;
      msg = passed ? `🎉 ${H.LEVELS[p.level]} 승급! +${st.cats.lvHanja.points}점` : `${need}문항 이상 맞혀야 통과예요. 내일 다시 도전해요!`;
    }
    const wrong = HS.results.filter((r) => !r.ok);
    main.innerHTML = `<div class="panel" style="text-align:center"><div style="font-size:3em">${passed ? '🎉' : '💪'}</div>
      <h2 style="margin:.2em 0">${right} / ${total} 정답 (${Math.round((right / total) * 100)}%)</h2><p style="font-size:1.1em"><b>${esc(msg)}</b></p>
      ${wrong.length ? `<div style="text-align:left;margin-top:14px"><h3>틀린 문제 다시 보기</h3><ul class="rows">${wrong.map((r) => `<li><b style="font-family:'Noto Serif KR',serif;font-size:1.4em">${esc(r.q.x.h)}</b><span>${esc(huneum(r.q.x))}</span><span class="right muted">${esc(r.q.show)} → 정답 ${esc(r.q.answer)}</span></li>`).join('')}</ul></div>` : ''}
      <div class="foot" style="justify-content:center">${!passed && HS.mode === 'study' ? '<button class="btn primary" id="hs-retry">다시 풀기</button>' : ''}<button class="btn" id="hs-home">한자 홈으로</button></div></div>`;
    $('#hs-home').onclick = () => { HS = { mode: 'home' }; redraw(); };
    const rt = $('#hs-retry');
    if (rt) rt.onclick = () => { HS.qs = shuffle(HS.qs.map((q) => makeQuestion(q.x, new Set(H.LIST.slice(0, prog().learned + (HS.cards || []).length).map((x) => x.h))))); HS.results = []; HS.i = 0; HS.step = 'quiz'; drawSession($('#st-main')); };
    if (HS.saved) return;
    HS.saved = true;
    try { await save(passed, right, total); } catch (err) { toast(err.message, 'bad'); }
  }

  async function save(passed, right, total) {
    const p = prog();
    const t = today();
    const now = B.now();
    const month = T.monthKey(now);
    const upd = {};
    if (HS.mode === 'study') {
      // 복습 간격 갱신 (통과 여부와 관계없이)
      const review = Object.assign({}, p.review || {});
      for (const r of HS.results) {
        const cur = review[r.q.x.h] || { box: 0 };
        const box = r.ok ? Math.min(cur.box + 1, 3) : 0;
        review[r.q.x.h] = { box, due: addDays(GAPS[r.ok ? box : 0]) };
      }
      upd[`hanja/${S.uid}/review`] = review;
      if (!passed) { await B.update('', upd); return; }
      if (p.lastDone !== t) {
        upd[`hanja/${S.uid}/learned`] = p.learned + HS.cards.length;
        upd[`hanja/${S.uid}/lastDone`] = t;
        upd[`entries/${S.uid}/hd-${t}`] = { cat: 'hanjaDaily', text: `한자 매일 학습 (${HS.cards.length ? HS.cards.map((x) => x.h).join('') : '복습'} · ${right}/${total})`, month, ts: now, by: 'system', status: 'approved' };
      }
    } else {
      if (passed) {
        const lv = p.level + 1;
        upd[`hanja/${S.uid}/level`] = lv;
        upd[`entries/${S.uid}/hl-${lv}`] = { cat: 'lvHanja', text: `한자 ${H.LEVELS[lv - 1]} 승급 (${right}/${total})`, month, ts: now, by: 'system', status: 'approved' };
      } else upd[`hanja/${S.uid}/failDay`] = t;
      upd[`hanja/${S.uid}/lastTest`] = { ts: now, level: p.level, right, total, passed };
    }
    if (Object.keys(upd).length) await B.update('', upd);
  }

  window.HanjaStudy = { render, reset() { HS = { mode: 'home' }; lastKey = ''; } };
})();

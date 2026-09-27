/* 수페(soopeh)에서 가져오기 — 선생님이 이 컴퓨터에 저장해 둔 soopeh-export.json 파일을 골라 가져옵니다.
   학생 이름으로 짝을 맞추고, 상점·직업·증권·퀘스트·은행 설정과 학생별 잔액·예금·주식·아이템·직업·신용 등급·아바타를 옮깁니다.
   여러 번 가져와도 같은 이름의 상품·직업·증권·퀘스트는 새로 만들지 않고 고칩니다. (잔액은 파일 값으로 맞춰짐)
   파일은 서버나 GitHub에 올라가지 않고, 이 브라우저에서만 읽습니다. */
(function () {
  const A = window.App, E = window.Econ, TC = window.Teacher;
  const { S, B, $, esc, nameOf, toast, modal, confirmBox, fmtTime } = A;
  let data = null, fileName = '', map = {}, busy = false;
  const main = () => $('#tc-main');
  const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
  const ICONS = [[/태블릿/, '📱'], [/초코/, '🍪'], [/로또/, '🎟️'], [/악력/, '💪'], [/마이쮸|사탕|젤리/, '🍬'], [/자리/, '💺'], [/급식/, '🍱'], [/물/, '💧'], [/화장실/, '🚻'], [/식비/, '🍚'], [/공과금|전기|수도/, '💡'], [/월세|집/, '🏠']];
  const iconFor = (n) => (ICONS.find(([re]) => re.test(n)) || [0, '🎁'])[1];

  function autoMatch() {
    map = {};
    const byName = {};
    for (const u of Object.keys(S.users)) byName[norm(nameOf(u))] = u;
    for (const s of data.students) if (byName[norm(s.name)]) map[s.no] = byName[norm(s.name)];
  }

  TC.addTab('import', '수페에서 가져오기', () => {
    main().innerHTML = `<div class="a-head"><h2>수페에서 가져오기</h2><span class="muted">soopeh.com에서 쓰던 학급 경제를 그대로 옮겨요</span></div>
      <div class="panel"><h3>1. 파일 고르기</h3>
        <p class="note" style="margin-top:0">이 컴퓨터의 <b>문서\\class-tier-migration\\soopeh-export.json</b> 파일을 고르세요. 파일은 이 브라우저에서만 읽고, 학생 개인 정보는 GitHub 등 인터넷에 올라가지 않아요.</p>
        <input type="file" id="im-file" accept=".json,application/json"><span class="muted" id="im-fname"></span></div>
      <div id="im-body"></div>`;
    $('#im-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.source !== 'soopeh' || !Array.isArray(j.students)) throw new Error('수페에서 내보낸 파일이 아니에요.');
        data = j; fileName = f.name;
        autoMatch();
        $('#im-body').dataset.k = '';
        A.render();
      } catch (err) { toast(err.message || '파일을 읽지 못했어요.', 'bad'); }
    };
    main().onchange = (e) => {
      const s = e.target.closest('[data-map]');
      if (s) { if (s.value) map[s.dataset.map] = s.value; else delete map[s.dataset.map]; $('#im-body').dataset.k = ''; A.render(); }
    };
    main().onclick = (e) => {
      if (e.target.closest('#im-go')) run();
      if (e.target.closest('#im-create')) createStudents();
    };
  }, () => {
    const body = $('#im-body');
    if (!data) { body.innerHTML = ''; return; }
    const key = JSON.stringify([fileName, map, Object.keys(S.users).length, !!(E.cfg().imported)]);
    if (body.dataset.k === key) return;
    body.dataset.k = key;
    $('#im-fname').textContent = ` ${fileName} · ${fmtTime(Date.parse(data.exportedAt) || Date.now())} 내보냄`;
    const used = new Set(Object.values(map));
    const unmatched = data.students.filter((s) => !map[s.no]);
    const jobs = data.jobs.filter((j) => !j.teacherOnly);
    const imp = E.cfg().imported;
    const opts = (no) => `<option value="">(가져오지 않음)</option>${Object.keys(S.users).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ko')).map((u) => `<option value="${u}" ${map[no] === u ? 'selected' : ''} ${used.has(u) && map[no] !== u ? 'disabled' : ''}>${esc(nameOf(u))}</option>`).join('')}`;
    body.innerHTML = `
      ${imp ? `<div class="banner warn-banner" style="margin:16px 0 0">⚠️ ${fmtTime(imp.at)}에 이미 가져왔어요. 다시 가져오면 학생 잔액·예금·주식·아이템이 <b>파일 값으로 다시 맞춰져요</b>(그동안의 거래가 덮어써짐).</div>` : ''}
      <div class="panel" style="margin-top:16px"><h3>2. 설정 <span class="muted">같은 이름이 있으면 고치고, 없으면 새로 만들어요</span></h3>
        <div class="grid4">
          <div class="stat"><div class="k">🛒 상점 상품</div><div class="v">${data.items.length}개</div><div class="muted" style="font-size:.8em">${esc([...new Set(data.items.map((i) => i.category))].join(' · '))}</div></div>
          <div class="stat"><div class="k">💼 직업</div><div class="v">${jobs.length}개</div><div class="muted" style="font-size:.8em">${data.jobs.length - jobs.length ? `선생님 전용 ${data.jobs.length - jobs.length}개(${esc(data.jobs.filter((j) => j.teacherOnly).map((j) => j.title).join(', '))})는 빼요` : ''}</div></div>
          <div class="stat"><div class="k">📈 증권</div><div class="v">${data.stocks.length}개</div><div class="muted" style="font-size:.8em">학급 ${data.stocks.filter((s) => s.market === 'CLASSROOM').length} · 실제 ${data.stocks.filter((s) => s.market !== 'CLASSROOM').length}</div></div>
          <div class="stat"><div class="k">🎯 퀘스트</div><div class="v">${data.quests.length}개</div></div>
        </div>
        <p class="note">은행: ${data.bank.termDays}일 예금, 신용 등급 ${Object.entries(data.bank.grades).map(([g, r]) => `${g} ${r}%`).join(' · ')} · 주식 거래: 실제 ${esc(data.tradePolicy.realStart)}~${esc(data.tradePolicy.realEnd)}, 학급 ${esc(data.tradePolicy.classStart)}~${esc(data.tradePolicy.classEnd)}, 하루 ${data.tradePolicy.dailyMax}회</p></div>
      <div class="panel" style="margin-top:16px"><h3>3. 학생 짝 맞추기 <span class="muted">이름이 같은 학생을 자동으로 골랐어요</span></h3>
        ${unmatched.length ? `<div class="banner warn-banner" style="margin:0 0 12px">클래스 티어에 아직 없는 학생 ${unmatched.length}명: ${unmatched.map((s) => esc(s.name)).join(', ')}
          <button class="btn sm" id="im-create">이 학생들 계정 만들기</button></div>` : ''}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>번호</th><th>수페 이름</th><th>클래스 티어 학생</th><th class="num">쓸 수 있는 돈</th><th class="num">예금</th><th class="num">주식</th><th class="num">아이템</th><th>직업</th><th>등급</th><th class="num">총자산</th></tr></thead><tbody>
        ${data.students.map((s) => `<tr class="${map[s.no] ? '' : 'off'}"><td>${s.no}</td><td><b>${esc(s.name)}</b></td><td><select data-map="${s.no}" style="width:auto">${opts(s.no)}</select></td>
          <td class="num ${s.cash < 0 ? 'down-txt' : ''}">${E.num(s.cash)}</td><td class="num">${s.deposits.length ? `${s.deposits.length}개 · ${E.num(s.deposits.reduce((n, d) => n + d.principal, 0))}` : '-'}</td>
          <td class="num">${s.holdings.length ? E.num(s.holdings.reduce((n, h) => n + h.invested, 0)) : '-'}</td><td class="num">${s.items.reduce((n, i) => n + i.qty, 0)}</td>
          <td>${esc(s.jobs.join(', ') || '-')}</td><td>${esc(s.grade || '-')}</td><td class="num"><b>${E.num(s.total)}</b></td></tr>`).join('')}
        </tbody></table></div>
        <p class="note">수페 총 유통 화폐 ${E.won(data.students.reduce((n, s) => n + s.total, 0))} · ${data.notes ? esc(data.notes) : ''}</p></div>
      <div class="panel" style="margin-top:16px"><h3>4. 가져오기</h3>
        <div class="chk-grid">
          <label class="chk-line"><input type="checkbox" class="chk" id="im-cfg" checked> 상점·직업·증권·퀘스트·은행·거래 설정</label>
          <label class="chk-line"><input type="checkbox" class="chk" id="im-money" checked> 학생 잔액·예금·주식·아이템</label>
          <label class="chk-line"><input type="checkbox" class="chk" id="im-jobs" checked> 직업 배정</label>
          <label class="chk-line"><input type="checkbox" class="chk" id="im-grade" checked> 신용 등급</label>
          <label class="chk-line"><input type="checkbox" class="chk" id="im-av" checked> 아바타</label>
          <label class="chk-line"><input type="checkbox" class="chk" id="im-q" checked> 퀘스트 완료 기록</label>
        </div>
        <div class="foot"><span class="muted" id="im-prog" style="margin-right:auto"></span><button class="btn primary lg" id="im-go">${Object.keys(map).length}명 가져오기</button></div></div>`;
  });

  async function createStudents() {
    const list = data.students.filter((s) => !map[s.no]);
    if (!list.length) return;
    const m = modal(`<h3>학생 계정 만들기 · ${list.length}명</h3>
      <p class="note" style="margin-top:0">아이디는 영문·숫자만 쓸 수 있어요. 비밀번호는 6자리 숫자로 만들어지고 「학생 관리」에서 볼 수 있어요.</p>
      <div class="form-grid"><label>아이디 앞부분<input id="cs-pre" value="s" maxlength="12"></label></div>
      <div class="tbl-wrap" style="max-height:45vh"><table class="tbl"><tbody>${list.map((s) => `<tr><td>${esc(s.name)}</td><td><input data-cid="${s.no}" value="s${String(s.no).padStart(2, '0')}" style="width:140px"></td></tr>`).join('')}</tbody></table></div>
      <div class="foot"><span class="muted" id="cs-prog" style="margin-right:auto"></span><button class="btn ghost" data-close>취소</button><button class="btn primary" data-ok>계정 만들기</button></div>`, { wide: true, dismissable: false });
    m.el.querySelector('#cs-pre').oninput = (e) => m.el.querySelectorAll('[data-cid]').forEach((i) => (i.value = `${e.target.value.trim()}${String(i.dataset.cid).padStart(2, '0')}`));
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      e.target.disabled = true;
      const fails = [];
      let n = 0;
      for (const s of list) {
        const id = m.el.querySelector(`[data-cid="${s.no}"]`).value.trim().toLowerCase();
        m.el.querySelector('#cs-prog').textContent = `${++n}/${list.length} ${s.name}…`;
        try { await TC.addStudent(id, s.name, TC.genPw()); } catch (err) { fails.push(`${s.name}(${id}): ${err.message}`); }
      }
      m.close();
      setTimeout(() => { autoMatch(); $('#im-body').dataset.k = ''; A.render(); }, 400);
      if (fails.length) modal(`<h3>만들지 못한 계정</h3><ul>${fails.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><div class="foot"><button class="btn" data-close>닫기</button></div>`);
      else toast(`${list.length}명의 계정을 만들었어요.`, 'good');
    };
  }

  async function run() {
    if (busy) return;
    const opt = (id) => $(id) && $(id).checked;
    const o = { cfg: opt('#im-cfg'), money: opt('#im-money'), jobs: opt('#im-jobs'), grade: opt('#im-grade'), av: opt('#im-av'), q: opt('#im-q') };
    const pairs = data.students.filter((s) => map[s.no] && S.users[map[s.no]]);
    if (!(await confirmBox('수페에서 가져오기', `${o.cfg ? '설정(상점·직업·증권·퀘스트·은행)과 ' : ''}학생 ${pairs.length}명의 ${[o.money && '잔액·예금·주식·아이템', o.jobs && '직업', o.grade && '신용 등급', o.av && '아바타', o.q && '퀘스트 기록'].filter(Boolean).join('·')}을 가져올까요?${E.cfg().imported ? '<br><b style="color:var(--warn)">이미 가져온 적이 있어요. 잔액이 파일 값으로 다시 맞춰져요.</b>' : ''}`, '가져오기'))) return;
    busy = true;
    const prog = (t) => { const el = $('#im-prog'); if (el) el.textContent = t; };
    try {
      const byName = (obj, key) => { const m = {}; for (const [id, x] of Object.entries(obj || {})) if (x && x[key]) m[norm(x[key])] = id; return m; };
      const [store0, jobs0, market0, quests0] = await Promise.all(['store/items', 'jobs', 'market', 'quests'].map((p) => B.get(p)));
      const itemId = byName(store0, 'n'), jobId = byName(jobs0, 't'), stockId = byName(market0, 'n'), questId = byName(quests0, 't');
      const idOf = (m, name) => m[norm(name)] || (m[norm(name)] = B.newKey());
      data.items.forEach((it) => idOf(itemId, it.name));
      data.jobs.filter((j) => !j.teacherOnly).forEach((j) => idOf(jobId, j.title));
      data.stocks.forEach((s) => idOf(stockId, s.name));
      data.quests.forEach((q) => idOf(questId, q.title));

      // 1) 설정
      if (o.cfg || o.jobs) {
        prog('설정 가져오는 중…');
        const upd = {};
        if (o.cfg) {
          data.items.forEach((it, i) => {
            const id = itemId[norm(it.name)];
            const base = `store/items/${id}/`;
            Object.assign(upd, { [base + 'n']: it.name, [base + 'p']: it.group ? 0 : it.price, [base + 'on']: it.active !== false, [base + 'ord']: i + 1 });
            if (!store0 || !store0[id] || !store0[id].ic) upd[base + 'ic'] = iconFor(it.name);
            if (it.group) { upd[base + 'g'] = it.groupTarget || it.price; upd[base + 'c'] = '공동구매'; if (!store0 || !store0[id]) upd[base + 'r'] = 0; }
            else { upd[base + 'c'] = it.category; upd[base + 'g'] = null; upd[base + 'st'] = typeof it.stock === 'number' ? it.stock : null; }
          });
          data.stocks.forEach((s, i) => {
            const id = stockId[norm(s.name)];
            const real = s.market !== 'CLASSROOM';
            const cur = market0 && market0[id];
            upd[`market/${id}`] = Object.assign({}, cur || {}, { n: s.name, ty: real ? 'real' : 'class', on: s.active !== false, ord: i + 1, d: s.description || (cur && cur.d) || null },
              real ? { mk: s.market === 'KRX' ? 'KRX' : 'US', sym: s.symbol } : {},
              // 실제 주식은 수페에서 내보낸 때의 가격이라 시세를 새로 받을 때까지 거래가 멈춰 있음
              !cur ? { p: s.value, ch: 0, ut: real ? Date.parse(data.exportedAt) || 0 : B.ts() } : real ? {} : { p: cur.p });
          });
          data.quests.forEach((q, i) => {
            const id = questId[norm(q.title)];
            const cur = (quests0 && quests0[id]) || {};
            upd[`quests/${id}`] = Object.assign({}, cur, { t: q.title, d: q.description || cur.d || null, rw: q.reward || 0, rep: (q.repeat || 'NONE').toLowerCase(), proof: (q.proof || 'SIMPLE').toLowerCase(), on: q.active !== false, ord: i + 1 });
          });
          const c = E.cfg();
          const tp = data.tradePolicy;
          upd['config/econ/unit'] = data.currency || '원';
          upd['config/econ/cats'] = [...new Set([...data.items.map((i) => (i.group ? '공동구매' : i.category)), ...c.cats])];
          upd['config/econ/bank'] = { on: true, days: data.bank.termDays || 7, min: c.bank.min || 1000, rates: data.bank.grades, def: data.bank.grades[c.bank.def] !== undefined ? c.bank.def : Object.keys(data.bank.grades).pop() };
          upd['config/econ/trade'] = { on: true, rs: E.toMin(tp.realStart), re: E.toMin(tp.realEnd), cs: E.toMin(tp.classStart), ce: E.toMin(tp.classEnd), max: tp.dailyMax || 30 };
        }
        if (o.jobs || o.cfg) {
          data.jobs.filter((j) => !j.teacherOnly).forEach((j, i) => {
            const id = jobId[norm(j.title)];
            const cur = (jobs0 && jobs0[id]) || {};
            const mem = Object.assign({}, cur.mem || {});
            if (o.jobs) for (const s of pairs) { if (s.jobs.includes(j.title)) mem[map[s.no]] = true; else delete mem[map[s.no]]; }
            upd[`jobs/${id}`] = Object.assign({}, cur, o.cfg ? { t: j.title, d: j.description || cur.d || null, w: j.wage, on: j.active !== false, ord: i + 1 } : {}, { mem });
          });
        }
        await B.update('', upd);
      }

      // 2) 학생마다 (계좌 기록은 학생마다 한 줄이라 한 명씩 저장)
      const accts = (await B.get('acct')) || {};
      let n = 0;
      for (const s of pairs) {
        const u = map[s.no];
        const a = accts[u] || {};
        prog(`${++n}/${pairs.length} ${s.name}…`);
        const upd = {};
        if (o.money) {
          const cur = a.cash;
          if (cur === undefined || cur === null || cur !== s.cash) E.addOp(upd, u, { k: 'imp', a: s.cash - (cur || 0), m: '수페에서 가져온 잔액' });
          upd[`acct/${u}/dep`] = null;
          s.deposits.forEach((d, i) => {
            const st = Date.parse(d.start), mt = Date.parse(d.maturity);
            upd[`acct/${u}/dep/imp${i + 1}`] = { p: d.principal, r: d.rate, i: Math.floor((d.principal * d.rate) / 100), s: st, dd: Math.max(1, Math.round((mt - st) / E.DAY)) };
          });
          upd[`acct/${u}/hold`] = null;
          for (const h of s.holdings) upd[`acct/${u}/hold/${stockId[norm(h.stock)]}`] = { q: h.qty, c: h.invested };
          for (const it of s.items) upd[`acct/${u}/items/${itemId[norm(it.item)]}`] = it.qty;
        }
        if (o.grade && s.grade) upd[`acct/${u}/grade`] = s.grade;
        if (o.av && s.avatar) upd[`acct/${u}/avatar`] = { style: s.avatar.style, seed: s.avatar.seed };
        if (o.q) for (const t of s.questsDone || []) upd[`qprog/${questId[norm(t)]}/${u}/once`] = { st: 'ok', t: B.ts(), imp: true };
        // dep/hold를 한 번 지우고 다시 쓰는 것을 한 번에 하면 겹치므로 먼저 지움
        const clear = {};
        for (const k of Object.keys(upd)) if (upd[k] === null) { clear[k] = null; delete upd[k]; }
        if (Object.keys(clear).length) await B.update('', clear);
        if (Object.keys(upd).length) await B.update('', upd);
      }
      await B.set('config/econ/imported', { at: B.ts(), n: pairs.length, file: fileName.slice(0, 60) });
      prog('');
      toast(`${pairs.length}명을 가져왔어요! 「학급 홈」에서 확인하세요.`, 'good');
      $('#im-body').dataset.k = '';
    } catch (err) {
      console.error(err);
      toast(`가져오다가 멈췄어요: ${err.message}`, 'bad');
      prog('');
    }
    busy = false;
  }
})();

/* 학급 생활 티어 — 점수 엔진
   한 달 = 한 시즌. 매달 전원 1000점에서 시작해 그달의 사건(활동·기록)을 시간순으로 다시 계산합니다.
   - 경쟁 항목(수행평가·대회): 다자간 상대평가. 모든 친구와 1:1로 비교해
       Δ = K / (참가자수-1) × Σ(실제결과 − 기대승률)
     기대승률 = 1 / (1 + 10^((상대점수 − 내점수)/400))  → 점수가 높은 친구보다 잘하면 더 많이 오름 (오목 상대 보정과 같은 원리)
     반 전체 점수 합은 유지됩니다(반올림 오차 제외).
     · 점수 방식 + 기준 점수: 기준보다 높으면 오르고 낮으면 내려감(부호는 기준이 결정).
       크기 = 최대 변동 × (내 점수 − 기준) ÷ (반에서 기준과 가장 멀리 떨어진 거리) × 상대 보정
       상대 보정: 이번 달 점수가 높은 학생은 조금 덜 오르고 더 내려가며, 낮은 학생은 반대 (0.5~1.5배)
     · 등급 방식: 기준 점수 × 등급 비율 (기본 매우잘함 100%, 잘함 50%, 보통 0%, 노력요함 −50%)
   - 누적 항목(칭찬·독서·과제·1인1역·감점): 배점만큼 더하고 빼며, 항목별 월 한도를 넘으면 0점.
   활동을 고치거나 지우면 그달 전체가 자동으로 다시 계산됩니다. */
(function () {
  const START = 1000;
  const TIER_LIST = [
    { id: 'bronze', name: '브론즈' },
    { id: 'silver', name: '실버' },
    { id: 'gold', name: '골드' },
    { id: 'platinum', name: '플래티넘' },
    { id: 'diamond', name: '다이아' },
  ];
  const KIND_NAMES = { perf: '수행평가', unit: '단원평가', contest: '학급 대회·경쟁활동' };
  const MODE_NAMES = { score: '점수 (높을수록 좋음)', rank: '순위 (1등이 가장 좋음)', grade: '등급 (매우잘함·잘함·보통·노력요함)' };
  const GRADES = ['매우잘함', '잘함', '보통', '노력요함'];
  const GRADE_VALUES = { 매우잘함: 4, 잘함: 3, 보통: 2, 노력요함: 1 };
  const GRADE_ALIAS = { 노력: '노력요함' }; // 이전 3등급 기록 호환
  const K_PRESETS = { small: { name: '작게', k: 50 }, normal: { name: '보통', k: 80 }, large: { name: '크게', k: 110 } };
  const DEFAULT_GRADE_BASE = 40;

  const DEFAULT_SETTINGS = {
    thresholds: { silver: 900, gold: 1000, platinum: 1100, diamond: 1175 },
    gradePct: { 매우잘함: 100, 잘함: 50, 보통: 0, 노력요함: -50 },
    cats: {
      praise: { name: '칭찬', points: 5, cap: 0, who: 'teacher' },
      penalty: { name: '감점', points: -5, cap: 0, who: 'teacher' },
      reading: { name: '독후감', points: 5, cap: 5, who: 'student' },
      homework: { name: '과제·숙제 완료', points: 3, cap: 15, who: 'student' },
      service: { name: '1인1역·봉사', points: 3, cap: 15, who: 'teacher' },
      hanjaDaily: { name: '한자 매일 학습', points: 1, cap: 20, who: 'system' },
      lvTyping: { name: '타자 승급', points: 10, cap: 1, who: 'student' },
      lvRecorder: { name: '리코더 승급', points: 10, cap: 1, who: 'student' },
      lvHanja: { name: '한자 승급', points: 10, cap: 1, who: 'system' },
    },
    // 한자: 학교에서만 학습(요일·시간), 승급 시험 문항 수(단계별)
    hanja: { days: [1, 2, 3, 4, 5], start: '08:30', end: '16:30', testCount: [20, 20, 20], daily: 5 },
    showScores: true,
    rewards: { champion: '', diamond: '', platinum: '', gold: '', silver: '', bronze: '' },
  };
  const STUDENT_CATS = ['reading', 'homework'];
  // 승급 시험 통과 기준: 문항이 적으면 90%, 중간 80%, 많으면 70%
  const passRate = (n) => (n <= 10 ? 0.9 : n < 30 ? 0.8 : 0.7);

  function mergeSettings(raw) {
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!raw) return s;
    if (raw.thresholds) Object.assign(s.thresholds, raw.thresholds);
    if (raw.gradePct) for (const g of GRADES) if (isFinite(Number(raw.gradePct[g]))) s.gradePct[g] = Number(raw.gradePct[g]);
    if (raw.cats) for (const k of Object.keys(s.cats)) if (raw.cats[k]) Object.assign(s.cats[k], raw.cats[k], { who: s.cats[k].who });
    // 이전 이름 자동 변경 (독서 기록 → 독후감)
    if (s.cats.reading.name === '독서 기록') s.cats.reading.name = '독후감';
    if (raw.hanja) Object.assign(s.hanja, raw.hanja);
    if (raw.rewards) Object.assign(s.rewards, raw.rewards);
    if (typeof raw.showScores === 'boolean') s.showScores = raw.showScores;
    return s;
  }

  // 월 키 (한국 시간 기준 로컬 날짜)
  function monthKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthLabel(key) {
    const [y, m] = String(key).split('-');
    return `${y}년 ${Number(m)}월`;
  }
  function prevMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }

  function tierOf(score, th) {
    th = th || DEFAULT_SETTINGS.thresholds;
    if (score >= th.diamond) return TIER_LIST[4];
    if (score >= th.platinum) return TIER_LIST[3];
    if (score >= th.gold) return TIER_LIST[2];
    if (score >= th.silver) return TIER_LIST[1];
    return TIER_LIST[0];
  }

  // 활동 결과값 → 비교용 숫자 (클수록 잘함). 값이 없으면 null(불참)
  function valueOf(mode, raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    if (mode === 'grade') return GRADE_VALUES[GRADE_ALIAS[raw] || raw] ?? null;
    const n = Number(raw);
    if (!isFinite(n)) return null;
    return mode === 'rank' ? -n : n;
  }

  // 다자간 상대평가 점수 변동
  function eloDeltas(parts, ratings, K) {
    const n = parts.length;
    const out = {};
    if (n < 2) { parts.forEach((p) => (out[p.uid] = 0)); return out; }
    for (const a of parts) {
      let sum = 0;
      for (const b of parts) {
        if (a === b) continue;
        const s = a.v > b.v ? 1 : a.v < b.v ? 0 : 0.5;
        const e = 1 / (1 + Math.pow(10, (ratings[b.uid] - ratings[a.uid]) / 400));
        sum += s - e;
      }
      out[a.uid] = Math.round((K / (n - 1)) * sum);
    }
    return out;
  }

  // 점수 방식 + 기준 점수: 기준보다 높으면 +, 낮으면 −. 크기는 반 안 상대적 거리 × 상대 보정
  function cutDeltas(parts, ratings, K, cut) {
    const out = {};
    const B = K / 2;
    const D = Math.max(0, ...parts.map((p) => Math.abs(p.v - cut)));
    if (!parts.length || D === 0) { parts.forEach((p) => (out[p.uid] = 0)); return out; }
    const avg = parts.reduce((s, p) => s + ratings[p.uid], 0) / parts.length;
    for (const p of parts) {
      const dist = p.v - cut;
      if (dist === 0) { out[p.uid] = 0; continue; }
      const e = 1 / (1 + Math.pow(10, (avg - ratings[p.uid]) / 400)); // 반 평균 대비 내 기대 승률
      const mult = Math.min(1.5, Math.max(0.5, dist > 0 ? 2 * (1 - e) : 2 * e));
      out[p.uid] = Math.round(B * (dist / D) * mult);
    }
    return out;
  }
  // 등급 방식: 기준 점수 × 등급 비율 (절대평가)
  function gradeDeltas(parts, base, pct) {
    const out = {};
    for (const p of parts) out[p.uid] = Math.round((base * (pct[GRADE_ALIAS[p.raw] || p.raw] || 0)) / 100);
    return out;
  }
  const hasCut = (a) => a.mode === 'score' && a.cut !== undefined && a.cut !== null && a.cut !== '' && isFinite(Number(a.cut));
  const gradeBase = (a) => (isFinite(Number(a.base)) && Number(a.base) > 0 ? Number(a.base) : DEFAULT_GRADE_BASE);

  /* 한 달 계산
     users: {uid: {name}}   activities: {aid: activity}   entries: {uid: {eid: entry}}
     반환: { scores, rows: {uid:{score, rank, tier}}, champion, detail: {uid: {...}} } */
  function compute(month, users, activities, entries, settingsRaw) {
    const st = mergeSettings(settingsRaw);
    const uids = Object.keys(users || {});
    const R = {};
    const detail = {};
    const counts = {};
    for (const u of uids) {
      R[u] = START;
      detail[u] = { acts: [], cats: {}, logs: [], comp: 0, accum: 0 };
      counts[u] = {};
    }
    // 학생이 입력하고 선생님이 확인한 단원평가 점수 → 해당 활동의 결과로 합침
    const submitted = {};
    for (const [uid, list] of Object.entries(entries || {})) {
      for (const e of Object.values(list || {})) {
        if (e && e.cat === 'unit' && e.status === 'approved' && e.aid) (submitted[e.aid] = submitted[e.aid] || {})[uid] = e.score;
      }
    }
    const ev = [];
    for (const [id, a] of Object.entries(activities || {})) {
      if (a && a.month === month) {
        const aa = submitted[id] ? Object.assign({}, a, { results: Object.assign({}, submitted[id], a.results || {}) }) : a;
        ev.push({ t: a.at || 0, id, type: 'act', a: aa });
      }
    }
    for (const [uid, list] of Object.entries(entries || {})) {
      if (!R.hasOwnProperty(uid)) continue;
      for (const [id, e] of Object.entries(list || {})) {
        if (e && e.month === month && e.status === 'approved' && e.cat !== 'unit') ev.push({ t: e.ts || 0, id, type: 'entry', uid, e });
      }
    }
    ev.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));

    for (const x of ev) {
      if (x.type === 'act') {
        const a = x.a;
        const parts = [];
        for (const [uid, raw] of Object.entries(a.results || {})) {
          if (!R.hasOwnProperty(uid)) continue;
          const v = valueOf(a.mode, raw);
          if (v !== null) parts.push({ uid, v, raw });
        }
        const K = (K_PRESETS[a.weight] || K_PRESETS.normal).k;
        const d = a.mode === 'grade' ? gradeDeltas(parts, gradeBase(a), st.gradePct)
          : hasCut(a) ? cutDeltas(parts, R, K, Number(a.cut))
          : eloDeltas(parts, R, K);
        // 반 안 등수 (동점은 같은 등수)
        const sorted = parts.slice().sort((p, q) => q.v - p.v);
        const place = {};
        sorted.forEach((p, i) => { place[p.uid] = i > 0 && sorted[i - 1].v === p.v ? place[sorted[i - 1].uid] : i + 1; });
        for (const p of parts) {
          R[p.uid] += d[p.uid];
          detail[p.uid].comp += d[p.uid];
          detail[p.uid].acts.push({ id: x.id, name: a.name, kind: a.kind, mode: a.mode, raw: p.raw, place: place[p.uid], n: parts.length, delta: d[p.uid], at: a.at });
        }
      } else {
        const e = x.e, uid = x.uid;
        const cat = st.cats[e.cat];
        if (!cat) continue;
        // 독후감 X(통과 못함)는 0점이고 월 한도에도 세지 않음
        const failedReport = e.cat === 'reading' && e.ox === 'X';
        const cnt = (counts[uid][e.cat] || 0) + (failedReport ? 0 : 1);
        counts[uid][e.cat] = cnt;
        // 점수 직접 지정은 선생님 기록(칭찬·감점)만 인정 — 학생 제출은 항상 설정된 배점
        const custom = e.by === 'teacher' && e.points !== undefined && e.points !== null && e.points !== '';
        let pts = failedReport ? 0 : custom ? Number(e.points) : cat.points;
        let capped = false;
        if (!failedReport && cat.cap > 0 && cnt > cat.cap) { pts = 0; capped = true; }
        R[uid] += pts;
        detail[uid].accum += pts;
        const c = (detail[uid].cats[e.cat] = detail[uid].cats[e.cat] || { count: 0, points: 0, capped: 0 });
        c.count++; c.points += pts; if (capped) c.capped++;
        detail[uid].logs.push({ id: x.id, cat: e.cat, text: e.text || '', points: pts, capped, at: e.ts });
      }
    }

    // 순위: 점수 → 경쟁 항목 점수 → 이름
    const order = uids.slice().sort((a, b) => R[b] - R[a] || detail[b].comp - detail[a].comp || String(users[a].name).localeCompare(users[b].name));
    const rows = {};
    order.forEach((u, i) => {
      const prev = order[i - 1];
      const rank = i > 0 && R[prev] === R[u] ? rows[prev].rank : i + 1;
      rows[u] = { score: R[u], rank, tier: tierOf(R[u], st.thresholds).id };
    });
    const champion = order.length && ev.length ? order[0] : null;
    if (champion) rows[champion].champion = true;
    return { scores: R, rows, champion, detail, order };
  }

  window.Tier = {
    START, TIER_LIST, KIND_NAMES, MODE_NAMES, GRADES, GRADE_VALUES, GRADE_ALIAS, K_PRESETS, DEFAULT_SETTINGS, DEFAULT_GRADE_BASE, STUDENT_CATS, passRate,
    mergeSettings, monthKey, monthLabel, prevMonth, tierOf, valueOf, eloDeltas, cutDeltas, gradeDeltas, hasCut, gradeBase, compute,
  };
})();

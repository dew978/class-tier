/* 데이터 계층: Firebase(실제 운영) / 데모(이 브라우저 localStorage, 여러 탭 테스트 가능)
   두 구현 모두 같은 인터페이스를 제공합니다.
   데모 모드는 database.rules.json을 직접 해석해 실제 Firebase와 같은 보안 규칙으로 읽기·쓰기를 검사합니다.
   - inc(n): 서버에서 더하기(동시에 여러 명이 돈을 써도 잔액이 꼬이지 않음)
   - ts(): 서버 시각
   - get/on의 세 번째 인자 q: { child, key, equalTo, startAt, endAt, last, first } 조건 조회 */
(function () {
  const EMAIL_DOMAIN = 'classtier.example.com';
  const toEmail = (id) => `${String(id).toLowerCase()}@${EMAIL_DOMAIN}`;
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (path) => String(path || '').split('/').filter(Boolean);

  function getAt(root, ps) {
    let cur = root;
    for (const p of ps) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[p];
    }
    return cur === undefined ? null : cur;
  }
  function setAt(root, ps, val) {
    if (!ps.length) return val == null ? {} : val;
    let cur = root;
    const stack = [];
    for (let i = 0; i < ps.length - 1; i++) {
      if (cur[ps[i]] == null || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {};
      stack.push([cur, ps[i]]);
      cur = cur[ps[i]];
    }
    const last = ps[ps.length - 1];
    if (val == null) delete cur[last];
    else cur[last] = val;
    // 비어 있는 상위 노드 정리
    for (let i = stack.length - 1; i >= 0; i--) {
      const [obj, k] = stack[i];
      if (obj[k] && typeof obj[k] === 'object' && !Object.keys(obj[k]).length) delete obj[k];
    }
    return root;
  }
  // Firebase처럼 null 값·빈 객체를 정리
  function norm(v) {
    if (v == null) return null;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) { const a = v.map(norm); return a.length ? a : null; }
    const o = {};
    for (const [k, x] of Object.entries(v)) { const y = norm(x); if (y != null) o[k] = y; }
    return Object.keys(o).length ? o : null;
  }

  let pushCounter = 0;
  function newKey() {
    const t = Date.now().toString(36).padStart(9, '0');
    const r = Math.random().toString(36).slice(2, 8);
    return `${t}${(pushCounter++ % 1296).toString(36).padStart(2, '0')}${r}`;
  }

  // Firebase 정렬 순서: null < false < true < 숫자 < 문자열 < 객체
  function cmpFb(a, b) {
    const rank = (x) => (x == null ? 0 : x === false ? 1 : x === true ? 2 : typeof x === 'number' ? 3 : typeof x === 'string' ? 4 : 5);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 3) return a - b;
    if (ra === 4) return a < b ? -1 : a > b ? 1 : 0;
    return 0;
  }
  function applyQuery(v, q) {
    if (!q) return v;
    if (!v || typeof v !== 'object') return null;
    let arr = Object.keys(v).map((k) => [k, v[k]]);
    const sv = (e) => (q.child ? getAt(e[1], parts(q.child)) : e[0]);
    arr.sort((x, y) => cmpFb(sv(x), sv(y)) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    if (q.equalTo !== undefined) arr = arr.filter((e) => cmpFb(sv(e), q.equalTo) === 0);
    if (q.startAt !== undefined) arr = arr.filter((e) => cmpFb(sv(e), q.startAt) >= 0);
    if (q.endAt !== undefined) arr = arr.filter((e) => cmpFb(sv(e), q.endAt) <= 0);
    if (q.last) arr = arr.slice(-q.last);
    if (q.first) arr = arr.slice(0, q.first);
    if (!arr.length) return null;
    const o = {};
    for (const [k, x] of arr) o[k] = x;
    return o;
  }
  // 보안 규칙의 query 변수
  const ruleQuery = (q) => ({
    orderByChild: (q && q.child) || null, orderByKey: !!(q && q.key), orderByValue: false, orderByPriority: false,
    equalTo: q && q.equalTo !== undefined ? q.equalTo : null, startAt: q && q.startAt !== undefined ? q.startAt : null,
    endAt: q && q.endAt !== undefined ? q.endAt : null, limitToFirst: (q && q.first) || null, limitToLast: (q && q.last) || null,
  });

  /* ───────────── 데모용 보안 규칙 해석기 ─────────────
     Firebase 실시간 데이터베이스 규칙과 같은 방식으로 판단합니다.
     .read/.write: 위쪽(조상)부터 하나라도 참이면 허용 · .validate: 바뀌는 곳과 그 위·아래 모두 참이어야 함(삭제는 검사 안 함) */
  function RulesEngine(src) {
    if (!String.prototype.__rm) Object.defineProperty(String.prototype, '__rm', { value: function (re) { return re.test(String(this)); } });
    class Snap {
      constructor(tree, ps) { this.t = tree; this.ps = ps; }
      val() { return clone(getAt(this.t, this.ps)); }
      child(p) { return new Snap(this.t, this.ps.concat(parts(String(p)))); }
      parent() { return new Snap(this.t, this.ps.slice(0, -1)); }
      exists() { return getAt(this.t, this.ps) != null; }
      hasChild(p) { return this.child(p).exists(); }
      hasChildren(list) {
        const v = getAt(this.t, this.ps);
        if (!v || typeof v !== 'object') return false;
        return list ? list.every((k) => v[k] != null) : Object.keys(v).length > 0;
      }
      isNumber() { return typeof getAt(this.t, this.ps) === 'number'; }
      isString() { return typeof getAt(this.t, this.ps) === 'string'; }
      isBoolean() { return typeof getAt(this.t, this.ps) === 'boolean'; }
      getPriority() { return null; }
    }
    const cache = new Map();
    function compile(expr) {
      let f = cache.get(expr);
      if (f) return f;
      const js = String(expr)
        .replace(/([^=!<>])==(?!=)/g, '$1===')
        .replace(/!=(?!=)/g, '!==')
        .replace(/\.beginsWith\(/g, '.startsWith(')
        .replace(/\.contains\(/g, '.includes(')
        .replace(/\.matches\(/g, '.__rm(');
      try { f = new Function('auth', 'root', 'data', 'newData', 'now', 'query', '$v', `with ($v) { return (${js}); }`); }
      catch (e) { console.error('[데모 규칙] 해석 오류:', expr, e); f = () => false; }
      cache.set(expr, f);
      return f;
    }
    function ev(expr, c) {
      if (expr === true || expr === false) return expr;
      try { return compile(expr)(c.auth, c.root, c.data, c.newData, c.now, c.query, c.vars) === true; }
      catch (e) { return false; }
    }
    const V = (vars) => Object.assign(Object.create(null), vars);
    function step(node, key, vars) {
      if (!node || typeof node !== 'object') return null;
      if (Object.prototype.hasOwnProperty.call(node, key) && key[0] !== '.') return node[key];
      const w = Object.keys(node).find((k) => k[0] === '$');
      if (w) { vars[w] = key; return node[w]; }
      return null;
    }
    return {
      canRead(db, ps, auth, now, q) {
        const root = new Snap(db, []);
        const query = ruleQuery(q);
        let node = src.rules;
        const vars = Object.create(null);
        for (let i = 0; node; i++) {
          if (node['.read'] !== undefined && ev(node['.read'], { auth, root, data: new Snap(db, ps.slice(0, i)), newData: null, now, query, vars: V(vars) })) return true;
          if (i === ps.length) break;
          node = step(node, ps[i], vars);
        }
        return false;
      },
      // paths: 쓰는 위치 목록, oldDb → newDb (여러 곳을 한 번에 쓰는 경우 newDb는 모두 반영된 뒤의 상태)
      canWrite(oldDb, newDb, paths, auth, now) {
        const root = new Snap(oldDb, []);
        const ctx = (ps, vars) => ({ auth, root, data: new Snap(oldDb, ps), newData: new Snap(newDb, ps), now, query: ruleQuery(null), vars: V(vars) });
        for (const ps of paths) {
          let node = src.rules, ok = false;
          const vars = Object.create(null);
          for (let i = 0; node; i++) {
            if (node['.write'] !== undefined && ev(node['.write'], ctx(ps.slice(0, i), vars))) { ok = true; break; }
            if (i === ps.length) break;
            node = step(node, ps[i], vars);
          }
          if (!ok) return { ok: false, path: ps.join('/'), rule: '.write' };
        }
        const seen = new Set();
        const check = (ps, node, vars) => {
          const key = ps.join('/');
          if (seen.has(key)) return null;
          seen.add(key);
          if (getAt(newDb, ps) == null || !node || node['.validate'] === undefined) return null;
          return ev(node['.validate'], ctx(ps, vars)) ? null : key;
        };
        const walk = (ps, node, vars) => {
          const bad = check(ps, node, vars);
          if (bad !== null) return bad;
          const nv = getAt(newDb, ps);
          if (!node || !nv || typeof nv !== 'object') return null;
          for (const k of Object.keys(nv)) {
            const v2 = V(vars);
            const ch = step(node, k, v2);
            if (ch) { const b = walk(ps.concat(k), ch, v2); if (b !== null) return b; }
          }
          return null;
        };
        for (const ps of paths) {
          let node = src.rules;
          const vars = Object.create(null);
          for (let i = 0; i < ps.length && node; i++) {
            const bad = check(ps.slice(0, i), node, V(vars));
            if (bad !== null) return { ok: false, path: bad, rule: '.validate' };
            node = step(node, ps[i], vars);
          }
          if (!node) continue;
          const bad = walk(ps, node, vars);
          if (bad !== null) return { ok: false, path: bad, rule: '.validate' };
        }
        return { ok: true };
      },
    };
  }

  // 서버 값(시각·더하기)을 실제 값으로 바꿈
  function resolveSV(val, old, now) {
    if (val == null || typeof val !== 'object') return val;
    if (Object.prototype.hasOwnProperty.call(val, '.sv')) {
      const sv = val['.sv'];
      if (sv === 'timestamp') return now;
      if (sv && typeof sv === 'object' && typeof sv.increment === 'number') return (typeof old === 'number' ? old : 0) + sv.increment;
      return null;
    }
    if (Array.isArray(val)) return val.map((x, i) => resolveSV(x, old && typeof old === 'object' ? old[i] : null, now));
    const o = {};
    for (const [k, x] of Object.entries(val)) o[k] = resolveSV(x, old && typeof old === 'object' ? old[k] : null, now);
    return o;
  }
  const permError = () => new Error('권한이 없습니다. (보안 규칙 확인)');

  /* ───────────── 데모 백엔드 ───────────── */
  function DemoBackend() {
    const KEY = 'classTierDemoDB_v1';
    const AUTH_KEY = 'classTierDemoAuth_v1';
    const SESSION_KEY = 'classTierDemoUid';
    const listeners = new Set();
    let authCbs = [];
    let rules = null;

    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = (db) => { localStorage.setItem(KEY, JSON.stringify(db)); };
    const loadAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch (e) { return {}; } };
    const saveAuth = (a) => localStorage.setItem(AUTH_KEY, JSON.stringify(a));

    function notify() {
      const db = load();
      for (const l of listeners) {
        const v = applyQuery(getAt(db, l.ps), l.q);
        const s = JSON.stringify(v);
        // 백그라운드 탭에서 setTimeout이 지연되지 않도록 마이크로태스크 사용
        if (s !== l.last) { l.last = s; const c = clone(v); queueMicrotask(() => l.active && l.cb(c)); }
      }
    }
    window.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

    let uid = sessionStorage.getItem(SESSION_KEY);
    const authObj = () => (uid ? { uid, provider: 'password', token: { email: '', email_verified: false } } : null);
    const readOk = (ps, q) => !rules || rules.canRead(load(), ps, authObj(), Date.now(), q);
    // changes: [[경로 조각 배열, 값]] — 한 번에 모두 쓰거나(규칙 통과) 모두 거부
    function commit(changes) {
      const db = load();
      const now = Date.now();
      const next = clone(db) || {};
      let out = next;
      for (const [ps, val] of changes) out = setAt(out, ps, norm(resolveSV(clone(val), getAt(db, ps), now)));
      if (rules) {
        const r = rules.canWrite(db, out, changes.map((c) => c[0]), authObj(), now);
        if (!r.ok) { console.warn('[데모 보안 규칙] 쓰기 거부:', r.rule, r.path, changes); throw permError(); }
      }
      save(out);
      notify();
    }

    const api = {
      mode: 'demo',
      async init() {
        try {
          const res = await fetch('database.rules.json', { cache: 'no-store' });
          if (res.ok) rules = RulesEngine(await res.json());
        } catch (e) { console.warn('[데모] 보안 규칙 파일을 읽지 못해 규칙 검사 없이 동작합니다.', e); }
      },
      now: () => Date.now(),
      newKey,
      inc: (n) => ({ '.sv': { increment: n } }),
      ts: () => ({ '.sv': 'timestamp' }),
      async get(path, q) {
        const ps = parts(path);
        if (!readOk(ps, q)) { console.warn('[데모 보안 규칙] 읽기 거부:', path, q || ''); throw permError(); }
        return clone(applyQuery(getAt(load(), ps), q));
      },
      async set(path, val) { commit([[parts(path), val]]); },
      async update(path, obj) { commit(Object.entries(obj).map(([k, v]) => [parts(path).concat(parts(k)), v])); },
      async remove(path) { commit([[parts(path), null]]); },
      on(path, cb, q) {
        const ps = parts(path);
        if (!readOk(ps, q)) { console.warn('[데모 보안 규칙] 읽기 거부(구독):', path, q || ''); return () => {}; }
        const l = { ps, q, cb, last: undefined, active: true };
        listeners.add(l);
        const v = applyQuery(getAt(load(), l.ps), q);
        l.last = JSON.stringify(v);
        const c = clone(v);
        queueMicrotask(() => l.active && cb(c));
        return () => { l.active = false; listeners.delete(l); };
      },
      async tx(path, fn) {
        const db = load();
        const cur = clone(getAt(db, parts(path)));
        const next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        commit([[parts(path), next]]);
        return { committed: true, value: clone(getAt(load(), parts(path))) };
      },
      // ── 인증 ──
      currentUid: () => uid,
      onAuth(cb) { authCbs.push(cb); setTimeout(() => cb(uid), 0); },
      async signIn(loginId, pw) {
        const a = loadAuth()[String(loginId).toLowerCase()];
        if (!a || a.pw !== pw) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
        uid = a.uid;
        sessionStorage.setItem(SESSION_KEY, uid);
        authCbs.forEach((f) => f(uid));
        return uid;
      },
      async signOut() { uid = null; sessionStorage.removeItem(SESSION_KEY); authCbs.forEach((f) => f(null)); },
      // 데모에서는 Google 로그인을 쓸 수 없음
      google: false,
      async signInGoogle() { throw new Error('데모 모드에서는 Google 로그인을 쓸 수 없어요.'); },
      async linkGoogle() { throw new Error('데모 모드에서는 Google 계정을 연결할 수 없어요.'); },
      async unlinkGoogle() {},
      googleEmail: () => null,
      isGoogleOnly: () => false,
      hasPassword: () => true,
      async dropNewGoogleUser() { await api.signOut(); },
      async createAccount(loginId, pw) {
        const a = loadAuth();
        const id = String(loginId).toLowerCase();
        if (a[id]) throw new Error(`이미 있는 아이디입니다: ${loginId}`);
        if (String(pw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        const newUid = 'u' + newKey();
        a[id] = { uid: newUid, pw };
        saveAuth(a);
        return newUid;
      },
      async signUpSelf(loginId, pw) { const u = await api.createAccount(loginId, pw); await api.signIn(loginId, pw); return u; },
      async setPassword(loginId, oldPw, newPw) {
        const a = loadAuth();
        const id = String(loginId).toLowerCase();
        if (!a[id]) throw new Error('계정을 찾을 수 없습니다.');
        if (String(newPw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        a[id].pw = newPw;
        saveAuth(a);
      },
      async changeLogin(oldId, oldPw, newId, newPw) {
        const a = loadAuth();
        const o = String(oldId).toLowerCase(), n = String(newId).toLowerCase();
        if (!a[o] || a[o].pw !== oldPw) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
        if (n !== o && a[n]) throw new Error('이미 있는 아이디입니다.');
        if (newPw && String(newPw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        const rec = a[o];
        delete a[o];
        const pwChanged = !!newPw && newPw !== rec.pw;
        if (newPw) rec.pw = newPw;
        a[n] = rec;
        saveAuth(a);
        return { idChanged: n !== o, pwChanged };
      },
      async changeOwnPassword(newPw) {
        const a = loadAuth();
        const k = Object.keys(a).find((id) => a[id].uid === uid);
        if (!k) throw new Error('계정을 찾을 수 없습니다.');
        if (String(newPw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
        a[k].pw = newPw;
        saveAuth(a);
      },
      async canChangeIds() { return true; },
      async deleteAccount(loginId) {
        const a = loadAuth();
        delete a[String(loginId).toLowerCase()];
        saveAuth(a);
      },
      async deleteSelf() {
        const a = loadAuth();
        for (const k of Object.keys(a)) if (a[k].uid === uid) delete a[k];
        saveAuth(a);
        await api.signOut();
      },
      setupPresence() {},
      resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(SESSION_KEY); },
    };
    return api;
  }

  /* ───────────── Firebase 백엔드 ───────────── */
  function FirebaseBackend(config) {
    const V = '10.12.2';
    const libs = ['app', 'auth', 'database'].map((n) => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}-compat.js`);
    let db, auth, second, offset = 0;
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Firebase 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
      document.head.appendChild(s);
    });
    const koErr = (e) => {
      const c = (e && e.code) || '';
      if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      if (/email-already-in-use/.test(c)) return new Error('이미 있는 아이디입니다.');
      if (/weak-password/.test(c)) return new Error('비밀번호는 6자 이상이어야 합니다.');
      if (/too-many-requests/.test(c)) return new Error('시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
      if (/network/.test(c)) return new Error('네트워크 오류입니다. 인터넷 연결을 확인하세요.');
      if (/popup-closed|cancelled-popup/.test(c)) return new Error('Google 로그인 창을 닫았어요.');
      if (/credential-already-in-use|account-exists/.test(c)) return new Error('이 Google 계정은 이미 다른 계정에 쓰이고 있어요.');
      if (/provider-already-linked/.test(c)) return new Error('이미 Google 계정이 연결되어 있어요.');
      if (/operation-not-allowed/.test(c)) return new Error('Firebase에서 Google 로그인이 아직 켜져 있지 않아요.');
      if (/unauthorized-domain/.test(c)) return new Error('이 주소는 Firebase 승인된 도메인에 없어요.');
      if (/requires-recent-login/.test(c)) return new Error('보안을 위해 다시 로그인한 뒤 해 주세요.');
      if (/PERMISSION_DENIED|permission/i.test(String(e && e.message))) return new Error('권한이 없습니다. (보안 규칙 확인)');
      return e instanceof Error ? e : new Error(String(e));
    };
    const Q = (ref, q) => {
      if (!q) return ref;
      let r = q.child ? ref.orderByChild(q.child) : q.key ? ref.orderByKey() : ref;
      if (q.equalTo !== undefined) r = r.equalTo(q.equalTo);
      if (q.startAt !== undefined) r = r.startAt(q.startAt);
      if (q.endAt !== undefined) r = r.endAt(q.endAt);
      if (q.last) r = r.limitToLast(q.last);
      if (q.first) r = r.limitToFirst(q.first);
      return r;
    };

    const api = {
      mode: 'firebase',
      async init() {
        for (const s of libs) await loadScript(s);
        const app = firebase.initializeApp(config);
        second = firebase.initializeApp(config, 'secondary');
        db = firebase.database(app);
        auth = firebase.auth(app);
        db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
      },
      now: () => Date.now() + offset,
      newKey: () => db.ref().push().key,
      inc: (n) => firebase.database.ServerValue.increment(n),
      ts: () => firebase.database.ServerValue.TIMESTAMP,
      async get(path, q) { try { return (await Q(db.ref(path), q).get()).val(); } catch (e) { throw koErr(e); } },
      async set(path, val) { try { await db.ref(path).set(clone(val)); } catch (e) { throw koErr(e); } },
      async update(path, obj) { try { await db.ref(path || '/').update(clone(obj)); } catch (e) { throw koErr(e); } },
      async remove(path) { try { await db.ref(path).remove(); } catch (e) { throw koErr(e); } },
      on(path, cb, q) {
        const ref = Q(db.ref(path), q);
        const h = ref.on('value', (s) => cb(s.val()), (e) => console.warn('listen', path, e));
        return () => ref.off('value', h);
      },
      async tx(path, fn) {
        // 트랜잭션은 로컬 캐시에서 먼저 실행되므로, 임시 리스너로 캐시를 채운 뒤 실행
        const ref = db.ref(path);
        let h;
        await new Promise((res) => { h = ref.on('value', () => res(), () => res()); });
        try {
          const r = await ref.transaction((cur) => {
            const next = fn(cur == null ? null : cur);
            return next === undefined ? undefined : clone(next);
          }, undefined, false);
          return { committed: r.committed, value: r.snapshot.val() };
        } catch (e) { throw koErr(e); }
        finally { ref.off('value', h); }
      },
      currentUid: () => (auth.currentUser ? auth.currentUser.uid : null),
      onAuth(cb) { auth.onAuthStateChanged((u) => cb(u ? u.uid : null)); },
      async signIn(loginId, pw) {
        try { return (await auth.signInWithEmailAndPassword(toEmail(loginId), pw)).user.uid; } catch (e) { throw koErr(e); }
      },
      async signOut() { await auth.signOut(); },
      // ── Google 로그인 (선생님) ── 팝업이 막히면 페이지 이동 방식으로
      google: true,
      async signInGoogle() {
        const p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        try {
          const r = await auth.signInWithPopup(p);
          return { uid: r.user.uid, isNew: !!(r.additionalUserInfo && r.additionalUserInfo.isNewUser), email: r.user.email };
        } catch (e) {
          if (/popup-blocked|operation-not-supported-in-this-environment/.test(e && e.code)) { await auth.signInWithRedirect(p); return null; }
          throw koErr(e);
        }
      },
      // 지금 로그인한 계정(선생님)에 Google 계정을 연결 → 다음부터 Google로 같은 계정에 들어옴
      async linkGoogle() {
        const p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        try {
          const r = await auth.currentUser.linkWithPopup(p);
          const g = r.user.providerData.find((x) => x.providerId === 'google.com');
          return g ? g.email : '';
        } catch (e) { throw koErr(e); }
      },
      async unlinkGoogle() { try { await auth.currentUser.unlink('google.com'); } catch (e) { throw koErr(e); } },
      googleEmail() {
        const u = auth.currentUser;
        const g = u && u.providerData.find((x) => x.providerId === 'google.com');
        return g ? g.email : null;
      },
      isGoogleOnly() { const u = auth.currentUser; return !!u && u.providerData.length > 0 && u.providerData.every((x) => x.providerId === 'google.com'); },
      hasPassword() { const u = auth.currentUser; return !!u && u.providerData.some((x) => x.providerId === 'password'); },
      // Google로 처음 들어와 새로 생긴, 어디에도 연결되지 않은 계정 지우기
      async dropNewGoogleUser() { try { if (auth.currentUser) await auth.currentUser.delete(); } catch (e) { /* 무시 */ } await auth.signOut(); },
      // 관리자 세션을 유지한 채 보조 앱으로 계정 생성
      async createAccount(loginId, pw) {
        try {
          const c = await second.auth().createUserWithEmailAndPassword(toEmail(loginId), pw);
          const u = c.user.uid;
          await second.auth().signOut();
          return u;
        } catch (e) { throw koErr(e); }
      },
      async signUpSelf(loginId, pw) {
        try { return (await auth.createUserWithEmailAndPassword(toEmail(loginId), pw)).user.uid; } catch (e) { throw koErr(e); }
      },
      async setPassword(loginId, oldPw, newPw) {
        try {
          const c = await second.auth().signInWithEmailAndPassword(toEmail(loginId), oldPw);
          await c.user.updatePassword(newPw);
          await second.auth().signOut();
        } catch (e) { throw koErr(e); }
      },
      // 학생 아이디(= 로그인 이메일)와 비밀번호 바꾸기 — 보조 앱에서 그 학생으로 로그인해 바꿈
      // 아이디를 먼저 바꾸고 비밀번호를 바꿈. 비밀번호만 실패하면 { idChanged: true, pwChanged: false, error } 로 알려 줌
      async changeLogin(oldId, oldPw, newId, newPw) {
        const sameId = String(newId).toLowerCase() === String(oldId).toLowerCase();
        let c;
        try { c = await second.auth().signInWithEmailAndPassword(toEmail(oldId), oldPw); } catch (e) { throw koErr(e); }
        try {
          if (!sameId) {
            try { await c.user.updateEmail(toEmail(newId)); }
            catch (e) {
              if (/operation-not-allowed/.test(e && e.code)) throw new Error('Firebase의 「이메일 열거 보호」가 켜져 있어 아이디를 바꿀 수 없어요.');
              throw koErr(e);
            }
          }
          if (newPw && newPw !== oldPw) {
            try { await c.user.updatePassword(newPw); }
            catch (e) { return { idChanged: !sameId, pwChanged: false, error: koErr(e).message }; }
          }
          return { idChanged: !sameId, pwChanged: !!newPw && newPw !== oldPw };
        } finally { await second.auth().signOut().catch(() => {}); }
      },
      // 로그인한 사람이 자기 비밀번호 바꾸기 (첫 로그인 때 학생이 직접)
      async changeOwnPassword(newPw) {
        try { await auth.currentUser.updatePassword(newPw); } catch (e) { throw koErr(e); }
      },
      // 아이디를 바꿀 수 있는지: Firebase 「이메일 열거 보호」가 켜져 있으면 있는 아이디도 안 보여 줌 → 바꿀 수 없음
      async canChangeIds(knownId) {
        try { return (await auth.fetchSignInMethodsForEmail(toEmail(knownId))).length > 0; } catch (e) { return false; }
      },
      async deleteAccount(loginId, pw) {
        try {
          const c = await second.auth().signInWithEmailAndPassword(toEmail(loginId), pw);
          await c.user.delete();
        } catch (e) { throw koErr(e); }
      },
      async deleteSelf() {
        try { if (auth.currentUser) await auth.currentUser.delete(); } catch (e) { await auth.signOut(); }
      },
      // path: 접속 상태를 기록할 경로 (연결이 끊기면 자동 삭제)
      setupPresence(path, getVal) {
        const ref = db.ref(path);
        if (this._presenceOff) this._presenceOff();
        const conn = db.ref('.info/connected');
        const h = conn.on('value', (s) => {
          if (s.val() !== true) return;
          ref.onDisconnect().remove().then(() => ref.set(getVal()));
        });
        this._presenceOff = () => { conn.off('value', h); ref.onDisconnect().cancel(); };
      },
    };
    return api;
  }

  window.Backend = window.CLASSTIER_FIREBASE_CONFIG ? FirebaseBackend(window.CLASSTIER_FIREBASE_CONFIG) : DemoBackend();
})();

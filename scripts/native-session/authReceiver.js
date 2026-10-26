const { Buffer } = require('node:buffer');
const { createHash, randomUUID } = require('node:crypto');

const modes = ['login', 'logout', 'login-failed', 'csrf-invalid', 'unknown503', 'classifier-error', 'auth-network',
  'refresh401', 'refresh403', 'refresh429', 'refresh503', 'refresh-invalid', 'refresh-network', 'refresh302',
  'auth-held', 'refresh-held', 'drain-csrf', 'cancel-csrf', 'cancel-drain', 'cancel-auth', 'cancel-body', 'stale-get', 'stale-post', 'pre-cancel', 'late-csrf', 'cancel-old'];
const checkNames = ['inert', 'gate', 'drained', 'oldBlocked', 'refreshBlocked', 'oldResult', 'originalReadable', 'cookieBefore',
  'cookieAfter', 'notQueued', 'classified', 'authOnce', 'postOnce', 'recovered', 'abortSettled', 'lateWriteBlocked', 'cleanupAbsent',
  'preCancelled', 'positive', 'ordering', 'refreshFailure', 'unknownCleared'];
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 0;
const safeResult = (value = {}) => ({
  ...(['response', 'not_sent', 'transport_error', 'stale_response'].includes(value.kind) ? { kind: value.kind } : {}),
  ...(['invalid_request', 'auth_transition', 'cancelled', 'csrf_unavailable', 'network', 'invalid_response', 'http'].includes(value.reason) ? { reason: value.reason } : {}),
  ...(typeof value.ok === 'boolean' ? { ok: value.ok } : {}),
  ...(Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? { status: value.status } : {}),
});

// 합성 값은 이 receiver 메모리에만 둔다. 공개 snapshot/report는 횟수·enum·boolean만 포함한다.
module.exports = function createAuthReceiver(writeReport = (row) => process.stdout.write(`${JSON.stringify(row)}\n`)) {
  const runs = new Map();
  const live = (run) => [...run.responses.values()].filter((item) => !item.closed && !item.finished).length;
  const snapshot = (run) => ({
    csrf: run.csrf, auth: run.auth, post: run.post, get: run.get, old: run.old, observe: run.observe,
    authPairs: run.authPairs, postPairs: run.postPairs, oldPairs: run.oldPairs,
    authBytes: run.authBytes, authBodyMatches: run.authBodyMatches, anonymous: run.anonymous,
    refreshCookieAbsent: run.refreshCookieAbsent, refreshHadOldCookie: run.refreshHadOldCookie, refreshCookieMatchesAuth: run.refreshCookieMatchesAuth,
    oldMissingCsrfCookie: run.oldMissingCsrfCookie, authSawCsrfMismatch: run.authSawCsrfMismatch,
    held: run.held.size, activeResponses: live(run), waiters: run.waiters.length,
    authClosed: run.authState?.closed === true, authFinished: run.authState?.finished === true,
    authClosedBeforeRelease: run.authClosedBeforeRelease, blockedLateWrite: run.blockedLateWrite,
    positive: run.positive, sink: run.sink, events: run.events.slice(-128),
  });
  const wake = (run) => {
    for (const waiter of [...run.waiters]) if (waiter.ready()) { run.waiters.splice(run.waiters.indexOf(waiter), 1); waiter.reply(); }
  };
  const event = (run, value) => { run.events.push(value); wake(run); };
  const track = (run, response, key) => {
    const state = { closed: false, finished: false }; run.responses.set(key, state);
    response.once('finish', () => { state.finished = true; event(run, `${key}.finished`); });
    response.once('close', () => { state.closed = true; event(run, `${key}.closed`); });
    return state;
  };
  const release = (run, phase) => {
    for (const [key, item] of [...run.held]) if (phase === 'all' || item.phase === phase) {
      run.held.delete(key); item.send();
    }
    wake(run);
  };
  const cookieHeader = (value, path) => `SCRUM165_PROBE=${value ?? ''}; Path=${path}; HttpOnly${value ? '' : '; Max-Age=0'}`;
  const csrfName = 'SCRUM165_XSRF_PROBE';
  const csrfHeader = (value, path) => `${csrfName}=${value ?? ''}; Path=${path}; HttpOnly${value ? '' : '; Max-Age=0'}`;
  const readCsrfCookie = (request) => (request.headers.cookie ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${csrfName}=`))?.slice(csrfName.length + 1);
  const hasCookie = (request, value) => !!value && (request.headers.cookie ?? '').split(';').some((item) => item.trim() === `SCRUM165_PROBE=${value}`);
  const rotate = (run, anonymous = false) => { run.cookie = randomUUID(); run.token = randomUUID(); run.anonymous = anonymous; };

  async function handle(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = /^\/runs\/((android|ios)-auth-[a-z0-9-]+)\/(.*)$/.exec(url.pathname);
    if (!match) return false;
    const [, id, platform, route] = match;
    const path = `/runs/${id}/api/v1`;
    const reply = (status, data, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
      response.end(status === 204 ? undefined : JSON.stringify(data));
    };
    if (route === 'start' && request.method === 'GET') {
      const mode = url.searchParams.get('mode');
      if (!modes.includes(mode) || runs.has(id)) { reply(400, { error: 'invalid_auth_probe_start' }); return true; }
      const cookie = randomUUID(); const token = randomUUID();
      runs.set(id, { mode, cookie, token, initialCookie: cookie, initialToken: token,
        csrf: 0, auth: 0, post: 0, get: 0, old: 0, observe: 0, positive: 0, sink: 0,
        authPairs: true, postPairs: true, oldPairs: true, authBytes: 0, authBodyMatches: true, anonymous: true,
        recovered: false, authClosedBeforeRelease: false, blockedLateWrite: false,
        refreshCookieAbsent: false, refreshHadOldCookie: false, refreshCookieMatchesAuth: false,
        oldMissingCsrfCookie: false, authSawCsrfMismatch: false,
        held: new Map(), responses: new Map(), waiters: [], events: [] });
      reply(200, { ok: true }, { 'Set-Cookie': mode === 'late-csrf' ? [cookieHeader(undefined, path), csrfHeader(undefined, path)] : cookieHeader(undefined, path) }); return true;
    }
    const run = runs.get(id);
    if (!run) { reply(409, { error: 'auth_probe_not_started' }); return true; }
    const hold = (phase, key, send) => run.held.set(key, { phase, send });
    const sendCaptured = (key, send) => {
      event(run, `${key}.released`);
      if (response.destroyed || run.responses.get(key)?.closed) { run.blockedLateWrite = true; return; }
      send();
    };
    if (route === 'snapshot') { reply(200, snapshot(run)); return true; }
    if (route === 'wait') {
      const phase = url.searchParams.get('phase');
      const predicates = { csrf: () => run.csrf > 0, auth: () => run.auth > 0, refresh: () => run.csrf > 1,
        old: () => run.old > 0, headers: () => run.headersSent === true,
        'auth-closed': () => run.authState?.closed === true, settled: () => run.held.size === 0 && live(run) === 0 };
      if (!Object.hasOwn(predicates, phase)) { reply(400, { error: 'invalid_auth_probe_phase' }); return true; }
      const ready = predicates[phase];
      if (ready()) reply(200, { ok: true });
      else {
        const waiter = { ready, reply: () => { if (!response.destroyed) reply(200, { ok: true }); } };
        run.waiters.push(waiter);
        response.once('close', () => { const index = run.waiters.indexOf(waiter); if (index >= 0) run.waiters.splice(index, 1); });
      }
      return true;
    }
    if (route === 'release') {
      const phase = url.searchParams.get('phase');
      if (!['csrf', 'auth', 'refresh', 'old', 'body', 'all'].includes(phase)) reply(400, { error: 'invalid_auth_probe_phase' });
      else { release(run, phase); reply(200, { ok: true }); }
      return true;
    }
    if (route === 'drop-csrf' && run.mode === 'late-csrf') { reply(200, { ok: true }, { 'Set-Cookie': csrfHeader(undefined, path) }); return true; }
    if (route === 'recover') { run.recovered = true; reply(200, { ok: true }); return true; }
    if (route === 'finish') {
      if (run.held.size || live(run) || run.waiters.length) reply(409, { error: 'auth_probe_not_settled' });
      else reply(200, snapshot(run), { 'Set-Cookie': run.mode === 'late-csrf' ? [cookieHeader(undefined, path), csrfHeader(undefined, path)] : cookieHeader(undefined, path) });
      return true;
    }
    if (route === 'api/v1/sink') {
      if (request.headers['x-probe-control'] === 'reachability') run.positive += 1; else run.sink += 1;
      reply(200, { ok: true }); return true;
    }
    if (route === 'api/v1/observe') {
      run.observe += 1;
      reply(200, { data: { cookieNamePresent: (request.headers.cookie ?? '').split(';').some((item) => item.trim().startsWith('SCRUM165_PROBE=')),
        matchesOldCookie: hasCookie(request, run.initialCookie), matchesCurrentCookie: hasCookie(request, run.cookie),
        matchesAuthCookie: hasCookie(request, run.authCookie), csrfCookieNamePresent: !!readCsrfCookie(request),
        csrfCookieMatchesCurrent: !!run.token && readCsrfCookie(request) === run.token } }); return true;
    }
    if (route === 'api/v1/auth/csrf' && request.method === 'GET') {
      const nth = ++run.csrf; const key = `csrf${nth}`; track(run, response, key); event(run, `${key}.received`);
      if (nth === 2 && run.auth > 0) {
        // 새 익명 쿠키를 만들기 전에 logout 만료와 auth 쿠키 전달을 관측한다.
        run.refreshCookieAbsent = !(request.headers.cookie ?? '').split(';').some((item) => item.trim().startsWith('SCRUM165_PROBE='));
        run.refreshHadOldCookie = hasCookie(request, run.initialCookie);
        run.refreshCookieMatchesAuth = hasCookie(request, run.authCookie);
      }
      if (run.mode === 'late-csrf' && nth > 1) run.token = readCsrfCookie(request) || randomUUID();
      if (nth > 1 && run.mode.startsWith('refresh') && !run.recovered && run.mode !== 'refresh-held') {
        if (run.mode === 'refresh-network') { request.socket.destroy(); return true; }
        if (run.mode === 'refresh-invalid') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end('{'); return true;
        }
        if (run.mode === 'refresh302') {
          rotate(run); reply(302, {}, { Location: `${path}/sink`, 'Set-Cookie': cookieHeader(run.cookie, path) }); return true;
        }
        reply(Number(run.mode.slice(7)), { error: { code: 'SYNTHETIC_FAILURE' } }); return true;
      }
      if (nth > 1 && (!run.cookie || !hasCookie(request, run.cookie))) rotate(run, true);
      // 늦은 응답은 이후 인증이 바뀌어도 이 시점의 값을 반환해야 한다.
      const capturedCookie = run.cookie; const capturedToken = run.token;
      const send = () => sendCaptured(key, () => reply(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: capturedToken }, { 'Set-Cookie': run.mode === 'late-csrf' ? [cookieHeader(capturedCookie, path), csrfHeader(capturedToken, path)] : cookieHeader(capturedCookie, path) }));
      if (nth === 1 && ['drain-csrf', 'cancel-csrf', 'cancel-drain'].includes(run.mode)) hold('csrf', key, send);
      else if (nth === 2 && run.mode === 'refresh-held') hold('refresh', key, send);
      else send();
      return true;
    }
    if (['api/v1/auth/login', 'api/v1/auth/logout'].includes(route) && request.method === 'POST') {
      const digest = createHash('sha256'); let bytes = 0;
      for await (const chunk of request) { bytes += Buffer.byteLength(chunk); digest.update(chunk); }
      const key = `auth${++run.auth}`; run.authState = track(run, response, key);
      run.authPairs = run.authPairs && hasCookie(request, run.cookie) && request.headers['x-xsrf-token'] === run.token;
      run.authBytes += bytes;
      const logout = route.endsWith('/logout');
      run.authBodyMatches = run.authBodyMatches && (logout ? bytes === 0 && !request.headers['content-type']
        : bytes === 14 && digest.digest('hex') === createHash('sha256').update('synthetic-auth').digest('hex'));
      event(run, `${key}.received`);
      let deniedCsrfHeaders = {};
      if (run.mode === 'late-csrf') {
        const incoming = readCsrfCookie(request);
        run.authSawCsrfMismatch = !incoming || incoming !== request.headers['x-xsrf-token'];
        run.token = incoming || randomUUID();
        if (!incoming) deniedCsrfHeaders = { 'Set-Cookie': csrfHeader(run.token, path) };
      } else if (run.mode !== 'login-failed') {
        if (logout) { run.cookie = undefined; run.token = undefined; run.anonymous = true; }
        else rotate(run);
      }
      const capturedCookie = run.cookie; run.authCookie = capturedCookie;
      if (run.mode === 'auth-network') { request.socket.destroy(); return true; }
      const status = run.mode === 'login-failed' ? 401 : ['csrf-invalid', 'late-csrf'].includes(run.mode) ? 403 : run.mode === 'unknown503' ? 503 : logout ? 204 : 200;
      const data = status === 401 ? { error: { code: 'LOGIN_FAILED' } } : status === 403 ? { error: { code: 'CSRF_INVALID' } }
        : status === 503 ? { error: { code: 'AUTH_STATE_UNAVAILABLE' } } : { data: { synthetic: true } };
      const headers = run.mode === 'late-csrf' ? deniedCsrfHeaders : run.mode === 'login-failed' ? {} : { 'Set-Cookie': cookieHeader(capturedCookie, path) };
      const send = () => {
        run.authClosedBeforeRelease = response.destroyed || run.authState.closed;
        sendCaptured(key, () => reply(status, data, headers));
      };
      if (['auth-held', 'cancel-auth'].includes(run.mode)) hold('auth', key, send);
      else if (run.mode === 'cancel-body') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
        response.write('{"data":'); run.headersSent = true; event(run, `${key}.headers`);
        hold('body', key, () => { run.authClosedBeforeRelease = response.destroyed || run.authState.closed; sendCaptured(key, () => response.end('{"synthetic":true}}')); });
      } else send();
      return true;
    }
    if (route === 'api/v1/old-csrf' && run.mode === 'late-csrf' && request.method === 'POST') {
      for await (const chunk of request) { void chunk; }
      const key = `old${++run.old}`; track(run, response, key);
      run.oldMissingCsrfCookie = !readCsrfCookie(request);
      run.oldPairs = run.oldPairs && hasCookie(request, run.cookie) && request.headers['x-xsrf-token'] === run.initialToken;
      const issued = randomUUID(); event(run, `${key}.received`);
      hold('old', key, () => sendCaptured(key, () => reply(403, { error: { code: 'CSRF_INVALID' } }, { 'Set-Cookie': csrfHeader(issued, path) })));
      return true;
    }
    if (route === 'api/v1/probe' || route === 'api/v1/old') {
      const isPost = request.method === 'POST';
      for await (const chunk of request) { void chunk; /* 원문 보관 없이 끝까지 수신한다. */ }
      const valid = hasCookie(request, run.cookie) && request.headers['x-xsrf-token'] === run.token
        && (run.mode !== 'late-csrf' || readCsrfCookie(request) === run.token);
      if (route.endsWith('/old')) {
        const key = `old${++run.old}`; track(run, response, key); run.oldPairs = run.oldPairs && (!isPost || valid); event(run, `${key}.received`);
        hold('old', key, () => sendCaptured(key, () => reply(200, { data: { synthetic: true } })));
      } else {
        if (isPost) { run.post += 1; run.postPairs = run.postPairs && valid; } else run.get += 1;
        reply(run.mode === 'late-csrf' && isPost && !valid ? 403 : 200, { data: { synthetic: true } });
      }
      return true;
    }
    if (route === 'report' && request.method === 'POST') {
      let input = ''; for await (const chunk of request) { input += chunk; if (input.length > 8192) { reply(413, {}); return true; } }
      try {
        const value = JSON.parse(input); if (value.platform !== platform || value.stage !== '5') throw new Error();
        const checks = {}; for (const key of checkNames) if (typeof value.checks?.[key] === 'boolean') checks[key] = value.checks[key];
        writeReport({ stage: '5', platform, case: run.mode, report: { pass: value.pass === true, cleanup: value.cleanup === true,
          fetchCalls: number(value.fetchCalls), classified: number(value.classified), checks,
          operation: safeResult(value.operation), secondary: safeResult(value.secondary), refresh: safeResult(value.refresh),
          ...(['changed', 'unchanged', 'csrf_invalid', 'unknown', 'not_attempted'].includes(value.outcome) ? { outcome: value.outcome } : {}),
          ...(value.before ? { before: { csrf: number(value.before.csrf), auth: number(value.before.auth), post: number(value.before.post), old: number(value.before.old) } } : {}),
          ...(value.issue ? { issue: ['incomplete', 'deadline'].includes(value.issue) ? value.issue : 'invalid_issue' } : {}) }, receiver: snapshot(run) });
        reply(200, { ok: true });
        if (!run.held.size && !live(run) && !run.waiters.length) runs.delete(id);
      } catch { reply(400, { error: 'invalid_auth_probe_report' }); }
      return true;
    }
    reply(404, { error: 'unknown_auth_probe_route' }); return true;
  }
  return { handle, close() { runs.forEach((run) => release(run, 'all')); } };
};

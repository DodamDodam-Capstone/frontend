const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const { safeReport, checksPassed } = require('./report');

const modes = ['current', 'late-json-logout', 'late-json-same', 'late-json-other', 'late401', 'late403', 'afterparse',
  'expiry-cleanup', 'concurrent401', 'csrf-concurrent', 'csrf-recovery-held', 'csrf-invalidated', 'csrf-failure-late', 'guardian403', 'unavailable503'];
const requiredChecks = ['prepared', 'result', 'counts', 'pairs', 'cleanupAbsent'];
const requestId = '22222222-2222-4222-8222-222222222222';
const error = (code) => ({ error: { code, message: 'Synthetic', requestId, fields: [] } });
const cookieName = 'SCRUM167_PROBE';
const cookieHeader = (value, path) => `${cookieName}=${value ?? ''}; Path=${path}; HttpOnly${value ? '' : '; Max-Age=0'}`;
const cookies = (request) => (request.headers.cookie ?? '').split(';').map((item) => item.trim());
const hasCookie = (request, value) => cookies(request).includes(`${cookieName}=${value}`);
const cookiePresent = (request) => cookies(request).some((item) => item.startsWith(`${cookieName}=`));

// 합성 세션·token은 메모리에만 둔다. 보고서는 enum·횟수·boolean만 허용한다.
module.exports = function createRecoveryReceiver(writeReport = (row) => process.stdout.write(`${JSON.stringify(row)}\n`)) {
  const runs = new Map();
  const active = (run) => [...run.responses.values()].filter((state) => !state.closed && !state.finished).length;
  const snapshot = (run) => ({ csrf: run.csrf, login: run.login, logout: run.logout, post: run.post, get: run.get,
    held: run.held.size, activeResponses: active(run), waiters: run.waiters.size, pairs: run.pairs,
    bodyEmpty: run.bodyEmpty, account: run.account, events: run.events.slice(-128) });
  const wake = (run) => {
    for (const waiter of [...run.waiters]) if (waiter.ready()) { run.waiters.delete(waiter); waiter.reply(); }
  };
  const event = (run, value) => { run.events.push(value); wake(run); };
  const track = (run, response) => {
    const state = { closed: false, finished: false }; run.responses.set(response, state);
    response.once('finish', () => { state.finished = true; event(run, 'response.finished'); });
    response.once('close', () => { state.closed = true; run.held.delete(response); event(run, 'response.closed'); });
  };
  const release = (run, phase = 'all', disconnect = false) => {
    for (const [response, item] of [...run.held]) if (phase === 'all' || item.phase === phase) {
      run.held.delete(response);
      if (response.destroyed || response.writableEnded) continue;
      if (disconnect) response.destroy(); else response.end(item.rest);
    }
    wake(run);
  };
  async function handle(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = /^\/runs\/((android|ios)-recovery-[a-z0-9-]+)\/(.*)$/.exec(url.pathname);
    if (!match) return false;
    const [, id, platform, route] = match; const path = `/runs/${id}/api/v1`;
    const reply = (status, body, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...headers });
      response.end(status === 204 ? undefined : JSON.stringify(body));
    };
    if (route === 'start' && request.method === 'GET') {
      const mode = url.searchParams.get('mode');
      if (!modes.includes(mode) || runs.has(id)) { reply(400, { error: 'invalid_recovery_probe_start' }); return true; }
      runs.set(id, { mode, cookie: randomUUID(), token: undefined, account: 'a', csrf: 0, login: 0, logout: 0, get: 0, post: 0,
        pairs: true, bodyEmpty: true, held: new Map(), responses: new Map(), waiters: new Set(), phases: new Set(), events: [], finished: false });
      reply(200, { ok: true }, { 'Set-Cookie': cookieHeader(undefined, path) }); return true;
    }
    const run = runs.get(id);
    if (!run) { reply(409, { error: 'recovery_probe_not_started' }); return true; }
    const heldReply = (phase, status, body, headers = {}) => {
      const bytes = Buffer.from(JSON.stringify(body));
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId,
        ...(platform === 'ios' ? { 'Content-Length': bytes.length } : {}), ...headers });
      response.flushHeaders(); response.write(bytes.subarray(0, 1));
      run.held.set(response, { phase, rest: bytes.subarray(1) }); run.phases.add(phase); event(run, `${phase}.held`);
    };
    if (route === 'snapshot' && request.method === 'GET') { reply(200, snapshot(run)); return true; }
    if (route === 'wait' && request.method === 'GET') {
      const phase = url.searchParams.get('phase');
      if (!['body', 'recovery', 'settled'].includes(phase)) { reply(400, { error: 'invalid_recovery_probe_phase' }); return true; }
      const ready = () => phase === 'settled' ? !run.held.size && active(run) === 0 : run.phases.has(phase);
      if (ready()) reply(200, { ok: true });
      else {
        const waiter = { response, ready, reply: () => { if (!response.destroyed) reply(200, { ok: true }); } };
        run.waiters.add(waiter); response.once('close', () => run.waiters.delete(waiter));
      }
      return true;
    }
    if (route === 'release' && request.method === 'GET') {
      const phase = url.searchParams.get('phase') ?? 'all';
      if (!['body', 'recovery', 'all'].includes(phase)) { reply(400, { error: 'invalid_recovery_probe_phase' }); return true; }
      release(run, phase); reply(200, { ok: true }); return true;
    }
    if (route === 'finish' && request.method === 'GET') {
      if (run.held.size || active(run) || run.waiters.size) reply(409, { error: 'recovery_probe_not_settled' });
      else { run.finished = true; reply(200, snapshot(run), { 'Set-Cookie': cookieHeader(undefined, path) }); }
      return true;
    }
    if (route === 'api/v1/observe' && request.method === 'GET') {
      reply(200, { data: { cookiePresent: cookiePresent(request) } }); return true;
    }
    if (route === 'api/v1/auth/csrf' && request.method === 'GET') {
      run.finished = false; run.csrf += 1; track(run, response); event(run, 'csrf.received');
      if (run.mode === 'csrf-failure-late' && run.csrf === 2) {
        heldReply('recovery', 401, error('AUTHENTICATION_REQUIRED')); return true;
      }
      run.token = randomUUID();
      const body = { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: run.token };
      const headers = { 'Set-Cookie': cookieHeader(run.cookie, path) };
      if ((run.mode === 'csrf-invalidated' && run.csrf === 1) || (run.mode === 'csrf-recovery-held' && run.csrf === 2)) {
        heldReply('recovery', 200, body, headers);
      } else reply(200, body, headers);
      return true;
    }
    if (['api/v1/auth/login', 'api/v1/auth/logout'].includes(route) && request.method === 'POST') {
      run.finished = false; track(run, response);
      run.pairs = run.pairs && hasCookie(request, run.cookie) && request.headers['x-xsrf-token'] === run.token;
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size <= 1024) chunks.push(Buffer.from(chunk));
      }
      if (route.endsWith('/login')) {
        let account;
        try { account = JSON.parse(Buffer.concat(chunks).toString()).account; } catch { /* 합성 DTO 원문은 기록하지 않는다. */ }
        if (size > 1024 || !['a', 'b'].includes(account)) { reply(400, error('VALIDATION_FAILED')); return true; }
        run.login += 1; run.account = account; event(run, 'login.received');
      } else {
        run.logout += 1; run.bodyEmpty = run.bodyEmpty && size === 0; run.account = 'none'; event(run, 'logout.received');
      }
      run.cookie = randomUUID(); run.token = undefined;
      reply(route.endsWith('/logout') ? 204 : 200, { data: { account: run.account } }, {
        'Set-Cookie': cookieHeader(run.account === 'none' ? undefined : run.cookie, path),
      });
      return true;
    }
    if (route === 'api/v1/probe' && ['GET', 'POST'].includes(request.method)) {
      run.finished = false;
      const post = request.method === 'POST'; if (post) run.post += 1; else run.get += 1;
      track(run, response); event(run, 'probe.received');
      const exempt = run.mode === 'csrf-invalidated' && !post && run.csrf === 1;
      run.pairs = run.pairs && (exempt || (hasCookie(request, run.cookie) && (!post || request.headers['x-xsrf-token'] === run.token)));
      let size = 0; for await (const chunk of request) size += Buffer.byteLength(chunk);
      run.bodyEmpty = run.bodyEmpty && size === 0;
      const authError = ['late401', 'expiry-cleanup', 'concurrent401', 'csrf-invalidated'].includes(run.mode);
      const csrfError = run.mode === 'late403' || run.mode.startsWith('csrf-') && !authError;
      const status = authError ? 401 : csrfError || run.mode === 'guardian403' ? 403 : run.mode === 'unavailable503' ? 503 : 200;
      const body = status === 200 ? { data: { account: run.account } } : error(authError ? 'AUTHENTICATION_REQUIRED'
        : csrfError ? 'CSRF_INVALID' : status === 503 ? 'AUTH_STATE_UNAVAILABLE' : 'GUARDIAN_UNLOCK_REQUIRED');
      if (run.mode.startsWith('late') || (run.mode === 'csrf-concurrent' && run.post <= 2)) {
        heldReply('body', status, body);
        if (run.mode === 'csrf-concurrent' && run.post === 2) release(run, 'body');
      } else reply(status, body);
      return true;
    }
    if (route === 'report' && request.method === 'POST') {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size > 8192) { reply(413, { error: 'recovery_probe_report_too_large' }); return true; }
        chunks.push(Buffer.from(chunk));
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString());
        if (value.platform !== platform || value.stage !== '167-6') throw new Error();
        const report = safeReport(value, requiredChecks);
        report.pass = report.pass && report.cleanup && !value.issue && checksPassed(report.checks, requiredChecks)
          && run.finished && run.held.size === 0 && active(run) === 0 && run.waiters.size === 0;
        writeReport({ stage: '167-6', platform, case: run.mode, report, receiver: snapshot(run) });
        reply(200, { ok: true });
        if (!run.held.size && !active(run) && !run.waiters.size) runs.delete(id);
      } catch { reply(400, { error: 'invalid_recovery_probe_report' }); }
      return true;
    }
    reply(404, { error: 'unknown_recovery_probe_route' }); return true;
  }
  return { handle, close() {
    for (const run of runs.values()) {
      release(run, 'all', true);
      for (const [response, state] of run.responses) if (!state.closed && !state.finished) response.destroy();
      for (const waiter of [...run.waiters]) waiter.response.destroy();
    }
  } };
};

const { responseCases, checksPassed, requiredResponseChecks } = require('./report');
const { Buffer } = require('node:buffer');
const { createHash, randomUUID } = require('node:crypto');

const modes = responseCases;
const checkNames = ['inert', 'prepared', 'metadata', 'result', 'body', 'notReplayed', 'headersBeforeBody', 'pendingBeforeRelease',
  'originalReadable', 'refresh', 'positive', 'sinkBlocked', 'cleanupAbsent'];
const kinds = ['json', 'empty', 'bytes', 'redirect', 'http_error', 'format_error', 'body_read_error', 'response', 'not_sent', 'transport_error', 'stale_response'];
const reasons = ['unexpected_status', 'invalid_content_type', 'invalid_json', 'invalid_envelope', 'empty_body', 'already_used', 'read_failed',
  'invalid_request', 'auth_transition', 'cancelled', 'csrf_unavailable', 'network', 'invalid_response', 'http'];
const requestId = '22222222-2222-4222-8222-222222222222';
const jsonBody = { data: { synthetic: true, value: null } };
const binaryBody = Buffer.from([0, 127, 128, 255, 10, 13]);
const cookieHeader = (value, path) => `SCRUM166_PROBE=${value ?? ''}; Path=${path}; HttpOnly${value ? '' : '; Max-Age=0'}`;
const cookies = (request) => (request.headers.cookie ?? '').split(';').map((item) => item.trim());
const cookiePresent = (request) => cookies(request).some((item) => item.startsWith('SCRUM166_PROBE='));
const hasCookie = (request, value) => !!value && cookies(request).includes(`SCRUM166_PROBE=${value}`);
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 0;
const safeOutcome = (value) => ({
  ...(kinds.includes(value?.kind) ? { kind: value.kind } : {}),
  ...(reasons.includes(value?.reason) ? { reason: value.reason } : {}),
  ...(Number.isInteger(value?.status) && value.status >= 100 && value.status <= 599 ? { status: value.status } : {}),
});
const errorBody = (code, fields = []) => ({ error: { code, message: 'Synthetic', requestId, fields } });
function multipartMatches(body, contentType) {
  const match = /^multipart\/form-data;\s*boundary=(?:"([^"\r\n]+)"|([^;\s\r\n]+))$/i.exec(contentType ?? '');
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) return false;
  const text = body.toString(); const prefix = `--${boundary}\r\n`; const suffix = `\r\n--${boundary}--\r\n`;
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return false;
  return /^content-disposition: form-data; name="probe"\r\n\r\nsynthetic$/i.test(text.slice(prefix.length, -suffix.length));
}

// 합성 원문은 요청을 확인하는 동안만 사용한다. 공개 snapshot/report에는 값·URL·예외를 복사하지 않는다.
module.exports = function createResponseReceiver(writeReport = (row) => process.stdout.write(`${JSON.stringify(row)}\n`)) {
  const runs = new Map();
  const active = (run) => [...run.responses.values()].filter((state) => !state.closed && !state.finished).length;
  const snapshot = (run) => ({ csrf: run.csrf, get: run.get, post: run.post, sourceBytes: run.sourceBytes,
    bodyMatches: run.bodyMatches, pairs: run.pairs, cookiePresent: run.cookiePresent,
    headersSent: run.headersSent, activeResponses: active(run), held: run.held.size,
    closed: run.closed, finished: run.finished, sink: run.sink, positive: run.positive });
  const wake = (run) => {
    for (const waiter of [...run.waiters]) if (waiter.ready()) { run.waiters.delete(waiter); waiter.reply(); }
  };
  const track = (run, response) => {
    const state = { closed: false, finished: false }; run.responses.set(response, state);
    response.once('finish', () => { state.finished = true; run.finished += 1; wake(run); });
    response.once('close', () => { state.closed = true; run.closed += 1; run.held.delete(response); wake(run); });
  };
  const release = (run, disconnect = false) => {
    for (const [response, rest] of [...run.held]) {
      run.held.delete(response);
      if (response.destroyed || response.writableEnded) continue;
      if (disconnect) response.destroy(); else response.end(rest);
    }
    wake(run);
  };
  async function handle(request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = /^\/runs\/((android|ios)-response-[a-z0-9-]+)\/(.*)$/.exec(url.pathname);
    if (!match) return false;
    const [, id, platform, route] = match;
    const path = `/runs/${id}/api/v1`;
    const reply = (status, data, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
      response.end(status === 204 ? undefined : JSON.stringify(data));
    };
    if (route === 'start' && request.method === 'GET') {
      const mode = url.searchParams.get('mode');
      if (!modes.includes(mode) || runs.has(id)) { reply(400, { error: 'invalid_response_probe_start' }); return true; }
      runs.set(id, { mode, cookie: randomUUID(), csrf: 0, get: 0, post: 0, sourceBytes: 0,
        bodyMatches: true, pairs: true, cookiePresent: false, headersSent: false, closed: 0, finished: 0,
        sink: 0, positive: 0, held: new Map(), responses: new Map(), waiters: new Set() });
      reply(200, { ok: true }, { 'Set-Cookie': cookieHeader(undefined, path) }); return true;
    }
    const run = runs.get(id);
    if (!run) { reply(409, { error: 'response_probe_not_started' }); return true; }
    if (route.startsWith('api/v1/') && route !== 'api/v1/observe') run.cleanupFinished = false;
    if (route === 'snapshot' && request.method === 'GET') { reply(200, snapshot(run)); return true; }
    if (route === 'wait' && request.method === 'GET') {
      const phase = url.searchParams.get('phase');
      if (!['headers', 'settled'].includes(phase)) { reply(400, { error: 'invalid_response_probe_phase' }); return true; }
      const ready = () => phase === 'headers' ? run.headersSent : run.held.size === 0 && active(run) === 0;
      if (ready()) reply(200, { ok: true });
      else {
        const waiter = { ready, response, reply: () => { if (!response.destroyed) reply(200, { ok: true }); } };
        run.waiters.add(waiter);
        response.once('close', () => run.waiters.delete(waiter));
      }
      return true;
    }
    if (['release', 'disconnect'].includes(route) && request.method === 'GET') {
      release(run, route === 'disconnect'); reply(200, { ok: true }); return true;
    }
    if (route === 'finish' && request.method === 'GET') {
      if (run.held.size || active(run) || run.waiters.size) reply(409, { error: 'response_probe_not_settled' });
      else { run.cleanupFinished = true; reply(200, snapshot(run), { 'Set-Cookie': cookieHeader(undefined, path) }); }
      return true;
    }
    if (route === 'api/v1/sink') {
      if (request.headers['x-probe-control'] === 'reachability') run.positive += 1; else run.sink += 1;
      reply(200, { ok: true }); return true;
    }
    if (route === 'api/v1/observe' && request.method === 'GET') {
      reply(200, { data: { cookiePresent: cookiePresent(request) } }); return true;
    }
    if (route === 'api/v1/auth/csrf' && request.method === 'GET') {
      run.csrf += 1; run.token = randomUUID();
      reply(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: run.token }, { 'Set-Cookie': cookieHeader(run.cookie, path) }); return true;
    }
    if (route === 'api/v1/probe') {
      if (!['GET', 'POST'].includes(request.method)) { reply(405, { error: 'unsupported_response_probe_method' }); return true; }
      const post = request.method === 'POST';
      if (post) run.post += 1; else run.get += 1;
      track(run, response);
      run.cookiePresent = run.get + run.post === 1 ? cookiePresent(request) : run.cookiePresent && cookiePresent(request);
      run.pairs = run.pairs && hasCookie(request, run.cookie) && (!post || request.headers['x-xsrf-token'] === run.token);
      const digest = createHash('sha256'); const chunks = []; let bytes = 0;
      try {
        for await (const chunk of request) {
          bytes += Buffer.byteLength(chunk); digest.update(chunk);
          if (run.mode === 'multipart' && bytes <= 8192) chunks.push(Buffer.from(chunk));
        }
      } catch { run.sourceBytes += bytes; run.bodyMatches = false; response.destroy(); return true; }
      run.sourceBytes += bytes;
      if (post && run.mode === 'multipart') run.bodyMatches = run.bodyMatches && bytes <= 8192 && multipartMatches(Buffer.concat(chunks), request.headers['content-type']);
      else {
        const json = post && ['json', 'auth-json'].includes(run.mode);
        const expected = json ? '{"probe":"synthetic"}' : '';
        run.bodyMatches = run.bodyMatches && (!json || request.headers['content-type'] === 'application/json')
          && bytes === Buffer.byteLength(expected) && digest.digest('hex') === createHash('sha256').update(expected).digest('hex');
      }
      const headers = { 'X-Request-ID': requestId };
      const binary = run.mode === 'binary' || run.mode === 'binary-empty' || run.mode.endsWith('-binary');
      if (/^(delay|cancel|disconnect|late)-/.test(run.mode)) {
        const body = binary ? binaryBody : Buffer.from(JSON.stringify(jsonBody));
        response.writeHead(200, { 'Content-Type': binary ? 'audio/x-synthetic' : 'application/json', 'Cache-Control': 'no-store', ...(binary || platform === 'ios' ? { 'Content-Length': body.length } : {}), ...headers });
        response.flushHeaders(); response.write(body.subarray(0, 1));
        run.held.set(response, body.subarray(1)); run.headersSent = true; wake(run); return true;
      }
      if (run.mode === 'post-loss') { request.socket.destroy(); return true; }
      if (run.mode === 'redirect') { reply(302, {}, { ...headers, Location: `${path}/sink` }); return true; }
      if (run.mode === 'post503') { reply(503, errorBody('AUTH_STATE_UNAVAILABLE'), { ...headers, 'Retry-After': '0' }); return true; }
      if (run.mode === 'binary-error') { reply(410, errorBody('AUDIO_EXPIRED'), headers); return true; }
      if (run.mode.startsWith('fields-')) {
        const data = errorBody('VALIDATION_FAILED', null);
        if (run.mode === 'fields-missing') delete data.error.fields;
        reply(400, data, headers); return true;
      }
      if (binary || run.mode === 'json-invalid') {
        response.writeHead(200, { 'Content-Type': binary ? 'audio/x-synthetic' : 'application/json', 'Cache-Control': 'no-store', ...headers });
        response.end(binary ? run.mode === 'binary-empty' ? Buffer.alloc(0) : binaryBody : '{'); return true;
      }
      if (run.mode === 'empty') { reply(204, undefined, headers); return true; }
      if (run.mode === 'end') {
        reply(202, { data: { conversationId: '33333333-3333-4333-8333-333333333333', status: 'CLOSING' } }, { ...headers, 'Retry-After': '1' }); return true;
      }
      reply(['json', 'multipart'].includes(run.mode) ? 201 : 200, jsonBody, { ...headers, ...(run.mode === 'json-mime' ? { 'Content-Type': 'text/html' } : {}) }); return true;
    }
    if (route === 'report' && request.method === 'POST') {
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 8192) { reply(413, { error: 'response_probe_report_too_large' }); return true; }
        chunks.push(Buffer.from(chunk));
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString());
        if (value.platform !== platform || value.stage !== '166-5') throw new Error();
        const checks = {}; for (const key of checkNames) if (typeof value.checks?.[key] === 'boolean') checks[key] = value.checks[key];
        writeReport({ stage: '166-5', platform, case: run.mode, report: { pass: value.pass === true && value.cleanup === true && run.cleanupFinished === true
          && run.held.size === 0 && active(run) === 0 && run.waiters.size === 0 && !value.issue && checksPassed(checks, requiredResponseChecks(run.mode)), cleanup: value.cleanup === true,
          fetchCalls: number(value.fetchCalls), checks, outcome: safeOutcome(value.outcome),
          ...(['incomplete', 'deadline'].includes(value.issue) ? { issue: value.issue } : {}) }, receiver: snapshot(run) });
        reply(200, { ok: true });
        if (!run.held.size && !active(run) && !run.waiters.size) runs.delete(id);
      } catch { reply(400, { error: 'invalid_response_probe_report' }); }
      return true;
    }
    reply(404, { error: 'unknown_response_probe_route' }); return true;
  }
  return { handle, close() {
    for (const run of runs.values()) {
      release(run, true);
      for (const [response, state] of run.responses) if (!state.closed && !state.finished) response.destroy();
      for (const waiter of [...run.waiters]) waiter.response.destroy();
    }
  } };
};

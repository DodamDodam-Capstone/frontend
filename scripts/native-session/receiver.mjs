import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import createAuthReceiver from './authReceiver.js';

const authReceiver = createAuthReceiver();

// 로컬 네이티브 진단 전용. 시험 값은 메모리에만 두고 access log는 만들지 않는다.
const runs = new Map();
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 0;
const counts = (value = {}) => ({ csrf: number(value.csrf), get: number(value.get), post: number(value.post) });
const result = (value) => {
  if (['not_run', 'blocked', 'not_verified'].includes(value)) return value;
  const safe = {};
  if (typeof value?.ok === 'boolean') safe.ok = value.ok;
  if (['response', 'not_sent', 'transport_error'].includes(value?.kind)) safe.kind = value.kind;
  if (['network', 'invalid_response', 'http', 'invalid_request', 'csrf_unavailable'].includes(value?.reason)) safe.reason = value.reason;
  if (Number.isInteger(value?.status) && value.status >= 100 && value.status <= 599) safe.status = value.status;
  if (['network', 'invalid_response', 'http'].includes(value?.csrfReason)) safe.csrfReason = value.csrfReason;
  if (Number.isInteger(value?.csrfStatus) && value.csrfStatus >= 100 && value.csrfStatus <= 599) safe.csrfStatus = value.csrfStatus;
  return safe;
};
const safeReport = (value) => ({
  platform: value.platform,
  reachable: value.reachable === true, inert: value.inert === true,
  observations: value.observations.slice(0, 8).map((item) => ({
    status: number(item?.status), urlEqualsRequested: item?.urlEqualsRequested === true,
    sameOriginAndPath: item?.sameOriginAndPath === true, hasCacheQuery: item?.hasCacheQuery === true,
    redirectedPropertyPresent: item?.redirectedPropertyPresent === true,
  })),
  preparation: result(value.preparation), cookieRoundTrip: typeof value.cookieRoundTrip === 'boolean' ? value.cookieRoundTrip : 'not_verified',
  firstPost: result(value.firstPost), explicitCounts: value.explicitCounts ? counts(value.explicitCounts) : 'not_verified', cleanup: value.cleanup === true,
  ...(value.issue ? { issue: ['probe_transport_failure', 'observation_deadline'].includes(value.issue) ? value.issue : 'invalid_report_issue' } : {}),
});

const bodyCases = ['post-loss-empty', 'post-loss-json', 'post-loss-binary', 'post-loss-multipart', 'post503-zero'];
const modes = ['basic', 'reuse', 'concurrent', 'http401', 'http403', 'http429', 'http503', 'invalid-json', 'network', 'post-loss', 'expire', 'csrf302', ...bodyCases,
  ...[301, 302, 303, 307, 308].flatMap((status) => [`post${status}-same`, `post${status}-cross`])];
const safeCaseReport = (value) => ({
  pass: value.pass === true, outcome: result(value.outcome), secondOutcome: result(value.secondOutcome),
  preparation: result(value.preparation), beforeRelease: counts(value.beforeRelease),
  pendingBoth: value.pendingBoth === true, cookiePresentBefore: value.cookiePresentBefore === true,
  cookiePresentAfter: value.cookiePresentAfter === true, cookieMatchesAfterRejectedResponse: value.cookieMatchesAfterRejectedResponse === true,
  positiveSame: value.positiveSame === true, positiveCross: value.positiveCross === true,
  fetchCalls: number(value.fetchCalls), cleanup: value.cleanup === true, issue: value.issue ? 'probe_incomplete' : undefined,
});
const handler = async (request, response) => {
  if (await authReceiver.handle(request, response)) return;
  const url = new URL(request.url, 'http://127.0.0.1');
  const match = /^\/runs\/((?:android|ios)-[a-z0-9-]+)\/(.*)$/.exec(url.pathname);
  const reply = (status, data, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    response.end(JSON.stringify(data));
  };
  if (!match) return reply(404, { error: 'unknown_probe_route' });
  const [, id, route] = match;
  const cookiePath = `/runs/${id}/api/v1`;
  if (route === 'start' && request.method === 'GET') {
    const mode = url.searchParams.get('mode') ?? 'basic';
    if (!modes.includes(mode)) return reply(400, { error: 'unsupported_probe_mode' });
    runs.set(id, { token: randomUUID(), cookie: randomUUID(), mode, csrf: 0, get: 0, post: 0,
      cookieMatches: false, cookieNamePresent: false, csrfMatches: false, csrfHadCacheQuery: false,
      postPairsMatch: true, sameSink: 0, crossSink: 0, positiveSame: 0, positiveCross: 0,
      sourceBytes: 0, sourceBodyMatches: true, lastSink: null, csrfWaiters: [], releases: [], held: mode === 'concurrent' });
    return reply(200, { ok: true }, { 'Set-Cookie': `SCRUM165_PROBE=; Path=${cookiePath}; HttpOnly; Max-Age=0` });
  }
  const run = runs.get(id);
  if (!run) return reply(409, { error: 'probe_not_started' });
  const snapshot = () => ({ csrf: run.csrf, get: run.get, post: run.post, cookieMatches: run.cookieMatches, csrfMatches: run.csrfMatches, csrfHadCacheQuery: run.csrfHadCacheQuery,
    ...(run.mode !== 'basic' ? { cookieNamePresent: run.cookieNamePresent, postPairsMatch: run.postPairsMatch,
      sameSink: run.sameSink, crossSink: run.crossSink, positiveSame: run.positiveSame, positiveCross: run.positiveCross,
      sourceBytes: run.sourceBytes, lastSink: run.lastSink } : {}),
    ...(bodyCases.includes(run.mode) ? { sourceBodyMatches: run.sourceBodyMatches } : {}) });
  if (route === 'wait-csrf' && request.method === 'GET') {
    if (run.csrf > 0) return reply(200, { ok: true });
    run.csrfWaiters.push(() => { if (!response.destroyed) reply(200, { ok: true }); });
    return;
  }
  if (route === 'release' && request.method === 'GET') {
    run.held = false;
    run.releases.splice(0).forEach((release) => release());
    return reply(200, { ok: true });
  }
  if (route === 'sink' || route === 'api/v1/sink') {
    const cross = request.socket.localPort === 48592;
    if (request.headers['x-probe-control'] === 'reachability') {
      if (cross) run.positiveCross += 1; else run.positiveSame += 1;
      return reply(200, { ok: true });
    }
    let bytes = 0;
    for await (const chunk of request) bytes += chunk.length;
    if (cross) run.crossSink += 1; else run.sameSink += 1;
    run.lastSink = { method: ['GET', 'POST'].includes(request.method) ? request.method : 'other',
      hasCookie: !!request.headers.cookie, hasCsrf: !!request.headers['x-xsrf-token'], bytes };
    return reply(200, { data: { received: true } });
  }
  if (route === 'health' && request.method === 'GET') return reply(200, { ok: true });
  if (route === 'snapshot' && request.method === 'GET') return reply(200, snapshot());
  if (route === 'finish' && request.method === 'GET') {
    return reply(200, snapshot(), { 'Set-Cookie': `SCRUM165_PROBE=; Path=${cookiePath}; HttpOnly; Max-Age=0` });
  }
  if (route === 'api/v1/auth/csrf' && request.method === 'GET') {
    run.csrf += 1;
    run.csrfHadCacheQuery = url.searchParams.has('_');
    run.csrfWaiters.splice(0).forEach((wake) => wake());
    if (run.mode.startsWith('http')) return reply(Number(run.mode.slice(4)), { error: { code: 'SYNTHETIC_FAILURE' } });
    if (run.mode === 'invalid-json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return response.end('{');
    }
    if (run.mode === 'network') return request.socket.destroy();
    if (run.mode === 'csrf302') return reply(302, {}, {
      Location: `/runs/${id}/api/v1/sink`,
      'Set-Cookie': `SCRUM165_PROBE=${run.cookie}; Path=${cookiePath}; HttpOnly`,
    });
    const issue = () => {
      if (!response.destroyed) reply(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: run.token }, {
        'Set-Cookie': `SCRUM165_PROBE=${run.cookie}; Path=${cookiePath}; HttpOnly`,
      });
    };
    if (run.held) { run.releases.push(issue); return; }
    return issue();
  }
  if (route === 'api/v1/probe') {
    const cookies = (request.headers.cookie ?? '').split(';').map((cookie) => cookie.trim());
    run.cookieMatches = cookies.includes(`SCRUM165_PROBE=${run.cookie}`);
    run.cookieNamePresent = cookies.some((cookie) => cookie.startsWith('SCRUM165_PROBE='));
    if (request.method === 'GET') run.get += 1;
    else if (request.method === 'POST') {
      run.post += 1;
      run.csrfMatches = request.headers['x-xsrf-token'] === run.token;
      run.postPairsMatch = run.postPairsMatch && run.cookieMatches && run.csrfMatches;
      const checkBody = bodyCases.includes(run.mode);
      const multipart = run.mode === 'post-loss-multipart';
      const digest = checkBody && !multipart ? createHash('sha256') : undefined;
      // 원문은 multipart 합성 필드 확인 동안만 사용하고 상태/로그에는 저장하지 않는다.
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        digest?.update(chunk);
        if (multipart) chunks.push(chunk);
      }
      run.sourceBytes += bytes;
      if (checkBody) {
        const contentType = request.headers['content-type'];
        if (multipart) {
          const match = /^multipart\/form-data;\s*boundary=(?:"([^"\r\n]+)"|([^;\s\r\n]+))$/i.exec(contentType ?? '');
          const boundary = match?.[1] ?? match?.[2];
          const expected = boundary ? Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="probe"\r\n\r\nsynthetic\r\n--${boundary}--\r\n`) : undefined;
          run.sourceBodyMatches = run.sourceBodyMatches && !!expected && Buffer.concat(chunks).equals(expected);
          chunks.length = 0;
        } else {
          const expected = run.mode === 'post-loss-empty' ? Buffer.alloc(0)
            : run.mode === 'post-loss-json' ? Buffer.from('{"probe":"synthetic"}')
            : run.mode === 'post-loss-binary' ? Buffer.from([0, 127, 128, 255]) : Buffer.from('synthetic-body');
          const contentTypeMatches = run.mode === 'post-loss-json' ? contentType === 'application/json'
            : run.mode === 'post-loss-binary' ? contentType === 'application/octet-stream' : true;
          run.sourceBodyMatches = run.sourceBodyMatches && contentTypeMatches && bytes === expected.length
            && digest.digest('hex') === createHash('sha256').update(expected).digest('hex');
        }
      }
      if (run.mode.startsWith('post-loss')) return request.socket.destroy();
      if (run.mode === 'post503-zero') return reply(503, { error: { code: 'SYNTHETIC_FAILURE' } }, { 'Retry-After': '0' });
      if (run.mode.startsWith('post')) {
        const target = new URL(`http://${request.headers.host}/runs/${id}/sink`);
        if (run.mode.endsWith('cross')) { target.port = '48592'; target.pathname = `/runs/${id}/api/v1/sink`; }
        return reply(Number(run.mode.slice(4, 7)), {}, { Location: target.href });
      }
    } else return reply(405, { error: 'unsupported_probe_method' });
    return reply(200, { data: { cookieMatches: run.cookieMatches, csrfMatches: run.csrfMatches, cookieNamePresent: run.cookieNamePresent } });
  }
  if (route === 'report' && request.method === 'POST') {
    let data = '';
    for await (const chunk of request) {
      data += chunk;
      if (data.length > 8192) return reply(413, { error: 'probe_report_too_large' });
    }
    // 진단 진입점은 원문 URL·헤더·본문·token을 이 endpoint로 보내지 않는다.
    try {
      const report = JSON.parse(data);
      if (report.platform !== id.split('-')[0]) throw new Error();
      if (report.stage === '3b' && run.mode !== 'basic') {
        process.stdout.write(`${JSON.stringify({ stage: '3b', platform: report.platform, case: run.mode, report: safeCaseReport(report), receiver: snapshot() })}\n`);
        return reply(200, { ok: true });
      }
      if (!Array.isArray(report.observations)) throw new Error();
      process.stdout.write(`${JSON.stringify({ platform: id.split('-')[0], report: safeReport(report), receiver: snapshot() })}\n`);
      return reply(200, { ok: true });
    } catch {
      return reply(400, { error: 'invalid_probe_report' });
    }
  }
  return reply(404, { error: 'unknown_probe_route' });
};
const servers = [48591, 48592].map((port) => createServer(handler).listen(port, '127.0.0.1', () => process.stdout.write(`SCRUM-165 receiver ready on loopback:${port}\n`)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  authReceiver.close();
  runs.forEach((run) => run.releases.splice(0).forEach((release) => release()));
  servers.forEach((server) => server.close());
});

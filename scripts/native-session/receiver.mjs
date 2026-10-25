import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

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

const server = createServer(async (request, response) => {
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
    runs.set(id, { token: randomUUID(), cookie: randomUUID(), csrf: 0, get: 0, post: 0, cookieMatches: false, csrfMatches: false, csrfHadCacheQuery: false });
    return reply(200, { ok: true }, { 'Set-Cookie': `SCRUM165_PROBE=; Path=${cookiePath}; HttpOnly; Max-Age=0` });
  }
  const run = runs.get(id);
  if (!run) return reply(409, { error: 'probe_not_started' });
  const snapshot = () => ({ csrf: run.csrf, get: run.get, post: run.post, cookieMatches: run.cookieMatches, csrfMatches: run.csrfMatches, csrfHadCacheQuery: run.csrfHadCacheQuery });
  if (route === 'health' && request.method === 'GET') return reply(200, { ok: true });
  if (route === 'snapshot' && request.method === 'GET') return reply(200, snapshot());
  if (route === 'finish' && request.method === 'GET') {
    return reply(200, snapshot(), { 'Set-Cookie': `SCRUM165_PROBE=; Path=${cookiePath}; HttpOnly; Max-Age=0` });
  }
  if (route === 'api/v1/auth/csrf' && request.method === 'GET') {
    run.csrf += 1;
    run.csrfHadCacheQuery = url.searchParams.has('_');
    return reply(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: run.token }, {
      'Set-Cookie': `SCRUM165_PROBE=${run.cookie}; Path=${cookiePath}; HttpOnly`,
    });
  }
  if (route === 'api/v1/probe') {
    run.cookieMatches = (request.headers.cookie ?? '').split(';').some((cookie) => cookie.trim() === `SCRUM165_PROBE=${run.cookie}`);
    if (request.method === 'GET') run.get += 1;
    else if (request.method === 'POST') {
      run.post += 1;
      run.csrfMatches = request.headers['x-xsrf-token'] === run.token;
    } else return reply(405, { error: 'unsupported_probe_method' });
    return reply(200, { data: { cookieMatches: run.cookieMatches, csrfMatches: run.csrfMatches } });
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
      if (report.platform !== id.split('-')[0] || !Array.isArray(report.observations)) throw new Error();
      process.stdout.write(`${JSON.stringify({ platform: id.split('-')[0], report: safeReport(report), receiver: snapshot() })}\n`);
      return reply(200, { ok: true });
    } catch {
      return reply(400, { error: 'invalid_probe_report' });
    }
  }
  return reply(404, { error: 'unknown_probe_route' });
});
server.listen(48591, '127.0.0.1', () => process.stdout.write('SCRUM-165 stage3a receiver ready on loopback:48591\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

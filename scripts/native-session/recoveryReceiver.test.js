/** @jest-environment node */
const { test, expect } = require('@jest/globals');
const { Buffer } = require('node:buffer');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const createRecoveryReceiver = require('./recoveryReceiver');

class Reply extends EventEmitter {
  destroyed = false; writableEnded = false; headers = {}; chunks = []; flushed = false;
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  flushHeaders() { this.flushed = true; }
  write(value) { this.chunks.push(Buffer.from(value)); }
  end(value) { if (value !== undefined) this.write(value); this.writableEnded = true; this.emit('finish'); this.emit('close'); }
  destroy() { this.destroyed = true; this.emit('close'); }
  bytes() { return Buffer.concat(this.chunks); }
  json() { return JSON.parse(this.bytes().toString()); }
}
async function fixture(mode = 'current', platform = 'android') {
  const rows = []; const receiver = createRecoveryReceiver((row) => rows.push(row));
  const call = async (path, method = 'GET', headers = {}, body = '') => {
    const request = Readable.from(body ? [body] : []);
    Object.assign(request, { url: `/runs/${platform}-recovery-${mode}-123/${path}`, method, headers });
    const response = new Reply(); request.socket = { destroy: () => response.destroy() };
    expect(await receiver.handle(request, response)).toBe(true);
    return response;
  };
  const start = await call(`start?mode=${mode}`);
  return { call, rows, receiver, start };
}
const cookie = (reply) => reply.headers['Set-Cookie']?.split(';')[0];
const pair = (reply) => ({ cookie: cookie(reply), 'x-xsrf-token': reply.json().token });
const checks = { prepared: true, result: true, counts: true, pairs: true, cleanupAbsent: true };
const report = (extra = {}) => JSON.stringify({ platform: 'android', stage: '167-6', pass: true, cleanup: true, checks, ...extra });

test('CSRF 발급·로그인·로그아웃은 scoped cookie와 토큰 쌍 및 0바이트를 확인한다', async () => {
  const { call, start } = await fixture();
  expect(start.status).toBe(200);
  const first = await call('api/v1/auth/csrf');
  expect(first.json()).toEqual({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: expect.any(String) });
  expect(first.headers['Set-Cookie']).toContain('Path=/runs/android-recovery-current-123/api/v1; HttpOnly');
  const login = await call('api/v1/auth/login', 'POST', pair(first), '{"account":"b"}');
  expect(login.status).toBe(200); expect(login.json()).toEqual({ data: { account: 'b' } });
  expect(cookie(login)).not.toBe(cookie(first));
  const next = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(login) });
  expect(next.json().token).not.toBe(first.json().token);
  const logout = await call('api/v1/auth/logout', 'POST', pair(next));
  expect(logout.status).toBe(204); expect(logout.bytes()).toHaveLength(0);
  expect(logout.headers['Set-Cookie']).toContain('Max-Age=0');
  expect((await call('snapshot')).json()).toMatchObject({ csrf: 2, login: 1, logout: 1, post: 0, get: 0, pairs: true, bodyEmpty: true, account: 'none' });
});

test.each([
  ['current', 200, undefined], ['afterparse', 200, undefined],
  ['expiry-cleanup', 401, 'AUTHENTICATION_REQUIRED'], ['concurrent401', 401, 'AUTHENTICATION_REQUIRED'],
  ['guardian403', 403, 'GUARDIAN_UNLOCK_REQUIRED'], ['unavailable503', 503, 'AUTH_STATE_UNAVAILABLE'],
])('%s는 정확한 HTTP/code와 원래 요청 횟수를 반환한다', async (mode, status, code) => {
  const { call } = await fixture(mode); const csrf = await call('api/v1/auth/csrf');
  const response = await call('api/v1/probe', 'POST', pair(csrf));
  expect(response.status).toBe(status);
  if (code) expect(response.json()).toEqual({ error: { code, message: 'Synthetic', requestId: '22222222-2222-4222-8222-222222222222', fields: [] } });
  else expect(response.json()).toEqual({ data: { account: 'a' } });
  expect((await call('snapshot')).json()).toMatchObject({ post: 1, get: 0, csrf: 1, pairs: true, bodyEmpty: true });
});

test.each(['late-json-logout', 'late-json-same', 'late-json-other', 'late401', 'late403'])('%s 본문은 헤더 뒤 유지하고 전환이 완료돼도 원래 내용을 보존한다', async (mode) => {
  const { call } = await fixture(mode, 'ios'); const csrf = await call('api/v1/auth/csrf');
  const wait = await call('wait?phase=body');
  const pending = await call('api/v1/probe', mode === 'late403' ? 'POST' : 'GET', pair(csrf));
  expect(wait.writableEnded).toBe(true); expect(pending.flushed).toBe(true); expect(pending.writableEnded).toBe(false);
  expect(pending.bytes().length).toBe(1);
  expect((await call('finish')).status).toBe(409);
  const login = await call('api/v1/auth/login', 'POST', pair(csrf), '{"account":"b"}');
  expect(login.json().data.account).toBe('b');
  await call('release?phase=body');
  expect(pending.writableEnded).toBe(true);
  if (mode.startsWith('late-json')) expect(pending.json()).toEqual({ data: { account: 'a' } });
  else expect(pending.json().error.code).toBe(mode === 'late401' ? 'AUTHENTICATION_REQUIRED' : 'CSRF_INVALID');
  expect((await call('snapshot')).json()).toMatchObject({ held: 0, activeResponses: 0, waiters: 0, pairs: true, account: 'b' });
});

test('같은 토큰의 두 POST가 접수된 뒤에만 두403 본문을 해제한다', async () => {
  const { call } = await fixture('csrf-concurrent'); const csrf = await call('api/v1/auth/csrf');
  const first = await call('api/v1/probe', 'POST', pair(csrf));
  expect(first.writableEnded).toBe(false);
  const second = await call('api/v1/probe', 'POST', pair(csrf));
  expect(first.json().error.code).toBe('CSRF_INVALID'); expect(second.json().error.code).toBe('CSRF_INVALID');
  expect((await call('snapshot')).json()).toMatchObject({ post: 2, csrf: 1, held: 0, pairs: true });
});

test.each(['csrf-recovery-held', 'csrf-failure-late'])('%s의 두 번째 발급 본문만 유지하고 제어 요청으로 해제한다', async (mode) => {
  const { call } = await fixture(mode); const csrf = await call('api/v1/auth/csrf');
  expect((await call('api/v1/probe', 'POST', pair(csrf))).json().error.code).toBe('CSRF_INVALID');
  const pending = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(csrf) });
  expect(pending.status).toBe(mode === 'csrf-failure-late' ? 401 : 200);
  expect(pending.flushed).toBe(true); expect(pending.writableEnded).toBe(false);
  expect((await call('wait?phase=recovery')).writableEnded).toBe(true);
  await call('release?phase=recovery');
  if (mode === 'csrf-failure-late') expect(pending.json().error.code).toBe('AUTHENTICATION_REQUIRED');
  else expect(pending.json().token).not.toBe(csrf.json().token);
});

test('무효화 시험은 첫 CSRF 본문 유지 중 쿠키 없는401 GET을 허용한다', async () => {
  const { call } = await fixture('csrf-invalidated');
  const pending = await call('api/v1/auth/csrf');
  expect(pending.writableEnded).toBe(false);
  expect((await call('api/v1/probe')).json().error.code).toBe('AUTHENTICATION_REQUIRED');
  expect((await call('snapshot')).json()).toMatchObject({ csrf: 1, get: 1, pairs: true, held: 1 });
  await call('release?phase=recovery'); expect(pending.json().token).toEqual(expect.any(String));
});

test('잘못된 cookie·token과 비어 있지 않은 업무 POST는 실패 증거를 남긴다', async () => {
  const { call } = await fixture(); await call('api/v1/auth/csrf');
  await call('api/v1/probe', 'POST', { cookie: 'SCRUM167_PROBE=wrong', 'x-xsrf-token': 'wrong' }, '{}');
  expect((await call('snapshot')).json()).toMatchObject({ pairs: false, bodyEmpty: false, post: 1 });
});

test('cleanup은 열린 응답·waiter를 감지하고 종료 후 cookie를 만료시킨다', async () => {
  const { call, receiver } = await fixture('late401'); const csrf = await call('api/v1/auth/csrf');
  const pending = await call('api/v1/probe', 'GET', pair(csrf));
  const settled = await call('wait?phase=settled');
  expect((await call('finish')).status).toBe(409);
  receiver.close();
  expect(pending.destroyed).toBe(true); expect(settled.writableEnded || settled.destroyed).toBe(true);
  const finish = await call('finish'); expect(finish.status).toBe(200); expect(finish.headers['Set-Cookie']).toContain('Max-Age=0');
  expect((await call('api/v1/observe')).json()).toEqual({ data: { cookiePresent: false } });
});

test('보고서는 허용된 검사·횟수만 기록하고 원문·헤더·임의 필드를 버린다', async () => {
  const { call, rows } = await fixture();
  await call('finish');
  const response = await call('report', 'POST', {}, report({ token: 'synthetic-secret', refresh: { ok: false, reason: 'http', status: 401, meta: { headers: { location: 'synthetic-secret' } } }, checks: { ...checks, 'synthetic-secret': true } }));
  expect(response.status).toBe(200); expect(rows).toHaveLength(1); expect(rows[0].report.pass).toBe(true);
  expect(JSON.stringify(rows)).not.toContain('synthetic-secret');
  expect(rows[0]).toMatchObject({ stage: '167-6', platform: 'android', case: 'current', report: { checks } });
});

test.each([
  { checks: { prepared: true } }, { cleanup: false }, { issue: 'incomplete' }, { issue: 'deadline' },
])('검사 누락·cleanup 실패·중단은 pass=true 보고서라도 실패한다: %j', async (extra) => {
  const { call, rows } = await fixture(); await call('finish');
  expect((await call('report', 'POST', {}, report(extra))).status).toBe(200);
  expect(rows[0].report.pass).toBe(false);
});

test('finish 없이 보고한 성공이나 다른 stage 보고서는 인정하지 않는다', async () => {
  const { call, rows } = await fixture();
  expect((await call('report', 'POST', {}, report({ stage: '5' }))).status).toBe(400);
  expect(rows).toHaveLength(0);
  expect((await call('report', 'POST', {}, report())).status).toBe(200);
  expect(rows[0].report.pass).toBe(false);
});

test('finish 뒤 새 API 요청이 들어오면 이전 cleanup을 성공 근거로 재사용하지 않는다', async () => {
  const { call, rows } = await fixture();
  expect((await call('finish')).status).toBe(200);
  await call('api/v1/auth/csrf');
  expect((await call('report', 'POST', {}, report())).status).toBe(200);
  expect(rows[0].report.pass).toBe(false);
});

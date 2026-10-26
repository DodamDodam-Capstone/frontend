/** @jest-environment node */
const { test, expect } = require('@jest/globals');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const createAuthReceiver = require('./authReceiver');

class Reply extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  headers = {};
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  write(value) { this.body = (this.body ?? '') + value; }
  end(value) { if (value !== undefined) this.write(value); this.writableEnded = true; this.emit('finish'); this.emit('close'); }
  json() { return JSON.parse(this.body); }
  disconnect() { this.destroyed = true; this.emit('close'); }
}
async function fixture(mode) {
  const rows = [];
  const receiver = createAuthReceiver((value) => rows.push(value));
  const call = async (path, method = 'GET', headers = {}, body = '') => {
    const request = Readable.from(body ? [body] : []);
    Object.assign(request, { url: `/runs/android-auth-test/${path}`, method, headers });
    const response = new Reply(); request.socket = { destroy: () => response.disconnect() };
    expect(await receiver.handle(request, response)).toBe(true);
    return response;
  };
  expect((await call(`start?mode=${mode}`)).status).toBe(200);
  return { call, rows };
}
const cookie = (reply) => { const value = reply.headers['Set-Cookie']; return (Array.isArray(value) ? value[0] : value)?.split(';')[0]; };
const pair = (reply) => ({ cookie: cookie(reply), 'x-xsrf-token': reply.json().token });

test('로그인 뒤 새 cookie/token 조합과 wire 횟수를 구분한다', async () => {
  const { call } = await fixture('login');
  const first = await call('api/v1/auth/csrf');
  const auth = await call('api/v1/auth/login', 'POST', pair(first), 'synthetic-auth');
  expect(auth.status).toBe(200);
  expect(cookie(auth)).not.toBe(cookie(first));
  const fresh = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(auth) });
  expect(fresh.json().token).not.toBe(first.json().token);
  await call('api/v1/probe', 'POST', pair(fresh));
  expect((await call('snapshot')).json()).toMatchObject({ csrf: 2, auth: 1, post: 1, authPairs: true, postPairs: true, authBodyMatches: true, refreshCookieMatchesAuth: true });
});

test('logout은 빈 본문·cookie 만료 후 새 익명 조합을 제공한다', async () => {
  const { call } = await fixture('logout');
  const first = await call('api/v1/auth/csrf');
  const auth = await call('api/v1/auth/logout', 'POST', pair(first));
  expect(auth.status).toBe(204);
  expect(auth.headers['Set-Cookie']).toContain('Max-Age=0');
  const fresh = await call('api/v1/auth/csrf');
  expect(cookie(fresh)).not.toBe(cookie(first));
  expect((await call('snapshot')).json()).toMatchObject({ authBytes: 0, authBodyMatches: true, anonymous: true, refreshCookieAbsent: true, refreshHadOldCookie: false });
});

test('지연 응답은 해제 시점이 아닌 요청 수신 시점의 오래된 cookie/token을 보존한다', async () => {
  const { call } = await fixture('drain-csrf');
  const old = await call('api/v1/auth/csrf');
  expect(old.writableEnded).toBe(false);
  // fixture 자체의 고장 탐지: 정상 client는 이 순서로 auth를 보내면 안 된다.
  const auth = await call('api/v1/auth/login', 'POST', {}, 'synthetic-auth');
  await call('release?phase=csrf');
  const fresh = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(auth) });
  expect(cookie(old)).not.toBe(cookie(auth));
  expect(old.json().token).not.toBe(fresh.json().token);
  expect((await call('snapshot')).json().authPairs).toBe(false);
});

test('abort로 닫힌 auth 응답은 JS 종료와 별도 기록하고 해제 뒤 쓰기를 막는다', async () => {
  const { call } = await fixture('cancel-auth');
  const first = await call('api/v1/auth/csrf');
  const auth = await call('api/v1/auth/login', 'POST', pair(first), 'synthetic-auth');
  expect(auth.writableEnded).toBe(false);
  auth.disconnect();
  await call('release?phase=auth');
  expect((await call('snapshot')).json()).toMatchObject({ auth: 1, authClosed: true, authFinished: false, authClosedBeforeRelease: true, blockedLateWrite: true, held: 0, activeResponses: 0 });
});

test('갱신 오류와 fixture 복구는 auth를 반복하지 않고 독립 발급한다', async () => {
  const { call } = await fixture('refresh503');
  const first = await call('api/v1/auth/csrf');
  const auth = await call('api/v1/auth/login', 'POST', pair(first), 'synthetic-auth');
  expect((await call('api/v1/auth/csrf', 'GET', { cookie: cookie(auth) })).status).toBe(503);
  await call('recover');
  const fresh = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(auth) });
  expect(fresh.status).toBe(200);
  await call('api/v1/probe', 'POST', pair(fresh));
  expect((await call('snapshot')).json()).toMatchObject({ csrf: 3, auth: 1, post: 1, postPairs: true });
});

test('미정리 응답이 있으면 finish를 거절하고 최종 관측 GET은 cookie를 발급하지 않는다', async () => {
  const { call } = await fixture('auth-held');
  const first = await call('api/v1/auth/csrf');
  await call('api/v1/auth/login', 'POST', pair(first), 'synthetic-auth');
  expect((await call('finish')).status).toBe(409);
  await call('release?phase=all');
  expect((await call('finish')).headers['Set-Cookie']).toContain('Max-Age=0');
  const observed = await call('api/v1/observe');
  expect(observed.json().data.cookieNamePresent).toBe(false);
  expect(observed.headers).not.toHaveProperty('Set-Cookie');
});

test('보고 allowlist는 stale/cancel 결과를 보존하고 cookie/token/예외 원문을 버린다', async () => {
  const { call, rows } = await fixture('login');
  const first = await call('api/v1/auth/csrf');
  const privateValue = first.json().token;
  await call('report', 'POST', {}, JSON.stringify({ platform: 'android', stage: '5', pass: false, cleanup: false,
    operation: { kind: 'stale_response', secret: privateValue }, secondary: { kind: 'not_sent', reason: 'cancelled', raw: privateValue },
    outcome: 'unknown', exception: privateValue, token: privateValue, cookie: cookie(first), checks: { blocked: true, [privateValue]: true } }));
  expect(rows[0].report.operation).toEqual({ kind: 'stale_response' });
  expect(rows[0].report.secondary).toEqual({ kind: 'not_sent', reason: 'cancelled' });
  expect(JSON.stringify(rows)).not.toContain(privateValue);
  expect(JSON.stringify(rows)).not.toContain(cookie(first));
});


test('로그인 Set-Cookie를 잃으면 익명 재발급과 인증 cookie 보존을 구별한다', async () => {
  const { call } = await fixture('login');
  const first = await call('api/v1/auth/csrf');
  await call('api/v1/auth/login', 'POST', pair(first), 'synthetic-auth');
  const anonymous = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(first) });
  expect((await call('snapshot')).json()).toMatchObject({ refreshCookieMatchesAuth: false, anonymous: true });
  const observed = await call('api/v1/observe', 'GET', { cookie: cookie(anonymous) });
  expect(observed.json().data).toMatchObject({ matchesCurrentCookie: true, matchesAuthCookie: false });
});

test('로그아웃 뒤 이전 cookie가 다시 전송되면 만료 성공으로 표시하지 않는다', async () => {
  const { call } = await fixture('logout');
  const first = await call('api/v1/auth/csrf');
  await call('api/v1/auth/logout', 'POST', pair(first));
  await call('api/v1/auth/csrf', 'GET', { cookie: cookie(first) });
  expect((await call('snapshot')).json()).toMatchObject({ refreshCookieAbsent: false, refreshHadOldCookie: true });
});


test('일반 CSRF 403의 늦은 쿠키가 새 CSRF 쿠키를 덮는 상태를 관측한다', async () => {
  const { call } = await fixture('late-csrf');
  const first = await call('api/v1/auth/csrf'); const session = cookie(first);
  const old = await call('api/v1/old-csrf', 'POST', { cookie: session, 'x-xsrf-token': first.json().token });
  const auth = await call('api/v1/auth/login', 'POST', { cookie: session, 'x-xsrf-token': first.json().token }, 'synthetic-auth');
  expect(auth.status).toBe(403);
  const authCsrf = auth.headers['Set-Cookie'].split(';')[0];
  await call('api/v1/auth/csrf', 'GET', { cookie: `${session}; ${authCsrf}` });
  await call('release?phase=old');
  const oldCsrf = old.headers['Set-Cookie'].split(';')[0];
  const observed = await call('api/v1/observe', 'GET', { cookie: `${session}; ${oldCsrf}` });
  expect(observed.json().data.csrfCookieMatchesCurrent).toBe(false);
  expect((await call('snapshot')).json()).toMatchObject({ oldMissingCsrfCookie: true, authSawCsrfMismatch: true });
});

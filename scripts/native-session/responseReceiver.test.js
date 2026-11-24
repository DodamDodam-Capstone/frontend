/** @jest-environment node */
const { test, expect } = require('@jest/globals');
const { Buffer } = require('node:buffer');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const createResponseReceiver = require('./responseReceiver');

class Reply extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  headers = {};
  chunks = [];
  flushed = false;
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  flushHeaders() { this.flushed = true; }
  write(value) { this.chunks.push(Buffer.from(value)); }
  end(value) { if (value !== undefined) this.write(value); this.writableEnded = true; this.emit('finish'); this.emit('close'); }
  destroy() { this.destroyed = true; this.emit('close'); }
  bytes() { return Buffer.concat(this.chunks); }
  json() { return JSON.parse(this.bytes().toString()); }
}
async function fixture(mode = 'json', platform = 'android') {
  const rows = [];
  const receiver = createResponseReceiver((value) => rows.push(value));
  const call = async (path, method = 'GET', headers = {}, body = '') => {
    const request = Readable.from(body ? [body] : []);
    Object.assign(request, { url: `/runs/${platform}-response-${mode}-123/${path}`, method, headers });
    const response = new Reply(); request.socket = { destroy: () => response.destroy() };
    expect(await receiver.handle(request, response)).toBe(true);
    return response;
  };
  const start = await call(`start?mode=${mode}`);
  return { call, rows, receiver, start };
}
const cookie = (reply) => reply.headers['Set-Cookie']?.split(';')[0];
const pair = (reply) => ({ cookie: cookie(reply), 'x-xsrf-token': reply.json().token });
const requestId = '22222222-2222-4222-8222-222222222222';

test('발급한 cookie/token 조합으로 JSON POST를 받고 최신 token을 갱신한다', async () => {
  const { call, start } = await fixture();
  expect(start.status).toBe(200);
  const first = await call('api/v1/auth/csrf');
  expect(first.json()).toEqual({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: expect.any(String) });
  expect(first.headers['Set-Cookie']).toContain('Path=/runs/android-response-json-123/api/v1; HttpOnly');
  const response = await call('api/v1/probe', 'POST', { ...pair(first), 'content-type': 'application/json' }, '{"probe":"synthetic"}');
  expect(response.status).toBe(201);
  expect(response.json()).toEqual({ data: { synthetic: true, value: null } });
  expect(response.headers).toMatchObject({ 'X-Request-ID': requestId, 'Cache-Control': 'no-store' });
  const second = await call('api/v1/auth/csrf', 'GET', { cookie: cookie(first) });
  expect(second.json().token).not.toBe(first.json().token);
  expect((await call('snapshot')).json()).toMatchObject({ csrf: 2, get: 0, post: 1, sourceBytes: 21, bodyMatches: true, pairs: true, cookiePresent: true, activeResponses: 0 });
});

test.each([
  ['auth-json', 'POST', '{"probe":"synthetic"}', 200, 'application/json', '{"data":{"synthetic":true,"value":null}}'],
  ['empty', 'POST', '', 204, 'application/json', ''],
  ['end', 'POST', '', 202, 'application/json', '{"data":{"conversationId":"33333333-3333-4333-8333-333333333333","status":"CLOSING"}}'],
  ['binary', 'GET', '', 200, 'audio/x-synthetic', Buffer.from([0, 127, 128, 255, 10, 13])],
  ['binary-empty', 'GET', '', 200, 'audio/x-synthetic', ''],
  ['json-invalid', 'GET', '', 200, 'application/json', '{'],
  ['json-mime', 'GET', '', 200, 'text/html', '{"data":{"synthetic":true,"value":null}}'],
])('%s 응답은 지정한 상태·MIME·본문과 실제 접수를 기록한다', async (mode, method, body, status, mime, expected) => {
  const { call } = await fixture(mode, 'ios');
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', method, { ...pair(csrf), ...(body ? { 'content-type': 'application/json' } : {}) }, body);
  expect(reply.status).toBe(status);
  expect(reply.headers).toMatchObject({ 'Content-Type': mime, 'X-Request-ID': requestId, 'Cache-Control': 'no-store' });
  expect(reply.bytes()).toEqual(Buffer.from(expected));
  if (mode === 'end') expect(reply.headers['Retry-After']).toBe('1');
  expect((await call('snapshot')).json()).toMatchObject({ get: method === 'GET' ? 1 : 0, post: method === 'POST' ? 1 : 0, sourceBytes: Buffer.byteLength(body), pairs: true, bodyMatches: true });
});

test.each([
  ['binary-error', 410, 'AUDIO_EXPIRED', []],
  ['fields-missing', 400, 'VALIDATION_FAILED', undefined],
  ['fields-invalid', 400, 'VALIDATION_FAILED', null],
  ['post503', 503, 'AUTH_STATE_UNAVAILABLE', []],
])('%s 오류는 공통 오류 envelope와 Retry-After를 구분한다', async (mode, status, code, fields) => {
  const { call } = await fixture(mode);
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', mode === 'post503' ? 'POST' : 'GET', pair(csrf));
  expect(reply.status).toBe(status);
  expect(reply.json()).toEqual({ error: { code, message: 'Synthetic', requestId, ...(fields !== undefined ? { fields } : {}) } });
  expect(reply.headers['X-Request-ID']).toBe(requestId);
  if (mode === 'post503') expect(reply.headers['Retry-After']).toBe('0');
});

test('multipart는 실제 boundary와 probe 합성 필드를 확인한다', async () => {
  const { call } = await fixture('multipart');
  const csrf = await call('api/v1/auth/csrf');
  const body = '--native-boundary\r\nContent-Disposition: form-data; name="probe"\r\n\r\nsynthetic\r\n--native-boundary--\r\n';
  const reply = await call('api/v1/probe', 'POST', { ...pair(csrf), 'content-type': 'multipart/form-data; boundary=native-boundary' }, body);
  expect(reply.status).toBe(201);
  expect((await call('snapshot')).json()).toMatchObject({ post: 1, sourceBytes: Buffer.byteLength(body), bodyMatches: true });
  await call('api/v1/probe', 'POST', { ...pair(csrf), 'content-type': 'multipart/form-data; boundary=wrong' }, body);
  expect((await call('snapshot')).json()).toMatchObject({ post: 2, bodyMatches: false });
});

test('쿠키와 CSRF 또는 JSON 본문이 다른 요청은 원문 없이 불일치를 남긴다', async () => {
  const { call } = await fixture();
  await call('api/v1/auth/csrf');
  await call('api/v1/probe', 'POST', { cookie: 'SCRUM166_PROBE=wrong', 'x-xsrf-token': 'wrong' }, '{}');
  expect((await call('snapshot')).json()).toMatchObject({ cookiePresent: true, pairs: false, bodyMatches: false, sourceBytes: 2 });
});

test.each(['delay-json', 'delay-binary', 'cancel-json', 'cancel-binary', 'disconnect-json', 'disconnect-binary', 'late-json', 'late-binary', 'late-clone-json', 'late-clone-binary']
  .flatMap(mode => ['android', 'ios'].map(platform => [mode, platform])))('%s %s는 헤더·부분 본문 이후 유지하고 해제/단절 때 정리한다', async (mode, platform) => {
  const { call } = await fixture(mode, platform);
  const headers = await call('wait?phase=headers');
  expect(headers.writableEnded).toBe(false);
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', 'GET', pair(csrf));
  const binary = mode.endsWith('binary');
  const expected = binary ? Buffer.from([0, 127, 128, 255, 10, 13]) : Buffer.from('{"data":{"synthetic":true,"value":null}}');
  expect(headers.writableEnded).toBe(true);
  expect(reply.flushed).toBe(true);
  expect(reply.headers['Content-Length']).toBe(binary || platform === 'ios' ? expected.length : undefined);
  expect(reply.bytes().length).toBeGreaterThan(0);
  expect(reply.bytes().length).toBeLessThan(expected.length);
  expect(reply.writableEnded).toBe(false);
  expect((await call('snapshot')).json()).toMatchObject({ headersSent: true, held: 1, activeResponses: 1, closed: 0, finished: 0 });
  expect((await call('finish')).status).toBe(409);
  const settled = await call('wait?phase=settled');
  expect(settled.writableEnded).toBe(false);
  if (mode.startsWith('delay')) {
    await call('release');
    expect(reply.bytes()).toEqual(expected);
  } else if (mode.startsWith('cancel')) reply.destroy();
  else { await call('disconnect'); expect(reply.destroyed).toBe(true); }
  expect(settled.writableEnded).toBe(true);
  const beforeRelease = reply.bytes();
  await call('release');
  expect(reply.bytes()).toEqual(beforeRelease);
  expect((await call('snapshot')).json()).toMatchObject({ held: 0, activeResponses: 0, closed: 1, finished: mode.startsWith('delay') ? 1 : 0 });
  expect((await call('finish')).status).toBe(200);
});

test('수신자 종료는 유지 응답과 대기 응답을 끝내고 닫힌 대기는 제거한다', async () => {
  const { call, receiver } = await fixture('delay-json');
  const abandoned = await call('wait?phase=headers');
  abandoned.destroy();
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', 'GET', pair(csrf));
  const settled = await call('wait?phase=settled');
  receiver.close();
  expect(reply.destroyed || reply.writableEnded).toBe(true);
  expect(settled.destroyed || settled.writableEnded).toBe(true);
  expect(abandoned.writableEnded).toBe(false);
  expect((await call('snapshot')).json()).toMatchObject({ held: 0, activeResponses: 0 });
});

test('응답 전 연결 손실은 수신 POST 1회와 0바이트를 남긴다', async () => {
  const { call } = await fixture('post-loss');
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', 'POST', pair(csrf));
  expect(reply.destroyed).toBe(true);
  expect(reply.status).toBeUndefined();
  expect((await call('snapshot')).json()).toMatchObject({ post: 1, sourceBytes: 0, bodyMatches: true, activeResponses: 0, closed: 1 });
});

test('redirect 목적지의 positive control과 실제 이동을 별도로 센다', async () => {
  const { call } = await fixture('redirect');
  const csrf = await call('api/v1/auth/csrf');
  const reply = await call('api/v1/probe', 'GET', pair(csrf));
  expect(reply.status).toBe(302);
  expect(reply.headers.Location).toBe('/runs/android-response-redirect-123/api/v1/sink');
  await call('api/v1/sink', 'GET', { 'x-probe-control': 'reachability' });
  expect((await call('snapshot')).json()).toMatchObject({ positive: 1, sink: 0 });
  await call('api/v1/sink');
  expect((await call('snapshot')).json()).toMatchObject({ positive: 1, sink: 1 });
});

test('finish는 cookie를 만료시키고 observe는 새 cookie를 발급하지 않는다', async () => {
  const { call } = await fixture();
  const csrf = await call('api/v1/auth/csrf');
  const before = await call('api/v1/observe', 'GET', pair(csrf));
  expect(before.json()).toEqual({ data: { cookiePresent: true } });
  expect(before.headers['Set-Cookie']).toBeUndefined();
  const finish = await call('finish');
  expect(finish.headers['Set-Cookie']).toContain('SCRUM166_PROBE=;');
  expect(finish.headers['Set-Cookie']).toContain('Max-Age=0');
  const after = await call('api/v1/observe');
  expect(after.json()).toEqual({ data: { cookiePresent: false } });
  expect(after.headers['Set-Cookie']).toBeUndefined();
});

test('보고서는 안전한 enum·횟수·boolean만 허용한다', async () => {
  const { call, rows } = await fixture();
  const secret = 'must-never-appear';
  const response = await call('report', 'POST', {}, JSON.stringify({ stage: '166-5', platform: 'android', pass: true, cleanup: true, fetchCalls: 3,
    checks: { inert: true, cleanupAbsent: false, result: secret, token: secret },
    outcome: { kind: 'format_error', reason: 'invalid_json', status: 200, message: secret }, issue: 'incomplete', body: secret, cookie: secret }));
  expect(response.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ stage: '166-5', platform: 'android', case: 'json', report: { pass: false, cleanup: true, fetchCalls: 3,
    checks: { inert: true, cleanupAbsent: false }, outcome: { kind: 'format_error', reason: 'invalid_json', status: 200 }, issue: 'incomplete' } });
  expect(JSON.stringify(rows)).not.toContain(secret);
  expect(rows[0].report.checks).not.toHaveProperty('result');
});

test('보고서 제한은 문자 수 대신 8192바이트이며 잘못된 플랫폼·stage는 거절한다', async () => {
  const { call, rows } = await fixture();
  expect((await call('report', 'POST', {}, JSON.stringify({ stage: '166-5', platform: 'ios' }))).status).toBe(400);
  expect((await call('report', 'POST', {}, JSON.stringify({ stage: '5', platform: 'android' }))).status).toBe(400);
  expect((await call('report', 'POST', {}, JSON.stringify({ stage: '166-5', platform: 'android', ignored: '가'.repeat(3000) }))).status).toBe(413);
  expect(rows).toEqual([]);
});

test('알 수 없는 case·중복 시작·등록 전 요청·지원하지 않는 제어를 거절한다', async () => {
  const invalid = await fixture('unknown');
  expect(invalid.start.status).toBe(400);
  expect((await invalid.call('snapshot')).status).toBe(409);
  const { call, receiver } = await fixture();
  expect((await call('start?mode=json')).status).toBe(400);
  expect((await call('wait?phase=wrong')).status).toBe(400);
  expect((await call('unknown')).status).toBe(404);
  expect((await call('api/v1/probe', 'DELETE')).status).toBe(405);
  expect(await receiver.handle({ url: '/runs/android-auth-test/start' }, new Reply())).toBe(false);
});


test('완전한 check를 보내도 receiver cleanup 완료 전에는 PASS로 기록하지 않는다', async () => {
  const { requiredResponseChecks } = require('./report');
  const { call, rows } = await fixture('json');
  const checks = Object.fromEntries(requiredResponseChecks('json').map((key) => [key, true]));
  await call('report', 'POST', {}, JSON.stringify({ platform: 'android', stage: '166-5', pass: true, cleanup: true, checks }));
  expect(rows[0].report.pass).toBe(false);
});

test('필수 check·정리가 완료된 보고서는 PASS로 기록한다', async () => {
  const { requiredResponseChecks } = require('./report');
  const { call, rows } = await fixture('json');
  const checks = Object.fromEntries(requiredResponseChecks('json').map((key) => [key, true]));
  expect((await call('finish')).status).toBe(200);
  await call('report', 'POST', {}, JSON.stringify({ platform: 'android', stage: '166-5', pass: true, cleanup: true, checks }));
  expect(rows[0].report.pass).toBe(true);
});


test('cleanup 뒤 새 API 요청이 생기면 이전 finish를 재사용하지 않는다', async () => {
  const { requiredResponseChecks } = require('./report');
  const { call, rows } = await fixture('json');
  const checks = Object.fromEntries(requiredResponseChecks('json').map((key) => [key, true]));
  expect((await call('finish')).status).toBe(200);
  expect((await call('api/v1/auth/csrf')).status).toBe(200);
  await call('report', 'POST', {}, JSON.stringify({ platform: 'android', stage: '166-5', pass: true, cleanup: true, checks }));
  expect(rows[0].report.pass).toBe(false);
});

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch } from './client';
import { prepareRequestBody } from './requestBody';
import { parseApiResponse } from './response';
import { classifyRecovery } from './recovery';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const requestId = '22222222-2222-4222-8222-222222222222';
const account = {
  accountId: '11111111-1111-4111-8111-111111111111', email: 'guardian@example.com',
  childId: null, hasPin: false, guardianUnlockedUntil: null,
};
function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...extraHeaders,
  } });
}
function csrf() { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' }); }
function error(status: number, code: string) {
  return json({ error: { code, message: '시험 오류', requestId, fields: [] } }, status);
}
function client(fetchImpl: ApiFetch) {
  const result = createApiClient(config, { fetchImpl });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return result.value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-166 요청 준비→client→응답 파서', () => {
  it('JSON POST의 CSRF·본문을 유지하고201 상대 Location을 자동 탐색하지 않는다', async () => {
    const childRequest = { name: '가상', nickname: '도담', birthDate: '2020-01-01', gender: 'FEMALE', interests: [], characterId: 'dodam' };
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json({ data: {
      childId: '33333333-3333-4333-8333-333333333333', ...childRequest, createdAt: '2026-11-04T10:00:00+09:00',
    } }, 201, { Location: '/api/v1/children/33333333-3333-4333-8333-333333333333' }));
    const prepared = prepareRequestBody({ kind: 'json', value: childRequest });
    if (!prepared.ok) throw new Error('Expected valid request body');
    const received = await client(send).request({ method: 'POST', path: '/children', ...prepared.value });
    if (received.kind !== 'response') throw new Error('Expected response');
    const result = await parseApiResponse(received.response, { kind: 'json', statuses: [201] });
    expect(result).toMatchObject({ kind: 'json', data: { nickname: '도담' }, meta: {
      status: 201, headers: { requestId, location: '/api/v1/children/33333333-3333-4333-8333-333333333333' },
    } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toMatchObject({ body: '{"name":"가상","nickname":"도담","birthDate":"2020-01-01","gender":"FEMALE","interests":[],"characterId":"dodam"}', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
  });

  it.each([200, 202] as const)('0바이트 end 요청도%i JSON 응답과 Retry-After를 읽는다', async (status) => {
    const conversationId = '33333333-3333-4333-8333-333333333333';
    const data = status === 202 ? { conversationId, status: 'CLOSING' } : {
      conversationId, status: 'ENDED', endedAt: '2026-11-04T10:05:00+09:00', summaryStatus: 'EMPTY',
    };
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json({ data }, status, status === 202 ? { 'Retry-After': '1' } : {}));
    const prepared = prepareRequestBody({ kind: 'none' });
    if (!prepared.ok) throw new Error('Expected valid empty body');
    const received = await client(send).request({ method: 'POST', path: `/children/11111111-1111-4111-8111-111111111111/conversations/${conversationId}/end`, ...prepared.value });
    if (received.kind !== 'response') throw new Error('Expected response');
    expect(await parseApiResponse(received.response, { kind: 'json', statuses: [200, 202] })).toMatchObject({ kind: 'json', data, meta: {
      status, headers: { retryAfter: status === 202 ? '1' : null },
    } });
    expect(send.mock.calls[1][1]).not.toHaveProperty('body');
    expect(new Headers(send.mock.calls[1][1].headers).has('Content-Type')).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('0바이트 lock 요청의204는 읽기나 JSON 변환 없이 완료된다', async () => {
    const response = new Response(null, { status: 204 });
    const text = jest.spyOn(response, 'text');
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : response);
    const prepared = prepareRequestBody({ kind: 'none' });
    if (!prepared.ok) throw new Error('Expected valid empty body');
    const received = await client(send).request({ method: 'POST', path: '/guardian/lock', ...prepared.value });
    if (received.kind !== 'response') throw new Error('Expected response');
    expect(await parseApiResponse(received.response, { kind: 'empty', statuses: [204] })).toMatchObject({ kind: 'empty' });
    expect(send.mock.calls[1][1]).not.toHaveProperty('body');
    expect(text).not.toHaveBeenCalled();
  });

  it.each<[number, string]>([[401, 'AUTHENTICATION_REQUIRED'], [403, 'CSRF_INVALID'], [429, 'RATE_LIMITED'], [503, 'AUTH_STATE_UNAVAILABLE']])('%i 오류 해석이 CSRF 갱신이나 POST 재전송을 일으키지 않는다', async (status, code) => {
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : error(status, code));
    const received = await client(send).request({ method: 'POST', path: '/guardian/lock' });
    if (received.kind !== 'response') throw new Error('Expected response');
    const parsed = await parseApiResponse(received.response, { kind: 'empty', statuses: [204] });
    expect(classifyRecovery(parsed, 'general').result).toMatchObject({ kind: 'http_error', error: { code } });
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'lock']);
  });

  it('응답 수신 후 취소·읽기 실패를 미전송으로 바꾸거나 재호출하지 않는다', async () => {
    const body = deferred<string>();
    const response = json({ data: account });
    jest.spyOn(response, 'text').mockImplementation(() => body.promise);
    const controller = new AbortController();
    const send = jest.fn<ApiFetch>(async (_url, init) => {
      init.signal?.addEventListener('abort', () => body.reject(new Error('synthetic-private')), { once: true });
      return response;
    });
    const received = await client(send).request({ method: 'GET', path: '/auth/me', signal: controller.signal });
    if (received.kind !== 'response') throw new Error('Expected response');
    const pending = parseApiResponse(received.response, { kind: 'json', statuses: [200] });
    controller.abort();
    expect(await pending).toEqual({ kind: 'body_read_error', reason: 'read_failed', meta: {
      status: 200, headers: { requestId, contentType: 'application/json', location: null, retryAfter: null },
    } });
    expect(received.kind).toBe('response');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('SCRUM-166 파서와 인증 전환 경계', () => {
  it.each([200, 503])('classifier가 clone을 읽어도 원본과 CSRF refresh%i 결과를 분리한다', async (refreshStatus) => {
    let issued = 0;
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf')
      ? (++issued === 2 && refreshStatus === 503 ? error(503, 'AUTH_STATE_UNAVAILABLE') : csrf())
      : json({ data: account }));
    const prepared = prepareRequestBody({ kind: 'json', value: { email: 'guardian@example.com', password: 'synthetic-password' } });
    if (!prepared.ok) throw new Error('Expected valid request body');
    const result = await client(send).authTransition({ method: 'POST', path: '/auth/login', ...prepared.value }, async (response) => {
      const parsed = await parseApiResponse(response, { kind: 'json', statuses: [200] });
      return parsed.kind === 'json' ? 'changed' : 'unknown';
    });
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toEqual(refreshStatus === 503 ? { ok: false, reason: 'http', status: 503, requestId, meta: { status: 503, headers: { requestId, location: null, retryAfter: null, contentType: 'application/json' } } } : { ok: true });
    if (result.operation.kind !== 'response') throw new Error('Expected original response');
    expect(result.operation.response.bodyUsed).toBe(false);
    expect(await parseApiResponse(result.operation.response, { kind: 'json', statuses: [200] })).toMatchObject({ kind: 'json', data: account });
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'csrf']);
  });

  it('불완전한 인증 응답을 parser가 성공이나 확정 실패로 바꾸지 않는다', async () => {
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf()
      : new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await client(send).authTransition({ method: 'POST', path: '/auth/login' }, async (response) => {
      const parsed = await parseApiResponse(response, { kind: 'json', statuses: [200] });
      return parsed.kind === 'json' ? 'changed' : 'unknown';
    });
    expect(result.outcome).toBe('unknown');
    expect(result.refresh).toBeUndefined();
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login']);
    if (result.operation.kind !== 'response') throw new Error('Expected original response');
    expect(await parseApiResponse(result.operation.response, { kind: 'json', statuses: [200] })).toMatchObject({ kind: 'format_error', reason: 'invalid_json' });
  });

  it('인증 전환은 일반 본문 읽기를 기다리지 않으며 늦은 data의 적용 여부는 호출부 책임이다', async () => {
    const body = deferred<string>();
    const response = json({ data: account });
    jest.spyOn(response, 'text').mockImplementation(() => body.promise);
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf()
      : url.endsWith('/auth/logout') ? new Response(null, { status: 204 }) : response);
    const api = client(send);
    const received = await api.request({ method: 'GET', path: '/auth/me' });
    if (received.kind !== 'response') throw new Error('Expected response');
    let bodyDone = false;
    const pending = parseApiResponse(received.response, { kind: 'json', statuses: [200] }).then((value) => { bodyDone = true; return value; });
    const transition = await api.authTransition({ method: 'POST', path: '/auth/logout' }, async (response) => {
      return (await parseApiResponse(response, { kind: 'empty', statuses: [204] })).kind === 'empty' ? 'changed' : 'unknown';
    });
    expect(transition.outcome).toBe('changed');
    expect(transition.refresh).toEqual({ ok: true });
    expect(bodyDone).toBe(false);
    body.resolve(JSON.stringify({ data: account }));
    expect(await pending).toMatchObject({ kind: 'json', data: account });
    // parser는 세대/UI 상태에 접근하지 않는다.125/167이 반영 전 인증 문맥을 확인해야 한다.
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['me', 'csrf', 'logout', 'csrf']);
  });
});

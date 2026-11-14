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
function csrf(token = 'synthetic-csrf') { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token }); }
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

describe('SCRUM-168 확정 DTO의 요청·응답·현재 문맥 연결', () => {
  it('확정 DTO로 로그인·계정 조회·0바이트 로그아웃과 CSRF 갱신을 연결한다', async () => {
    const loginDto = { email: 'guardian@example.com', password: 'synthetic-password' };
    const logoutResponse = new Response(null, { status: 204, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } });
    const logoutRead = jest.spyOn(logoutResponse, 'text');
    const send = jest.fn<ApiFetch>()
      .mockResolvedValueOnce(csrf('synthetic-initial-csrf'))
      .mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValueOnce(csrf('synthetic-authenticated-csrf'))
      .mockResolvedValueOnce(json({ data: account }))
      .mockResolvedValueOnce(logoutResponse)
      .mockResolvedValueOnce(csrf('synthetic-anonymous-csrf'));
    const api = client(send);
    const state: { account: unknown } = { account: null };
    const loginBody = prepareRequestBody({ kind: 'json', value: loginDto });
    if (!loginBody.ok) throw new Error('Expected valid login body');
    const login = await api.authTransition({ method: 'POST', path: '/auth/login', ...loginBody.value }, async (response) => {
      const parsed = await parseApiResponse(response, { kind: 'json', statuses: [200] });
      const decision = classifyRecovery(parsed, 'login');
      return decision.kind === 'none' && parsed.kind === 'json' ? 'changed' : 'unknown';
    });
    expect(login.outcome).toBe('changed');
    expect(login.refresh).toEqual({ ok: true });
    if (login.operation.kind !== 'response') throw new Error('Expected login response');
    const loginResult = await parseApiResponse(login.operation.response, { kind: 'json', statuses: [200] });
    if (loginResult.kind !== 'json') throw new Error('Expected login JSON');
    expect(loginResult.data).toEqual(account);
    expect(api.commitIfCurrent(login.context, () => { state.account = loginResult.data; })).toBe(true);
    expect(state.account).toEqual(account);

    const me = await api.request({ method: 'GET', path: '/auth/me' });
    if (me.kind !== 'response') throw new Error('Expected account response');
    const meResult = await parseApiResponse(me.response, { kind: 'json', statuses: [200] });
    expect(classifyRecovery(meResult, 'general').kind).toBe('none');
    if (meResult.kind !== 'json') throw new Error('Expected account JSON');
    expect(meResult.data).toEqual(account);
    expect(api.commitIfCurrent(me.context, () => { state.account = meResult.data; })).toBe(true);
    expect(state.account).toEqual(account);

    const logoutBody = prepareRequestBody({ kind: 'none' });
    if (!logoutBody.ok) throw new Error('Expected empty logout body');
    const logout = await api.authTransition({ method: 'POST', path: '/auth/logout', ...logoutBody.value }, async (response) => {
      const parsed = await parseApiResponse(response, { kind: 'empty', statuses: [204] });
      const decision = classifyRecovery(parsed, 'general');
      return decision.kind === 'none' && parsed.kind === 'empty' ? 'changed' : 'unknown';
    });
    expect(logout.outcome).toBe('changed');
    expect(logout.refresh).toEqual({ ok: true });
    if (logout.operation.kind !== 'response') throw new Error('Expected logout response');
    expect(await parseApiResponse(logout.operation.response, { kind: 'empty', statuses: [204] }))
      .toMatchObject({ kind: 'empty', meta: { status: 204 } });
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(api.commitIfCurrent(logout.context, () => { state.account = null; })).toBe(true);
    expect(state.account).toBeNull();
    expect(logoutRead).not.toHaveBeenCalled();
    expect(logoutResponse.bodyUsed).toBe(false);

    expect(send.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname])).toEqual([
      ['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/login'], ['GET', '/api/v1/auth/csrf'],
      ['GET', '/api/v1/auth/me'], ['POST', '/api/v1/auth/logout'], ['GET', '/api/v1/auth/csrf'],
    ]);
    for (const [, init] of send.mock.calls) expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' });
    const loginInit = send.mock.calls[1][1];
    expect(loginInit.body).toBe(JSON.stringify(loginDto));
    expect(new Headers(loginInit.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(loginInit.headers).get('X-XSRF-TOKEN')).toBe('synthetic-initial-csrf');
    const meInit = send.mock.calls[3][1];
    expect(meInit).not.toHaveProperty('body');
    expect(new Headers(meInit.headers).has('X-XSRF-TOKEN')).toBe(false);
    const logoutInit = send.mock.calls[4][1];
    expect(logoutInit).not.toHaveProperty('body');
    expect(new Headers(logoutInit.headers).has('Content-Type')).toBe(false);
    expect(new Headers(logoutInit.headers).get('X-XSRF-TOKEN')).toBe('synthetic-authenticated-csrf');
  });

  it('대화 시작201의 업무 ID와 서버 추적 ID를 구분하고 Location을 자동 요청하지 않는다', async () => {
    const clientRequestId = '44444444-4444-4444-8444-444444444444';
    const path = '/children/22222222-2222-4222-8222-222222222222/conversations';
    const data = {
      conversationId: '33333333-3333-4333-8333-333333333333', status: 'ACTIVE',
      startedAt: '2026-10-02T13:00:00+09:00', serviceDate: '2026-10-02', scheduledEndAt: '2026-10-03T00:00:00+09:00',
    };
    const location = `/api/v1${path}/${data.conversationId}`;
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json({ data }, 201, { Location: location }));
    const api = client(send);
    const prepared = prepareRequestBody({ kind: 'json', value: { clientRequestId } });
    if (!prepared.ok) throw new Error('Expected valid start body');
    const received = await api.request({ method: 'POST', path, ...prepared.value });
    if (received.kind !== 'response') throw new Error('Expected start response');
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200, 201] });
    const decision = classifyRecovery(parsed, 'general');
    expect(decision.kind).toBe('none');
    expect(decision.result).toBe(parsed);
    if (parsed.kind !== 'json') throw new Error('Expected start JSON');
    expect(parsed.data).toEqual(data);
    expect(parsed.meta).toMatchObject({ status: 201, headers: { requestId, location } });
    expect(parsed.meta.headers.requestId).not.toBe(clientRequestId);
    const state: { conversation: unknown } = { conversation: null };
    const apply = jest.fn(() => { state.conversation = parsed.data; return undefined; });
    expect(api.commitIfCurrent(received.context, apply)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(state.conversation).toEqual(data);
    expect(send.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname])).toEqual([
      ['GET', '/api/v1/auth/csrf'], ['POST', `/api/v1${path}`],
    ]);
    expect(send.mock.calls[1][1]).toMatchObject({ body: JSON.stringify({ clientRequestId }), credentials: 'include' });
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
    expect(new Headers(send.mock.calls[1][1].headers).has('X-Request-ID')).toBe(false);
  });

  it('대화 시작429의 추적 ID·대기 정보를 전달하고 인증 만료·자동 재전송하지 않는다', async () => {
    const clientRequestId = '44444444-4444-4444-8444-444444444444';
    const path = '/children/22222222-2222-4222-8222-222222222222/conversations';
    const failure = { code: 'RATE_LIMITED', message: '합성 요청 제한', requestId, fields: [] };
    // 2초는 서버 응답의 합성 관측값이며 운영 제한의 기본값이 아니다.
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json({ error: failure }, 429, { 'Retry-After': '2' }));
    const api = client(send);
    const expire = jest.spyOn(api, 'expireIfCurrent');
    const onExpired = jest.fn(() => undefined);
    const prepared = prepareRequestBody({ kind: 'json', value: { clientRequestId } });
    if (!prepared.ok) throw new Error('Expected valid start body');
    const received = await api.request({ method: 'POST', path, ...prepared.value });
    if (received.kind !== 'response') throw new Error('Expected rate limit response');
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200, 201] });
    const decision = classifyRecovery(parsed, 'general');
    if (decision.kind === 'authentication_required') api.expireIfCurrent(received.context, onExpired);
    expect(decision).toMatchObject({ kind: 'rate_limited', retryAfter: { kind: 'valid', seconds: 2 } });
    expect(decision.result).toBe(parsed);
    if (parsed.kind !== 'http_error') throw new Error('Expected HTTP error');
    expect(parsed.error).toEqual(failure);
    expect(parsed.meta).toMatchObject({ status: 429, headers: { requestId, retryAfter: '2' } });
    expect(parsed.error.requestId).toBe(parsed.meta.headers.requestId);
    expect(parsed.error.requestId).not.toBe(clientRequestId);
    const apply = jest.fn(() => undefined);
    expect(api.commitIfCurrent(received.context, apply)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(api.isCurrentContext(received.context)).toBe(true);
    expect(expire).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    expect(send.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname])).toEqual([
      ['GET', '/api/v1/auth/csrf'], ['POST', `/api/v1${path}`],
    ]);
    expect(send.mock.calls[1][1]).toMatchObject({ body: JSON.stringify({ clientRequestId }), credentials: 'include' });
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
    expect(new Headers(send.mock.calls[1][1].headers).has('X-Request-ID')).toBe(false);
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch, type ApiRequest } from './client';
import * as mockHandlers from './mockAuthMe';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1/' };
const token = 'synthetic-csrf-value';
const requestId = '22222222-2222-4222-8222-222222222222';
const csrfBody = { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token };
function csrfResponse(body: unknown = csrfBody, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Request-ID': requestId,
  } });
}
function client(fetchImpl: ApiFetch, input = config) {
  const result = createApiClient(input, { fetchImpl });
  if (!result.ok) throw new Error('Unexpected test configuration failure');
  return result.value;
}
function server() {
  return jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf')
    ? csrfResponse() : new Response('{"data":{"accepted":true}}', { status: 200 }));
}

describe('SCRUM-165 초기 세션·CSRF 공통 요청', () => {
  it('생성만으로 요청하지 않고 GET은 쿠키 포함·캐시 금지·redirect 거절 설정으로 전송한다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    const result = await api.request({ method: 'GET', path: '/auth/me' });
    expect(result.kind).toBe('response');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.invalid/api/v1/auth/me');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(new Headers(init.headers).has('X-XSRF-TOKEN')).toBe(false);
    expect(init).not.toHaveProperty('body');
  });

  it('CSRF는 envelope 없는 계약으로 발급하고 공개 결과에 token을 노출하지 않는다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.invalid/api/v1/auth/csrf');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/auth/login', '{"email":"guardian@example.com","password":"synthetic-password"}', 'application/json'],
    ['/auth/logout', undefined, undefined],
    ['/guardian/lock', undefined, undefined],
    ['/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/resume', undefined, undefined],
    ['/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/end', undefined, undefined],
  ])('POST %s는 최초 발급 후 내부 CSRF를 적용하고 본문을 임의 생성하지 않는다', async (path, body, contentType) => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    const inputHeaders = new Headers(contentType ? { 'Content-Type': contentType } : undefined);
    const result = await api.request({ method: 'POST', path, body, headers: inputHeaders });
    expect(result.kind).toBe('response');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.invalid/api/v1/auth/csrf');
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe(`https://api.example.invalid/api/v1${path}`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe(token);
    expect(inputHeaders.has('X-XSRF-TOKEN')).toBe(false);
    if (body === undefined) {
      expect(init).not.toHaveProperty('body');
      expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    } else expect(init.body).toBe(body);
    await api.request({ method: 'POST', path, body, headers: inputHeaders });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.filter(([address]) => address.endsWith('/auth/csrf'))).toHaveLength(1);
  });

  it('multipart는 같은 FormData를 전달하고 Content-Type boundary를 직접 설정하지 않는다', async () => {
    const fetchImpl = server();
    const body = new FormData();
    body.append('clientRequestId', '11111111-1111-4111-8111-111111111111');
    await client(fetchImpl).request({ method: 'POST', path: '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/turns', body });
    const init = fetchImpl.mock.calls[1][1];
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe(token);
  });

  it('동시 최초 POST는 하나의 CSRF 발급을 공유하고 발급 전에는 전송하지 않는다', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? pending : new Response(null, { status: 204 }));
    const api = client(fetchImpl);
    const first = api.request({ method: 'POST', path: '/auth/logout' });
    const second = api.request({ method: 'POST', path: '/guardian/lock' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release(csrfResponse());
    expect((await first).kind).toBe('response');
    expect((await second).kind).toBe('response');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([
    { data: csrfBody },
    { ...csrfBody, headerName: 'Authorization' },
    { ...csrfBody, parameterName: 'token' },
    { ...csrfBody, token: '' },
    { ...csrfBody, token: null },
    { ...csrfBody, token: '  ' },
    { ...csrfBody, token: 'value\r\nInjected: true' },
  ])('잘못된 CSRF 계약은 POST를 보내지 않는다: %#', async (body) => {
    const fetchImpl = jest.fn<ApiFetch>(async () => csrfResponse(body));
    const result = await client(fetchImpl).request({ method: 'POST', path: '/auth/login', body: '{}' });
    expect(result).toEqual({ kind: 'not_sent', reason: 'csrf_unavailable', csrf: { ok: false, reason: 'invalid_response' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => new Response('not json', { headers: { 'Content-Type': 'application/json' } }),
    () => csrfResponse(csrfBody, 200, 'text/html'),
    () => { const response = csrfResponse(); Object.defineProperty(response, 'redirected', { value: true }); return response; },
    () => { const response = csrfResponse(); Object.defineProperty(response, 'url', { value: 'https://other.example.invalid/csrf' }); return response; },
  ])('JSON 파싱·형식·redirect가 CSRF 계약과 다르면 실패한다: %#', async (respond) => {
    const fetchImpl = jest.fn<ApiFetch>(async () => respond());
    expect(await client(fetchImpl).prepareCsrf()).toEqual({ ok: false, reason: 'invalid_response' });
  });

  it('CSRF 대기 중 호출자가 요청 객체를 바꿔도 처음 요청한 method와 본문을 전송한다', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? pending : new Response(null, { status: 204 }));
    const request: ApiRequest = { method: 'POST', path: '/auth/logout' };
    const result = client(fetchImpl).request(request);
    request.method = 'GET';
    request.path = '/changed';
    request.body = 'caller-changed-body';
    release(csrfResponse());
    expect((await result).kind).toBe('response');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.example.invalid/api/v1/auth/logout');
    expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[1][1]).not.toHaveProperty('body');
  });

  it('CSRF HTTP 실패는 원문 대신 status·서버 requestId를 전달하며 POST를 보내지 않는다', async () => {
    const fetchImpl = jest.fn<ApiFetch>(async () => csrfResponse({ error: { message: token } }, 503));
    const result = await client(fetchImpl).request({ method: 'POST', path: '/auth/login' });
    expect(result).toEqual({ kind: 'not_sent', reason: 'csrf_unavailable', csrf: {
      ok: false, reason: 'http', status: 503, requestId,
    } });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('통신 실패는 민감한 예외 원문을 숨기고 다음 명시적 준비에서 다시 발급할 수 있다', async () => {
    const fetchImpl = jest.fn<ApiFetch>().mockRejectedValueOnce(new Error(token)).mockResolvedValueOnce(csrfResponse());
    const api = client(fetchImpl);
    expect(await api.prepareCsrf()).toEqual({ ok: false, reason: 'network' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    'https://other.example.invalid/steal', '//other.example.invalid/steal', '/../admin', '/%2e%2e/admin',
    '/auth/../me', '/auth/%2fme', '/auth/%252fme', '/auth\\me', '/auth/me#fragment', '/auth/\nme',
  ])('부적절한 목적지는 CSRF 발급 전 거절한다: %s', async (path) => {
    const fetchImpl = server();
    expect(await client(fetchImpl).request({ method: 'POST', path })).toEqual({ kind: 'not_sent', reason: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['Cookie', 'Authorization', 'X-XSRF-TOKEN', 'x-xsrf-token'])('호출자의 %s 헤더를 거절해 내부 보안 설정을 덮어쓰지 못하게 한다', async (name) => {
    const fetchImpl = server();
    const headers = { [name]: 'caller-value' };
    expect(await client(fetchImpl).request({ method: 'POST', path: '/auth/logout', headers })).toEqual({ kind: 'not_sent', reason: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('공개 request로 CSRF endpoint에 직접 접근해 token을 꺼내거나 준비 상태를 바꾸지 못한다', async () => {
    const fetchImpl = server();
    expect(await client(fetchImpl).request({ method: 'GET', path: '/auth/csrf' })).toEqual({ kind: 'not_sent', reason: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('허용된 GET query는 API 기준 경로 안에서 유지하고 추가 credentials 설정은 무시한다', async () => {
    const fetchImpl = server();
    await client(fetchImpl).request({ method: 'GET', path: '/auth/me?fresh=1', credentials: 'omit' } as ApiRequest);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.invalid/api/v1/auth/me?fresh=1');
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('include');
  });

  it.each<[number, string]>([
    [400, 'VALIDATION_FAILED'], [401, 'LOGIN_FAILED'], [403, 'CSRF_INVALID'],
    [429, 'RATE_LIMITED'], [503, 'AUTH_STATE_UNAVAILABLE'],
  ])('POST의 HTTP %s 응답은 그대로 전달하고 자동 재전송하지 않는다', async (status, code) => {
    const response = new Response(JSON.stringify({ error: { code, message: 'Synthetic failure', requestId, fields: [] } }), {
      status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId,
        ...(status === 429 ? { 'Retry-After': '1' } : {}) },
    });
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrfResponse() : response);
    const result = await client(fetchImpl).request({ method: 'POST', path: '/auth/login', body: '{}' });
    expect(result).toEqual({ kind: 'response', response });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('POST 통신 실패는 원문을 노출하거나 mock으로 대체하거나 자동 재전송하지 않는다', async () => {
    const fetchImpl = jest.fn<ApiFetch>().mockResolvedValueOnce(csrfResponse()).mockRejectedValueOnce(new Error(token));
    const result = await client(fetchImpl).request({ method: 'POST', path: '/auth/login' });
    expect(result).toEqual({ kind: 'transport_error' });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('mock 모드는 CSRF와 계정 예제를 재현하고 미등록 POST도 실제 네트워크로 넘기지 않는다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl, { ...config, apiMode: 'mock' });
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    const result = await api.request({ method: 'GET', path: '/auth/me' });
    expect(result.kind).toBe('response');
    if (result.kind === 'response') expect((await result.response.json()).data.email).toBe('guardian@example.com');
    expect(await api.request({ method: 'POST', path: '/unregistered' })).toEqual({ kind: 'transport_error' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('token과 통신 예외 원문을 URL·공개 결과·콘솔로 복사하지 않는다', async () => {
    const outputs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'info'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
    outputs.forEach((output) => output.mockImplementation(() => {}));
    try {
      const fetchImpl = jest.fn<ApiFetch>().mockResolvedValueOnce(csrfResponse()).mockRejectedValueOnce(new Error(token));
      const api = client(fetchImpl);
      const prepared = await api.prepareCsrf();
      const result = await api.request({ method: 'POST', path: '/auth/login', body: '{}' });
      expect(prepared).toEqual({ ok: true });
      expect(result).toEqual({ kind: 'transport_error' });
      expect(JSON.stringify({ prepared, result })).not.toContain(token);
      for (const [url] of fetchImpl.mock.calls) expect(url).not.toContain(token);
      for (const output of outputs) expect(output).not.toHaveBeenCalled();
    } finally { outputs.forEach((output) => output.mockRestore()); }
  });

  it.each(['  ', 'value\r\nInjected: true', '\u0000value', 'value\u007f'])('네이티브 Headers가 허용해도 부적절한 CSRF 값은 거절한다: %#', async (value) => {
    const original = globalThis.Headers;
    const native = jest.requireActual<{ Headers: typeof Headers }>('whatwg-fetch');
    globalThis.Headers = native.Headers;
    try {
      const fetchImpl = jest.fn<ApiFetch>(async () => csrfResponse({ ...csrfBody, token: value }));
      expect(await client(fetchImpl).prepareCsrf()).toEqual({ ok: false, reason: 'invalid_response' });
    } finally { globalThis.Headers = original; }
  });

  it('네이티브 Headers가 보관한 개행 포함 caller 헤더도 요청 전에 거절한다', async () => {
    const original = globalThis.Headers;
    const native = jest.requireActual<{ Headers: typeof Headers }>('whatwg-fetch');
    globalThis.Headers = native.Headers;
    try {
      const fetchImpl = server();
      expect(await client(fetchImpl).request({ method: 'POST', path: '/auth/login', headers: { 'X-Note': 'value\r\nInjected: true' } }))
        .toEqual({ kind: 'not_sent', reason: 'invalid_request' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { globalThis.Headers = original; }
  });

  it('서버 추적 헤더가 UUID 형식이 아니면 진단에 그대로 복사하지 않는다', async () => {
    const response = csrfResponse({}, 503);
    response.headers.set('X-Request-ID', token);
    const fetchImpl = jest.fn<ApiFetch>(async () => response);
    expect(await client(fetchImpl).prepareCsrf()).toEqual({ ok: false, reason: 'http', status: 503 });
  });

  it('real 모드는 mock handler를 등록하지 않는다', async () => {
    const register = jest.spyOn(mockHandlers, 'registerExampleHandlers');
    try {
      await client(server()).prepareCsrf();
      expect(register).not.toHaveBeenCalled();
    } finally { register.mockRestore(); }
  });

  it('설정 오류 시 client를 만들거나 요청하지 않는다', () => {
    const fetchImpl = server();
    expect(createApiClient({ ...config, apiMode: 'typo' }, { fetchImpl }).ok).toBe(false);
    expect(createApiClient({ ...config, appEnv: 'production', apiMode: 'mock' }, { fetchImpl }).ok).toBe(false);
    expect(createApiClient({ ...config, apiBaseUrl: undefined }, { fetchImpl }).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

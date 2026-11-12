import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch, type ApiResult } from './client';
import { classifyRecovery, readCsrfFailure } from './recovery';
import { prepareRequestBody } from './requestBody';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const requestId = '22222222-2222-4222-8222-222222222222';
const secrets = { password: 'synthetic-password', pin: '0012', token: 'synthetic-csrf', session: 'synthetic-session' };
const outputs = ['log', 'info', 'warn', 'error', 'debug'] as const;
const storageNames = ['localStorage', 'sessionStorage'] as const;
const writes = jest.fn();
let storageDescriptors: (PropertyDescriptor | undefined)[];

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function csrf() { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: secrets.token }); }
function error(code: string) {
  return { code, message: secrets.password, requestId, fields: [{ field: 'pin', reason: secrets.pin }] };
}
function client(send: ApiFetch) {
  const result = createApiClient(config, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return result.value;
}
function response(result: ApiResult) {
  if (result.kind !== 'response') throw new Error('Expected response');
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function checkRequests(send: ReturnType<typeof jest.fn<ApiFetch>>, paths: string[]) {
  expect(send.mock.calls.map(([url]) => url)).toEqual(paths.map((path) => `${config.apiBaseUrl}${path}`));
  for (const [, init] of send.mock.calls) {
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', redirect: 'error' });
    const headers = new Headers(init.headers);
    expect(headers.has('Cookie')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
  }
}

beforeEach(() => {
  outputs.forEach((name) => jest.spyOn(console, name).mockImplementation(() => {}));
  writes.mockClear();
  storageDescriptors = storageNames.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  storageNames.forEach((name) => Object.defineProperty(globalThis, name, {
    configurable: true, value: { setItem: writes },
  }));
});
afterEach(() => {
  try {
    outputs.forEach((name) => expect(console[name]).not.toHaveBeenCalled());
    expect(writes).not.toHaveBeenCalled();
  } finally {
    jest.restoreAllMocks();
    storageNames.forEach((name, index) => {
      const original = storageDescriptors[index];
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});

// 웹 저장 API 관측은 아래 JS 경로만 검증한다. RN 전체 저장소·OS 쿠키 저장의 증거가 아니다.
describe('SCRUM-167 연결 경로의 민감정보 비복사', () => {
  it('성공 응답까지 처리해도 자격 증명은 요청 본문·CSRF 헤더에만 전송한다', async () => {
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json(
      { data: { accepted: true } }, 200, { 'Set-Cookie': `SESSION=${secrets.session}; HttpOnly` },
    ));
    const api = client(send);
    // 공통 운반 경계 시험이며 endpoint DTO의 허용 필드 검사가 아니다.
    const value = { password: secrets.password, pin: secrets.pin };
    const prepared = prepareRequestBody({ kind: 'json', value });
    if (!prepared.ok) throw new Error('Expected prepared body');
    const received = response(await api.request({ method: 'POST', path: '/auth/login', ...prepared.value }));
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200] });
    const decision = classifyRecovery(parsed, 'login');
    expect(decision).toMatchObject({ kind: 'none', result: { kind: 'json', data: { accepted: true } } });
    const apply = jest.fn<() => undefined>();
    expect(api.commitIfCurrent(received.context, apply)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1][1].body).toBe(JSON.stringify(value));
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe(secrets.token);
    checkRequests(send, ['/auth/csrf', '/auth/login']);
  });

  it('오류 원문·fields·requestId를 메모리에 보존하면서 로그·저장소·추가 URL로 복사하지 않는다', async () => {
    const expected = error('VALIDATION_FAILED');
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : json(
      { error: expected }, 400, { 'Set-Cookie': `SESSION=${secrets.session}`, 'Retry-After': secrets.token },
    ));
    const api = client(send);
    const received = response(await api.request({ method: 'POST', path: '/guardian/lock' }));
    const parsed = await parseApiResponse(received.response, { kind: 'empty', statuses: [204] });
    const decision = classifyRecovery(parsed, 'general');
    expect(decision.kind).toBe('validation_failed');
    expect(decision.result).toBe(parsed);
    expect(parsed).toMatchObject({ kind: 'http_error', error: expected, meta: { headers: { retryAfter: secrets.token } } });
    checkRequests(send, ['/auth/csrf', '/guardian/lock']);
  });

  it('CSRF 발급 대기 중 취소한 POST 본문을 전송·기록하지 않고 공유 발급은 마무리한다', async () => {
    const pending = deferred<Response>();
    const send = jest.fn<ApiFetch>(() => pending.promise);
    const api = client(send);
    const abort = new AbortController();
    const request = api.request({ method: 'POST', path: '/auth/login', body: secrets.password, signal: abort.signal });
    expect(send).toHaveBeenCalledTimes(1);
    abort.abort();
    expect(await request).toEqual({ kind: 'not_sent', reason: 'cancelled' });
    pending.resolve(csrf());
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    checkRequests(send, ['/auth/csrf']);
  });

  it('복구 실패 본문을 한 번 해석하고 원문을 보존하지만 원래 POST나 민감값을 재전송하지 않는다', async () => {
    const expected = error('AUTH_STATE_UNAVAILABLE');
    const failureResponse = json({ error: expected }, 503, {
      'Set-Cookie': `SESSION=${secrets.session}`, 'Retry-After': secrets.token,
    });
    const read = jest.spyOn(failureResponse, 'text');
    let issued = 0;
    const send = jest.fn<ApiFetch>(async (url) => {
      if (url.endsWith('/auth/csrf')) return ++issued === 1 ? csrf() : failureResponse;
      return json({ error: error('CSRF_INVALID') }, 403);
    });
    const api = client(send);
    const received = response(await api.request({ method: 'POST', path: '/guardian/lock' }));
    const parsed = await parseApiResponse(received.response, { kind: 'empty', statuses: [204] });
    expect(classifyRecovery(parsed, 'general').kind).toBe('csrf_invalid');
    const result = await api.recoverCsrf(received.context);
    if (result.kind !== 'failed') throw new Error('Expected recovery failure');
    const [first, second] = await Promise.all([readCsrfFailure(result.failure), readCsrfFailure(result.failure)]);
    expect(first).toBe(second);
    if (!first) throw new Error('Expected parsed recovery failure');
    expect(classifyRecovery(first, 'general')).toMatchObject({ kind: 'auth_state_unavailable', result: { error: expected } });
    expect(read).toHaveBeenCalledTimes(1);
    expect(await api.recoverCsrf(received.context)).toEqual(result);
    checkRequests(send, ['/auth/csrf', '/guardian/lock', '/auth/csrf']);
  });

  it.each(['transport', 'body'] as const)('%s 예외의 합성 민감값을 반환·로그에 노출하지 않는다', async (failure) => {
    const responseBody = json({ data: {} });
    const secretException = new Error(Object.values(secrets).join(' '));
    if (failure === 'body') jest.spyOn(responseBody, 'text').mockRejectedValue(secretException);
    const send = jest.fn<ApiFetch>(async () => {
      if (failure === 'transport') throw secretException;
      return responseBody;
    });
    const api = client(send);
    const received = await api.request({ method: 'GET', path: '/auth/me' });
    if (failure === 'transport') {
      expect(received).toEqual({ kind: 'transport_error', context: {} });
    } else {
      const parsed = await parseApiResponse(response(received).response, { kind: 'json', statuses: [200] });
      expect(parsed).toEqual({ kind: 'body_read_error', reason: 'read_failed', meta: {
        status: 200, headers: { requestId: null, location: null, retryAfter: null, contentType: 'application/json' },
      } });
      expect(classifyRecovery(parsed, 'general').kind).toBe('unclassified');
    }
    checkRequests(send, ['/auth/me']);
  });
});

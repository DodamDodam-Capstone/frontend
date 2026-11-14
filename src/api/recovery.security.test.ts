import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch, type ApiResult } from './client';
import { classifyRecovery, readCsrfFailure } from './recovery';
import { prepareRequestBody } from './requestBody';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const requestId = '22222222-2222-4222-8222-222222222222';
const challengeId = '88888888-8888-4888-8888-888888888888';
const secrets = {
  password: 'synthetic-password', pin: '0012', token: 'synthetic-csrf', session: 'synthetic-session',
  code: '000123', verificationToken: `${challengeId}.${'A'.repeat(43)}`,
};
const outputs = ['log', 'info', 'warn', 'error', 'debug'] as const;
const storageNames = ['localStorage', 'sessionStorage'] as const;
const writes = jest.fn();
let storageDescriptors: (PropertyDescriptor | undefined)[];

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...headers,
  } });
}
function csrf() { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: secrets.token }); }
// 서버가 민감값을 잘못 돌려준 상황의 방어 fixture다. 정상 오류 계약의 예시가 아니다.
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
    const account = {
      accountId: '11111111-1111-4111-8111-111111111111', email: 'guardian@example.com',
      childId: null, hasPin: false, guardianUnlockedUntil: null,
    };
    const loginResponse = json({ data: account }, 200, { 'Set-Cookie': `JSESSIONID=${secrets.session}; HttpOnly` });
    const read = jest.spyOn(loginResponse, 'text');
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : loginResponse);
    const api = client(send);
    // 확정 DTO를 사용하는 공통 운반 시험이다. 전체 인증 전환·갱신은 계약 연결 C1에서 검증한다.
    const value = { email: 'guardian@example.com', password: secrets.password };
    const prepared = prepareRequestBody({ kind: 'json', value });
    if (!prepared.ok) throw new Error('Expected prepared body');
    const received = response(await api.request({ method: 'POST', path: '/auth/login', ...prepared.value }));
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200] });
    const decision = classifyRecovery(parsed, 'login');
    expect(decision).toMatchObject({ kind: 'none', result: { kind: 'json', data: account } });
    expect(parsed.meta.headers).toEqual({ requestId, location: null, retryAfter: null, contentType: 'application/json' });
    expect(JSON.stringify(decision)).not.toContain(secrets.session);
    expect(read).toHaveBeenCalledTimes(1);
    const apply = jest.fn<() => undefined>();
    expect(api.commitIfCurrent(received.context, apply)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1][1].body).toBe(JSON.stringify(value));
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe(secrets.token);
    checkRequests(send, ['/auth/csrf', '/auth/login']);
  });

  it('PIN 해제 오류를 전달하면서 PIN을 URL·로그·저장소로 복사하지 않는다', async () => {
    const expected = { code: 'PIN_INVALID', message: '보호자 PIN이 일치하지 않습니다.', requestId, fields: [] };
    const pinResponse = json({ error: expected }, 400);
    const read = jest.spyOn(pinResponse, 'text');
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf() : pinResponse);
    const api = client(send);
    const prepared = prepareRequestBody({ kind: 'json', value: { pin: secrets.pin } });
    if (!prepared.ok) throw new Error('Expected PIN body');
    const received = response(await api.request({ method: 'POST', path: '/guardian/unlock', ...prepared.value }));
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200] });
    const decision = classifyRecovery(parsed, 'general');
    expect(decision).toMatchObject({ kind: 'pin_invalid', result: {
      kind: 'http_error', error: expected, meta: { status: 400, headers: { requestId } },
    } });
    expect(read).toHaveBeenCalledTimes(1);
    const apply = jest.fn<(result: typeof decision) => undefined>();
    expect(api.commitIfCurrent(received.context, () => apply(decision))).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(decision);
    expect(api.isCurrentContext(received.context)).toBe(true);
    expect(send.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"pin":"0012"}' });
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe(secrets.token);
    checkRequests(send, ['/auth/csrf', '/guardian/unlock']);
  });

  it('인증번호 검증과 가입에서 번호·검증 토큰을 허용 본문 외부로 복사하지 않는다', async () => {
    const grant = { verificationToken: secrets.verificationToken, tokenExpiresAt: '2026-09-30T10:15:00+09:00' };
    const accountId = '11111111-1111-4111-8111-111111111111';
    // 생성 리소스 식별 URI를 관측할 뿐 이 주소의 GET 지원이나 자동 이동을 가정하지 않는다.
    const location = `/api/v1/accounts/${accountId}`;
    const verifyResponse = json({ data: grant });
    const signupResponse = json({ data: { accountId } }, 201, { Location: location });
    const verifyRead = jest.spyOn(verifyResponse, 'text');
    const signupRead = jest.spyOn(signupResponse, 'text');
    const send = jest.fn<ApiFetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(verifyResponse)
      .mockResolvedValueOnce(signupResponse);
    const api = client(send);
    const verificationBody = prepareRequestBody({ kind: 'json', value: { challengeId, code: secrets.code } });
    if (!verificationBody.ok) throw new Error('Expected verification body');
    const verification = response(await api.request({ method: 'POST', path: '/auth/email-verifications/verify', ...verificationBody.value }));
    const verified = await parseApiResponse(verification.response, { kind: 'json', statuses: [200] });
    expect(classifyRecovery(verified, 'general').kind).toBe('none');
    if (verified.kind !== 'json') throw new Error('Expected verification JSON');
    const parsedGrant = verified.data as typeof grant;
    expect(parsedGrant).toEqual(grant);
    const receiveGrant = jest.fn<(value: typeof grant) => undefined>();
    expect(api.commitIfCurrent(verification.context, () => receiveGrant(parsedGrant))).toBe(true);
    expect(receiveGrant).toHaveBeenCalledTimes(1);
    expect(receiveGrant).toHaveBeenCalledWith(grant);

    const signupBody = prepareRequestBody({ kind: 'json', value: {
      verificationToken: parsedGrant.verificationToken, password: secrets.password,
    } });
    if (!signupBody.ok) throw new Error('Expected signup body');
    const signup = response(await api.request({ method: 'POST', path: '/auth/signup', ...signupBody.value }));
    const signedUp = await parseApiResponse(signup.response, { kind: 'json', statuses: [201] });
    const decision = classifyRecovery(signedUp, 'general');
    expect(decision).toMatchObject({ kind: 'none', result: {
      kind: 'json', data: { accountId }, meta: { status: 201, headers: { requestId, location } },
    } });
    const apply = jest.fn<(result: typeof decision) => undefined>();
    expect(api.commitIfCurrent(signup.context, () => apply(decision))).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(decision);
    expect(verifyRead).toHaveBeenCalledTimes(1);
    expect(signupRead).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ challengeId, code: '000123' }) });
    expect(send.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ verificationToken: grant.verificationToken, password: secrets.password }) });
    for (const [, init] of send.mock.calls.slice(1)) {
      expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe(secrets.token);
    }
    checkRequests(send, ['/auth/csrf', '/auth/email-verifications/verify', '/auth/signup']);
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
        status: 200, headers: { requestId, location: null, retryAfter: null, contentType: 'application/json' },
      } });
      expect(classifyRecovery(parsed, 'general').kind).toBe('unclassified');
    }
    checkRequests(send, ['/auth/me']);
  });
});

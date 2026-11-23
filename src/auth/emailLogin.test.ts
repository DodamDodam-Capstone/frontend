import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { createApiClient, type ApiFetch } from '../api/client';
import { submitEmailLogin } from './emailLogin';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const requestId = '22222222-2222-4222-8222-222222222222';
const account = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'guardian@example.com',
  childId: null,
  hasPin: false,
  guardianUnlockedUntil: null,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, ...headers,
  } });
}

function error(status: number, code: string, retryAfter?: string, fields: unknown[] = []) {
  return json({ error: { code, message: 'synthetic-private-message', requestId, fields } }, status,
    retryAfter === undefined ? {} : { 'Retry-After': retryAfter });
}

function csrf(token: string) {
  return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token });
}

function client(...responses: (() => Response | Promise<Response>)[]) {
  const send = jest.fn<ApiFetch>();
  for (const respond of responses) {
    send.mockImplementationOnce(async () => respond());
  }
  const result = createApiClient(config, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return {
    api: result.value,
    send,
    requests: () => send.mock.calls.map(([url, init]) => `${init.method} ${new URL(url).pathname}`),
  };
}

const csrfGet = 'GET /api/v1/auth/csrf';
const loginPost = 'POST /api/v1/auth/login';

afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-172 이메일 로그인 API 연결', () => {
  it.each(['x', '   ', ' 가🔒 ', 'x'.repeat(129)])('기존 계정 비밀번호 원문으로 한 번 제출한다', async (password) => {
    const { api, send, requests } = client(() => csrf('before'), () => json({ data: account }), () => csrf('after'));
    const email = '  Guardian+Existing@Example.com  ';
    const result = await submitEmailLogin(api, email, password);
    expect(result).toEqual({ kind: 'accepted', csrfFailed: false });
    expect(requests()).toEqual([csrfGet, loginPost, csrfGet]);
    const [, login] = send.mock.calls[1];
    expect(login.body).toBe(JSON.stringify({ email, password }));
    expect(new Headers(login.headers).get('X-XSRF-TOKEN')).toBe('before');
    expect(login.credentials).toBe('include');
  });

  it('빈 입력에는 요청을 보내지 않는다', async () => {
    const { api, requests } = client();
    const result = await submitEmailLogin(api, ' ', '');
    expect(result).toMatchObject({ kind: 'rejected', feedback: { fields: { email: expect.any(String), password: expect.any(String) } } });
    expect(requests()).toEqual([]);
  });

  it.each<[number, string]>([
    [400, 'VALIDATION_FAILED'], [401, 'LOGIN_FAILED'], [413, 'REQUEST_TOO_LARGE'], [415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('확정된 %i %s는 로그인 실패로 처리하고 CSRF를 보존한다', async (status, code) => {
    const { api, requests } = client(() => csrf('before'), () => error(status, code));
    const result = await submitEmailLogin(api, account.email, 'x');
    expect(result).toMatchObject({ kind: 'rejected', feedback: { message: expect.any(String) } });
    expect(JSON.stringify(result)).not.toContain('synthetic-private-message');
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(requests()).toEqual([csrfGet, loginPost]);
  });

  it('입력 오류에서 허용된 필드의 고정 문구만 전달한다', async () => {
    const { api } = client(() => csrf('before'), () => error(400, 'VALIDATION_FAILED', undefined, [
      { field: 'email', reason: 'synthetic-private-email' },
      { field: 'password', reason: 'synthetic-private-password' },
      { field: 'unexpected', reason: 'synthetic-private-unexpected' },
    ]));
    const result = await submitEmailLogin(api, account.email, 'x');
    if (result.kind !== 'rejected') throw new Error('Expected a rejected login');
    expect(Object.keys(result.feedback.fields ?? {})).toEqual(['email', 'password']);
    expect(JSON.stringify(result)).not.toContain('synthetic-private');
  });

  it.each([
    () => json({ data: {} }),
    () => json({ data: { ...account, childId: 'bad-id' } }),
    () => json({ data: { ...account, guardianUnlockedUntil: '2026-02-30T15:00:00+09:00' } }),
    () => error(401, 'AUTHENTICATION_REQUIRED'),
    () => error(503, 'AUTH_STATE_UNAVAILABLE'),
    () => { throw new Error('synthetic-private-transport'); },
  ])('불완전한 성공·계약 불일치·저장/전송 실패는 세션 결과 불명이다', async (response) => {
    const { api, requests } = client(() => csrf('before'), response);
    const result = await submitEmailLogin(api, account.email, 'x');
    expect(result).toMatchObject({ kind: 'uncertain', feedback: { message: expect.any(String) } });
    expect(JSON.stringify(result)).not.toContain('synthetic-private');
    expect(requests()).toEqual([csrfGet, loginPost]);
  });

  it('403 CSRF_INVALID는 최초 로그인 POST를 재전송하지 않고 토큰만 다시 받는다', async () => {
    const { api, requests } = client(() => csrf('before'), () => error(403, 'CSRF_INVALID'), () => csrf('after'));
    expect(await submitEmailLogin(api, account.email, 'x')).toMatchObject({ kind: 'rejected' });
    expect(requests()).toEqual([csrfGet, loginPost, csrfGet]);
  });

  it('최초 발급 503이면 로그인 POST를 시작하지 않는다', async () => {
    const { api, requests } = client(() => error(503, 'AUTH_STATE_UNAVAILABLE'));
    expect(await submitEmailLogin(api, account.email, 'x')).toMatchObject({ kind: 'rejected' });
    expect(requests()).toEqual([csrfGet]);
  });

  it.each<[string, string[], string]>([
    ['before', ['csrf'], 'rejected'],
    ['login', ['csrf', 'login'], 'rejected'],
    ['recover', ['csrf', 'login', 'csrf'], 'rejected'],
    ['after', ['csrf', 'login', 'csrf'], 'accepted'],
  ])('%s에서 429를 받은 때 응답 단계와 대기 기한을 보존한다', async (phase, paths, kind) => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const limited = () => error(429, 'RATE_LIMITED', '3');
    const { api, requests } = client(
      phase === 'before' ? limited : () => csrf('before'),
      phase === 'login' ? limited : phase === 'recover' ? () => error(403, 'CSRF_INVALID') : () => json({ data: account }),
      limited,
    );
    const result = await submitEmailLogin(api, account.email, 'x');
    expect(result).toMatchObject({ kind, retryAt: 4_000, ...(kind === 'accepted' ? { csrfFailed: true } : {}) });
    if (phase === 'before' || phase === 'recover') {
      expect(result).toHaveProperty('csrfLimited', true);
    } else {
      expect(result).not.toHaveProperty('csrfLimited');
    }
    expect(requests()).toEqual(paths.map(path => path === 'login' ? loginPost : csrfGet));
  });

  it.each([undefined, 'invalid', '2.5'])('429 Retry-After %s에 임의의 대기 시간을 추가하지 않는다', async (retryAfter) => {
    const { api, requests } = client(() => csrf('before'), () => error(429, 'RATE_LIMITED', retryAfter));
    const result = await submitEmailLogin(api, account.email, 'x');
    expect(result.kind).toBe('rejected');
    expect(result).not.toHaveProperty('retryAt');
    expect(requests()).toEqual([csrfGet, loginPost]);
  });

  it('로그인 성공 후 CSRF 503에서도 인증 성공을 그대로 반환한다', async () => {
    const { api, requests } = client(() => csrf('before'), () => json({ data: account }), () => error(503, 'AUTH_STATE_UNAVAILABLE'));
    expect(await submitEmailLogin(api, account.email, 'x')).toEqual({ kind: 'accepted', csrfFailed: true });
    expect(requests()).toEqual([csrfGet, loginPost, csrfGet]);
  });
});

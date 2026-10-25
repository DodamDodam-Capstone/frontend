import { describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch, type ApiRequest, type AuthOutcome } from './client';
import type { CsrfResult } from './csrf';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1/' };
const login: ApiRequest = { method: 'POST', path: '/auth/login', body: '{"email":"guardian@example.com","password":"synthetic-password"}', headers: { 'Content-Type': 'application/json' } };
const logout: ApiRequest = { method: 'POST', path: '/auth/logout' };
const lock: ApiRequest = { method: 'POST', path: '/guardian/lock' };
function csrf(token: string) {
  return new Response(JSON.stringify({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function response(status = 200, code?: string) {
  return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(code
    ? { error: { code, message: 'Synthetic failure', requestId: '22222222-2222-4222-8222-222222222222', fields: [] } }
    : { data: { authenticated: true } }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function client(fetchImpl: ApiFetch) {
  const result = createApiClient(config, { fetchImpl });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return result.value;
}
function server(auth = () => Promise.resolve(response())) {
  let generation = 0;
  return jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf(`synthetic-token-${++generation}`)
    : /\/auth\/(login|logout)$/.test(url) ? auth() : response(204));
}
const sentToken = (init: RequestInit) => new Headers(init.headers).get('X-XSRF-TOKEN');

describe('SCRUM-165 인증 전환과 CSRF 갱신', () => {
  it('로그인 성공의 원래 응답을 보존하고 새 CSRF를 다음 POST에 사용한다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    const classified = jest.fn(async (value: Response): Promise<AuthOutcome> => {
      expect((await value.json()).data.authenticated).toBe(true);
      return 'changed';
    });
    const result = await api.authTransition(login, classified);
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toEqual({ ok: true });
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind === 'response') expect((await result.operation.response.json()).data.authenticated).toBe(true);
    await api.request(lock);
    expect(fetchImpl.mock.calls.map(([url]) => url.replace(config.apiBaseUrl.slice(0, -1), ''))).toEqual(['/auth/csrf', '/auth/login', '/auth/csrf', '/guardian/lock']);
    expect(sentToken(fetchImpl.mock.calls[1][1])).toBe('synthetic-token-1');
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
    expect(classified).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 204는 0바이트 POST를 유지하고 익명 CSRF를 다시 준비한다', async () => {
    const fetchImpl = server(async () => response(204));
    const api = client(fetchImpl);
    const result = await api.authTransition(logout, (value) => value.status === 204 ? 'changed' : 'unknown');
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls).toHaveLength(3);
    const init = fetchImpl.mock.calls[1][1];
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(init).not.toHaveProperty('body');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    await api.request(lock);
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it('확정 LOGIN_FAILED는 성공 정리를 적용하지 않고 기존 token을 유지한다', async () => {
    const fetchImpl = server(async () => response(401, 'LOGIN_FAILED'));
    const api = client(fetchImpl);
    const result = await api.authTransition(login, async (value) => (await value.json()).error.code === 'LOGIN_FAILED' ? 'unchanged' : 'unknown');
    expect(result.outcome).toBe('unchanged');
    expect(result.refresh).toBeUndefined();
    await api.request(lock);
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'lock']);
    expect(sentToken(fetchImpl.mock.calls[2][1])).toBe('synthetic-token-1');
  });

  it('CSRF_INVALID의 갱신 결과와 원래 실패 응답을 분리하고 auth POST를 반복하지 않는다', async () => {
    const fetchImpl = server(async () => response(403, 'CSRF_INVALID'));
    const api = client(fetchImpl);
    const result = await api.authTransition(login, async (value) => (await value.json()).error.code === 'CSRF_INVALID' ? 'csrf_invalid' : 'unknown');
    expect(result.outcome).toBe('csrf_invalid');
    expect(result.refresh).toEqual({ ok: true });
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind === 'response') expect(result.operation.response.status).toBe(403);
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'csrf']);
    await api.request(lock);
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it.each<[string, () => Promise<Response>, CsrfResult]>([
    ['http', async () => response(503, 'SYNTHETIC_FAILURE'), { ok: false, reason: 'http', status: 503 }],
    ['network', async () => { throw new Error('synthetic-private-value'); }, { ok: false, reason: 'network' }],
    ['invalid', async () => new Response('broken', { headers: { 'Content-Type': 'application/json' } }), { ok: false, reason: 'invalid_response' }],
  ])('로그인 후 갱신 %s 실패는 auth 성공을 바꾸거나 이전 token을 복구하지 않는다', async (_name, fail, expected) => {
    let issued = false;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (!url.endsWith('/auth/csrf')) return response();
      if (issued) return fail();
      issued = true; return csrf('synthetic-old-token');
    });
    const api = client(fetchImpl);
    const result = await api.authTransition(login, () => 'changed');
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toEqual(expected);
    expect(result.operation.kind).toBe('response');
    expect((await api.request(lock)).kind).toBe('not_sent');
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'csrf', 'csrf']);
  });

  it('부분 부작용 가능한 auth 503은 호출부의 unknown 판정을 전달하고 이전 준비 상태를 해제한다', async () => {
    const fetchImpl = server(async () => response(503, 'AUTH_STATE_UNAVAILABLE'));
    const api = client(fetchImpl);
    const result = await api.authTransition(login, () => 'unknown');
    expect(result.outcome).toBe('unknown');
    expect(result.refresh).toBeUndefined();
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind === 'response') expect(result.operation.response.status).toBe(503);
    expect(fetchImpl.mock.calls).toHaveLength(2);
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(fetchImpl.mock.calls).toHaveLength(3);
    await api.request(lock);
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it('auth 전송 실패는 unknown으로 전달하며 자동 재전송 없이 다음 명시적 시도를 허용한다', async () => {
    const fetchImpl = server(async () => { throw new Error('synthetic-private-value'); });
    const api = client(fetchImpl);
    const classify = jest.fn((): AuthOutcome => 'changed');
    const first = await api.authTransition(login, classify);
    expect(first).toEqual({ operation: { kind: 'transport_error' }, outcome: 'unknown' });
    expect(classify).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls).toHaveLength(2);
    const second = await api.authTransition(logout, classify);
    expect(second.operation.kind).toBe('transport_error');
    expect(fetchImpl.mock.calls).toHaveLength(4);
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it('판정 함수 예외를 노출하지 않고 token 준비를 해제한 뒤 finally에서 gate를 해제한다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    const result = await api.authTransition(login, () => { throw new Error('synthetic-password-and-pin'); });
    expect(result.outcome).toBe('unknown');
    expect(result.refresh).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('synthetic-password-and-pin');
    expect(fetchImpl.mock.calls).toHaveLength(2);
    const second = await api.authTransition(logout, () => 'changed');
    expect(second.outcome).toBe('changed');
    expect(second.refresh).toEqual({ ok: true });
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it.each([undefined, null, 'success'])('정의되지 않은 호출부 판정은 세션 유지로 추측하지 않는다: %s', async (value) => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    const result = await api.authTransition(login, () => value as AuthOutcome);
    expect(result.outcome).toBe('unknown');
    expect(result.refresh).toBeUndefined();
    await api.prepareCsrf();
    expect(fetchImpl.mock.calls).toHaveLength(3);
  });

  it('전환 중 GET·POST·준비 요청은 대기열에 넣지 않고 즉시 거절한다', async () => {
    const held = deferred<Response>();
    const started = deferred<void>();
    const fetchImpl = server(async () => { started.resolve(); return held.promise; });
    const api = client(fetchImpl);
    const pending = api.authTransition(login, () => 'changed');
    await started.promise;
    expect(await api.request(lock)).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    expect(await api.request({ method: 'GET', path: '/auth/me' })).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    expect(await api.prepareCsrf()).toEqual({ ok: false, reason: 'auth_transition' });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    held.resolve(response());
    expect((await pending).refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls).toHaveLength(3);
    await api.request(lock);
    expect(fetchImpl.mock.calls).toHaveLength(4);
  });

  it('겹친 인증 전환은 자동 실행하지 않고 기존 전환을 유지한다', async () => {
    const held = deferred<Response>();
    const started = deferred<void>();
    const fetchImpl = server(async () => { started.resolve(); return held.promise; });
    const api = client(fetchImpl);
    const first = api.authTransition(login, () => 'unchanged');
    await started.promise;
    expect(await api.authTransition(logout, () => 'changed')).toEqual({ operation: { kind: 'not_sent', reason: 'auth_transition' }, outcome: 'not_attempted' });
    held.resolve(response(401, 'LOGIN_FAILED'));
    await first;
    expect(fetchImpl.mock.calls).toHaveLength(2);
  });

  it('먼저 진행 중인 CSRF GET을 정리한 뒤 auth를 보내고 그 GET을 기다리던 일반 POST는 보내지 않는다', async () => {
    const held = deferred<Response>();
    let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf')
      ? ++gets === 1 ? held.promise : csrf('synthetic-token-2') : response());
    const api = client(fetchImpl);
    const waiting = api.request(lock);
    const auth = api.authTransition(login, () => 'changed');
    expect(fetchImpl.mock.calls).toHaveLength(1);
    held.resolve(csrf('synthetic-token-1'));
    expect(await waiting).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    expect((await auth).refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'csrf']);
    expect(sentToken(fetchImpl.mock.calls[1][1])).toBe('synthetic-token-1');
  });

  it('이전 세대의 prepareCsrf 완료를 새 세션의 준비 성공으로 반환하지 않는다', async () => {
    const held = deferred<Response>();
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? held.promise : response());
    const api = client(fetchImpl);
    const preparation = api.prepareCsrf();
    const auth = api.authTransition(login, () => 'unchanged');
    held.resolve(csrf('synthetic-token-1'));
    expect(await preparation).toEqual({ ok: false, reason: 'auth_transition' });
    expect((await auth).outcome).toBe('unchanged');
    expect(fetchImpl.mock.calls).toHaveLength(2);
  });

  it.each(['GET', 'POST'] as const)('이미 보낸 %s의 늦은 응답은 not_sent가 아니라 stale_response다', async (method) => {
    const held = deferred<Response>();
    const started = deferred<void>();
    let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (url.endsWith('/auth/csrf')) return csrf(`synthetic-token-${++gets}`);
      if (url.endsWith('/guardian/lock')) { started.resolve(); return held.promise; }
      return response();
    });
    const api = client(fetchImpl);
    const old = api.request({ method, path: '/guardian/lock' });
    await started.promise;
    const transition = api.authTransition(login, () => 'changed');
    held.resolve(response());
    expect(await old).toEqual({ kind: 'stale_response' });
    await transition;
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/guardian/lock'))).toHaveLength(1);
  });

  it('갱신 GET이 끝나기 전에는 전환 gate를 해제하지 않는다', async () => {
    const held = deferred<Response>();
    const refreshing = deferred<void>();
    let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (!url.endsWith('/auth/csrf')) return response();
      if (++gets === 1) return csrf('synthetic-token-1');
      refreshing.resolve(); return held.promise;
    });
    const api = client(fetchImpl);
    const auth = api.authTransition(login, () => 'changed');
    await refreshing.promise;
    expect(await api.request(lock)).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    expect(await api.prepareCsrf()).toEqual({ ok: false, reason: 'auth_transition' });
    held.resolve(csrf('synthetic-token-2'));
    expect((await auth).refresh).toEqual({ ok: true });
    await api.request(lock);
    expect(sentToken(fetchImpl.mock.calls[3][1])).toBe('synthetic-token-2');
  });

  it('판정 함수 안의 일반 요청도 gate를 우회하지 않으며 자기 대기 교착이 없다', async () => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    const result = await api.authTransition(login, async (): Promise<AuthOutcome> => {
      expect(await api.request(lock)).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
      expect(await api.prepareCsrf()).toEqual({ ok: false, reason: 'auth_transition' });
      return 'changed';
    });
    expect(result.refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls).toHaveLength(3);
  });

  it('전송 전에 취소된 auth는 CSRF나 POST 없이 반환하고 gate를 잠그지 않는다', async () => {
    const abort = new AbortController(); abort.abort();
    const fetchImpl = server();
    const api = client(fetchImpl);
    expect(await api.authTransition({ ...login, signal: abort.signal }, () => 'changed')).toEqual({ operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await api.authTransition(logout, () => 'changed')).refresh).toEqual({ ok: true });
  });

  it('auth POST 전송 중 취소는 처리 결과 unknown이며 이전 token을 지우고 gate를 해제한다', async () => {
    const abort = new AbortController();
    const started = deferred<void>();
    let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url, init) => {
      if (url.endsWith('/auth/csrf')) return csrf(`synthetic-token-${++gets}`);
      started.resolve();
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('private-abort-value')), { once: true }));
    });
    const api = client(fetchImpl);
    const auth = api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    await started.promise; abort.abort();
    expect(await auth).toEqual({ operation: { kind: 'transport_error' }, outcome: 'unknown' });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(fetchImpl.mock.calls).toHaveLength(3);
  });

  it('CSRF 대기 중 auth 취소는 공유 GET을 기다리지 않고 미전송으로 반환한다', async () => {
    const held = deferred<Response>();
    const started = deferred<void>();
    const abort = new AbortController();
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (!url.endsWith('/auth/csrf')) return response(204);
      started.resolve(); return held.promise;
    });
    const api = client(fetchImpl);
    const auth = api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    await started.promise; abort.abort();
    expect(await auth).toEqual({ operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' });
    expect(fetchImpl.mock.calls).toHaveLength(1);
    expect((await api.request({ method: 'GET', path: '/auth/me' })).kind).toBe('response');
    held.resolve(csrf('synthetic-token-1'));
    expect(await api.prepareCsrf()).toEqual({ ok: true });
  }, 1000);

  it('기존 GET drain 중 auth 취소는 gate를 해제하되 다음 auth도 같은 GET을 먼저 drain한다', async () => {
    const held = deferred<Response>();
    const abort = new AbortController();
    let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf')
      ? ++gets === 1 ? held.promise : csrf('synthetic-token-2') : response(204));
    const api = client(fetchImpl);
    const preparation = api.prepareCsrf();
    const cancelled = api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    abort.abort();
    expect(await cancelled).toEqual({ operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' });
    const next = api.authTransition(logout, () => 'changed');
    expect(fetchImpl.mock.calls).toHaveLength(1);
    held.resolve(csrf('synthetic-token-1'));
    expect(await preparation).toEqual({ ok: false, reason: 'auth_transition' });
    expect((await next).refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'logout', 'csrf']);
  }, 1000);

  it('초기 CSRF 실패는 auth 미전송과 구별하고 판정 함수에 성공을 추측하게 하지 않는다', async () => {
    const fetchImpl = jest.fn<ApiFetch>(async () => response(503, 'SYNTHETIC_FAILURE'));
    const classify = jest.fn((): AuthOutcome => 'changed');
    const result = await client(fetchImpl).authTransition(login, classify);
    expect(result).toEqual({ operation: { kind: 'not_sent', reason: 'csrf_unavailable', csrf: { ok: false, reason: 'http', status: 503 } }, outcome: 'not_attempted' });
    expect(classify).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls).toHaveLength(1);
  });

  it.each([
    { method: 'GET', path: '/auth/me' },
    { method: 'POST', path: '/auth/csrf' },
    { method: 'POST', path: 'https://other.example.invalid/steal' },
    { method: 'POST', path: '/auth/login', headers: { Authorization: 'synthetic-token' } },
  ] as ApiRequest[])('auth 전용 전송도 기존 주소·method·보안 헤더 검증을 우회하지 않는다: %#', async (value) => {
    const fetchImpl = server();
    const api = client(fetchImpl);
    expect(await api.authTransition(value, () => 'changed')).toEqual({ operation: { kind: 'not_sent', reason: 'invalid_request' }, outcome: 'not_attempted' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await api.authTransition(logout, () => 'changed')).refresh).toEqual({ ok: true });
  });

  it('auth 갱신 중 민감한 token·비밀번호·PIN·예외 값을 URL·결과·콘솔로 복사하지 않는다', async () => {
    const outputs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'info'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
    outputs.forEach((value) => value.mockImplementation(() => {}));
    try {
      const fetchImpl = server();
      const api = client(fetchImpl);
      const result = await api.authTransition(login, () => { throw new Error('synthetic-password-pin-secret'); });
      expect(JSON.stringify(result)).not.toMatch(/synthetic-(token|password)/);
      for (const [url] of fetchImpl.mock.calls) expect(url).not.toMatch(/synthetic-(token|password)/);
      for (const output of outputs) expect(output).not.toHaveBeenCalled();
    } finally { outputs.forEach((value) => value.mockRestore()); }
  });
});


describe('일반 응답의 Set-Cookie와 인증 전환 순서', () => {
  it('먼저 보낸 일반 응답이 정리되기 전에는 auth POST를 보내지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const events: string[] = []; let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (url.endsWith('/auth/csrf')) return csrf(`synthetic-token-${++gets}`);
      if (url.endsWith('/old')) { started.resolve(); const value = await held.promise; events.push('old-headers'); return value; }
      events.push('auth'); return response();
    });
    const api = client(fetchImpl);
    await api.prepareCsrf();
    const old = api.request({ method: 'POST', path: '/old' }); await started.promise;
    const auth = api.authTransition(login, () => 'changed');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'old']);
    const denied = response(403, 'CSRF_INVALID'); denied.headers.set('Set-Cookie', 'synthetic-old-csrf'); held.resolve(denied);
    expect(await old).toEqual({ kind: 'stale_response' });
    expect((await auth).refresh).toEqual({ ok: true });
    expect(events).toEqual(['old-headers', 'auth']);
  });

  it('일반 응답 drain 중 auth를 취소해도 다음 auth는 남은 응답을 먼저 기다린다', async () => {
    const held = deferred<Response>(); const started = deferred<void>(); const abort = new AbortController(); let gets = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (url.endsWith('/auth/csrf')) return csrf(`synthetic-token-${++gets}`);
      if (url.endsWith('/old')) { started.resolve(); return held.promise; }
      return response(204);
    });
    const api = client(fetchImpl); await api.prepareCsrf();
    const old = api.request({ method: 'GET', path: '/old' }); await started.promise;
    const cancelled = api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl.mock.calls.length).toBe(2);
    abort.abort();
    expect(await cancelled).toEqual({ operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' });
    const next = api.authTransition(logout, () => 'changed');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl.mock.calls.length).toBe(2);
    held.resolve(response());
    expect(await old).toEqual({ kind: 'stale_response' });
    expect((await next).refresh).toEqual({ ok: true });
    expect(fetchImpl.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'old', 'logout', 'csrf']);
  });
});

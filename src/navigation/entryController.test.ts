import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiClient, type ApiFetch } from '../api/client';
import type { ExampleScenario } from '../api/mockAuthMe';
import { createEntryController } from './entryController';

function controllerForTest(api: ApiClient, readGeneration = () => 0) {
  return createEntryController(api, readGeneration);
}

const baseUrl = 'https://example.test/api/v1';
const requestId = '33333333-3333-4333-8333-333333333333';
const childId = '22222222-2222-4222-8222-222222222222';
const account = {
  accountId: '11111111-1111-4111-8111-111111111111', email: 'guardian@example.com',
  childId: null, hasPin: false, guardianUnlockedUntil: null,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function error(status: number, code: string, headers?: Record<string, string>) {
  return json({ error: { code, message: '합성 응답', requestId, fields: [] } }, status, headers);
}

function csrf() {
  return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf-token' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function client(fetchImpl: ApiFetch, scenario?: ExampleScenario, apiMode = 'real') {
  const result = createApiClient({ appEnv: 'test', apiMode, apiBaseUrl: baseUrl }, { fetchImpl, scenario });
  if (!result.ok) throw new Error('Invalid test configuration');
  return result.value;
}

describe('SCRUM-170 앱 진입', () => {
  afterEach(() => { jest.useRealTimers(); });

  it.each<[string, () => Response]>([
    ['200', () => json({ data: { ...account, childId } })],
    ['401', () => error(401, 'AUTHENTICATION_REQUIRED')],
    ['503', () => error(503, 'AUTH_STATE_UNAVAILABLE')],
    ['429', () => error(429, 'RATE_LIMITED', { 'Retry-After': '30' })],
  ])('OS가 먼저 전환되면 이전 세대의 %s를 버리고 카드 복귀에서 다시 확인한다', async (_, oldResponse) => {
    let generation = 7;
    let accountRequests = 0;
    const first = deferred<Response>();
    const sent = deferred<void>();
    const api = client(async url => {
      if (url.endsWith('/auth/csrf')) return csrf();
      sent.resolve();
      return ++accountRequests === 1 ? first.promise : json({ data: account });
    });
    const entry = controllerForTest(api, () => generation);
    const checking = entry.start();
    await sent.promise;
    generation++;
    first.resolve(oldResponse());
    await checking;
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    const routed = deferred<void>();
    entry.subscribe(() => { if (entry.getSnapshot().kind === 'route') routed.resolve(); });
    entry.reenterTask(generation);
    await routed.promise;
    expect(accountRequests).toBe(2);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/children/register', generation: 8 });
  });

  it('AppState 복귀 조회 중이거나 끝난 세대의 카드 이벤트는 같은 조회를 반복하지 않는다', async () => {
    let generation = 1;
    let accountRequests = 0;
    const held = deferred<Response>();
    const sent = deferred<void>();
    const api = client(async url => {
      if (url.endsWith('/auth/csrf')) return csrf();
      if (++accountRequests === 1) return json({ data: account });
      sent.resolve();
      return held.promise;
    });
    const entry = controllerForTest(api, () => generation);
    await entry.start();
    entry.suspend();
    generation++;
    const resumed = entry.resume();
    await sent.promise;
    entry.reenterTask(generation);
    held.resolve(json({ data: { ...account, childId } }));
    await resumed;
    entry.reenterTask(generation);
    expect(accountRequests).toBe(2);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/home', generation: 2 });
  });

  it('전환기에 머무는 동안 받은 CSRF 429는 카드 복귀 조회에 대기 기한을 부과하지 않는다', async () => {
    let generation = 1;
    let csrfRequests = 0;
    const held = deferred<Response>();
    const sent = deferred<void>();
    const api = client(async url => {
      if (url.endsWith('/auth/me')) return json({ data: account });
      sent.resolve();
      return ++csrfRequests === 1 ? held.promise : csrf();
    });
    const entry = controllerForTest(api, () => generation);
    const started = entry.start();
    await sent.promise;
    generation = -1;
    held.resolve(error(429, 'RATE_LIMITED', { 'Retry-After': '30' }));
    await started;
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    generation = 2;
    const routed = deferred<void>();
    entry.subscribe(() => { if (entry.getSnapshot().kind === 'route') routed.resolve(); });
    entry.reenterTask(generation);
    await routed.promise;
    expect(csrfRequests).toBe(2);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/children/register', generation: 2 });
  });

  it.each<[ExampleScenario, string]>([
    ['signedOut', '/login'], ['signedIn', '/children/register'], ['childRegistered', '/home'],
  ])('mock 계약 %s → %s', async (scenario, route) => {
    const fetchImpl = jest.fn<ApiFetch>();
    const entry = controllerForTest(client(fetchImpl, scenario, 'mock'));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route, visit: expect.any(Number), generation: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('real 모드에서 mock 선택은 적용되지 않고 실제 전송 경계에서 상태를 읽는다', async () => {
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/me') ? json({ data: account }) : csrf());
    const entry = controllerForTest(client(fetchImpl, 'signedOut'));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/children/register', visit: expect.any(Number), generation: 0 });
    expect(fetchImpl).toHaveBeenCalledWith(`${baseUrl}/auth/me`, expect.objectContaining({
      method: 'GET', credentials: 'include', cache: 'no-store',
    }));
  });

  it('CSRF 준비 중 보호 UI를 숨기고 실패 후 사용자 재시도로 복구한다', async () => {
    const pending = deferred<Response>();
    let csrfRequests = 0;
    const entry = controllerForTest(client(async (url) => {
      if (url.endsWith('/auth/me')) return json({ data: { ...account, childId } });
      return ++csrfRequests === 1 ? pending.promise : csrf();
    }));
    const start = entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    pending.resolve(error(503, 'AUTH_STATE_UNAVAILABLE'));
    await start;
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'csrf_unavailable' });
    await entry.retry();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
    expect(csrfRequests).toBe(2);
  });

  it('확정된 401은 끝나지 않은 CSRF에 막히지 않는다', async () => {
    const pending = deferred<Response>();
    const entry = controllerForTest(client((url) => url.endsWith('/auth/me')
      ? Promise.resolve(error(401, 'AUTHENTICATION_REQUIRED')) : pending.promise));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/login', visit: expect.any(Number), generation: 0 });
    pending.resolve(csrf());
  });

  it.each(['transport', 'unavailable', 'malformed'])('CSRF가 대기 중이어도 %s 계정 조회 실패를 알린다', async (failure) => {
    const pending = deferred<Response>();
    const issued = deferred<void>();
    const entry = controllerForTest(client(async (url) => {
      if (!url.endsWith('/auth/me')) return pending.promise;
      issued.resolve();
      if (failure === 'transport') throw new Error('Synthetic network failure');
      return failure === 'unavailable' ? error(503, 'AUTH_STATE_UNAVAILABLE') : json({ wrong: true });
    }));
    const checking = entry.start();
    await issued.promise;
    const reason = failure === 'transport' ? 'request_failed' : failure === 'unavailable'
      ? 'auth_state_unavailable' : 'invalid_response';
    const changed = deferred<void>();
    const unsubscribe = entry.subscribe(() => { if (entry.getSnapshot().kind === 'error') changed.resolve(); });
    await changed.promise;
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason });
    unsubscribe();
    pending.resolve(csrf());
    await checking;
  }, 1_000);

  it('계정 조회가 대기 중이어도 CSRF 오류를 알리고 이후 확정된 401을 적용한다', async () => {
    const pending = deferred<Response>();
    const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me')
      ? pending.promise : error(503, 'AUTH_STATE_UNAVAILABLE')));
    const changed = deferred<void>();
    const unsubscribe = entry.subscribe(() => { if (entry.getSnapshot().kind === 'error') changed.resolve(); });
    const checking = entry.start();
    await changed.promise;
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'csrf_unavailable' });
    pending.resolve(error(401, 'AUTHENTICATION_REQUIRED'));
    await checking;
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/login', visit: expect.any(Number), generation: 0 });
    unsubscribe();
  }, 1_000);

  it.each<[number, string, string]>([
    [401, 'LOGIN_FAILED', 'invalid_response'], [403, 'AUTHENTICATION_REQUIRED', 'invalid_response'],
    [503, 'AUTH_STATE_UNAVAILABLE', 'auth_state_unavailable'],
  ])('HTTP %i %s을 로그인으로 오인하지 않는다', async (status, code, reason) => {
    const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me') ? error(status, code) : csrf()));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason });
  });

  it.each([
    { childId: undefined }, { childId: 'not-an-id' }, { accountId: 'not-an-id' },
    { email: 'guardian' }, { email: 'a@@b' }, { email: '.a..b@example.com' }, { email: 'a@example..com' },
    { email: '"guardian home"@example.com' }, { email: 'a@[IPv6:not-an-address]' },
    { email: `${'a'.repeat(65)}@example.com` }, { hasPin: null }, { guardianUnlockedUntil: undefined },
    { guardianUnlockedUntil: '2026-02-30T15:00:00+09:00' }, { guardianUnlockedUntil: '2026-11-22T05:00:00Z' },
    { unexpected: true },
  ])('잘못된 AccountView 필드 %j를 정상 경로로 통과시키지 않는다', async (changes) => {
    const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me')
      ? json({ data: { ...account, ...changes } }) : csrf()));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'invalid_response' });
  });

  it.each([
    'guardian+fixture@example.com', '"guardian@home"@[192.0.2.1]', 'guardian@[IPv6:2001:db8::1]',
    'guardian."home@tablet"@example.com',
  ])(
    '유효한 이메일 %s, KST 시각과 PIN이 포함돼도 아이 상태로 홈을 선택하고 DTO를 공개하지 않는다', async (email) => {
      const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me') ? json({ data: {
        ...account, email, childId, hasPin: true,
        guardianUnlockedUntil: '2026-12-02T01:02:03+09:00',
      } }) : csrf()));
      await entry.start();
      expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
    },
  );

  it('정리 후 보관된 재조회 콜백은 새 요청을 시작하지 않는다', async () => {
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/me') ? json({ data: account }) : csrf());
    const entry = controllerForTest(client(fetchImpl));
    await entry.start();
    const refresh = entry.refresh;
    await refresh();
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/auth/me'))).toHaveLength(2);
    entry.stop();
    await refresh();
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/auth/me'))).toHaveLength(2);
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
  });

  it('확인된 429는 두 응답 중 가장 늦은 시각 전까지 재시도하지 않는다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    let checks = 0;
    const fetchImpl = jest.fn<ApiFetch>(async (url) => {
      if (!url.endsWith('/auth/me')) return checks ? csrf() : error(429, 'RATE_LIMITED', { 'Retry-After': '9' });
      return ++checks === 1 ? error(429, 'RATE_LIMITED', { 'Retry-After': '3' }) : json({ data: account });
    });
    const entry = controllerForTest(client(fetchImpl));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'rate_limited', retryAt: 10_000 });
    jest.advanceTimersByTime(8_999);
    await entry.retry();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await entry.retry();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/children/register', visit: expect.any(Number), generation: 0 });
  });

  it('429의 잘못된 대기 헤더를 임의 지연으로 바꾸지 않는다', async () => {
    const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me')
      ? error(429, 'RATE_LIMITED', { 'Retry-After': '0.5' }) : csrf()));
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'rate_limited' });
  });

  it('이미 확인한 대기 기한을 401 로그인 전환 뒤의 재조회에도 적용한다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const pending = deferred<Response>();
    const fetchImpl = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/me')
      ? pending.promise : error(429, 'RATE_LIMITED', { 'Retry-After': '3' }));
    const entry = controllerForTest(client(fetchImpl));
    const changed = deferred<void>();
    entry.subscribe(() => { if (entry.getSnapshot().kind === 'error') changed.resolve(); });
    const checking = entry.start();
    await changed.promise;
    pending.resolve(error(401, 'AUTHENTICATION_REQUIRED'));
    await checking;
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/login', visit: expect.any(Number), generation: 0, loginRetryAt: 4_000 });
    await entry.start();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(entry.getSnapshot()).toEqual({ kind: 'error', reason: 'rate_limited', retryAt: 4_000 });
  }, 1_000);

  it('나중 보호 요청의 동시 401은 기존 홈을 지우고 로그인 이동을 한 번 발행한다', async () => {
    const api = client(async (url) => {
      if (url.endsWith('/auth/csrf')) return csrf();
      if (url.endsWith('/auth/me')) return json({ data: { ...account, childId } });
      return error(401, 'AUTHENTICATION_REQUIRED');
    });
    const entry = controllerForTest(api);
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
    const listener = jest.fn();
    entry.subscribe(listener);
    const [first, second] = await Promise.all([
      api.request({ method: 'GET', path: '/children' }), api.request({ method: 'GET', path: '/children' }),
    ]);
    const results = await Promise.all([entry.receiveProtectedAuthResult(first), entry.receiveProtectedAuthResult(second)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/login', visit: expect.any(Number), generation: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    if (first.kind !== 'response') throw new Error('Expected protected response');
    expect(first.response.bodyUsed).toBe(false);
  });

  it('보호 요청의 401 본문을 읽는 사이 OS가 먼저 전환되면 이전 세션을 만료시키지 않는다', async () => {
    let generation = 1;
    const held = deferred<string>();
    const reading = deferred<void>();
    const denied = error(401, 'AUTHENTICATION_REQUIRED');
    const body = await denied.clone().text();
    const copy = denied.clone();
    jest.spyOn(denied, 'clone').mockReturnValue(copy);
    jest.spyOn(copy, 'text').mockImplementation(() => { reading.resolve(); return held.promise; });
    const api = client(async url => {
      if (url.endsWith('/auth/csrf')) return csrf();
      if (url.endsWith('/auth/me')) return json({ data: { ...account, childId } });
      return denied;
    });
    const entry = controllerForTest(api, () => generation);
    await entry.start();
    const context = api.captureCurrentContext()!;
    const receiving = entry.receiveProtectedAuthResult(await api.request({ method: 'GET', path: '/children' }));
    await reading.promise;
    generation = -1;
    held.resolve(body);
    expect(await receiving).toBe(false);
    expect(api.isCurrentContext(context)).toBe(true);
  });

  it('재로그인 전에 수신한 401 본문이 늦게 끝나도 새 사용자 홈을 유지한다', async () => {
    const pending = deferred<string>();
    const reading = deferred<void>();
    const denied = error(401, 'AUTHENTICATION_REQUIRED');
    const response = denied.clone();
    const expectedBody = await response.text();
    const copy = denied.clone();
    jest.spyOn(denied, 'clone').mockReturnValue(copy);
    jest.spyOn(copy, 'text').mockImplementation(() => { reading.resolve(); return pending.promise; });
    const api = client(async (url) => {
      if (url.endsWith('/auth/csrf')) return csrf();
      if (url.endsWith('/auth/me')) return json({ data: { ...account, childId } });
      if (url.endsWith('/auth/login')) return json({ data: account });
      return denied;
    });
    const entry = controllerForTest(api);
    await entry.start();
    const old = await api.request({ method: 'GET', path: '/children' });
    const receiving = entry.receiveProtectedAuthResult(old);
    await reading.promise;
    await api.authTransition({ method: 'POST', path: '/auth/login', body: '{}' }, () => 'changed');
    await entry.start();
    pending.resolve(expectedBody);
    expect(await receiving).toBe(false);
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
  });

  it('종료된 조회의 본문이 새 진입 뒤 도착해도 최신 경로만 유지한다', async () => {
    const pending = deferred<string>();
    const reading = deferred<void>();
    const old = json({ data: account });
    jest.spyOn(old, 'text').mockImplementation(() => { reading.resolve(); return pending.promise; });
    let checks = 0;
    const entry = controllerForTest(client(async (url) => url.endsWith('/auth/me')
      ? (++checks === 1 ? old : json({ data: { ...account, childId } })) : csrf()));
    const first = entry.start();
    await reading.promise;
    entry.stop();
    await entry.start();
    pending.resolve(JSON.stringify({ data: account }));
    await first;
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
  });

  it('CSRF 오류 본문 대기 중 문맥이 바뀌면 이전 조회의 성공이나 오류를 표시하지 않는다', async () => {
    const pending = deferred<string>();
    const reading = deferred<void>();
    const throttled = error(429, 'RATE_LIMITED', { 'Retry-After': '3' });
    const body = await throttled.clone().text();
    jest.spyOn(throttled, 'text').mockImplementation(() => { reading.resolve(); return pending.promise; });
    let csrfRequests = 0;
    let accountRequests = 0;
    const api = client(async (url) => {
      if (url.endsWith('/auth/csrf')) return ++csrfRequests === 1 ? throttled : csrf();
      if (url.endsWith('/auth/me')) return json({ data: { ...account, childId: ++accountRequests === 1 ? null : childId } });
      return json({ data: account });
    });
    const entry = controllerForTest(api);
    const first = entry.start();
    await reading.promise;
    await api.authTransition({ method: 'POST', path: '/auth/login', body: '{}' }, () => 'changed');
    pending.resolve(body);
    await first;
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    await entry.start();
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
  });

  it('이전 계정 본문 도착 시 앞서 표시한 임시 CSRF 오류도 새 문맥에 남지 않는다', async () => {
    const pending = deferred<string>();
    const old = json({ data: account });
    jest.spyOn(old, 'text').mockReturnValue(pending.promise);
    let csrfRequests = 0;
    const api = client(async (url) => {
      if (url.endsWith('/auth/csrf')) return ++csrfRequests === 1 ? error(503, 'AUTH_STATE_UNAVAILABLE') : csrf();
      return url.endsWith('/auth/me') ? old : json({ data: account });
    });
    const entry = controllerForTest(api);
    const shown = deferred<void>();
    entry.subscribe(() => { if (entry.getSnapshot().kind === 'error') shown.resolve(); });
    const first = entry.start();
    await shown.promise;
    await api.authTransition({ method: 'POST', path: '/auth/login', body: '{}' }, () => 'changed');
    pending.resolve(JSON.stringify({ data: account }));
    await first;
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
  });

  it('계정 응답 수신 전 문맥 전환을 시작하면 이전 CSRF 429로 새 재조회를 막지 않는다', async () => {
    const oldAccount = deferred<Response>();
    const oldCsrfBody = deferred<string>();
    const reading = deferred<void>();
    const rateError = error(429, 'RATE_LIMITED', { 'Retry-After': '300' });
    const body = await rateError.clone().text();
    jest.spyOn(rateError, 'text').mockImplementation(() => { reading.resolve(); return oldCsrfBody.promise; });
    let csrfRequests = 0;
    let accountRequests = 0;
    const api = client(async (url) => {
      if (url.endsWith('/auth/csrf')) return ++csrfRequests === 1 ? rateError : csrf();
      if (url.endsWith('/auth/me') && ++accountRequests === 1) return oldAccount.promise;
      return json({ data: { ...account, childId } });
    });
    const entry = controllerForTest(api);
    const first = entry.start();
    await reading.promise;
    const transition = api.authTransition({ method: 'POST', path: '/auth/login', body: '{}' }, () => 'changed');
    oldCsrfBody.resolve(body);
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    oldAccount.resolve(json({ data: account }));
    await Promise.all([first, transition]);
    await entry.start();
    expect(accountRequests).toBe(2);
    expect(entry.getSnapshot()).toEqual({ kind: 'route', route: '/home', visit: expect.any(Number), generation: 0 });
  });
});

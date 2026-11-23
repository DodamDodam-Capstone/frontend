import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { createApiClient, type ApiFetch } from '../api/client';
import { parseApiResponse } from '../api/response';
import { createEntryController } from './entryController';

const accountA = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'guardian-a@example.test',
  childId: '22222222-2222-4222-8222-222222222222',
  hasPin: false,
  guardianUnlockedUntil: null,
};
const accountB = { ...accountA, accountId: '33333333-3333-4333-8333-333333333333', email: 'guardian-b@example.test' };
const requestId = '44444444-4444-4444-8444-444444444444';
const jsonExpectation = { kind: 'json', statuses: [200] } as const;

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function error(status: number, code: string, headers?: Record<string, string>) {
  return json({ error: { code, message: '합성 응답', requestId, fields: [] } }, status, headers);
}

function expired() { return error(401, 'AUTHENTICATION_REQUIRED'); }
function unavailable() { return error(503, 'AUTH_STATE_UNAVAILABLE'); }
function signedOut() { return new Response(null, { status: 204 }); }

function csrf(token = 'signed-in-csrf') {
  return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Reply = () => Response | Promise<Response>;

function setup(initialAccount = accountA) {
  let generation = 1;
  let account: typeof accountA | null = initialAccount;
  let nextAccount = initialAccount;
  const replies: Record<string, Reply> = {
    '/auth/me': () => account ? json({ data: account }) : expired(),
    '/auth/csrf': () => csrf(account ? 'signed-in-csrf' : 'signed-out-csrf'),
    '/auth/logout': () => { account = null; return signedOut(); },
    '/auth/login': () => { account = nextAccount; return json({ data: account }); },
  };
  const send = jest.fn<ApiFetch>(async (url) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    if (!replies[path]) throw new Error(`Unexpected path ${path}`);
    return replies[path]();
  });
  const result = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://example.test/api/v1' }, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid test configuration');
  const client = result.value;
  const entry = createEntryController(client, () => generation);
  return {
    client, entry, replies,
    setGeneration(next: number) { generation = next; },
    setAccount(next: typeof accountA | null) { account = next; },
    setNextAccount(next: typeof accountA) { nextAccount = next; },
    calls(path: string) { return send.mock.calls.filter(([url]) => url.endsWith(path)); },
    logOut: entry.submitLogout,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('SCRUM-173 로그아웃과 세션 정리', () => {
  it('앱 진입 경로에서 본문 없는 로그아웃을 보내고 로그인으로 이동한다', async () => {
    const { entry, calls, client } = setup();
    await entry.start();
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/home' });
    const oldContext = client.captureCurrentContext();

    await entry.submitLogout();

    const [request] = calls('/auth/logout');
    expect(calls('/auth/logout')).toHaveLength(1);
    expect(request[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(request[1].body).toBeUndefined();
    const headers = new Headers(request[1].headers);
    expect(headers.get('content-type')).toBeNull();
    expect(headers.get('x-xsrf-token')).toBe('signed-in-csrf');
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(client.isCurrentContext(oldContext)).toBe(false);
    expect(await client.prepareCsrf()).toEqual({ ok: true });
    expect(calls('/auth/csrf')).toHaveLength(2);
  });

  it('요청과 후속 CSRF가 지연돼도 보호 화면을 가리고 실패 뒤에 로그아웃을 유지한다', async () => {
    const { entry, replies, calls, logOut } = setup();
    await entry.start();
    const before = entry.getSnapshot();
    const postSeen = deferred<void>();
    const post = deferred<Response>();
    const renewalSeen = deferred<void>();
    const renewal = deferred<Response>();
    replies['/auth/logout'] = () => { postSeen.resolve(); return post.promise; };
    replies['/auth/csrf'] = () => { renewalSeen.resolve(); return renewal.promise; };

    const submitted = logOut();
    await postSeen.promise;
    expect(entry.getSnapshot()).toMatchObject({ ...before, logoutPending: true });
    const duplicate = logOut();
    expect(calls('/auth/logout')).toHaveLength(1);
    post.resolve(signedOut());
    await renewalSeen.promise;
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    await entry.submitLogin(accountA.email, 'fixture-password');
    expect(calls('/auth/login')).toHaveLength(0);
    renewal.resolve(unavailable());
    await Promise.all([submitted, duplicate]);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each([
    [400, 'VALIDATION_FAILED'], [403, 'CSRF_INVALID'],
    [413, 'REQUEST_TOO_LARGE'], [415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('확정 거절 %i %s는 같은 화면 상태를 보존한다', async (status, code) => {
    const { entry, replies, calls, logOut } = setup();
    await entry.start();
    const before = entry.getSnapshot();
    replies['/auth/logout'] = () => error(status, code);

    await logOut();

    expect(entry.getSnapshot()).toMatchObject({ ...before, logoutFeedback: expect.anything() });
    expect(entry.getSnapshot()).not.toMatchObject({ logoutPending: true });
    expect(calls('/auth/me')).toHaveLength(1);
    expect(calls('/auth/logout')).toHaveLength(1);
    expect(calls('/auth/csrf')).toHaveLength(status === 403 ? 2 : 1);
  });

  it('현재 로그아웃 요청의 401과 나중에 도착한 이전 401은 로그인 화면을 한 번만 발행한다', async () => {
    const { client, entry, replies, logOut, calls } = setup();
    await entry.start();
    const protectedContext = client.captureCurrentContext();
    replies['/children'] = expired;
    const old = await client.request({ method: 'GET', path: '/children' });
    replies['/auth/logout'] = expired;
    const loginVisits: number[] = [];
    entry.subscribe(() => {
      const snapshot = entry.getSnapshot();
      if (snapshot.kind === 'route' && snapshot.route === '/login') loginVisits.push(snapshot.visit);
    });

    await logOut();

    expect(client.isCurrentContext(protectedContext)).toBe(false);
    expect(await entry.receiveProtectedAuthResult(old)).toBe(false);
    expect(new Set(loginVisits).size).toBe(1);
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each([
    { sessionEnded: false, route: '/home' }, { sessionEnded: true, route: '/login' },
  ])('503 뒤 세션 만료 $sessionEnded를 현재 계정 조회로 확인한다', async ({ sessionEnded, route }) => {
    const { entry, replies, logOut, calls, setAccount } = setup();
    await entry.start();
    const checking = deferred<void>();
    const me = deferred<Response>();
    replies['/auth/logout'] = () => { if (sessionEnded) setAccount(null); return unavailable(); };
    replies['/auth/me'] = () => { checking.resolve(); return me.promise; };

    const submitted = logOut();
    await checking.promise;
    expect(entry.getSnapshot()).toEqual({ kind: 'loading' });
    me.resolve(sessionEnded ? expired() : json({ data: accountA }));
    await submitted;
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route });
    expect(calls('/auth/me')).toHaveLength(2);
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each([
    ['전송 후 응답 유실', () => { throw new Error('Synthetic connection loss'); }],
    ['알 수 없는 401', () => error(401, 'LOGIN_FAILED')],
  ])('%s 뒤 계정 조회 실패는 보호 화면을 복구하지 않고 조회만 재시도한다', async (_, logoutReply) => {
    const { entry, replies, logOut, calls } = setup();
    await entry.start();
    replies['/auth/logout'] = logoutReply;
    replies['/auth/me'] = unavailable;

    await logOut();

    expect(entry.getSnapshot()).toMatchObject({ kind: 'error' });
    replies['/auth/me'] = expired;
    await entry.retry();
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(calls('/auth/me')).toHaveLength(3);
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each([
    { source: 'POST 응답', beforePost: false },
    { source: '전송 전 CSRF', beforePost: true },
  ])('$source 429는 기한 안의 요청과 기한 뒤 자동 전송을 막는다', async ({ beforePost }) => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const { client, entry, replies, calls, logOut, setAccount } = setup();
    await entry.start();
    const visit = entry.getSnapshot();
    const limited = () => error(429, 'RATE_LIMITED', { 'Retry-After': '3' });
    if (beforePost) {
      client.expireIfCurrent(client.captureCurrentContext(), () => undefined);
      replies['/auth/csrf'] = limited;
    } else {
      replies['/auth/logout'] = limited;
    }

    await logOut();

    expect(entry.getSnapshot()).toMatchObject({ ...visit, logoutRetryAt: 4_000 });
    const csrfCount = beforePost ? 2 : 1;
    const postCount = beforePost ? 0 : 1;
    jest.setSystemTime(3_999);
    await logOut();
    expect(calls('/auth/csrf')).toHaveLength(csrfCount);
    expect(calls('/auth/logout')).toHaveLength(postCount);
    jest.setSystemTime(4_000);
    expect(calls('/auth/logout')).toHaveLength(postCount);
    replies['/auth/csrf'] = () => csrf();
    replies['/auth/logout'] = () => { setAccount(null); return signedOut(); };
    await logOut();
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(calls('/auth/logout')).toHaveLength(postCount + 1);
  });

  it('CSRF_INVALID 뒤 토큰 재발급 429도 재전송을 막고 잘못된 대기 값에는 임의 기한을 적용하지 않는다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const { entry, replies, calls, logOut, setAccount } = setup();
    await entry.start();
    replies['/auth/logout'] = () => error(403, 'CSRF_INVALID');
    replies['/auth/csrf'] = () => error(429, 'RATE_LIMITED', { 'Retry-After': '4' });

    await logOut();

    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/home', logoutRetryAt: 5_000 });
    jest.setSystemTime(4_999);
    await logOut();
    expect(calls('/auth/logout')).toHaveLength(1);
    expect(calls('/auth/csrf')).toHaveLength(2);
    jest.setSystemTime(5_000);
    replies['/auth/csrf'] = () => csrf();
    replies['/auth/logout'] = () => error(429, 'RATE_LIMITED', { 'Retry-After': '0.5' });
    await logOut();
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/home' });
    replies['/auth/logout'] = () => { setAccount(null); return signedOut(); };
    await logOut();
    expect(calls('/auth/logout')).toHaveLength(3);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
  });

  it('204 뒤 CSRF 429에서는 로그인 화면을 유지하고 사용자가 기한 후 토큰 조회만 재시도한다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const { entry, replies, calls, logOut } = setup();
    await entry.start();
    replies['/auth/csrf'] = () => error(429, 'RATE_LIMITED', { 'Retry-After': '3' });

    await logOut();

    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login', loginCsrfRecovery: true });
    await entry.retryLogoutCsrf();
    expect(calls('/auth/csrf')).toHaveLength(2);
    jest.setSystemTime(4_000);
    expect(calls('/auth/csrf')).toHaveLength(2);
    replies['/auth/csrf'] = () => csrf('signed-out-csrf');
    await entry.retryLogoutCsrf();
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(entry.getSnapshot()).not.toMatchObject({ loginCsrfRecovery: true });
    expect(calls('/auth/csrf')).toHaveLength(3);
    expect(calls('/auth/logout')).toHaveLength(1);
    expect(calls('/auth/me')).toHaveLength(1);
  });

  it('204 이후 사용자가 요청한 CSRF 조회의 429 대기 기한을 앱 복귀 뒤에도 지킨다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const { entry, replies, calls, logOut, setGeneration } = setup();
    await entry.start();
    replies['/auth/csrf'] = unavailable;
    await logOut();
    const requested = deferred<void>();
    const reply = deferred<Response>();
    replies['/auth/csrf'] = () => { requested.resolve(); return reply.promise; };
    const retry = entry.retryLogoutCsrf();
    await requested.promise;

    entry.suspend();
    setGeneration(-1);
    setGeneration(2);
    await entry.resume();
    reply.resolve(error(429, 'RATE_LIMITED', { 'Retry-After': '3' }));
    await retry;

    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login', loginCsrfRecovery: true, loginRetryAt: 4_000 });
    jest.setSystemTime(3_999);
    await entry.retryLogoutCsrf();
    expect(calls('/auth/csrf')).toHaveLength(3);
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each(['복귀 전', '복귀 후', '최근 앱 복귀 후'])('로그아웃 결과 불명이 %s 도착해도 계정을 한 번 재확인한다', async (timing) => {
    const { entry, replies, calls, logOut, setGeneration, setAccount } = setup();
    const postSeen = deferred<void>();
    const post = deferred<Response>();
    await entry.start();
    replies['/auth/logout'] = () => { postSeen.resolve(); return post.promise; };
    const submitted = logOut();
    await postSeen.promise;
    if (timing !== '최근 앱 복귀 후') entry.suspend();
    setGeneration(-1);
    setAccount(null);
    if (timing === '복귀 전') { post.resolve(unavailable()); await submitted; }

    setGeneration(2);
    const resumed = entry.resume();
    entry.reenterTask(2);
    if (timing !== '복귀 전') post.resolve(unavailable());
    await Promise.all([submitted, resumed]);

    entry.reenterTask(2);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login', generation: 2 });
    expect(calls('/auth/me')).toHaveLength(2);
    expect(calls('/auth/logout')).toHaveLength(1);
  });

  it.each([
    { reauth: '재로그인 전', next: undefined, end: '로그아웃' },
    { reauth: '재로그인 전', next: undefined, end: '만료' },
    { reauth: '같은 계정 재로그인 후', next: accountA, end: '로그아웃' },
    { reauth: '다른 계정 재로그인 후', next: accountB, end: '로그아웃' },
    { reauth: '같은 계정 재로그인 후', next: accountA, end: '만료' },
    { reauth: '다른 계정 재로그인 후', next: accountB, end: '만료' },
  ])('$end 뒤 $reauth 늦은 응답이 화면 상태를 바꾸지 않는다', async ({ next, end }) => {
    const { client, entry, replies, calls, logOut, setAccount, setNextAccount } = setup();
    await entry.start();
    const applied: string[] = [];
    let shown: string | undefined;
    entry.subscribe(() => {
      const snapshot = entry.getSnapshot();
      if (snapshot.kind === 'route' && snapshot.route === '/login') shown = undefined;
    });
    async function receiveValue(afterParse?: () => Promise<void>) {
      const result = await client.request({ method: 'GET', path: '/children' });
      if (result.kind !== 'response') throw new Error('Protected request did not receive headers');
      const parsed = await parseApiResponse(result.response, jsonExpectation);
      if (parsed.kind !== 'json' || typeof parsed.data !== 'string') throw new Error('Invalid synthetic value');
      const value = parsed.data;
      await afterParse?.();
      return client.commitIfCurrent(result.context, () => {
        shown = value;
        applied.push(value);
      });
    }
    replies['/children'] = () => json({ data: '이전 화면 값' });
    expect(await receiveValue()).toBe(true);
    const processed = deferred<void>();
    const releaseSuccess = deferred<void>();
    const oldValue = { data: '늦은 이전 화면 값' };
    const oldResponse = json(oldValue);
    if (!next) {
      jest.spyOn(oldResponse, 'text').mockImplementation(async () => {
        processed.resolve();
        await releaseSuccess.promise;
        return JSON.stringify(oldValue);
      });
    }
    replies['/children'] = () => oldResponse;
    const oldSuccess = receiveValue(next ? () => { processed.resolve(); return releaseSuccess.promise; } : undefined);
    await processed.promise;
    const denied = expired();
    const deniedCopy = denied.clone();
    const original = await denied.clone().text();
    const reading = deferred<void>();
    const releaseFailure = deferred<string>();
    jest.spyOn(denied, 'clone').mockReturnValue(deniedCopy);
    jest.spyOn(deniedCopy, 'text').mockImplementation(() => { reading.resolve(); return releaseFailure.promise; });
    replies['/children/previous'] = () => denied;
    const oldFailure = entry.receiveProtectedAuthResult(await client.request({ method: 'GET', path: '/children/previous' }));
    await reading.promise;

    if (end === '로그아웃') {
      await logOut();
      expect(calls('/auth/logout')).toHaveLength(1);
    } else {
      setAccount(null);
      expect(await entry.receiveProtectedAuthResult(await client.request({ method: 'GET', path: '/auth/me' }))).toBe(true);
    }
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/login' });
    expect(shown).toBeUndefined();
    if (next) {
      setNextAccount(next);
      await entry.submitLogin(next.email, 'fixture-password');
      expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: '/home' });
      const logins = calls('/auth/login');
      expect(logins).toHaveLength(1);
      expect(JSON.parse(String(logins[0][1].body))).toMatchObject({ email: next.email });
      replies['/children'] = () => json({ data: '새 화면 값' });
      expect(await receiveValue()).toBe(true);
    }

    releaseSuccess.resolve();
    releaseFailure.resolve(original);
    expect(await oldSuccess).toBe(false);
    expect(await oldFailure).toBe(false);
    expect(shown).toBe(next ? '새 화면 값' : undefined);
    expect(applied).toEqual(next ? ['이전 화면 값', '새 화면 값'] : ['이전 화면 값']);
    expect(entry.getSnapshot()).toMatchObject({ kind: 'route', route: next ? '/home' : '/login' });
  });
});

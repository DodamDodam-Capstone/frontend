import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiClient, type ApiFetch, type ApiResult, type AuthContext, type AuthOutcome } from './client';
import { createCsrfManager } from './csrf';
import { classifyRecovery } from './recovery';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const login = { method: 'POST', path: '/auth/login' } as const;
const logout = { method: 'POST', path: '/auth/logout' } as const;
const get = { method: 'GET', path: '/auth/me' } as const;
const post = { method: 'POST', path: '/guardian/lock' } as const;
const account = { id: '11111111-1111-4111-8111-111111111111', name: '시험 계정' };
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function csrf(token = 'synthetic-csrf') { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token }); }
function error(status = 401, code = 'AUTHENTICATION_REQUIRED') { return json({ error: { code, message: '시험 오류', requestId: '22222222-2222-4222-8222-222222222222', fields: [] } }, status); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function server() {
  let issued = 0;
  return jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? csrf(`synthetic-${++issued}`)
    : url.endsWith('/auth/logout') || url.endsWith('/guardian/lock') ? new Response(null, { status: 204 }) : json({ data: account }));
}
function client(send: ApiFetch = server()) {
  const configured = createApiClient(config, { fetchImpl: send });
  if (!configured.ok) throw new Error('Invalid synthetic configuration');
  return configured.value;
}
async function received(api: ApiClient) {
  const result = await api.request(get);
  if (result.kind !== 'response') throw new Error('Expected response');
  expect(result.context).toBeDefined();
  return result;
}
afterEach(() => { jest.restoreAllMocks(); });

describe('인증 문맥과 최종 동기 반영', () => {
  it('현재 응답의 문맥은 내용 없는 불변 객체이며 정상 결과를 반영한다', async () => {
    const api = client();
    const result = await received(api);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Reflect.ownKeys(result.context)).toEqual([]);
    expect(JSON.stringify(result.context)).toBe('{}');
    const parsed = await parseApiResponse(result.response, { kind: 'json', statuses: [200] });
    let state: unknown;
    expect(api.commitIfCurrent(result.context, () => { state = parsed; })).toBe(true);
    expect(state).toMatchObject({ kind: 'json', data: account });
  });

  it('다른 client·복사·임의·없는 문맥은 상태 반영과 만료를 허용하지 않는다', async () => {
    const api = client();
    const own = (await received(api)).context;
    const foreign = (await received(client())).context;
    const apply = jest.fn(() => undefined);
    const expired = jest.fn((_next: AuthContext) => undefined);
    for (const context of [foreign, { ...own } as AuthContext, {} as AuthContext, undefined]) {
      expect(api.isCurrentContext(context)).toBe(false);
      expect(api.commitIfCurrent(context, apply)).toBe(false);
      expect(api.expireIfCurrent(context, expired)).toBe(false);
    }
    expect(apply).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
    expect(api.isCurrentContext(own)).toBe(true);
  });

  it.each([false, true])('지연 본문 뒤 문맥 검사를 적용한다: 로그아웃=%s', async (transition) => {
    const body = deferred<string>();
    const response = json({ data: account });
    jest.spyOn(response, 'text').mockImplementation(() => body.promise);
    const normal = server();
    const send = jest.fn<ApiFetch>((url, init) => url.endsWith('/auth/me') ? Promise.resolve(response) : normal(url, init));
    const api = client(send);
    const result = await received(api);
    const reading = parseApiResponse(result.response, { kind: 'json', statuses: [200] });
    if (transition) expect((await api.authTransition(logout, () => 'changed')).outcome).toBe('changed');
    body.resolve(JSON.stringify({ data: account }));
    const parsed = await reading;
    let state: unknown = null;
    expect(api.commitIfCurrent(result.context, () => { state = parsed; })).toBe(!transition);
    expect(state).toEqual(transition ? null : parsed);
    expect(send.mock.calls.filter(([url]) => url.endsWith('/auth/me'))).toHaveLength(1);
  });

  it('파싱 후 추가 대기 중 같은 계정 재로그인도 이전 결과를 폐기한다', async () => {
    const api = client();
    const old = await received(api);
    const parsed = await parseApiResponse(old.response, { kind: 'json', statuses: [200] });
    const wait = deferred<void>();
    let state: unknown = 'new session';
    const pending = (async () => { await wait.promise; return api.commitIfCurrent(old.context, () => { state = parsed; }); })();
    const next = await api.authTransition(login, () => 'changed');
    expect(next.operation.kind).toBe('response');
    if (next.operation.kind === 'response') expect((await next.operation.response.json()).data).toEqual(account);
    expect(api.isCurrentContext(next.context)).toBe(true);
    wait.resolve();
    expect(await pending).toBe(false);
    expect(state).toBe('new session');
  });

  it('CSRF 준비만으로 현재 인증 문맥을 무효화하지 않는다', async () => {
    const api = client();
    const result = await received(api);
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(api.isCurrentContext(result.context)).toBe(true);
  });
});

describe('인증 전환 소유 문맥과 gate', () => {
  it('헤더 drain 시작 즉시 이전 문맥을 막고 전환 중 외부 만료를 거절한다', async () => {
    const held = deferred<Response>();
    const normal = server();
    const send = jest.fn<ApiFetch>((url, init) => url.endsWith('/old') ? held.promise : normal(url, init));
    const api = client(send);
    const old = await received(api);
    const inFlight = api.request({ method: 'GET', path: '/old' });
    const transition = api.authTransition(logout, () => 'changed');
    const callback = jest.fn(() => undefined);
    expect(api.isCurrentContext(old.context)).toBe(false);
    expect(api.commitIfCurrent(old.context, callback)).toBe(false);
    expect(api.expireIfCurrent(old.context, callback)).toBe(false);
    held.resolve(json({ data: account }));
    const stale = await inFlight;
    expect(stale).toEqual({ kind: 'stale_response' });
    expect(stale).not.toHaveProperty('context');
    const next = await transition;
    expect(api.isCurrentContext(next.context)).toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each<AuthOutcome>(['changed', 'unchanged', 'csrf_invalid', 'unknown'])('전환 %s 결과는 시작 시 만든 새 문맥을 반환한다', async (outcome) => {
    const api = client();
    const old = await received(api);
    const result = await api.authTransition(login, () => {
      expect(api.isCurrentContext(old.context)).toBe(false);
      return outcome;
    });
    expect(result.outcome).toBe(outcome);
    expect(result.context).toBeDefined();
    expect(result.context).not.toBe(old.context);
    expect(api.isCurrentContext(result.context)).toBe(true);
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind === 'response') expect(result.operation.context).toBe(result.context);
    expect(result.refresh).toEqual(outcome === 'changed' || outcome === 'csrf_invalid' ? { ok: true } : undefined);
  });

  it('인증 성공+CSRF 갱신503 실패에도 전환 문맥과 인증 결과를 보존한다', async () => {
    let issued = 0;
    const api = client(async (url) => url.endsWith('/auth/csrf') ? (++issued === 1 ? csrf() : error(503, 'AUTH_STATE_UNAVAILABLE')) : json({ data: account }));
    const result = await api.authTransition(login, () => 'changed');
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toMatchObject({ ok: false, reason: 'http', status: 503 });
    expect(api.isCurrentContext(result.context)).toBe(true);
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind === 'response') expect(result.operation.context).toBe(result.context);
  });

  it('전환 시작 전 거절에는 문맥을 주지 않고 기존 문맥을 유지한다', async () => {
    const api = client();
    const old = await received(api);
    const abort = new AbortController(); abort.abort();
    const result = await api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    expect(result).toEqual({ operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' });
    expect(api.isCurrentContext(old.context)).toBe(true);
    expect(await api.request({ ...get, signal: abort.signal })).not.toHaveProperty('context');
  });

  it('CSRF 대기 중 취소는 상위 전환 문맥만 유지하고 이전 문맥을 되살리지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const api = client(async (url) => { if (url.endsWith('/auth/csrf')) { started.resolve(); return held.promise; } return json({ data: account }); });
    const old = await received(api);
    const abort = new AbortController();
    const pending = api.authTransition({ ...login, signal: abort.signal }, () => 'changed');
    await started.promise; abort.abort();
    const result = await pending;
    expect(result.operation).toEqual({ kind: 'not_sent', reason: 'cancelled' });
    expect(result.outcome).toBe('not_attempted');
    expect(api.isCurrentContext(old.context)).toBe(false);
    expect(api.isCurrentContext(result.context)).toBe(true);
    held.resolve(csrf());
    await api.prepareCsrf();
  });

  it('늦은 통신 오류도 요청 시작 문맥으로 반환해 새 세션 상태를 덮어쓰지 못한다', async () => {
    const held = deferred<Response>(); const normal = server();
    const api = client((url, init) => url.endsWith('/old') ? held.promise : normal(url, init));
    const pending = api.request({ method: 'GET', path: '/old' });
    const transition = api.authTransition(login, () => 'changed');
    held.reject(new Error('synthetic-private'));
    const result = await pending;
    expect(result.kind).toBe('transport_error');
    if (result.kind !== 'transport_error') throw new Error('Expected transport error');
    expect(result.context).toBeDefined();
    await transition;
    const apply = jest.fn(() => undefined);
    expect(api.commitIfCurrent(result.context, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('조건부 인증 만료', () => {
  it('같은 세대의 동시 오류는 한 번만 무효화·통지하고 다음 문맥을 전달한다', async () => {
    const api = client();
    const [a, b] = await Promise.all([received(api), received(api)]);
    const notified: AuthContext[] = [];
    expect(api.expireIfCurrent(a.context, (next) => {
      expect(api.isCurrentContext(a.context)).toBe(false);
      expect(api.isCurrentContext(next)).toBe(true);
      notified.push(next);
    })).toBe(true);
    expect(api.expireIfCurrent(b.context, (next) => { notified.push(next); })).toBe(false);
    expect(api.expireIfCurrent(a.context, (next) => { notified.push(next); })).toBe(false);
    expect(notified).toHaveLength(1);
  });

  it('재로그인 뒤 이전401은 새 로그인·CSRF를 무효화하지 않는다', async () => {
    const normal = server();
    const send = jest.fn<ApiFetch>((url, init) => url.endsWith('/auth/me') ? Promise.resolve(error()) : normal(url, init));
    const api = client(send);
    const old = await received(api);
    const next = await api.authTransition(login, () => 'changed');
    const parsed = await parseApiResponse(old.response, { kind: 'json', statuses: [200] });
    expect(classifyRecovery(parsed, 'general').kind).toBe('authentication_required');
    const notify = jest.fn(() => undefined);
    expect(api.expireIfCurrent(old.context, notify)).toBe(false);
    expect(api.isCurrentContext(next.context)).toBe(true);
    const issued = send.mock.calls.filter(([url]) => url.endsWith('/auth/csrf')).length;
    await api.request(post);
    expect(send.mock.calls.filter(([url]) => url.endsWith('/auth/csrf'))).toHaveLength(issued);
    expect(notify).not.toHaveBeenCalled();
  });

  it('만료 후 비동기 정리는 next 문맥으로 최종 검사하여 새 로그인을 보호한다', async () => {
    const api = client(); const old = await received(api); const wait = deferred<void>();
    let state = 'signed in'; let cleanup!: Promise<boolean>;
    expect(api.expireIfCurrent(old.context, (next) => {
      state = 'expired';
      cleanup = (async () => { await wait.promise; return api.commitIfCurrent(next, () => { state = 'cleanup applied'; }); })();
    })).toBe(true);
    const loggedIn = await api.authTransition(login, () => 'changed');
    api.commitIfCurrent(loggedIn.context, () => { state = 'new login'; });
    wait.resolve();
    expect(await cleanup).toBe(false);
    expect(state).toBe('new login');
  });

  it('만료 통지가 예외를 던져도 세대·CSRF를 이전 상태로 복구하지 않는다', async () => {
    const send = server(); const api = client(send); const old = await received(api);
    await api.prepareCsrf();
    expect(() => api.expireIfCurrent(old.context, () => { throw new Error('receiver failed'); })).toThrow('receiver failed');
    expect(api.isCurrentContext(old.context)).toBe(false);
    await api.request(post);
    expect(send.mock.calls.filter(([url]) => url.endsWith('/auth/csrf'))).toHaveLength(2);
    expect(new Headers(send.mock.calls.at(-1)![1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-2');
  });

  it('발급 본문 지연 중 만료되면 옛 토큰을 저장하거나 대기 중 POST를 보내지 않는다', async () => {
    const body = deferred<unknown>(); const started = deferred<void>();
    const response = csrf('synthetic-old');
    jest.spyOn(response, 'json').mockImplementation(() => { started.resolve(); return body.promise; });
    let issued = 0;
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? (++issued === 1 ? response : csrf('synthetic-new')) : json({ data: account }));
    const api = client(send); const old = await received(api);
    const waiting = api.request(post);
    await started.promise;
    expect(api.expireIfCurrent(old.context, () => undefined)).toBe(true);
    const preparation = api.prepareCsrf();
    body.resolve({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-old' });
    expect(await waiting).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    expect(await preparation).toEqual({ ok: false, reason: 'invalidated' });
    expect(send.mock.calls.filter(([url]) => url.endsWith('/guardian/lock'))).toHaveLength(0);
    await api.request(post);
    expect(issued).toBe(2);
    expect(new Headers(send.mock.calls.at(-1)![1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-new');
  });
});

it('CSRF 무효화는 pending drain을 유지하면서 늦은 준비 성공·토큰 복원을 거절한다', async () => {
  const body = deferred<unknown>(); const started = deferred<void>();
  const response = csrf();
  jest.spyOn(response, 'json').mockImplementation(() => { started.resolve(); return body.promise; });
  const manager = createCsrfManager(async () => response, `${config.apiBaseUrl}/auth/csrf`);
  const pending = manager.prepare(); await started.promise;
  manager.invalidate();
  expect(manager.settlePending()).toBe(pending);
  body.resolve({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-old' });
  expect(await pending).toEqual({ ok: false, reason: 'invalidated' });
  expect(manager.token()).toBeUndefined();
});

// tsc가 검사하는 사용 계약이다. 오류가 예정된 호출은 런타임에 실행하지 않는다.
export function checkAuthContextTypes(api: ApiClient, context: AuthContext, result: ApiResult) {
  // @ts-expect-error 상태 반영 callback은 Promise를 반환할 수 없다.
  api.commitIfCurrent(context, async () => {});
  // @ts-expect-error 만료 통지 callback은 Promise를 반환할 수 없다.
  api.expireIfCurrent(context, async () => {});
  // @ts-expect-error 호출자가 인증 문맥을 만들 수 없다.
  api.isCurrentContext({});
  if (result.kind === 'response') {
    // @ts-expect-error 응답의 문맥 참조는 읽기 전용이다.
    result.context = context;
  }
}

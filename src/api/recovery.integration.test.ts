import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiClient, type ApiFetch, type ApiRequest, type AuthContext, type CsrfRecoveryResult } from './client';
import { classifyRecovery, readCsrfFailure } from './recovery';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '33333333-3333-4333-8333-333333333333';
const requestId = '22222222-2222-4222-8222-222222222222';
const get = { method: 'GET', path: '/auth/me' } as const;
const post = { method: 'POST', path: '/guardian/lock' } as const;
const account = (accountId = accountA) => ({ accountId, email: 'guardian@example.com', childId: null, hasPin: false, guardianUnlockedUntil: null });
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } });
}
function errorBody(code: string) { return { error: { code, message: '합성 시험 오류', requestId, fields: [] } }; }
function error(status: number, code: string) { return json(errorBody(code), status); }
function csrf() { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function delayed(body: unknown, status = 200) {
  const ready = deferred<void>(); const released = deferred<string>();
  const response = json(body, status);
  jest.spyOn(response, 'text').mockImplementation(() => { ready.resolve(); return released.promise; });
  return { response, ready: ready.promise, release: () => released.resolve(JSON.stringify(body)) };
}
function fixture(reply: () => Response, issue: () => Response = csrf) {
  let loginAccount = accountA;
  const send = jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/auth/csrf')) return issue();
    if (url.endsWith('/auth/login')) return json({ data: account(loginAccount) });
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    return reply();
  });
  const configured = createApiClient(config, { fetchImpl: send });
  if (!configured.ok) throw new Error('Invalid synthetic configuration');
  const api = configured.value;
  const receiver = consumer(api);
  async function transition(nextAccount: string | null) {
    loginAccount = nextAccount ?? accountA;
    const expectation = nextAccount === null ? { kind: 'empty', statuses: [204] } as const : { kind: 'json', statuses: [200] } as const;
    const result = await api.authTransition({ method: 'POST', path: nextAccount === null ? '/auth/logout' : '/auth/login' }, async (response) => {
      const parsed = await parseApiResponse(response, expectation);
      return parsed.kind === 'empty' || (parsed.kind === 'json' && (parsed.data as { accountId: string }).accountId === nextAccount) ? 'changed' : 'unknown';
    });
    expect(result.outcome).toBe('changed');
    expect(result.refresh).toEqual({ ok: true });
    expect(api.commitIfCurrent(result.context, () => { receiver.state.accountId = nextAccount; })).toBe(true);
  }
  const count = (path: string) => send.mock.calls.filter(([url]) => url.endsWith(path)).length;
  return { api, receiver, send, transition, count };
}

// 실제 화면/store가 아닌 173/174에 인계할 최종 await 뒤 동기 반영의 최소 테스트 수신자다.
// 분류·파서·문맥·복구는 제품 구현을 사용하고 fetch의 합성 응답만 주입한다.
function consumer(api: ApiClient) {
  const state = { accountId: null as string | null, effects: [] as string[], expirations: 0 };
  async function receive(request: ApiRequest, options: { afterParse?: () => Promise<void>; onExpired?: (next: AuthContext) => undefined } = {}) {
    const received = await api.request(request);
    if (received.kind !== 'response') throw new Error('Expected response');
    const { context } = received;
    const parsed = await parseApiResponse(received.response, { kind: 'json', statuses: [200] });
    const decision = classifyRecovery(parsed, 'general');
    await options.afterParse?.();
    function expire() {
      return api.expireIfCurrent(context, (next) => {
        state.accountId = null;
        state.expirations += 1;
        state.effects.push('authentication_required');
        options.onExpired?.(next);
      });
    }
    if (decision.kind === 'authentication_required') return { applied: expire(), decision };
    let recovery: CsrfRecoveryResult | undefined;
    let effect = decision.kind;
    if (decision.kind === 'csrf_invalid') {
      recovery = await api.recoverCsrf(context);
      if (recovery.kind === 'failed') {
        const failure = await readCsrfFailure(recovery.failure);
        if (failure) {
          const recoveryDecision = classifyRecovery(failure, 'general');
          if (recoveryDecision.kind === 'authentication_required') return { applied: expire(), decision, recovery };
          effect = recoveryDecision.kind;
        }
      }
    }
    const applied = api.commitIfCurrent(context, () => {
      state.effects.push(effect);
      if (parsed.kind === 'json') state.accountId = (parsed.data as { accountId: string }).accountId;
    });
    return { applied, decision, recovery };
  }
  return { state, receive };
}
afterEach(() => { jest.restoreAllMocks(); });

const lateCases = [
  { name: '성공', body: { data: account() }, status: 200, request: get },
  { name: '401 인증 만료', body: errorBody('AUTHENTICATION_REQUIRED'), status: 401, request: get },
  { name: '403 CSRF 오류', body: errorBody('CSRF_INVALID'), status: 403, request: post },
];

describe('요청→본문→복구 분류→최종 상태 반영', () => {
  it.each(lateCases.flatMap((test) => [null, accountA, accountB].map((nextAccount) => ({ ...test, nextAccount }))))(
    '로그아웃 후 $nextAccount 상태에서 이전 $name 본문이 상태·CSRF를 바꾸지 않는다', async (test) => {
      const { nextAccount } = test;
      const held = delayed(test.body, test.status);
      const { api, receiver, transition, count } = fixture(() => held.response);
      await transition(accountA);
      const pending = receiver.receive(test.request);
      await held.ready;
      await transition(null);
      if (nextAccount !== null) await transition(nextAccount);
      const issued = count('/auth/csrf');
      expect(issued).toBe(nextAccount === null ? 3 : 4);
      held.release();
      const result = await pending;
      expect(result.applied).toBe(false);
      expect(receiver.state).toEqual({ accountId: nextAccount, effects: [], expirations: 0 });
      expect(count(test.request.path)).toBe(1);
      expect(count('/auth/csrf')).toBe(issued);
      expect(await api.prepareCsrf()).toEqual({ ok: true });
      expect(count('/auth/csrf')).toBe(issued);
    },
  );

  it.each(lateCases)('파싱 완료 후 추가 await 중 재로그인해도 $name 결과를 반영하지 않는다', async (test) => {
    const { receiver, transition, count } = fixture(() => json(test.body, test.status));
    await transition(accountA);
    const parsed = deferred<void>(); const released = deferred<void>();
    const pending = receiver.receive(test.request, { afterParse: () => { parsed.resolve(); return released.promise; } });
    await parsed.promise;
    await transition(accountB);
    const issued = count('/auth/csrf');
    released.resolve();
    expect((await pending).applied).toBe(false);
    expect(receiver.state).toEqual({ accountId: accountB, effects: [], expirations: 0 });
    expect(count('/auth/csrf')).toBe(issued);
    expect(count(test.request.path)).toBe(1);
  });

  it('현재 문맥의 정상 결과는 반영된다', async () => {
    const { receiver, transition, count } = fixture(() => json({ data: account() }));
    await transition(accountA);
    receiver.state.accountId = null;
    expect((await receiver.receive(get)).applied).toBe(true);
    expect(receiver.state).toEqual({ accountId: accountA, effects: ['none'], expirations: 0 });
    expect(count('/auth/me')).toBe(1);
    expect(count('/auth/csrf')).toBe(2);
  });

  it('동시401은 한 번만 만료·통지하고 원래 POST를 재실행하지 않는다', async () => {
    const { receiver, transition, count } = fixture(() => error(401, 'AUTHENTICATION_REQUIRED'));
    await transition(accountA);
    const results = await Promise.all([receiver.receive(post), receiver.receive(post)]);
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(receiver.state).toEqual({ accountId: null, effects: ['authentication_required'], expirations: 1 });
    expect(count('/guardian/lock')).toBe(2);
    expect(count('/auth/csrf')).toBe(2);
  });

  it('만료 통지의 비동기 정리가 끝날 때 새 로그인을 덮어쓰지 않는다', async () => {
    const { api, receiver, transition, count } = fixture(() => error(401, 'AUTHENTICATION_REQUIRED'));
    await transition(accountA);
    const released = deferred<void>();
    let cleanup!: Promise<boolean>;
    const result = await receiver.receive(get, { onExpired: (next) => {
      cleanup = (async () => {
        await released.promise;
        return api.commitIfCurrent(next, () => { receiver.state.accountId = null; receiver.state.effects.push('cleanup'); });
      })();
    } });
    expect(result.applied).toBe(true);
    await transition(accountB);
    released.resolve();
    expect(await cleanup).toBe(false);
    expect(receiver.state).toEqual({ accountId: accountB, effects: ['authentication_required'], expirations: 1 });
    expect(count('/auth/me')).toBe(1);
    expect(count('/auth/csrf')).toBe(4);
  });

  it('같은 버전의 두403은 복구1회로 연결되고 로그인 유지·원래POST2회를 보존한다', async () => {
    const { receiver, transition, count } = fixture(() => error(403, 'CSRF_INVALID'));
    await transition(accountA);
    const results = await Promise.all([receiver.receive(post), receiver.receive(post)]);
    expect(results.map((result) => result.recovery?.kind).sort()).toEqual(['already_recovered', 'refreshed']);
    expect(results.every((result) => result.applied)).toBe(true);
    expect(receiver.state).toEqual({ accountId: accountA, effects: ['csrf_invalid', 'csrf_invalid'], expirations: 0 });
    expect(count('/auth/csrf')).toBe(3);
    expect(count('/guardian/lock')).toBe(2);
  });

  it.each<[number, string, string]>([
    [403, 'GUARDIAN_UNLOCK_REQUIRED', 'guardian_unlock_required'],
    [403, 'PIN_SETUP_AUTHORIZATION_REQUIRED', 'pin_setup_authorization_required'],
    [403, 'PIN_RESET_AUTHORIZATION_REQUIRED', 'pin_reset_authorization_required'],
    [503, 'AUTH_STATE_UNAVAILABLE', 'auth_state_unavailable'],
    [503, 'EMAIL_DELIVERY_UNAVAILABLE', 'email_delivery_unavailable'],
    [401, 'LOGIN_FAILED', 'unclassified'],
    [401, 'CSRF_INVALID', 'unclassified'],
    [403, 'AUTHENTICATION_REQUIRED', 'unclassified'],
    [429, 'RATE_LIMITED', 'rate_limited'],
  ])('%s %s는 전역 만료나 자동 복구·POST 재실행으로 확대하지 않는다', async (status, code, kind) => {
    const { receiver, transition, count } = fixture(() => error(status, code));
    await transition(accountA);
    const result = await receiver.receive(post);
    expect(result.decision.kind).toBe(kind);
    expect(result.applied).toBe(true);
    expect(receiver.state).toEqual({ accountId: accountA, effects: [kind], expirations: 0 });
    expect(count('/auth/csrf')).toBe(2);
    expect(count('/guardian/lock')).toBe(1);
  });

  it.each([false, true])('CSRF 복구 실패 본문의401은 마지막 await 뒤 현재 문맥에서만 만료한다: 재로그인=%s', async (relogin) => {
    const held = delayed(errorBody('AUTHENTICATION_REQUIRED'), 401);
    let issued = 0;
    const { receiver, transition, count } = fixture(() => error(403, 'CSRF_INVALID'), () => ++issued === 3 ? held.response : csrf());
    await transition(accountA);
    const pending = receiver.receive(post);
    await held.ready;
    if (relogin) { await transition(null); await transition(accountB); }
    const issuedBeforeBody = count('/auth/csrf');
    held.release();
    const result = await pending;
    expect(result.recovery?.kind).toBe('failed');
    expect(result.applied).toBe(!relogin);
    expect(receiver.state).toEqual(relogin
      ? { accountId: accountB, effects: [], expirations: 0 }
      : { accountId: null, effects: ['authentication_required'], expirations: 1 });
    expect(count('/auth/csrf')).toBe(issuedBeforeBody);
    expect(count('/guardian/lock')).toBe(1);
  });
});

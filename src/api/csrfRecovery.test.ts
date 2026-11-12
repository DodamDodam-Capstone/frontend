import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiClient, type ApiFetch, type ApiResult, type AuthContext } from './client';
import { classifyRecovery, readCsrfFailure } from './recovery';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const post = { method: 'POST', path: '/guardian/lock' } as const;
const logout = { method: 'POST', path: '/auth/logout' } as const;
const requestId = '22222222-2222-4222-8222-222222222222';
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function csrf(token: string) { return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token }); }
function error(status = 403, code = 'CSRF_INVALID') {
  return json({ error: { code, message: '시험 오류', requestId, fields: [] } }, status);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function client(send: ApiFetch): ApiClient {
  const result = createApiClient(config, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return result.value;
}
function response(result: ApiResult) {
  if (result.kind !== 'response') throw new Error('Expected response');
  return result;
}
async function failedPost(api: ApiClient, path: string = post.path) {
  const result = response(await api.request({ ...post, path }));
  const parsed = await parseApiResponse(result.response, { kind: 'empty', statuses: [204] });
  expect(classifyRecovery(parsed, 'general').kind).toBe('csrf_invalid');
  return result;
}
function server(reissue?: (nth: number) => Response | Promise<Response>) {
  let issued = 0;
  const send = jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/auth/csrf')) { issued += 1; return reissue?.(issued) ?? csrf(`synthetic-${issued}`); }
    if (url.endsWith('/auth/logout') || url.endsWith('/success')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/me')) return json({ data: { synthetic: true } });
    return error();
  });
  return { send, issued: () => issued };
}
function count(send: ReturnType<typeof server>['send'], path: string) {
  return send.mock.calls.filter(([url]) => url.endsWith(path)).length;
}
function sentToken(send: ReturnType<typeof server>['send'], path: string) {
  const call = send.mock.calls.filter(([url]) => url.endsWith(path)).at(-1);
  return call ? new Headers(call[1].headers).get('X-XSRF-TOKEN') : null;
}
afterEach(() => { jest.restoreAllMocks(); });

describe('일반 POST의 CSRF 복구 자격과 실제 토큰', () => {
  it('분류한 CSRF 오류만 복구하고 원래 POST를 재실행하지 않는다', async () => {
    const { send, issued } = server(); const api = client(send);
    const result = await failedPost(api);
    expect(await api.recoverCsrf(result.context)).toEqual({ kind: 'refreshed' });
    expect(issued()).toBe(2);
    expect(count(send, post.path)).toBe(1);
    expect(api.isCurrentContext(result.context)).toBe(true);
    expect(JSON.stringify(result.context)).toBe('{}');
    await api.request({ ...post, path: '/success' });
    expect(sentToken(send, '/success')).toBe('synthetic-2');
    expect(issued()).toBe(2);
  });

  it('GET 문맥에는 전송 토큰이 없어 복구를 시작하지 않는다', async () => {
    const { send, issued } = server(); const api = client(send);
    await api.prepareCsrf();
    const result = response(await api.request({ method: 'GET', path: '/auth/me' }));
    expect(await api.recoverCsrf(result.context)).toMatchObject({ kind: 'skipped' });
    expect(issued()).toBe(1);
  });

  it('다른 client·복사·임의·없는 문맥은 복구 발급 없이 거절한다', async () => {
    const { send, issued } = server(); const api = client(send);
    const own = (await failedPost(api)).context;
    const foreign = (await failedPost(client(server().send))).context;
    for (const context of [foreign, { ...own } as AuthContext, {} as AuthContext, undefined]) {
      expect(await api.recoverCsrf(context)).toMatchObject({ kind: 'skipped' });
    }
    expect(issued()).toBe(1);
  });

  it('인증 전환의 상위 문맥과 operation 문맥은 일반 복구에 사용하지 않는다', async () => {
    const { send, issued } = server(); const api = client(send);
    const transition = await api.authTransition(logout, () => 'changed');
    expect(transition.refresh).toEqual({ ok: true });
    const before = issued();
    expect(await api.recoverCsrf(transition.context)).toMatchObject({ kind: 'skipped' });
    expect(await api.recoverCsrf(response(transition.operation).context)).toMatchObject({ kind: 'skipped' });
    expect(issued()).toBe(before);
    expect(count(send, '/auth/logout')).toBe(1);
  });

  it('초기 준비 실패로 전송되지 않은 POST는 복구 권한을 만들지 않는다', async () => {
    const { send, issued } = server(() => error(503, 'AUTH_STATE_UNAVAILABLE')); const api = client(send);
    expect(await api.request(post)).toMatchObject({ kind: 'not_sent', reason: 'csrf_unavailable' });
    expect(await api.recoverCsrf(undefined)).toMatchObject({ kind: 'skipped' });
    expect(count(send, post.path)).toBe(0);
    expect(issued()).toBe(1);
  });

  it('이미 복구된 이전 응답은 새 토큰을 지우거나 재발급하지 않는다', async () => {
    const { send, issued } = server(); const api = client(send);
    const [a, b] = await Promise.all([failedPost(api), failedPost(api)]);
    expect(await api.recoverCsrf(a.context)).toEqual({ kind: 'refreshed' });
    expect(await api.recoverCsrf(b.context)).toEqual({ kind: 'already_recovered' });
    expect(await api.recoverCsrf(a.context)).toEqual({ kind: 'already_recovered' });
    await api.request({ ...post, path: '/success' });
    expect(sentToken(send, '/success')).toBe('synthetic-2');
    expect(issued()).toBe(2);
    expect(count(send, post.path)).toBe(2);
  });

  it('재발급 문자열이 같아도 새 발급 토큰의 오류는 별도로 복구한다', async () => {
    const { send, issued } = server(() => csrf('synthetic-same-value')); const api = client(send);
    const first = await failedPost(api);
    expect(await api.recoverCsrf(first.context)).toEqual({ kind: 'refreshed' });
    const second = await failedPost(api);
    expect(await api.recoverCsrf(second.context)).toEqual({ kind: 'refreshed' });
    expect(issued()).toBe(3);
    expect(count(send, post.path)).toBe(2);
  });
});

describe('공유 복구와 실패 결과 재사용', () => {
  it('같은 토큰의 동시 복구는 발급 하나를 공유한다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send, issued } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const [a, b] = await Promise.all([failedPost(api), failedPost(api)]);
    const first = api.recoverCsrf(a.context); const second = api.recoverCsrf(b.context);
    await started.promise;
    expect(issued()).toBe(2);
    held.resolve(csrf('synthetic-2'));
    const results = await Promise.all([first, second]);
    expect(results.every((result) => ['refreshed', 'already_recovered'].includes(result.kind))).toBe(true);
    expect(issued()).toBe(2);
    expect(count(send, post.path)).toBe(2);
  });

  it('갱신 실패 뒤 같은·다른 요청의 늦은 오류도 원본 실패를 공유하며 본문은 한 번 읽는다', async () => {
    const failure = error(429, 'RATE_LIMITED'); const text = jest.spyOn(failure, 'text');
    const { send, issued } = server((nth) => nth === 1 ? csrf('synthetic-1') : failure);
    const api = client(send); const [a, b] = await Promise.all([failedPost(api), failedPost(api)]);
    const first = await api.recoverCsrf(a.context);
    const repeat = await api.recoverCsrf(a.context); const late = await api.recoverCsrf(b.context);
    expect(first).toMatchObject({ kind: 'failed', failure: { reason: 'http', status: 429 } });
    if (first.kind !== 'failed' || repeat.kind !== 'failed' || late.kind !== 'failed') throw new Error('Expected shared failure');
    expect(repeat.failure).toBe(first.failure); expect(late.failure).toBe(first.failure);
    expect(text).not.toHaveBeenCalled();
    const [parsed, same] = await Promise.all([readCsrfFailure(first.failure), readCsrfFailure(late.failure)]);
    expect(same).toBe(parsed);
    expect(parsed).toMatchObject({ kind: 'http_error', error: { code: 'RATE_LIMITED', fields: [], requestId } });
    expect(text).toHaveBeenCalledTimes(1);
    expect(issued()).toBe(2); expect(count(send, post.path)).toBe(2);
  });

  it.each(['network', 'invalid_response'] as const)('%s 복구 실패를 반복 처리해도 자동 재발급하지 않는다', async (reason) => {
    const { send, issued } = server((nth) => {
      if (nth === 1) return csrf('synthetic-1');
      if (reason === 'network') throw new Error('synthetic-private');
      return json({ token: 'synthetic-invalid' });
    });
    const api = client(send); const old = await failedPost(api);
    const first = await api.recoverCsrf(old.context);
    expect(first).toMatchObject({ kind: 'failed', failure: { ok: false, reason } });
    expect(await api.recoverCsrf(old.context)).toEqual(first);
    expect(issued()).toBe(2); expect(count(send, post.path)).toBe(1);
    expect(JSON.stringify(first)).not.toContain('synthetic-private');
  });

  it('복구했던 토큰이 다시 무효화되고 갱신 실패하면 옛 성공 기록을 준비 성공으로 쓰지 않는다', async () => {
    const { send, issued } = server((nth) => nth === 3 ? error(503, 'AUTH_STATE_UNAVAILABLE') : csrf(`synthetic-${nth}`));
    const api = client(send); const first = await failedPost(api);
    expect(await api.recoverCsrf(first.context)).toEqual({ kind: 'refreshed' });
    const second = await failedPost(api);
    expect(await api.recoverCsrf(second.context)).toMatchObject({ kind: 'failed' });
    const oldSuccess = await api.recoverCsrf(first.context);
    expect(['refreshed', 'already_recovered']).not.toContain(oldSuccess.kind);
    expect(issued()).toBe(3); expect(count(send, post.path)).toBe(2);
  });

  it('복구 실패의 오류 본문을 읽는 대기가 로그아웃을 붙잡지 않는다', async () => {
    const body = deferred<string>(); const failure = error(503, 'AUTH_STATE_UNAVAILABLE');
    jest.spyOn(failure, 'text').mockImplementation(() => body.promise);
    const { send } = server((nth) => nth === 2 ? failure : csrf(`synthetic-${nth}`));
    const api = client(send); const old = await failedPost(api); const result = await api.recoverCsrf(old.context);
    if (result.kind !== 'failed') throw new Error('Expected HTTP failure');
    const reading = readCsrfFailure(result.failure);
    try {
      expect((await api.authTransition(logout, () => 'changed')).outcome).toBe('changed');
      expect(count(send, '/auth/logout')).toBe(1);
    } finally {
      body.resolve(JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: '시험 오류', requestId } }));
    }
    expect(await reading).toMatchObject({ kind: 'http_error' });
  }, 1500);
});

describe('복구 중 새 POST와 인증 전환', () => {
  it('캐시된 준비를 기다리기 시작한 직후 복구가 시작돼도 새 POST는 갱신 토큰으로 한 번 전송한다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send, issued } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const old = await failedPost(api);
    // prepare()의 즉시 성공 Promise를 기다리는 사이 복구가 기존 토큰을 무효화한다.
    const incoming = api.request({ ...post, path: '/success' });
    const recovering = api.recoverCsrf(old.context);
    await started.promise;
    expect(count(send, '/success')).toBe(0);
    held.resolve(csrf('synthetic-2'));
    expect(await recovering).toEqual({ kind: 'refreshed' });
    expect((await incoming).kind).toBe('response');
    expect(sentToken(send, '/success')).toBe('synthetic-2');
    expect(count(send, '/success')).toBe(1); expect(issued()).toBe(2);
  });

  it.each([true, false])('명시적 준비도 진행 중 복구 발급을 공유한다: 성공=%s', async (success) => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send, issued } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const old = await failedPost(api);
    const recovering = api.recoverCsrf(old.context); await started.promise;
    const preparation = api.prepareCsrf();
    held.resolve(success ? csrf('synthetic-2') : error(503, 'AUTH_STATE_UNAVAILABLE'));
    const [recovered, prepared] = await Promise.all([recovering, preparation]);
    if (success) {
      expect(recovered).toEqual({ kind: 'refreshed' }); expect(prepared).toEqual({ ok: true });
    } else {
      expect(recovered).toMatchObject({ kind: 'failed', failure: { reason: 'http', status: 503 } });
      if (recovered.kind !== 'failed') throw new Error('Expected shared recovery failure');
      expect(prepared).toBe(recovered.failure);
    }
    expect(issued()).toBe(2); expect(count(send, post.path)).toBe(1);
  });

  it('실패 후 명시적 준비와 새 요청은 다시 진행하되 옛 실패 처리로 추가 발급하지 않는다', async () => {
    const { send, issued } = server((nth) => nth === 2 ? error(503, 'AUTH_STATE_UNAVAILABLE') : csrf(`synthetic-${nth}`));
    const api = client(send); const old = await failedPost(api);
    const failed = await api.recoverCsrf(old.context);
    expect(failed.kind).toBe('failed');
    expect(await api.prepareCsrf()).toEqual({ ok: true });
    expect(issued()).toBe(3);
    expect(await api.recoverCsrf(old.context)).toEqual(failed);
    expect(issued()).toBe(3);
    const current = await failedPost(api, '/second');
    expect(sentToken(send, '/second')).toBe('synthetic-3');
    expect(await api.recoverCsrf(current.context)).toEqual({ kind: 'refreshed' });
    expect(await api.recoverCsrf(old.context)).toEqual(failed);
    expect(issued()).toBe(4); expect(count(send, post.path)).toBe(1); expect(count(send, '/second')).toBe(1);
  });

  it('복구를 기다린 새 POST는 실제 사용한 새 토큰 버전으로 다음 오류를 복구한다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send, issued } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const first = await failedPost(api);
    const recovering = api.recoverCsrf(first.context); await started.promise;
    const incoming = failedPost(api, '/second');
    held.resolve(csrf('synthetic-2'));
    expect(await recovering).toEqual({ kind: 'refreshed' });
    const second = await incoming;
    expect(sentToken(send, '/second')).toBe('synthetic-2');
    expect(await api.recoverCsrf(second.context)).toEqual({ kind: 'refreshed' });
    expect(issued()).toBe(3); expect(count(send, '/second')).toBe(1);
  });

  it('기존 응답 헤더 대기와 새 POST의 복구 대기를 분리해 교착하지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>(); const events: string[] = [];
    const normal = server((nth) => { events.push(`csrf${nth}`); return csrf(`synthetic-${nth}`); });
    const send = jest.fn<ApiFetch>((url, init) => {
      if (url.endsWith('/old')) { started.resolve(); return held.promise.then((value) => { events.push('old.headers'); return value; }); }
      if (url.endsWith('/success')) events.push('new.post');
      return normal.send(url, init);
    });
    const api = client(send); const old = await failedPost(api);
    const waiting = api.request({ ...post, path: '/old' }); await started.promise;
    const recovering = api.recoverCsrf(old.context);
    const incoming = api.request({ ...post, path: '/success' });
    held.resolve(error());
    expect(await recovering).toEqual({ kind: 'refreshed' });
    expect((await waiting).kind).toBe('response'); expect((await incoming).kind).toBe('response');
    expect(events).toEqual(['csrf1', 'old.headers', 'csrf2', 'new.post']);
    expect(sentToken(send, '/success')).toBe('synthetic-2'); expect(count(send, '/success')).toBe(1);
  }, 1500);

  it('복구 실패를 기다리던 새 POST는 전송하지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const old = await failedPost(api);
    const recovering = api.recoverCsrf(old.context); await started.promise;
    const incoming = api.request({ ...post, path: '/success' });
    held.resolve(error(503, 'AUTH_STATE_UNAVAILABLE'));
    expect(await recovering).toMatchObject({ kind: 'failed' });
    expect(await incoming).toMatchObject({ kind: 'not_sent', reason: 'csrf_unavailable' });
    expect(count(send, '/success')).toBe(0);
  });

  it('대기 중 새 POST 취소는 공유 복구를 취소하지 않으며 POST는 전송하지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const old = await failedPost(api);
    const recovering = api.recoverCsrf(old.context); await started.promise;
    const abort = new AbortController(); const incoming = api.request({ ...post, path: '/success', signal: abort.signal });
    abort.abort();
    expect(await incoming).toEqual({ kind: 'not_sent', reason: 'cancelled' });
    held.resolve(csrf('synthetic-2'));
    expect(await recovering).toEqual({ kind: 'refreshed' }); expect(count(send, '/success')).toBe(0);
  });

  it('발급 대기 중 로그아웃은 공유 복구 결과와 새 POST를 이전 문맥으로 남긴다', async () => {
    const held = deferred<Response>(); const started = deferred<void>();
    const { send } = server((nth) => {
      if (nth === 2) { started.resolve(); return held.promise; }
      return csrf(`synthetic-${nth}`);
    });
    const api = client(send); const [a, b] = await Promise.all([failedPost(api), failedPost(api)]);
    const first = api.recoverCsrf(a.context); const second = api.recoverCsrf(b.context); await started.promise;
    const incoming = api.request({ ...post, path: '/success' });
    const transition = api.authTransition(logout, () => 'changed');
    held.resolve(csrf('synthetic-2'));
    expect(await first).toMatchObject({ kind: 'skipped' }); expect(await second).toMatchObject({ kind: 'skipped' });
    expect(await incoming).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    const current = await transition;
    expect(current.outcome).toBe('changed'); expect(api.isCurrentContext(current.context)).toBe(true);
    expect(count(send, '/success')).toBe(0); expect(count(send, '/auth/logout')).toBe(1);
  }, 1500);

  it('복구 발급 본문 대기 중 인증 만료는 이전 토큰 복원과 성공 반환을 막는다', async () => {
    const body = deferred<unknown>(); const started = deferred<void>(); const refresh = csrf('synthetic-old');
    jest.spyOn(refresh, 'json').mockImplementation(() => { started.resolve(); return body.promise; });
    const { send } = server((nth) => nth === 2 ? refresh : csrf(`synthetic-${nth}`));
    const api = client(send); const old = await failedPost(api);
    const recovering = api.recoverCsrf(old.context); await started.promise;
    const incoming = api.request({ ...post, path: '/success' });
    expect(api.expireIfCurrent(old.context, () => undefined)).toBe(true);
    body.resolve({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-old' });
    expect(await recovering).toMatchObject({ kind: 'skipped' });
    expect(await incoming).toEqual({ kind: 'not_sent', reason: 'auth_transition' });
    await api.request({ ...post, path: '/success' });
    expect(sentToken(send, '/success')).toBe('synthetic-3'); expect(count(send, '/success')).toBe(1);
  });

  it('이미 완료된 복구도 재로그인 뒤 이전 문맥에서 성공으로 재사용하지 않는다', async () => {
    const { send, issued } = server(); const api = client(send); const old = await failedPost(api);
    expect(await api.recoverCsrf(old.context)).toEqual({ kind: 'refreshed' });
    const transition = await api.authTransition(logout, () => 'changed'); const before = issued();
    expect(await api.recoverCsrf(old.context)).toMatchObject({ kind: 'skipped' });
    expect(issued()).toBe(before); expect(api.isCurrentContext(transition.context)).toBe(true);
  });

  it('복구가 기존 헤더를 기다리는 중 인증 전환이 시작되면 오래된 발급을 시작하지 않는다', async () => {
    const held = deferred<Response>(); const started = deferred<void>(); const normal = server();
    const send = jest.fn<ApiFetch>((url, init) => {
      if (url.endsWith('/old')) { started.resolve(); return held.promise; }
      return normal.send(url, init);
    });
    const api = client(send); const old = await failedPost(api);
    const waiting = api.request({ method: 'GET', path: '/old' }); await started.promise;
    const recovering = api.recoverCsrf(old.context);
    const transition = api.authTransition(logout, () => 'changed');
    held.resolve(json({ data: { synthetic: true } }));
    expect(await recovering).toMatchObject({ kind: 'skipped' });
    expect(await waiting).toEqual({ kind: 'stale_response' });
    expect((await transition).outcome).toBe('changed');
    expect(count(send, '/auth/logout')).toBe(1);
  }, 1500);
});

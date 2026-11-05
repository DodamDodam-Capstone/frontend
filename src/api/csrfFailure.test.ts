import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch } from './client';
import { classifyRecovery, readCsrfFailure } from './recovery';
import type { CsrfFailure, CsrfResult } from './csrf';
import { parseApiResponse } from './response';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const headerId = '11111111-1111-4111-8111-111111111111';
const bodyId = '22222222-2222-4222-8222-222222222222';
const secret = 'synthetic-private-value';
function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': headerId, ...headers } });
}
const csrf = () => json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
const error = (status: number, code: string) => json({ error: { code, message: '시험 오류', requestId: bodyId } }, status, { 'Retry-After': '2' });
function client(send: ApiFetch) {
  const result = createApiClient(config, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return result.value;
}
function failed(result: CsrfResult | undefined): CsrfFailure {
  if (!result || result.ok) throw new Error('Expected CSRF failure');
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}
afterEach(() => { jest.restoreAllMocks(); });

describe('CSRF 실패의 헤더 전달과 지연 본문 해석', () => {
  it('초기429에서 POST는 미전송이며 헤더를 먼저 전달하고 공유된 본문을 한 번만 읽는다', async () => {
    const response = error(429, 'RATE_LIMITED');
    const text = jest.spyOn(response, 'text');
    const send = jest.fn<ApiFetch>(async () => response);
    const api = client(send);
    const [result, preparation] = await Promise.all([api.request({ method: 'POST', path: '/guardian/lock' }), api.prepareCsrf()]);
    expect(result.kind).toBe('not_sent');
    if (result.kind !== 'not_sent' || result.reason !== 'csrf_unavailable') throw new Error('Expected no POST');
    const failure = failed(result.csrf);
    expect(failure).toBe(preparation);
    expect(failure).toMatchObject({ ok: false, reason: 'http', status: 429, requestId: headerId,
      meta: { status: 429, headers: { requestId: headerId, retryAfter: '2', contentType: 'application/json', location: null } } });
    expect(text).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([readCsrfFailure(failure), readCsrfFailure(failed(preparation))]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ kind: 'http_error', error: { code: 'RATE_LIMITED', requestId: bodyId, fields: [] } });
    if (!a) throw new Error('Expected parsed HTTP failure');
    expect(classifyRecovery(a, 'general')).toMatchObject({ kind: 'rate_limited', retryAfter: { kind: 'valid', seconds: 2 } });
    expect(await readCsrfFailure(failure)).toBe(a);
    expect(text).toHaveBeenCalledTimes(1);
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf']);
  });

  it.each<[number, string, string]>([[429, 'RATE_LIMITED', 'rate_limited'], [503, 'AUTH_STATE_UNAVAILABLE', 'auth_state_unavailable']])('인증 성공 뒤 갱신%i 실패를 인증 결과와 분리하고 POST를 재전송하지 않는다', async (status, code, kind) => {
    let issued = 0;
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? (++issued === 1 ? csrf() : error(status, code)) : json({ data: { authenticated: true } }));
    const result = await client(send).authTransition({ method: 'POST', path: '/auth/login', body: '{}' }, () => 'changed');
    expect(result.outcome).toBe('changed');
    expect(result.operation.kind).toBe('response');
    if (result.operation.kind !== 'response') throw new Error('Expected auth response');
    expect(await parseApiResponse(result.operation.response, { kind: 'json', statuses: [200] })).toMatchObject({ kind: 'json', data: { authenticated: true } });
    const parsed = await readCsrfFailure(failed(result.refresh));
    expect(parsed).toMatchObject({ kind: 'http_error', error: { code } });
    if (!parsed) throw new Error('Expected refresh error');
    expect(classifyRecovery(parsed, 'general').kind).toBe(kind);
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'login', 'csrf']);
  });

  it('오류 body를 읽는 동안에도 로그아웃이 완료되며 늦은 body를 새 drain에 포함하지 않는다', async () => {
    const body = deferred<string>();
    const response = error(429, 'RATE_LIMITED');
    const text = jest.spyOn(response, 'text').mockImplementation(() => body.promise);
    let issued = 0;
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf') ? (++issued === 1 ? response : csrf()) : new Response(null, { status: 204 }));
    const api = client(send);
    const failure = failed(await api.prepareCsrf());
    const reading = readCsrfFailure(failure);
    try {
      const logout = await api.authTransition({ method: 'POST', path: '/auth/logout' }, () => 'changed');
      expect(logout.outcome).toBe('changed');
      expect(logout.refresh).toEqual({ ok: true });
      expect(text).toHaveBeenCalledTimes(1);
      expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'csrf', 'logout', 'csrf']);
    } finally {
      body.resolve(JSON.stringify({ error: { code: 'RATE_LIMITED', message: '시험 오류', requestId: bodyId } }));
    }
    expect(await reading).toMatchObject({ kind: 'http_error' });
  }, 1500);

  it('읽기 실패를 메타데이터와 함께 반환하고 오류 원문을 노출하거나 재발급하지 않는다', async () => {
    const response = error(503, 'AUTH_STATE_UNAVAILABLE');
    jest.spyOn(response, 'text').mockRejectedValue(new Error(secret));
    const send = jest.fn<ApiFetch>(async () => response);
    const failure = failed(await client(send).prepareCsrf());
    const parsed = await readCsrfFailure(failure);
    expect(parsed).toMatchObject({ kind: 'body_read_error', reason: 'read_failed', meta: { status: 503, headers: { retryAfter: '2', requestId: headerId } } });
    expect(JSON.stringify(parsed)).not.toContain(secret);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('HTTP 실패 객체를 직렬화해도 원시 Response 본문·쿠키를 포함하지 않는다', async () => {
    const response = json({ error: { code: 'FUTURE_ERROR', message: secret, requestId: bodyId } }, 503, { 'Set-Cookie': secret });
    const failure = failed(await client(async () => response).prepareCsrf());
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(failure).not.toHaveProperty('response');
    expect(await readCsrfFailure(failure)).toMatchObject({ kind: 'http_error', error: { message: secret } });
  });

  it.each<[() => Response, string, string | undefined]>([
    [() => new Response(null, { status: 302, headers: { Location: '/synthetic' } }), 'redirect', undefined],
    [() => new Response(null, { status: 204 }), 'format_error', 'unexpected_status'],
    [() => json({ data: {} }, 201), 'format_error', 'unexpected_status'],
    [() => new Response('{', { status: 503, headers: { 'Content-Type': 'application/json' } }), 'format_error', 'invalid_json'],
    [() => new Response('html', { status: 503, headers: { 'Content-Type': 'text/html' } }), 'format_error', 'invalid_content_type'],
  ])('비200을 전부 http_error로 강제하지 않는다: %#', async (make, kind, reason) => {
    const failure = failed(await client(async () => make()).prepareCsrf());
    expect(await readCsrfFailure(failure)).toMatchObject({ kind, ...(reason ? { reason } : {}) });
  });

  it('통신 실패와 정상200의 전용 형식 오류에는 HTTP 오류를 만들지 않는다', async () => {
    const network = failed(await client(async () => { throw new Error(secret); }).prepareCsrf());
    const invalid = failed(await client(async () => json({ data: { token: secret } })).prepareCsrf());
    expect(network).toEqual({ ok: false, reason: 'network' });
    expect(invalid).toEqual({ ok: false, reason: 'invalid_response' });
    expect(await readCsrfFailure(network)).toBeUndefined();
    expect(await readCsrfFailure(invalid)).toBeUndefined();
  });
});

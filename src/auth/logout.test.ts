import { afterEach, expect, it, jest } from '@jest/globals';

import { createApiClient, type ApiFetch } from '../api/client';
import { submitLogoutRequest } from './logout';

const requestId = '11111111-1111-4111-8111-111111111111';

function csrf() {
  return Response.json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
}

function error(status: number, code: string, retryAfter?: string) {
  return Response.json({ error: { code, message: '합성 시험 오류', requestId, fields: [] } }, {
    status, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
  });
}

function setup(post: () => Response | Promise<Response>, replies: Response[] = [csrf(), csrf()]) {
  const fetchImpl = jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/auth/logout')) return post();
    const response = replies.shift();
    if (url.endsWith('/auth/csrf') && response) return response;
    throw new Error('Unsupported test request');
  });
  const result = createApiClient({
    appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1',
  }, { fetchImpl });
  if (!result.ok) throw new Error('Invalid test configuration');
  const calls = () => fetchImpl.mock.calls.map(([url, init]) => [
    init.method, new URL(url).pathname,
  ]);
  return { client: result.value, calls, fetchImpl };
}

afterEach(() => { jest.restoreAllMocks(); });

it('공통 인증 전환으로 세션 쿠키와 CSRF를 포함한 무본문 로그아웃을 보내고 토큰을 갱신한다', async () => {
  const { client, calls, fetchImpl } = setup(() => new Response(null, { status: 204 }));

  const result = await submitLogoutRequest(client);
  expect(result).toMatchObject({ kind: 'accepted', csrfFailed: false });
  expect(client.isCurrentContext(result.context)).toBe(true);
  expect(calls()).toEqual([
    ['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/logout'], ['GET', '/api/v1/auth/csrf'],
  ]);
  const post = fetchImpl.mock.calls[1][1];
  expect(post.credentials).toBe('include');
  expect(post.body).toBeUndefined();
  const headers = new Headers(post.headers);
  expect(headers.get('Content-Type')).toBeNull();
  expect(headers.get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
});

it('204 확정은 익명 CSRF 발급 전에 알리고, 발급 실패 뒤에도 유지한다', async () => {
  const { client, calls } = setup(() => new Response(null, { status: 204 }), [
    csrf(), error(503, 'AUTH_STATE_UNAVAILABLE'),
  ]);
  let callsWhenConfirmed: ReturnType<typeof calls> | undefined;

  const result = await submitLogoutRequest(client, () => { callsWhenConfirmed = calls(); });

  expect(callsWhenConfirmed).toEqual([['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/logout']]);
  expect(result).toMatchObject({ kind: 'accepted', csrfFailed: true });
  expect(calls()).toHaveLength(3);
});

it.each<[number, string, string]>([
  [401, 'AUTHENTICATION_REQUIRED', 'expired'],
  [401, 'LOGIN_FAILED', 'uncertain'],
  [400, 'VALIDATION_FAILED', 'rejected'],
  [413, 'REQUEST_TOO_LARGE', 'rejected'],
  [415, 'UNSUPPORTED_MEDIA_TYPE', 'rejected'],
  [503, 'AUTH_STATE_UNAVAILABLE', 'uncertain'],
])('HTTP %i %s의 로그아웃 결과를 %s으로 분류한다', async (status, code, kind) => {
  const { client, calls } = setup(() => error(status, code));
  const onConfirmed = jest.fn();

  const result = await submitLogoutRequest(client, onConfirmed);

  expect(result.kind).toBe(kind);
  expect(client.isCurrentContext(result.context)).toBe(true);
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(calls()).toEqual([['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/logout']]);
});

it('전송 전 CSRF 준비 실패는 로그아웃 미전송으로 처리한다', async () => {
  const { client, calls } = setup(() => new Response(null, { status: 204 }), [error(503, 'AUTH_STATE_UNAVAILABLE')]);

  expect((await submitLogoutRequest(client)).kind).toBe('rejected');
  expect(calls()).toEqual([['GET', '/api/v1/auth/csrf']]);
});

it('POST의 응답을 잃으면 결과 불명 상태를 반환한다', async () => {
  const { client, calls } = setup(() => Promise.reject(new Error('Test network failure')));

  expect((await submitLogoutRequest(client)).kind).toBe('uncertain');
  expect(calls()).toEqual([['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/logout']]);
});

it('403 CSRF_INVALID에서 새 토큰을 받되 로그아웃을 다시 보내지 않는다', async () => {
  const { client, calls } = setup(() => error(403, 'CSRF_INVALID'));

  expect((await submitLogoutRequest(client)).kind).toBe('rejected');
  expect(calls()).toEqual([
    ['GET', '/api/v1/auth/csrf'], ['POST', '/api/v1/auth/logout'], ['GET', '/api/v1/auth/csrf'],
  ]);
});

it.each([
  { stage: '전송 전 CSRF GET', post: 204, csrfResponses: () => [error(429, 'RATE_LIMITED', '7')], requests: 1,
    kind: 'rejected', csrfLimited: true },
  { stage: '로그아웃 POST', post: 429, csrfResponses: () => [csrf()], requests: 2,
    kind: 'rejected', csrfLimited: undefined },
  { stage: '성공 뒤 CSRF GET', post: 204, csrfResponses: () => [csrf(), error(429, 'RATE_LIMITED', '7')], requests: 3,
    kind: 'accepted', csrfLimited: true },
  { stage: 'CSRF 거절 뒤 갱신 GET', post: 403, csrfResponses: () => [csrf(), error(429, 'RATE_LIMITED', '7')], requests: 3,
    kind: 'rejected', csrfLimited: true },
])('$stage에서 받은 429의 서버 대기 기한을 전달한다', async ({ post, csrfResponses, requests, kind, csrfLimited }) => {
  jest.spyOn(Date, 'now').mockReturnValue(10_000);
  const { client, calls } = setup(() => {
    if (post === 204) return new Response(null, { status: 204 });
    return post === 403 ? error(403, 'CSRF_INVALID') : error(429, 'RATE_LIMITED', '7');
  }, csrfResponses());

  const result = await submitLogoutRequest(client);

  expect(result.kind).toBe(kind);
  expect(result.retryAt).toBe(17_000);
  expect(result.csrfLimited).toBe(csrfLimited);
  expect(calls()).toHaveLength(requests);
});

it.each([undefined, 'NaN'])('429 Retry-After가 %s이면 임의의 대기 기한을 만들지 않는다', async (retryAfter) => {
  const { client } = setup(() => error(429, 'RATE_LIMITED', retryAfter));

  const result = await submitLogoutRequest(client);

  expect(result.kind).toBe('rejected');
  expect(result.retryAt).toBeUndefined();
});

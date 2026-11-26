import { afterEach, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch, type ApiResult } from '../api/client';
import { requestChildRegistration, requestRegisteredChild } from './childRegistrationRequest';

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const childId = '33333333-3333-4333-8333-333333333333';
const requestId = '22222222-2222-4222-8222-222222222222';
const location = `/api/v1/children/${childId}`;
const input = {
  name: '가상', nickname: '별이', birthDate: '2020-02-29', gender: 'FEMALE', interests: ['그림'], characterId: 'test-character',
} as const;
const draft = { ...input, interests: [...input.interests] };
const child = { ...draft, childId, createdAt: '2026-11-04T10:00:00+09:00' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
function csrf() {
  return json({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
}
function error(status: number, code: string, options: { fields?: object[]; headers?: Record<string, string> } = {}) {
  return json({ error: { code, message: 'raw synthetic detail', requestId, fields: options.fields ?? [] } }, status, options.headers);
}
function setup(handle: ApiFetch) {
  const send = jest.fn<ApiFetch>(handle);
  const result = createApiClient(config, { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  const client = result.value;
  const controls = {
    isCurrent: () => true,
    beforeSend: () => true,
    receiveProtectedAuthResult: jest.fn<(result: ApiResult, stillCurrent?: () => boolean) => Promise<boolean>>()
      .mockResolvedValue(false),
  };
  return { client, send, controls };
}
function withPost(response: Response) {
  return setup(async (url) => url.endsWith('/auth/csrf') ? csrf() : response);
}

afterEach(() => { jest.restoreAllMocks(); });

it('sends a single credentialed POST and confirms the validated response identity', async () => {
  const { client, controls, send } = withPost(json({ data: child }, 201, { Location: location }));
  const result = await requestChildRegistration(client, draft, controls);
  expect(result).toMatchObject({ kind: 'check', reason: 'created', expectedChildId: childId });
  expect(send.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([
    ['/api/v1/auth/csrf', 'GET'], ['/api/v1/children', 'POST'],
  ]);
  const [, sent] = send.mock.calls[1];
  expect(JSON.parse(String(sent.body))).toEqual(draft);
  expect(sent.credentials).toBe('include');
  expect(new Headers(sent.headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
});

it.each([
  [{ childId }, location],
  [{ ...child, createdAt: '2026-02-30T10:00:00+09:00' }, location],
  [child, `https://api.example.invalid${location}`],
  [child, '/api/v1/children/44444444-4444-4444-8444-444444444444'],
])('requires a complete ChildView and matching relative Location for a 201', async (data, Location) => {
  const { client, controls, send } = withPost(json({ data }, 201, { Location }));
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'check', reason: 'uncertain' });
  expect(send.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
});

it('distinguishes an existing registration from a successful POST', async () => {
  const { client, controls } = withPost(error(409, 'CHILD_LIMIT_REACHED'));
  const result = await requestChildRegistration(client, draft, controls);
  expect(result).toMatchObject({ kind: 'check', reason: 'existing' });
  expect(result).not.toHaveProperty('expectedChildId');
});

it('maps known validation field names without exposing server field reasons', async () => {
  const { client, controls } = withPost(error(400, 'VALIDATION_FAILED', {
    fields: [{ field: 'characterId', reason: 'raw fixture' }, { field: '__proto__', reason: 'raw fixture' }],
  }));
  const result = await requestChildRegistration(client, draft, controls);
  expect(result).toMatchObject({ kind: 'rejected', errors: { characterId: expect.any(String) } });
  expect(JSON.stringify(result)).not.toContain('raw');
  expect(Object.keys(result.kind === 'rejected' ? result.errors ?? {} : {})).toEqual(['characterId']);
});

it('checks an ambiguous transport failure instead of replaying', async () => {
  const { client, controls, send } = setup(async (url) => {
    if (url.endsWith('/auth/csrf')) return csrf();
    throw new Error('synthetic transport failure');
  });
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'check', reason: 'uncertain' });
  expect(send.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
});

it('checks an ambiguous server failure instead of permitting a retry', async () => {
  const { client, controls } = withPost(error(500, 'INTERNAL_ERROR'));
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'check', reason: 'uncertain' });
});

it('refreshes invalid CSRF without replaying the POST and carries the refresh rate limit', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  let csrfAttempts = 0;
  const { client, controls, send } = setup(async (url) => {
    if (!url.endsWith('/auth/csrf')) return error(403, 'CSRF_INVALID');
    return ++csrfAttempts === 1 ? csrf() : error(429, 'RATE_LIMITED', { headers: { 'Retry-After': '3' } });
  });
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'rejected', retryAt: 4000 });
  expect(send.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'POST', 'GET']);
});

it.each(['2', '1.5'])('honors integer Retry-After on a POST with header %s', async (header) => {
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  const { client, controls } = withPost(error(429, 'RATE_LIMITED', { headers: { 'Retry-After': header } }));
  const result = await requestChildRegistration(client, draft, controls);
  expect(result).toMatchObject({ kind: 'rejected' });
  expect(result.kind === 'rejected' && result.retryAt).toBe(header === '2' ? 3000 : undefined);
});

it('hands protected 401 to entry handling before consuming the body', async () => {
  const response = error(401, 'AUTHENTICATION_REQUIRED');
  const { client, controls } = withPost(response);
  controls.receiveProtectedAuthResult.mockImplementation(async (_result, stillCurrent) => {
    expect(response.bodyUsed).toBe(false);
    expect(stillCurrent?.()).toBe(true);
    return true;
  });
  expect(await requestChildRegistration(client, draft, controls)).toEqual({ kind: 'ignored' });
  expect(controls.receiveProtectedAuthResult).toHaveBeenCalledTimes(1);
});

it('prevents transmission when confirmation expires while waiting for CSRF', async () => {
  let active = true;
  const { client, controls, send } = setup(async () => {
    active = false;
    return csrf();
  });
  expect(await requestChildRegistration(client, draft, { ...controls, isCurrent: () => active })).toEqual({ kind: 'ignored' });
  expect(send.mock.calls.map(([, init]) => init.method)).toEqual(['GET']);
});

it('queries a single existing profile only through read-only GET and shares no profile data', async () => {
  const { client, controls, send } = setup(async () => json({ data: { items: [child] } }));
  expect(await requestRegisteredChild(client, controls)).toEqual({ kind: 'found', childId });
  expect(send.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([['/api/v1/children', 'GET']]);
});

it.each([
  ['empty', []],
  ['malformed', [{ childId }]],
  ['multiple', [child, child]],
])('leaves %s profile lists unresolved', async (_case, items) => {
  const { client, controls } = setup(async () => json({ data: { items } }));
  expect(await requestRegisteredChild(client, controls)).toEqual({ kind: 'unresolved' });
});

it('returns the read-only recheck deadline when the list operation is rate limited', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  const { client, controls } = setup(async () => error(429, 'RATE_LIMITED', { headers: { 'Retry-After': '5' } }));
  expect(await requestRegisteredChild(client, controls)).toEqual({ kind: 'unresolved', retryAt: 6000 });
});


it('ignores a valid response body read after its request context is invalidated', async () => {
  const response = json({ data: child }, 201, { Location: location });
  const { client, controls } = withPost(response);
  const text = response.text.bind(response);
  jest.spyOn(response, 'text').mockImplementation(async () => {
    client.discardRequestContexts();
    return text();
  });
  expect(await requestChildRegistration(client, draft, controls)).toEqual({ kind: 'ignored' });
});

const invalidProfileBirthDates: [string, string][] = [
  ['before AD 1', '0000-01-01'],
  ['after its KST creation day', '2026-11-05'],
];

it.each(invalidProfileBirthDates)('keeps a 201 uncertain for a birth date %s', async (_case, birthDate) => {
  const { client, controls } = withPost(json({ data: { ...child, birthDate } }, 201, { Location: location }));
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'check', reason: 'uncertain' });
});

it.each(invalidProfileBirthDates)('leaves reconciliation unresolved for a birth date %s', async (_case, birthDate) => {
  const { client, controls } = setup(async () => json({ data: { items: [{ ...child, birthDate }] } }));
  expect(await requestRegisteredChild(client, controls)).toEqual({ kind: 'unresolved' });
});

it('accepts the KST creation day without consulting the device clock', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-03T12:00:00Z'));
  const data = { ...child, birthDate: '2026-11-04', createdAt: '2026-11-04T00:00:00+09:00' };
  const { client, controls } = withPost(json({ data }, 201, { Location: location }));
  expect(await requestChildRegistration(client, draft, controls)).toMatchObject({ kind: 'check', reason: 'created' });
});

import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

import { createApiClient, type ApiFetch, type ApiResult } from '../api/client';
import { createEmailVerification, type VerificationPurpose } from './emailVerification';

const email = ' Someone+Signup@example.test ';
const id = '88888888-8888-4888-8888-888888888888';
const secondId = '11111111-1111-4111-8111-111111111111';
const token = id + '.' + 'a'.repeat(43);
const initialTime = Date.parse('2030-10-01T01:00:00Z');
const expiresAt = '2030-10-01T10:02:01.123456+09:00';
const tokenExpiresAt = '2030-10-01T10:10:00+09:00';
const issuePath = '/api/v1/auth/email-verifications';
const issued = { challengeId: id, expiresAt };
const granted = { verificationToken: token, tokenExpiresAt };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function error(status: number, code: string, headers?: Record<string, string>) {
  return json({ error: { code, message: 'private server text', requestId: id } }, status, headers);
}

function fixture(purpose: VerificationPurpose = 'SIGNUP') {
  const reply = jest.fn<() => Response | Promise<Response>>();
  const send = jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/csrf')) {
      return json({ token: 'sample', headerName: 'X-XSRF-TOKEN', parameterName: '_csrf' });
    }
    return reply();
  });
  const result = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' },
    { fetchImpl: send });
  if (!result.ok) throw new Error('Invalid fixture config');
  const receive = jest.fn<(response: ApiResult) => Promise<boolean>>().mockResolvedValue(false);
  let active = true;
  const onPinUnavailable = jest.fn();
  const flow = createEmailVerification(result.value, purpose, {
    receiveProtectedAuthResult: receive, isActive: () => active, onPinUnavailable,
  });
  flow.setEmail(email);
  flow.openEmail();
  return {
    flow, reply, receive, onPinUnavailable, api: result.value, deactivate: () => { active = false; },
    posts: () => send.mock.calls.filter(([, init]) => init.method === 'POST'),
  };
}

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(initialTime); });
afterEach(() => { jest.restoreAllMocks(); });

it.each(['SIGNUP', 'RESET_PASSWORD', 'PIN_SETUP', 'PIN_RESET'] as const)(
  '%s sends the exact fields, verifies a leading zero, hands off only to its purpose once', async (purpose) => {
    const { flow, reply, posts } = fixture(purpose);
    expect(posts()).toHaveLength(0);
    reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: granted }));
    await Promise.all([flow.issue(), flow.issue()]);
    const [url, request] = posts()[0];
    expect(new URL(url).pathname).toBe(issuePath);
    expect(JSON.parse(String(request.body))).toEqual(purpose.startsWith('PIN') ? { purpose } : { email, purpose });
    expect(new Headers(request.headers).get('X-XSRF-TOKEN')).toBe('sample');
    expect(request.credentials).toBe('include');
    expect(flow.getSnapshot()).toMatchObject({ step: 'code', expiresAt: Date.parse(expiresAt) + 1 });
    await Promise.all([flow.verify('012345'), flow.verify('012345')]);
    expect(posts()).toHaveLength(2);
    expect(new URL(posts()[1][0]).pathname).toBe(issuePath + '/verify');
    expect(JSON.parse(String(posts()[1][1].body))).toEqual({ challengeId: id, code: '012345' });
    expect(flow.getSnapshot()).toMatchObject({ step: 'success', tokenExpiresAt: Date.parse(tokenExpiresAt) });
    expect(JSON.stringify(flow.getSnapshot())).not.toContain(token);
    flow.finish();
    expect(flow.getSnapshot().step).toBe('verified');
    expect(flow.takeToken(purpose === 'SIGNUP' ? 'RESET_PASSWORD' : 'SIGNUP')).toBeUndefined();
    expect(flow.takeToken(purpose)).toBe(token);
    expect(flow.takeToken(purpose)).toBeUndefined();
  });

it('keeps a delivered code on a mail app visit and uses the new challenge after resend', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued }));
  await flow.issue();
  flow.suspend();
  expect(flow.getSnapshot().step).toBe('code');
  reply.mockReturnValueOnce(json({ data: { ...issued, challengeId: secondId } }));
  await flow.issue();
  reply.mockReturnValueOnce(error(400, 'VERIFICATION_INVALID'));
  await flow.verify('123456');
  expect(JSON.parse(String(posts()[2][1].body)).challengeId).toBe(secondId);
  expect(flow.getSnapshot()).toMatchObject({ step: 'code', challengeId: secondId, message: expect.any(String) });
  expect(flow.getSnapshot().message).not.toContain('private server text');
});

it('protects rate limits even on close/reopen and refuses to replace a still-current code on rejected resend', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(error(429, 'RATE_LIMITED', { 'Retry-After': '13' }));
  await flow.issue();
  await flow.issue();
  expect(flow.getSnapshot()).toMatchObject({ challengeId: id, issueRetryAt: initialTime + 13000 });
  flow.closeDialog();
  flow.openEmail();
  await flow.issue();
  expect(posts()).toHaveLength(2);
  jest.spyOn(Date, 'now').mockReturnValue(initialTime + 13000);
  reply.mockReturnValueOnce(json({ data: { ...issued, challengeId: secondId } }));
  await flow.issue();
  expect(flow.getSnapshot().challengeId).toBe(secondId);
});

it('prevents expired code and expired token use at the server deadline', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued }));
  await flow.issue();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(expiresAt) + 1);
  await flow.verify('012345');
  expect(posts()).toHaveLength(1);
  expect(flow.getSnapshot().message).toBeTruthy();
  jest.spyOn(Date, 'now').mockReturnValue(initialTime);
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: granted }));
  await flow.issue();
  await flow.verify('012345');
  flow.finish();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(tokenExpiresAt));
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
  expect(flow.getSnapshot().step).not.toBe('verified');
});

it('accepts the already delivered number during a resend cooldown', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued }))
    .mockReturnValueOnce(error(429, 'RATE_LIMITED', { 'Retry-After': '13' }))
    .mockReturnValueOnce(json({ data: granted }));
  await flow.issue();
  await flow.issue();
  await flow.verify('012345');
  expect(posts()).toHaveLength(3);
  expect(flow.getSnapshot().step).toBe('success');
});

it('allows issuance during a verification cooldown and waits before checking the new number', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued }))
    .mockReturnValueOnce(error(429, 'RATE_LIMITED', { 'Retry-After': '13' }))
    .mockReturnValueOnce(json({ data: { ...issued, challengeId: secondId } }));
  await flow.issue();
  await flow.verify('012345');
  await flow.issue();
  await flow.verify('012345');
  expect(posts()).toHaveLength(3);
  expect(flow.getSnapshot()).toMatchObject({ challengeId: secondId, verifyRetryAt: initialTime + 13000 });
});

it('안내 타이머가 끝난 뒤에 이전 번호의 오답 응답이 오면 새 발급 상태로 전환한다', async () => {
  const { flow, reply } = fixture();
  let answer!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { answer = resolve; });
  let sent!: () => void;
  const started = new Promise<void>(resolve => { sent = resolve; });
  reply.mockReturnValueOnce(json({ data: issued })).mockImplementationOnce(() => { sent(); return held; });
  await flow.issue();
  const check = flow.verify('012345');
  await started;
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(expiresAt) + 1);
  flow.syncTime();
  answer(error(400, 'VERIFICATION_INVALID'));
  await check;
  expect(flow.getSnapshot()).toMatchObject({ step: 'email', busy: false, message: expect.stringMatching(/시간이 지났어요/) });
  expect(flow.getSnapshot().challengeId).toBeUndefined();
});

it.each(['1234', '012345\n', '０１２３４５'])('refuses an invalid code', async (bad) => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued }));
  await flow.issue();
  await flow.verify(bad);
  expect(posts()).toHaveLength(1);
  expect(flow.getSnapshot().message).toBeTruthy();
});

it('drops a late POST when the flow is closed or the app leaves the foreground', async () => {
  for (const discard of ['reset', 'suspend', 'inactive'] as const) {
    const { flow, reply, deactivate } = fixture();
    let release!: (response: Response) => void;
    let sent!: () => void;
    const sending = new Promise<void>(resolve => { sent = resolve; });
    reply.mockImplementationOnce(() => { sent(); return new Promise(resolve => { release = resolve; }); });
    const pending = flow.issue();
    await sending;
    if (discard === 'inactive') deactivate();
    else flow[discard]();
    release(json({ data: issued }));
    await pending;
    expect(flow.getSnapshot().challengeId).toBeUndefined();
  }
});

it('fails closed after a lost verification response and accepts only a fresh issue', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(json({ data: issued })).mockImplementationOnce(() => { throw new Error('lost'); });
  await flow.issue();
  await flow.verify('012345');
  await flow.verify('012345');
  expect(posts()).toHaveLength(2);
  expect(flow.getSnapshot().challengeId).toBeUndefined();
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
});

it('recovers CSRF without replaying the failed email POST', async () => {
  const { flow, reply, posts } = fixture();
  reply.mockReturnValueOnce(error(403, 'CSRF_INVALID'));
  await flow.issue();
  expect(posts()).toHaveLength(1);
  expect(flow.getSnapshot()).toMatchObject({ busy: false, step: 'email', message: expect.any(String) });
});

it.each([['2029-01-01T10:00:00+09:00', id], ['2030-02-30T10:10:00+09:00', id],
  [expiresAt, 'invalid']])('rejects an unusable challenge DTO', async (date, challengeId) => {
  const { flow, reply } = fixture();
  reply.mockReturnValueOnce(json({ data: { challengeId, expiresAt: date } }));
  await flow.issue();
  expect(flow.getSnapshot().challengeId).toBeUndefined();
  expect(flow.getSnapshot().step).toBe('email');
});

it('rejects a grant issued for a different challenge', async () => {
  const { flow, reply } = fixture();
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: {
    ...granted, verificationToken: secondId + '.' + 'b'.repeat(43),
  } }));
  await flow.issue();
  await flow.verify('012345');
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
  expect(flow.getSnapshot().step).toBe('email');
});

it('delivers 401 to the protected auth receiver before reading its body', async () => {
  const { flow, reply, receive } = fixture('PIN_SETUP');
  reply.mockReturnValueOnce(error(401, 'AUTHENTICATION_REQUIRED'));
  receive.mockImplementationOnce(async result => {
    expect(result.kind === 'response' && !result.response.bodyUsed).toBe(true);
    return true;
  });
  await flow.issue();
  expect(receive).toHaveBeenCalledTimes(1);
  expect(flow.getSnapshot().challengeId).toBeUndefined();
});

it.each<[number, string, boolean]>([[403, 'PIN_RESET_AUTHORIZATION_REQUIRED', true], [409, 'PIN_NOT_SET', true],
  [403, 'PIN_SETUP_AUTHORIZATION_REQUIRED', true], [409, 'PIN_ALREADY_SET', true], [401, 'AUTHENTICATION_REQUIRED', true],
  [503, 'EMAIL_DELIVERY_UNAVAILABLE', false], [503, 'AUTH_STATE_UNAVAILABLE', false]])('requires new issue on %s %s', async (status, code, terminal) => {
  const { flow, reply, onPinUnavailable } = fixture('PIN_RESET');
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(error(status, code));
  await flow.issue();
  await flow.issue();
  expect(flow.getSnapshot()).toMatchObject({ step: terminal ? 'form' : 'email', busy: false, message: expect.any(String) });
  expect(flow.getSnapshot().challengeId).toBeUndefined();
  if (terminal) expect(onPinUnavailable).toHaveBeenCalledWith(code.toLowerCase());
  else expect(onPinUnavailable).not.toHaveBeenCalled();
});

it('invalidates a verified grant when email or authenticated PIN context changes', async () => {
  for (const purpose of ['SIGNUP', 'PIN_SETUP'] as const) {
    const { flow, reply, api } = fixture(purpose);
    reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: granted }));
    await flow.issue();
    await flow.verify('012345');
    flow.finish();
    if (purpose === 'SIGNUP') flow.setEmail('other@example.test');
    else api.discardRequestContexts();
    expect(flow.takeToken(purpose)).toBeUndefined();
  }
});

it.each(['', 'invalid', 'a@', 'a @example.test', 'é@example.test'])('keeps an invalid address on the editable form', (address) => {
  const { flow, posts } = fixture();
  flow.closeDialog();
  flow.setEmail(address);
  flow.openEmail();
  expect(flow.getSnapshot()).toMatchObject({ step: 'form', email: address, emailFormatError: '이메일 주소를 확인해 주세요.' });
  expect(posts()).toHaveLength(0);
});

it('accepts trim and case normalization without rewriting a quoted or plus address', async () => {
  const { flow, reply, posts } = fixture();
  flow.closeDialog();
  const input = '\u00a0"Quoted@Mail".Name+Signup@example.test\u001c';
  flow.setEmail(input);
  flow.openEmail();
  reply.mockReturnValueOnce(json({ data: issued }));
  await flow.issue();
  expect(flow.getSnapshot().step).toBe('code');
  expect(JSON.parse(String(posts()[0][1].body)).email).toBe(input);
});

it('retains rate limit metadata even when it comes from the initial CSRF GET', async () => {
  const send = jest.fn<ApiFetch>().mockResolvedValueOnce(error(429, 'RATE_LIMITED', { 'Retry-After': '3' }));
  const api = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://example.invalid/api/v1' }, { fetchImpl: send });
  if (!api.ok) throw new Error('Invalid config');
  const flow = createEmailVerification(api.value, 'SIGNUP');
  flow.setEmail(email);
  flow.openEmail();
  await flow.issue();
  await flow.issue();
  expect(send).toHaveBeenCalledTimes(1);
  expect(flow.getSnapshot()).toMatchObject({ issueRetryAt: initialTime + 3000, verifyRetryAt: initialTime + 3000 });
});

it.each([undefined, 'Mon, 01 Oct 2030 01:00:00 GMT', '1.5'])('shows a manual rate-limit error without inventing a wait', async retryAfter => {
  const { flow, reply } = fixture();
  reply.mockReturnValueOnce(error(429, 'RATE_LIMITED', retryAfter ? { 'Retry-After': retryAfter } : {}));
  await flow.issue();
  expect(flow.getSnapshot()).toMatchObject({ step: 'email', message: expect.any(String) });
  expect(flow.getSnapshot().issueRetryAt).toBeUndefined();
});

it('resending an already verified address revokes its previous unconsumed grant', async () => {
  const { flow, reply } = fixture();
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: granted }))
    .mockReturnValueOnce(json({ data: { ...issued, challengeId: secondId } }));
  await flow.issue();
  await flow.verify('012345');
  flow.finish();
  flow.openEmail();
  await flow.issue();
  flow.closeDialog();
  expect(flow.getSnapshot().step).toBe('form');
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
});

it('can finish or abandon the flow without accidentally consuming or exposing the grant', async () => {
  const { flow, reply } = fixture();
  reply.mockReturnValueOnce(json({ data: issued })).mockReturnValueOnce(json({ data: granted }));
  await flow.issue();
  await flow.verify('012345');
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
  flow.closeDialog();
  flow.reset();
  expect(flow.getSnapshot()).toEqual({ busy: false, email: '', step: 'form' });
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
});

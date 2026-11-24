import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

import { createApiClient, type ApiFetch } from '../api/client';
import { createEmailVerification, type VerificationPurpose } from './emailVerification';

const time = Date.parse('2030-10-01T01:00:00Z');
const deadline = time + 5000;
const id = '88888888-8888-4888-8888-888888888888';
const token = id + '.' + 'a'.repeat(43);
const password = ' 한🙂' + 'a'.repeat(11) + ' ';
const email = 'guardian@example.test';
const path = '/api/v1/auth/signup';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function error(status: number, code: string, headers?: Record<string, string>, fields?: { field: string; reason: string }[]) {
  return json({ error: { code, message: 'private server text', requestId: id, fields } }, status, headers);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

async function setup(purpose: VerificationPurpose = 'SIGNUP') {
  const csrf = jest.fn<() => Promise<Response>>().mockImplementation(async () =>
    json({ token: 'sample', headerName: 'X-XSRF-TOKEN', parameterName: '_csrf' }));
  const signup = jest.fn<() => Promise<Response>>().mockImplementation(async () => json({ data: { accountId: id } }, 201));
  const fetchImpl = jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/csrf')) return csrf();
    if (url.endsWith(path)) return signup();
    if (url.endsWith('/verify')) {
      return json({ data: { verificationToken: token, tokenExpiresAt: '2030-10-01T10:00:05+09:00' } });
    }
    return json({ data: { challengeId: id, expiresAt: '2030-10-01T10:01:00+09:00' } });
  });
  const api = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' }, { fetchImpl });
  if (!api.ok) throw new Error('Invalid fixture config');
  const onCsrfLimited = jest.fn<(deadline: number) => void>();
  let active = true;
  const entryCsrf = jest.fn<() => Promise<void> | undefined>();
  const flow = createEmailVerification(api.value, purpose, { isActive: () => active, entryCsrf, onCsrfLimited });
  flow.setEmail(email);
  flow.openEmail();
  await flow.issue();
  await flow.verify('012345');
  return { flow, signup, csrf, api: api.value, onCsrfLimited, entryCsrf, fetchImpl, leaveForeground: () => { active = false; } };
}

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(time); });
afterEach(() => { jest.restoreAllMocks(); });

it('sends one exact signup request after closing the success panel and keeps credentials private', async () => {
  const { flow, signup, fetchImpl } = await setup();
  const held = deferred<Response>();
  const started = deferred<undefined>();
  signup.mockImplementationOnce(() => { started.resolve(undefined); return held.promise; });
  await flow.submitSignup(password, password);
  flow.finish();
  await flow.submitSignup(password, 'mismatch');
  expect(signup).not.toHaveBeenCalled();
  const pending = flow.submitSignup(password, password);
  await started.promise;
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot()).toMatchObject({ step: 'verified', signupStatus: 'submitting' });
  expect(signup).toHaveBeenCalledTimes(1);
  const request = fetchImpl.mock.calls.find(([url]) => url.endsWith(path))?.[1];
  expect(JSON.parse(String(request?.body))).toEqual({ verificationToken: token, password });
  expect(new Headers(request?.headers).get('X-XSRF-TOKEN')).toBe('sample');

  jest.mocked(Date.now).mockReturnValue(deadline);
  flow.syncTime();
  expect(flow.getSnapshot().signupStatus).toBe('submitting');
  held.resolve(json({ data: { accountId: id } }, 201));
  await pending;
  expect(flow.getSnapshot().signupStatus).toBe('complete');
  expect(flow.takeToken('SIGNUP')).toBeUndefined();
  expect(JSON.stringify(flow.getSnapshot())).not.toContain(token);
  expect(JSON.stringify(flow.getSnapshot())).not.toContain(password);
  expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/auth/login'))).toBe(false);
});

it('never dispatches signup after the grant expires during client CSRF preparation', async () => {
  const { flow, signup } = await setup();
  flow.finish();
  const pending = flow.submitSignup(password, password);
  jest.mocked(Date.now).mockReturnValue(deadline);
  await pending;
  expect(signup).not.toHaveBeenCalled();
  expect(flow.getSnapshot()).toMatchObject({ step: 'form', busy: false, message: expect.any(String) });
});

it('opens re-verification immediately when the grant expires during entry CSRF preparation', async () => {
  const { flow, signup, entryCsrf } = await setup();
  const checking = deferred<void>();
  entryCsrf.mockReturnValueOnce(checking.promise);
  flow.finish();
  const pending = flow.submitSignup(password, password);

  jest.mocked(Date.now).mockReturnValue(deadline);
  flow.syncTime();
  expect(flow.getSnapshot()).toMatchObject({ step: 'form', busy: false, message: expect.stringContaining('만료') });
  flow.openEmail();
  expect(flow.getSnapshot().step).toBe('email');

  checking.resolve(undefined);
  await pending;
  expect(flow.getSnapshot().step).toBe('email');
  expect(signup).not.toHaveBeenCalled();
});

it('opens re-verification immediately when the grant expires after 403 while CSRF recovers', async () => {
  const { flow, signup, csrf } = await setup();
  const sent = deferred<void>();
  const checking = deferred<Response>();
  csrf.mockImplementationOnce(() => { sent.resolve(undefined); return checking.promise; });
  flow.finish();
  signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
  const pending = flow.submitSignup(password, password);
  await sent.promise;

  jest.mocked(Date.now).mockReturnValue(deadline);
  flow.syncTime();
  expect(flow.getSnapshot()).toMatchObject({ step: 'form', busy: false, message: expect.stringContaining('만료') });
  flow.openEmail();
  expect(flow.getSnapshot().step).toBe('email');

  checking.resolve(json({ token: 'updated', headerName: 'X-XSRF-TOKEN', parameterName: '_csrf' }));
  await pending;
  expect(flow.getSnapshot().step).toBe('email');
  expect(signup).toHaveBeenCalledTimes(1);
});

it('does not use a password reset grant for signup', async () => {
  const { flow, signup } = await setup('RESET_PASSWORD');
  flow.finish();
  await flow.submitSignup(password, password);
  expect(signup).not.toHaveBeenCalled();
  expect(flow.takeToken('RESET_PASSWORD')).toBe(token);
});

it.each<[number, string, 'exists' | 'uncertain' | undefined]>([
  [400, 'VERIFICATION_INVALID', undefined],
  [409, 'ACCOUNT_ALREADY_EXISTS', 'exists'],
  [503, 'AUTH_STATE_UNAVAILABLE', 'uncertain'],
])('handles %d %s and prevents grant reuse', async (status, code, expectedStatus) => {
  const { flow, signup } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(status, code));
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().step).toBe('form');
  expect(flow.getSnapshot().signupStatus).toBe(expectedStatus);
  expect(flow.getSnapshot().signupMessage ?? flow.getSnapshot().message).toBeTruthy();
  expect(JSON.stringify(flow.getSnapshot())).not.toContain('private server text');
  await flow.submitSignup(password, password);
  expect(signup).toHaveBeenCalledTimes(1);
  if (expectedStatus === 'exists') {
    flow.setEmail('other@example.test');
    expect(flow.getSnapshot().signupStatus).toBeUndefined();
  }
});

it('keeps the verified grant for a corrected password and loses it for a rejected token', async () => {
  const { flow, signup } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(400, 'VALIDATION_FAILED', {}, [{ field: 'password', reason: 'invalid' }]))
    .mockResolvedValueOnce(error(400, 'VALIDATION_FAILED', {}, [{ field: 'verificationToken', reason: 'invalid' }]));
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot()).toMatchObject({ step: 'verified', signupPasswordError: expect.any(String) });
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().step).toBe('form');
  expect(signup).toHaveBeenCalledTimes(2);
});

it.each(['signup', 'recovery'] as const)('observes a shared %s Retry-After and requires a fresh user action', async (source) => {
  const { flow, signup, csrf, onCsrfLimited } = await setup();
  flow.finish();
  const rateLimit = error(429, 'RATE_LIMITED', { 'Retry-After': '2' });
  if (source === 'signup') signup.mockResolvedValueOnce(rateLimit);
  else {
    signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
    csrf.mockResolvedValueOnce(rateLimit);
  }
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().signupRetryAt).toBe(time + 2000);
  expect(onCsrfLimited).toHaveBeenCalledWith(time + 2000);
  await flow.submitSignup(password, password);
  expect(signup).toHaveBeenCalledTimes(1);
  jest.mocked(Date.now).mockReturnValue(time + 2000);
  flow.syncTime();
  expect(signup).toHaveBeenCalledTimes(1);
  await flow.submitSignup(password, password);
  expect(signup).toHaveBeenCalledTimes(2);
  expect(flow.getSnapshot().signupStatus).toBe('complete');
});

it('keeps a manual retry available after 403 CSRF recovery without replaying signup', async () => {
  const { flow, signup, csrf } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().step).toBe('verified');
  expect(csrf).toHaveBeenCalledTimes(2);
  expect(signup).toHaveBeenCalledTimes(1);
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().signupStatus).toBe('complete');
});

it.each([undefined, '0', '1.5'])('does not make up a 429 countdown for %s', async header => {
  const { flow, signup } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(429, 'RATE_LIMITED', header === undefined ? {} : { 'Retry-After': header }));
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot()).toMatchObject({ step: 'verified', signupMessage: expect.any(String) });
  expect(flow.getSnapshot().signupRetryAt).toBeUndefined();
  expect(signup).toHaveBeenCalledTimes(1);
});

it.each(['malformed', 'lost'] as const)('offers login after an uncertain %s signup response', async (result) => {
  const { flow, signup } = await setup();
  flow.finish();
  if (result === 'malformed') signup.mockResolvedValueOnce(json({ data: { accountId: 'bad' } }, 201));
  else signup.mockRejectedValueOnce(new Error('Uncertain response'));
  await flow.submitSignup(password, password);
  expect(flow.getSnapshot().signupStatus).toBe('uncertain');
  await flow.submitSignup(password, password);
  expect(signup).toHaveBeenCalledTimes(1);
});

it.each(['suspend', 'native generation', 'reset', 'address', 'context'] as const)('ignores a body received after %s', async (interruption) => {
  const { flow, signup, api, leaveForeground } = await setup();
  flow.finish();
  const textRead = deferred<undefined>();
  const body = deferred<string>();
  const response = json({ data: { accountId: id } }, 201);
  jest.spyOn(response, 'text').mockImplementation(() => { textRead.resolve(undefined); return body.promise; });
  signup.mockResolvedValueOnce(response);
  const pending = flow.submitSignup(password, password);
  await textRead.promise;
  if (interruption === 'suspend') flow.suspend();
  if (interruption === 'native generation') leaveForeground();
  if (interruption === 'reset') flow.reset();
  if (interruption === 'address') flow.setEmail('other@example.test');
  if (interruption === 'context') api.discardRequestContexts();
  body.resolve(JSON.stringify({ data: { accountId: id } }));
  await pending;
  expect(flow.getSnapshot().signupStatus).toBe(interruption === 'suspend' || interruption === 'native generation' ? 'uncertain' : undefined);
  expect(flow.getSnapshot().busy).toBe(false);
});

it('shares a CSRF preparation limit without counting an unsent signup as dispatched', async () => {
  const { flow, signup, csrf, onCsrfLimited } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
  csrf.mockResolvedValueOnce(error(503, 'AUTH_STATE_UNAVAILABLE'));
  await flow.submitSignup(password, password);

  csrf.mockResolvedValueOnce(error(429, 'RATE_LIMITED', { 'Retry-After': '2' }));
  await flow.submitSignup(password, password);
  expect(signup).toHaveBeenCalledTimes(1);
  expect(flow.getSnapshot()).toMatchObject({ step: 'verified', signupRetryAt: time + 2000 });
  expect(onCsrfLimited).toHaveBeenCalledWith(time + 2000);
});

it.each(['preparation', 'recovery'] as const)('shares a late %s 429 without restoring the expired signup', async (source) => {
  const { flow, signup, csrf, onCsrfLimited } = await setup();
  flow.finish();
  if (source === 'preparation') {
    signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
    csrf.mockResolvedValueOnce(error(503, 'AUTH_STATE_UNAVAILABLE'));
    await flow.submitSignup(password, password);
  }

  const started = deferred<void>();
  const checking = deferred<Response>();
  csrf.mockImplementationOnce(() => { started.resolve(undefined); return checking.promise; });
  const response = deferred<Response>();
  const signupStarted = deferred<void>();
  if (source === 'recovery') signup.mockImplementationOnce(() => { signupStarted.resolve(undefined); return response.promise; });
  const pending = flow.submitSignup(password, password);
  if (source === 'recovery') await signupStarted.promise;
  else await started.promise;

  jest.mocked(Date.now).mockReturnValue(deadline);
  flow.syncTime();
  if (source === 'recovery') {
    response.resolve(error(403, 'CSRF_INVALID'));
    await started.promise;
  }
  expect(flow.getSnapshot()).toMatchObject({ step: 'form', busy: false, message: expect.stringContaining('만료') });
  flow.openEmail();
  await Promise.resolve();

  checking.resolve(error(429, 'RATE_LIMITED', { 'Retry-After': '2' }));
  await pending;
  expect(flow.getSnapshot()).toMatchObject({ step: 'email', busy: false, signupRetryAt: deadline + 2000 });
  expect(flow.getSnapshot().message).toBeUndefined();
  expect(flow.getSnapshot().signupMessage).toBeUndefined();
  expect(onCsrfLimited).toHaveBeenCalledWith(deadline + 2000, false);
  expect(signup).toHaveBeenCalledTimes(1);
});

it.each(['reset', 'auth context'] as const)('drops late CSRF rate metadata after leaving the expired %s', async (change) => {
  const { flow, signup, csrf, api, onCsrfLimited } = await setup();
  flow.finish();
  signup.mockResolvedValueOnce(error(403, 'CSRF_INVALID'));
  const started = deferred<void>();
  const checking = deferred<Response>();
  csrf.mockImplementationOnce(() => { started.resolve(undefined); return checking.promise; });
  const pending = flow.submitSignup(password, password);
  await started.promise;
  jest.mocked(Date.now).mockReturnValue(deadline);
  flow.syncTime();
  if (change === 'reset') flow.reset();
  else api.discardRequestContexts();
  checking.resolve(error(429, 'RATE_LIMITED', { 'Retry-After': '2' }));
  await pending;
  expect(flow.getSnapshot().signupRetryAt).toBeUndefined();
  expect(onCsrfLimited).not.toHaveBeenCalled();
});

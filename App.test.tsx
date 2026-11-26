import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';

import App from './App';
import type { ExampleRequest } from './src/api/exampleTransport';
import * as mockApi from './src/api/mockAuthMe';
import { createHomeFixture } from './src/home/homeFixture';
import type { HomeDestination } from './src/navigation/routes';
import * as entry from './src/navigation/entryController';
import { readForegroundGeneration, subscribeToTaskReentry } from './src/navigation/entryPrivacy';

jest.mock('./src/navigation/entryPrivacy', () => ({
  EntryPrivacySurface: jest.requireActual<typeof import('react-native')>('react-native').View,
  readForegroundGeneration: jest.fn(() => 0),
  subscribeToTaskReentry: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

jest.mock('./src/components/EntrySplash', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EntrySplash: ({ onComplete }: { onComplete: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onComplete}><Text>스플래시 마치기</Text></Pressable>
    ),
  };
});

jest.mock('./src/navigation/EntryDestination', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const { EntryDestination } = jest.requireActual<typeof import('./src/navigation/EntryDestination')>('./src/navigation/EntryDestination');
  const { useEntrySession } = jest.requireActual<typeof import('./src/navigation/entrySession')>('./src/navigation/entrySession');
  const { parseApiResponse } = jest.requireActual<typeof import('./src/api/response')>('./src/api/response');
  return {
    EntryDestination: function TestDestination(props: Parameters<typeof EntryDestination>[0]) {
      const { client, receiveProtectedAuthResult } = useEntrySession();
      const [accountLabel, setAccountLabel] = useState(() => mockAccountLabel);
      async function openChildren() {
        const result = await client.request({ method: 'GET', path: '/children' });
        if (result.kind !== 'response' || result.response.status !== 200) return receiveProtectedAuthResult(result);
        const parsed = await parseApiResponse(result.response, { kind: 'json', statuses: [200] });
        if (parsed.kind !== 'json' || typeof parsed.data !== 'string') throw new Error('Invalid test receiver value');
        const value = parsed.data;
        await mockAfterChildrenParse?.(value);
        return client.commitIfCurrent(result.context, () => {
          setAccountLabel(value);
          // 방문이 끝난 화면에서는 setState가 표시되지 않아도 쓰기 시도 자체를 관찰한다.
          mockAccountWrites.push(value);
        });
      }
      return <>
        <EntryDestination {...props} />
        {props.route === '/home' && (
          <>
            {accountLabel && <Text>{accountLabel}</Text>}
            <Pressable accessibilityRole="button" onPress={() => { mockChildrenReads.push(openChildren()); }}><Text>아이 목록 확인</Text></Pressable>
          </>
        )}
      </>;
    },
  };
});

jest.mock('./src/home/HomeDestinationPreview', () => {
  const { HomeDestinationPreview } = jest.requireActual<typeof import('./src/home/HomeDestinationPreview')>('./src/home/HomeDestinationPreview');
  return {
    HomeDestinationPreview: function TestHomeDestination(props: Parameters<typeof HomeDestinationPreview>[0]) {
      mockHomeDestination(props.destination);
      return <HomeDestinationPreview {...props} />;
    },
  };
});

const mockHomeDestination = jest.fn<(destination: HomeDestination) => void>();

const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_MODE', 'EXPO_PUBLIC_API_BASE_URL'] as const;
const saved = keys.map(key => process.env[key]);
const markers = new Map<string, string>();
const marker = '@dodamdodam/onboarding-complete-v1';
let mockAccountLabel: string | undefined;
let mockAfterChildrenParse: ((value: string) => Promise<void>) | undefined;
const mockAccountWrites: string[] = [];
const mockChildrenReads: Promise<boolean>[] = [];
const account = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'guardian@example.com',
  childId: '22222222-2222-4222-8222-222222222222',
  hasPin: false,
  guardianUnlockedUntil: null,
};

beforeEach(() => {
  jest.mocked(readForegroundGeneration).mockReset().mockReturnValue(0);
  jest.mocked(subscribeToTaskReentry).mockReset();
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_API_MODE = 'real';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';
  markers.clear();
  mockHomeDestination.mockClear();
  mockAccountLabel = undefined;
  mockAfterChildrenParse = undefined;
  mockAccountWrites.length = 0;
  mockChildrenReads.length = 0;
  jest.mocked(AsyncStorage.getItem).mockReset().mockImplementation(async key => markers.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockReset().mockImplementation(async (key, value) => { markers.set(key, value); });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key];
    else process.env[key] = saved[index];
  });
});

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Request-ID': '33333333-3333-4333-8333-333333333333', ...headers,
    },
  });
}

function authError(status: number, code: string, headers?: Record<string, string>) {
  return response(status, { error: { code, message: 'fixture', fields: [], requestId: '33333333-3333-4333-8333-333333333333' } }, headers);
}

function realFetch(...accounts: (Response | Promise<Response>)[]) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method !== 'GET' || init.credentials !== 'include') throw new Error('Unexpected request');
    switch (String(input)) {
      case 'https://api.example.invalid/api/v1/auth/csrf':
        return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'public-test-fixture' });
      case 'https://api.example.invalid/api/v1/auth/me': {
        const next = accounts.shift();
        if (next) return next;
        break;
      }
      case 'https://api.example.invalid/api/v1/children':
        return authError(401, 'AUTHENTICATION_REQUIRED');
    }
    throw new Error('Unexpected endpoint or duplicate request');
  });
}

function observeAppState() {
  const listeners = new Set<(status: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  return (status: AppStateStatus) => act(() => {
    for (const listener of [...listeners]) listener(status);
  });
}

function pendingResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

function loginFetch(post: () => Response | Promise<Response>, accountAfterLogin: Response, csrfAfterLogin?: Response) {
  let posted = false;
  let refreshedCsrf = false;
  let accountChecks = 0;
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/auth/login') && init?.method === 'POST') {
      posted = true;
      return post();
    }
    if (path.endsWith('/auth/me')) {
      return accountChecks++ === 0 ? authError(401, 'AUTHENTICATION_REQUIRED') : accountAfterLogin.clone();
    }
    if (path.endsWith('/auth/csrf')) {
      if (posted && !refreshedCsrf) {
        refreshedCsrf = true;
        if (csrfAfterLogin) return csrfAfterLogin;
      }
      return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
    }
    throw new Error('Unexpected login fixture request');
  });
}

async function fillLoginForm(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('이메일'), email);
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
}

async function openLoginForm(email = 'guardian@example.test', password = ' x ') {
  markers.set(marker, 'true');
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  await fillLoginForm(email, password);
}

function pause() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { wait: jest.fn(() => pending), release };
}

function pauseBody(body: Response) {
  const gate = pause();
  const read = body.text.bind(body);
  jest.spyOn(body, 'text').mockImplementation(async () => {
    await gate.wait();
    return read();
  });
  return gate;
}

const accountA = { ...account, email: 'guardian@example.test' };
const accountB = { ...account, accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'second@example.test' };

function authFlowFetch(gates: {
  failedLogin?: () => Promise<void>;
  logout?: () => Promise<void>;
  home?: (session: typeof account) => Response;
} = {}) {
  let session: typeof account | undefined;
  let visit = 0;
  const children = jest.fn((value: string) => response(200, { data: value }));
  const expired = () => authError(401, 'AUTHENTICATION_REQUIRED');
  const fetchCall = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    switch (`${init?.method} ${path}`) {
      case 'GET /api/v1/auth/csrf':
        return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
      case 'GET /api/v1/auth/me':
        return session ? response(200, { data: session }) : expired();
      case 'POST /api/v1/auth/login': {
        const { email, password } = JSON.parse(String(init?.body));
        const next = [accountA, accountB].find(candidate => candidate.email === email);
        if (!next || password !== ' x ') {
          await gates.failedLogin?.();
          return authError(401, 'LOGIN_FAILED');
        }
        session = next;
        visit += 1;
        return response(200, { data: session });
      }
      case 'POST /api/v1/auth/logout':
        await gates.logout?.();
        session = undefined;
        return new Response(null, { status: 204 });
      case 'GET /api/v1/children':
        return session ? children(`${session.email} · 방문 ${visit}`) : expired();
      case `GET /api/v1/children/${account.childId}/home`:
        if (session && gates.home) return gates.home(session);
        break;
    }
    throw new Error('Unexpected auth flow request');
  });
  return {
    children, expire() { session = undefined; },
    calls: (path: string) => fetchCall.mock.calls.filter(([url]) => String(url).endsWith(path)),
  };
}

function signupFixture(createAccount = () => Promise.resolve(response(201, { data: { accountId: account.accountId } }))) {
  let signedIn = false;
  const challengeId = '12345678-abcd-4abc-8abc-123456789012';
  const futureKst = () => new Date(Date.now() + (9 * 60 + 5) * 60_000).toISOString().replace('Z', '000+09:00');
  const requests: { path: string; body: unknown }[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === 'GET' && path.endsWith('/auth/csrf')) {
      return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'signup-test-csrf' });
    }
    if (init?.method === 'GET' && path.endsWith('/auth/me')) {
      return signedIn ? response(200, { data: account }) : authError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (init?.method !== 'POST' || !new Headers(init.headers).has('X-XSRF-TOKEN') || init.credentials !== 'include') {
      throw new Error('Invalid signup request');
    }
    requests.push({ path, body: JSON.parse(String(init.body)) });
    if (path === '/api/v1/auth/email-verifications') return response(200, { data: { challengeId, expiresAt: futureKst() } });
    if (path === '/api/v1/auth/email-verifications/verify') {
      return response(200, { data: { verificationToken: challengeId + '.' + 'a'.repeat(43), tokenExpiresAt: futureKst() } });
    }
    if (path === '/api/v1/auth/signup') return createAccount();
    throw new Error('Unexpected signup endpoint');
  });
  return { requests, challengeId, signIn: () => { signedIn = true; } };
}

async function verifySignupEmail() {
  await openSignupForm();
  await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  await fireEvent.changeText(await screen.findByLabelText('인증번호 6자리'), '012345');
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await fireEvent.press(await screen.findByRole('button', { name: '비밀번호 설정하기' }));
}

async function openSignupForm() {
  markers.set(marker, 'true');
  await render(<App />);
  await finishSplash();
  const signup = await screen.findByRole('button', { name: '이메일로 회원 가입' });
  await fireEvent.press(signup);
  expect(await screen.findByRole('header', { name: '보호자 계정 만들기' })).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'guardian@example.test');
  await fireEvent.press(screen.getByRole('button', { name: '인증하기' }));
}

test('실제 가입 진입 후 메일 앱에서 돌아와 발급받은 번호를 확인하고 인증 완료 폼으로 돌아온다', async () => {
  const changeAppState = observeAppState();
  const server = signupFixture();
  await openSignupForm();
  expect(server.requests).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  expect(await screen.findByLabelText('인증번호 6자리')).toBeVisible();
  await changeAppState('background');
  expect(screen.queryByLabelText('인증번호 6자리')).not.toBeOnTheScreen();
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  await fireEvent.changeText(await screen.findByLabelText('인증번호 6자리'), '012345');
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(await screen.findByRole('header', { name: '이메일 인증 완료' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '비밀번호 설정하기' }));
  expect(screen.getByText('이메일 인증이 완료되었어요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
  expect(server.requests).toEqual([
    { path: '/api/v1/auth/email-verifications', body: { email: 'guardian@example.test', purpose: 'SIGNUP' } },
    { path: '/api/v1/auth/email-verifications/verify', body: { challengeId: server.challengeId, code: '012345' } },
  ]);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('복귀 조회에서 로그인한 계정이 확인되면 가입 진행을 폐기한다', async () => {
  const changeAppState = observeAppState();
  const server = signupFixture();
  await openSignupForm();
  await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  expect(await screen.findByLabelText('인증번호 6자리')).toBeVisible();
  await changeAppState('background');
  server.signIn();
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(screen.queryByLabelText('인증번호 6자리')).not.toBeOnTheScreen();
  expect(server.requests).toHaveLength(1);
});

test('일반 앱에서 인증과 가입을 분리하고 가입 완료 뒤 기존 로그인으로 이동한다', async () => {
  const held = pendingResponse();
  const server = signupFixture(() => held.promise);
  await verifySignupEmail();
  const original = ' 한🙂' + 'a'.repeat(11) + ' ';
  expect(server.requests).toHaveLength(2);
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), original);
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), original);
  await fireEvent.press(screen.getByRole('button', { name: '계정 만들기' }));
  const pending = screen.getByRole('button', { name: '계정 만드는 중' });
  expect(pending).toBeBusy();
  await fireEvent.press(pending);
  expect(server.requests.slice(2)).toEqual([{ path: '/api/v1/auth/signup', body: {
    verificationToken: server.challengeId + '.' + 'a'.repeat(43), password: original,
  } }]);
  await act(() => held.resolve(response(201, { data: { accountId: account.accountId } })));
  expect(await screen.findByRole('header', { name: '보호자 계정이 만들어졌어요!' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '로그인하기' }));
  expect(screen.getByRole('button', { name: '로그인' })).toBeVisible();
  expect(server.requests.map(({ path }) => path)).toHaveLength(3);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('가입 응답을 기다리는 중 앱을 떠나면 복귀한 화면에서 이전 성공을 표시하지 않는다', async () => {
  const changeAppState = observeAppState();
  const held = pendingResponse();
  const server = signupFixture(() => held.promise);
  await verifySignupEmail();
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'a'.repeat(15));
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), 'a'.repeat(15));
  await fireEvent.press(screen.getByRole('button', { name: '계정 만들기' }));
  expect(server.requests).toHaveLength(3);
  await changeAppState('background');
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  await act(() => held.resolve(response(201, { data: { accountId: account.accountId } })));
  expect(screen.queryByText('가입 완료!')).not.toBeOnTheScreen();
  expect(await screen.findByLabelText('비밀번호')).toHaveDisplayValue('');
  expect(screen.getByRole('alert')).toHaveTextContent(/가입 결과를 확인할 수 없어요/);
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '로그인하기' })).toBeEnabled();
  expect(server.requests).toHaveLength(3);
});

test.each(['누르기 전', '누른 뒤'])('초기 계정 401 뒤 가입 발송을 %s 도착한 CSRF 제한도 반영한다', async timing => {
  const held = pendingResponse();
  const calls: string[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(init?.method + ' ' + path);
    if (path.endsWith('/me')) return authError(401, 'AUTHENTICATION_REQUIRED');
    if (calls.filter(call => call.endsWith('/csrf')).length === 1) return held.promise;
    throw new Error('Unexpected second security or verification request');
  });
  await openSignupForm();
  if (timing === '누른 뒤') await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  await act(() => held.resolve(authError(429, 'RATE_LIMITED', { 'Retry-After': '30' })));
  expect(await screen.findByRole('alert')).toHaveTextContent(/요청이 많아요/);
  expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeDisabled();
  expect(calls).toEqual(['GET /api/v1/auth/csrf', 'GET /api/v1/auth/me']);
});

test.each(['준비', '복구'])('가입에서 CSRF %s 조회가 제한되면 로그인으로 돌아가도 기한을 지킨다', async timing => {
  let csrfReads = 0;
  const posts: string[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/me')) return authError(401, 'AUTHENTICATION_REQUIRED');
    if (path.endsWith('/csrf')) {
      if (++csrfReads >= (timing === '준비' ? 2 : 3)) return authError(429, 'RATE_LIMITED', { 'Retry-After': '90' });
      return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'signup-test-csrf' });
    }
    if (init?.method === 'POST') posts.push(path);
    return authError(403, 'CSRF_INVALID');
  });
  await openSignupForm();
  await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/요청이 많아요/);
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));
  expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
  expect(posts).toHaveLength(timing === '준비' ? 0 : 1);
  expect(csrfReads).toBe(timing === '준비' ? 2 : 3);
});

async function requestChildren() {
  const start = mockChildrenReads.length;
  await fireEvent.press(screen.getByRole('button', { name: '아이 목록 확인' }));
  expect(mockChildrenReads).toHaveLength(start + 1);
  return { finished: mockChildrenReads[start] };
}

async function expectCurrentValue(value: string) {
  const { finished } = await requestChildren();
  expect(await finished).toBe(true);
  expect(await screen.findByText(value)).toBeVisible();
}

async function expectBlankLogin() {
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.getByLabelText('이메일')).toHaveDisplayValue('');
  expect(screen.getByLabelText('비밀번호')).toHaveDisplayValue('');
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
}

test('로그인 실패 후 같은 계정에 다시 로그인하면 로그아웃 전의 늦은 본문과 만료를 무시한다', async () => {
  const failedLogin = pause();
  const logout = pause();
  const server = authFlowFetch({ failedLogin: failedLogin.wait, logout: logout.wait });
  await openLoginForm(accountA.email, 'z');
  const login = screen.getByRole('button', { name: '로그인' });
  await fireEvent.press(login);
  await fireEvent(screen.getByLabelText('비밀번호'), 'submitEditing');
  await fireEvent.press(login);
  await waitFor(() => expect(failedLogin.wait).toHaveBeenCalledTimes(1));
  expect(login).toBeBusy();
  await act(() => { failedLogin.release(); });
  expect(await screen.findByRole('alert')).toHaveTextContent('입력한 이메일과 비밀번호를 확인해 주세요.');
  expect(screen.getByLabelText('이메일')).toHaveDisplayValue(accountA.email);
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(server.calls('/auth/login')).toHaveLength(1);
  expect(server.calls('/auth/me')).toHaveLength(1); // 최초 미인증 확인만 수행했다.

  await fireEvent.changeText(screen.getByLabelText('비밀번호'), ' x ');
  await fireEvent.press(login);
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  const first = `${accountA.email} · 방문 1`;
  const second = `${accountA.email} · 방문 2`;
  await expectCurrentValue(first);

  const oldValue = response(200, { data: '이전 방문의 늦은 값' });
  const successBody = pauseBody(oldValue);
  server.children.mockReturnValueOnce(oldValue);
  const oldSuccess = await requestChildren();
  await waitFor(() => expect(successBody.wait).toHaveBeenCalledTimes(1));
  const oldExpiry = authError(401, 'AUTHENTICATION_REQUIRED');
  const copy = oldExpiry.clone();
  const expiryBody = pauseBody(copy);
  jest.spyOn(oldExpiry, 'clone').mockReturnValueOnce(copy);
  server.children.mockReturnValueOnce(oldExpiry);
  const oldFailure = await requestChildren();
  await waitFor(() => expect(expiryBody.wait).toHaveBeenCalledTimes(1));

  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  await waitFor(() => expect(logout.wait).toHaveBeenCalledTimes(1));
  expect(screen.getByText('로그아웃 중')).toBeVisible();
  expect(screen.queryByText(first)).not.toBeOnTheScreen();
  await act(() => { logout.release(); });
  await expectBlankLogin();
  await fillLoginForm(accountA.email, ' x ');
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(screen.queryByText(first)).not.toBeOnTheScreen();
  await expectCurrentValue(second);

  await act(async () => {
    successBody.release();
    expiryBody.release();
    expect(await Promise.all([oldSuccess.finished, oldFailure.finished])).toEqual([false, false]);
  });
  expect(mockAccountWrites).toEqual([first, second]);
  expect(screen.getByText(second)).toBeVisible();
  expect(server.calls('/auth/login')).toHaveLength(3);
  expect(server.calls('/auth/logout').map(([, init]) => init?.body)).toEqual([undefined]);
});

test('사용 중 세션이 만료되어 다른 계정으로 로그인하면 본문 해석을 마친 이전 작업도 반영되지 않는다', async () => {
  const server = authFlowFetch();
  await openLoginForm(accountA.email);
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  const first = `${accountA.email} · 방문 1`;
  const second = `${accountB.email} · 방문 2`;
  await expectCurrentValue(first);

  const afterParse = pause();
  mockAfterChildrenParse = afterParse.wait;
  const old = await requestChildren();
  await waitFor(() => expect(afterParse.wait).toHaveBeenCalledWith(first));
  mockAfterChildrenParse = undefined;
  server.expire();
  const expiry = await requestChildren();
  expect(await expiry.finished).toBe(true);
  await expectBlankLogin();
  expect(screen.queryByText(first)).not.toBeOnTheScreen();

  await fillLoginForm(accountB.email, ' x ');
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(screen.queryByText(first)).not.toBeOnTheScreen();
  await expectCurrentValue(second);
  await act(async () => {
    afterParse.release();
    expect(await old.finished).toBe(false);
  });
  expect(mockAccountWrites).toEqual([first, second]);
  expect(screen.getByText(second)).toBeVisible();
  expect(server.calls('/auth/login')).toHaveLength(2);
  expect(server.calls('/auth/logout')).toHaveLength(0);
});

test('앱에서 로그아웃하면 갱신을 기다리는 동안에도 기존 계정 내용을 숨긴다', async () => {
  markers.set(marker, 'true');
  mockAccountLabel = '이전 계정 표시';
  const logout = pendingResponse();
  const refresh = pendingResponse();
  let posted = false;
  const fetchCall = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/auth/me')) return response(200, { data: account });
    if (path.endsWith('/auth/logout') && init?.method === 'POST') {
      posted = true;
      return logout.promise;
    }
    if (path.endsWith('/auth/csrf')) {
      return posted ? refresh.promise : response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'before' });
    }
    throw new Error('Unexpected logout fixture request');
  });
  await render(<App />);
  await finishSplash();
  expect(await screen.findByText('이전 계정 표시')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect(screen.queryByText('이전 계정 표시')).not.toBeOnTheScreen();
  expect(screen.getByText('로그아웃 중')).toBeVisible();
  await act(() => { logout.resolve(new Response(null, { status: 204 })); });
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
  await act(() => { refresh.resolve(authError(503, 'AUTH_STATE_UNAVAILABLE')); });
  expect(await screen.findByRole('button', { name: '보안 확인 다시 시도' })).toBeEnabled();
  expect(fetchCall.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each(['복귀 전', '복귀 후'])('로그인 응답이 %s 도착해도 현재 앱만 계정을 한 번 확인한다', async (when) => {
  const changeAppState = observeAppState();
  const login = pendingResponse();
  const fetchCall = loginFetch(() => login.promise, response(200, { data: { ...account, childId: null } }));
  await openLoginForm();
  const password = screen.getByLabelText('비밀번호');
  const submit = screen.getByRole('button', { name: '로그인' });
  await act(async () => {
    await fireEvent.press(submit);
    await fireEvent(password, 'submitEditing');
  });
  await changeAppState('background');
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  if (when === '복귀 후') await changeAppState('active');
  expect(screen.getByLabelText('로그인 상태 확인 중')).toBeVisible();
  await act(() => { login.resolve(response(200, { data: account })); });
  await changeAppState('active');
  expect(await screen.findByRole('header', { name: '아이 등록' })).toBeVisible();
  expect(screen.queryByLabelText('비밀번호')).not.toBeOnTheScreen();
  const posts = fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'));
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ email: 'guardian@example.test', password: ' x ' });
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
});

test('로그인 200 뒤 토큰 갱신이 429이면 기한 후 수동 확인에서만 토큰과 계정을 조회한다', async () => {
  jest.useFakeTimers();
  const changeAppState = observeAppState();
  const fetchCall = loginFetch(
    () => response(200, { data: account }),
    response(200, { data: account }),
    authError(429, 'RATE_LIMITED', { 'Retry-After': '3' }),
  );
  await openLoginForm();
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  expect(retry).toBeDisabled();
  const callsBefore = fetchCall.mock.calls.length;
  await changeAppState('background');
  await changeAppState('active');
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(fetchCall).toHaveBeenCalledTimes(callsBefore);
  expect(retry).toBeEnabled();
  await fireEvent.press(retry);
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(1);
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
});

test('전송 뒤 로그인 응답이 유실되면 현재 계정으로 확인하고 비밀번호를 재전송하지 않는다', async () => {
  const fetchCall = loginFetch(() => Promise.reject(new Error('fixture transport failure')), response(200, { data: account }));
  await openLoginForm();
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(1);
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
});

test('최근 앱 카드 복귀 중 로그인 POST에 온 429는 새 폼의 재제출도 막는다', async () => {
  jest.useFakeTimers();
  const changeAppState = observeAppState();
  const login = pendingResponse();
  let posts = 0;
  const fetchCall = loginFetch(
    () => ++posts === 1 ? login.promise : authError(401, 'LOGIN_FAILED'),
    authError(401, 'AUTHENTICATION_REQUIRED'),
  );
  await openLoginForm();
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  const taskReturn = jest.mocked(subscribeToTaskReentry).mock.calls[0][0];
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await act(() => taskReturn(1));
  await changeAppState('active');
  await act(() => login.resolve(authError(429, 'RATE_LIMITED', { 'Retry-After': '3' })));
  const submit = await screen.findByRole('button', { name: '로그인' });
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText('비밀번호')).toHaveDisplayValue('');
  expect(posts).toBe(1);
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(submit).toBeEnabled();
  expect(posts).toBe(1);
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'guardian@example.test');
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), ' ');
  await fireEvent.press(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('입력한 이메일과 비밀번호를 확인해 주세요.');
  expect(posts).toBe(2);
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
});

test.each(['CSRF 먼저', '계정 먼저'])('첫 토큰 확인 429와 계정 401이 %s 도착해도 기한을 지킨다', async (order) => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const accountCheck = pendingResponse();
  const csrfCheck = pendingResponse();
  const fetchCall = jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input).endsWith('/auth/me')) return accountCheck.promise;
    return csrfCheck.promise;
  });
  await render(<App />);
  await finishSplash();
  if (order === 'CSRF 먼저') {
    await act(() => csrfCheck.resolve(authError(429, 'RATE_LIMITED', { 'Retry-After': '3' })));
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeDisabled();
  }
  await act(() => accountCheck.resolve(authError(401, 'AUTHENTICATION_REQUIRED')));
  const submit = await screen.findByRole('button', { name: '로그인' });
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'guardian@example.test');
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), 'x');
  await fireEvent(screen.getByLabelText('비밀번호'), 'submitEditing');
  expect(fetchCall).toHaveBeenCalledTimes(2);
  if (order === '계정 먼저') {
    await act(() => csrfCheck.resolve(authError(429, 'RATE_LIMITED', { 'Retry-After': '3' })));
  }
  expect(submit).toBeDisabled();
  expect(fetchCall.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])).toEqual([
    ['/api/v1/auth/csrf', 'GET'], ['/api/v1/auth/me', 'GET'],
  ]);
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(submit).toBeEnabled();
  expect(fetchCall).toHaveBeenCalledTimes(2);
});

test('열려 있는 폼에서 로그인 429의 대기시간이 지나면 대기 안내도 사라진다', async () => {
  jest.useFakeTimers();
  const fetchCall = loginFetch(() => authError(429, 'RATE_LIMITED', { 'Retry-After': '3' }), authError(401, 'AUTHENTICATION_REQUIRED'));
  await openLoginForm();
  const submit = screen.getByRole('button', { name: '로그인' });
  await fireEvent.press(submit);
  expect(submit).toBeDisabled();
  expect(screen.getByRole('alert')).toBeVisible();
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(submit).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(1);
});

test('토큰을 기다리던 폼을 떠나면 이전 429로 새 세션 확인을 막거나 비밀번호를 보내지 않는다', async () => {
  const changeAppState = observeAppState();
  const oldCsrf = pendingResponse();
  let csrfRequests = 0;
  let accountChecks = 0;
  const fetchCall = jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input);
    if (path.endsWith('/auth/me')) {
      return ++accountChecks === 1 ? authError(401, 'AUTHENTICATION_REQUIRED') : response(200, { data: account });
    }
    if (path.endsWith('/auth/csrf')) {
      return ++csrfRequests === 1 ? oldCsrf.promise
        : response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'synthetic-csrf' });
    }
    throw new Error('Retired form sent credentials');
  });
  await openLoginForm();
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  await changeAppState('background');
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  await act(() => oldCsrf.resolve(authError(429, 'RATE_LIMITED', { 'Retry-After': '30' })));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(0);
  expect(accountChecks).toBe(2);
});

test('홈에서 백그라운드에 다녀오면 새 조회 중 홈을 숨기고 세션 만료를 로그인에 반영한다', async () => {
  const changeAppState = observeAppState();
  const expired = pendingResponse();
  markers.set(marker, 'true');
  const fetchCall = realFetch(response(200, { data: account }), expired.promise);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  await changeAppState('inactive');
  await changeAppState('active');
  expect(screen.getByRole('header', { name: '홈' })).toBeVisible();

  await changeAppState('background');
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  await changeAppState('active');
  await changeAppState('active');
  expect(screen.getByLabelText('로그인 상태 확인 중')).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/csrf'))).toHaveLength(1);

  await act(() => { expired.resolve(authError(401, 'AUTHENTICATION_REQUIRED')); });
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
});

test('최근 앱 카드를 탭해 Android가 pause 없이 복귀해도 한 번 재조회하고 만료 전까지 이전 홈을 숨긴다', async () => {
  const held = pendingResponse();
  markers.set(marker, 'true');
  const fetchCall = realFetch(response(200, { data: account }), held.promise);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();

  const onReturn = jest.mocked(subscribeToTaskReentry).mock.calls[0][0];
  jest.mocked(readForegroundGeneration).mockReturnValue(2);
  await act(() => { onReturn(1); });
  expect(screen.getByRole('header', { name: '홈' })).toBeVisible();
  await act(() => { onReturn(2); onReturn(2); });
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(screen.getByLabelText('로그인 상태 확인 중')).toBeVisible();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
  await act(() => { held.resolve(authError(401, 'AUTHENTICATION_REQUIRED')); });
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
});

test('복귀 전 보호 요청의 늦은 401은 같은 경로로 들어온 새 사용자를 만료시키지 않는다', async () => {
  const changeAppState = observeAppState();
  const previous = pendingResponse();
  const next = pendingResponse();
  const fetchCall = realFetch(response(200, { data: account }), next.promise);
  const fetchFixture = fetchCall.getMockImplementation()!;
  fetchCall.mockImplementation((url, init) => String(url).endsWith('/children') ? previous.promise : fetchFixture(url, init));
  mockAccountLabel = '시험 사용자 A';
  markers.set(marker, 'true');
  await render(<App />);
  await finishSplash();
  expect(await screen.findByText('시험 사용자 A')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '아이 목록 확인' }));
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/children'))).toHaveLength(1);

  await changeAppState('background');
  await changeAppState('active');
  expect(screen.queryByText('시험 사용자 A')).not.toBeOnTheScreen();
  mockAccountLabel = '시험 사용자 B';
  await act(() => { next.resolve(response(200, { data: {
    ...account, accountId: '44444444-4444-4444-8444-444444444444', childId: '55555555-5555-4555-8555-555555555555',
  } })); });
  expect(await screen.findByText('시험 사용자 B')).toBeVisible();

  await act(() => { previous.resolve(authError(401, 'AUTHENTICATION_REQUIRED')); });
  expect(screen.getByText('시험 사용자 B')).toBeVisible();
  expect(screen.queryByRole('header', { name: '보호자 로그인' })).not.toBeOnTheScreen();
});

test('복귀 뒤 React가 최종 홈만 렌더해도 이전 사용자의 수신자를 새로 마운트한다', async () => {
  const createController = entry.createEntryController;
  let holdNotifications = false;
  let notify: (() => void) | undefined;
  jest.spyOn(entry, 'createEntryController').mockImplementation((client, readGeneration) => {
    const controller = createController(client, readGeneration);
    return {
      ...controller,
      subscribe: listener => controller.subscribe(() => {
        if (holdNotifications) notify = listener;
        else listener();
      }),
    };
  });
  const changeAppState = observeAppState();
  markers.set(marker, 'true');
  mockAccountLabel = '시험 사용자 A';
  const nextAccount = { ...account, accountId: '44444444-4444-4444-8444-444444444444' };
  realFetch(response(200, { data: account }), response(200, { data: nextAccount }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByText('시험 사용자 A')).toBeVisible();

  holdNotifications = true;
  await changeAppState('background');
  mockAccountLabel = '시험 사용자 B';
  await changeAppState('active');
  await act(() => { notify?.(); });

  expect(await screen.findByText('시험 사용자 B')).toBeVisible();
  expect(screen.queryByText('시험 사용자 A')).not.toBeOnTheScreen();
});

test('첫 조회의 늦은 성공은 복귀 후 확인된 로그인 화면을 되돌리지 않는다', async () => {
  const changeAppState = observeAppState();
  const previous = pendingResponse();
  markers.set(marker, 'true');
  realFetch(previous.promise, authError(401, 'AUTHENTICATION_REQUIRED'));
  await render(<App />);
  await finishSplash();
  expect(screen.getByLabelText('로그인 상태 확인 중')).toBeVisible();

  await changeAppState('background');
  await changeAppState('active');
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  await act(() => { previous.resolve(response(200, { data: account })); });
  expect(screen.getByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
});

test('복귀 조회가 503이면 이전 아이 등록 화면을 가린 채 재시도를 안내한다', async () => {
  const changeAppState = observeAppState();
  markers.set(marker, 'true');
  realFetch(response(200, { data: { ...account, childId: null } }), authError(503, 'AUTH_STATE_UNAVAILABLE'));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '아이 등록' })).toBeVisible();

  await changeAppState('background');
  await changeAppState('active');
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
});

async function finishSplash() {
  await fireEvent.press(screen.getByRole('button', { name: '스플래시 마치기' }));
}

test.each(['missing-url', 'production-mock'])('유효하지 않은 설정 %s는 요청이나 목적지 표시 없이 안내한다', async problem => {
  if (problem === 'missing-url') delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_MODE = 'mock';
  }
  markers.set(marker, 'true');
  const fetchCall = realFetch();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByText('앱 설정을 확인할 수 없어요.')).toBeVisible();
  expect(fetchCall).not.toHaveBeenCalled();
  expect(screen.queryByRole('header')).not.toBeOnTheScreen();
});

async function skipMicrophoneFromOnboarding() {
  expect(await screen.findByRole('header', { name: '아이의 하루를 들어주는 마음 친구, 도담이' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
  await fireEvent.press(screen.getByRole('button', { name: '다음에 할래요' }));
}

test('첫 실행 중 먼저 도착한 401은 온보딩 완료 뒤 로그인으로 이어지고 재실행 때 안내를 건너뛴다', async () => {
  const fetchCall = realFetch(authError(401, 'AUTHENTICATION_REQUIRED'), authError(401, 'AUTHENTICATION_REQUIRED'));
  await render(<App />);
  expect(fetchCall.mock.calls.map(([url]) => url)).toEqual([
    'https://api.example.invalid/api/v1/auth/csrf', 'https://api.example.invalid/api/v1/auth/me',
  ]);
  expect(screen.queryByRole('header', { name: '보호자 로그인' })).not.toBeOnTheScreen();

  await finishSplash();
  await skipMicrophoneFromOnboarding();
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect([...markers]).toEqual([[marker, 'true']]);

  await screen.unmount();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '아이의 하루를 들어주는 마음 친구, 도담이' })).not.toBeOnTheScreen();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});

test('저장소 오류가 있어도 안내를 볼 수 있고 쓰기가 실패한 뒤 이번 실행의 목적지로 이동한다', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Storage unavailable'));
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage unavailable'));
  realFetch(response(200, { data: account }), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  await skipMicrophoneFromOnboarding();
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  expect(markers.size).toBe(0);

  await screen.unmount();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '아이의 하루를 들어주는 마음 친구, 도담이' })).toBeVisible();
});

test('마이크 안내 중 앱 상태가 바뀌어도 같은 안내를 유지하고 복귀 조회는 한 번만 한다', async () => {
  const changeAppState = observeAppState();
  const fetchCall = realFetch(response(200, { data: account }), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: '다음' }));
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));

  await changeAppState('inactive');
  await changeAppState('active');
  expect(screen.getByRole('button', { name: '다음에 할래요' })).toBeVisible();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1);

  await changeAppState('background');
  await changeAppState('active');
  await changeAppState('active');
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2);
  await fireEvent.press(screen.getByRole('button', { name: '다음에 할래요' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
});

test('mock 모드는 실제 fetch에 닿지 않고 기본 미등록 계정을 아이 등록으로 분기한다', async () => {
  process.env.EXPO_PUBLIC_API_MODE = 'mock';
  markers.set(marker, 'true');
  const fetchCall = realFetch();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '아이 프로필' })).toBeVisible();
  expect(fetchCall).not.toHaveBeenCalled();
});

test('real 모드의 조회 실패 동안 목적지를 숨기고 명시적 재시도 뒤 목적지를 렌더링한다', async () => {
  markers.set(marker, 'true');
  const fetchCall = realFetch(authError(503, 'AUTH_STATE_UNAVAILABLE'), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('header', { name: '보호자 로그인' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1);

  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
});

test('공통 세션을 쓰는 보호 목적지가 현재 401을 전달하면 홈을 내리고 로그인으로 전환한다', async () => {
  markers.set(marker, 'true');
  realFetch(response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '아이 목록 확인' }));
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test.each(['앱 사용 중', '백그라운드 복귀'])('429 %s: 기한이 지나도 사용자가 눌러야 다시 조회한다', async (scenario) => {
  jest.useFakeTimers();
  const changeAppState = observeAppState();
  markers.set(marker, 'true');
  const fetchCall = realFetch(authError(429, 'RATE_LIMITED', { 'Retry-After': '3' }), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  expect(retry).toBeDisabled();

  if (scenario === '백그라운드 복귀') {
    await changeAppState('background');
    jest.setSystemTime(Date.now() + 3_000);
    await changeAppState('active');
  } else {
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
  }
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('header', { name: '홈' })).toBeVisible();
});

test('네이티브 예약 한도를 넘는 Retry-After 값에서도 실제 마감까지 재시도를 잠근다', async () => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const fetchCall = realFetch(authError(429, 'RATE_LIMITED', { 'Retry-After': '2147485' }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeDisabled();

  await act(async () => { await jest.advanceTimersByTimeAsync(2_147_483_648); });
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeDisabled();
  await act(async () => { await jest.advanceTimersByTimeAsync(1_352); });
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
  expect(fetchCall.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1);
});

const homePath = `/api/v1/children/${account.childId}/home`;
const homeAtNoon = createHomeFixture({ serverTime: '2026-11-24T12:00:00+09:00' });

function homeServer(readHome: () => Response | Promise<Response>, getAccount = () => response(200, { data: account })) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/auth/csrf')) {
      return response(200, { headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'public-test-fixture' });
    }
    if (path.endsWith('/auth/me')) return getAccount();
    if (path === homePath && init?.method === 'GET' && init.credentials === 'include') return readHome();
    throw new Error('Unexpected home fixture request');
  });
}

test('등록된 아이의 ID로 일반 앱 진입에서 홈을 한 번만 조회한다', async () => {
  markers.set(marker, 'true');
  const server = homeServer(() => response(200, { data: homeAtNoon }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByText(homeAtNoon.greeting)).toBeVisible();
  expect(screen.getByText(`${homeAtNoon.daysTogether}일째`)).toBeVisible();
  expect(server.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/api/v1/auth/csrf', '/api/v1/auth/me', homePath,
  ]);
  expect(screen.queryByRole('header', { name: '아이 등록' })).not.toBeOnTheScreen();
});

test.each([
  [response(200, { data: { ...account, childId: null } }), '아이 등록'],
  [authError(401, 'AUTHENTICATION_REQUIRED'), '보호자 로그인'],
])('%# 홈 진입 대상이 아니면 홈 요청을 보내지 않는다', async (accountResponse, heading) => {
  markers.set(marker, 'true');
  const home = jest.fn(() => response(200, { data: homeAtNoon }));
  homeServer(home, () => accountResponse);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: heading })).toBeVisible();
  expect(home).not.toHaveBeenCalled();
});

test.each<[string, string | null, HomeDestination]>([
  ['대화하기', null, { route: '/conversation', childId: account.childId, intent: 'start' }],
  ['도담이 캐릭터로 대화하기', null, { route: '/conversation', childId: account.childId, intent: 'start' }],
  ['이어하기', '33333333-3333-4333-8333-333333333333',
    { route: '/conversation', childId: account.childId, intent: 'resume', conversationId: '33333333-3333-4333-8333-333333333333' }],
  ['도담이 캐릭터로 이어하기', '33333333-3333-4333-8333-333333333333',
    { route: '/conversation', childId: account.childId, intent: 'resume', conversationId: '33333333-3333-4333-8333-333333333333' }],
  ['보호자 모드', null, { route: '/guardian', childId: account.childId }],
])('%s 탭의 값을 목적지에서 받고, 뒤로 돌아오면 홈만 다시 조회한다', async (label, activeConversationId, destination) => {
  markers.set(marker, 'true');
  const data = createHomeFixture({
    serverTime: label === '보호자 모드' ? '2026-11-24T02:00:00+09:00' : homeAtNoon.availability.serverTime,
    activeConversationId,
  });
  const home = jest.fn(() => response(200, { data }));
  const server = homeServer(home);
  await render(<App />);
  await finishSplash();
  const button = await screen.findByRole('button', { name: label });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(mockHomeDestination.mock.calls).toEqual([[destination]]);
  await fireEvent.press(screen.getByRole('button', { name: '홈으로 돌아가기' }));
  expect(await screen.findByText(data.greeting)).toBeVisible();
  expect(home).toHaveBeenCalledTimes(2);
  expect(server.mock.calls.filter(([, init]) => init?.method !== 'GET')).toHaveLength(0);
  expect(server.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(1);
});

test('홈 429 대기 중 앱 복귀가 요청을 보내지 않고 기한 후 정상 복귀는 홈을 한 번 조회한다', async () => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const changeAppState = observeAppState();
  const home = jest.fn(() => authError(429, 'RATE_LIMITED', { 'Retry-After': '8' }))
    .mockImplementationOnce(() => authError(429, 'RATE_LIMITED', { 'Retry-After': '8' }))
    .mockImplementationOnce(() => response(200, { data: homeAtNoon }));
  homeServer(home);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeDisabled();
  jest.setSystemTime(Date.now() + 86_400_000);
  await changeAppState('background');
  await changeAppState('active');
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeDisabled();
  expect(home).toHaveBeenCalledTimes(1);
  await act(() => { jest.advanceTimersByTime(8_000); });
  await changeAppState('background');
  await changeAppState('active');
  expect(await screen.findByText(homeAtNoon.greeting)).toBeVisible();
  expect(home).toHaveBeenCalledTimes(2);
});

test.each([
  [authError(404, 'RESOURCE_NOT_FOUND'), '홈'],
  [authError(401, 'AUTHENTICATION_REQUIRED'), '보호자 로그인'],
])('%# 홈 응답의 오류는 아이 등록으로 보내지 않는다', async (homeResponse, heading) => {
  markers.set(marker, 'true');
  homeServer(() => homeResponse);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: heading })).toBeVisible();
  if (heading === '홈') expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('header', { name: '아이 등록' })).not.toBeOnTheScreen();
});

test.each([200, 401])('로그아웃 전 홈 %s 본문이 늦어도 새 계정 홈만 표시한다', async status => {
  const first = createHomeFixture({ nickname: '이전아이', serverTime: homeAtNoon.availability.serverTime });
  const next = createHomeFixture({ nickname: '새아이', serverTime: homeAtNoon.availability.serverTime });
  const late = status === 200 ? response(200, { data: first }) : authError(401, 'AUTHENTICATION_REQUIRED');
  const copy = status === 401 ? late.clone() : late;
  const body = pauseBody(copy);
  if (status === 401) jest.spyOn(late, 'clone').mockReturnValueOnce(copy);
  const logout = pause();
  const home = jest.fn((session: typeof account) => response(200, { data: session === accountA ? first : next }))
    .mockReturnValueOnce(response(200, { data: first })).mockReturnValueOnce(late);
  const server = authFlowFetch({ home, logout: logout.wait });

  await openLoginForm(accountA.email);
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText(first.greeting)).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '보호자 모드' }));
  await fireEvent.press(screen.getByRole('button', { name: '홈으로 돌아가기' }));
  await waitFor(() => expect(body.wait).toHaveBeenCalledTimes(1));

  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect(await screen.findByText('로그아웃 중')).toBeVisible();
  expect(screen.queryByText(first.greeting)).not.toBeOnTheScreen();
  await act(() => { logout.release(); });
  await expectBlankLogin();
  await fillLoginForm(accountB.email, ' x ');
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText(next.greeting)).toBeVisible();
  await act(() => { body.release(); });

  expect(screen.getByText(next.greeting)).toBeVisible();
  expect(screen.queryByText(first.greeting)).not.toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: '보호자 로그인' })).not.toBeOnTheScreen();
  expect(server.calls('/home')).toHaveLength(3);
});

test('서버 자정과 08시 경계에서 새로 조회하며 08시 오류가 대화를 허용하지 않는다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-23T12:00:00-05:00'));
  markers.set(marker, 'true');
  const open = createHomeFixture({ serverTime: '2026-11-24T23:59:58+09:00' });
  const closed = createHomeFixture({ serverTime: '2026-11-25T07:59:58+09:00' });
  const home = jest.fn(() => authError(503, 'AUTH_STATE_UNAVAILABLE'))
    .mockReturnValueOnce(response(200, { data: open }))
    .mockReturnValueOnce(response(200, { data: closed }))
    .mockReturnValueOnce(authError(503, 'AUTH_STATE_UNAVAILABLE'))
    .mockReturnValueOnce(response(200, { data: homeAtNoon }));
  homeServer(home);
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('button', { name: '대화하기' })).toBeEnabled();
  await act(() => { jest.advanceTimersByTime(1_500); });
  expect(screen.getByRole('button', { name: '대화하기' })).toBeDisabled();
  expect(home).toHaveBeenCalledTimes(1);
  await act(() => { jest.advanceTimersByTime(500); });
  expect(await screen.findByText('오전 8시에 만나요')).toBeVisible();
  expect(screen.getByRole('button', { name: '대화하기' })).toBeDisabled();
  await act(() => { jest.advanceTimersByTime(2_000); });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('button', { name: '대화하기' })).not.toBeOnTheScreen();
  expect(home).toHaveBeenCalledTimes(3);
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('button', { name: '대화하기' })).toBeEnabled();
});

test('08시 홈 갱신은 준비 중 화면을 유지하고 조회 중 닫아도 새 홈에서 포커스를 복원한다', async () => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  const beforeOpening = createHomeFixture({ serverTime: '2026-11-25T07:59:58+09:00' });
  const boundary = pendingResponse();
  const home = jest.fn<() => Response | Promise<Response>>()
    .mockReturnValueOnce(response(200, { data: beforeOpening }))
    .mockReturnValueOnce(boundary.promise);
  homeServer(home);
  await render(<App />);
  await finishSplash();
  const menu = '같이 놀기 · 준비 중';
  await fireEvent.press(await screen.findByRole('button', { name: menu }));

  await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });
  expect(home).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('header', { name: '같이 놀기' })).toBeVisible();
  expect(screen.queryByText('홈 정보 확인 중')).not.toBeOnTheScreen();
  focus.mockClear();

  await fireEvent.press(screen.getByRole('button', { name: '홈으로 돌아가기' }));
  expect(screen.getByText('홈 정보 확인 중')).toBeVisible();
  await act(async () => { await jest.advanceTimersByTimeAsync(20); });
  expect(focus).not.toHaveBeenCalled();

  await act(async () => { boundary.resolve(response(200, { data: homeAtNoon })); });
  expect(screen.getByRole('button', { name: '대화하기' })).toBeEnabled();
  await act(async () => { await jest.advanceTimersByTimeAsync(20); });
  expect(focus).toHaveBeenCalledTimes(1);
  const target = focus.mock.lastCall?.[0] as unknown as { props?: { accessibilityLabel?: string } };
  expect(target?.props?.accessibilityLabel).toBe(menu);
  expect(focus.mock.lastCall?.[1]).toBe('focus');
  expect(home).toHaveBeenCalledTimes(2);
});

test.each<[number, string]>([
  [503, 'AUTH_STATE_UNAVAILABLE'],
  [401, 'AUTHENTICATION_REQUIRED'],
])('자정 출석 안내가 열렸을 때 %s 홈 갱신 결과를 반영한다', async (status, code) => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const beforeMidnight = createHomeFixture({ serverTime: '2026-11-24T23:59:58+09:00' });
  const boundary = pendingResponse();
  const home = jest.fn<() => Response | Promise<Response>>()
    .mockReturnValueOnce(response(200, { data: beforeMidnight }))
    .mockReturnValueOnce(boundary.promise);
  homeServer(home);
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: '출석 · 준비 중' }));

  await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });
  expect(screen.getByRole('header', { name: '출석 보상은 준비 중이에요!' })).toBeVisible();
  expect(screen.queryByText('홈 정보 확인 중')).not.toBeOnTheScreen();
  await act(async () => { boundary.resolve(authError(status, code)); });

  if (status === 401) {
    expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
    expect(screen.queryByRole('header', { name: '출석 보상은 준비 중이에요!' })).not.toBeOnTheScreen();
  } else {
    expect(screen.getByRole('header', { name: '출석 보상은 준비 중이에요!' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '확인' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
  }
  expect(home).toHaveBeenCalledTimes(2);
});

test('출석 안내 열기·닫기는 네트워크를 사용하지 않고 앱을 다녀오면 안내가 닫힌 홈을 갱신한다', async () => {
  markers.set(marker, 'true');
  const changeAppState = observeAppState();
  const home = jest.fn(() => response(200, { data: homeAtNoon }));
  const server = homeServer(home);
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: '출석 · 준비 중' }));
  expect(screen.getByRole('header', { name: '출석 보상은 준비 중이에요!' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '대화하기' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(server.mock.calls).toHaveLength(3);

  await fireEvent.press(screen.getByRole('button', { name: '출석 · 준비 중' }));
  await changeAppState('background');
  await changeAppState('active');
  expect(await screen.findByText(homeAtNoon.greeting)).toBeVisible();
  expect(screen.queryByRole('header', { name: '출석 보상은 준비 중이에요!' })).not.toBeOnTheScreen();
  expect(home).toHaveBeenCalledTimes(2);
});

test.each(['도담이 꾸미기', '추억 다시보기', '같이 놀기'])('%s 그림과 라벨은 같은 준비 중 화면을 열고 홈으로 돌아올 때 추가 요청이 없다', async label => {
  markers.set(marker, 'true');
  const server = homeServer(() => response(200, { data: homeAtNoon }));
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: `${label} · 준비 중` }));
  expect(screen.getByRole('header', { name: label })).toBeVisible();
  expect(screen.getByText('준비 중이에요.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '홈으로 돌아가기' }));
  expect(await screen.findByText(homeAtNoon.greeting)).toBeVisible();
  expect(server.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/api/v1/auth/csrf', '/api/v1/auth/me', homePath,
  ]);
});

test('첫 실행에서 임시 보호자 계정으로 로그인에 성공한 뒤 등록된 별이의 홈을 연다', async () => {
  const server = authFlowFetch({
    home: () => response(200, { data: homeAtNoon }),
  });
  await render(<App />);
  await finishSplash();
  await skipMicrophoneFromOnboarding();
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(server.calls('/home')).toHaveLength(0);

  await fillLoginForm(accountA.email, 'incorrect-fixture-password');
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('입력한 이메일과 비밀번호를 확인해 주세요.');
  expect(server.calls('/home')).toHaveLength(0);

  await fireEvent.changeText(screen.getByLabelText('비밀번호'), ' x ');
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByText(homeAtNoon.greeting)).toBeVisible();
  expect(server.calls('/auth/login')).toHaveLength(2);
  expect(server.calls('/auth/me')).toHaveLength(2);
  expect(server.calls('/home')).toHaveLength(1);
  expect(server.calls('/children')).toHaveLength(0);
  expect(screen.queryByRole('header', { name: '아이 등록' })).not.toBeOnTheScreen();
});

const registeredChildId = '44444444-4444-4444-8444-444444444444';
const newHomePath = `/children/${registeredChildId}/home`;

function registrationServer(reply?: (request: ExampleRequest, handle: () => Promise<Response>) => Promise<Response>) {
  process.env.EXPO_PUBLIC_API_MODE = 'mock';
  markers.set(marker, 'true');
  const network = realFetch();
  const handlers = jest.spyOn(mockApi, 'registerExampleHandlers');
  const original = handlers.getMockImplementation()!;
  const requests: ExampleRequest[] = [];
  handlers.mockImplementation(scenario => {
    const handler = original(scenario);
    return request => {
      requests.push(request);
      return reply ? reply(request, () => handler(request)) : handler(request);
    };
  });
  const trace = () => requests.map(({ method, path }) => `${method} ${path}`);
  return { requests, trace, network };
}

async function openRegistrationConfirmation(previewUpcoming = false) {
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '아이 프로필' })).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('아이 이름'), '가상');
  await fireEvent.changeText(screen.getByLabelText('아이 애칭'), '새싹');
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2020-02-29T03:00:00Z'));
  await fireEvent.press(screen.getByRole('button', { name: '생년월일 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  clock.mockRestore();
  await fireEvent.press(screen.getByRole('button', { name: '성별' }));
  await fireEvent.press(screen.getByRole('button', { name: '남자' }));
  const interestInput = screen.getByLabelText('직접 입력');
  await fireEvent.changeText(interestInput, ' 그림 ');
  await fireEvent(interestInput, 'submitEditing');
  if (previewUpcoming) {
    await fireEvent.press(screen.getByRole('button', { name: '남자 도담이' }));
    expect(screen.getByRole('button', { name: '남자 도담이', expanded: true })).toBeVisible();
    expect(screen.getByText('준비 중이에요')).toBeVisible();
    expect(screen.getByTestId('child-upcoming-lock')).toBeVisible();
  }
  await fireEvent.press(screen.getByRole('button', { name: previewUpcoming ? '여자 도담이로 계속' : '다음으로' }));
  expect(await screen.findByRole('header', { name: '등록 확인' })).toBeVisible();
}

async function pressRegister() {
  await fireEvent.press(screen.getByRole('button', { name: '등록하고 시작' }));
}

const registrationStart = ['GET /auth/csrf', 'GET /auth/me'];

const expectedRegistration = {
  name: '가상', nickname: '새싹', birthDate: '2020-02-29', gender: 'MALE',
  interests: ['그림'], characterId: 'test-dodam-girl',
};

test('새 프로필에서 여자 도담이가 기본으로 선택된다', async () => {
  registrationServer();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('button', { name: '여자 도담이' })).toBeSelected();
  expect(screen.getByRole('button', { name: '남자 도담이' })).not.toBeSelected();
});

test('아이 프로필에서 로그인 화면으로 돌아갔다가 재진입하면 세션을 유지하고 입력을 초기화한다', async () => {
  const server = registrationServer();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  const pageTransitions = () => timing.mock.calls.filter(([, config]) => config.duration === 180);
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: '남자 도담이' }));
  await fireEvent.changeText(screen.getByLabelText('아이 이름'), '가상');
  await fireEvent.changeText(screen.getByLabelText('아이 애칭'), '새싹');
  await fireEvent.press(screen.getByRole('button', { name: '생년월일 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '성별' }));
  await fireEvent.press(screen.getByRole('button', { name: '여자' }));
  await fireEvent.press(screen.getByRole('button', { name: '그림' }));
  await fireEvent.changeText(screen.getByLabelText('직접 입력'), '종이접기');

  await fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));
  expect(await screen.findByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.queryByLabelText('아이 이름')).not.toBeOnTheScreen();
  expect(server.trace()).toEqual(registrationStart);
  expect(pageTransitions()).toHaveLength(1);

  await fireEvent.press(screen.getByRole('button', { name: '아이 등록 계속하기' }));
  expect(screen.getByLabelText('아이 이름')).toHaveDisplayValue('');
  expect(screen.getByLabelText('아이 애칭')).toHaveDisplayValue('');
  expect(screen.getByRole('button', { name: '생년월일 선택' })).toHaveAccessibilityValue({ text: '선택하지 않음' });
  expect(screen.getByRole('button', { name: '성별' })).toHaveAccessibilityValue({ text: '선택하지 않음' });
  expect(screen.getByLabelText('직접 입력')).toHaveDisplayValue('');
  expect(screen.getByRole('button', { name: '그림' })).not.toBeSelected();
  expect(screen.getByRole('button', { name: '여자 도담이' })).toBeSelected();
  expect(screen.getByRole('button', { name: '다음으로' })).toBeDisabled();
  expect(pageTransitions()).toHaveLength(2);
  expect(server.trace()).toEqual(registrationStart);
  expect(server.network).not.toHaveBeenCalled();
});

test('보호자 화면에서 명시적으로 로그아웃하면 기존 로그인 양식을 연다', async () => {
  const server = registrationServer();
  await render(<App />);
  await finishSplash();
  await fireEvent.press(await screen.findByRole('button', { name: '뒤로 가기' }));
  expect(server.trace()).toEqual(registrationStart);
  await fireEvent.press(screen.getByRole('button', { name: '로그아웃' }));
  expect(await screen.findByLabelText('이메일')).toBeVisible();
  expect(server.trace()).toEqual([...registrationStart, 'POST /auth/logout', 'GET /auth/csrf']);
  expect(server.network).not.toHaveBeenCalled();
});

test('확인에서 돌아와도 입력을 유지하고 등록 연타에도 한 번만 제출해 같은 아이의 홈을 연다', async () => {
  const changeAppState = observeAppState();
  const createController = jest.spyOn(entry, 'createEntryController');
  const pending = pause();
  const checkAccount = pause();
  let created = false;
  const server = registrationServer(async ({ method, path }, handle) => {
    if (method === 'POST' && path === '/children') {
      await pending.wait();
      const result = await handle();
      created = true;
      return result;
    }
    if (created && path === '/auth/me') await checkAccount.wait();
    return handle();
  });
  await openRegistrationConfirmation(true);
  expect(screen.getByText('아이 이름 가상 · 여자 도담이')).toBeVisible();
  expect(server.trace()).toEqual(registrationStart);
  await fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));
  expect(screen.getByLabelText('아이 이름')).toHaveDisplayValue('가상');
  expect(screen.getByLabelText('아이 애칭')).toHaveDisplayValue('새싹');
  expect(screen.getByRole('button', { name: '생년월일 선택' })).toHaveTextContent('2020.02.29');
  expect(screen.queryByText('준비 중이에요')).not.toBeOnTheScreen();
  expect(screen.queryByPlaceholderText('YYYY-MM-DD')).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '다음으로' }));
  expect(server.trace()).toEqual(registrationStart);

  const register = screen.getByRole('button', { name: '등록하고 시작' });
  await fireEvent.press(register);
  await waitFor(() => expect(pending.wait).toHaveBeenCalledTimes(1));
  expect(register).toBeDisabled();
  await fireEvent.press(register);
  expect(server.trace()).toEqual([...registrationStart, 'POST /children']);
  expect(JSON.parse(String(server.requests[2].body))).toEqual(expectedRegistration);
  await act(() => { pending.release(); });
  await waitFor(() => expect(checkAccount.wait).toHaveBeenCalledTimes(1));
  expect(server.trace()).toEqual([...registrationStart, 'POST /children', 'GET /auth/me']);
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  await act(() => { checkAccount.release(); });

  expect(await screen.findByText('새싹, 오늘도 반가워!')).toBeVisible();
  expect(server.trace()).toEqual([...registrationStart, 'POST /children', 'GET /auth/me', `GET ${newHomePath}`]);
  expect(server.network).not.toHaveBeenCalled();
  const result = createController.mock.results[0];
  if (result?.type !== 'return') throw new Error('Expected entry controller');
  expect(result.value.getSnapshot()).toMatchObject({ route: '/home', transition: 'registration-complete' });
  await changeAppState('background');
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  expect(await screen.findByText('새싹, 오늘도 반가워!')).toBeVisible();
  expect(result.value.getSnapshot()).not.toHaveProperty('transition');
});

test('이미 아이가 등록된 경우 목록과 계정의 아이 ID를 확인하고 다시 제출하지 않는다', async () => {
  const server = registrationServer(async (request, handle) => {
    const result = await handle();
    return request.method === 'POST' && request.path === '/children'
      ? authError(409, 'CHILD_LIMIT_REACHED') : result;
  });
  await openRegistrationConfirmation();
  await pressRegister();

  expect(await screen.findByText('새싹, 오늘도 반가워!')).toBeVisible();
  expect(server.trace()).toEqual([
    ...registrationStart, 'POST /children', 'GET /children', 'GET /auth/me', `GET ${newHomePath}`,
  ]);
  expect(server.network).not.toHaveBeenCalled();
});

test('등록 응답 유실 뒤 사용자가 상태를 확인하면 저장된 아이의 홈을 열고 POST를 반복하지 않는다', async () => {
  const server = registrationServer(async (request, handle) => {
    const result = await handle();
    if (request.method === 'POST' && request.path === '/children') throw new Error('Response lost after storage');
    return result;
  });
  await openRegistrationConfirmation();
  await pressRegister();

  expect(await screen.findByRole('header', { name: '등록 상태 확인' })).toBeVisible();
  await fireEvent.press(await screen.findByRole('button', { name: '뒤로 가기', disabled: false }));
  expect(screen.getByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(server.trace()).toEqual([...registrationStart, 'POST /children']);
  await fireEvent.press(screen.getByRole('button', { name: '아이 등록 계속하기' }));
  expect(screen.getByRole('header', { name: '등록 상태 확인' })).toBeVisible();
  const retry = screen.getByRole('button', { name: '다시 확인' });
  expect(server.trace()).toEqual([...registrationStart, 'POST /children']);
  await fireEvent.press(retry);
  expect(await screen.findByText('새싹, 오늘도 반가워!')).toBeVisible();
  expect(server.trace()).toEqual([
    ...registrationStart, 'POST /children', 'GET /children', 'GET /auth/me', `GET ${newHomePath}`,
  ]);
  expect(server.network).not.toHaveBeenCalled();
});

test('이미 등록 응답 뒤 아이 목록이 비어 있으면 읽기만 다시 시도한다', async () => {
  const server = registrationServer(async ({ method, path }, handle) => {
    if (method === 'POST' && path === '/children') return authError(409, 'CHILD_LIMIT_REACHED');
    return handle();
  });
  await openRegistrationConfirmation();
  await pressRegister();

  expect(await screen.findByRole('header', { name: '등록 상태 확인' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '등록하고 시작' })).not.toBeOnTheScreen();
  await fireEvent.press(await screen.findByRole('button', { name: '다시 확인', disabled: false }));
  expect(await screen.findByRole('button', { name: '다시 확인', disabled: false })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(server.trace()).toEqual([...registrationStart, 'POST /children', 'GET /children', 'GET /children']);
  expect(server.network).not.toHaveBeenCalled();
});

test.each([null, account.childId])('등록 201 뒤 계정 아이 ID가 %s이면 홈을 열거나 다시 제출하지 않는다', async childId => {
  let submitted = false;
  const server = registrationServer(async (request, handle) => {
    if (request.method === 'POST' && request.path === '/children') submitted = true;
    if (submitted && request.path === '/auth/me') return response(200, { data: { ...account, childId } });
    return handle();
  });
  await openRegistrationConfirmation();
  await pressRegister();

  await fireEvent.press(await screen.findByRole('button', { name: '다시 확인' }));
  expect(await screen.findByRole('button', { name: '다시 확인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(server.trace().filter(request => request.startsWith('POST '))).toEqual(['POST /children']);
  expect(server.trace().filter(request => request.endsWith('/home'))).toEqual([]);
  expect(server.network).not.toHaveBeenCalled();
});

test('등록 직후 조회가 다른 계정의 아이를 반환해도 홈을 열지 않는다', async () => {
  const changeAppState = observeAppState();
  let submitted = false;
  let returned = false;
  const otherChildId = '55555555-5555-4555-8555-555555555555';
  const otherHomePath = `/children/${otherChildId}/home`;
  const server = registrationServer(async ({ method, path }, handle) => {
    if (method === 'POST' && path === '/children') submitted = true;
    if (returned && path === '/auth/me') return response(200, { data: { ...accountB, childId: otherChildId } });
    if (returned && path === otherHomePath) {
      return response(200, { data: createHomeFixture({ childId: otherChildId, nickname: '다른아이' }) });
    }
    if (submitted && path === '/auth/me') return response(200, { data: { ...accountB, childId: registeredChildId } });
    return handle();
  });
  await openRegistrationConfirmation();
  await pressRegister();

  const retry = await screen.findByRole('button', { name: '다시 시도' });
  await fireEvent.press(retry);
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(server.trace()).toEqual([...registrationStart, 'POST /children', 'GET /auth/me', 'GET /auth/me']);

  await changeAppState('background');
  returned = true;
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  expect(await screen.findByText('다른아이, 오늘도 반가워!')).toBeVisible();
  expect(server.trace().slice(-2)).toEqual(['GET /auth/me', `GET ${otherHomePath}`]);
});

test.each([503, 429])('등록 직후 계정 조회 %i 뒤 복귀하면 첫 수동 재시도에서 현재 계정을 연다', async status => {
  if (status === 429) jest.useFakeTimers();
  const changeAppState = observeAppState();
  const otherChildId = '55555555-5555-4555-8555-555555555555';
  const otherHomePath = `/children/${otherChildId}/home`;
  let submitted = false;
  let returned = false;
  const server = registrationServer(async ({ method, path }, handle) => {
    if (method === 'POST' && path === '/children') submitted = true;
    if (returned && path === '/auth/me') return response(200, { data: { ...accountB, childId: otherChildId } });
    if (returned && path === otherHomePath) {
      return response(200, { data: createHomeFixture({ childId: otherChildId, nickname: '다른아이' }) });
    }
    if (submitted && path === '/auth/me') {
      return status === 429
        ? authError(429, 'RATE_LIMITED', { 'Retry-After': '3' }) : authError(503, 'AUTH_STATE_UNAVAILABLE');
    }
    return handle();
  });
  await openRegistrationConfirmation();
  await pressRegister();
  expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible();
  const failed = [...registrationStart, 'POST /children', 'GET /auth/me'];
  expect(server.trace()).toEqual(failed);

  await changeAppState('background');
  returned = true;
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  if (status === 429) {
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeDisabled();
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
  }
  expect(server.trace()).toEqual(failed);
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도', disabled: false }));
  expect(await screen.findByText('다른아이, 오늘도 반가워!')).toBeVisible();
  expect(server.trace()).toEqual([...failed, 'GET /auth/me', `GET ${otherHomePath}`]);
  expect(server.network).not.toHaveBeenCalled();
});

test.each([201, 401])('백그라운드 전 등록 응답 %i이 뒤늦게 도착해도 새 계정을 바꾸지 않는다', async status => {
  const changeAppState = observeAppState();
  const pending = pause();
  let switchedAccount = false;
  const server = registrationServer(async (request, handle) => {
    if (switchedAccount && request.path === '/auth/me') return response(200, { data: { ...accountB, childId: null } });
    const result = await handle();
    if (request.method === 'POST' && request.path === '/children') {
      await pending.wait();
      return status === 401 ? authError(401, 'AUTHENTICATION_REQUIRED') : result;
    }
    return result;
  });
  await openRegistrationConfirmation();
  await pressRegister();
  await waitFor(() => expect(pending.wait).toHaveBeenCalledTimes(1));

  await changeAppState('background');
  switchedAccount = true;
  jest.mocked(readForegroundGeneration).mockReturnValue(1);
  await changeAppState('active');
  expect(await screen.findByRole('header', { name: '아이 프로필' })).toBeVisible();
  const resumed = server.trace();
  await act(() => { pending.release(); });

  expect(screen.getByRole('header', { name: '아이 프로필' })).toBeVisible();
  expect(screen.getByLabelText('아이 이름')).toHaveDisplayValue('');
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: '보호자 로그인' })).not.toBeOnTheScreen();
  expect(server.trace()).toEqual(resumed);
  expect(server.network).not.toHaveBeenCalled();
});

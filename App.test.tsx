import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';

import App from './App';

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
  return {
    EntryDestination: function TestDestination(props: Parameters<typeof EntryDestination>[0]) {
      const { client, receiveProtectedAuthResult } = useEntrySession();
      const [accountLabel] = useState(() => mockAccountLabel);
      async function openChildren() {
        const result = await client.request({ method: 'GET', path: '/children' });
        await receiveProtectedAuthResult(result);
      }
      return <>
        <EntryDestination {...props} />
        {props.route === '/home' && (
          <>
            {accountLabel && <Text>{accountLabel}</Text>}
            <Pressable accessibilityRole="button" onPress={() => { void openChildren(); }}><Text>아이 목록 확인</Text></Pressable>
          </>
        )}
      </>;
    },
  };
});

const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_MODE', 'EXPO_PUBLIC_API_BASE_URL'] as const;
const saved = keys.map(key => process.env[key]);
const markers = new Map<string, string>();
const marker = '@dodamdodam/onboarding-complete-v1';
let mockAccountLabel: string | undefined;
const account = {
  accountId: '11111111-1111-4111-8111-111111111111',
  email: 'guardian@example.com',
  childId: '22222222-2222-4222-8222-222222222222',
  hasPin: false,
  guardianUnlockedUntil: null,
};

beforeEach(() => {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_API_MODE = 'real';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';
  markers.clear();
  mockAccountLabel = undefined;
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
  expect(await screen.findByRole('header', { name: '로그인' })).toBeVisible();
  expect(screen.queryByRole('header', { name: '홈' })).not.toBeOnTheScreen();
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
  expect(screen.queryByRole('header', { name: '로그인' })).not.toBeOnTheScreen();
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
  expect(await screen.findByRole('header', { name: '로그인' })).toBeVisible();
  await act(() => { previous.resolve(response(200, { data: account })); });
  expect(screen.getByRole('header', { name: '로그인' })).toBeVisible();
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
  expect(screen.queryByRole('header', { name: '로그인' })).not.toBeOnTheScreen();

  await finishSplash();
  await skipMicrophoneFromOnboarding();
  expect(await screen.findByRole('header', { name: '로그인' })).toBeVisible();
  expect([...markers]).toEqual([[marker, 'true']]);

  await screen.unmount();
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('header', { name: '로그인' })).toBeVisible();
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
  expect(await screen.findByRole('header', { name: '아이 등록' })).toBeVisible();
  expect(fetchCall).not.toHaveBeenCalled();
});

test('real 모드의 조회 실패 동안 목적지를 숨기고 명시적 재시도 뒤 목적지를 렌더링한다', async () => {
  markers.set(marker, 'true');
  const fetchCall = realFetch(authError(503, 'AUTH_STATE_UNAVAILABLE'), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('header', { name: '로그인' })).not.toBeOnTheScreen();
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
  expect(await screen.findByRole('header', { name: '로그인' })).toBeVisible();
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

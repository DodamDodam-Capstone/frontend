import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

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
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const { EntryDestination } = jest.requireActual<typeof import('./src/navigation/EntryDestination')>('./src/navigation/EntryDestination');
  const { useEntrySession } = jest.requireActual<typeof import('./src/navigation/entrySession')>('./src/navigation/entrySession');
  return {
    EntryDestination: function TestDestination(props: Parameters<typeof EntryDestination>[0]) {
      const { client, receiveProtectedAuthResult } = useEntrySession();
      async function openChildren() {
        const result = await client.request({ method: 'GET', path: '/children' });
        await receiveProtectedAuthResult(result);
      }
      return <>
        <EntryDestination {...props} />
        {props.route === '/home' && (
          <Pressable accessibilityRole="button" onPress={() => { void openChildren(); }}><Text>아이 목록 확인</Text></Pressable>
        )}
      </>;
    },
  };
});

const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_MODE', 'EXPO_PUBLIC_API_BASE_URL'] as const;
const saved = keys.map(key => process.env[key]);
const markers = new Map<string, string>();
const marker = '@dodamdodam/onboarding-complete-v1';
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

function realFetch(...accounts: Response[]) {
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

test('429 조회 대기 중에는 자동 호출 없이 재시도가 비활성이고 대기 후 사용자가 재시도한다', async () => {
  jest.useFakeTimers();
  markers.set(marker, 'true');
  const fetchCall = realFetch(authError(429, 'RATE_LIMITED', { 'Retry-After': '3' }), response(200, { data: account }));
  await render(<App />);
  await finishSplash();
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  expect(retry).toBeDisabled();

  await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
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

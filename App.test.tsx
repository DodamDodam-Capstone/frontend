import { afterEach, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import App from './App';

const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_MODE', 'EXPO_PUBLIC_API_BASE_URL'] as const;
const saved = keys.map((key) => process.env[key]);

afterEach(() => {
  keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key];
    else process.env[key] = saved[index];
  });
});

test('시작 화면에 도담도담 제목을 접근 가능한 헤더로 표시한다', async () => {
  await render(<App />);

  expect(screen.getByRole('header', { name: '도담도담' })).toBeVisible();
});

test('개발 화면에서 mock 계정 상태 응답을 실제 수신자 경로로 확인한다', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_API_MODE = 'mock';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';

  await render(<App />);

  expect(await screen.findByText('mock GET /auth/me: 200')).toBeVisible();
});

test('개발 화면에서 real 모드를 선택해도 서버 요청을 시작하지 않는다', async () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_API_MODE = 'real';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.invalid/api/v1';

  await render(<App />);

  expect(await screen.findByText('real API 모드 선택: 서버 요청 없음')).toBeVisible();
});

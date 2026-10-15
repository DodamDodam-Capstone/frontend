import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import App from './App';

test('시작 화면에 도담도담 제목을 접근 가능한 헤더로 표시한다', async () => {
  await render(<App />);

  expect(screen.getByRole('header', { name: '도담도담' })).toBeVisible();
});

import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Logo } from './Logo';

test('로고 다섯 조각을 도담도담 이미지 하나로 안내한다', async () => {
  await render(<Logo />);

  expect(screen.getByRole('image', { name: '도담도담' })).toBeVisible();
  expect(screen.getAllByRole('image')).toHaveLength(1);
});

test('시작 화면의 제목으로 사용하면 이미지와 제목을 중복 안내하지 않는다', async () => {
  await render(<Logo accessibilityRole="header" />);

  expect(screen.getByRole('header', { name: '도담도담' })).toBeVisible();
  expect(screen.queryAllByRole('image')).toHaveLength(0);
});

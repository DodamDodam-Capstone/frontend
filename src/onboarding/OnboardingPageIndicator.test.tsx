import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { OnboardingPageIndicator } from './OnboardingPageIndicator';

const renderAt = async (progress: number, page: 0 | 1 | 2) => {
  const onSelect = jest.fn();
  await render(<OnboardingPageIndicator progress={new Animated.Value(progress)} page={page}
    onSelect={onSelect} largeControls={false} />);
  return onSelect;
};

test.each([
  { progress: 0, center: 14, stretch: 1 },
  { progress: 0.5, center: 22, stretch: 1.4 },
  { progress: 1, center: 30, stretch: 1 },
  { progress: 1.5, center: 38, stretch: 1.4 },
  { progress: 2, center: 46, stretch: 1 },
])('페이지 진행 위치 $progress 에서 초록 표시의 중심과 늘어난 길이를 그린다', async ({ progress, center, stretch }) => {
  await renderAt(progress, 0);
  expect(screen.getByTestId('onboarding-active-mark', { includeHiddenElements: true }))
    .toHaveStyle({ transform: [{ translateX: center }] });
  expect(screen.getByTestId('onboarding-mark-bridge', { includeHiddenElements: true }))
    .toHaveStyle({ width: 20, height: 8, backgroundColor: '#75CC3F', transform: [{ scaleX: stretch }] });
});

test('첫 장에서 가운데 표시를 누르면 2장을 선택한다', async () => {
  const onSelect = await renderAt(0, 0);
  const button = screen.getByRole('button', { name: '온보딩 2장, 전체 3장', selected: false });
  expect(button).toHaveStyle({ width: 24, minHeight: 48 });
  await fireEvent.press(button);
  expect(onSelect).toHaveBeenCalledWith(1);
});

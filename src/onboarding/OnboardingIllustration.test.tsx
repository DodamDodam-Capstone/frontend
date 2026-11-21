import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { OnboardingIllustration } from './OnboardingIllustration';

test('리포트 예시가 P0의 통계 라벨·값·주간 설명 색을 사용한다', async () => {
  await render(<OnboardingIllustration page={2} width={510} />);

  expect(screen.getByText('오늘 대화')).toHaveStyle({ color: '#A18971' });
  expect(screen.getByText('18분')).toHaveStyle({ color: '#000000' });
  expect(screen.getByText('최근 7일 감정 변화')).toHaveStyle({ color: '#7A6A55' });
});

test('기본 배율 감정 요약 상자에 P0 높이를 확보하고 내용이 늘어날 수 있다', async () => {
  await render(<OnboardingIllustration page={2} width={510} />);

  const mood = screen.getByTestId('onboarding-report-mood');
  expect(mood).toHaveStyle({ minHeight: 63.43, backgroundColor: '#F5FDD6' });
  expect(mood).not.toHaveStyle({ height: 63.43 });
});

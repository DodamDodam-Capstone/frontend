import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OnboardingFlow } from './OnboardingFlow';

const titles = ['아이의 하루를 들어주는 마음 친구, 도담이', '다양한 놀이를 즐기고 새로운 것을 배우며 성장해요', '오늘 하루 아이가 어땠는지, 아이의 마음을 알려드려요'];

test.each([1, 2, 3])('%i장에서 마이크 용도를 확인하고 건너뛸 수 있다', async page => {
  const onComplete = jest.fn();
  await render(<OnboardingFlow onComplete={onComplete} />);
  const pageLabel = `온보딩 ${page}장, 전체 3장`;
  await fireEvent.press(screen.getByRole('button', { name: pageLabel }));
  expect(screen.getByRole('header', { name: titles[page - 1] })).toBeVisible();
  expect(screen.getByRole('button', { name: pageLabel, selected: true })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
  expect(screen.getByText('캐릭터와 음성으로 대화할 때 사용해요')).toBeVisible();
  expect(onComplete).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '다음에 할래요' }));
  await fireEvent.press(screen.getByRole('button', { name: '다음에 할래요' }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('가로 스크롤이 끝난 위치에 따라 현재 장과 탐색 표시가 바뀐다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  const width = 1280;
  const height = 800;
  const dimensions = {
    layoutMeasurement: { width, height },
    contentSize: { width: width * 3, height },
  };
  await fireEvent(screen.getByTestId('onboarding-pages'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
  await fireEvent.scroll(screen.getByTestId('onboarding-pages'), {
    nativeEvent: { ...dimensions, contentOffset: { x: width * 2, y: 0 } },
  });
  expect(screen.getByRole('header', { name: titles[2] })).toBeVisible();
  await fireEvent.scroll(screen.getByTestId('onboarding-pages'), {
    nativeEvent: { ...dimensions, contentOffset: { x: width, y: 0 } },
  });
  expect(screen.getByRole('button', { name: '온보딩 2장, 전체 3장', selected: true })).toBeVisible();
});

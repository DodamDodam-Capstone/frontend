import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { OnboardingFlow } from './OnboardingFlow';

const titles = ['아이의 하루를 들어주는 마음 친구, 도담이', '다양한 놀이를 즐기고 새로운 것을 배우며 성장해요', '오늘 하루 아이가 어땠는지, 아이의 마음을 알려드려요'];

test('다음을 누를 때마다 한 장씩 이동하고 마지막 시작하기에서 마이크 안내를 연다', async () => {
  const onComplete = jest.fn();
  await render(<OnboardingFlow onComplete={onComplete} />);
  for (const page of [0, 1, 2]) {
    expect(screen.getByRole('header', { name: titles[page] })).toBeVisible();
    expect(screen.getByRole('button', { name: `온보딩 ${page + 1}장, 전체 3장`, selected: true })).toBeVisible();
    expect(screen.queryByText('캐릭터와 음성으로 대화할 때 사용해요')).toBeNull();
    if (page < 2) {
      expect(screen.queryByRole('button', { name: '시작하기' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: '다음' }));
    }
  }
  expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
  expect(screen.getByText('캐릭터와 음성으로 대화할 때 사용해요')).toBeVisible();
  expect(onComplete).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '다음에 할래요' }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('점을 눌러 장을 바꾸면 선택 표시와 다음 버튼이 그 장을 따른다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  for (const page of [3, 1, 2]) {
    const name = `온보딩 ${page}장, 전체 3장`;
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name, selected: true })).toBeVisible();
    expect(screen.getByRole('header', { name: titles[page - 1] })).toBeVisible();
  }
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByRole('header', { name: titles[2] })).toBeVisible();
  expect(screen.getByRole('button', { name: '시작하기' })).toBeVisible();
});

test('페이지 표시는 P0의 채움과 길이로 선택을 구분하고 버튼 문구는 밝은 색이다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  for (const page of [1, 2, 3]) {
    const button = screen.getByRole('button', { name: `온보딩 ${page}장, 전체 3장` });
    expect(button).toHaveStyle({ minHeight: 48 });
    const mark = button.children[0];
    if (!mark || typeof mark === 'string') throw new Error('페이지 표시가 없습니다.');
    const style = StyleSheet.flatten(mark.props.style);
    expect(style.borderWidth ?? 0).toBe(0);
    expect(style.backgroundColor).toBe(page === 1 ? '#75CC3F' : '#CDBBA7');
    expect(style.width).toBe(page === 1 ? 28 : 8);
    expect(style.height).toBe(8);
  }
  expect(screen.getByText('다음')).toHaveStyle({ color: '#FFFDFA' });
});

test('확대 글씨에서는 각 점의 터치 영역을 44×48 이상 확보한다', async () => {
  const window = Dimensions.get('window');
  try {
    await act(() => Dimensions.set({ window: { ...window, fontScale: 2 } }));
    await render(<OnboardingFlow onComplete={jest.fn()} />);
    for (const page of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: `온보딩 ${page}장, 전체 3장` }))
        .toHaveStyle({ minWidth: 44, minHeight: 48 });
    }
  } finally {
    await act(() => Dimensions.set({ window }));
  }
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
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByRole('header', { name: titles[2] })).toBeVisible();
});

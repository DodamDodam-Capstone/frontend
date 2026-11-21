import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Dimensions, Platform } from 'react-native';

import { OnboardingFlow } from './OnboardingFlow';

const titles = ['아이의 하루를 들어주는 마음 친구, 도담이', '다양한 놀이를 즐기고 새로운 것을 배우며 성장해요', '오늘 하루 아이가 어땠는지, 아이의 마음을 알려드려요'];

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  // RNTL에는 네이티브 프레임이 없어 같은 contentOffset 매핑을 JS 드라이버로 전달한다.
  const event = Animated.event;
  jest.spyOn(Animated, 'event').mockImplementation((mapping, config) =>
    event(mapping, { ...config, useNativeDriver: false }));
});
afterEach(() => { jest.restoreAllMocks(); });

test('인사 장면과 페이지 표시·버튼은 가로로 움직이는 본문 밖에 한 번만 렌더된다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  const body = within(screen.getByTestId('onboarding-pages'));
  expect(screen.getAllByText(/안녕하세요!/, { includeHiddenElements: true })).toHaveLength(1);
  expect(body.queryByText(/안녕하세요!/, { includeHiddenElements: true })).toBeNull();
  expect(body.queryByRole('button', { name: '다음', includeHiddenElements: true })).toBeNull();
  expect(body.queryByRole('button', { name: '온보딩 1장, 전체 3장', includeHiddenElements: true })).toBeNull();
});

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

test('고정된 하단 버튼 문구는 P0의 밝은 색이다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
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

function scrollBody(progress: number) {
  const { width, height } = Dimensions.get('window');
  const panelWidth = Math.min(width / 1280, height / 800) * 590;
  return fireEvent.scroll(screen.getByTestId('onboarding-pages'), {
    nativeEvent: {
      layoutMeasurement: { width: panelWidth, height },
      contentSize: { width: panelWidth * 3, height },
      contentOffset: { x: panelWidth * progress, y: 0 },
    },
  });
}

test('드래그를 중간에 되돌리면 원래 장이 유지되고 끝까지 넘기면 새 장이 선택된다', async () => {
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  await scrollBody(0.65);
  expect(screen.getByRole('header', { name: titles[0] })).toBeVisible();
  await scrollBody(0);
  expect(screen.getByRole('button', { name: '온보딩 1장, 전체 3장', selected: true })).toBeVisible();
  await scrollBody(2);
  expect(screen.getByRole('header', { name: titles[2] })).toBeVisible();
  await scrollBody(1);
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByRole('header', { name: titles[2] })).toBeVisible();
});

test('점으로 3장을 요청하면 중간 장을 지나도 도착 전에는 시작하기가 열리지 않는다', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: '온보딩 3장, 전체 3장' }));
  await scrollBody(1);
  expect(screen.queryByRole('button', { name: '시작하기' })).toBeNull();
  await scrollBody(2);
  expect(screen.getByRole('button', { name: '시작하기' })).toBeVisible();
});

test('3장 전환 직후 다시 1장을 누르면 마지막 요청으로 돌아가며 중간에 시작하기가 열리지 않는다', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: '온보딩 3장, 전체 3장' }));
  await fireEvent.press(screen.getByRole('button', { name: '온보딩 1장, 전체 3장' }));
  await scrollBody(2);
  expect(screen.queryByRole('button', { name: '시작하기' })).toBeNull();
  await scrollBody(0);
  expect(screen.getByRole('button', { name: '온보딩 1장, 전체 3장', selected: true })).toBeVisible();
});

function expectSingleReadingPage(page: number) {
  expect(screen.container.queryAll(node => node.props.horizontal === true)).toHaveLength(0);
  expect(screen.getAllByRole('header', { includeHiddenElements: true })).toHaveLength(1);
  const readingBody = screen.container.queryAll(node =>
    node.type === 'RCTScrollView' && within(node).queryByRole('header', { name: titles[page - 1] }) !== null);
  expect(readingBody).toHaveLength(1);
  expect(screen.getByRole('header', { name: titles[page - 1] })).toBeVisible();
  expect(screen.getByRole('button', { name: `온보딩 ${page}장, 전체 3장`, selected: true })).toBeVisible();
}

test('Android TalkBack에서는 현재 장만 렌더하고 점·다음·시작하기로 목적지를 선택한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  await render(<OnboardingFlow onComplete={jest.fn()} />);

  expectSingleReadingPage(1);
  await fireEvent.press(screen.getByRole('button', { name: '온보딩 3장, 전체 3장' }));
  expectSingleReadingPage(3);
  await fireEvent.press(screen.getByRole('button', { name: '온보딩 2장, 전체 3장' }));
  expectSingleReadingPage(2);
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  expectSingleReadingPage(3);
  await fireEvent.press(screen.getByRole('button', { name: '시작하기' }));
  expect(screen.getByText('캐릭터와 음성으로 대화할 때 사용해요')).toBeVisible();
});

test('Android에서 TalkBack을 켰다가 끄면 읽던 장에서 가로 스와이프를 다시 쓸 수 있다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  const listeners = new Set<(enabled: boolean) => void>();
  const changeEvents: {
    addEventListener(name: 'screenReaderChanged' | 'reduceMotionChanged', listener: (enabled: boolean) => void): { remove(): void };
  } = AccessibilityInfo;
  jest.spyOn(changeEvents, 'addEventListener').mockImplementation((name, listener) => {
    if (name === 'screenReaderChanged') listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  const notify = (enabled: boolean) => act(() => {
    for (const listener of listeners) listener(enabled);
  });
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  await scrollBody(1);

  await notify(true);
  expectSingleReadingPage(2);
  await fireEvent.press(screen.getByRole('button', { name: '다음' }));
  await notify(false);
  expect(screen.getByRole('button', { name: '온보딩 3장, 전체 3장', selected: true })).toBeVisible();
  await scrollBody(1);
  expect(screen.getByRole('header', { name: titles[1] })).toBeVisible();
});

test('iPad에서 VoiceOver가 켜져도 기존 가로 페이지를 유지한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  await render(<OnboardingFlow onComplete={jest.fn()} />);
  await scrollBody(1);
  expect(screen.getByRole('button', { name: '온보딩 2장, 전체 3장', selected: true })).toBeVisible();
});

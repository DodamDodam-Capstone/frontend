import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import { EntrySplash } from './EntrySplash';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function controlledMotion() {
  const animation = {
    start: jest.fn<Animated.CompositeAnimation['start']>(),
    stop: jest.fn(), reset: jest.fn(),
  };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  return { timing, animation };
}

function logoImages() {
  return screen.getAllByTestId(/^splash-logo-part-/, { includeHiddenElements: true });
}

async function loadImages() {
  for (const image of logoImages()) await fireEvent(image, 'load');
}

test('로고와 원문 부제를 표시하고 2초 모션을 한 번 재생한 후 최신 콜백으로 이동한다', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const { timing, animation } = controlledMotion();
  const old = jest.fn();
  const next = jest.fn();
  const view = await render(<EntrySplash onComplete={old} />);
  expect(screen.getByRole('header', { name: '도담도담' })).toBeVisible();
  expect(screen.getByText('도담도담 나눈 대화 속에서 자라나는 아이의 마음')).toBeVisible();
  const images = logoImages();
  expect(images).toHaveLength(5);
  for (const image of images.slice(0, 4)) await fireEvent(image, 'load');
  await fireEvent(images[0], 'load');
  expect(timing).not.toHaveBeenCalled();
  await fireEvent(images[4], 'load');
  expect(timing).toHaveBeenCalledWith(expect.anything(),
    expect.objectContaining({ duration: 2000, useNativeDriver: true }));
  await view.rerender(<EntrySplash onComplete={next} />);
  expect(timing).toHaveBeenCalledTimes(1);
  const complete = animation.start.mock.calls[0][0]!;
  await act(() => { complete({ finished: true }); });
  expect(old).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
  await act(() => { complete({ finished: true }); jest.advanceTimersByTime(3000); });
  expect(next).toHaveBeenCalledTimes(1);
});

test.each(['동작 줄이기', '설정 조회 오류'])('%s에서는 정적 로고를 표시하고 모션 없이 이동한다', async (condition) => {
  const setting = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled');
  if (condition === '동작 줄이기') setting.mockResolvedValue(true);
  else setting.mockRejectedValue(new Error('unavailable'));
  const { timing } = controlledMotion();
  const next = jest.fn();
  await render(<EntrySplash onComplete={next} />);
  expect(screen.getByRole('header', { name: '도담도담' })).toBeVisible();
  await loadImages();
  await act(() => { jest.advanceTimersByTime(50); });
  expect(timing).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
});

test('설정 조회가 끝나지 않아도 스플래시에서 멈추지 않는다', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(() => {}));
  const next = jest.fn();
  await render(<EntrySplash onComplete={next} />);
  await act(() => { jest.advanceTimersByTime(2100); });
  await act(() => { jest.advanceTimersByTime(50); });
  expect(next).toHaveBeenCalledTimes(1);
});

test('진입 중 화면이 닫히면 늦은 모션 콜백과 대체 타이머는 이동을 요청하지 않는다', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const { animation } = controlledMotion();
  const next = jest.fn();
  const view = await render(<EntrySplash onComplete={next} />);
  await loadImages();
  const complete = animation.start.mock.calls[0][0]!;
  await view.unmount();
  expect(animation.stop).toHaveBeenCalled();
  await act(() => { complete({ finished: true }); jest.advanceTimersByTime(3000); });
  expect(next).not.toHaveBeenCalled();
});

test('이미지 로드에 실패해도 부제를 유지한 채 정적 화면에서 한 번 이동한다', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const { timing } = controlledMotion();
  const next = jest.fn();
  await render(<EntrySplash onComplete={next} />);
  await fireEvent(logoImages()[0], 'error', { nativeEvent: { error: 'load failed' } });
  expect(screen.getByText('도담도담 나눈 대화 속에서 자라나는 아이의 마음')).toBeVisible();
  await act(() => { jest.advanceTimersByTime(50); });
  expect(timing).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
});

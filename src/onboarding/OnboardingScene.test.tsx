import { afterEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { OnboardingScene } from './OnboardingScene';

const scene = (permission: boolean, reduceMotion = false) => (
  <OnboardingScene width={1280} height={800} permission={permission} reduceMotion={reduceMotion} />
);

function jumpImage(person: 'girl' | 'boy') {
  return screen.getByTestId(`onboarding-jump-${person}`, { includeHiddenElements: true });
}

function trackMotion() {
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  return { timing, animation };
}

afterEach(() => { jest.restoreAllMocks(); });

test('안내에 먼저 진입해도 두 새 자세가 모두 준비된 뒤 전환을 한 번 시작한다', async () => {
  const { timing, animation } = trackMotion();
  const view = await render(scene(false));
  await fireEvent(jumpImage('girl'), 'load');
  await view.rerender(scene(true));
  expect(screen.getByText(/함께 이야기할/)).toBeVisible();
  expect(timing).not.toHaveBeenCalled();
  await fireEvent(jumpImage('girl'), 'load');
  expect(timing).not.toHaveBeenCalled();

  await fireEvent(jumpImage('boy'), 'load');
  expect(timing).toHaveBeenCalledWith(expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 220, useNativeDriver: true }));
  expect(animation.start).toHaveBeenCalledTimes(1);
  await fireEvent(jumpImage('boy'), 'load');
  expect(animation.start).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(animation.stop).toHaveBeenCalled();
});

test('새 자세를 미리 읽어도 인사 중에는 움직이지 않고 동작 줄이기로 진입하면 마지막 자세를 유지한다', async () => {
  const { timing } = trackMotion();
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  const view = await render(scene(false, true));
  await fireEvent(jumpImage('boy'), 'load');
  await fireEvent(jumpImage('girl'), 'load');
  expect(screen.getByText(/안녕하세요!/)).toBeVisible();
  expect(setValue).not.toHaveBeenCalledWith(1);
  await view.rerender(scene(true, true));
  expect(setValue).toHaveBeenCalledWith(1);
  await view.rerender(scene(true, false));
  expect(timing).not.toHaveBeenCalled();
});

test('전환 중 동작 줄이기를 켜면 이동을 중단하고 최종 자세로 정렬한다', async () => {
  const { timing, animation } = trackMotion();
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  const view = await render(scene(false));
  await fireEvent(jumpImage('girl'), 'load');
  await fireEvent(jumpImage('boy'), 'load');
  expect(timing).not.toHaveBeenCalled();
  await view.rerender(scene(true));
  expect(animation.start).toHaveBeenCalledTimes(1);
  await view.rerender(scene(true, true));
  expect(animation.stop).toHaveBeenCalled();
  expect(setValue).toHaveBeenCalledWith(1);
});

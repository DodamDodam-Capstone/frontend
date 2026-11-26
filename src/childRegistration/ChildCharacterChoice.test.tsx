import { afterEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { ChildCharacterChoice } from './ChildCharacterChoice';
import { TEST_CHILD_CHARACTERS, UPCOMING_TEST_CHILD_CHARACTER } from './childRegistrationData';

function props() {
  return {
    characters: TEST_CHILD_CHARACTERS,
    upcoming: UPCOMING_TEST_CHILD_CHARACTER,
    value: TEST_CHILD_CHARACTERS[0].id,
    largeText: false,
    disabled: false,
    onPreviewUpcoming: jest.fn(),
    onChange: jest.fn(),
  };
}

function trackMotion() {
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  return { animation, timing: jest.spyOn(Animated, 'timing').mockReturnValue(animation) };
}

afterEach(() => { jest.restoreAllMocks(); });

test('캐릭터 미리보기는 한 값으로 양방향 전환하고 연속 선택을 막지 않는다', async () => {
  const { timing, animation } = trackMotion();
  const settings = props();
  const view = await render(<ChildCharacterChoice {...settings} previewingUpcoming={false} reduceMotion={false} />);
  expect(timing).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: '남자 도담이' }));
  expect(settings.onPreviewUpcoming).toHaveBeenCalledTimes(1);
  expect(settings.onChange).not.toHaveBeenCalled();
  await view.rerender(<ChildCharacterChoice {...settings} previewingUpcoming reduceMotion={false} />);
  expect(timing).toHaveBeenCalledWith(expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 150, useNativeDriver: true }));
  expect(screen.getByText('준비 중이에요')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: '여자 도담이' }));
  expect(settings.onChange).toHaveBeenCalledWith(TEST_CHILD_CHARACTERS[0].id);
  await view.rerender(<ChildCharacterChoice {...settings} previewingUpcoming={false} reduceMotion={false} />);
  expect(animation.stop).toHaveBeenCalledTimes(1);
  expect(timing).toHaveBeenLastCalledWith(timing.mock.calls[0][0],
    expect.objectContaining({ toValue: 0, duration: 150, useNativeDriver: true }));
  expect(screen.queryByText('준비 중이에요')).not.toBeOnTheScreen();
});

test('동작 줄이기는 즉시 준비 중 안내를 보여준다', async () => {
  const { timing } = trackMotion();
  const settings = props();
  const view = await render(<ChildCharacterChoice {...settings} previewingUpcoming={false} reduceMotion />);
  await view.rerender(<ChildCharacterChoice {...settings} previewingUpcoming reduceMotion />);

  expect(timing).not.toHaveBeenCalled();
  expect(screen.getByText('준비 중이에요')).toBeVisible();
});

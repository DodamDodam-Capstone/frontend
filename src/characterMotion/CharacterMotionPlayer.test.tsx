import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CharacterMotionPlayer, type CharacterMotionState } from './CharacterMotionPlayer';

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('./speechMotion', () => ({
  useMouthFrame: (active: boolean) => active ? 3 : 0,
}));

const body = (clip: string) => screen.getByTestId(`character-motion-${clip}`);
const display = async (clip: string) => fireEvent(body(clip), 'display');
const tick = async (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

it.each([
  { state: 'listening', enterMs: 958, exitMs: 1167 },
  { state: 'thinking', enterMs: 1042, exitMs: 1042 },
] as const)('times $state enter and exit from first display and holds between them', async ({ state, enterMs, exitMs }) => {
  const { rerender } = await render(<CharacterMotionPlayer state={state} size={256} />);
  await tick(10000);
  const enter = `${state}-enter`;
  await display(enter);
  await tick(enterMs - 1);
  await display(enter);
  expect(body(enter)).toBeOnTheScreen();
  await tick(2);
  expect(body(`${state}-hold`)).toBeOnTheScreen();
  await tick(10000);
  expect(body(`${state}-hold`)).toBeOnTheScreen();
  await rerender(<CharacterMotionPlayer state="neutral" size={256} />);
  const exit = `${state}-exit`;
  await display(exit);
  await tick(exitMs - 1);
  expect(body(exit)).toBeOnTheScreen();
  await tick(2);
  expect(body('neutral')).toBeOnTheScreen();
});

it('finishes displayed enter and exit and picks only the latest state', async () => {
  const { rerender } = await render(<CharacterMotionPlayer state="listening" size={256} />);
  await display('listening-enter');
  for (const state of ['thinking', 'speaking'] as const) {
    await rerender(<CharacterMotionPlayer state={state} size={256} speech={{ playing: true }} />);
    expect(body('listening-enter')).toBeOnTheScreen();
  }
  await tick(958);
  await display('listening-exit');
  await rerender(<CharacterMotionPlayer state="thinking" size={256} />);
  expect(body('listening-exit')).toBeOnTheScreen();
  await tick(1167);
  expect(body('thinking-enter')).toBeOnTheScreen();
});

it('can replace a clip before display and rejects old callbacks when the asset returns', async () => {
  const onAssetError = jest.fn();
  const { rerender } = await render(<CharacterMotionPlayer state="listening" size={256} onAssetError={onAssetError} />);
  const old = body('listening-enter').props;
  await rerender(<CharacterMotionPlayer state="thinking" size={256} onAssetError={onAssetError} />);
  expect(body('thinking-enter')).toBeOnTheScreen();
  await rerender(<CharacterMotionPlayer state="listening" size={256} onAssetError={onAssetError} />);
  await act(() => { old.onDisplay(); old.onError(); });
  await tick(1000);
  expect(body('listening-enter')).toBeOnTheScreen();
  expect(onAssetError).toHaveBeenCalledTimes(0);
});

it('latches ending through a displayed enter and exit and completes once after farewell', async () => {
  const onEnd = jest.fn();
  const props = (state: CharacterMotionState) => <CharacterMotionPlayer state={state} size={256} onEnd={onEnd} />;
  const { rerender } = await render(props('thinking'));
  await display('thinking-enter');
  await rerender(props('ending'));
  await rerender(props('speaking'));
  await tick(1042);
  await display('thinking-exit');
  await tick(1042);
  await display('farewell');
  await tick(3249);
  expect(onEnd).toHaveBeenCalledTimes(0);
  await tick(2);
  await tick(10000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(body('neutral')).toBeOnTheScreen();
  await rerender(props('listening'));
  expect(body('listening-enter')).toBeOnTheScreen();
});

it('completes if farewell never displays within 5 seconds and when it fails', async () => {
  const onEnd = jest.fn();
  const onAssetError = jest.fn();
  const props = (active: boolean) => <CharacterMotionPlayer state="ending" size={256} active={active} onEnd={onEnd} onAssetError={onAssetError} />;
  const { rerender } = await render(props(true));
  const old = body('farewell').props;
  await tick(4999);
  expect(onEnd).toHaveBeenCalledTimes(0);
  await tick(2);
  await act(() => { old.onDisplay(); old.onError(); });
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onAssetError).toHaveBeenCalledTimes(0);
  await rerender(props(false));
  await rerender(props(true));
  await fireEvent(body('farewell'), 'error');
  expect(onAssetError).toHaveBeenCalledTimes(1);
  expect(onEnd).toHaveBeenCalledTimes(2);
});

it('removes animation on inactivity and tears down ending timers on unmount', async () => {
  const onEnd = jest.fn();
  const props = (active: boolean) => <CharacterMotionPlayer state="ending" size={256} active={active} onEnd={onEnd} />;
  const { rerender, unmount } = await render(props(true));
  await display('farewell');
  await rerender(props(false));
  expect(body('neutral')).toBeOnTheScreen();
  expect(screen.queryByTestId('character-motion-farewell')).toBeNull();
  await tick(6000);
  await rerender(props(true));
  const old = body('farewell').props;
  await display('farewell');
  await unmount();
  await act(() => { old.onDisplay(); old.onError(); });
  await tick(6000);
  expect(onEnd).toHaveBeenCalledTimes(0);
});

it('renders static home and completes ending when reduce motion is enabled', async () => {
  const onEnd = jest.fn();
  const { rerender } = await render(<CharacterMotionPlayer state="home" size={256} reduceMotion />);
  expect(body('home-static')).toBeOnTheScreen();
  await rerender(<CharacterMotionPlayer state="ending" size={256} reduceMotion onEnd={onEnd} />);
  expect(body('neutral')).toBeOnTheScreen();
  expect(onEnd).toHaveBeenCalledTimes(1);
  await rerender(<CharacterMotionPlayer state="ending" size={256} onEnd={onEnd} />);
  expect(onEnd).toHaveBeenCalledTimes(1);
});

it('recovers from home body failure on reactivation and uses a native loop', async () => {
  const onAssetError = jest.fn();
  const props = (active: boolean) => <CharacterMotionPlayer state="home" size={256} active={active} onAssetError={onAssetError} />;
  const { rerender } = await render(props(true));
  await display('home');
  expect(body('home').props).toMatchObject({
    autoplay: true, useAppleWebpCodec: false, placeholderContentFit: 'contain',
    placeholder: { testUri: expect.stringMatching(/character.png$/) },
  });
  await tick(15127);
  expect(body('home')).toBeOnTheScreen();
  await fireEvent(body('home'), 'error');
  expect(body('home-static')).toBeOnTheScreen();
  expect(onAssetError).toHaveBeenCalledTimes(1);
  await rerender(props(false));
  await rerender(props(true));
  expect(body('home')).toBeOnTheScreen();
});

it('keeps mouth position and animation on speaking body failure, resets on stop', async () => {
  const onAssetError = jest.fn();
  const props = (playing: boolean) => <CharacterMotionPlayer state="speaking" size={256} speech={{ playing }} onAssetError={onAssetError} />;
  const { rerender } = await render(props(true));
  await fireEvent(body('speaking'), 'error');
  expect(body('neutral')).toBeOnTheScreen();
  expect(body('mouth-3').props.fadeDuration).toBe(0);
  expect(StyleSheet.flatten(body('mouth-3').props.style)).toMatchObject({
    left: 114, top: 94.5, width: 28, height: 15,
  });
  expect(onAssetError).toHaveBeenCalledTimes(1);
  await rerender(props(false));
  expect(screen.queryByTestId('character-motion-mouth-3')).toBeNull();
});

it('waits for the speaking body to display before placing its mouth', async () => {
  await render(<CharacterMotionPlayer state="speaking" size={256} speech={{ playing: true }} />);
  expect(screen.queryByTestId('character-motion-mouth-3')).toBeNull();
  await display('speaking');
  expect(body('mouth-3')).toBeOnTheScreen();
});

it('keeps the neutral fallback alone after a non-speaking error until reactivation', async () => {
  const onAssetError = jest.fn();
  const props = (state: CharacterMotionState, active = true) => (
    <CharacterMotionPlayer state={state} size={256} active={active} speech={{ playing: true }}
      onAssetError={onAssetError} />
  );
  const { rerender } = await render(props('listening'));
  await fireEvent(body('listening-enter'), 'error');
  expect(body('neutral')).toBeOnTheScreen();
  await rerender(props('speaking'));
  expect(body('neutral')).toBeOnTheScreen();
  expect(screen.queryByTestId('character-motion-mouth-3')).toBeNull();
  expect(onAssetError).toHaveBeenCalledTimes(1);
  await rerender(props('speaking', false));
  await rerender(props('speaking'));
  expect(body('speaking')).toBeOnTheScreen();
});

it('finishes a displayed exit even if the ending request is over five seconds old', async () => {
  const onEnd = jest.fn();
  const { rerender } = await render(<CharacterMotionPlayer state="listening" size={256} onEnd={onEnd} />);
  await display('listening-enter');
  await rerender(<CharacterMotionPlayer state="ending" size={256} onEnd={onEnd} />);
  await tick(958);
  expect(body('listening-exit').props.placeholder).toEqual({
    testUri: expect.stringMatching(/dodami-listening-hold.webp$/),
  });
  await tick(4000);
  await display('listening-exit');
  await tick(1166);
  expect(body('listening-exit')).toBeOnTheScreen();
  await tick(2);
  expect(body('farewell')).toBeOnTheScreen();
  await tick(4998);
  expect(onEnd).toHaveBeenCalledTimes(0);
  await tick(2);
  expect(onEnd).toHaveBeenCalledTimes(1);
});

it('moves to farewell if the exit never displays during ending', async () => {
  const onEnd = jest.fn();
  const { rerender } = await render(<CharacterMotionPlayer state="listening" size={256} onEnd={onEnd} />);
  await display('listening-enter');
  await rerender(<CharacterMotionPlayer state="ending" size={256} onEnd={onEnd} />);
  await tick(958);
  await tick(4999);
  expect(body('listening-exit')).toBeOnTheScreen();
  await tick(2);
  expect(body('farewell')).toBeOnTheScreen();
  expect(onEnd).toHaveBeenCalledTimes(0);
});

it('keeps a queued exit during ending when a late speech request arrives', async () => {
  const onEnd = jest.fn();
  const props = (state: CharacterMotionState) => <CharacterMotionPlayer
    state={state} size={256} speech={{ playing: state === 'speaking' }} onEnd={onEnd}
  />;
  const { rerender } = await render(props('listening'));
  await display('listening-enter');
  await tick(958);
  expect(body('listening-hold')).toBeOnTheScreen();
  await rerender(props('ending'));
  await rerender(props('speaking'));
  expect(body('listening-exit')).toBeOnTheScreen();
  await display('listening-exit');
  await tick(1167);
  await display('farewell');
  await tick(3250);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(body('neutral')).toBeOnTheScreen();
});

import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useMouthFrame, type SubscribeSpeechLevel } from './speechMotion';

function createSpeechSource() {
  let receive: Parameters<SubscribeSpeechLevel>[0] | undefined;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn<SubscribeSpeechLevel>((listener) => {
    receive = listener;
    return unsubscribe;
  });

  return {
    subscribe,
    unsubscribe,
    sample(rms: number, receivedAt = performance.now()) {
      receive?.({ rms, receivedAt });
    },
  };
}

async function advance(ms: number) {
  await act(() => { jest.advanceTimersByTime(ms); });
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('음성 입력이 없거나 발화 기준에 미치지 않으면 입을 닫고 강세에는 42ms마다 한 장씩 연다', async () => {
  const source = createSpeechSource();
  const { result } = await renderHook(() => useMouthFrame(true, source.subscribe));

  await advance(42);
  expect(result.current).toBe(0);
  source.sample(0.022);
  await advance(42);
  expect(result.current).toBe(0);

  await advance(251);
  source.sample(0.16);
  await advance(42);
  expect(result.current).toBe(1);
  await advance(42);
  expect(result.current).toBe(2);
  await advance(42);
  expect(result.current).toBe(3);
});

test('이어지는 강세는 3단계를 유지하고 250ms를 넘긴 샘플 중단 뒤 무음에서 다시 시작한다', async () => {
  const source = createSpeechSource();
  const { result } = await renderHook(() => useMouthFrame(true, source.subscribe));

  for (let index = 0; index < 36; index++) {
    source.sample(0.2);
    await advance(42);
    expect(result.current).toBe(Math.min(index + 1, 3));
  }

  await advance(2);
  source.sample(0.14);
  await advance(250);
  expect(result.current).toBe(3);
  await advance(42);
  expect(result.current).toBe(2);
  await advance(42);
  expect(result.current).toBe(1);
  await advance(42);
  expect(result.current).toBe(0);

  source.sample(0.023);
  await advance(42);
  expect(result.current).toBe(1);
});

test('발화 중 150ms까지 짧은 쉼을 허용하고 이후 입을 닫는다', async () => {
  const source = createSpeechSource();
  const { result } = await renderHook(() => useMouthFrame(true, source.subscribe));

  source.sample(0.023);
  await advance(42);
  expect(result.current).toBe(1);

  source.sample(0.016);
  await advance(18);
  source.sample(0.015);
  await advance(150);
  expect(result.current).toBe(1);
  await advance(42);
  expect(result.current).toBe(0);
});

test('비활성화와 입력 교체 시 닫히고 이전 구독과 잘못된 샘플을 무시한다', async () => {
  const setTimer = jest.spyOn(global, 'setInterval');
  const clearTimer = jest.spyOn(global, 'clearInterval');
  const first = createSpeechSource();
  const second = createSpeechSource();
  const { result, rerender, unmount } = await renderHook(
    ({ active, subscribe }: { active: boolean; subscribe: SubscribeSpeechLevel }) => useMouthFrame(active, subscribe),
    { initialProps: { active: false, subscribe: first.subscribe } },
  );

  expect(first.subscribe).not.toHaveBeenCalled();
  await advance(50);
  await rerender({ active: true, subscribe: first.subscribe });
  first.sample(0.2, performance.now() - 1);
  await advance(42);
  expect(result.current).toBe(0);

  first.sample(0.2);
  await advance(42);
  expect(result.current).toBe(1);
  await rerender({ active: false, subscribe: first.subscribe });
  expect(result.current).toBe(0);
  expect(first.unsubscribe).toHaveBeenCalledTimes(1);

  await rerender({ active: true, subscribe: second.subscribe });
  first.sample(0.2);
  second.sample(Infinity);
  second.sample(0.2, Number.NaN);
  second.sample(0.2, performance.now() + 1);
  await advance(42);
  expect(result.current).toBe(0);

  const receivedAt = performance.now();
  second.sample(0);
  await advance(1);
  second.sample(0.2, receivedAt);
  second.sample(0.2, receivedAt - 1);
  await advance(41);
  expect(result.current).toBe(0);

  second.sample(0.2);
  await advance(42);
  expect(result.current).toBe(1);
  await rerender({ active: true, subscribe: first.subscribe });
  expect(result.current).toBe(0);
  expect(second.unsubscribe).toHaveBeenCalledTimes(1);

  await unmount();
  expect(first.unsubscribe).toHaveBeenCalledTimes(2);
  expect(setTimer).toHaveBeenCalledTimes(3);
  for (const timer of setTimer.mock.results) {
    expect(clearTimer).toHaveBeenCalledWith(timer.value);
  }
});

test('음량의 상승과 하강을 평활화하고 열린 프레임은 유지 기준을 적용한다', async () => {
  const source = createSpeechSource();
  const { result } = await renderHook(() => useMouthFrame(true, source.subscribe));

  source.sample(0.023);
  await advance(10);
  source.sample(0.25);
  await advance(32);
  expect(result.current).toBe(1);

  source.sample(0.25);
  await advance(42);
  expect(result.current).toBe(2);

  source.sample(0.14);
  await advance(42);
  expect(result.current).toBe(3);

  source.sample(0.1);
  await advance(42);
  expect(result.current).toBe(3);

  source.sample(0.1);
  await advance(42);
  expect(result.current).toBe(2);

  for (let index = 0; index < 6; index++) {
    source.sample(0.07);
    await advance(42);
    expect(result.current).toBe(2);
  }

  source.sample(0.05);
  await advance(42);
  expect(result.current).toBe(1);
});

import { expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import type { GestureResponderEvent } from 'react-native';

import { useSceneSwipe } from './useSceneSwipe';

function touch(x: number, time: number, y = 200, fingers = 1) {
  return { nativeEvent: { pageX: x, pageY: y, timestamp: time, touches: Array(fingers).fill({}) } } as GestureResponderEvent;
}

async function swipeAt(offset: number, canStart?: () => boolean) {
  const onDragOffset = jest.fn();
  const onSnap = jest.fn();
  const { result } = await renderHook(() => useSceneSwipe({
    pageWidth: 500, currentOffset: { current: offset }, canStart, onDragOffset, onSnap,
  }));
  const handlers = result.current;
  function start(x: number, time = 1000) {
    handlers.onStartShouldSetResponderCapture!(touch(500, time));
    const move = touch(x, time + 20);
    expect(handlers.onMoveShouldSetResponderCapture!(move)).toBe(true);
    handlers.onResponderGrant!(move);
  }
  return { handlers, onDragOffset, onSnap, start };
}

test('말풍선의 탭과 세로 움직임은 그대로 두고 한 손가락의 가로 드래그만 받는다', async () => {
  const { handlers } = await swipeAt(0);
  expect(handlers.onStartShouldSetResponderCapture!(touch(500, 1000))).toBe(false);
  expect(handlers.onMoveShouldSetResponderCapture!(touch(498, 1008))).toBe(false);
  expect(handlers.onMoveShouldSetResponderCapture!(touch(485, 1020, 243))).toBe(false);
  expect(handlers.onMoveShouldSetResponderCapture!(touch(468, 1040, 207, 2))).toBe(false);
});

test('터치를 얻은 첫 이동만으로 빠르게 밀고 떼도 카드가 따라오고 다음 장으로 정렬된다', async () => {
  const { handlers, onDragOffset, onSnap, start } = await swipeAt(0);
  start(466);
  expect(onDragOffset.mock.calls[0][0]).toBeCloseTo(34);
  handlers.onResponderRelease!(touch(466, 1030, 200, 0));
  expect(onSnap).toHaveBeenLastCalledWith(1);
  start(466, 2000);
  handlers.onResponderRelease!(touch(466, 2250, 200, 0));
  expect(onSnap).toHaveBeenLastCalledWith(0);
});

test('카드가 네이티브 전환 중이면 왼쪽 가로 입력의 우선권을 가져오지 않는다', async () => {
  const { handlers, onDragOffset } = await swipeAt(40, () => false);
  handlers.onStartShouldSetResponderCapture!(touch(500, 1000));
  expect(handlers.onMoveShouldSetResponderCapture!(touch(455, 1020))).toBe(false);
  expect(onDragOffset).not.toHaveBeenCalled();
});

test('방향 반전과 양끝 경계에서 최초 이동을 중복 반영하지 않는다', async () => {
  const { handlers, onDragOffset, onSnap, start } = await swipeAt(500);
  start(470);
  handlers.onResponderMove!(touch(470, 1020));
  handlers.onResponderMove!(touch(320, 1100));
  handlers.onResponderMove!(touch(1200, 1400));
  handlers.onResponderMove!(touch(-400, 1800));
  handlers.onResponderMove!(touch(488, 2200));
  expect(onDragOffset).toHaveBeenCalledTimes(5);
  [530, 680, 0, 1000, 512].forEach((expected, index) => {
    expect(onDragOffset.mock.calls[index][0]).toBeCloseTo(expected);
  });
  handlers.onResponderRelease!(touch(488, 2400, 200, 0));
  expect(onSnap).toHaveBeenLastCalledWith(1);
});

test('드래그가 취소되거나 두 번째 손가락이 닿으면 최종 한 손가락 위치로 정렬된다', async () => {
  const { handlers, onDragOffset, onSnap, start } = await swipeAt(0);
  start(465);
  handlers.onResponderTerminate!(touch(465, 1030));
  expect(onSnap).toHaveBeenLastCalledWith(0);
  start(470, 2000);
  handlers.onResponderStart!(touch(50, 2030, 200, 2));
  handlers.onResponderMove!(touch(20, 2040, 200, 2));
  handlers.onResponderRelease!(touch(20, 2050, 200, 0));
  expect(onDragOffset).toHaveBeenCalledTimes(2);
  expect(onSnap).toHaveBeenLastCalledWith(0);
});

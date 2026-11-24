import { useLayoutEffect, useState, type RefObject } from 'react';
import type { GestureResponderEvent, GestureResponderHandlers } from 'react-native';

type SceneSwipeOptions = {
  pageWidth: number;
  currentOffset: RefObject<number>;
  canStart?: () => boolean;
  onDragOffset: (offset: number) => void;
  onSnap: (page: 0 | 1 | 2) => void;
};

function createSceneSwipe(initial: SceneSwipeOptions) {
  let options = initial;
  let startPage = 0;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let singleTouch = false;

  function position() {
    const origin = Math.round(startPage);
    const dragged = startPage + (downX - lastX) / Math.max(1, options.pageWidth);
    return Math.max(0, origin - 1, Math.min(2, origin + 1, dragged));
  }

  function move({ nativeEvent: { pageX, timestamp } }: GestureResponderEvent) {
    if (!singleTouch || lastX === pageX) return;
    velocity = (pageX - lastX) / Math.max(1, timestamp - lastTime);
    lastX = pageX;
    lastTime = timestamp;
    options.onDragOffset(position() * options.pageWidth);
  }

  function settle(vx: number) {
    const at = position();
    let next = Math.round(at);
    if (vx < -0.4) next = Math.ceil(at);
    if (vx > 0.4) next = Math.floor(at);
    options.onSnap(next as 0 | 1 | 2);
    singleTouch = false;
  }

  const panHandlers: GestureResponderHandlers = {
    onStartShouldSetResponderCapture: ({ nativeEvent: touch }) => {
      singleTouch = touch.touches.length === 1;
      if (singleTouch) {
        downX = lastX = touch.pageX;
        downY = touch.pageY;
        lastTime = touch.timestamp;
        velocity = 0;
      }
      return false;
    },
    onMoveShouldSetResponderCapture: ({ nativeEvent: touch }) => {
      const dx = Math.abs(touch.pageX - downX);
      return singleTouch && touch.touches.length === 1 && options.pageWidth > 0 &&
        dx > 8 && dx > Math.abs(touch.pageY - downY) * 1.5 && (options.canStart?.() ?? true);
    },
    onResponderGrant: event => {
      const { currentOffset, pageWidth } = options;
      startPage = Math.max(0, Math.min(2, currentOffset.current / Math.max(1, pageWidth)));
      // 첫 가로 이동이 곧 grant일 수 있어 touch-down에서 이동한 거리부터 반영한다.
      move(event);
    },
    onResponderStart: ({ nativeEvent }) => {
      if (nativeEvent.touches.length > 1) singleTouch = false;
    },
    onResponderMove: move,
    onResponderRelease: event => {
      move(event);
      settle(singleTouch && event.nativeEvent.timestamp - lastTime <= 100 ? velocity : 0);
    },
    onResponderTerminate: () => settle(0),
  };
  return {
    panHandlers,
    update(next: SceneSwipeOptions) { options = next; },
  };
}

export function useSceneSwipe(options: SceneSwipeOptions) {
  // 장이 바뀌어도 터치가 끝날 때까지 같은 responder를 사용한다.
  const [swipe] = useState(() => createSceneSwipe(options));
  useLayoutEffect(() => { swipe.update(options); }, [swipe, options]);
  return swipe.panHandlers;
}

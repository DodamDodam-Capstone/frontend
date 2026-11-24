import { expect, test } from '@jest/globals';

import { getOnboardingLayout } from './onboardingLayout';

test('1280×800 캔버스는 P0 좌표 그대로 표시한다', () => {
  expect(getOnboardingLayout(1280, 800)).toEqual({
    scale: 1, left: 0, top: 0, roomScale: 1, roomLeft: 0, roomTop: 0,
    sceneLeft: 0, sceneTop: 0,
  });
});

test.each([[1210, 834], [1440, 810]])(
  '%i×%i 가로 화면에서 인물과 패널은 한 배율이고 방은 빈틈없이 러그에 맞는다',
  (width, height) => {
    const layout = getOnboardingLayout(width, height);
    const { scale, left, top, roomScale, roomLeft, roomTop, sceneLeft, sceneTop } = layout;
    expect(scale).toBe(Math.min(width / 1280, height / 800));
    expect(left + 640 * scale).toBeCloseTo(width / 2);
    expect(top + 400 * scale).toBeCloseTo(height / 2);
    expect(roomLeft).toBeLessThanOrEqual(0);
    expect(roomTop).toBeLessThanOrEqual(0);
    expect(roomLeft + 1280 * roomScale).toBeGreaterThanOrEqual(width);
    expect(roomTop + 800 * roomScale).toBeGreaterThanOrEqual(height);
    expect(sceneLeft + 350 * scale).toBeCloseTo(roomLeft + 350 * roomScale);
    expect(sceneTop + 645 * scale).toBeCloseTo(roomTop + 645 * roomScale);
  },
);

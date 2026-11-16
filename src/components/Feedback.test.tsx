import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { ErrorMessage } from './ErrorMessage';
import { LoadingIndicator } from './LoadingIndicator';

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.restoreAllMocks(); });

test('로딩 안내는 spinner와 글씨를 하나의 이름 있는 진행 상태로 제공한다', async () => {
  await render(<LoadingIndicator label="내용을 확인하고 있어요" />);

  expect(screen.getByRole('progressbar', { name: '내용을 확인하고 있어요', busy: true })).toBeVisible();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
});

test('오류만 전달하면 재시도 버튼을 만들지 않는다', async () => {
  await render(<ErrorMessage message="지금은 처리할 수 없어요" />);

  expect(screen.getByRole('alert')).toHaveTextContent('지금은 처리할 수 없어요');
  expect(screen.queryByRole('button')).toBeNull();
});

test('오류 노출·재렌더는 요청을 실행하지 않고 명시적 누르기만 콜백을 호출한다', async () => {
  const onRetry = jest.fn();
  await render(<ErrorMessage message="다시 확인해 주세요" onRetry={onRetry} />);
  await screen.rerender(<ErrorMessage message="다시 확인해 주세요" onRetry={onRetry} />);
  expect(onRetry).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('iOS 오류 음성 안내는 같은 문구의 재렌더로 반복하지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
  await render(<ErrorMessage message="첫 안내" />);
  await screen.rerender(<ErrorMessage message="첫 안내" />);
  expect(announce).toHaveBeenCalledTimes(1);

  await screen.rerender(<ErrorMessage message="바뀐 안내" />);

  expect(announce).toHaveBeenCalledTimes(2);
  expect(announce).toHaveBeenLastCalledWith('바뀐 안내', { queue: true });
});

test('Android 오류 안내는 live region에 맡기고 iOS 음성 요청을 중복하지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
  await render(<ErrorMessage message="확인해 주세요" />);

  expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(announce).not.toHaveBeenCalled();
});

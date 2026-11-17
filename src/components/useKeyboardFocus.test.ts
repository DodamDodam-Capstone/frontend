import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Platform, type View } from 'react-native';
import * as keyboardFocus from './keyboardFocus';
import { useKeyboardFocus } from './useKeyboardFocus';

const view = {} as View;
const cancel = jest.fn();
beforeEach(() => {
  cancel.mockClear();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(keyboardFocus, 'requestAndroidKeyboardFocus').mockReturnValue(cancel);
});
afterEach(() => { jest.restoreAllMocks(); });

test('비활성 상태로 전환되면 버튼의 대기를 정리하고 오래된 핸들도 새 요청을 보내지 않는다', async () => {
  const ref = { current: view };
  const { result, rerender } = await renderHook(({ blocked }: { blocked: boolean }) => useKeyboardFocus(ref, blocked), { initialProps: { blocked: false } });
  const previousHandle = result.current;
  previousHandle.requestKeyboardFocus({ afterModalDismiss: true });
  const isCurrent = jest.mocked(keyboardFocus.requestAndroidKeyboardFocus).mock.calls[0][1];
  expect(isCurrent()).toBe(true);
  await rerender({ blocked: true });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(isCurrent()).toBe(false);
  previousHandle.requestKeyboardFocus();
  expect(keyboardFocus.requestAndroidKeyboardFocus).toHaveBeenCalledTimes(1);
});

test('새 포커스 요청은 이전 대기만 정리하고 이전 cleanup은 새 요청을 취소하지 않는다', async () => {
  const newerCancel = jest.fn();
  jest.mocked(keyboardFocus.requestAndroidKeyboardFocus).mockReturnValueOnce(cancel).mockReturnValueOnce(newerCancel);
  const { result } = await renderHook(() => useKeyboardFocus({ current: view }, false));
  const firstCancel = result.current.requestKeyboardFocus();
  result.current.requestKeyboardFocus();
  firstCancel();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(newerCancel).not.toHaveBeenCalled();
});

test('제거되거나 다른 host로 바뀐 버튼은 이전 요청의 대상이 아니다', async () => {
  const ref = { current: view as View | null };
  const { result, unmount } = await renderHook(() => useKeyboardFocus(ref, false));
  result.current.requestKeyboardFocus();
  const isCurrent = jest.mocked(keyboardFocus.requestAndroidKeyboardFocus).mock.calls[0][1];
  ref.current = {} as View;
  expect(isCurrent()).toBe(false);
  await unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

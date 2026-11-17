import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { AppState, type View } from 'react-native';

import { getKeyboardFocusModule } from '../../modules/keyboard-focus';
import { requestAndroidKeyboardFocus } from './keyboardFocus';

type Result = 'focused' | 'window-unfocused' | 'unavailable';
jest.mock('../../modules/keyboard-focus', () => ({ getKeyboardFocusModule: jest.fn() }));
const requestFocus = jest.fn<(tag: number) => Promise<Result>>();
const focusListeners = new Set<() => void>();
const stateListeners = new Set<(state: string) => void>();
const view = {} as View;
const deferred = () => {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const emitFocus = () => { [...focusListeners].forEach((fn) => fn()); };

beforeEach(() => {
  requestFocus.mockReset();
  jest.mocked(getKeyboardFocusModule).mockReturnValue({ requestFocus });
  jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'findNodeHandle').mockReturnValue(42);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'focus') {
      focusListeners.add(listener as () => void);
      return { remove: () => { focusListeners.delete(listener as () => void); } };
    }
    stateListeners.add(listener as (state: string) => void);
    return { remove: () => { stateListeners.delete(listener as (state: string) => void); } };
  });
});
afterEach(() => { jest.restoreAllMocks(); focusListeners.clear(); stateListeners.clear(); });

test('모달 복귀는 창 focus를 먼저 구독하고 성공하면 후속 이벤트를 무시한다', async () => {
  requestFocus.mockImplementation(async () => {
    expect(focusListeners.size).toBe(1);
    return 'focused';
  });
  requestAndroidKeyboardFocus(view, () => true, true);
  await flush();
  emitFocus();
  expect(requestFocus).toHaveBeenCalledTimes(1);
  expect(requestFocus).toHaveBeenCalledWith(42);
  expect(focusListeners.size).toBe(0);
  expect(stateListeners.size).toBe(0);
});

test.each(['before', 'after'])('창 focus가 응답 %s에 오더라도 창 대기 결과만 한 번 다시 요청한다', async (order) => {
  const first = deferred();
  requestFocus.mockReturnValueOnce(first.promise).mockResolvedValueOnce('focused');
  requestAndroidKeyboardFocus(view, () => true, true);
  if (order === 'before') emitFocus();
  first.resolve('window-unfocused');
  await flush();
  if (order === 'after') emitFocus();
  await flush();
  expect(requestFocus).toHaveBeenCalledTimes(2);
  expect(focusListeners.size).toBe(0);
});

test.each(['cancel', 'stale', 'background'])('대기 중 %s이면 늦은 응답과 앱 복귀가 이전 대상으로 이동하지 않는다', async (reason) => {
  const first = deferred();
  let current = true;
  requestFocus.mockReturnValueOnce(first.promise);
  const cancel = requestAndroidKeyboardFocus(view, () => current, true);
  emitFocus();
  if (reason === 'cancel') cancel();
  if (reason === 'stale') current = false;
  if (reason === 'background') [...stateListeners].forEach((fn) => fn('background'));
  first.resolve('window-unfocused');
  await flush();
  emitFocus();
  expect(requestFocus).toHaveBeenCalledTimes(1);
  expect(focusListeners.size).toBe(0);
  expect(stateListeners.size).toBe(0);
});

test.each(['unavailable', 'reject'])('대상이 %s이면 다음 창 이벤트를 기다리지 않는다', async (result) => {
  if (result === 'reject') requestFocus.mockRejectedValueOnce(new Error('native request failed'));
  else requestFocus.mockResolvedValueOnce('unavailable');
  requestAndroidKeyboardFocus(view, () => true, true);
  await flush();
  emitFocus();
  expect(requestFocus).toHaveBeenCalledTimes(1);
  expect(focusListeners.size).toBe(0);
});

test('초기 모달 포커스는 Activity 창 이벤트를 대기 신호로 사용하지 않는다', async () => {
  requestFocus.mockResolvedValueOnce('window-unfocused');
  requestAndroidKeyboardFocus(view, () => true, false);
  await flush();
  emitFocus();
  expect(requestFocus).toHaveBeenCalledTimes(1);
  expect(focusListeners.size).toBe(0);
});

test('사라진 대상은 native 요청을 보내지 않는다', () => {
  requestAndroidKeyboardFocus(view, () => false, true);
  expect(requestFocus).not.toHaveBeenCalled();
  expect(focusListeners.size).toBe(0);
});

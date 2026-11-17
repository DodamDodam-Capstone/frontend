import { AppState, findNodeHandle, type View } from 'react-native';

import { getKeyboardFocusModule } from '../../modules/keyboard-focus';

export type CancelFocus = () => void;
export type KeyboardFocusOptions = { afterModalDismiss?: boolean; isCurrent?: () => boolean };
export type FocusTarget = {
  focus(): void;
  requestKeyboardFocus?: (options?: KeyboardFocusOptions) => CancelFocus;
};
export type ButtonHandle = FocusTarget & {
  requestKeyboardFocus(options?: KeyboardFocusOptions): CancelFocus;
};

// 일반 View.focus()의 실험 flag 대신 공개 Android API를 쓰는 좁은 경로다.
// 모달 내부 초기 요청에는 Activity focus 이벤트를 사용하지 않는다.
export function requestAndroidKeyboardFocus(view: View, isCurrent: () => boolean, afterModalDismiss: boolean): CancelFocus {
  let cancelled = false;
  let inFlight = false;
  let focusWhilePending = false;
  let focusSubscription: { remove(): void } | undefined;
  let stateSubscription: { remove(): void } | undefined;
  const cancel = () => {
    cancelled = true;
    focusSubscription?.remove();
    stateSubscription?.remove();
  };
  const native = getKeyboardFocusModule();
  if (!native || !isCurrent()) { cancel(); return cancel; }

  const attempt = () => {
    if (cancelled || !isCurrent() || AppState.currentState === 'background' || AppState.currentState === 'inactive') {
      cancel(); return;
    }
    if (inFlight) { focusWhilePending = true; return; }
    const tag = findNodeHandle(view);
    if (tag === null) { cancel(); return; }
    inFlight = true;
    focusWhilePending = false;
    void native.requestFocus(tag).then((result) => {
      inFlight = false;
      if (cancelled || !isCurrent()) { cancel(); return; }
      if (result !== 'window-unfocused' || !afterModalDismiss) { cancel(); return; }
      // 응답 전에 창 복귀 이벤트가 왔어도 잃지 않는다. 이벤트 없는 반복은 하지 않는다.
      if (focusWhilePending) attempt();
    }, cancel);
  };

  if (afterModalDismiss) {
    focusSubscription = AppState.addEventListener('focus', attempt);
    stateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
  }
  attempt();
  // 이미 native로 전달된 단일 요청은 되돌리지 않는다. 후속 대기/재요청만 해제한다.
  return cancel;
}

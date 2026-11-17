import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform, type View } from 'react-native';

import { type ButtonHandle, type CancelFocus, type KeyboardFocusOptions, requestAndroidKeyboardFocus } from './keyboardFocus';

export function useKeyboardFocus(ref: RefObject<View | null>, blocked: boolean): ButtonHandle {
  const mounted = useRef(false);
  const currentBlocked = useRef(blocked);
  const pending = useRef<CancelFocus | undefined>(undefined);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.(); };
  }, []);
  useLayoutEffect(() => {
    currentBlocked.current = blocked;
    if (blocked) pending.current?.();
  }, [blocked]);

  const requestKeyboardFocus = useCallback((options: KeyboardFocusOptions = {}) => {
    pending.current?.();
    const view = ref.current;
    if (!view || !mounted.current || currentBlocked.current) return () => {};
    let active = true;
    let stopNative: CancelFocus | undefined;
    const cancel = () => {
      if (!active) return;
      active = false;
      stopNative?.();
      if (pending.current === cancel) pending.current = undefined;
    };
    pending.current = cancel;
    const isCurrent = () => active && mounted.current && !currentBlocked.current && ref.current === view && (options.isCurrent?.() ?? true);
    if (!isCurrent()) { cancel(); return cancel; }
    if (Platform.OS === 'android') {
      stopNative = requestAndroidKeyboardFocus(view, isCurrent, options.afterModalDismiss === true);
    } else {
      view.focus();
    }
    return cancel;
  }, [ref]);

  return useMemo(() => ({ focus: () => { requestKeyboardFocus(); }, requestKeyboardFocus }), [requestKeyboardFocus]);
}

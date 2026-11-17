import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';
import type { CancelFocus, FocusTarget } from './keyboardFocus';
import { useKeyboardFocus } from './useKeyboardFocus';

export type DialogProps = {
  visible: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onRequestClose: () => void;
  initialFocusRef?: RefObject<FocusTarget | null>;
  returnFocusRef?: RefObject<FocusTarget | null>;
};

export function Dialog({ visible, title, children, actions, onRequestClose, initialFocusRef, returnFocusRef }: DialogProps) {
  const titleRef = useRef<Text>(null);
  const closeRef = useRef<View>(null);
  const closeFocus = useKeyboardFocus(closeRef, !visible);
  const [closeFocused, setCloseFocused] = useState(false);
  const wasVisible = useRef(visible);
  const current = useRef({ visible, initialFocusRef, returnFocusRef });
  const mounted = useRef(false);
  const pending = useRef<{ cancel: CancelFocus; isCurrent: () => boolean } | undefined>(undefined);
  const stopPending = useCallback(() => {
    const previous = pending.current;
    pending.current = undefined;
    previous?.cancel();
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopPending(); };
  }, [stopPending]);
  useLayoutEffect(() => {
    current.current = { visible, initialFocusRef, returnFocusRef };
    if (pending.current && !pending.current.isCurrent()) stopPending();
  });

  const requestFocus = useCallback((target: FocusTarget | null | undefined, afterModalDismiss: boolean) => {
    stopPending();
    if (!target) return;
    const isCurrent = () => mounted.current && (afterModalDismiss
      ? !current.current.visible && current.current.returnFocusRef?.current === target
      : current.current.visible && (current.current.initialFocusRef?.current ?? closeFocus) === target);
    if (!isCurrent()) return;
    if (target.requestKeyboardFocus) {
      const cancel = target.requestKeyboardFocus({ afterModalDismiss, isCurrent });
      pending.current = { cancel, isCurrent };
    } else {
      // TextInput 등 기존 공개 focus 계약은 그대로 사용한다.
      target.focus();
    }
  }, [closeFocus, stopPending]);
  const restoreFocus = useCallback(() => {
    if (current.current.visible) return;
    requestFocus(current.current.returnFocusRef?.current, true);
  }, [requestFocus]);

  useEffect(() => {
    if (visible) { wasVisible.current = true; return; }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    // RN onDismiss는 iOS 전용이다. frame은 닫힘 반영용이며 창 준비 완료의 증거가 아니다.
    // 일반 버튼은 실제 Activity focus 이벤트를 기다리는 별도 경로를 사용한다.
    if (Platform.OS === 'android') {
      const frame = requestAnimationFrame(restoreFocus);
      return () => cancelAnimationFrame(frame);
    }
  }, [visible, restoreFocus]);

  return (
    <Modal
      visible={visible} transparent animationType="none"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onRequestClose}
      onDismiss={restoreFocus}
      onShow={() => {
        if (!current.current.visible) return;
        requestFocus(current.current.initialFocusRef?.current ?? closeFocus, false);
        // 화면 읽기 시작 위치와 입력 장치 포커스는 서로 다른 요청이다.
        if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
      }}
    >
      {visible && (
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.panel} accessibilityViewIsModal importantForAccessibility="yes">
            <View style={styles.header}>
              <Text ref={titleRef} accessibilityRole="header" style={styles.title}>{title}</Text>
              <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel="닫기" focusable
                onPress={onRequestClose} onFocus={() => setCloseFocused(true)} onBlur={() => setCloseFocused(false)}
                style={[styles.close, closeFocused && styles.closeFocused]}>
                <Image source={require('../../assets/images/ui/close.png')} style={styles.closeIcon} accessible={false} />
              </Pressable>
            </View>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
              {children}
              {actions && <View style={styles.actions}>{actions}</View>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(31,17,3,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 516, maxHeight: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 40, overflow: 'hidden' },
  header: { minHeight: 68, paddingVertical: 16, paddingHorizontal: 64, justifyContent: 'center', backgroundColor: colors.surfaceWhite },
  title: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 30.8, color: '#1C0D02', textAlign: 'center' },
  close: { position: 'absolute', right: 12, top: 12, width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#EFECE9', alignItems: 'center', justifyContent: 'center' },
  closeFocused: { borderColor: colors.textPrimary },
  closeIcon: { width: 16, height: 16 },
  body: { flexGrow: 0, flexShrink: 1, borderWidth: 2, borderColor: '#EFECE9', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  bodyContent: { padding: 24, gap: 20 },
  actions: { gap: 12 },
});

import { type ComponentProps, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, type Text, View } from 'react-native';

import { AppText } from './AppText';
import { colors, fonts } from '../theme/tokens';

type InputFocusTarget = { focus(): void };

export type DialogProps = {
  visible: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  scrollable?: boolean;
  inline?: boolean;
  panelMotionStyle?: ComponentProps<typeof Animated.View>['style'];
  onRequestClose: () => void;
  initialFocusRef?: RefObject<InputFocusTarget | null>;
  returnFocusRef?: RefObject<InputFocusTarget | null>;
};

export function Dialog({ visible, title, children, actions, scrollable = true, inline = false, panelMotionStyle,
  onRequestClose, initialFocusRef, returnFocusRef }: DialogProps) {
  const titleRef = useRef<Text>(null);
  const wasVisible = useRef(visible);
  const current = useRef({ visible, initialFocusRef, returnFocusRef });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    current.current = { visible, initialFocusRef, returnFocusRef };
  });

  const restoreFocus = useCallback(() => {
    if (!mounted.current || current.current.visible) return;
    current.current.returnFocusRef?.current?.focus();
  }, []);

  useEffect(() => {
    if (visible) { wasVisible.current = true; return; }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    // RN onDismiss는 iOS 전용이다. frame은 닫힘 반영용이며 창 준비 완료의 증거가 아니다.
    if (inline || Platform.OS === 'android') {
      const frame = requestAnimationFrame(restoreFocus);
      return () => cancelAnimationFrame(frame);
    }
  }, [visible, inline, restoreFocus]);

  const focusDialog = useCallback(() => {
    if (!mounted.current || !current.current.visible) return;
    current.current.initialFocusRef?.current?.focus();
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, []);

  const close = useRef(onRequestClose);
  useLayoutEffect(() => { close.current = onRequestClose; }, [onRequestClose]);
  useEffect(() => {
    if (!inline || !visible) return;
    const frame = requestAnimationFrame(focusDialog);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      close.current();
      return true;
    });
    return () => { cancelAnimationFrame(frame); back.remove(); };
  }, [focusDialog, inline, visible]);

  const body = <>{children}{actions && <View style={styles.actions}>{actions}</View>}</>;
  const content = visible && (
    <KeyboardAvoidingView style={[styles.overlay, inline && styles.inline]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={[styles.panel, panelMotionStyle]} accessibilityViewIsModal importantForAccessibility="yes">
        <View style={styles.header}>
          <AppText ref={titleRef} accessibilityRole="header" style={styles.title}>{title}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기"
            onPress={onRequestClose} style={styles.close}>
            <Image source={require('../../assets/images/ui/close.png')} style={styles.closeIcon} accessible={false} />
          </Pressable>
        </View>
        {scrollable
          ? <ScrollView bounces={false} style={styles.body} contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps={Platform.OS === 'ios' ? 'always' : 'handled'}>{body}</ScrollView>
          : <View style={[styles.body, styles.bodyContent]}>{body}</View>}
      </Animated.View>
    </KeyboardAvoidingView>
  );

  // 민감한 날짜 선택창도 진입 보호 뷰가 가릴 수 있도록 같은 화면 안에서 표시한다.
  if (inline) return content || null;
  return (
    <Modal
      visible={visible} transparent animationType="none"
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={onRequestClose}
      onDismiss={restoreFocus}
      onShow={focusDialog}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(31,17,3,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  inline: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  panel: { width: '100%', maxWidth: 516, maxHeight: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 40, overflow: 'hidden' },
  header: { minHeight: 68, paddingVertical: 16, paddingHorizontal: 64, justifyContent: 'center', backgroundColor: colors.surfaceWhite },
  title: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 30.8, color: '#1C0D02', textAlign: 'center' },
  close: { position: 'absolute', right: 12, top: 12, width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#EFECE9', alignItems: 'center', justifyContent: 'center' },
  closeIcon: { width: 16, height: 16 },
  body: { flexGrow: 0, flexShrink: 1, borderWidth: 2, borderColor: '#EFECE9', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  bodyContent: { padding: 24, gap: 20 },
  actions: { gap: 12 },
});

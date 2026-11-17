import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, fonts } from '../theme/tokens';
import type { ButtonHandle } from './keyboardFocus';
import { useKeyboardFocus } from './useKeyboardFocus';

export type { ButtonHandle } from './keyboardFocus';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
};

export const Button = forwardRef<ButtonHandle, ButtonProps>(function Button(
  { label, onPress, variant = 'primary', disabled = false, loading = false }, ref,
) {
  const [focused, setFocused] = useState(false);
  const blocked = disabled || loading;
  const hostRef = useRef<View>(null);
  const focusHandle = useKeyboardFocus(hostRef, blocked);
  useImperativeHandle(ref, () => focusHandle, [focusHandle]);

  return (
    <Pressable
      ref={hostRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      focusable={!blocked}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => { if (!blocked) onPress(); }}
      style={({ pressed }) => [
        styles.button, variant === 'primary' ? styles.primary : styles.secondary,
        blocked && styles.disabled, focused && !blocked && styles.focused,
        pressed && !blocked && styles.pressed,
      ]}
    >
      {loading && <ActivityIndicator color={colors.textPrimary} accessible={false} />}
      <AppText style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</AppText>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    minHeight: 60, borderRadius: 20, borderWidth: 2, borderColor: 'transparent',
    paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceWhite },
  disabled: { backgroundColor: colors.border },
  focused: { borderColor: colors.textPrimary },
  pressed: { opacity: 0.8 },
  // P0의 밝은 글씨 대신 사용자가 승인한 기존 진한 글씨 토큰을 적용한다.
  label: { fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 28, color: colors.textPrimary, textAlign: 'center', flexShrink: 1 },
  secondaryLabel: { color: colors.textSignUp },
});

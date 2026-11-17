import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { colors, fonts } from '../theme/tokens';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false }: ButtonProps) {
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={() => { if (!blocked) onPress(); }}
      style={({ pressed }) => [
        styles.button, variant === 'primary' ? styles.primary : styles.secondary,
        blocked && styles.disabled,
        pressed && !blocked && styles.pressed,
      ]}
    >
      {loading && <ActivityIndicator color={colors.textPrimary} accessible={false} />}
      <AppText style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 60, borderRadius: 20, borderWidth: 2, borderColor: 'transparent',
    paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceWhite },
  disabled: { backgroundColor: colors.border },
  pressed: { opacity: 0.8 },
  // P0의 밝은 글씨 대신 사용자가 승인한 기존 진한 글씨 토큰을 적용한다.
  label: { fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 28, color: colors.textPrimary, textAlign: 'center', flexShrink: 1 },
  secondaryLabel: { color: colors.textSignUp },
});

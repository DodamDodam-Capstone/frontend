import { forwardRef, useId, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { AppText } from './AppText';
import { colors, typography } from '../theme/tokens';

export type TextFieldProps = Pick<TextInputProps,
  'value' | 'onChangeText' | 'secureTextEntry' | 'keyboardType' | 'autoCapitalize' |
  'autoCorrect' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' |
  'submitBehavior' | 'placeholder'
> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, value, onChangeText, helperText, error, disabled = false, ...inputProps }, ref,
) {
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const message = error ? `오류: ${error}` : helperText;

  return (
    <View style={styles.field}>
      <AppText nativeID={labelId} style={styles.label}>{label}</AppText>
      <TextInput
        {...inputProps}
        ref={ref}
        value={value}
        onChangeText={(text) => { if (!disabled) onChangeText(text); }}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        accessibilityHint={message}
        accessibilityState={{ disabled }}
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.textPlaceholder}
        selectionColor={colors.textLabel}
        style={[styles.input, !!error && styles.error, focused && !disabled && styles.focused, disabled && styles.disabled]}
      />
      {!!message && <AppText style={styles.message} accessibilityLiveRegion="polite">{message}</AppText>}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { ...typography.label, color: colors.textLabel },
  input: {
    ...typography.input, color: colors.textPrimary, backgroundColor: colors.surfaceWhite,
    minHeight: 60, borderWidth: 2, borderColor: colors.border, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 14,
  },
  error: { borderColor: colors.textLabel },
  focused: { borderColor: colors.textPrimary, borderWidth: 3, paddingHorizontal: 17, paddingVertical: 13 },
  disabled: { backgroundColor: colors.border, color: colors.textSecondary },
  message: { ...typography.label, fontFamily: typography.input.fontFamily, color: colors.textLabel },
});

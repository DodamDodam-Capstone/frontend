import { forwardRef, useId, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { AppText } from './AppText';
import { colors, typography } from '../theme/tokens';

export type TextFieldProps = Pick<TextInputProps,
  'value' | 'onChangeText' | 'secureTextEntry' | 'keyboardType' | 'autoCapitalize' |
  'autoCorrect' | 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' |
  'submitBehavior' | 'placeholder' | 'onFocus' | 'onPress'
> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  helperText?: string;
  showMessage?: boolean;
  showErrorInInput?: boolean;
  error?: string;
  disabled?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, value, onChangeText, helperText, showMessage = true, showErrorInInput = false, error, disabled = false,
    onFocus, placeholder, ...inputProps }, ref,
) {
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const message = error ? `오류: ${error}` : helperText;
  const inputError = showErrorInInput ? error : undefined;

  return (
    <View style={styles.field}>
      <AppText nativeID={labelId} style={styles.label}>{label}</AppText>
      <TextInput
        {...inputProps}
        ref={ref}
        value={inputError ? '' : value}
        placeholder={inputError ?? placeholder}
        onChangeText={(text) => { if (!disabled) onChangeText(text); }}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        accessibilityHint={message}
        accessibilityState={{ disabled }}
        editable={!disabled}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={() => setFocused(false)}
        placeholderTextColor={inputError ? colors.textError : colors.textPlaceholder}
        selectionColor={colors.textLabel}
        style={[styles.input, !!error && styles.error, focused && !disabled && styles.focused, disabled && styles.disabled]}
      />
      {showMessage && !inputError && !!message && <AppText style={styles.message} accessibilityLiveRegion="polite">{message}</AppText>}
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

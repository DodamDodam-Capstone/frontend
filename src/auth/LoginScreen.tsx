import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, ScrollView, StyleSheet, type TextInput, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';
import { useRetryWaiting } from '../components/useRetryWaiting';
import { colors, fonts, typography } from '../theme/tokens';
import type { LoginFeedback } from './emailLogin';

export type { LoginFeedback } from './emailLogin';

type LoginScreenProps = {
  submit: (email: string, password: string) => Promise<LoginFeedback | undefined>;
  retryAt: number | undefined;
  initialFeedback?: LoginFeedback;
  blocked?: boolean;
  retrySecurity?: () => Promise<void>;
  openSignup?: () => void;
};

const symbol = require('../../assets/images/login/symbol.png');
const requestLimited = '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';

export function LoginScreen({ submit, retryAt, initialFeedback, blocked = false, retrySecurity, openSignup }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const waiting = useRetryWaiting(retryAt);
  const signupDisabled = !openSignup || submitting || blocked || !!retrySecurity;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function clearFieldError(field: 'email' | 'password') {
    setFeedback((current) => {
      if (!current?.fields) return undefined;
      const fields = { ...current.fields, [field]: undefined };
      return fields.email || fields.password ? { ...current, fields } : undefined;
    });
  }

  async function submitForm() {
    if (inFlight.current || blocked || retrySecurity || (retryAt !== undefined && retryAt > Date.now())) return;
    // 버튼 탭과 키보드 제출은 React의 상태가 갱신되기 전에도 연달아 올 수 있다.
    inFlight.current = true;
    setSubmitting(true);
    setFeedback(undefined);
    Keyboard.dismiss();
    try {
      const result = await submit(email, password);
      if (!mounted.current) return;
      setFeedback(result);
      if (!result) setPassword('');
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const message = waiting ? requestLimited : retrySecurity ? '보안 확인을 완료하지 못했어요.'
    : feedback?.retryAt === undefined ? feedback?.message : undefined;
  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.form}>
          <View style={styles.heading}>
            <Image style={styles.symbol} source={symbol} resizeMode="contain" accessible={false} />
            <AppText accessibilityRole="header" style={styles.title}>보호자 로그인</AppText>
          </View>
          <View style={styles.fields}>
            <TextField label="이메일" placeholder="이메일을 입력해주세요." value={email}
              onChangeText={(value) => { setEmail(value); clearFieldError('email'); }}
              keyboardType="email-address" autoComplete="username" autoCapitalize="none" autoCorrect={false}
              returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => { passwordInput.current?.focus(); }}
              error={feedback?.fields?.email} disabled={submitting} />
            <TextField ref={passwordInput} label="비밀번호" placeholder="비밀번호를 입력해주세요." value={password}
              onChangeText={(value) => { setPassword(value); clearFieldError('password'); }}
              secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false}
              returnKeyType="go" onSubmitEditing={() => { void submitForm(); }}
              error={feedback?.fields?.password} disabled={submitting} />
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={[styles.reset, styles.unavailable]}>
            <AppText style={styles.resetLabel}>비밀번호를 잊으셨나요?</AppText>
          </Pressable>
          <View style={styles.actions}>
            {message && <ErrorMessage message={message} />}
            <Button label="로그인" onPress={() => { void submitForm(); }} loading={submitting}
              disabled={waiting || blocked || !!retrySecurity} />
            {retrySecurity && <Button label="보안 확인 다시 시도" variant="secondary" disabled={waiting} loading={blocked}
              onPress={() => { void retrySecurity(); }} />}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: signupDisabled }} disabled={signupDisabled}
              onPress={openSignup} style={[styles.signUp, signupDisabled && styles.unavailable]}>
              <AppText style={styles.signUpLabel}>이메일로 회원 가입</AppText>
            </Pressable>
          </View>
          <View style={styles.social}>
            <View style={styles.separator}>
              <View style={styles.rule} />
              <AppText style={styles.separatorLabel}>소셜 로그인</AppText>
              <View style={styles.rule} />
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={[styles.google, styles.unavailable]}>
              <AppText style={styles.googleLabel}>Google</AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: '#F7F2E6',
    experimental_backgroundImage: [{
      type: 'linear-gradient', direction: 'to bottom',
      colorStops: [{ color: '#F7F2E6', positions: ['0%'] }, { color: '#EAF2DE', positions: ['100%'] }],
    }],
  },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  form: { alignSelf: 'center', width: '100%', maxWidth: 596 },
  heading: { alignItems: 'center', gap: 4, marginBottom: 26 },
  symbol: { width: 80, height: 68 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  fields: { gap: 16 },
  reset: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', marginTop: 12 },
  resetLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textSecondary, textDecorationLine: 'underline' },
  actions: { gap: 16, marginTop: 25 },
  signUp: { minHeight: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWhite, paddingVertical: 16, paddingHorizontal: 20 },
  signUpLabel: { ...typography.body, fontFamily: fonts.extraBold, color: colors.textSignUp, textAlign: 'center' },
  unavailable: { opacity: 0.65 },
  social: { gap: 16, marginTop: 22 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 30 },
  separatorLabel: { ...typography.label, fontFamily: fonts.bold, color: colors.textLabel },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.textLabel },
  google: { minHeight: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWhite, paddingVertical: 15, paddingHorizontal: 20 },
  googleLabel: { ...typography.input, fontFamily: fonts.bold, color: colors.textSocial, textAlign: 'center' },
});

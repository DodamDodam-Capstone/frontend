import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';

import { AppText } from '../components/AppText';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';
import { colors, fonts, typography } from '../theme/tokens';
import type { EmailVerificationFlow } from './emailVerification';
import { SignupCompleteScreen } from './SignupCompleteScreen';
import { SignupProgress } from './SignupProgress';
import { validateSignupPassword } from './signupPassword';
import { VerificationPanel, useVerificationClock } from './VerificationPanel';

type ScreenFlow = Pick<EmailVerificationFlow, 'getSnapshot' | 'subscribe' | 'setEmail' | 'clearInvalidEmail' | 'openEmail' | 'issue' |
  'verify' | 'closeDialog' | 'finish' | 'syncTime' | 'submitSignup'>;
type SignupSnapshot = ReturnType<ScreenFlow['getSnapshot']>;

function SignupPasswordForm({ state, now, scroll, onSubmit, onBack }: {
  state: SignupSnapshot;
  now: number;
  scroll: RefObject<ScrollView | null>;
  onSubmit: ScreenFlow['submitSignup'];
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [edited, setEdited] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const confirmationInput = useRef<TextInput>(null);
  const submitting = state.signupStatus === 'submitting';
  const canEdit = state.step === 'verified' && !submitting && (state.tokenExpiresAt ?? 0) > now;
  const passwordError = password === '' ? undefined : validateSignupPassword(password);
  const mismatch = confirmation !== '' && confirmation !== password ? '비밀번호가 일치하지 않아요.' : undefined;
  const canSubmit = canEdit && password !== '' && !passwordError && confirmation === password
    && (state.signupRetryAt ?? 0) <= now;
  const canGoToLogin = state.signupStatus === 'exists' || state.signupStatus === 'uncertain';
  const scrollToFocusedPassword = useCallback(() => {
    if (!Keyboard.isVisible()) return;
    requestAnimationFrame(() => {
      const input = passwordInput.current?.isFocused() ? passwordInput.current : confirmationInput.current;
      if (input?.isFocused()) scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input, 16, true);
    });
  }, [scroll]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const keyboard = Keyboard.addListener('keyboardDidShow', scrollToFocusedPassword);
    return () => keyboard.remove();
  }, [scrollToFocusedPassword]);

  function submit() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setEdited(false);
    void onSubmit(password, confirmation);
  }

  return (
    <>
      <View style={[styles.form, styles.passwordFields]}>
        <TextField ref={passwordInput} label="비밀번호" value={password} placeholder="15~128자로 입력해 주세요."
          onChangeText={value => { setEdited(true); setPassword(value); }}
          secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmationInput.current?.focus()}
          onFocus={scrollToFocusedPassword}
          disabled={!canEdit} error={passwordError ?? (edited ? undefined : state.signupPasswordError)} />
        <TextField ref={confirmationInput} label="비밀번호 확인" value={confirmation}
          placeholder="같은 비밀번호를 다시 입력해 주세요." onChangeText={setConfirmation}
          secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off"
          returnKeyType="done" onFocus={scrollToFocusedPassword} disabled={!canEdit} error={mismatch} />
        {state.signupMessage && <ErrorMessage message={state.signupMessage} />}
      </View>
      <View style={styles.footer}>
        <View style={styles.footerActions}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backAction}>
            <AppText style={styles.backText}>{canGoToLogin ? '로그인하기' : '뒤로 가기'}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!canSubmit}
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            style={({ pressed }) => [styles.createAction, !canSubmit && styles.createDisabled,
              pressed && canSubmit && styles.createPressed]} onPress={submit}>
            {submitting && <ActivityIndicator color={colors.surfaceWhite} accessible={false} />}
            <AppText style={styles.createText}>{submitting ? '계정 만드는 중' : '계정 만들기'}</AppText>
          </Pressable>
        </View>
      </View>
    </>
  );
}

export function SignupVerificationScreen({ flow, onBack }: { flow: ScreenFlow; onBack: () => void }) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const { width } = useWindowDimensions();
  const railWidth = Math.min(215, width * 215 / 1280);
  const verified = state.step === 'success' || state.step === 'verified';
  const panel = state.step === 'email' || state.step === 'code' || state.step === 'success';
  const trigger = useRef<View>(null);
  const heading = useRef<Text>(null);
  const scroll = useRef<ScrollView>(null);
  const previousPanel = useRef(false);
  const now = useVerificationClock(
    flow.syncTime, state.expiresAt, state.tokenExpiresAt, state.issueRetryAt, state.verifyRetryAt, state.signupRetryAt,
  );
  const emailLocked = state.signupStatus === 'submitting' || state.signupStatus === 'uncertain';
  const verifyDisabled = verified || emailLocked || state.signupStatus === 'exists';
  const close = useCallback(() => {
    Keyboard.dismiss();
    if (panel) flow.closeDialog();
    else onBack();
  }, [flow, onBack, panel]);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => back.remove();
  }, [close]);

  useEffect(() => {
    if (state.emailFormatError) AccessibilityInfo.announceForAccessibility(state.emailFormatError);
  }, [state.emailFormatError]);

  useEffect(() => {
    if (previousPanel.current && !panel) {
      if (!verified) trigger.current?.focus();
      const returnTarget = verified ? heading.current : trigger.current;
      if (returnTarget) AccessibilityInfo.sendAccessibilityEvent(returnTarget, 'focus');
    }
    previousPanel.current = panel;
  }, [panel, verified]);

  if (state.signupStatus === 'complete') return <SignupCompleteScreen onLogin={close} />;

  return (
    <View style={styles.root}>
      <View style={styles.layout} accessibilityElementsHidden={panel}
        importantForAccessibility={panel ? 'no-hide-descendants' : 'auto'} pointerEvents={panel ? 'none' : 'auto'}>
        <SignupProgress step={verified ? 'password' : 'email'} width={railWidth} />
        <KeyboardAvoidingView style={styles.formColumn} behavior="padding" enabled={Platform.OS === 'android'}>
          <ScrollView ref={scroll} bounces={false} testID="signup-form-scroll" keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.formScroll} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={styles.form}>
              <View style={styles.heading}>
                <AppText ref={heading} style={styles.title} accessibilityRole="header">보호자 계정 만들기</AppText>
                <AppText style={styles.subheading}>{verified ? '인증을 마쳤어요. 비밀번호를 설정해 주세요.'
                  : '이메일을 인증하고 비밀번호를 설정해 주세요.'}</AppText>
              </View>
              <TextField label="이메일" value={state.email} onChangeText={flow.setEmail} disabled={emailLocked}
                placeholder="이메일을 입력해주세요." keyboardType="email-address" autoComplete="email"
                error={state.emailFormatError} showErrorInInput onPress={flow.clearInvalidEmail} onFocus={flow.clearInvalidEmail}
                autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
              <View style={styles.fieldGroup}>
                <AppText style={styles.label}>이메일 인증  *필수</AppText>
                <View style={styles.verificationRow}>
                  <View style={styles.statusBox}><AppText style={styles.statusText}>{verified
                    ? '이메일 인증이 완료되었어요.' : '이메일 인증을 완료해 주세요.'}</AppText></View>
                  <Pressable ref={trigger} accessibilityRole="button" disabled={verifyDisabled}
                    accessibilityState={{ disabled: verifyDisabled }}
                    style={[styles.verifyTrigger, verified && styles.verifiedTrigger]}
                    onPress={() => { Keyboard.dismiss(); flow.openEmail(); }}>
                    <AppText style={[styles.triggerText, verified && styles.verifiedText]}>{verified ? '인증 완료' : '인증하기'}</AppText>
                  </Pressable>
                </View>
                {!panel && state.message && state.message !== state.signupMessage && <ErrorMessage message={state.message} />}
              </View>
            </View>
            <SignupPasswordForm key={state.step === 'verified' ? state.email : state.step}
              state={state} now={now} scroll={scroll} onBack={close} onSubmit={flow.submitSignup} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      {panel && <VerificationPanel step={state.step} email={state.email} busy={state.busy}
        challengeId={state.challengeId} expiresAt={state.expiresAt} message={state.message}
        issueRetryAt={state.issueRetryAt} verifyRetryAt={state.verifyRetryAt} now={now} onClose={close}
        onIssue={flow.issue} onVerify={flow.verify} onFinish={flow.finish} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  layout: { flex: 1, flexDirection: 'row' },
  formColumn: { flex: 1 },
  formScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: '3%', paddingVertical: 24 },
  form: { width: '87%', maxWidth: 802, alignSelf: 'center', gap: 20 },
  heading: { gap: 10, marginBottom: 12 },
  title: { ...typography.title, fontSize: 28, lineHeight: 36, color: colors.textPrimary },
  subheading: { ...typography.body, color: colors.textSecondary },
  fieldGroup: { gap: 8 },
  label: { ...typography.label, color: colors.textLabel },
  verificationRow: { flexDirection: 'row', gap: 18, alignItems: 'stretch' },
  statusBox: { flex: 1, minHeight: 56, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12,
    justifyContent: 'center', borderColor: colors.border, borderWidth: 2, backgroundColor: colors.surfaceWhite },
  statusText: { ...typography.input, color: colors.textPlaceholder },
  verifyTrigger: { width: '22%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18,
    borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surfaceWhite, padding: 8 },
  verifiedTrigger: { backgroundColor: colors.primary },
  triggerText: { ...typography.body, fontFamily: fonts.extraBold, textAlign: 'center', color: '#418813' },
  verifiedText: { color: colors.surfaceWhite },
  passwordFields: { marginTop: 20 },
  footer: { borderTopWidth: 1, borderColor: colors.border, marginTop: 32, paddingTop: 22 },
  footerActions: { alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '87%', maxWidth: 802 },
  backAction: { width: '22.5%', minWidth: 110, minHeight: 60, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  createAction: { width: '22.5%', minWidth: 145, minHeight: 60, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderRadius: 20,
    backgroundColor: colors.primary, boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.05)' },
  createDisabled: { backgroundColor: '#BBB1A7' },
  createPressed: { opacity: 0.8 },
  createText: { ...typography.body, color: colors.surfaceWhite, textAlign: 'center', flexShrink: 1 },
  backText: { ...typography.body, color: colors.textSignUp },
});

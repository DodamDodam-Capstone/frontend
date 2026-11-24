import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { colors, fonts, typography } from '../theme/tokens';

export function useVerificationClock(syncTime: () => void, expiresAt?: number, tokenExpiresAt?: number,
  issueRetryAt?: number, verifyRetryAt?: number, signupRetryAt?: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const times = [expiresAt, tokenExpiresAt, issueRetryAt, verifyRetryAt, signupRetryAt];
    if (times.every(at => at === undefined)) return;
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      clearTimeout(timer);
      syncTime();
      const now = Date.now();
      setNow(now);
      const deadlines = times.filter((at): at is number => at !== undefined && at > now);
      if (!deadlines.length) return;
      const delay = Math.min(...deadlines) - now;
      timer = setTimeout(tick, Math.min(delay, expiresAt || issueRetryAt ? 1_000 : 2_147_483_647));
    }
    tick();
    const listener = AppState.addEventListener('change', status => { if (status === 'active') tick(); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [syncTime, expiresAt, tokenExpiresAt, issueRetryAt, verifyRetryAt, signupRetryAt]);
  return now;
}

type PanelProps = {
  step: 'email' | 'code' | 'success';
  email: string;
  busy: boolean;
  challengeId?: string;
  expiresAt?: number;
  message?: string;
  issueRetryAt?: number;
  verifyRetryAt?: number;
  now: number;
  onClose: () => void;
  onIssue: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  onFinish: () => void;
};

function CodeEntry({ email, busy, expiresAt, issueRetryAt, verifyRetryAt, message, now, onIssue, onVerify, challengeId }: PanelProps) {
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const seconds = Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 1000));
  const retrySeconds = Math.max(0, Math.ceil(((issueRetryAt ?? now) - now) / 1000));
  const waiting = retrySeconds > 0;
  const blocked = busy || (verifyRetryAt ?? 0) > now || !challengeId || !seconds || !/^[0-9]{6}$/.test(code);
  const remaining = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  function confirm() {
    if (blocked) return;
    Keyboard.dismiss();
    void onVerify(code);
  }
  return <>
    <AppText style={styles.intro}>{email.trim() + '로 보낸\n인증번호 6자리를 입력해 주세요.'}</AppText>
    <View style={styles.codeInput}>
      <TextInput accessibilityLabel="인증번호 6자리" value={code}
        keyboardType={Platform.OS === 'ios' && Platform.isPad ? 'numbers-and-punctuation' : 'number-pad'}
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        textContentType="oneTimeCode" autoCorrect={false} maxLength={6} caretHidden selectionColor="transparent" underlineColorAndroid="transparent"
        onChangeText={value => { if (/^[0-9]{0,6}$/.test(value)) setCode(value); }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        editable={!busy && !!seconds} onSubmitEditing={confirm} returnKeyType="done"
        style={styles.nativeInput} />
      <View style={styles.cells} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.cell, focused && index === Math.min(code.length, 5) && styles.focusCell]}>
            <AppText style={styles.digit}>{code[index] ?? ''}</AppText>
          </View>
        ))}
      </View>
    </View>
    <View style={styles.resendRow}>
      <AppText style={styles.clock}>{'남은 시간 ' + remaining}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="인증번호 재전송"
        accessibilityState={{ disabled: busy || waiting }} disabled={busy || waiting}
        onPress={() => { Keyboard.dismiss(); void onIssue(); }}
        style={[styles.resend, (busy || waiting) && styles.disabled]}>
        <AppText style={styles.resendText}>{waiting ? retrySeconds + '초 후 재전송' : '인증번호 재전송'}</AppText>
      </Pressable>
    </View>
    {message && <ErrorMessage message={message} />}
    <Button label="확인" variant="onboarding" disabled={blocked} onPress={confirm} />
    <AppText style={styles.hint}>메일이 보이지 않으면 스팸함도 확인해 주세요.</AppText>
  </>;
}

export function VerificationPanel(props: PanelProps) {
  const { step, email, busy, now, issueRetryAt, message, onClose, onIssue, onFinish } = props;
  const header = useRef<Text>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (header.current) AccessibilityInfo.sendAccessibilityEvent(header.current, 'focus');
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Activity/UIView의 개인정보 가림 처리를 그대로 받도록 같은 네이티브 창에 표시한다.
  return (
    <KeyboardAvoidingView style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} accessibilityViewIsModal importantForAccessibility="yes">
      <View style={styles.panel}>
        <View style={styles.header}>
          <AppText ref={header} accessibilityRole="header" style={styles.title}>
            {step === 'email' ? '이메일 인증' : step === 'code' ? '인증번호 입력' : '이메일 인증 완료'}
          </AppText>
          {step !== 'success' && <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.close} onPress={onClose}>
            <Image source={require('../../assets/images/ui/close.png')} style={styles.closeIcon} accessible={false} />
          </Pressable>}
        </View>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.body}>
          {step === 'email' && <>
            <View style={styles.addressGroup}>
              <AppText style={styles.addressLabel}>이메일 주소</AppText>
              <View style={styles.addressBox}><AppText style={styles.addressText}>{email.trim()}</AppText></View>
            </View>
            {message && <ErrorMessage message={message} />}
            <Button label={busy ? '보내는 중…' : '인증번호 받기'} variant="onboarding"
              loading={busy} disabled={issueRetryAt !== undefined && issueRetryAt > now} onPress={() => { void onIssue(); }} />
          </>}
          {step === 'code' && <CodeEntry key={props.challengeId} {...props} />}
          {step === 'success' && <>
            <View style={styles.successIcon} accessible={false}>
              <Image source={require('../../assets/images/signup/success-circle.png')} style={styles.successDisc} accessible={false} />
              <Image source={require('../../assets/images/signup/success-mark.png')} style={styles.successMark} accessible={false} />
            </View>
            <AppText style={styles.intro}>{'이메일 인증이 완료되었어요.\n이제 비밀번호를 설정해 주세요.'}</AppText>
            <Button label="비밀번호 설정하기" variant="onboarding" onPress={onFinish} />
          </>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.70)',
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  panel: { flexShrink: 1, marginVertical: 16, width: '100%', maxWidth: 516, maxHeight: '100%', overflow: 'hidden',
    borderRadius: 36, backgroundColor: colors.surface, borderColor: '#EFECE9', borderWidth: 1 },
  header: { flexShrink: 0, minHeight: 66, paddingHorizontal: 60, paddingVertical: 12, justifyContent: 'center',
    backgroundColor: colors.surfaceWhite, borderBottomWidth: 1, borderColor: '#EFECE9' },
  title: { ...typography.body, fontFamily: fonts.extraBold, textAlign: 'center', color: colors.textPrimary },
  close: { position: 'absolute', right: 20, top: 10, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFECE9' },
  closeIcon: { width: 16, height: 16 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 28, paddingVertical: 26, gap: 16 },
  addressGroup: { gap: 8 },
  addressLabel: { ...typography.label, color: colors.textLabel },
  addressBox: { borderRadius: 12, minHeight: 48, justifyContent: 'center', backgroundColor: colors.surfaceWhite,
    borderWidth: 2, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 8 },
  addressText: { ...typography.input, color: colors.textSecondary },
  intro: { ...typography.input, fontFamily: fonts.bold, textAlign: 'center', color: colors.textLabel },
  codeInput: { minHeight: 72 },
  cells: { minHeight: 72, flexDirection: 'row', gap: 8 },
  cell: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
    borderRadius: 14, backgroundColor: colors.surfaceWhite, borderColor: colors.border },
  focusCell: { borderColor: colors.primary },
  digit: { ...typography.body, color: colors.textPrimary, fontSize: 24, lineHeight: 32 },
  nativeInput: { ...StyleSheet.absoluteFill, padding: 0, fontSize: 1, color: 'transparent', backgroundColor: 'transparent' },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  clock: { ...typography.label, color: colors.textError },
  resend: { justifyContent: 'center', minHeight: 48, borderRadius: 20, backgroundColor: '#DCFFA3', paddingHorizontal: 16 },
  disabled: { opacity: 0.6 },
  resendText: { ...typography.label, color: '#367818' },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, textAlign: 'center', color: colors.textSecondary },
  successIcon: { width: 101, height: 102, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  successDisc: { position: 'absolute', width: 101, height: 101.5 },
  successMark: { width: 47, height: 32 },
});

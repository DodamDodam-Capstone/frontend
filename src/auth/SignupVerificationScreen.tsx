import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';

import { AppText } from '../components/AppText';
import { ErrorMessage } from '../components/ErrorMessage';
import { Logo } from '../components/Logo';
import { TextField } from '../components/TextField';
import { colors, fonts, typography } from '../theme/tokens';
import type { EmailVerificationFlow } from './emailVerification';
import { VerificationPanel, useVerificationClock } from './VerificationPanel';

type ScreenFlow = Pick<EmailVerificationFlow, 'getSnapshot' | 'subscribe' | 'setEmail' | 'openEmail' | 'issue' |
  'verify' | 'closeDialog' | 'finish' | 'syncTime'>;

const badges = [
  require('../../assets/images/signup/step-one.png'),
  require('../../assets/images/signup/step-two.png'),
  require('../../assets/images/signup/step-three.png'),
];
const activeTwo = require('../../assets/images/signup/step-two-active.png');
const stages = [
  ['이메일 인증', '이메일 확인'], ['비밀번호 설정', '계정 만들기'], ['가입 완료', '별도 로그인'],
];
// 비밀번호 입력을 여는 SCRUM-130 전까지 가입 폼의 비활성 상태를 표시한다.
function InactivePasswordField({ label, placeholder }: { label: string; placeholder: string }) {
  return <View style={[styles.fieldGroup, styles.unavailable]}>
    <AppText style={styles.label}>{label}</AppText>
    <TextInput accessibilityLabel={label} accessibilityState={{ disabled: true }} editable={false}
      secureTextEntry placeholder={placeholder} placeholderTextColor={colors.textPlaceholder} style={styles.inactiveInput} />
  </View>;
}

function SignupProgress({ verified, width }: { verified: boolean; width: number }) {
  const scale = width / 215;
  return (
    <View style={[styles.rail, { width }]} accessible accessibilityLabel={verified
      ? '가입 2단계, 비밀번호 설정' : '가입 1단계, 이메일 인증'}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ alignItems: 'center', paddingTop: 26 * scale }}>
        <View>
          <Image source={require('../../assets/images/signup/logo-heart.png')} accessible={false}
            style={{ position: 'absolute', left: 45 * scale, top: 29 * scale, width: 35.6 * scale, height: 25.25 * scale }} />
          <Logo width={120 * scale} />
        </View>
        <Image source={require('../../assets/images/signup/divider.png')} accessible={false}
          style={{ width: 170 * scale, height: 1, marginVertical: 30 * scale }} />
      </View>
      <View style={{ paddingHorizontal: 32 * scale }}>
        <Image accessible={false} source={require('../../assets/images/signup/connector.png')}
          style={{ position: 'absolute', left: 50 * scale, top: 16 * scale, width: 2 * scale, height: 190 * scale }} />
        {stages.map(([title, detail], i) => (
          <View key={title} style={[styles.stage, { minHeight: 98 * scale }]}>
            <Image accessible={false} source={verified && i === 1 ? activeTwo : badges[i]}
              style={{ width: 36 * scale, height: 36 * scale }} />
            <View style={styles.stageCopy}>
              <AppText style={styles.stageTitle}>{title}</AppText>
              <AppText style={styles.detail}>{detail}</AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
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
  const previousPanel = useRef(false);
  const now = useVerificationClock(flow.syncTime, state.expiresAt, state.tokenExpiresAt, state.issueRetryAt, state.verifyRetryAt);
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
    if (previousPanel.current && !panel) {
      if (!verified) trigger.current?.focus();
      const returnTarget = verified ? heading.current : trigger.current;
      if (returnTarget) AccessibilityInfo.sendAccessibilityEvent(returnTarget, 'focus');
    }
    previousPanel.current = panel;
  }, [panel, verified]);

  return (
    <View style={styles.root}>
      <View style={styles.layout} accessibilityElementsHidden={panel}
        importantForAccessibility={panel ? 'no-hide-descendants' : 'auto'} pointerEvents={panel ? 'none' : 'auto'}>
        <SignupProgress verified={verified} width={railWidth} />
        <KeyboardAvoidingView style={styles.formColumn} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScroll}>
            <View style={styles.form}>
              <View style={styles.heading}>
                <AppText ref={heading} style={styles.title} accessibilityRole="header">보호자 계정 만들기</AppText>
                <AppText style={styles.subheading}>{verified ? '인증을 마쳤어요. 비밀번호를 설정해 주세요.'
                  : '이메일을 인증하고 비밀번호를 설정해 주세요.'}</AppText>
              </View>
              <TextField label="이메일" value={state.email} onChangeText={flow.setEmail}
                placeholder="이메일을 입력해주세요." keyboardType="email-address" autoComplete="email"
                autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
              <View style={styles.fieldGroup}>
                <AppText style={styles.label}>이메일 인증  *필수</AppText>
                <View style={styles.verificationRow}>
                  <View style={styles.statusBox}><AppText style={styles.statusText}>{verified
                    ? '이메일 인증이 완료되었어요.' : '이메일 인증을 완료해 주세요.'}</AppText></View>
                  <Pressable ref={trigger} accessibilityRole="button" disabled={verified}
                    accessibilityState={{ disabled: verified }}
                    style={[styles.verifyTrigger, verified && styles.verifiedTrigger]}
                    onPress={() => { Keyboard.dismiss(); flow.openEmail(); }}>
                    <AppText style={[styles.triggerText, verified && styles.verifiedText]}>{verified ? '인증 완료' : '인증하기'}</AppText>
                  </Pressable>
                </View>
                {!panel && state.message && <ErrorMessage message={state.message} />}
              </View>
              <InactivePasswordField label="비밀번호" placeholder="15~128자로 입력해 주세요." />
              <InactivePasswordField label="비밀번호 확인" placeholder="같은 비밀번호를 다시 입력해 주세요." />
            </View>
            <View style={styles.footer}>
              <View style={styles.footerActions}>
                <Pressable accessibilityRole="button" onPress={close} style={styles.backAction}>
                  <AppText style={styles.backText}>뒤로 가기</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" disabled accessibilityState={{ disabled: true }} style={styles.createAction}>
                  <AppText style={styles.createText}>계정 만들기</AppText>
                </Pressable>
              </View>
            </View>
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
  rail: { backgroundColor: '#E5F3B1', experimental_backgroundImage: [{ type: 'linear-gradient', direction: 'to bottom',
    colorStops: [{ color: '#F1FAD2', positions: ['0%'] }, { color: '#D9EC8D', positions: ['100%'] }] }] },
  stage: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stageCopy: { flex: 1, gap: 2 },
  stageTitle: { ...typography.label, color: colors.textPrimary },
  detail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
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
  unavailable: { opacity: 0.55 },
  inactiveInput: { ...typography.input, minHeight: 56, paddingVertical: 12, paddingHorizontal: 18,
    borderWidth: 2, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surfaceWhite },
  footer: { borderTopWidth: 1, borderColor: colors.border, marginTop: 32, paddingTop: 22 },
  footerActions: { alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', width: '87%', maxWidth: 802 },
  backAction: { width: '22.5%', minWidth: 110, minHeight: 60, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  createAction: { width: '22.5%', minWidth: 110, minHeight: 60, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, backgroundColor: '#BBB1A7' },
  backText: { ...typography.body, color: colors.textSignUp },
  createText: { ...typography.body, color: colors.surfaceWhite },
});

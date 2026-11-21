import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, type Text, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { colors, fonts, typography } from '../theme/tokens';
import { getMicrophonePermission, requestMicrophonePermission, type MicrophonePermission } from './microphonePermission';

const messages = {
  denied: '마이크를 허용하지 않았어요. 나중에 설정해도 괜찮아요.',
  blocked: '마이크 권한이 꺼져 있어요. 기기의 앱 설정에서 켤 수 있어요.',
  error: '마이크 권한을 확인할 수 없어요. 다시 시도해 주세요.',
};

type Phase = 'guide' | 'checking' | 'rationale' | 'dismissing' | 'requesting' | 'done' | keyof typeof messages;

export function MicrophonePermissionActions({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>('guide');
  const current = useRef<Phase>('guide');
  const mounted = useRef(false);
  const complete = useRef(onComplete);
  const title = useRef<Text>(null);
  const ios = Platform.OS === 'ios';

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => { complete.current = onComplete; }, [onComplete]);

  function move(next: Phase) {
    current.current = next;
    setPhase(next);
  }

  const finish = useCallback(() => {
    move('done');
    complete.current();
  }, []);

  useEffect(() => {
    if (phase !== 'blocked' && phase !== 'denied') return;

    let wasInBackground = AppState.currentState === 'background';
    let backgroundVisit = 0;
    const subscription = AppState.addEventListener('change', async state => {
      if (state === 'background') {
        wasInBackground = true;
        backgroundVisit++;
        return;
      }
      if (state !== 'active' || !wasInBackground || current.current !== phase) return;
      wasInBackground = false;

      // 설정을 다시 열거나 안내를 떠났다면 이전 조회 결과를 버린다.
      const visit = backgroundVisit;
      const permission = await getMicrophonePermission().catch(() => 'error' as const);
      if (visit !== backgroundVisit || !mounted.current || current.current !== phase) return;
      if (permission === 'granted') finish();
      else move(permission === 'requestable' ? 'denied' : permission);
    });
    return () => {
      backgroundVisit++;
      subscription.remove();
    };
  }, [phase, finish]);

  async function resolvePermission(action: 'check' | 'request') {
    if (!mounted.current) return;
    const checking = action === 'check';
    if (checking && current.current !== 'guide' && current.current !== 'denied' && current.current !== 'error') return;
    if (!checking && current.current !== 'dismissing') return;

    const pending = checking ? 'checking' : 'requesting';
    move(pending);
    let result: MicrophonePermission;
    try {
      result = await (checking ? getMicrophonePermission() : requestMicrophonePermission());
    } catch {
      if (mounted.current && current.current === pending) move('error');
      return;
    }
    if (!mounted.current || current.current !== pending) return;
    if (result === 'granted') finish();
    else if (result === 'blocked') move('blocked');
    else move(checking ? 'rationale' : 'denied');
  }

  function acceptRationale() {
    if (!mounted.current || current.current !== 'rationale') return;
    move('dismissing');
    // iOS는 Modal의 네이티브 dismiss 완료 후에만 시스템 권한 창을 표시할 수 있다.
    // Android Modal에는 onDismiss가 없어 닫힘을 반영한 다음 프레임에 요청한다.
    if (!ios) requestAnimationFrame(() => { void resolvePermission('request'); });
  }

  function cancelRationale() {
    if (mounted.current && current.current === 'rationale' && !ios) move('guide');
  }

  function skip() {
    if (mounted.current && (current.current === 'guide' || current.current in messages)) finish();
  }

  const feedback = phase === 'denied' || phase === 'blocked' || phase === 'error' ? messages[phase] : undefined;
  const waiting = phase === 'checking' || phase === 'dismissing' || phase === 'requesting';
  const busyLabel = phase === 'checking' ? '권한 확인 중' : '기기의 권한 선택을 기다리고 있어요';

  return <>
    <View style={styles.guideActions}>
      {feedback && <ErrorMessage message={feedback} />}
      {waiting && <LoadingIndicator label={busyLabel} />}
      {(phase === 'guide' || feedback) && (
        <Pressable accessibilityRole="button" accessibilityLabel="다음에 할래요" style={styles.skip} onPress={skip}>
          <AppText style={styles.skipLabel}>다음에 할래요</AppText>
        </Pressable>
      )}
      {(phase === 'guide' || phase === 'denied' || phase === 'error') && (
        <Button variant="onboarding" label={feedback ? '다시 시도' : '권한 설정 시작하기'} onPress={() => { void resolvePermission('check'); }} />
      )}
    </View>
    <Modal visible={phase === 'rationale'} animationType="none" transparent={false}
      supportedOrientations={['landscape-left', 'landscape-right']}
      onRequestClose={cancelRationale}
      onDismiss={() => { if (ios) void resolvePermission('request'); }}
      onShow={() => {
        if (current.current === 'rationale' && title.current) AccessibilityInfo.sendAccessibilityEvent(title.current, 'focus');
      }}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal importantForAccessibility="yes" style={styles.card}>
          <ScrollView contentContainerStyle={styles.cardContent} bounces={false}>
            <Image source={require('../../assets/images/onboarding/native/microphone-dialog.png')}
              accessible={false} resizeMode="contain" style={styles.microphone} />
            <View style={styles.copy}>
              <AppText ref={title} accessibilityRole="header" style={styles.title}>마이크 권한</AppText>
              <AppText style={styles.description}>{'캐릭터에게 말을 걸 때 마이크를 사용해요.\n대화 중에만 마이크가 켜져요.'}</AppText>
              {!ios && <AppText style={styles.description}>다음 화면에서 기기의 마이크 권한을 선택해 주세요.</AppText>}
            </View>
            <View style={styles.options}>
              {!ios && <>
                <Pressable accessibilityRole="button" accessibilityLabel="취소" style={styles.option} onPress={cancelRationale}>
                  <AppText style={styles.optionLabel}>취소</AppText>
                </Pressable>
                <View style={styles.divider} />
              </>}
              <Pressable accessibilityRole="button" accessibilityLabel={ios ? '계속' : '허용'} style={styles.option} onPress={acceptRationale}>
                <AppText style={styles.optionLabel}>{ios ? '계속' : '허용'}</AppText>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  guideActions: { gap: 8 },
  skip: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipLabel: { ...typography.label, color: colors.textSecondary, textDecorationLine: 'underline' },
  backdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  card: { width: '100%', maxWidth: 326.5, maxHeight: '100%', flexShrink: 1, backgroundColor: '#FCFCFF', borderRadius: 28, overflow: 'hidden' },
  cardContent: { padding: 20, gap: 20, alignItems: 'center' },
  microphone: { width: 50, height: 48 },
  copy: { width: '100%', maxWidth: 273, gap: 8 },
  title: { paddingVertical: 4, fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 28, color: '#000000', textAlign: 'center' },
  description: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19.6, letterSpacing: -0.14, color: '#000000', textAlign: 'center' },
  options: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  option: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  optionLabel: { fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 28, color: '#000000', textAlign: 'center' },
  divider: { width: 2, height: 32, borderRadius: 2, backgroundColor: '#EAEAEA' },
});

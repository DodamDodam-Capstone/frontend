import { AccessibilityInfo, Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEffect, useRef } from 'react';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { colors, fonts, typography } from '../theme/tokens';

export function SignupCompleteScreen({ onLogin }: { onLogin: () => void }) {
  const { height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.7, height / 800));
  const heading = useRef<Text>(null);

  useEffect(() => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 88 * scale }]}>
      <View style={styles.badge}><AppText style={styles.badgeText}>가입 완료!</AppText></View>
      <AppText ref={heading} accessibilityRole="header" style={styles.title}>보호자 계정이 만들어졌어요!</AppText>
      <AppText style={styles.description}>가입한 이메일과 비밀번호로 로그인해 주세요.</AppText>
      <View style={[styles.illustration, {
        marginTop: 68 * scale, width: 182 * scale, height: 182 * scale, paddingTop: 22 * scale,
      }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image accessible={false} source={require('../../assets/images/signup/signup-complete-character.png')}
          resizeMode="stretch" style={[styles.character, { width: 99 * scale, height: 128 * scale }]} />
      </View>
      <AppText style={[styles.hint, { marginTop: 36 * scale }]}>로그인 후 아이 프로필을 등록할 수 있어요.</AppText>
      <View style={styles.action}><Button label="로그인하기" variant="onboarding" onPress={onLogin} /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 },
  badge: { minHeight: 44, borderRadius: 55, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: colors.primary },
  badgeText: { ...typography.input, color: colors.surfaceWhite, fontFamily: fonts.bold, textAlign: 'center' },
  title: { ...typography.title, marginTop: 16, color: colors.textPrimary, textAlign: 'center' },
  description: { ...typography.input, marginTop: 8, color: '#000000', textAlign: 'center' },
  illustration: {
    alignItems: 'center', borderRadius: 28, backgroundColor: '#DAFF96',
    experimental_backgroundImage: [{ type: 'linear-gradient', direction: 'to bottom',
      colorStops: [{ color: '#DAFF96', positions: ['0%'] }, { color: colors.surfaceWhite, positions: ['100%'] }] }],
  },
  character: { transform: [{ scaleX: -1 }] },
  hint: { ...typography.input, color: colors.textSecondary, textAlign: 'center' },
  action: { width: '100%', maxWidth: 510, marginTop: 22 },
});

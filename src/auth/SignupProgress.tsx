import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Logo } from '../components/Logo';
import { colors, fonts, typography } from '../theme/tokens';

const badges = [
  require('../../assets/images/signup/step-one.png'),
  require('../../assets/images/signup/step-two.png'),
  require('../../assets/images/signup/step-three.png'),
];
const activeTwo = require('../../assets/images/signup/step-two-active.png');
const signupStages = [
  ['이메일 인증', '이메일 확인'], ['비밀번호 설정', '계정 만들기'], ['가입 완료', '별도 로그인'],
];
const childStages = [
  ['프로필 입력', '아이 정보·도담이 선택'],
  ['등록 확인', '입력한 내용 확인 후 등록'],
];
const childStepSpacing = 68;

function ProgressRail({ width, label, connectorHeight, endPadding = 32, children }: {
  width: number; label: string; connectorHeight?: number; endPadding?: number; children: ReactNode;
}) {
  const scale = width / 215;
  return (
    <View style={[styles.rail, { width }]} accessible accessibilityLabel={label}>
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
      <View style={{ paddingLeft: 32 * scale, paddingRight: endPadding * scale }}>
        {connectorHeight !== undefined && (
          <Image accessible={false} source={require('../../assets/images/signup/connector.png')}
            style={{ position: 'absolute', left: 50 * scale, top: 16 * scale, width: 2 * scale, height: connectorHeight * scale }} />
        )}
        {children}
      </View>
    </View>
  );
}

export function SignupProgress({ step, width }: { step: 'email' | 'password'; width: number }) {
  const scale = width / 215;
  const label = step === 'email' ? '가입 1단계, 이메일 인증' : '가입 2단계, 비밀번호 설정';
  const images = step === 'password' ? [badges[0], activeTwo, badges[2]] : badges;
  return (
    <ProgressRail width={width} label={label} connectorHeight={190}>
      {signupStages.map(([title, detail], i) => (
        <View key={title} style={[styles.stage, { minHeight: 98 * scale }]}>
          <Image accessible={false} source={images[i]} style={{ width: 36 * scale, height: 36 * scale }} />
          <View style={styles.stageCopy}>
            <AppText style={styles.stageTitle}>{title}</AppText>
            <AppText style={styles.detail}>{detail}</AppText>
          </View>
        </View>
      ))}
    </ProgressRail>
  );
}

export function ChildRegistrationProgress({ step, width }: { step: 'input' | 'confirmation'; width: number }) {
  const scale = width / 215;
  const current = step === 'input' ? 0 : 1;
  const images = [badges[0], current === 1 ? activeTwo : badges[1]];
  const [currentTitle, currentDetail] = childStages[current];
  const label = `아이 등록 2단계 중 ${current + 1}단계, ${currentTitle}. ${currentDetail}`;
  return (
    <ProgressRail width={width} label={label} endPadding={6}>
      {childStages.map(([title, detail], index) => (
        <View key={title} style={[styles.stage, { minHeight: childStepSpacing * scale, paddingBottom: index === 0 ? 12 * scale : 0 }]}>
          {index === 0 && <View style={[styles.childConnector, { left: 17 * scale, top: 36 * scale, width: 2 * scale }]} />}
          <Image accessible={false} source={images[index]}
            style={{ width: 36 * scale, height: 36 * scale, opacity: index === 0 && current === 1 ? 0.5 : 1 }} />
          <View style={styles.stageCopy}>
            <AppText style={[styles.stageTitle, index !== current && styles.inactiveTitle]}>{title}</AppText>
            <AppText style={[styles.detail, styles.childDetail]} lineBreakStrategyIOS="hangul-word">{detail}</AppText>
          </View>
        </View>
      ))}
    </ProgressRail>
  );
}

const styles = StyleSheet.create({
  rail: { backgroundColor: '#E5F3B1', experimental_backgroundImage: [{ type: 'linear-gradient', direction: 'to bottom',
    colorStops: [{ color: '#F1FAD2', positions: ['0%'] }, { color: '#D9EC8D', positions: ['100%'] }] }] },
  stage: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stageCopy: { flex: 1, gap: 2 },
  childConnector: { position: 'absolute', bottom: 0, backgroundColor: '#BFCF88' },
  stageTitle: { ...typography.label, color: colors.textPrimary },
  inactiveTitle: { color: colors.textSecondary, fontFamily: fonts.bold },
  detail: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  childDetail: { fontSize: 12, lineHeight: 17 },
});

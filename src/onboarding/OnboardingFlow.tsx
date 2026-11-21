import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { colors, typography } from '../theme/tokens';
import { MicrophonePermissionActions } from './MicrophonePermissionActions';
import { OnboardingIllustration } from './OnboardingIllustration';
import { OnboardingScene } from './OnboardingScene';
import { getOnboardingLayout } from './onboardingLayout';

const slides = [
  { title: '아이의 하루를 들어주는\n마음 친구, 도담이', body: '아이는 캐릭터와 이야기하며 하루를 표현하고,\n자신의 감정과 생각을 자연스럽게 알아가요.' },
  { title: '다양한 놀이를 즐기고\n새로운 것을 배우며 성장해요', body: '캐릭터와 다양한 활동을 상호작용하며\n아이만의 즐거운 하루를 만들어가요.' },
  { title: '오늘 하루 아이가 어땠는지,\n아이의 마음을 알려드려요', body: '대화를 바탕으로 감정 변화와 관심사를 분석하고,\n오늘 어떻게 해주면 좋을지 알려드려요.' },
] as const;

const pages = [0, 1, 2] as const;
type Page = (typeof pages)[number];
const guide = { title: '도담도담 사용을 위해\n권한을 확인해주세요', body: '아이가 앱을 사용할 때 필요한 기능들이에요' };

type PanelProps = {
  width: number;
  height: number;
  page: Page;
  permission: boolean;
  onSelect: (page: Page) => void;
  onContinue: () => void;
};

function Panel({ width, height, page, permission, onSelect, onContinue }: PanelProps) {
  const { fontScale } = useWindowDimensions();
  const largeControls = fontScale > 1.3;
  const { scale, left, top } = getOnboardingLayout(width, height);
  const panelWidth = 590 * scale;
  const padding = 40 * scale;
  const textScale = Math.max(0.8, Math.min(1, scale));
  const { title, body } = permission ? guide : slides[page];

  return (
    <View style={[styles.panel, {
      width: panelWidth, height: 752 * scale, left: left + 658 * scale, top: top + 24 * scale,
      borderRadius: 80 * scale,
    }]}>
      <ScrollView nestedScrollEnabled contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.panelContent, {
          paddingHorizontal: padding, paddingTop: 56 * scale, paddingBottom: 44 * scale,
        }]}>
        <AppText accessibilityRole="header" accessibilityLabel={title.replace('\n', ' ')}
          style={[styles.heading, { fontSize: 32 * textScale, lineHeight: 44.8 * textScale }]}>{title}</AppText>
        <AppText style={[styles.body, { marginTop: 14 * scale, fontSize: 20 * textScale, lineHeight: 28 * textScale }]}>{body}</AppText>
        {permission ? (
          <View style={[styles.micCard, { marginTop: 38 * scale }]}>
            <View style={styles.micIcon}>
              <Image accessible={false} source={require('../../assets/images/onboarding/native/microphone-guide.png')}
                resizeMode="contain" style={styles.micImage} />
            </View>
            <View style={styles.micText}>
              <AppText style={styles.micTitle}>마이크 권한</AppText>
              <AppText style={styles.micBody}>캐릭터와 음성으로 대화할 때 사용해요</AppText>
            </View>
          </View>
        ) : (
          <View style={[styles.illustration, { paddingTop: 29 * scale }]}>
            <OnboardingIllustration page={page} width={panelWidth - padding * 2} />
          </View>
        )}
        {permission ? (
          <View style={styles.guideAction}>
            <MicrophonePermissionActions onComplete={onContinue} />
          </View>
        ) : <>
          <View style={[styles.pageControls, !largeControls && styles.compactControls]}>
            {pages.map(index => (
              <Pressable key={index} accessibilityRole="button"
                accessibilityLabel={`온보딩 ${index + 1}장, 전체 3장`}
                accessibilityState={{ selected: index === page }}
                style={[styles.dotTarget, largeControls ? styles.largeDotTarget :
                  [index === 0 && styles.firstDotTarget, index === 2 && styles.lastDotTarget]]}
                onPress={() => onSelect(index)}>
                <View style={[styles.dot, index === page && styles.selectedDot]} />
              </Pressable>
            ))}
          </View>
          <Button variant="onboarding" label={page === 2 ? '시작하기' : '다음'}
            onPress={page === 2 ? onContinue : () => onSelect(page === 0 ? 1 : 2)} />
        </>}
      </ScrollView>
    </View>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const window = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number }>();
  const { width, height } = layout ?? window;
  const [page, setPage] = useState<Page>(0);
  const [permission, setPermission] = useState(false);
  const completed = useRef(false);
  const pager = useRef<ScrollView>(null);
  const current = useRef<Page>(0);

  function selectPage(next: Page) {
    current.current = next;
    setPage(next);
    pager.current?.scrollTo({ x: next * width, animated: false });
  }

  function complete() {
    if (completed.current) return;
    completed.current = true;
    onComplete();
  }

  useEffect(() => {
    pager.current?.scrollTo({ x: current.current * width, animated: false });
  }, [width]);

  return (
    <View style={styles.screen} onLayout={({ nativeEvent }) => {
      const { width: w, height: h } = nativeEvent.layout;
      if (w > 0 && h > 0 && (w !== width || h !== height || !layout)) setLayout({ width: w, height: h });
    }}>
      <StatusBar hidden />
      {permission ? <>
        <OnboardingScene width={width} height={height} permission />
        <Panel width={width} height={height} page={page} permission onSelect={selectPage} onContinue={complete} />
      </> : (
        <ScrollView horizontal pagingEnabled ref={pager} testID="onboarding-pages"
          showsHorizontalScrollIndicator={false} bounces={false} directionalLockEnabled
          contentInsetAdjustmentBehavior="never" scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => {
            const next = pages[Math.round(nativeEvent.contentOffset.x / width)];
            if (next !== undefined && next !== current.current) {
              current.current = next;
              setPage(next);
            }
          }}>
          {pages.map(index => (
            <View key={index} style={{ width, height }} aria-hidden={index !== page}
              importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
              <OnboardingScene width={width} height={height} permission={false} />
              <Panel width={width} height={height} page={index} permission={false}
                onSelect={selectPage} onContinue={() => setPermission(true)} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  panel: { position: 'absolute', backgroundColor: colors.surface, overflow: 'hidden' },
  panelContent: { flexGrow: 1 },
  heading: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  illustration: { flexGrow: 1 },
  pageControls: { flexDirection: 'row', alignSelf: 'center' },
  compactControls: { marginTop: -3 },
  // 가운데 표시가 양옆의 여백 8dp를 받고, 양 끝은 바깥 방향으로 터치 영역을 넓힌다.
  dotTarget: { minHeight: 48, paddingBottom: 8, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  largeDotTarget: { minWidth: 44 },
  firstDotTarget: { paddingLeft: 36, paddingRight: 0 },
  lastDotTarget: { paddingLeft: 0, paddingRight: 36 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#CDBBA7' },
  selectedDot: { width: 28, backgroundColor: colors.primary },
  micCard: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 16, borderRadius: 24,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  micIcon: { borderRadius: 16, backgroundColor: '#F1F5D9', padding: 12 },
  micImage: { width: 50, height: 48 },
  micText: { flex: 1, gap: 6 },
  micTitle: { ...typography.label, fontSize: 20, lineHeight: 28, color: colors.textPrimary },
  micBody: { ...typography.input, color: colors.textSecondary },
  guideAction: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 24 },
});

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Image, ScrollView, StyleSheet, View, useAnimatedValue, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { colors, typography } from '../theme/tokens';
import { MicrophonePermissionActions } from './MicrophonePermissionActions';
import { OnboardingIllustration } from './OnboardingIllustration';
import { OnboardingPageIndicator } from './OnboardingPageIndicator';
import { useSceneSwipe } from './useSceneSwipe';
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

function IntroText({ copy, scale }: { copy: typeof guide; scale: number }) {
  const textScale = Math.max(0.8, Math.min(1, scale));
  return <>
    <AppText accessibilityRole="header" accessibilityLabel={copy.title.replace('\n', ' ')}
      style={[styles.heading, { fontSize: 32 * textScale, lineHeight: 44.8 * textScale }]}>{copy.title}</AppText>
    <AppText style={[styles.body, { marginTop: 14 * scale, fontSize: 20 * textScale, lineHeight: 28 * textScale }]}>
      {copy.body}
    </AppText>
  </>;
}

function PermissionGuide({ scale, onComplete }: { scale: number; onComplete: () => void }) {
  return (
    <ScrollView nestedScrollEnabled contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.panelContent, {
        paddingHorizontal: 40 * scale, paddingTop: 56 * scale, paddingBottom: 44 * scale,
      }]}>
      <IntroText copy={guide} scale={scale} />
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
      <View style={styles.guideAction}><MicrophonePermissionActions onComplete={onComplete} /></View>
    </ScrollView>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const window = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number }>();
  const { width, height } = layout ?? window;
  const { scale, left, top } = getOnboardingLayout(width, height);
  const panelWidth = 590 * scale;
  const padding = 40 * scale;
  const [page, setPage] = useState<Page>(0);
  const [permission, setPermission] = useState(false);
  const completed = useRef(false);
  const pager = useRef<ScrollView>(null);
  const offset = useRef(0);
  const settled = useRef<Page>(0);
  const target = useRef<Page | null>(null);
  const queued = useRef<Page | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const scrollX = useAnimatedValue(0);
  const progress = useMemo(() => Animated.divide<number>(scrollX, Math.max(1, panelWidth)), [scrollX, panelWidth]);

  useEffect(() => {
    let acceptInitial = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      acceptInitial = false;
      setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (acceptInitial) setReduceMotion(enabled);
    }).catch(() => {});
    return () => { acceptInitial = false; subscription.remove(); };
  }, []);

  const settle = useCallback((next: Page) => {
    target.current = null;
    if (next !== settled.current) {
      settled.current = next;
      setPage(next);
    }
  }, []);

  const selectPage = useCallback((next: Page) => {
    // 같은 좌표로 보낸 scrollTo는 Android의 기존 애니메이션을 취소하지 않는다.
    // 한 번에 하나만 실행하고 연속으로 누르면 마지막 목적지만 남긴다.
    if (target.current !== null) {
      queued.current = target.current === next ? null : next;
      return;
    }
    const x = next * panelWidth;
    target.current = next;
    pager.current?.scrollTo({ x, animated: !reduceMotion });
    if (reduceMotion || Math.abs(offset.current - x) < 1) {
      offset.current = x;
      scrollX.setValue(x);
      settle(next);
    }
  }, [panelWidth, reduceMotion, scrollX, settle]);

  // 화면 크기가 바뀌면 이전 폭의 픽셀 오프셋 대신 선택한 장을 복원한다.
  useLayoutEffect(() => {
    const next = queued.current ?? target.current ?? settled.current;
    queued.current = null;
    offset.current = next * panelWidth;
    pager.current?.scrollTo({ x: offset.current, animated: false });
    scrollX.setValue(offset.current);
    settle(next);
  }, [panelWidth, scrollX, settle]);

  const observeOffset = useCallback((x: number) => {
    if (panelWidth <= 0) return;
    offset.current = x;
    const next = pages[Math.round(x / panelWidth)];
    // 1→3장 이동이 2장을 지날 때나 드래그를 되돌릴 때 중간 장을 확정하지 않는다.
    if (next === undefined || Math.abs(next * panelWidth - x) >= 1 ||
        (target.current !== null && target.current !== next)) return;
    const lastRequest = queued.current;
    queued.current = null;
    if (lastRequest !== null && lastRequest !== next) {
      target.current = null;
      selectPage(lastRequest);
    } else {
      settle(next);
    }
  }, [panelWidth, selectPage, settle]);

  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true }), [scrollX]);
  useEffect(() => {
    const subscription = scrollX.addListener(({ value }) => observeOffset(value));
    return () => scrollX.removeListener(subscription);
  }, [scrollX, observeOffset]);

  function finishScroll({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    if (Math.abs(nativeEvent.layoutMeasurement.width - panelWidth) <= 1) observeOffset(nativeEvent.contentOffset.x);
  }
  const sceneSwipe = useSceneSwipe({
    pageWidth: panelWidth, currentOffset: offset, onSnap: selectPage,
    canStart: () => target.current === null && Math.abs(offset.current - settled.current * panelWidth) < 1,
    onDragOffset: x => { target.current = null; pager.current?.scrollTo({ x, animated: false }); },
  });

  function advance() {
    if (target.current !== null) return;
    if (page === 2) {
      if (Math.abs(offset.current - 2 * panelWidth) < 1) setPermission(true);
    } else {
      selectPage(page === 0 ? 1 : 2);
    }
  }

  function complete() {
    if (!completed.current) {
      completed.current = true;
      onComplete();
    }
  }

  return (
    <View style={styles.screen} onLayout={({ nativeEvent }) => {
      const { width: w, height: h } = nativeEvent.layout;
      if (w > 0 && h > 0 && (w !== width || h !== height || !layout)) setLayout({ width: w, height: h });
    }}>
      <StatusBar hidden />
      <View style={StyleSheet.absoluteFill} {...(permission ? {} : sceneSwipe)}>
        <OnboardingScene width={width} height={height} permission={permission} reduceMotion={reduceMotion} />
      </View>
      <View style={[styles.panel, {
        width: panelWidth, height: 752 * scale, left: left + 658 * scale, top: top + 24 * scale,
        borderRadius: 80 * scale,
      }]}>
        {permission ? <PermissionGuide scale={scale} onComplete={complete} /> : <>
          <Animated.ScrollView key={panelWidth} ref={pager} horizontal pagingEnabled testID="onboarding-pages"
            style={styles.pager} showsHorizontalScrollIndicator={false} bounces={false} directionalLockEnabled
            contentInsetAdjustmentBehavior="never" scrollEventThrottle={16}
            onScrollBeginDrag={() => { target.current = null; queued.current = null; }}
            onScroll={onScroll} onMomentumScrollEnd={finishScroll}>
            {pages.map(index => (
              <View key={index} style={{ width: panelWidth }} aria-hidden={index !== page}
                importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
                <ScrollView nestedScrollEnabled directionalLockEnabled contentInsetAdjustmentBehavior="never"
                  contentContainerStyle={{ paddingHorizontal: padding, paddingTop: 56 * scale }}>
                  <IntroText copy={slides[index]} scale={scale} />
                  <View style={{ paddingTop: 29 * scale }}>
                    <OnboardingIllustration page={index} width={panelWidth - padding * 2} />
                  </View>
                </ScrollView>
              </View>
            ))}
          </Animated.ScrollView>
          <View style={{ paddingHorizontal: padding, paddingBottom: 44 * scale }}>
            <OnboardingPageIndicator progress={progress} page={page} onSelect={selectPage}
              largeControls={window.fontScale > 1.3} />
            <Button variant="onboarding" label={page === 2 ? '시작하기' : '다음'} onPress={advance} />
          </View>
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  panel: { position: 'absolute', backgroundColor: colors.surface, overflow: 'hidden' },
  panelContent: { flexGrow: 1 },
  heading: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  pager: { flex: 1 },
  micCard: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 16, borderRadius: 24,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  micIcon: { borderRadius: 16, backgroundColor: '#F1F5D9', padding: 12 },
  micImage: { width: 50, height: 48 },
  micText: { flex: 1, gap: 6 },
  micTitle: { ...typography.label, fontSize: 20, lineHeight: 28, color: colors.textPrimary },
  micBody: { ...typography.input, color: colors.textSecondary },
  guideAction: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 24 },
});

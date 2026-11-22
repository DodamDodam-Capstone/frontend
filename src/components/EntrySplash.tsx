import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useAnimatedValue, useWindowDimensions, View } from 'react-native';
import { AppText } from './AppText';
import { Logo } from './Logo';
import { colors, typography } from '../theme/tokens';

// P0 835:3764의 다섯 레이어를 하나의 2초 타임라인으로 구동한다.
const duration = 2000;
const ease = Easing.bezier(0.5, 0, 0.5, 1);

function scaleCurve(start: number, end: number, from: number, to: number) {
  // 네이티브 interpolate는 구간별 easing을 전달하지 않아 동일 곡선을 프레임 간격으로 표본화한다.
  const frames = Math.ceil((end - start) * 60 / 1000);
  return Array.from({ length: frames + 1 }, (_, i) => ({
    time: start + (end - start) * i / frames,
    value: from + (to - from) * ease(i / frames),
  }));
}

const scales = [
  [...scaleCurve(598, 999, 0, 1.2), ...scaleCurve(999, 1204.3, 1.2, 1).slice(1)],
  ...[204, 401, 598, 802].map(end => scaleCurve(0, end, 0, 1)),
].map(points => ({
  inputRange: points.map(point => point.time),
  outputRange: points.map(point => point.value),
  extrapolate: 'clamp' as const,
}));

export function EntrySplash({ onComplete }: { onComplete: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / 1280, height / 800);
  const elapsed = useAnimatedValue(0);
  const complete = useRef(onComplete);
  useLayoutEffect(() => { complete.current = onComplete; }, [onComplete]);

  const motion = useMemo(() => ({
    scales: scales.map(config => elapsed.interpolate(config)),
    // 정적 로고의 최종 top은 205. 모션의 시작 top은 333이다.
    symbolY: elapsed.interpolate({
      inputRange: [598, 599, 999], outputRange: [128 * scale, 39 * scale, 0], extrapolate: 'clamp',
    }),
  }), [elapsed, scale]);

  const [imagesReady, setImagesReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean>();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let current = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      changed = true;
      setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (current && !changed) setReduceMotion(enabled);
    }, () => { if (current && !changed) setReduceMotion(true); });
    return () => { current = false; subscription.remove(); };
  }, []);

  // 이미지 네이티브 로드 전에 글자 모션을 시작하면 느린 디코딩에서 첫 키프레임들이 사라진다.
  const phase = fallback ? 'static'
    : !imagesReady || reduceMotion === undefined ? 'preparing'
    : reduceMotion ? 'static' : 'playing';
  useEffect(() => {
    if (phase === 'preparing') {
      const deadline = setTimeout(() => setFallback(true), duration);
      return () => clearTimeout(deadline);
    }
    if (phase === 'static') {
      const frame = requestAnimationFrame(() => complete.current());
      return () => cancelAnimationFrame(frame);
    }

    let active = true;
    const deadline = setTimeout(() => { if (active) setFallback(true); }, duration);
    const animation = Animated.timing(elapsed, {
      toValue: duration, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    });
    elapsed.setValue(0);
    animation.start(({ finished }) => {
      if (!active) return;
      active = false;
      clearTimeout(deadline);
      if (finished) complete.current();
      else setFallback(true);
    });
    return () => {
      active = false;
      clearTimeout(deadline);
      animation.stop();
    };
  }, [elapsed, phase]);

  return (
    <View style={[styles.screen, { paddingTop: (height - 800 * scale) / 2 + 205 * scale }]}>
      <StatusBar hidden />
      <Logo width={332 * scale} accessibilityRole="header" motion={phase === 'static' || reduceMotion ? undefined : motion}
        onReady={() => setImagesReady(true)} onImageError={() => setFallback(true)} />
      <AppText style={[styles.tagline, {
        marginTop: 23 * scale, fontSize: typography.tagline.fontSize * scale,
        lineHeight: typography.tagline.lineHeight * scale, letterSpacing: typography.tagline.letterSpacing * scale,
      }]}>도담도담 나눈 대화 속에서 자라나는 아이의 마음</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, alignItems: 'center', backgroundColor: '#FFF6E6',
    experimental_backgroundImage: [{
      type: 'radial-gradient', shape: 'ellipse',
      size: { x: '105.836%', y: '100%' }, position: { left: '50%', top: 0 },
      colorStops: [{ color: '#FFF6E6', positions: ['0%'] }, { color: '#F0F9CB', positions: ['85.096%'] }],
    }],
  },
  tagline: { ...typography.tagline, color: colors.textSecondary, textAlign: 'center', marginHorizontal: 16 },
});

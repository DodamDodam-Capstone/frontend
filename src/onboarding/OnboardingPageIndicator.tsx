import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';

const pages = [0, 1, 2] as const;
type Page = (typeof pages)[number];

type Props = {
  progress: Animated.AnimatedInterpolation<number>;
  page: Page;
  onSelect: (page: Page) => void;
  largeControls: boolean;
};

// P0 표시 폭은 60이다. 28×8 선택 표시와 8×8 점 사이에 8씩 비운 각 장의 중심 좌표다.
const centersByPage = [[14, 40, 56], [4, 30, 56], [4, 20, 46]];

export function OnboardingPageIndicator({ progress, page, onSelect, largeControls }: Props) {
  const motion = useMemo(() => {
    const selectedCenter = (index: Page) => largeControls ? 22 + 44 * index : centersByPage[index][index];
    const atPages = (positions: number[]) => progress.interpolate({
      inputRange: [0, 1, 2], outputRange: positions, extrapolate: 'clamp',
    });
    const halfway = (rest: number, middle: number) => progress.interpolate({
      inputRange: [0, 0.5, 1, 1.5, 2], outputRange: [rest, middle, rest, middle, rest], extrapolate: 'clamp',
    });
    // 중앙 직사각형만 늘리고 원형 양 끝을 이동해 중간 프레임에서도 반지름 4를 유지한다.
    const extension = largeControls ? 11 : 4;
    return {
      dots: pages.map(index => largeControls ? selectedCenter(index) :
        atPages(centersByPage.map(row => row[index]))),
      active: atPages(pages.map(selectedCenter)),
      leftEnd: halfway(0, -extension),
      rightEnd: halfway(0, extension),
      bridge: halfway(1, 1 + extension / 10),
    };
  }, [progress, largeControls]);

  return (
    <View style={[styles.controls, !largeControls && styles.compactControls]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.marks, { left: largeControls ? 0 : 36, width: largeControls ? 132 : 60 }]}>
        {pages.map(index => (
          <Animated.View key={index} style={[styles.dot, { transform: [{ translateX: motion.dots[index] }] }]} />
        ))}
        <Animated.View testID="onboarding-active-mark" style={[styles.activeMark, { transform: [{ translateX: motion.active }] }]}>
          <Animated.View style={[styles.cap, { left: 0, transform: [{ translateX: motion.leftEnd }] }]} />
          <Animated.View testID="onboarding-mark-bridge" style={[styles.bridge, { transform: [{ scaleX: motion.bridge }] }]} />
          <Animated.View style={[styles.cap, { right: 0, transform: [{ translateX: motion.rightEnd }] }]} />
        </Animated.View>
      </View>
      {pages.map(index => {
        const markWidth = index === page ? 28 : 8;
        const padding = index === 1 ? 16 : 36;
        return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`온보딩 ${index + 1}장, 전체 3장`}
          accessibilityState={{ selected: index === page }}
          style={[styles.target, largeControls ? styles.largeTarget : { width: markWidth + padding }]}
          onPress={() => onSelect(index)} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignSelf: 'center' },
  compactControls: { marginTop: -3 },
  target: { minHeight: 48 },
  largeTarget: { minWidth: 44 },
  marks: { position: 'absolute', top: 16, height: 8 },
  dot: { position: 'absolute', left: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#CDBBA7' },
  activeMark: { position: 'absolute', left: -14, width: 28, height: 8 },
  cap: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  bridge: { position: 'absolute', left: 4, width: 20, height: 8, backgroundColor: colors.primary },
});

import { useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

type LogoProps = {
  width?: number;
  accessibilityRole?: 'image' | 'header';
  onReady?: () => void;
  onImageError?: () => void;
  motion?: {
    scales: readonly Animated.AnimatedInterpolation<number>[];
    symbolY: Animated.AnimatedInterpolation<number>;
  };
};

const original = require('../../assets/images/logo/source-symbol-wordmark.png');

// P0 835:3764의 모션 완료 상태. 원본 캔버스 (475,205)에서 시작하는332×274 영역.
// PNG를 수정하지 않고 Figma의566×424.5 이미지 좌표계에서 각 요소를 잘라 표시한다.
// 글자2·4의 Figma 이미지/레이어 반전은 서로 상쇄된다. 음수 width를 RN에 옮기지 않는다.
const parts = [
  { node: '835:3770', x: 58, y: 0, width: 214, height: 182, cropX: 172, cropY: 64.25, source: original },
  { node: '835:3771', x: 0, y: 174, width: 80, height: 100, cropX: 121, cropY: 238.25, source: original },
  { node: '835:3772', x: 77, y: 174, width: 83, height: 100, cropX: 201, cropY: 238.25, source: original },
  { node: '835:3773', x: 163, y: 174, width: 79, height: 100, cropX: 284, cropY: 238.25,
    source: require('../../assets/images/logo/source-third-glyph.png') },
  { node: '835:3774', x: 234, y: 174, width: 98, height: 100, cropX: 355, cropY: 238.25,
    source: require('../../assets/images/logo/source-fourth-glyph.png') },
] as const;

// 원본 해상도 안의 기본 폭:280dp@3x. 태블릿의332dp@2x도 대조했다.
export function Logo({ width = 280, accessibilityRole = 'image', motion, onReady, onImageError }: LogoProps) {
  const scale = width / 332;
  const loaded = useRef(new Set<string>());

  function markLoaded(node: string) {
    if (loaded.current.has(node)) return;
    loaded.current.add(node);
    if (loaded.current.size === parts.length) onReady?.();
  }

  return (
    <View accessible accessibilityRole={accessibilityRole} accessibilityLabel="도담도담"
      style={{ width, height: 274 * scale }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}>
        {parts.map((part, i) => (
          <Animated.View key={part.node} style={[styles.crop, {
            left: part.x * scale, top: part.y * scale,
            width: part.width * scale, height: part.height * scale,
          }, motion && { transform: i === 0
            ? [{ translateY: motion.symbolY }, { scale: motion.scales[i] }]
            : [{ scale: motion.scales[i] }] }]}>
            <Image accessible={false} source={part.source} resizeMode="stretch" fadeDuration={0}
              testID={onReady ? `splash-logo-part-${i}` : undefined}
              onLoad={onReady ? () => markLoaded(part.node) : undefined} onError={onImageError}
              style={{ position: 'absolute', width: 566 * scale, height: 424.5 * scale,
                left: -part.cropX * scale, top: -part.cropY * scale }} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ crop: { position: 'absolute', overflow: 'hidden' } });

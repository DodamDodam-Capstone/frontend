import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, useAnimatedValue, useWindowDimensions, View } from 'react-native';

import { AppText } from '../components/AppText';
import { colors, fonts } from '../theme/tokens';
import { getOnboardingLayout } from './onboardingLayout';

type SceneProps = { width: number; height: number; permission: boolean; reduceMotion: boolean };

const greeting = {
  girl: require('../../assets/images/onboarding/girl-wave.png'),
  boy: require('../../assets/images/onboarding/boy-wave.png'),
  boyScale: 1.0632, boyLeft: -0.0318, boyTop: -0.0118,
  speech: '안녕하세요!\n마음 친구 도담이에요!',
};

const microphoneGuide = {
  girl: require('../../assets/images/onboarding/girl-jump.png'),
  boy: require('../../assets/images/onboarding/boy-jump.png'),
  boyScale: 1.0397, boyLeft: -0.0201, boyTop: -0.0032,
  speech: '함께 이야기할\n준비를 해볼까요?',
};

function PoseLayer({ pose, scale, sceneLeft, opacity, onGirlLoad, onBoyLoad }: {
  pose: typeof greeting; scale: number; sceneLeft: number; opacity: Animated.AnimatedInterpolation<number>;
  onGirlLoad?: () => void; onBoyLoad?: () => void;
}) {
  const width = 395.09 * scale;
  const height = 393.921 * scale;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image accessible={false} fadeDuration={0} source={pose.girl} resizeMode="stretch"
        testID={onGirlLoad && 'onboarding-jump-girl'} onLoad={onGirlLoad}
        style={{ position: 'absolute', left: sceneLeft + 43 * scale, top: 0, width, height }} />
      <View style={{ position: 'absolute', overflow: 'hidden', left: sceneLeft + 256.91 * scale, top: 0, width, height }}>
        <Image accessible={false} fadeDuration={0} source={pose.boy} resizeMode="stretch"
          testID={onBoyLoad && 'onboarding-jump-boy'} onLoad={onBoyLoad}
          style={{ position: 'absolute', left: width * pose.boyLeft, top: height * pose.boyTop,
            width: width * pose.boyScale, height: height * pose.boyScale }} />
      </View>
    </Animated.View>
  );
}

function Characters({ scale, sceneLeft, top, permission, reduceMotion }: {
  scale: number; sceneLeft: number; top: number; permission: boolean; reduceMotion: boolean;
}) {
  const progress = useAnimatedValue(0);
  const [girlReady, setGirlReady] = useState(false);
  const [boyReady, setBoyReady] = useState(false);
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!permission) {
      arrived.current = false;
      progress.setValue(0);
      return;
    }
    if (!girlReady || !boyReady || arrived.current) return;
    if (reduceMotion) {
      progress.setValue(1);
      arrived.current = true;
      return;
    }
    const hop = Animated.timing(progress, {
      toValue: 1, duration: 220, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    });
    hop.start(({ finished }) => { if (finished) arrived.current = true; });
    return () => hop.stop();
  }, [permission, girlReady, boyReady, reduceMotion, progress]);

  const motion = useMemo(() => ({
    // 두 포즈가 겹치는 시간은 정점 근처로 제한해 얼굴과 팔의 잔상을 줄인다.
    greeting: progress.interpolate({ inputRange: [0.44, 0.62], outputRange: [1, 0], extrapolate: 'clamp' }),
    jump: progress.interpolate({ inputRange: [0.38, 0.56], outputRange: [0, 1], extrapolate: 'clamp' }),
    lift: progress.interpolate({
      inputRange: [0, 0.16, 0.36, 0.5, 0.64, 0.84, 1],
      outputRange: [0, -1.5, -6, -7, -6, -1.5, 0].map(y => y * scale),
    }),
  }), [progress, scale]);
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top, height: 393.921 * scale,
      transform: [{ translateY: motion.lift }] }}>
      <PoseLayer pose={greeting} scale={scale} sceneLeft={sceneLeft} opacity={motion.greeting} />
      <PoseLayer pose={microphoneGuide} scale={scale} sceneLeft={sceneLeft} opacity={motion.jump}
        onGirlLoad={() => setGirlReady(true)} onBoyLoad={() => setBoyReady(true)} />
    </Animated.View>
  );
}

export function OnboardingScene({ width, height, permission, reduceMotion }: SceneProps) {
  const { fontScale } = useWindowDimensions();
  if (width <= 0 || height <= 0) return null;

  const pose = permission ? microphoneGuide : greeting;
  const { scale, sceneLeft, sceneTop, roomScale, roomLeft, roomTop } = getOnboardingLayout(width, height);

  const fontSize = Math.max(16, 20 * scale);
  const bubbleScale = fontSize / 20 * Math.max(1, fontScale);
  const bubbleWidth = Math.min(width / 2 - 8, 276 * bubbleScale);
  const bubbleHeight = 144.601 * bubbleScale;
  const bubbleLeft = Math.max(4, Math.min(width / 2 - bubbleWidth - 4, sceneLeft + 335 * scale - bubbleWidth / 2));
  const bubbleTop = Math.max(4, sceneTop + 267.601 * scale - bubbleHeight);

  return (
    <View pointerEvents="box-none" style={styles.scene}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}>
        <Image accessible={false} fadeDuration={0} resizeMode="stretch"
          source={require('../../assets/images/onboarding/room.png')}
          style={{ position: 'absolute', left: roomLeft - 258.56 * roomScale,
            top: roomTop, width: 1545.216 * roomScale, height: 800 * roomScale }} />
        <Characters scale={scale} sceneLeft={sceneLeft} top={sceneTop + 260 * scale}
          permission={permission} reduceMotion={reduceMotion} />
      </View>

      <ScrollView bounces={false} directionalLockEnabled nestedScrollEnabled
        style={{ position: 'absolute', left: bubbleLeft, top: bubbleTop,
          width: bubbleWidth, maxHeight: height - bubbleTop }}>
        <View>
          <Image accessible={false} importantForAccessibility="no" fadeDuration={0}
            source={require('../../assets/images/onboarding/native/speech-bubble.png')}
            resizeMode="stretch" style={styles.bubbleArt} />
          <View style={[styles.bubble, { minHeight: bubbleHeight,
            paddingHorizontal: bubbleWidth * 0.12,
            paddingTop: bubbleHeight * 0.12, paddingBottom: bubbleHeight * 0.2 }]}>
            <AppText style={[styles.speech, { fontSize, lineHeight: fontSize * 1.4 }]}>
              {pose.speech}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: colors.surface },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  bubbleArt: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  speech: { color: colors.textBubble, fontFamily: fonts.extraBold, textAlign: 'center' },
});

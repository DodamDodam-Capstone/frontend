import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '../components/AppText';
import { colors, fonts } from '../theme/tokens';
import { getOnboardingLayout } from './onboardingLayout';

type SceneProps = { width: number; height: number; permission: boolean };

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

export function OnboardingScene({ width, height, permission }: SceneProps) {
  const { fontScale } = useWindowDimensions();
  if (width <= 0 || height <= 0) return null;

  const pose = permission ? microphoneGuide : greeting;
  const { scale, sceneLeft, sceneTop, roomScale, roomLeft, roomTop } = getOnboardingLayout(width, height);
  const characterWidth = 395.09 * scale;
  const characterHeight = 393.921 * scale;
  const characterTop = sceneTop + 260 * scale;

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
        <Image accessible={false} fadeDuration={0} source={pose.girl} resizeMode="stretch"
          style={{ position: 'absolute', left: sceneLeft + 43 * scale, top: characterTop,
            width: characterWidth, height: characterHeight }} />
        <View style={{ position: 'absolute', overflow: 'hidden', left: sceneLeft + 256.91 * scale,
          top: characterTop, width: characterWidth, height: characterHeight }}>
          <Image accessible={false} fadeDuration={0} source={pose.boy} resizeMode="stretch"
            style={{ position: 'absolute', left: characterWidth * pose.boyLeft, top: characterHeight * pose.boyTop,
              width: characterWidth * pose.boyScale, height: characterHeight * pose.boyScale }} />
        </View>
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

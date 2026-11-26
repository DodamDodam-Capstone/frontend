import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { colors, fonts, typography } from '../theme/tokens';
import { TEST_CHILD_CHARACTERS, UPCOMING_TEST_CHILD_CHARACTER, type ChildCharacter } from './childRegistrationData';

export const childCharacterImages: ReadonlyMap<string, number> = new Map([
  [TEST_CHILD_CHARACTERS[0].id, require('../../assets/images/child-registration/preview-girl.png')],
  [UPCOMING_TEST_CHILD_CHARACTER.id, require('../../assets/images/child-registration/preview-boy.png')],
]);

const room = require('../../assets/images/child-registration/preview-room.png');
const fadeDuration = 150;
const fadeEasing = Easing.out(Easing.cubic);

type ChildCharacterChoiceProps = {
  characters: readonly ChildCharacter[];
  value: string;
  disabled: boolean;
  upcoming?: ChildCharacter;
  previewingUpcoming: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  onPreviewUpcoming: () => void;
  onChange: (id: string) => void;
};

export function ChildCharacterChoice({
  characters, value, disabled, upcoming, previewingUpcoming, largeText, reduceMotion, onPreviewUpcoming, onChange,
}: ChildCharacterChoiceProps) {
  const showUpcoming = !!upcoming && previewingUpcoming;
  const target = showUpcoming ? 1 : 0;
  const [progress] = useState(() => new Animated.Value(target));
  const lastTarget = useRef(target);
  const fadingOut = useMemo(() => progress.interpolate({
    inputRange: [0, 1], outputRange: [1, 0],
  }), [progress]);
  const availableOpacity = reduceMotion ? 1 - target : fadingOut;
  const upcomingOpacity = reduceMotion ? target : progress;
  const availableImage = childCharacterImages.get(value);
  const upcomingImage = upcoming && childCharacterImages.get(upcoming.id);

  useLayoutEffect(() => {
    if (reduceMotion) {
      progress.setValue(target);
      lastTarget.current = target;
      return;
    }
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    const animation = Animated.timing(progress, {
      toValue: target, duration: fadeDuration, easing: fadeEasing, useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, target]);

  return (
    <View style={[styles.character, showUpcoming && largeText ? styles.expandedCharacter : styles.characterAspect]}>
      <Image source={room} resizeMode="stretch" style={styles.room} accessible={false} />
      {!!availableImage && <Animated.Image source={availableImage} resizeMode="contain" fadeDuration={0} accessible={false}
        style={[styles.characterImage, { opacity: availableOpacity }]} />}
      {!!upcomingImage && <Animated.Image source={upcomingImage} resizeMode="contain" fadeDuration={0} accessible={false}
        style={[styles.characterImage, { opacity: upcomingOpacity }]} />}
      {upcoming && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.upcomingShade, { opacity: upcomingOpacity }]} />}
      <View style={styles.characterOptions}>
        {characters.map(character => {
          const selected = value === character.id;
          const highlighted = selected && !showUpcoming;
          return (
            <Pressable key={character.id} accessibilityRole="button" accessibilityLabel={character.label}
              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onChange(character.id)}
              style={({ pressed }) => [styles.characterChoice, highlighted && styles.characterSelected, pressed && styles.pressed]}>
              <AppText style={[styles.characterLabel, highlighted && styles.characterLabelSelected]}>{character.label}</AppText>
            </Pressable>
          );
        })}
        {upcoming && (
          <Pressable accessibilityRole="button" accessibilityLabel={upcoming.label}
            accessibilityHint="준비 중인 캐릭터의 미리보기를 열어요. 아직 등록할 수 없어요."
            accessibilityState={{ expanded: showUpcoming, disabled }} disabled={disabled} onPress={onPreviewUpcoming}
            style={({ pressed }) => [styles.characterChoice, showUpcoming && styles.characterUnavailable, pressed && styles.pressed]}>
            <AppText style={[styles.characterLabel, showUpcoming && styles.characterLabelSelected]}>{upcoming.label}</AppText>
          </Pressable>
        )}
      </View>
      {upcoming && (
        <Animated.View pointerEvents="none" style={[styles.upcomingNotice, { opacity: upcomingOpacity }]}
          accessibilityElementsHidden={!showUpcoming} importantForAccessibility={showUpcoming ? 'auto' : 'no-hide-descendants'}
          accessibilityLiveRegion={showUpcoming ? 'polite' : 'none'}>
          <View testID="child-upcoming-lock" accessible={false} style={styles.lockCircle}>
            <View style={styles.lockShackle} />
            <View style={styles.lockBody}><View style={styles.lockKeyhole} /></View>
          </View>
          <AppText style={styles.upcomingTitle}>준비 중이에요</AppText>
          <AppText style={styles.upcomingDetail}>{upcoming.label}는 추후 만날 수 있어요!</AppText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  character: { width: '100%', borderRadius: 32, overflow: 'hidden', backgroundColor: '#EAF3DA' },
  characterAspect: { aspectRatio: 286 / 408 },
  expandedCharacter: { minHeight: 408 },
  room: { position: 'absolute', width: '261.19%', height: '114.52%', left: '-93.87%', top: 0 },
  characterImage: { position: 'absolute', width: '98.95%', height: '69.36%', left: '1.05%', top: '25.25%' },
  upcomingShade: { backgroundColor: 'rgba(31,17,3,0.6)' },
  upcomingNotice: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 16 },
  lockCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 13 },
  lockShackle: { width: 20, height: 18, borderWidth: 3, borderBottomWidth: 0, borderColor: colors.surfaceWhite,
    borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  lockBody: { width: 32, height: 25, borderWidth: 3, borderRadius: 7, borderColor: colors.surfaceWhite,
    alignItems: 'center', justifyContent: 'center' },
  lockKeyhole: { width: 4, height: 8, borderRadius: 2, backgroundColor: colors.surfaceWhite },
  upcomingTitle: { ...typography.title, fontSize: 24, lineHeight: 32, color: colors.surfaceWhite, textAlign: 'center' },
  upcomingDetail: { ...typography.label, color: colors.surfaceWhite, textAlign: 'center' },
  characterOptions: { flexDirection: 'row', backgroundColor: '#EDF5E3', borderRadius: 28, padding: 4, margin: '6%' },
  characterChoice: { flex: 1, minHeight: 44, paddingHorizontal: 4, paddingVertical: 6, alignItems: 'center',
    justifyContent: 'center', borderRadius: 24 },
  characterSelected: { backgroundColor: colors.primary },
  characterUnavailable: { backgroundColor: '#625D58' },
  characterLabel: { ...typography.input, fontFamily: fonts.bold, color: '#595046', textAlign: 'center' },
  characterLabelSelected: { fontFamily: fonts.extraBold, color: colors.surfaceWhite },
  pressed: { opacity: 0.8 },
});

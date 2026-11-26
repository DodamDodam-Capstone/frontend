import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, BackHandler, Easing, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  TextInput, useAnimatedValue, useWindowDimensions, View, type Text,
} from 'react-native';

import { ChildRegistrationProgress } from '../auth/SignupProgress';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TextField } from '../components/TextField';
import { useReduceMotion } from '../components/useReduceMotion';
import { colors, typography } from '../theme/tokens';
import { BirthDatePicker, pickerStartDate } from './BirthDatePicker';
import { ChildCharacterChoice, childCharacterImages } from './ChildCharacterChoice';
import {
  addChildInterest, TEST_CHILD_CHARACTERS, UPCOMING_TEST_CHILD_CHARACTER,
  type ChildCharacter, type ChildDraft, type ChildFieldErrors,
} from './childRegistrationData';

type ChildRegistrationFormProps = {
  draft: ChildDraft;
  errors: ChildFieldErrors;
  confirmation: boolean;
  busy: boolean;
  feedback?: string;
  retryWaiting: boolean;
  checkOnly: boolean;
  charactersAvailable: boolean;
  characters?: readonly ChildCharacter[];
  onChange: (value: Partial<ChildDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
};

const inlineFieldGap = 20;
const suggestions = ['그림', '노래', '책 읽기', '운동', '동물', '공룡'];
const genders = [
  { id: 'MALE', label: '남자', summary: '남아' },
  { id: 'FEMALE', label: '여자', summary: '여아' },
] as const;
const confirmationFallback = require('../../assets/images/signup/signup-complete-character.png');
const chevron = require('../../assets/images/child-registration/chevron.png');
const genderTransitionDuration = 150;
const stageTransitionDuration = 220;
const transitionEasing = Easing.out(Easing.cubic);

export function ChildRegistrationForm({
  draft, errors, confirmation, busy, feedback, retryWaiting, checkOnly, charactersAvailable,
  characters = TEST_CHILD_CHARACTERS, onChange, onNext, onBack, onSubmit,
}: ChildRegistrationFormProps) {
  const { width, height, fontScale } = useWindowDimensions();
  const [genderOpen, setGenderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(() => pickerStartDate(''));
  const [pendingTag, setPendingTag] = useState('');
  const [interestInputFocused, setInterestInputFocused] = useState(false);
  const [tagError, setTagError] = useState<string>();
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [enteringConfirmation, setEnteringConfirmation] = useState(false);
  const entryStep = checkOnly ? 'status' : confirmation ? 'confirmation' : 'input';
  const previousStep = useRef(entryStep);
  const progress = useAnimatedValue(confirmation ? 1 : 0);
  const reduceMotion = useReduceMotion();
  const genderProgress = useAnimatedValue(0);
  const previousGenderOpen = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<Text>(null);
  const pickerTrigger = useRef<View>(null);
  const birthDateText = draft.birthDate.replaceAll('-', '.');
  const selectedGender = genders.find(gender => gender.id === draft.gender);
  const selectedCharacter = characters.find(character => character.id === draft.characterId);
  const portrait = selectedCharacter && childCharacterImages.get(selectedCharacter.id);
  const upcoming = characters.some(character => character.id === TEST_CHILD_CHARACTERS[0].id)
    && !characters.some(character => character.id === UPCOMING_TEST_CHILD_CHARACTER.id)
    ? UPCOMING_TEST_CHILD_CHARACTER : undefined;
  const previewingUpcoming = showUpcoming && upcoming !== undefined;
  const missingRequired = !draft.name.trim() || !draft.nickname.trim() || !draft.birthDate || !draft.gender || !selectedCharacter;
  const pendingInterest = pendingTag.trim().length > 0;
  const showForm = !confirmation && !checkOnly;
  const pickerVisible = dateOpen && showForm;
  const railWidth = width >= 700 ? Math.min(215, width * 215 / 1280) : 0;
  const inlineFields = fontScale <= 1.35;
  const wide = width - railWidth >= 680 && inlineFields;
  const title = checkOnly ? '등록 상태 확인' : confirmation ? '등록 확인'
    : charactersAvailable ? '아이 프로필' : '아이 등록';
  const interestFeedback = tagError ?? errors.interests;
  const interestPlaceholder = draft.interests.length > 0 ? '직접 작성할 수도 있어요' : '아래에서 고르거나 직접 추가해 주세요';

  const stepMotion = useMemo(() => ({
    input: {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }],
    },
    confirmation: {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    },
  }), [progress]);

  const genderMotion = useMemo(() => ({
    rotate: genderProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
    menu: {
      opacity: genderProgress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
      transform: [{ translateY: genderProgress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
    },
  }), [genderProgress]);

  useLayoutEffect(() => {
    const changed = previousGenderOpen.current !== genderOpen;
    previousGenderOpen.current = genderOpen;
    const toValue = genderOpen ? 1 : 0;
    if (reduceMotion) {
      genderProgress.setValue(toValue);
      return;
    }
    if (!changed) return;
    const transition = Animated.timing(genderProgress, {
      toValue, duration: genderTransitionDuration, easing: transitionEasing, useNativeDriver: true, isInteraction: false,
    });
    transition.start();
    return () => transition.stop();
  }, [genderOpen, genderProgress, reduceMotion]);

  useLayoutEffect(() => {
    const previous = previousStep.current;
    const changed = previous !== entryStep;
    previousStep.current = entryStep;
    if (changed) scroll.current?.scrollTo({ y: 0, animated: false });
    const destination = entryStep === 'confirmation' ? 1 : 0;
    if (reduceMotion || entryStep === 'status' || previous === 'status') {
      progress.setValue(destination);
      setEnteringConfirmation(false);
      return;
    }
    if (!changed) return;

    // 고정된 하단 버튼을 연속 탭해 확인 내용을 보기 전에 제출하지 않도록 한다.
    setEnteringConfirmation(entryStep === 'confirmation');
    let current = true;
    const transition = Animated.timing(progress, {
      toValue: destination, duration: stageTransitionDuration, easing: transitionEasing,
      useNativeDriver: true, isInteraction: false,
    });
    transition.start(() => { if (current) setEnteringConfirmation(false); });
    return () => { current = false; transition.stop(); };
  }, [entryStep, progress, reduceMotion]);

  useEffect(() => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  }, [title]);

  useEffect(() => {
    if (pickerVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (genderOpen) setGenderOpen(false);
      else if (previewingUpcoming) setShowUpcoming(false);
      else if (!busy) onBack();
      return true;
    });
    return () => subscription.remove();
  }, [busy, genderOpen, onBack, pickerVisible, previewingUpcoming]);

  function addInterest(value: string, clearInput = false) {
    const result = addChildInterest(draft.interests, value);
    if (!result.ok) {
      setTagError(result.message);
      return;
    }
    setTagError(undefined);
    if (clearInput) setPendingTag('');
    onChange({ interests: result.interests });
  }

  function selectDate() {
    Keyboard.dismiss();
    setGenderOpen(false);
    setPickedDate(pickerStartDate(draft.birthDate));
    setDateOpen(true);
  }

  return (
    <View style={styles.root}>
      {!!railWidth && (
        <View style={styles.rail} accessibilityElementsHidden={pickerVisible}
          importantForAccessibility={pickerVisible ? 'no-hide-descendants' : 'auto'}>
          <ChildRegistrationProgress step={showForm ? 'input' : 'confirmation'} width={railWidth} />
        </View>
      )}
      <KeyboardAvoidingView style={styles.column} behavior="padding" enabled={Platform.OS === 'android'}
        accessibilityElementsHidden={pickerVisible} importantForAccessibility={pickerVisible ? 'no-hide-descendants' : 'auto'}>
        <ScrollView ref={scroll} style={styles.bodyScroll} bounces={false} keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={[styles.scroll, {
            paddingTop: Math.min(67, Math.max(24, height * 0.084)),
          }]}>
          <Animated.View style={[styles.content, !wide && styles.compactContent,
            !reduceMotion && entryStep !== 'status' && stepMotion[entryStep]]}>
            <View style={styles.heading}>
              <AppText ref={heading} accessibilityRole="header" style={styles.title}>{title}</AppText>
              {!checkOnly && <AppText style={styles.description}>{confirmation
                ? '프로필을 확인한 뒤 등록해 주세요. 아이는 한 명만 등록할 수 있어요.'
                : '아이 한 명의 프로필을 등록해요. 도담이는 애칭으로 아이를 불러요.'}</AppText>}
            </View>
            {!!feedback && <ErrorMessage message={feedback} />}
            {showForm && (
              <View style={[styles.form, wide && styles.wideForm]}>
                <View style={styles.fields}>
                  <View style={[styles.fieldRow, inlineFields && styles.inlineFields]}>
                    <View style={styles.field}>
                      <TextField label="아이 이름" value={draft.name} error={errors.name} placeholder="이름 1~5자"
                        autoComplete="off" autoCorrect={false} onChangeText={name => onChange({ name })} />
                    </View>
                    <View style={styles.field}>
                      <TextField label="아이 애칭" value={draft.nickname} error={errors.nickname} placeholder="애칭 1~20자"
                        autoComplete="off" autoCorrect={false} onChangeText={nickname => onChange({ nickname })} />
                    </View>
                  </View>
                  <View>
                    <View style={[styles.fieldRow, inlineFields && styles.inlineFields]}>
                      <View style={[styles.field, styles.selectField]}>
                        <AppText style={styles.label}>생년월일</AppText>
                        <Pressable ref={pickerTrigger} accessibilityRole="button" accessibilityLabel="생년월일 선택"
                          accessibilityValue={{ text: birthDateText || '선택하지 않음' }}
                          accessibilityHint={errors.birthDate} onPress={selectDate}
                          style={({ pressed }) => [styles.select, !!errors.birthDate && styles.invalid, pressed && styles.pressed]}>
                          <AppText style={[styles.selectText, !birthDateText && styles.placeholder]}>
                            {birthDateText || '입력해주세요'}
                          </AppText>
                        </Pressable>
                        {!!errors.birthDate && <ErrorMessage message={errors.birthDate} inline />}
                      </View>
                      <View style={[styles.field, styles.selectField]}>
                        <AppText style={styles.label}>성별</AppText>
                        <Pressable accessibilityRole="button" accessibilityLabel="성별"
                          accessibilityValue={{ text: selectedGender?.label ?? '선택하지 않음' }}
                          accessibilityHint={errors.gender} accessibilityState={{ expanded: genderOpen }}
                          style={[styles.select, !!errors.gender && styles.invalid]}
                          onPress={() => { Keyboard.dismiss(); setGenderOpen(open => !open); }}>
                          <AppText style={[styles.selectText, !selectedGender && styles.placeholder]}>
                            {selectedGender?.label ?? '선택해 주세요'}
                          </AppText>
                          <Animated.Image testID="child-gender-chevron" source={chevron} accessible={false}
                            style={[styles.chevron, { transform: [{
                              rotate: reduceMotion ? (genderOpen ? '90deg' : '0deg') : genderMotion.rotate,
                            }] }]} />
                        </Pressable>
                        {!!errors.gender && <ErrorMessage message={errors.gender} inline />}
                      </View>
                    </View>
                    <View style={styles.interests}>
                      {/* Place the dropdown over the next section without expanding the field row. */}
                      {genderOpen && (
                        <Animated.View testID="child-gender-options"
                          style={[styles.genderOptions, inlineFields && styles.inlineGenderOptions, !reduceMotion && genderMotion.menu]}>
                          {genders.map(gender => (
                            <Pressable key={gender.id} accessibilityRole="button" accessibilityLabel={gender.label}
                              accessibilityState={{ selected: draft.gender === gender.id }} style={styles.genderOption}
                              onPress={() => { onChange({ gender: gender.id }); setGenderOpen(false); }}>
                              <AppText style={styles.selectText}>{gender.label}</AppText>
                            </Pressable>
                          ))}
                        </Animated.View>
                      )}
                      <AppText style={styles.label}>아이의 관심사 (선택) · {draft.interests.length}/10</AppText>
                      <View style={styles.tagBox}>
                        {draft.interests.length > 0 && (
                          <View style={styles.tags}>
                            {draft.interests.map(value => (
                              <Pressable accessibilityRole="button" accessibilityLabel={`${value} 관심사 제거`}
                                key={value} onPress={() => {
                                  setTagError(undefined);
                                  onChange({ interests: draft.interests.filter(tag => tag !== value) });
                                }} style={[styles.tag, styles.selectedTag]}>
                                <AppText style={styles.selectedTagLabel}>{value} ×</AppText>
                              </Pressable>
                            ))}
                          </View>
                        )}
                        <TextInput accessibilityLabel="직접 입력"
                          accessibilityHint={interestFeedback ?? '완료 키를 눌러 관심사를 추가해요.'}
                          value={pendingTag} placeholder={interestInputFocused ? undefined : interestPlaceholder}
                          placeholderTextColor={colors.textPlaceholder}
                          onFocus={() => setInterestInputFocused(true)} onBlur={() => setInterestInputFocused(false)}
                          onChangeText={value => { setPendingTag(value); setTagError(undefined); }}
                          onSubmitEditing={() => { if (pendingInterest) addInterest(pendingTag, true); }}
                          submitBehavior="submit" returnKeyType="done" autoCorrect={false} style={styles.customTagInput} />
                      </View>
                      {!!interestFeedback && <ErrorMessage message={interestFeedback} inline />}
                      <View style={styles.tags}>
                        {suggestions.map(value => {
                          const selected = draft.interests.includes(value);
                          return (
                            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }}
                              onPress={() => {
                                if (selected) {
                                  setTagError(undefined);
                                  onChange({ interests: draft.interests.filter(tag => tag !== value) });
                                } else addInterest(value);
                              }} style={[styles.tag, selected && styles.selectedTag]}>
                              <AppText style={selected ? styles.selectedTagLabel : styles.tagLabel}>{value}</AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>
                <View testID="child-character-preview" style={[styles.preview, wide && styles.widePreview]}>
                  {charactersAvailable
                    ? <ChildCharacterChoice characters={characters} value={draft.characterId} disabled={busy}
                      upcoming={upcoming} previewingUpcoming={previewingUpcoming} largeText={!inlineFields}
                      reduceMotion={reduceMotion}
                      onPreviewUpcoming={() => setShowUpcoming(true)}
                      onChange={characterId => { setShowUpcoming(false); onChange({ characterId }); }} />
                    : <AppText style={styles.description}>등록에 사용할 캐릭터를 준비하고 있어요.</AppText>}
                  {!!errors.characterId && <ErrorMessage message={errors.characterId} inline />}
                </View>
              </View>
            )}
            {confirmation && !checkOnly && (
              <>
                <AppText style={styles.banner}>등록한 프로필로 도담이와 대화를 시작해요.</AppText>
                <View style={styles.summary}>
                  <View style={styles.confirmationPicture}>
                    <Image testID="child-confirmation-portrait" source={portrait ?? confirmationFallback}
                      style={portrait ? styles.confirmationPortrait : styles.confirmationFallback}
                      resizeMode="contain" accessible={false} />
                  </View>
                  <AppText style={styles.summaryNickname}>{draft.nickname}</AppText>
                  <AppText style={styles.description}>{birthDateText} · {selectedGender?.summary}</AppText>
                  <AppText style={styles.summaryDetail}>아이 이름 {draft.name} · {selectedCharacter?.label}</AppText>
                  {draft.interests.length > 0 && <AppText style={styles.summaryDetail}>관심사 {draft.interests.join(', ')}</AppText>}
                </View>
              </>
            )}
          </Animated.View>
        </ScrollView>
        <View style={styles.footerGutter}>
          <View style={styles.footer}>
            <View style={[styles.content, styles.actions, !wide && styles.compactContent]}>
              <View style={styles.action}>
                <Button label="뒤로 가기" variant="secondary" disabled={busy}
                  onPress={() => { Keyboard.dismiss(); setGenderOpen(false); onBack(); }} />
              </View>
              <View style={[styles.action, showForm && previewingUpcoming && styles.previewContinueAction]}>
                <Button label={checkOnly ? '다시 확인' : confirmation ? '등록하고 시작'
                  : previewingUpcoming ? '여자 도담이로 계속' : '다음으로'} variant="onboarding"
                  loading={busy} disabled={checkOnly || confirmation
                    ? retryWaiting || (confirmation && enteringConfirmation)
                    : !charactersAvailable || missingRequired || pendingInterest}
                  onPress={showForm ? () => { Keyboard.dismiss(); setGenderOpen(false); setShowUpcoming(false); onNext(); } : onSubmit} />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <BirthDatePicker visible={pickerVisible} reduceMotion={reduceMotion} value={pickedDate} onChange={setPickedDate} returnFocusRef={pickerTrigger}
        onConfirm={() => { onChange({ birthDate: pickedDate }); setDateOpen(false); }} onCancel={() => setDateOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.surface },
  rail: { flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  bodyScroll: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: '2.3%' },
  content: { width: '80%', maxWidth: 803, alignSelf: 'center', gap: 33 },
  compactContent: { width: '94%' },
  heading: { gap: 5 },
  title: { ...typography.title, fontSize: 28, lineHeight: 37, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  form: { gap: 24 },
  wideForm: { flexDirection: 'row', alignItems: 'flex-start' },
  fields: { flex: 1, minWidth: 0, gap: 23 },
  fieldRow: { gap: inlineFieldGap },
  inlineFields: { flexDirection: 'row' },
  field: { flex: 1, minWidth: 0 },
  label: { ...typography.label, color: colors.textLabel },
  selectField: { gap: 8 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, gap: 8,
    borderColor: colors.border, borderWidth: 2, borderRadius: 20, backgroundColor: colors.surfaceWhite, paddingHorizontal: 18 },
  selectText: { ...typography.input, color: colors.textLabel, flexShrink: 1 },
  placeholder: { color: colors.textPlaceholder },
  invalid: { borderColor: colors.textLabel },
  chevron: { width: 32, height: 32 },
  genderOptions: { position: 'absolute', top: 4, left: 0, right: 0, zIndex: 1,
    borderWidth: 2, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surfaceWhite },
  inlineGenderOptions: { left: '50%', marginLeft: inlineFieldGap / 2 },
  genderOption: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center' },
  interests: { gap: 8, paddingTop: 23 },
  tagBox: { gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: colors.border,
    borderRadius: 16, backgroundColor: colors.surfaceWhite },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 2, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surfaceWhite,
    maxWidth: '100%', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  tagLabel: { ...typography.input, color: colors.textPlaceholder },
  selectedTag: { backgroundColor: '#EAF3DA' },
  selectedTagLabel: { ...typography.input, color: colors.textLabel },
  customTagInput: { ...typography.input, color: colors.textPrimary, minHeight: 52 },
  preview: { alignSelf: 'center', width: '100%', maxWidth: 286, gap: 8 },
  widePreview: { alignSelf: 'flex-start', marginTop: typography.label.lineHeight + 8, width: '35.6%' },
  pressed: { opacity: 0.8 },
  banner: { ...typography.body, fontSize: 18, color: '#3E5728', backgroundColor: '#E8F3C3', textAlign: 'center',
    padding: 15, borderRadius: 16 },
  summary: { alignItems: 'center', gap: 7, marginVertical: 23 },
  confirmationPicture: { width: 182, maxWidth: '100%', aspectRatio: 1, borderRadius: 28, overflow: 'hidden', alignItems: 'center',
    backgroundColor: '#ECFFD3', experimental_backgroundImage: [{ type: 'linear-gradient', direction: 'to bottom',
      colorStops: [{ color: '#DAFF96', positions: ['0%'] }, { color: '#FFFFFF', positions: ['100%'] }] }] },
  confirmationPortrait: { position: 'absolute', width: '192%', height: '192%', left: '-46%', top: 0 },
  confirmationFallback: { width: 99, height: 128, marginTop: 22 },
  summaryNickname: { ...typography.title, fontSize: 22, lineHeight: 30, color: colors.textPrimary, textAlign: 'center', marginTop: 6 },
  summaryDetail: { ...typography.label, color: colors.textSecondary, textAlign: 'center' },
  footerGutter: { paddingHorizontal: '2.3%', paddingBottom: 24 },
  footer: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 24 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  action: { width: '27%', minWidth: 108, maxWidth: 180 },
  previewContinueAction: { width: '47%', minWidth: 132, maxWidth: 248 },
});

import { type ReactNode, type Ref, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, BackHandler, Image, type ImageSourcePropType, type ImageStyle, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, type Text, useWindowDimensions, View, type ViewStyle,
} from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { colors, fonts, typography } from '../theme/tokens';
import type { HomeData, HomeTalkState } from './homeData';

type HomeScreenProps = {
  onTalk: () => void;
  onGuardian: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  logoutDisabled: boolean;
  logoutFeedback?: string;
} & (
  | { data: HomeData; talkState: HomeTalkState | 'checking'; fallback?: never }
  | { data?: never; talkState?: never; fallback: ReactNode }
);

type Box = readonly [x: number, y: number, width: number, height: number];
type Illustration = { source: ImageSourcePropType; box: Box; flip?: boolean };
type PressFeedback = { edge: Illustration; stars: readonly [Box, Box] };
type PairedPress = { active: boolean; onChange: (pressed: boolean) => void };
type UpcomingMenu = {
  title: string;
  image: ImageSourcePropType;
  hitBox: Box;
  feedback: PressFeedback;
  captionBox: Box;
};

const designWidth = 1280;
const designHeight = 800;
const days = ['월', '화', '수', '목', '금', '토', '일'];
const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' });
const room = require('../../assets/images/home/room.png');
const speech = require('../../assets/images/home/speech.png');
const sparkle = require('../../assets/images/home/sparkle.png');
const smallSparkle = require('../../assets/images/home/sparkle-small.png');
const dressUp = require('../../assets/images/home/dress-up.png');
const memories = require('../../assets/images/home/memories.png');
const play = require('../../assets/images/home/play.png');

const character: Illustration = {
  source: require('../../assets/images/home/character.png'), box: [420, 215, 441, 441],
};
const memoriesEdge: Illustration = {
  source: require('../../assets/images/home/memories-outline.png'), box: [170, 477, 231, 215],
};
const dressUpEdge: Illustration = {
  source: require('../../assets/images/home/dress-up-outline.png'), box: [934, 178, 178, 221],
};
const playEdge: Illustration = {
  source: require('../../assets/images/home/play-outline.png'), box: [808, 575, 254, 198],
};
const characterFeedback: PressFeedback = {
  // 원본 실루엣 바깥 픽셀만 들어 있는 마스크라 터치 중에도 얼굴 위에 빛을 그리지 않는다.
  edge: { source: require('../../assets/images/home/character-press-outline.png'), box: character.box },
  stars: [[506, 352, 18, 22], [703, 250, 14, 17]],
};

const upcomingMenus: UpcomingMenu[] = [
  {
    title: '도담이 꾸미기', image: dressUp, hitBox: [902, 116, 240, 292], captionBox: [4, 0, 232, 43],
    feedback: { edge: dressUpEdge, stars: [[930, 249, 17, 21], [1101, 222, 14, 17]] },
  },
  {
    title: '추억 다시보기', image: memories, hitBox: [165, 416, 240, 278], captionBox: [4, 0, 232, 43],
    feedback: { edge: memoriesEdge, stars: [[165, 570, 18, 22], [382, 502, 14, 17]] },
  },
  {
    title: '같이 놀기', image: play, hitBox: [808, 509, 254, 266], captionBox: [27, 0, 200, 43],
    feedback: { edge: playEdge, stars: [[805, 627, 18, 22], [1051, 614, 14, 17]] },
  },
];

// 방의 가구와 그림 아이콘이 겹치는 시안 좌표를 같은 가로 장면에 배치한다.
const homeIllustrations: Illustration[] = [
  character,
  { source: memories, box: [165, 453, 240, 240] },
  memoriesEdge,
  { source: require('../../assets/images/home/memories-sparkle.png'), box: [204, 500, 11, 14] },
  { source: require('../../assets/images/home/memories-sparkle-large.png'), box: [364, 527, 14, 17], flip: true },
  { source: dressUp, box: [902, 175, 240, 240], flip: true },
  dressUpEdge,
  { source: sparkle, box: [1053, 175, 14, 17] },
  { source: smallSparkle, box: [972, 200, 11, 14], flip: true },
];

const attendanceIllustrations: Illustration[] = [
  { source: require('../../assets/images/home/attendance-character.png'), box: [45, 124, 380, 288] },
  { source: require('../../assets/images/home/clover-upper-right.png'), box: [382, 168, 40, 39] },
  { source: require('../../assets/images/home/clover-lower-right.png'), box: [322, 338, 40, 39] },
  { source: require('../../assets/images/home/clover-upper-left.png'), box: [72, 178, 40, 39] },
  { source: require('../../assets/images/home/clover-lower-left.png'), box: [62, 328, 40, 39] },
];

const position = (x: number, y: number, scale: number): Pick<ViewStyle, 'position' | 'left' | 'top'> => ({
  position: 'absolute', left: x * scale, top: y * scale,
});

function IllustrationLayer({ source, box: [x, y, width, height], flip, scale, style }: Illustration & {
  scale: number; style?: ImageStyle;
}) {
  return <Image source={source} accessible={false} resizeMode="stretch" style={[
    position(x, y, scale),
    { width: width * scale, height: height * scale },
    flip && { transform: [{ scaleX: -1 }] },
    style,
  ]} />;
}

function HomeButton({ label, onPress, disabled = false, blocked = false, scale, style, tone, buttonRef, pairedPress }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  blocked?: boolean;
  scale: number;
  style?: ViewStyle;
  tone?: 'attendance' | 'confirm';
  buttonRef?: RefObject<View | null>;
  pairedPress?: PairedPress;
}) {
  const unavailable = disabled || blocked;
  return (
    <Pressable ref={buttonRef} accessible={!blocked} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable} focusable={!unavailable} onPress={onPress}
      onPressIn={pairedPress && (() => pairedPress.onChange(true))}
      onPressOut={pairedPress && (() => pairedPress.onChange(false))}
      hitSlop={tone === 'attendance' ? { top: 8, bottom: 8, left: 5, right: 5 } : undefined}
      style={({ pressed }) => [
        styles.pill, { minHeight: Math.max(44, 43 * scale), paddingHorizontal: 16 * scale },
        tone === 'attendance' && { backgroundColor: '#F1F7DC', minHeight: 29 * scale },
        tone === 'confirm' && { backgroundColor: colors.primary, borderRadius: 18 * scale, minHeight: Math.max(44, 58 * scale) },
        disabled && styles.disabled, pressed && !pairedPress && styles.pressed,
        pairedPress && styles.captionBorder, pairedPress && (pressed || pairedPress.active) && styles.captionHighlight,
        style,
      ]}>
      <AppText style={[styles.pillLabel, { fontSize: (tone === 'attendance' ? 15 : 18) * scale },
        tone === 'confirm' && styles.confirmLabel]}>{label}</AppText>
    </Pressable>
  );
}

function HomeArtButton({ label, hitBox, feedback, captionBox, scale, disabled = false, blocked = false, onPress, pairedPress, buttonRef }: {
  label: string;
  hitBox: Box;
  feedback: PressFeedback;
  captionBox?: Box;
  scale: number;
  disabled?: boolean;
  blocked?: boolean;
  onPress: () => void;
  pairedPress?: PairedPress;
  buttonRef?: Ref<View>;
}) {
  const unavailable = disabled || blocked;
  const [x, y, width, height] = hitBox;
  const relative = ([left, top, width, height]: Box): Box => [left - x, top - y, width, height];
  const edge = { ...feedback.edge, box: relative(feedback.edge.box) };
  return (
    <Pressable ref={buttonRef} accessible={!blocked} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable }} disabled={unavailable} focusable={!unavailable}
      pointerEvents={unavailable ? 'none' : 'auto'} onPress={onPress}
      onPressIn={pairedPress && (() => pairedPress.onChange(true))}
      onPressOut={pairedPress && (() => pairedPress.onChange(false))}
      style={[position(x, y, scale), { width: width * scale, height: height * scale }]}>
      {({ pressed }) => <>
        {(pressed || pairedPress?.active) && (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}>
            <IllustrationLayer {...edge} scale={scale} style={styles.pressEdge} />
            <IllustrationLayer source={sparkle} box={relative(feedback.stars[0])} scale={scale} />
            <IllustrationLayer source={smallSparkle} box={relative(feedback.stars[1])} scale={scale} />
          </View>
        )}
        {captionBox && <View pointerEvents="none" style={[styles.pill, position(captionBox[0], captionBox[1], scale), {
          width: captionBox[2] * scale, minHeight: Math.max(44, captionBox[3] * scale),
          paddingHorizontal: 6,
        }, styles.captionBorder, pressed && styles.captionHighlight]}>
          <AppText style={[styles.pillLabel, { fontSize: 18 * scale }]}>{label}</AppText>
        </View>}
      </>}
    </Pressable>
  );
}

function UpcomingNotice({ menu, onClose }: { menu: UpcomingMenu; onClose: () => void }) {
  const title = useRef<Text>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (title.current) AccessibilityInfo.sendAccessibilityEvent(title.current, 'focus');
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      cancelAnimationFrame(frame);
      back.remove();
    };
  }, [onClose]);
  return (
    <ScrollView bounces={false} style={styles.upcomingScreen} contentContainerStyle={styles.upcomingContent}>
      <Image source={menu.image} accessible={false} resizeMode="contain" style={styles.upcomingImage} />
      <AppText ref={title} accessibilityRole="header" style={styles.upcomingTitle}>{menu.title}</AppText>
      <AppText style={styles.upcomingMessage}>준비 중이에요.</AppText>
      <Button label="홈으로 돌아가기" variant="secondary" onPress={onClose} />
    </ScrollView>
  );
}

function AttendanceNotice({ scale, height, onClose }: { scale: number; height: number; onClose: () => void }) {
  const title = useRef<Text>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (title.current) AccessibilityInfo.sendAccessibilityEvent(title.current, 'focus');
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      cancelAnimationFrame(frame);
      back.remove();
    };
  }, [onClose]);

  // 네이티브 Modal 포털 밖에 두어 홈의 개인정보 보호 가림이 팝업에도 그대로 적용된다.
  return (
    <View style={styles.dim} accessibilityViewIsModal importantForAccessibility="yes">
      <View style={[styles.attendancePanel, { width: 470 * scale, height, borderRadius: 27 * scale }]}>
        <ScrollView contentContainerStyle={{ padding: 22 * scale, gap: 10 * scale }}
          bounces={false}>
          <AppText style={[styles.attendanceText, { fontSize: 17 * scale }]}>오늘도 만나서 반가워!</AppText>
          <AppText ref={title} accessibilityRole="header" accessibilityLabel="출석 보상은 준비 중이에요!"
            style={[styles.attendanceTitle, { fontSize: 30 * scale }]}>
            <AppText style={styles.attendanceEmphasis}>{'출석 보상은\n'}</AppText>
            준비 중이에요!
          </AppText>
          <View style={{ height: 278 * scale, marginHorizontal: -22 * scale, overflow: 'hidden' }} pointerEvents="none">
            <View style={{ position: 'absolute', top: -124 * scale }}>
              {attendanceIllustrations.map(art => <IllustrationLayer key={art.box[0] + '-' + art.box[1]} {...art} scale={scale} />)}
            </View>
            <AppText style={[styles.attendanceNote, position(355, 121, scale), { width: 90 * scale, fontSize: 14 * scale }]}>
              {'꾸준히\n놀아줘서\n고마워!'}
            </AppText>
          </View>
          <HomeButton label="확인" onPress={onClose} scale={scale} tone="confirm" />
          <AppText style={[styles.attendanceNote, { fontSize: 14 * scale, paddingVertical: 18 * scale }]}>
            조금만 기다려 주세요. 곧 만나요!
          </AppText>
        </ScrollView>
      </View>
    </View>
  );
}

function HomeTime({ data, scale, openAttendance, attendanceAnchor, attendanceOpen }: {
  data: HomeData;
  scale: number;
  openAttendance: () => void;
  attendanceAnchor: RefObject<View | null>;
  attendanceOpen: boolean;
}) {
  const { serverTime, serviceDate, opensAt, closesAt } = data.availability;
  const [, month, day] = serviceDate.split('-');
  const dateLabel = `${Number(month)}월 ${Number(day)}일 ${weekday.format(new Date(serverTime))}`;
  const closeTime = closesAt.startsWith(serviceDate) ? closesAt.slice(11, 16) : '24:00';

  return (
    <View style={[styles.timeCard, { width: 332 * scale, padding: 20 * scale, borderRadius: 32 * scale, gap: 10 * scale }]}>
      <View style={styles.timeRow}>
        <AppText style={[styles.dateLabel, { fontSize: 17 * scale, color: colors.textPrimary }]}>함께한 시간</AppText>
        <AppText style={[styles.dateLabel, { fontSize: 17 * scale }]}>{dateLabel}</AppText>
      </View>
      <View style={styles.timeRow}>
        <AppText style={[styles.daysTogether, { fontSize: 28 * scale }]}>{data.daysTogether}일째</AppText>
        <HomeButton label="출석 · 준비 중" onPress={openAttendance} scale={scale} tone="attendance"
          buttonRef={attendanceAnchor} blocked={attendanceOpen} />
      </View>
      <View style={[styles.week, { borderRadius: 16 * scale, padding: 8 * scale }]} accessible={false}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {days.map(dayLabel => (
          <View key={dayLabel} style={styles.day}>
            <View style={[styles.dayMarker, { width: 28 * scale, height: 28 * scale }]} />
            <AppText style={[styles.dayLabel, { fontSize: 14 * scale }]}>{dayLabel}</AppText>
          </View>
        ))}
      </View>
      <AppText style={[styles.dateLabel, { fontSize: 15 * scale }]}>
        이용시간 {opensAt.slice(11, 16)}–{closeTime}
      </AppText>
    </View>
  );
}

export function HomeScreen({
  data, talkState, fallback, onTalk, onGuardian, onLogout, onRefresh, logoutDisabled, logoutFeedback,
}: HomeScreenProps) {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [upcomingMenu, setUpcomingMenu] = useState<UpcomingMenu>();
  const [talkPressed, setTalkPressed] = useState(false);
  const closeUpcoming = useCallback(() => setUpcomingMenu(undefined), []);
  const [speechHeight, setSpeechHeight] = useState(0);
  const closeAttendance = useCallback(() => setAttendanceOpen(false), []);
  const attendanceAnchor = useRef<View>(null);
  const menuAnchors = useRef(new Map<UpcomingMenu, View>());
  const returnFocus = useRef<UpcomingMenu | 'attendance' | undefined>(undefined);
  const availableWidth = size.width || window.width;
  const availableHeight = size.height || window.height;
  const scale = Math.min(availableWidth / designWidth, availableHeight / designHeight);
  const attendanceHeight = Math.min(560 * scale + 60 * Math.max(0, window.fontScale - 1), availableHeight - 24);
  const sceneTop = (availableHeight - designHeight * scale) / 2;
  const statusHeight = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 24;
  const controlsTop = Math.max(24 * scale, statusHeight + 5 - sceneTop);
  const hasRoom = data !== undefined;

  useEffect(() => {
    const target = returnFocus.current;
    if (!hasRoom || attendanceOpen || upcomingMenu || !target) return;
    const frame = requestAnimationFrame(() => {
      if (returnFocus.current !== target) return;
      const anchor = target === 'attendance' ? attendanceAnchor.current : menuAnchors.current.get(target);
      if (anchor) {
        returnFocus.current = undefined;
        AccessibilityInfo.sendAccessibilityEvent(anchor, 'focus');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [attendanceOpen, hasRoom, upcomingMenu]);

  if (upcomingMenu) return <UpcomingNotice menu={upcomingMenu} onClose={closeUpcoming} />;

  const backgroundAccessibility = {
    pointerEvents: attendanceOpen ? 'none' : 'auto',
    accessibilityElementsHidden: attendanceOpen,
    importantForAccessibility: attendanceOpen ? 'no-hide-descendants' : 'auto',
  } as const;

  function renderRoom(data: HomeData, talkState: HomeTalkState | 'checking') {
    const talkAllowed = talkState === 'start' || talkState === 'resume';
    const talkLabel = talkState === 'resume' ? '이어하기' : '대화하기';
    const talkPress = { active: talkAllowed && talkPressed, onChange: setTalkPressed };
    const nicknamePrefix = `${data.child.nickname}, `;
    const greeting = data.greeting.startsWith(nicknamePrefix)
      ? `${data.child.nickname},\n${data.greeting.slice(nicknamePrefix.length)}`
      : data.greeting.includes(data.child.nickname) ? data.greeting : `${data.child.nickname}\n${data.greeting}`;
    const largeText = window.fontScale > 1.25;
    const speechWidth = largeText ? 260 : 175;
    let talkNote: string | undefined;
    if (talkState === 'outside') talkNote = '지금은 쉬는 시간! 아침에 이야기하자';
    if (talkState === 'closing') talkNote = '대화를 마무리하고 있어요.';
    if (talkState === 'checking') talkNote = '이용 가능 시간을 확인하고 있어요.';

    return (
      <View {...backgroundAccessibility}
        style={{ width: designWidth * scale, height: designHeight * scale }}>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
          style={StyleSheet.absoluteFill}>
          {homeIllustrations.map(({ source, box, flip }) =>
            <IllustrationLayer key={`${box[0]}-${box[1]}`} source={source} box={box} flip={flip} scale={scale} />)}
          <View style={[position(815, 538, scale), { width: 240 * scale, height: 240 * scale, overflow: 'hidden' }]}>
            <Image source={play} accessible={false} resizeMode="stretch"
              style={[position(-11.52, 0, scale), { width: 262.5 * scale, height: 262.5 * scale }]} />
          </View>
          <IllustrationLayer {...playEdge} scale={scale} />
          <IllustrationLayer source={sparkle} box={[867, 563, 14, 17]} scale={scale} />
          <IllustrationLayer source={sparkle} box={[1032, 576, 14, 17]} scale={scale} />
          <IllustrationLayer source={smallSparkle} box={[840, 580, 11, 14]} scale={scale} flip />
        </View>
        <View style={[position(32, 24, scale), { top: controlsTop }]}>
          <HomeTime data={data} scale={scale} attendanceAnchor={attendanceAnchor} attendanceOpen={attendanceOpen} openAttendance={() => {
            returnFocus.current = 'attendance';
            setAttendanceOpen(true);
          }} />
        </View>
        <View style={[styles.guardianActions, { right: 32 * scale, top: controlsTop }]}>
          <HomeButton label="로그아웃" scale={scale} disabled={logoutDisabled} blocked={attendanceOpen} onPress={onLogout} />
          <HomeButton label="보호자 모드" scale={scale} blocked={attendanceOpen} onPress={onGuardian} style={{ minWidth: 163 * scale }} />
        </View>
        {logoutFeedback && (
          <View style={[styles.logoutFeedback, { right: 32 * scale, top: controlsTop + Math.max(44, 48 * scale) + 4,
            width: 300 * scale }]}>
            <ErrorMessage message={logoutFeedback} />
          </View>
        )}

        <View style={[position(640, 155, scale), { alignItems: 'center', width: 215 * scale, marginLeft: -107.5 * scale }]}>
          <HomeButton label={talkLabel} onPress={onTalk} pairedPress={talkPress}
            disabled={!talkAllowed} blocked={attendanceOpen} scale={scale} />
          {talkState === 'closing' && <HomeButton label="다시 확인" onPress={onRefresh} scale={scale} blocked={attendanceOpen} />}
        </View>
        <HomeArtButton label={`도담이 캐릭터로 ${talkLabel}`} hitBox={[510, 226, 237, 423]}
          feedback={characterFeedback} scale={scale} disabled={!talkAllowed} blocked={attendanceOpen}
          pairedPress={talkPress} onPress={onTalk} />
        <View pointerEvents="none" style={[styles.speech, position(701, 195, scale), {
          width: speechWidth * scale, minHeight: 109 * scale,
          paddingHorizontal: (largeText ? 40 : 22) * scale, paddingVertical: (largeText ? 44 : 24) * scale,
        }]} onLayout={event => setSpeechHeight(event.nativeEvent.layout.height)}>
          <Image source={speech} accessible={false} resizeMode="stretch" style={[
            position(0, 0, scale), { width: speechWidth * scale, height: speechHeight || 109 * scale },
          ]} />
          <AppText style={[styles.greeting, { fontSize: 17 * scale }]}>{greeting}</AppText>
          {talkNote && <AppText style={[styles.availability, { fontSize: 14 * scale }]}>{talkNote}</AppText>}
          {talkState === 'outside' && data.availability.nextOpensAt && (
            <AppText style={[styles.availability, { fontSize: 14 * scale }]}>
              오전 {Number(data.availability.nextOpensAt.slice(11, 13))}시에 만나요
            </AppText>
          )}
        </View>

        {upcomingMenus.map(menu => (
          <HomeArtButton key={menu.title} label={`${menu.title} · 준비 중`}
            hitBox={menu.hitBox} feedback={menu.feedback} captionBox={menu.captionBox} blocked={attendanceOpen}
            buttonRef={anchor => {
              if (anchor) menuAnchors.current.set(menu, anchor);
              else menuAnchors.current.delete(menu);
            }}
            scale={scale} onPress={() => {
              returnFocus.current = menu;
              setUpcomingMenu(menu);
            }} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screen} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      {(data || attendanceOpen) && <Image source={room} accessible={false} style={styles.room} resizeMode="stretch" />}
      {data ? renderRoom(data, talkState) : !attendanceOpen && <View style={styles.fallback}>{fallback}</View>}
      {attendanceOpen && <AttendanceNotice scale={scale} height={attendanceHeight} onClose={closeAttendance} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWarm },
  fallback: { flex: 1, alignSelf: 'stretch' },
  room: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  pill: {
    backgroundColor: colors.surfaceWarm, borderRadius: 99, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.05)',
  },
  pillLabel: { fontFamily: fonts.extraBold, color: '#46250B', textAlign: 'center' },
  confirmLabel: { color: colors.surfaceWhite },
  disabled: { backgroundColor: '#E6DBC9' },
  pressed: { opacity: 0.82 },
  pressEdge: { tintColor: '#FFE7A0' },
  captionBorder: { borderWidth: 2, borderColor: 'transparent' },
  captionHighlight: { borderColor: '#D99639', boxShadow: '0px 0px 8px rgba(255, 218, 130, 0.55)' },
  upcomingScreen: { flex: 1, backgroundColor: colors.surfaceWarm },
  upcomingContent: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24,
  },
  upcomingImage: { width: 168, height: 168 },
  upcomingTitle: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  upcomingMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  timeCard: { backgroundColor: colors.surfaceWarm, boxShadow: '0px 5px 5px rgba(0, 0, 0, 0.05)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  dateLabel: { color: colors.textSecondary, fontFamily: fonts.bold, flexShrink: 1 },
  daysTogether: { color: '#4F971D', fontFamily: fonts.extraBold, flexShrink: 1 },
  week: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF7E7' },
  day: { alignItems: 'center', gap: 4 },
  dayMarker: { backgroundColor: '#F3E7D1', borderRadius: 99 },
  dayLabel: { fontFamily: fonts.regular, color: colors.textPrimary },
  speech: { justifyContent: 'center', gap: 4 },
  greeting: { fontFamily: fonts.extraBold, color: colors.textBubble, textAlign: 'center' },
  availability: { fontFamily: fonts.bold, color: colors.textSecondary, textAlign: 'center' },
  guardianActions: { position: 'absolute', flexDirection: 'row', gap: 10 },
  logoutFeedback: { position: 'absolute', zIndex: 1 },
  dim: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(24, 18, 6, 0.62)',
    alignItems: 'center', justifyContent: 'center', padding: 12,
  },
  attendancePanel: { backgroundColor: '#FCFAF5', maxHeight: '100%', flexShrink: 1, overflow: 'hidden' },
  attendanceText: { color: colors.textPrimary, fontFamily: fonts.bold, textAlign: 'center' },
  attendanceTitle: { color: colors.textPrimary, fontFamily: fonts.extraBold, textAlign: 'center' },
  attendanceEmphasis: { color: '#58B522' },
  attendanceNote: { color: '#3E5728', fontFamily: fonts.bold, textAlign: 'center' },
});

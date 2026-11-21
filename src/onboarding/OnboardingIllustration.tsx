import { Image, type ImageSourcePropType, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '../components/AppText';
import { colors, fonts } from '../theme/tokens';

type Frame = readonly [left: number, top: number, width: number, height: number];

// 그림만 Figma의 상대 좌표로 놓고, 설명과 예시 수치는 글자 배율에 따라 다시 배치한다.
function ArtLayer({ source, frame, scale, flip = false }: {
  source: ImageSourcePropType;
  frame: Frame;
  scale: number;
  flip?: boolean;
}) {
  const [left, top, width, height] = frame;
  return (
    <Image source={source} accessible={false} resizeMode="stretch"
      style={{ position: 'absolute', left: left * scale, top: top * scale,
        width: width * scale, height: height * scale, transform: [{ scaleX: flip ? -1 : 1 }] }} />
  );
}

const activities = [
  {
    label: '사진 보여주기', image: require('../../assets/images/onboarding/activity-photo.png'),
    imageFrame: [0, 0, 200, 200], flip: false,
    outline: require('../../assets/images/onboarding/native/activity-photo-outline.png'),
    outlineFrame: [4.27, 20.14, 192.24, 179.39], x: 20, y: 0, labelY: 130.66,
  },
  {
    label: '캐릭터 꾸미기', image: require('../../assets/images/onboarding/activity-dress-up.png'),
    imageFrame: [0, 0, 200, 200], flip: true,
    outline: require('../../assets/images/onboarding/native/activity-dress-up-outline.png'),
    outlineFrame: [26.25, 2.80, 148.03, 183.88], x: 303, y: 0, labelY: 131,
  },
  {
    label: '같이 놀기', image: require('../../assets/images/onboarding/activity-toys.png'),
    imageFrame: [-9.6, 0, 218.74, 218.74], flip: false,
    outline: require('../../assets/images/onboarding/native/activity-toys-outline.png'),
    outlineFrame: [-6.07, 30.83, 211.55, 165.35], x: 151, y: 158, labelY: 121,
  },
] as const;

function Activities({ scale, reflow }: { scale: number; reflow: boolean }) {
  return (
    <View style={[{ width: 510 * scale }, reflow ? styles.activityList : { height: 358 * scale }]}>
      {activities.map(activity => (
        <View key={activity.label} style={[styles.activity, !reflow && {
          position: 'absolute', left: activity.x * scale, top: activity.y * scale, width: 200 * scale,
        }]}>
          <View style={{ width: 200 * scale, height: 200 * scale }}>
            <View style={[StyleSheet.absoluteFill, styles.crop]}>
              <ArtLayer source={activity.image} scale={scale} flip={activity.flip} frame={activity.imageFrame} />
            </View>
            <ArtLayer source={activity.outline} scale={scale} frame={activity.outlineFrame} />
          </View>
          <View style={[styles.chip, {
            marginTop: reflow ? 0 : (activity.labelY - 200) * scale,
            paddingHorizontal: 13 * scale, paddingVertical: 8 * scale,
          }]}>
            <AppText style={[styles.chipText, { fontSize: 14.65 * scale }]}>{activity.label}</AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

// P0 리포트 통계 열은 길이가 다른 세 라벨에 맞춰 너비가 다르다.
const stats = [
  { label: '오늘 대화', value: '18분', width: 105.97 },
  { label: '이번 주 누적', value: '2시간 48분', width: 125.38 },
  { label: '완료한 놀이/활동', value: '8개', width: 91.04 },
] as const;
const happy = require('../../assets/images/onboarding/native/report-day-happy.png');
const mixed = require('../../assets/images/onboarding/native/report-day-mixed.png');
const empty = require('../../assets/images/onboarding/native/report-day-empty.png');
const days = [
  ['월', '행복', happy], ['화', '행복', happy], ['수', '행복/평온', mixed],
  ['목', '행복', happy], ['금', '행복', happy], ['토', '기록 전', empty], ['일', '기록 전', empty],
] as const;

function ReportExample({ scale, reflow }: { scale: number; reflow: boolean }) {
  const text = (size: number, font: keyof typeof fonts = 'bold', color = '#000000', leading = 1.2) => ({
    fontSize: Math.max(8, size * scale), lineHeight: Math.max(8, size * scale) * leading,
    fontFamily: fonts[font], includeFontPadding: false, color,
  });
  const pillSize = {
    borderWidth: 0.746 * scale, paddingHorizontal: 8.96 * scale, paddingVertical: 3.73 * scale,
  };

  return (
    <View style={[styles.report, {
      width: reflow ? '100%' : 358.21 * scale, minHeight: 300 * scale, marginTop: 3 * scale,
      borderWidth: 0.746 * scale, paddingHorizontal: 17.16 * scale, paddingVertical: 15.67 * scale,
      borderRadius: 20.9 * scale,
    }]}>
      <View style={[styles.row, reflow && styles.stackedRow, { gap: 8.96 * scale }]}>
        <Image source={require('../../assets/images/onboarding/native/report-avatar.png')}
          accessible={false} style={{ width: 35.82 * scale, height: 35.82 * scale }} />
        <View style={[!reflow && styles.flex, { gap: 2.99 * scale }]}>
          <AppText style={text(14.93, 'extraBold')}>도담</AppText>
          <AppText style={text(8.96, 'bold', colors.textPlaceholder)}>만 7세·여아</AppText>
        </View>
        <View style={[styles.pill, pillSize]}>
          <AppText style={text(9.7, 'extraBold', colors.textSignUp, 1.5)}>자세히 보기</AppText>
        </View>
      </View>
      <View testID="onboarding-report-mood" style={[styles.moodBox, {
        marginTop: 14.92 * scale, minHeight: 63.43 * scale, paddingHorizontal: 10.45 * scale,
        paddingVertical: 11.19 * scale, gap: 8.96 * scale, borderRadius: 11.94 * scale,
      }]}>
        <View style={{ width: 29.85 * scale, height: 29.85 * scale }}>
          <ArtLayer scale={scale} frame={[0, 0, 29.85, 29.85]}
            source={require('../../assets/images/onboarding/native/report-face.png')} />
          <ArtLayer scale={scale} frame={[7.46, 11.2, 3.73, 4.48]}
            source={require('../../assets/images/onboarding/native/report-eye.png')} />
          <ArtLayer scale={scale} frame={[17.91, 11.2, 3.73, 4.48]}
            source={require('../../assets/images/onboarding/native/report-eye.png')} />
          <ArtLayer scale={scale} frame={[9.14, 17.73, 10.82, 2.36]}
            source={require('../../assets/images/onboarding/native/report-smile.png')} />
        </View>
        <View style={[styles.flex, { gap: 2.24 * scale }]}>
          <View style={[styles.row, styles.wrap, { gap: 4 * scale }]}>
            <AppText style={[styles.growingText, text(13.43, 'extraBold')]}>행복한 하루에요</AppText>
            <View style={[styles.pill, pillSize, styles.scorePill]}>
              <AppText style={text(8.96, 'bold', '#000000', 1.5)}>긍정 88%</AppText>
            </View>
          </View>
          <AppText style={text(9.7, 'regular', colors.textLabel)}>블록으로 로봇 만든 이야기를 신나게 들려줬어요.</AppText>
        </View>
      </View>
      <View style={[styles.stats, reflow && styles.column, { marginTop: 17.16 * scale }]}>
        {stats.map(({ label, value, width }) => (
          <View key={label} accessible style={[!reflow && { flex: width }, { gap: 2.99 * scale }]}>
            <AppText style={text(8.96, 'bold', colors.textPlaceholder, 1.5)}>{label}</AppText>
            <AppText style={text(14.93, 'extraBold', '#000000', 1.5)}>{value}</AppText>
          </View>
        ))}
      </View>
      <View style={[styles.week, {
        marginTop: 10.45 * scale, borderTopWidth: 0.746 * scale, paddingTop: 8.21 * scale, gap: 8.96 * scale,
      }]}>
        <AppText style={text(8.96, 'bold', '#7A6A55', 1.5)}>최근 7일 감정 변화</AppText>
        <View style={[styles.days, reflow && styles.wrap]}>
          {days.map(([day, label, image]) => (
            <View key={day} accessible accessibilityLabel={`${day}요일, ${label}`}
              style={[styles.day, !reflow && styles.flex]}>
              <AppText style={text(8.21, 'extraBold')}>{day}</AppText>
              <Image source={image} accessible={false}
                style={{ width: 26.47 * scale, height: 25.37 * scale, marginTop: 3.58 * scale }} />
              <AppText style={[styles.dayLabel, text(8.21, 'bold', colors.textPlaceholder), { marginTop: 7.47 * scale }]}>
                {label}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function OnboardingIllustration({ page, width }: { page: 0 | 1 | 2; width: number }) {
  const { fontScale } = useWindowDimensions();
  const scale = width / 510;
  const reflow = fontScale > 1.3 || width < 300;
  if (page === 1) return <Activities scale={scale} reflow={reflow} />;
  if (page === 2) {
    return (
      <View style={{ width, minHeight: 358 * scale }}>
        <ReportExample scale={scale} reflow={reflow} />
      </View>
    );
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width, height: 358 * scale }}>
      <ArtLayer scale={scale} frame={[-7, 7, 330, 329]}
        source={require('../../assets/images/onboarding/girl-thinking.png')} />
      <View style={[styles.crop, {
        position: 'absolute', left: 157 * scale, top: 7 * scale, width: 330 * scale, height: 329 * scale,
      }]}>
        <ArtLayer scale={scale} frame={[-7.82, 0, 345.54, 344.86]}
          source={require('../../assets/images/onboarding/boy-open-arms.png')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  crop: { overflow: 'hidden' },
  activityList: { gap: 12 },
  activity: { alignItems: 'center' },
  chip: { backgroundColor: colors.surfaceWarm, borderRadius: 60, maxWidth: '100%' },
  chipText: { fontFamily: fonts.extraBold, color: '#46250B', textAlign: 'center' },
  report: { alignSelf: 'center', backgroundColor: colors.surfaceWhite, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  stackedRow: { flexDirection: 'column', alignItems: 'flex-start' },
  wrap: { flexWrap: 'wrap' },
  flex: { flex: 1 },
  growingText: { flexGrow: 1, flexShrink: 1 },
  pill: { maxWidth: '100%', flexShrink: 1, borderRadius: 40, borderColor: colors.border, backgroundColor: colors.surfaceWhite },
  moodBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5FDD6' },
  scorePill: { borderColor: '#BEDA58' },
  stats: { flexDirection: 'row' },
  column: { flexDirection: 'column', gap: 6 },
  week: { borderColor: '#F1EADC' },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
  day: { alignItems: 'center', maxWidth: '100%' },
  dayLabel: { textAlign: 'center' },
});

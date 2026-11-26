import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { useEntranceMotion } from '../components/useEntranceMotion';
import { colors, typography } from '../theme/tokens';
import { isChildBirthDate } from './childRegistrationData';

type DateParts = [year: number, month: number, day: number];
const wheelHeight = 48;
const snapQuietTime = 120;
const dateColumns = [['년', 'year'], ['월', 'month'], ['일', 'day']] as const;
const pad = (value: number, length = 2) => String(value).padStart(length, '0');

function formatDate([year, month, day]: DateParts) {
  return [pad(year, 4), pad(month), pad(day)].join('-');
}

function splitDate(value: string): DateParts {
  const [year, month, day] = value.split('-').map(Number);
  return [year, month, day];
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function clampDate([year, month, day]: DateParts, [thisYear, thisMonth, today]: DateParts): DateParts {
  const nextMonth = year === thisYear ? Math.min(month, thisMonth) : month;
  const lastDay = year === thisYear && nextMonth === thisMonth ? today : daysInMonth(year, nextMonth);
  return [year, nextMonth, Math.min(day, lastDay)];
}

export function pickerStartDate(value: string) {
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return isChildBirthDate(value, today) ? value : today;
}

function DateWheel({ label, part, value, max, onChange, onMoving }: {
  label: string; part: string; value: number; max: number; onChange: (value: number) => void; onMoving: (moving: boolean) => void;
}) {
  const list = useRef<FlatList<number>>(null);
  const lastValue = useRef(value);
  const [initialOffset] = useState(() => ({ x: 0, y: (value - 1) * wheelHeight }));
  const values = useMemo(() => Array.from({ length: max }, (_, index) => index + 1), [max]);
  const motion = useRef<'idle' | 'drag' | 'snap' | 'momentum'>('idle');
  const offset = useRef(initialOffset.y);
  const pendingSnap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(pendingSnap.current), []);

  useLayoutEffect(() => {
    // 다른 열이 바뀌어 말일이 줄어든 경우 선택 줄도 함께 맞춘다.
    if (value === lastValue.current) return;
    lastValue.current = value;
    list.current?.scrollToOffset({ offset: (value - 1) * wheelHeight, animated: false });
  }, [value]);

  function settle(position: number) {
    clearTimeout(pendingSnap.current);
    motion.current = 'idle';
    const next = Math.min(max, Math.max(1, Math.round(position / wheelHeight) + 1));
    if (next !== lastValue.current) {
      lastValue.current = next;
      onChange(next);
    }
    onMoving(false);
  }

  function begin(next: 'drag' | 'snap' | 'momentum') {
    clearTimeout(pendingSnap.current);
    motion.current = next;
    onMoving(true);
  }

  function waitForSnap(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offset.current = event.nativeEvent.contentOffset.y;
    clearTimeout(pendingSnap.current);
    // 작은 드래그 뒤 관성 종료 이벤트가 없는 경우에도 정지한 줄을 선택한다.
    pendingSnap.current = setTimeout(() => settle(offset.current), snapQuietTime);
  }

  function select(option: number) {
    const position = (option - 1) * wheelHeight;
    list.current?.scrollToOffset({ offset: position, animated: false });
    settle(position);
  }

  return (
    <View style={styles.column}>
      <AppText style={styles.label}>{label}</AppText>
      <FlatList
        ref={list}
        testID={`child-birth-${part}`}
        data={values}
        initialScrollIndex={Math.max(0, value - 2)}
        contentOffset={initialOffset}
        initialNumToRender={5}
        getItemLayout={(_, index) => ({ length: wheelHeight, offset: index * wheelHeight, index })}
        keyExtractor={String}
        contentContainerStyle={styles.wheelPadding}
        style={styles.wheel}
        bounces={false}
        overScrollMode="never"
        decelerationRate="fast"
        snapToInterval={wheelHeight}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => begin('drag')}
        onScrollEndDrag={event => { begin('snap'); waitForSnap(event); }}
        onScroll={event => { if (motion.current === 'snap') waitForSnap(event); }}
        onMomentumScrollBegin={() => begin('momentum')}
        onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.y)}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${item}`}
            accessibilityState={{ selected: item === value }} onPress={() => select(item)}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
            <AppText style={styles.value}>{pad(item, part === 'year' ? 4 : 2)}</AppText>
          </Pressable>
        )}
      />
    </View>
  );
}

export function BirthDatePicker({ visible, value, onChange, onConfirm, onCancel, returnFocusRef, reduceMotion = true }: {
  visible: boolean; value: string; onChange: (date: string) => void; onConfirm: () => void; onCancel: () => void;
  returnFocusRef: RefObject<View | null>;
  reduceMotion?: boolean;
}) {
  const today = splitDate(pickerStartDate(''));
  const current = splitDate(value);
  const latestValue = useRef(value);
  const movingParts = useRef(new Set<string>());
  const [moving, setMoving] = useState(false);
  const panelMotion = useEntranceMotion(visible, { reduceMotion, duration: 160, fromOpacity: 0.85, enabled: visible });

  useLayoutEffect(() => { latestValue.current = value; }, [value]);
  function cancel() {
    movingParts.current.clear();
    setMoving(false);
    onCancel();
  }

  function reportMotion(part: string, active: boolean) {
    if (active) movingParts.current.add(part);
    else movingParts.current.delete(part);
    setMoving(movingParts.current.size > 0);
  }

  const limits = [today[0], current[0] === today[0] ? today[1] : 12,
    current[0] === today[0] && current[1] === today[1] ? today[2] : daysInMonth(current[0], current[1])];

  return (
    <Dialog visible={visible} title="생년월일 선택" inline scrollable={false} onRequestClose={cancel}
      returnFocusRef={returnFocusRef} panelMotionStyle={panelMotion}
      actions={<View style={styles.actions}>
        <View style={styles.action}><Button label="취소" variant="secondary" onPress={cancel} /></View>
        <View style={styles.action}><Button label="확인" variant="onboarding" disabled={moving}
          onPress={() => { if (movingParts.current.size === 0) onConfirm(); }} /></View>
      </View>}>
      <View style={styles.picker}>
        <View pointerEvents="none" style={styles.highlight} />
        {dateColumns.map(([label, part], index) => (
          <DateWheel key={part} part={part} label={label} value={current[index]} max={limits[index]}
            onMoving={active => reportMotion(part, active)} onChange={option => {
            const next = splitDate(latestValue.current);
            next[index] = option;
            const updated = formatDate(clampDate(next, today));
            latestValue.current = updated;
            onChange(updated);
          }} />
        ))}
      </View>
      <AppText style={styles.selectedDate} accessibilityLiveRegion="polite">{value.replaceAll('-', '.')}</AppText>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  picker: { flexDirection: 'row', backgroundColor: colors.surfaceWhite, borderColor: colors.border,
    borderWidth: 2, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 8 },
  highlight: { position: 'absolute', top: 6 + 36 + wheelHeight, left: 12, right: 12, height: wheelHeight, borderRadius: 12, backgroundColor: '#F1F5E2' },
  column: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  label: { ...typography.label, color: colors.textLabel, minHeight: 36, textAlign: 'center', textAlignVertical: 'center', paddingTop: 6 },
  wheel: { height: wheelHeight * 3, flexGrow: 0 },
  wheelPadding: { paddingVertical: wheelHeight },
  option: { height: wheelHeight, justifyContent: 'center', alignItems: 'center' },
  value: { ...typography.body, color: colors.textLabel },
  pressed: { opacity: 0.65 },
  selectedDate: { ...typography.body, color: colors.textLabel, backgroundColor: colors.surfaceWhite,
    alignSelf: 'center', borderWidth: 2, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});

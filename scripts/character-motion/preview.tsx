import { registerRootComponent } from 'expo';
import { getRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CharacterMotionPlayer, type CharacterMotionState } from '../../src/characterMotion/CharacterMotionPlayer';
import type { SubscribeSpeechLevel } from '../../src/characterMotion/speechMotion';
import { Button } from '../../src/components/Button';
import { useReduceMotion } from '../../src/components/useReduceMotion';
import { colors } from '../../src/theme/tokens';
import { subscribeToAudioLevel } from './previewAudio';

const greeting = require('./fixtures/dodami-greeting-audio.m4a');
const automatic = process.env.EXPO_PUBLIC_CHARACTER_MOTION_AUTO === '1';
const preparation = [
  ['home', '홈 반복'],
  ['listening', '듣기'],
  ['thinking', '대기'],
] as const;
const labels = {
  neutral: '기본 자세',
  home: '홈 반복',
  listening: '듣기',
  thinking: '대기',
  speaking: '말하기',
  ending: '종료',
} satisfies Record<CharacterMotionState, string>;

const subscribeToTestLevels: SubscribeSpeechLevel = (receive) => {
  const start = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - start) % 3200;
    let rms = 0;
    if (elapsed < 800) rms = 0.04;
    else if (elapsed < 1600) rms = 0.12;
    else if (elapsed < 2400) rms = 0.24;
    receive({ rms, receivedAt: now });
  }, 42);
  return () => clearInterval(timer);
};

function CharacterMotionPreview() {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.46, height * 0.86, 620);
  const reduceMotion = useReduceMotion();
  const player = useAudioPlayer(greeting, { updateInterval: 60 });
  const audioStatus = useAudioPlayerStatus(player);
  const [state, setState] = useState<CharacterMotionState>(automatic ? 'home' : 'neutral');
  const [active, setActive] = useState(true);
  const [simulated, setSimulated] = useState(false);
  const [samplingAllowed, setSamplingAllowed] = useState(Platform.OS === 'ios');
  const [sampleCount, setSampleCount] = useState(0);
  const [endCount, setEndCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const pendingPlayback = useRef(0);
  const counter = useRef(0);

  const select = useCallback((next: CharacterMotionState, testLevels = false) => {
    pendingPlayback.current += 1;
    if (player.playing) player.pause();
    setFailed(false);
    setActive(true);
    setSimulated(testLevels);
    setState(next);
  }, [player]);

  const playGreeting = useCallback(async () => {
    select('speaking');
    const request = pendingPlayback.current;
    try {
      const allowed = Platform.OS !== 'android' || (await getRecordingPermissionsAsync()).granted;
      if (pendingPlayback.current !== request) return;
      setSamplingAllowed(allowed);
      counter.current = 0;
      setSampleCount(0);
      await setAudioModeAsync({ playsInSilentMode: true });
      if (pendingPlayback.current !== request) return;
      await player.seekTo(0);
      if (pendingPlayback.current === request) player.play();
    } catch {
      if (pendingPlayback.current === request) setFailed(true);
    }
  }, [player, select]);

  const subscribe: SubscribeSpeechLevel = useCallback((receive) => {
    return subscribeToAudioLevel(player, samplingAllowed, (sample) => {
      counter.current += 1;
      receive(sample);
    });
  }, [player, samplingAllowed]);

  useEffect(() => () => { pendingPlayback.current += 1; }, []);

  useEffect(() => {
    if (!audioStatus.playing) {
      setSampleCount(counter.current);
      return;
    }
    const timer = setInterval(() => setSampleCount(counter.current), 250);
    return () => clearInterval(timer);
  }, [audioStatus.playing]);

  useEffect(() => {
    if (!automatic) return;
    // 홈 반복 경계가 두 번 지난 후 같은 순서로 두 기기를 검증한다.
    const timers = [
      setTimeout(() => select('listening'), 33000),
      setTimeout(() => select('thinking'), 36500),
      setTimeout(() => select('speaking', true), 40000),
      setTimeout(() => { void playGreeting(); }, 44000),
      setTimeout(() => select('ending'), 51500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [playGreeting, select]);

  const stop = () => {
    pendingPlayback.current += 1;
    if (player.playing) player.pause();
    setActive(false);
  };
  const end = () => {
    setEndCount((count) => count + 1);
    setState('neutral');
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.stage, { width: size }]}>
        <CharacterMotionPlayer
          state={state}
          size={size}
          active={active}
          reduceMotion={reduceMotion}
          speech={{
            playing: simulated || (audioStatus.playing && !audioStatus.isBuffering),
            subscribeLevel: simulated ? subscribeToTestLevels : subscribe,
          }}
          onEnd={end}
          onAssetError={() => setFailed(true)}
        />
      </View>
      <ScrollView style={styles.controlsScroll} contentContainerStyle={styles.controls}>
        <Text style={styles.title}>도담이 재생 검증</Text>
        <Text style={styles.status}>
          {active ? labels[state] : '정지'} · 음성 샘플 {sampleCount}회 · 종료 완료 {endCount}회
        </Text>
        {state === 'speaking' && (
          <Text style={styles.status}>
            {simulated ? '시험 음량' : audioStatus.playing ? '인사 음성 재생 중' : '인사 음성 대기'}
            {Platform.OS === 'android' && !simulated && !samplingAllowed ? ' · 파형 권한 없음' : ''}
          </Text>
        )}
        {failed && <Text accessibilityRole="alert" style={styles.status}>재생 오류</Text>}
        <View style={styles.buttons}>
          {preparation.map(([target, label]) => (
            <Button key={target} label={label} variant="secondary" onPress={() => select(target)} />
          ))}
          <Button label="시험 음량" variant="secondary" onPress={() => select('speaking', true)} />
          <Button label="인사 음성" onPress={() => { void playGreeting(); }} />
          <Button label="대화 끝내기" variant="secondary" onPress={() => select('ending')} />
          <Button label="정지" variant="secondary" onPress={stop} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, flexDirection: 'row', padding: 24, gap: 16, backgroundColor: colors.surfaceWarm,
  },
  stage: { justifyContent: 'center', alignItems: 'center' },
  controlsScroll: { flex: 1, minWidth: 0 },
  controls: { flexGrow: 1, justifyContent: 'center', gap: 8, padding: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: 'bold' },
  status: { color: colors.textPrimary, fontSize: 16 },
});

registerRootComponent(CharacterMotionPreview);

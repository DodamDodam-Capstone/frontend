import { Image as ExpoImage } from 'expo-image';
import { useLayoutEffect, useReducer, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import durations from '../../assets/images/conversation-motion/durations-ms.json';
import { useMouthFrame, type SubscribeSpeechLevel } from './speechMotion';

const sources = {
  home: require('../../assets/images/home/dodami-greeting-idle-loop.webp'),
  'listening-enter': require('../../assets/images/conversation-motion/dodami-listening-enter.webp'),
  'listening-hold': require('../../assets/images/conversation-motion/dodami-listening-hold.webp'),
  'listening-exit': require('../../assets/images/conversation-motion/dodami-listening-exit.webp'),
  'thinking-enter': require('../../assets/images/conversation-motion/dodami-thinking-enter.webp'),
  'thinking-hold': require('../../assets/images/conversation-motion/dodami-thinking-hold.webp'),
  'thinking-exit': require('../../assets/images/conversation-motion/dodami-thinking-exit.webp'),
  speaking: require('../../assets/images/conversation-motion/speaking/dodami-speaking-portrait.webp'),
  farewell: require('../../assets/images/conversation-motion/dodami-farewell.webp'),
};
const staticSources = {
  neutral: require('../../assets/images/conversation-motion/dodami-neutral.png'),
  'home-static': require('../../assets/images/home/character.png'),
};
const mouthSources = [
  require('../../assets/images/conversation-motion/speaking/dodami-mouth-f88.png'),
  require('../../assets/images/conversation-motion/speaking/dodami-mouth-f87.png'),
  require('../../assets/images/conversation-motion/speaking/dodami-mouth-f86.png'),
  require('../../assets/images/conversation-motion/speaking/dodami-mouth-f85.png'),
];

export type CharacterMotionState = 'neutral' | 'home' | 'listening' | 'thinking' | 'speaking' | 'ending';

type Props = {
  state: CharacterMotionState;
  size: number;
  active?: boolean;
  reduceMotion?: boolean;
  speech?: { playing: boolean; subscribeLevel?: SubscribeSpeechLevel };
  onEnd?: () => void;
  onAssetError?: () => void;
  accessibilityLabel?: string;
};

type Clip = keyof typeof sources | keyof typeof staticSources;
type Request = { state: CharacterMotionState; reduceMotion: boolean; playing: boolean };
type Playback = Request & {
  clip: Clip;
  identity: number;
  displayedAt?: number;
  ending: boolean;
  failedClip?: Clip;
  ended: boolean;
  errorCount: number;
  endCount: number;
};
type Event =
  | { type: 'request'; request: Request }
  | { type: 'display'; identity: number; now: number }
  | { type: 'finish' | 'error' | 'expire'; identity: number };

const clipDurations: Partial<Record<Clip, number>> = durations;
const afterEnter = {
  'listening-enter': { pose: 'listening', hold: 'listening-hold', exit: 'listening-exit' },
  'thinking-enter': { pose: 'thinking', hold: 'thinking-hold', exit: 'thinking-exit' },
} as const;
const afterHold = {
  'listening-hold': afterEnter['listening-enter'],
  'thinking-hold': afterEnter['thinking-enter'],
} as const;

function requestedClip(request: Request, ending: boolean): Clip {
  if (request.reduceMotion) return request.state === 'home' && !ending ? 'home-static' : 'neutral';
  if (ending) return 'farewell';
  switch (request.state) {
    case 'listening': return 'listening-enter';
    case 'thinking': return 'thinking-enter';
    case 'speaking': return request.playing ? 'speaking' : 'neutral';
    case 'ending': return 'farewell';
    default: return request.state;
  }
}

function show(playback: Playback, clip: Clip): Playback {
  if (playback.clip === clip) return playback;
  return { ...playback, clip, identity: playback.identity + 1, displayedAt: undefined };
}

function complete(playback: Playback): Playback {
  return show({
    ...playback,
    ended: true,
    ending: false,
    endCount: playback.endCount + 1,
  }, 'neutral');
}

function updatePlayback(playback: Playback, event: Event): Playback {
  if (event.type === 'request') {
    const request = event.request;
    const stateChanged = request.state !== playback.state;
    const next = { ...playback, ...request };
    if (next.ended) {
      if (!stateChanged || request.state === 'ending' || next.failedClip) return next;
      next.ended = false;
    }
    next.ending ||= request.state === 'ending';
    const { ending } = next;
    if (ending && (next.reduceMotion || next.failedClip)) return complete(next);
    if (next.failedClip || next.reduceMotion) {
      return show(next, !ending && next.state === 'home' ? 'home-static' : 'neutral');
    }
    if (ending && (next.clip === 'listening-exit' || next.clip === 'thinking-exit')) return next;
    if (next.displayedAt !== undefined && clipDurations[next.clip] !== undefined) return next;
    if (next.clip === 'listening-hold' || next.clip === 'thinking-hold') {
      const pose = afterHold[next.clip];
      return ending || next.state !== pose.pose ? show(next, pose.exit) : next;
    }
    return show(next, requestedClip(next, ending));
  }

  if (playback.ended || event.identity !== playback.identity) return playback;
  if (event.type === 'expire') {
    if (!playback.ending || playback.displayedAt !== undefined) return playback;
    return playback.clip === 'farewell' ? complete(playback) : show(playback, 'farewell');
  }
  if (event.type === 'display') {
    return playback.displayedAt === undefined ? { ...playback, displayedAt: event.now } : playback;
  }
  const { ending } = playback;
  if (event.type === 'error') {
    const failed = { ...playback, failedClip: playback.clip, errorCount: playback.errorCount + 1 };
    if (ending) return complete(failed);
    return show(failed, playback.clip === 'home' ? 'home-static' : 'neutral');
  }
  if (playback.clip === 'farewell') return complete(playback);
  if (playback.clip === 'listening-enter' || playback.clip === 'thinking-enter') {
    const pose = afterEnter[playback.clip];
    return show(playback, ending || playback.state !== pose.pose ? pose.exit : pose.hold);
  }
  return show(playback, requestedClip(playback, ending));
}

function initialPlayback(request: Request): Playback {
  return {
    ...request,
    clip: requestedClip(request, false),
    identity: 0,
    ending: false,
    ended: false,
    errorCount: 0,
    endCount: 0,
  };
}

function placeholderFor(clip: keyof typeof sources) {
  switch (clip) {
    case 'home': return staticSources['home-static'];
    case 'listening-hold':
    case 'listening-exit': return sources['listening-hold'];
    case 'thinking-hold':
    case 'thinking-exit': return sources['thinking-hold'];
    default: return staticSources.neutral;
  }
}

function StaticBody({ clip }: { clip: keyof typeof staticSources }) {
  return <Image
    source={staticSources[clip]}
    testID={`character-motion-${clip}`}
    resizeMode="contain"
    fadeDuration={0}
    style={styles.body}
  />;
}

function ActiveMotion({ state, size, reduceMotion = false, speech, onEnd, onAssetError }: Props) {
  const playing = speech?.playing ?? false;
  const [playback, dispatch] = useReducer(updatePlayback, { state, reduceMotion, playing }, initialPlayback);
  const { clip, displayedAt, ending, endCount, errorCount, identity } = playback;
  const notified = useRef({ end: 0, error: 0 });

  useLayoutEffect(() => {
    dispatch({ type: 'request', request: { state, reduceMotion, playing } });
  }, [state, reduceMotion, playing]);

  useLayoutEffect(() => {
    const duration = clipDurations[clip];
    if (duration === undefined || displayedAt === undefined) return;
    const timer = setTimeout(() => dispatch({ type: 'finish', identity }), Math.max(0, duration - (performance.now() - displayedAt)));
    return () => clearTimeout(timer);
  }, [clip, displayedAt, identity]);

  useLayoutEffect(() => {
    if (!ending || displayedAt !== undefined) return;
    const timer = setTimeout(() => dispatch({ type: 'expire', identity }), 5000);
    return () => clearTimeout(timer);
  }, [ending, displayedAt, identity]);

  useLayoutEffect(() => {
    if (errorCount > notified.current.error) {
      notified.current.error = errorCount;
      onAssetError?.();
    }
    if (endCount > notified.current.end) {
      notified.current.end = endCount;
      onEnd?.();
    }
  }, [endCount, errorCount, onAssetError, onEnd]);

  const speaking = state === 'speaking' && playing && !reduceMotion && !playback.ended && !ending;
  const syncMouth = speaking && (clip === 'speaking' || playback.failedClip === 'speaking');
  const showMouth = syncMouth && (displayedAt !== undefined || playback.failedClip === 'speaking');
  const mouthFrame = useMouthFrame(syncMouth, speech?.subscribeLevel);
  return <>
    {clip === 'neutral' || clip === 'home-static'
      ? <StaticBody clip={clip} />
      : <ExpoImage
          key={identity}
          source={sources[clip]}
          testID={`character-motion-${clip}`}
          contentFit="contain"
          placeholder={placeholderFor(clip)}
          placeholderContentFit="contain"
          autoplay={!clip.endsWith('-hold')}
          useAppleWebpCodec={false}
          onDisplay={() => dispatch({ type: 'display', identity, now: performance.now() })}
          onError={() => dispatch({ type: 'error', identity })}
          style={styles.body}
        />}
    {showMouth && <Image
      source={mouthSources[mouthFrame]}
      testID={`character-motion-mouth-${mouthFrame}`}
      accessible={false}
      fadeDuration={0}
      style={{
        position: 'absolute',
        left: size * 456 / 1024,
        top: size * 378 / 1024,
        width: size * 112 / 1024,
        height: size * 60 / 1024,
      }}
    />}
  </>;
}

export function CharacterMotionPlayer({ active = true, accessibilityLabel = '도담이', ...props }: Props) {
  return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}
    style={{ width: props.size, height: props.size }}>
    {active ? <ActiveMotion {...props} /> : <StaticBody clip={props.state === 'home' ? 'home-static' : 'neutral'} />}
  </View>;
}

const styles = StyleSheet.create({
  body: { width: '100%', height: '100%' },
});

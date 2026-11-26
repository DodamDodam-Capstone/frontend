import { useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Easing, useAnimatedValue } from 'react-native';

type EntranceOptions = {
  reduceMotion: boolean;
  duration: number;
  fromOpacity?: number;
  fromX?: number;
  fromY?: number;
  playOnMount?: boolean;
  enabled?: boolean;
};

type EntranceKey = string | number | boolean;
const easeOut = Easing.out(Easing.cubic);

export function useEntranceMotion(key: EntranceKey, {
  reduceMotion, duration, fromOpacity = 0.84, fromX = 0, fromY = 0, playOnMount = true, enabled = true,
}: EntranceOptions) {
  const previous = useRef<{ key: EntranceKey; enabled: boolean } | null>(null);
  const progress = useAnimatedValue(enabled && playOnMount && !reduceMotion ? 0 : 1);

  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { key, enabled };
    const changed = last ? last.key !== key || !last.enabled : playOnMount;
    if (reduceMotion || !enabled || !changed) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const entrance = Animated.timing(progress, {
      toValue: 1, duration, easing: easeOut, useNativeDriver: true, isInteraction: false,
    });
    entrance.start();
    return () => entrance.stop();
  }, [duration, enabled, key, playOnMount, progress, reduceMotion]);

  const style = useMemo(() => ({
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [fromOpacity, 1] }),
    ...(fromX || fromY ? { transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] }) },
    ] } : {}),
  }), [fromOpacity, fromX, fromY, progress]);

  return enabled && !reduceMotion ? style : undefined;
}

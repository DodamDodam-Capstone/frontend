import { useLayoutEffect, useState } from 'react';

export type MouthFrame = 0 | 1 | 2 | 3;

// receivedAt은 샘플을 처음 받은 시점의 performance.now() 값이다.
export type SubscribeSpeechLevel = (receive: (sample: { rms: number; receivedAt: number }) => void) => () => void;

const frameMs = 42;
const speechPauseMs = 150;
const sampleTimeoutMs = 250;
const openThreshold = 0.023;
const quietThreshold = 0.016;
const silent: { level: number; sampleAt: number; quietSince: number | null } = {
  level: 0,
  sampleAt: -Infinity,
  quietSince: -Infinity,
};

export function useMouthFrame(active: boolean, subscribeLevel?: SubscribeSpeechLevel): MouthFrame {
  const source = active ? subscribeLevel : undefined;
  const [mouth, setMouth] = useState<{ source: typeof source; frame: MouthFrame }>({ source, frame: 0 });
  if (mouth.source !== source) setMouth({ source, frame: 0 });

  useLayoutEffect(() => {
    if (!source) return;

    let subscribed = true;
    let frame: MouthFrame = 0;
    let speech = silent;
    const startedAt = performance.now();
    const unsubscribe = source(({ rms, receivedAt }) => {
      const now = performance.now();
      if (!subscribed || !Number.isFinite(rms) || rms < 0 || !Number.isFinite(receivedAt) ||
          receivedAt < startedAt || receivedAt > now || now - receivedAt > sampleTimeoutMs ||
          receivedAt <= speech.sampleAt) return;

      const stale = now - speech.sampleAt > sampleTimeoutMs;
      const previous = stale ? silent : speech;
      const threshold = !stale && frame > 0 ? quietThreshold : openThreshold;
      // 짧은 강세에 빠르게 반응하고 음절 사이에서는 입을 천천히 좁힌다.
      const smoothingMs = rms > previous.level ? 35 : 80;
      speech = {
        level: rms + (previous.level - rms) * Math.exp((previous.sampleAt - receivedAt) / smoothingMs),
        sampleAt: receivedAt,
        quietSince: rms >= threshold ? null : previous.quietSince ?? receivedAt,
      };
    });

    const timer = setInterval(() => {
      const { level, sampleAt, quietSince } = speech;
      const now = performance.now();
      const speechContinues = now - sampleAt <= sampleTimeoutMs &&
        (quietSince === null || now - quietSince <= speechPauseMs);

      let target: MouthFrame = 0;
      if (speechContinues) {
        target = 1;
        if (level >= (frame >= 2 ? 0.065 : 0.085)) target = 2;
        if (level >= (frame === 3 ? 0.13 : 0.16)) target = 3;
      }
      if (frame === target) return;
      frame = (frame + Math.sign(target - frame)) as MouthFrame;
      setMouth({ source, frame });
    }, frameMs);

    return () => {
      subscribed = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [source]);

  return source && mouth.source === source ? mouth.frame : 0;
}

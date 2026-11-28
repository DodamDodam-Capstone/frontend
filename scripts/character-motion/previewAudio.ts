import type { AudioSample } from 'expo-audio';

import type { SubscribeSpeechLevel } from '../../src/characterMotion/speechMotion';

type SamplePlayer = {
  isAudioSamplingSupported: boolean;
  addListener(event: 'audioSampleUpdate', receive: (sample: AudioSample) => void): { remove: () => void };
  setAudioSamplingEnabled(enabled: boolean): void;
};

export function subscribeToAudioLevel(
  player: SamplePlayer,
  allowed: boolean,
  receive: Parameters<SubscribeSpeechLevel>[0],
): () => void {
  if (!allowed || !player.isAudioSamplingSupported) return () => {};
  let active = true;
  const subscription = player.addListener('audioSampleUpdate', ({ channels }) => {
    const frames = channels[0]?.frames;
    if (!active || !frames?.length) return;
    const power = frames.reduce((sum, frame) => sum + frame * frame, 0) / frames.length;
    if (Number.isFinite(power)) receive({ rms: Math.sqrt(power), receivedAt: performance.now() });
  });
  try {
    player.setAudioSamplingEnabled(true);
  } catch {
    active = false;
    subscription.remove();
  }
  return () => {
    if (!active) return;
    active = false;
    subscription.remove();
    player.setAudioSamplingEnabled(false);
  };
}

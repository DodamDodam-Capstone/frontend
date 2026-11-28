import { describe, expect, it, jest } from '@jest/globals';
import type { AudioSample } from 'expo-audio';

import { subscribeToAudioLevel } from './previewAudio';

function createPlayer() {
  let listener: ((sample: AudioSample) => void) | undefined;
  const remove = jest.fn();
  const player = {
    isAudioSamplingSupported: true,
    setAudioSamplingEnabled: jest.fn<(enabled: boolean) => void>(),
    addListener: jest.fn((_event: 'audioSampleUpdate', callback: (sample: AudioSample) => void) => {
      listener = callback;
      return { remove };
    }),
  };
  const emit = (frames: number[]) => listener?.({ channels: [{ frames }], timestamp: 999 });
  return { emit, player, remove };
}

describe('말하기 시안의 음량 구독', () => {
  it('권한이 없으면 파형을 읽지 않는다', () => {
    const { player } = createPlayer();
    const receive = jest.fn();
    subscribeToAudioLevel(player, false, receive)();
    expect(player.addListener).not.toHaveBeenCalled();
    expect(player.setAudioSamplingEnabled).not.toHaveBeenCalled();
  });

  it('첫 채널 RMS를 단조 시각과 함께 알리고 해제 후 샘플을 무시한다', () => {
    const { emit, player, remove } = createPlayer();
    const receive = jest.fn();
    const clock = jest.spyOn(performance, 'now').mockReturnValue(125);
    const dispose = subscribeToAudioLevel(player, true, receive);
    emit([0.25, -0.25]);
    expect(receive).toHaveBeenCalledWith({ rms: 0.25, receivedAt: 125 });

    dispose();
    dispose();
    emit([0.5]);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(player.setAudioSamplingEnabled.mock.calls).toEqual([[true], [false]]);
    clock.mockRestore();
  });

  it('네이티브 샘플링을 켤 수 없으면 구독을 정리한다', () => {
    const { emit, player, remove } = createPlayer();
    const receive = jest.fn();
    player.setAudioSamplingEnabled.mockImplementationOnce(() => { throw new Error('unavailable'); });
    subscribeToAudioLevel(player, true, receive)();
    emit([0.8]);
    expect(receive).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

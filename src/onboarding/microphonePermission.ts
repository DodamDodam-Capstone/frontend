import type { PermissionResponse } from 'expo-audio';

export type MicrophonePermission = 'granted' | 'requestable' | 'denied' | 'blocked';

function loadAudio(): typeof import('expo-audio') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 안내를 건너뛰면 네이티브 오디오 모듈도 초기화하지 않는다.
  return require('expo-audio');
}

function permissionResult(
  { granted, canAskAgain }: PermissionResponse,
  retryable: 'requestable' | 'denied',
): MicrophonePermission {
  if (granted) return 'granted';
  return canAskAgain ? retryable : 'blocked';
}

export async function getMicrophonePermission(): Promise<MicrophonePermission> {
  return permissionResult(await loadAudio().getRecordingPermissionsAsync(), 'requestable');
}

export async function requestMicrophonePermission(): Promise<MicrophonePermission> {
  return permissionResult(await loadAudio().requestRecordingPermissionsAsync(), 'denied');
}

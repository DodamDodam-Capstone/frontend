import { afterEach, expect, jest, test } from '@jest/globals';
import { PermissionStatus } from 'expo';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

import {
  getMicrophonePermission,
  requestMicrophonePermission,
  type MicrophonePermission,
} from './microphonePermission';

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
}));

const check = jest.mocked(getRecordingPermissionsAsync);
const request = jest.mocked(requestRecordingPermissionsAsync);

afterEach(() => {
  check.mockReset();
  request.mockReset();
});

type PermissionCase = [PermissionStatus, boolean, MicrophonePermission];

test.each<PermissionCase>([
  [PermissionStatus.UNDETERMINED, true, 'requestable'],
  [PermissionStatus.DENIED, true, 'requestable'],
  [PermissionStatus.DENIED, false, 'blocked'],
  [PermissionStatus.GRANTED, true, 'granted'],
])('권한 조회는 %s, canAskAgain=%s 상태를 %s로 반환한다', async (status, canAskAgain, expected) => {
  check.mockResolvedValue({
    status, granted: status === PermissionStatus.GRANTED, canAskAgain, expires: 'never',
  });
  await expect(getMicrophonePermission()).resolves.toBe(expected);
  expect(check).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
});

test.each<PermissionCase>([
  [PermissionStatus.DENIED, true, 'denied'],
  [PermissionStatus.DENIED, false, 'blocked'],
  [PermissionStatus.GRANTED, true, 'granted'],
])('권한 요청은 %s, canAskAgain=%s 결과를 %s로 반환한다', async (status, canAskAgain, expected) => {
  request.mockResolvedValue({
    status, granted: status === PermissionStatus.GRANTED, canAskAgain, expires: 'never',
  });
  await expect(requestMicrophonePermission()).resolves.toBe(expected);
  expect(request).toHaveBeenCalledTimes(1);
  expect(check).not.toHaveBeenCalled();
});

test('네이티브 조회나 요청 실패를 거부 결과로 바꾸지 않는다', async () => {
  const error = new Error('권한 서비스 응답 오류');
  check.mockRejectedValue(error);
  await expect(getMicrophonePermission()).rejects.toBe(error);
  expect(request).not.toHaveBeenCalled();
  request.mockRejectedValue(error);
  await expect(requestMicrophonePermission()).rejects.toBe(error);
});

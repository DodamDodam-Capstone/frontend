import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { MicrophonePermissionActions } from './MicrophonePermissionActions';
import { getMicrophonePermission, requestMicrophonePermission } from './microphonePermission';

jest.mock('./microphonePermission', () => ({
  getMicrophonePermission: jest.fn(),
  requestMicrophonePermission: jest.fn(),
}));

const check = jest.mocked(getMicrophonePermission);
const request = jest.mocked(requestMicrophonePermission);
const setupLabel = '권한 설정 시작하기';
const skipLabel = '다음에 할래요';
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

function mockAppState() {
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  return (...states: AppStateStatus[]) => act(() => {
    for (const state of states) {
      for (const listener of listeners) listener(state);
    }
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  check.mockReset();
  request.mockReset();
});

test('건너뛰면 권한을 조회하거나 요청하지 않는다', async () => {
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(skipLabel);
  expect(check).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledTimes(1);
});

test('이미 허용했다면 권한 설정을 눌렀을 때 바로 완료한다', async () => {
  check.mockResolvedValue('granted');
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  expect(check).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledTimes(1);
});

test('iPad 사전 안내의 선택은 계속 하나이며 시스템 응답 전에 완료하지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  check.mockResolvedValue('requestable');
  request.mockResolvedValue('granted');
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  expect(screen.getByText(/대화 중에만 마이크가 켜져요/)).toBeVisible();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: '계속' })).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  const [modal] = screen.container.queryAll(node => node.type === 'Modal');
  const onDismiss = modal.props.onDismiss;
  await press('계속');
  expect(request).not.toHaveBeenCalled();
  await act(() => { onDismiss(); onDismiss(); });
  expect(request).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledTimes(1);
});

test('Android 앱 안내를 취소하면 권한 요청 없이 돌아가고 이후 시스템 허용으로 완료한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  check.mockResolvedValue('requestable');
  request.mockResolvedValue('granted');
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  await press('취소');
  expect(request).not.toHaveBeenCalled();
  await press(setupLabel);
  await press('허용');
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledTimes(1);
});

test('재요청할 수 있는 거부는 완료하지 않고 사용자 재시도에서 OS 상태를 다시 확인한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  check.mockResolvedValueOnce('requestable').mockResolvedValueOnce('granted');
  request.mockResolvedValue('denied');
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  await press('허용');
  expect(await screen.findByText(/마이크를 허용하지 않았어요/)).toBeVisible();
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: skipLabel })).toBeVisible();
  await press('다시 시도');
  expect(check).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledTimes(1);
});

test.each(['조회', '요청'])('%s 결과가 차단이면 OS 요청을 반복하지 않고 건너뛸 수 있다', async step => {
  jest.replaceProperty(Platform, 'OS', 'android');
  check.mockResolvedValue(step === '조회' ? 'blocked' : 'requestable');
  request.mockResolvedValue('blocked');
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  if (step === '요청') await press('허용');
  expect(await screen.findByText(/기기의 앱 설정에서 켤 수 있어요/)).toBeVisible();
  expect(request).toHaveBeenCalledTimes(step === '요청' ? 1 : 0);
  expect(complete).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  await press(skipLabel);
  expect(complete).toHaveBeenCalledTimes(1);
});

test.each(['조회', '요청'])('%s 오류는 성공으로 표시하지 않고 사용자가 건너뛸 수 있다', async step => {
  jest.replaceProperty(Platform, 'OS', 'android');
  if (step === '조회') check.mockRejectedValue(new Error());
  else check.mockResolvedValue('requestable');
  request.mockRejectedValue(new Error());
  const complete = jest.fn();
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  if (step === '요청') await press('허용');
  expect(await screen.findByText(/마이크 권한을 확인할 수 없어요/)).toBeVisible();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(complete).not.toHaveBeenCalled();
  await press(skipLabel);
  expect(complete).toHaveBeenCalledTimes(1);
});

test('기기 설정에서 돌아와도 차단 상태면 안내를 유지하고, 허용했으면 한 번 완료한다', async () => {
  const changeState = mockAppState();
  const complete = jest.fn();
  check.mockResolvedValueOnce('blocked').mockResolvedValueOnce('blocked').mockResolvedValue('granted');
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await changeState('background', 'active');
  expect(check).not.toHaveBeenCalled();
  await press(setupLabel);
  await changeState('inactive', 'active');
  expect(check).toHaveBeenCalledTimes(1);
  await changeState('background', 'inactive', 'active', 'active');
  expect(check).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/기기의 앱 설정에서 켤 수 있어요/)).toBeVisible();
  expect(complete).not.toHaveBeenCalled();
  await changeState('background', 'active', 'active');
  expect(complete).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledTimes(3);
  expect(request).not.toHaveBeenCalled();
});

test('복귀 조회 도중 다시 설정으로 이동하거나 건너뛰면 늦은 허용 응답을 반영하지 않는다', async () => {
  const changeState = mockAppState();
  const complete = jest.fn();
  let firstGrant!: (value: 'granted') => void;
  let nextGrant!: (value: 'granted') => void;
  check.mockResolvedValueOnce('blocked')
    .mockImplementationOnce(() => new Promise(resolve => { firstGrant = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { nextGrant = resolve; }));
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  await changeState('background', 'active', 'background', 'active');
  expect(check).toHaveBeenCalledTimes(3);
  await act(() => firstGrant('granted'));
  expect(complete).not.toHaveBeenCalled();
  await press(skipLabel);
  await act(() => nextGrant('granted'));
  expect(complete).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
});

test.each(['requestable', 'error'] as const)('복귀 조회 결과가 %s이면 사용자가 다시 시도할 수 있다', async result => {
  const changeState = mockAppState();
  const complete = jest.fn();
  check.mockResolvedValueOnce('blocked');
  if (result === 'error') check.mockRejectedValueOnce(new Error());
  else check.mockResolvedValueOnce(result);
  await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  await changeState('background', 'active');
  const message = result === 'error' ? /마이크 권한을 확인할 수 없어요/ : /마이크를 허용하지 않았어요/;
  expect(screen.getByText(message)).toBeVisible();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(complete).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test.each(['조회', '요청'])('%s 중에 화면을 벗어나면 늦은 허용 응답으로 온보딩을 완료하지 않는다', async step => {
  jest.replaceProperty(Platform, 'OS', 'android');
  let grant!: (value: 'granted') => void;
  const pending = new Promise<'granted'>(resolve => { grant = resolve; });
  if (step === '조회') check.mockReturnValue(pending);
  else check.mockResolvedValue('requestable');
  request.mockReturnValue(pending);
  const complete = jest.fn();
  const { unmount } = await render(<MicrophonePermissionActions onComplete={complete} />);
  await press(setupLabel);
  if (step === '요청') {
    await press('허용');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  }
  await unmount();
  await act(() => grant('granted'));
  expect(complete).not.toHaveBeenCalled();
});

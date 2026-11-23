import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { LoginScreen, type LoginFeedback } from './LoginScreen';

const email = ' guardian+login@example.com ';
const password = ' ';

afterEach(() => { jest.useRealTimers(); });

async function enterCredentials() {
  await fireEvent.changeText(screen.getByLabelText('이메일'), email);
  await fireEvent.changeText(screen.getByLabelText('비밀번호'), password);
}

test('이메일 가입만 연결하고 비밀번호 찾기와 Google은 후속 작업으로 둔다', async () => {
  const submit = jest.fn<() => Promise<LoginFeedback | undefined>>();
  const openSignup = jest.fn();
  await render(<LoginScreen submit={submit} retryAt={undefined} openSignup={openSignup} />);

  expect(screen.getByRole('header', { name: '보호자 로그인' })).toBeVisible();
  expect(screen.getByLabelText('이메일')).toHaveProp('keyboardType', 'email-address');
  expect(screen.getByLabelText('비밀번호')).toHaveProp('secureTextEntry', true);
  expect(screen.getByRole('button', { name: '비밀번호를 잊으셨나요?' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '이메일로 회원 가입' }));
  expect(openSignup).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Google' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /카카오|kakao/i })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

test('처리 중 버튼과 키보드 제출이 겹쳐도 공백 비밀번호를 한 번만 전달한다', async () => {
  let finish!: (feedback: LoginFeedback) => void;
  const held = new Promise<LoginFeedback>((resolve) => { finish = resolve; });
  const submit = jest.fn(() => held);
  await render(<LoginScreen submit={submit} retryAt={undefined} />);
  await enterCredentials();
  const button = screen.getByRole('button', { name: '로그인' });
  const input = screen.getByLabelText('비밀번호');

  await fireEvent(button, 'press');
  expect(button).toBeBusy();
  await fireEvent(input, 'submitEditing');
  await fireEvent.press(button);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith(email, password);

  await act(() => { finish({ message: '이메일 또는 비밀번호를 확인해 주세요.' }); });
  expect(screen.getByRole('alert')).toHaveTextContent('이메일 또는 비밀번호를 확인해 주세요.');
  expect(button).toBeEnabled();
});

test('입력별 오류를 보이게 하고 그 입력을 고치면 해당 오류를 지운다', async () => {
  const submit = jest.fn(async () => ({ message: '입력을 확인해 주세요.', fields: { email: '이메일을 입력해 주세요.' } }));
  await render(<LoginScreen submit={submit} retryAt={undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  const input = screen.getByLabelText('이메일');
  expect(input).toHaveProp('accessibilityHint', '오류: 이메일을 입력해 주세요.');
  await fireEvent.changeText(input, email);
  expect(input).not.toHaveProp('accessibilityHint', '오류: 이메일을 입력해 주세요.');
});

test('재시도 기한이 지나도 사용자 조작까지 제출하지 않는다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-23T04:00:00Z'));
  const submit = jest.fn(async () => undefined);
  await render(<LoginScreen submit={submit} retryAt={Date.now() + 1_000} />);
  await enterCredentials();

  const button = screen.getByRole('button', { name: '로그인' });
  expect(button).toBeDisabled();
  expect(screen.getByRole('alert')).toBeVisible();
  await fireEvent(screen.getByLabelText('비밀번호'), 'submitEditing');
  await act(() => { jest.advanceTimersByTime(1_000); });
  expect(button).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();

  await fireEvent(screen.getByLabelText('비밀번호'), 'submitEditing');
  expect(submit).toHaveBeenCalledTimes(1);
});

test('화면이 교체된 뒤 도착한 이전 오류와 비밀번호를 새 폼에 표시하지 않는다', async () => {
  let finish!: (feedback: LoginFeedback) => void;
  const submit = jest.fn(() => new Promise<LoginFeedback>((resolve) => { finish = resolve; }));
  await render(<LoginScreen key="first" submit={submit} retryAt={undefined} />);
  await enterCredentials();
  await fireEvent.press(screen.getByRole('button', { name: '로그인' }));

  await screen.rerender(<LoginScreen key="second" submit={submit} retryAt={undefined} />);
  await act(() => { finish({ message: '이전 화면의 오류' }); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByLabelText('비밀번호')).toHaveDisplayValue('');
});

test('계정 재확인 뒤 다시 열린 폼은 전달받은 안내만 표시하고 입력을 복원하지 않는다', async () => {
  const submit = jest.fn(async () => undefined);
  await render(<LoginScreen submit={submit} retryAt={undefined}
    initialFeedback={{ message: '로그인이 완료되지 않았어요. 다시 시도해 주세요.' }} />);

  expect(screen.getByRole('alert')).toHaveTextContent('로그인이 완료되지 않았어요. 다시 시도해 주세요.');
  expect(screen.getByLabelText('이메일')).toHaveDisplayValue('');
  expect(screen.getByLabelText('비밀번호')).toHaveDisplayValue('');
  await fireEvent.changeText(screen.getByLabelText('이메일'), email);
  expect(screen.queryByRole('alert')).toBeNull();
});

import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { Platform } from 'react-native';

import { createApiClient, type ApiFetch } from '../api/client';
import { createEmailVerification, type EmailVerificationFlow } from './emailVerification';
import { SignupVerificationScreen } from './SignupVerificationScreen';

function harness() {
  type Snapshot = ReturnType<EmailVerificationFlow['getSnapshot']>;
  let state: Snapshot = { step: 'form', email: '', busy: false };
  const listeners = new Set<() => void>();
  function update(patch: Partial<Snapshot>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  const flow = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setEmail: (email: string) => update({ email, step: 'form' }),
    clearInvalidEmail: () => { if (state.emailFormatError) update({ email: '', emailFormatError: undefined }); },
    openEmail: () => update({ step: 'email' }),
    issue: jest.fn(async () => update({ step: 'code', challengeId: 'challenge', expiresAt: Date.now() + 60_000 })),
    verify: jest.fn(async (_code: string) => update({ step: 'success', expiresAt: undefined, tokenExpiresAt: Date.now() + 60_000 })),
    finish: () => update({ step: 'verified' }),
    closeDialog: () => update({ step: 'form' }),
    syncTime: jest.fn<() => void>(),
    submitSignup: jest.fn(async (_password: string, _confirmation: string) => {}),
  };
  return { flow, update };
}

test('잘못된 이메일은 입력칸 안에 붉게 표시하고 다시 선택하면 입력값을 지운다', async () => {
  const fetchImpl = jest.fn<ApiFetch>();
  const api = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://example.invalid/api/v1' }, { fetchImpl });
  if (!api.ok) throw new Error('Invalid test config');
  const flow = createEmailVerification(api.value, 'SIGNUP');
  await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
  const email = () => screen.getByLabelText('이메일');
  const verify = () => screen.getByRole('button', { name: '인증하기' });
  const invalid = '이메일 주소를 확인해 주세요.';

  await fireEvent.changeText(email(), 'guardian@');
  await fireEvent.press(verify());
  expect(screen.getByPlaceholderText(invalid)).toBe(email());
  expect(email()).toHaveProp('placeholderTextColor', '#BC135D');
  expect(email()).toHaveDisplayValue('');
  expect(screen.queryByText(invalid)).not.toBeOnTheScreen();
  expect(fetchImpl).not.toHaveBeenCalled();

  await userEvent.setup().press(email());
  expect(screen.queryByPlaceholderText(invalid)).not.toBeOnTheScreen();
  expect(email()).toHaveDisplayValue('');
  expect(flow.getSnapshot().email).toBe('');

  await fireEvent.changeText(email(), 'invalid');
  await fireEvent.press(verify());
  expect(screen.getByPlaceholderText(invalid)).toBe(email());
  await fireEvent(email(), 'focus');
  expect(screen.queryByPlaceholderText(invalid)).not.toBeOnTheScreen();
  expect(email()).toHaveDisplayValue('');

  await fireEvent.changeText(email(), 'guardian@example.test');
  await userEvent.setup().press(email());
  expect(email()).toHaveDisplayValue('guardian@example.test');
  await fireEvent.press(verify());
  expect(screen.getByRole('header', { name: '이메일 인증' })).toBeVisible();
});

test('주소 확인과 발송을 분리하고 선행 0을 보존한 인증 결과를 가입 화면으로 넘긴다', async () => {
  const { flow } = harness();
  const back = jest.fn();
  await render(<SignupVerificationScreen flow={flow} onBack={back} />);
  expect(screen.getByRole('header', { name: '보호자 계정 만들기' })).toBeVisible();
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
  expect(screen.getByLabelText('비밀번호')).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'guardian@example.org');
  await fireEvent.press(screen.getByRole('button', { name: '인증하기' }));
  expect(flow.issue).not.toHaveBeenCalled();
  expect(screen.getByRole('header', { name: '이메일 인증' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
  const input = screen.getByLabelText('인증번호 6자리');
  await fireEvent.changeText(input, '01234');
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  await fireEvent.changeText(input, '012345');
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(flow.verify).toHaveBeenCalledWith('012345');
  expect(screen.getByRole('header', { name: '이메일 인증 완료' })).toBeVisible();
  expect(flow.submitSignup).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '비밀번호 설정하기' }));
  expect(screen.getByText('이메일 인증이 완료되었어요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
  expect(screen.getByLabelText('비밀번호')).toBeEnabled();
  expect(flow.submitSignup).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));
  expect(back).toHaveBeenCalledTimes(1);
});

test('비밀번호를 보안 입력하며 확인 오류와 이메일 변경에 따른 초기화를 표시한다', async () => {
  const { flow, update } = harness();
  update({ step: 'verified', email: 'guardian@example.test', tokenExpiresAt: Date.now() + 60_000 });
  await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
  const password = screen.getByLabelText('비밀번호');
  expect(password).toHaveProp('secureTextEntry', true);
  expect(password).toHaveProp('submitBehavior', 'submit');
  const original = ' 한🙂' + 'a'.repeat(11) + ' ';
  await fireEvent.changeText(password, original);
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), original.trim());
  expect(screen.getByText(/비밀번호가 일치하지 않아요/)).toBeVisible();
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('비밀번호 확인'), original);
  await fireEvent.press(screen.getByRole('button', { name: '계정 만들기' }));
  expect(flow.submitSignup).toHaveBeenCalledWith(original, original);
  await fireEvent.changeText(screen.getByLabelText('이메일'), 'another@example.test');
  expect(screen.getByLabelText('비밀번호')).toHaveDisplayValue('');
  expect(screen.getByLabelText('비밀번호 확인')).toHaveDisplayValue('');
  expect(screen.getByRole('button', { name: '계정 만들기' })).toBeDisabled();
});

test('iOS 가입 폼은 키보드 영역을 조정하고 내용이 다 보이면 튕기지 않는다', async () => {
  const { flow } = harness();
  await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
  const formScroll = screen.getByTestId('signup-form-scroll');
  expect(formScroll).toHaveProp('automaticallyAdjustKeyboardInsets', true);
  expect(formScroll).toHaveProp('bounces', false);
  expect(formScroll).not.toHaveProp('scrollEnabled', false);
});

test('Android 가입 폼에는 iOS 키보드 인셋을 적용하지 않는다', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const { flow } = harness();
    await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
    expect(screen.getByTestId('signup-form-scroll')).toHaveProp('automaticallyAdjustKeyboardInsets', false);
  } finally {
    platform.restore();
  }
});

test('기한과 요청 제한에 맞춰 확인·재전송을 막고 새 요청 ID에서 이전 입력을 지운다', async () => {
  const { flow, update } = harness();
  update({ step: 'code', email: 'guardian@example.org', challengeId: 'old', expiresAt: Date.now() + 60_000 });
  await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('인증번호 6자리'), '012345');
  await act(() => update({ challengeId: 'new', expiresAt: Date.now() + 30_000 }));
  expect(screen.getByLabelText('인증번호 6자리')).toHaveDisplayValue('');
  await fireEvent.changeText(screen.getByLabelText('인증번호 6자리'), '123456');
  await act(() => update({ issueRetryAt: Date.now() + 5_000, message: '잠시 기다려 주세요.' }));
  expect(screen.getByRole('button', { name: '인증번호 재전송' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '확인' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('잠시 기다려 주세요.');
  await act(() => update({ issueRetryAt: undefined, verifyRetryAt: Date.now() + 4_000 }));
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '인증번호 재전송' })).toBeEnabled();
  await act(() => update({ verifyRetryAt: undefined, expiresAt: Date.now() - 10 }));
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '인증번호 재전송' })).toBeEnabled();
});

test('Android는 실제 OTP 입력을 보존하고 번호 칸에 네이티브 장식을 겹쳐 그리지 않는다', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const { flow, update } = harness();
    update({ step: 'code', email: 'guardian@example.org', challengeId: 'active', expiresAt: Date.now() + 60_000 });
    await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
    const input = screen.getByLabelText('인증번호 6자리');
    expect(input).toHaveProp('keyboardType', 'number-pad');
    expect(input).toHaveProp('underlineColorAndroid', 'transparent');
    expect(input).toHaveStyle({ fontSize: 1, color: 'transparent' });
    await fireEvent.changeText(input, '012345');
    await fireEvent.press(screen.getByRole('button', { name: '확인' }));
    expect(flow.verify).toHaveBeenCalledWith('012345');
  } finally {
    platform.restore();
  }
});

test('iPad는 이메일용 키보드에서 숫자·기호 키보드로 전환하고 인증번호에 숫자만 받는다', async () => {
  if (Platform.OS !== 'ios') throw new Error('iOS 테스트 환경이 필요합니다.');
  const tablet = jest.spyOn(Platform, 'isPad', 'get').mockReturnValue(true);
  try {
    const { flow } = harness();
    await render(<SignupVerificationScreen flow={flow} onBack={jest.fn()} />);
    const email = screen.getByLabelText('이메일');
    expect(email).toHaveProp('keyboardType', 'email-address');
    await fireEvent.changeText(email, 'guardian@example.org');
    await fireEvent.press(screen.getByRole('button', { name: '인증하기' }));
    await fireEvent.press(screen.getByRole('button', { name: '인증번호 받기' }));
    const code = screen.getByLabelText('인증번호 6자리');
    expect(code).toHaveProp('keyboardType', 'numbers-and-punctuation');
    expect(code).toHaveProp('textContentType', 'oneTimeCode');
    await fireEvent.changeText(code, '01');
    await fireEvent.changeText(code, '01#');
    expect(code).toHaveDisplayValue('01');
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
    await fireEvent.changeText(code, '012345');
    await fireEvent.press(screen.getByRole('button', { name: '확인' }));
    expect(flow.verify).toHaveBeenCalledWith('012345');
  } finally {
    tablet.mockRestore();
  }
});

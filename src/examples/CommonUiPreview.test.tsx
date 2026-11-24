import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { Dimensions, Platform, TextInput } from 'react-native';

import { CommonUiPreview } from './CommonUiPreview';

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
const resizeText = (fontScale: number) => act(() => {
  Dimensions.set({ window: { ...originalWindow, fontScale } });
});
afterEach(async () => {
  await act(() => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  jest.restoreAllMocks();
});

test('예제는 입력→로딩→오류→명시적 재시도 흐름에서 입력을 보존한다', async () => {
  await render(<CommonUiPreview />);
  const disabledInputHint = '사용할 수 있는 입력은 화면 위쪽에 있어요.';
  expect(screen.getByText(disabledInputHint)).toBeVisible();
  expect(screen.getByHintText(disabledInputHint)).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('시험 입력'), '가상 이름');
  await fireEvent.press(screen.getByRole('button', { name: '예제 시작' }));

  expect(screen.getByRole('progressbar', { name: '입력 내용을 확인하고 있어요', busy: true })).toBeVisible();
  expect(screen.getByLabelText('시험 입력')).toBeDisabled();
  expect(screen.queryByRole('alert')).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: '오류 상태 보기' }));
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByLabelText('시험 입력')).toHaveDisplayValue('가상 이름');
  expect(screen.getByText('재시도 실행 횟수: 0')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.getByText('재시도 실행 횟수: 1')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('progressbar')).toBeVisible();
});

test('모달이 열리면 배경 동작은 접근성 탐색에서 제외되고 닫으면 돌아온다', async () => {
  await render(<CommonUiPreview />);
  await fireEvent.press(screen.getByRole('button', { name: '모달 열기' }));

  expect(screen.queryByRole('button', { name: '기본 버튼' })).toBeNull();
  expect(screen.getByLabelText('모달 시험 입력')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));

  expect(screen.getByRole('button', { name: '기본 버튼' })).toBeVisible();
  expect(screen.queryByLabelText('모달 시험 입력')).toBeNull();
});

test('입력 모달을 닫을 때 로딩 중에는 복귀를 건너뛰고 오류 상태에서는 시험 입력에 복귀를 요청한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
  await render(<CommonUiPreview />);
  await fireEvent.changeText(screen.getByLabelText('시험 입력'), '가상 이름');
  await fireEvent.press(screen.getByRole('button', { name: '예제 시작' }));

  const closeInputDialog = async () => {
    await fireEvent.press(screen.getByRole('button', { name: '모달 열기' }));
    const [modal] = screen.container.queryAll((element) => element.type === 'Modal');
    const onDismiss = modal.props.onDismiss;
    await fireEvent.press(screen.getByRole('button', { name: '확인하고 닫기' }));
    await act(() => onDismiss());
  };

  await closeInputDialog();
  expect(focus).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: '오류 상태 보기' }));
  await closeInputDialog();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus.mock.contexts[0]).toMatchObject({ props: { accessibilityLabel: '시험 입력' } });
  expect(screen.getByLabelText('시험 입력')).toHaveDisplayValue('가상 이름');
});

test('안내 모달은 터치 한 번에 한 번 열리고 확인 또는 닫기로 돌아온다', async () => {
  const user = userEvent.setup();
  await render(<CommonUiPreview />);
  await user.press(screen.getByRole('button', { name: '안내 모달 열기' }));

  expect(screen.getByRole('header', { name: '안내 모달 확인' })).toBeVisible();
  expect(screen.queryByLabelText('모달 시험 입력')).toBeNull();
  expect(screen.queryByRole('button', { name: '안내 모달 열기' })).toBeNull();
  await user.press(screen.getByRole('button', { name: '확인하고 닫기' }));
  expect(screen.getByText('안내 모달 열린 횟수: 1')).toBeVisible();

  await user.press(screen.getByRole('button', { name: '안내 모달 열기' }));
  await user.press(screen.getByRole('button', { name: '닫기' }));
  expect(screen.getByText('안내 모달 열린 횟수: 2')).toBeVisible();
});

test('iOS 확대 뒤 예제를 시작해도 입력 host·값과 버튼 host·실행 횟수를 보존한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await resizeText(1);
  await render(<CommonUiPreview />);
  const input = screen.getByLabelText('시험 입력');
  const button = screen.getByRole('button', { name: '기본 버튼' });
  const title = screen.getByRole('header', { name: '공통 UI 상태 확인' });
  await fireEvent.changeText(input, '보존할 가상 값');
  await fireEvent.press(button);
  await resizeText(2);
  expect(screen.getByRole('header', { name: '공통 UI 상태 확인' })).not.toBe(title);
  expect(screen.getByLabelText('시험 입력')).toBe(input);
  expect(input).toHaveDisplayValue('보존할 가상 값');
  expect(screen.getByRole('button', { name: '기본 버튼' })).toBe(button);
  expect(screen.getByText('실행 횟수: 1')).toBeVisible();
  expect(screen.getByText('재시도 실행 횟수: 0')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '예제 시작' }));
  expect(input).toHaveDisplayValue('보존할 가상 값');
  expect(input).toBeDisabled();
  expect(screen.getByRole('progressbar')).toBeVisible();
});

test('모달이 열린 채 배율을 왕복 변경해도 모달·입력·닫기 버튼은 유지된다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await resizeText(1);
  await render(<CommonUiPreview />);
  await fireEvent.press(screen.getByRole('button', { name: '모달 열기' }));
  const input = screen.getByLabelText('모달 시험 입력');
  const close = screen.getByRole('button', { name: '닫기' });
  const title = screen.getByRole('header', { name: '공통 모달 확인' });
  await fireEvent.changeText(input, '모달 가상 값');
  await resizeText(2);
  expect(screen.getByRole('header', { name: '공통 모달 확인' })).not.toBe(title);
  await resizeText(1);
  expect(screen.getByLabelText('모달 시험 입력')).toBe(input);
  expect(input).toHaveDisplayValue('모달 가상 값');
  expect(screen.getByRole('button', { name: '닫기' })).toBe(close);
  expect(screen.queryByRole('button', { name: '기본 버튼' })).toBeNull();
  await fireEvent.press(close);
  expect(screen.getByRole('button', { name: '기본 버튼' })).toBeVisible();
});

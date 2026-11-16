import { expect, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CommonUiPreview } from './CommonUiPreview';

test('예제는 입력→로딩→오류→명시적 재시도 흐름에서 입력을 보존한다', async () => {
  await render(<CommonUiPreview />);
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

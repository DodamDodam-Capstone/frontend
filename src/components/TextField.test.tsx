import { useState } from 'react';
import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { TextField } from './TextField';

test('보이는 라벨로 입력을 찾고 공백을 포함한 입력값을 그대로 전달한다', async () => {
  function Example() {
    const [value, setValue] = useState('');
    return <TextField label="이름" value={value} onChangeText={setValue} />;
  }
  await render(<Example />);
  expect(screen.getByText('이름')).toBeVisible();

  await userEvent.setup().type(screen.getByLabelText('이름'), '  demo  ');

  expect(screen.getByLabelText('이름')).toHaveDisplayValue('  demo  ');
});

test('비활성 입력은 편집과 변경 콜백을 차단한다', async () => {
  const onChangeText = jest.fn();
  await render(<TextField label="이름" value="기존 값" disabled onChangeText={onChangeText} />);

  await fireEvent.changeText(screen.getByLabelText('이름'), '바뀐 값');

  expect(onChangeText).not.toHaveBeenCalled();
  expect(screen.getByLabelText('이름')).toBeDisabled();
  expect(screen.getByLabelText('이름')).toHaveDisplayValue('기존 값');
});

test('오류가 있으면 도움말 대신 오류를 보이고 포커스 중에도 안내를 유지한다', async () => {
  const onFocus = jest.fn();
  await render(<TextField label="이메일" value="" onChangeText={() => {}}
    helperText="이메일을 입력하세요" error="입력 내용을 확인해 주세요" onFocus={onFocus} />);

  await fireEvent(screen.getByLabelText('이메일'), 'focus');

  expect(onFocus).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('이메일을 입력하세요')).toBeNull();
  expect(screen.getByText('오류: 입력 내용을 확인해 주세요')).toBeVisible();
  expect(screen.getByLabelText('이메일')).toHaveProp('accessibilityHint', '오류: 입력 내용을 확인해 주세요');
});

test('비밀번호 입력값은 안내 문구로 복사하지 않고 숨김 입력을 사용한다', async () => {
  await render(<TextField label="비밀번호" value="test-only-password" onChangeText={() => {}} secureTextEntry />);

  expect(screen.getByLabelText('비밀번호')).toHaveProp('secureTextEntry', true);
  expect(screen.queryByText('test-only-password')).toBeNull();
  expect(screen.getByLabelText('비밀번호')).not.toHaveProp('accessibilityHint', 'test-only-password');
});

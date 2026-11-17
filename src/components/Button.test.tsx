import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { Button } from './Button';

test('사용 가능한 버튼을 누르면 호출자의 동작을 한 번 실행한다', async () => {
  const onPress = jest.fn();
  await render(<Button label="계속하기" onPress={onPress} />);

  await userEvent.setup().press(screen.getByRole('button', { name: '계속하기' }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each([
  { disabled: true, loading: false },
  { disabled: false, loading: true },
  { disabled: true, loading: true },
])('비활성/로딩 조합 %j에서는 누르기를 전달하지 않고 이름을 유지한다', async (state) => {
  const onPress = jest.fn();
  await render(<Button label="다시 시도" onPress={onPress} {...state} />);
  const button = screen.getByRole('button', { name: '다시 시도' });

  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
  expect(screen.getByRole('button', { name: '다시 시도', busy: state.loading })).toBe(button);
});

test('로딩이 끝나면 같은 이름의 버튼을 다시 사용할 수 있다', async () => {
  const onPress = jest.fn();
  await render(<Button label="확인" loading onPress={onPress} />);
  await screen.rerender(<Button label="확인" onPress={onPress} />);

  await fireEvent.press(screen.getByRole('button', { name: '확인' }));

  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '확인' })).toBeEnabled();
});

import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, View } from 'react-native';

import { BirthDatePicker } from './BirthDatePicker';

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('세 휠을 스크롤해 날짜를 고르고 확인할 때만 날짜를 확정한다', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-25T03:00:00Z'));
  const onChange = jest.fn<(date: string) => void>();
  const onConfirm = jest.fn();
  const props = {
    visible: true, onChange, onConfirm, onCancel: jest.fn(), returnFocusRef: { current: null },
  };
  await render(<BirthDatePicker {...props} value="2020-02-29" />);

  async function scroll(wheel: string, index: number) {
    const column = screen.getByTestId(`child-birth-${wheel}`);
    await fireEvent(column, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 48 * index } } });
  }

  await scroll('year', 2018);
  expect(onChange).toHaveBeenLastCalledWith('2019-02-28');
  await screen.rerender(<BirthDatePicker {...props} value="2019-02-28" />);
  await scroll('month', 2);
  expect(onChange).toHaveBeenLastCalledWith('2019-03-28');
  await screen.rerender(<BirthDatePicker {...props} value="2019-03-28" />);
  await scroll('day', 24);
  expect(onChange).toHaveBeenLastCalledWith('2019-03-25');
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('KST 오늘을 넘는 월과 일로 스크롤해도 마지막 유효 값까지만 선택된다', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-24T15:00:00Z'));
  const onChange = jest.fn<(date: string) => void>();
  const props = {
    visible: true, onChange, onConfirm: jest.fn(), onCancel: jest.fn(), returnFocusRef: { current: null },
  };
  await render(<BirthDatePicker {...props} value="2026-10-30" />);
  await fireEvent(screen.getByTestId('child-birth-month'), 'scrollEndDrag', {
    nativeEvent: { contentOffset: { x: 0, y: 48 * 11 } },
  });
  await act(() => { jest.advanceTimersByTime(150); });
  expect(onChange).toHaveBeenLastCalledWith('2026-11-25');
});

test('연도 휠 관성이 끝나기 전에는 확인과 윤일 보정을 보류한다', async () => {
  jest.useFakeTimers();
  const onChange = jest.fn<(date: string) => void>();
  const onConfirm = jest.fn();
  await render(<BirthDatePicker visible value="2020-02-29" onChange={onChange}
    onConfirm={onConfirm} onCancel={jest.fn()} returnFocusRef={{ current: null }} />);
  const year = screen.getByTestId('child-birth-year');
  const position = (value: number) => ({ nativeEvent: { contentOffset: { x: 0, y: 48 * (value - 1) } } });

  await fireEvent(year, 'scrollBeginDrag', position(2020));
  await fireEvent(year, 'scrollEndDrag', position(2021));
  await fireEvent(year, 'momentumScrollBegin', position(2021));
  await act(() => { jest.advanceTimersByTime(200); });
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();

  await fireEvent(year, 'momentumScrollEnd', position(2024));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('2024-02-29');
  expect(screen.getByRole('button', { name: '확인' })).toBeEnabled();
});

test('선택창을 네이티브 모달로 띄우지 않고 보호 화면 안에 렌더링한다', async () => {
  const modalHost = (instance: { type: string }) => instance.type === 'Modal' || instance.type === 'RCTModalHostView';
  const nativeModal = await render(<Modal visible><View /></Modal>);
  expect(nativeModal.container.queryAll(modalHost)).not.toHaveLength(0);
  await nativeModal.unmount();
  const { root } = await render(<View testID="protected-entry">
    <BirthDatePicker visible value="2020-02-29" onChange={jest.fn()} onConfirm={jest.fn()}
      onCancel={jest.fn()} returnFocusRef={{ current: null }} />
  </View>);
  expect(screen.getByTestId('protected-entry')).toContainElement(screen.getByRole('header', { name: '생년월일 선택' }));
  expect(root?.queryAll(modalHost)).toEqual([]);
});

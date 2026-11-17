import { createRef, useRef, useState } from 'react';
import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Text, TextInput } from 'react-native';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextField } from './TextField';

afterEach(() => { jest.restoreAllMocks(); });

test('닫힌 모달은 내용과 닫기 동작을 노출하지 않는다', async () => {
  await render(<Dialog visible={false} title="확인 안내" onRequestClose={() => {}}><Text>본문</Text></Dialog>);

  expect(screen.queryByRole('header', { name: '확인 안내' })).toBeNull();
  expect(screen.queryByText('본문')).toBeNull();
});

test('열린 모달의 X와 OS 닫기 요청은 같은 콜백으로 전달한다', async () => {
  const onRequestClose = jest.fn();
  await render(<Dialog visible title="확인 안내" onRequestClose={onRequestClose}><Text>본문</Text></Dialog>);

  expect(screen.getByRole('header', { name: '확인 안내' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
  await fireEvent(screen.root!, 'requestClose');

  expect(onRequestClose).toHaveBeenCalledTimes(2);
});

test('모달 본문의 입력·액션은 호출자가 소유하고 닫으면 내용을 제거한다', async () => {
  function Example() {
    const [visible, setVisible] = useState(true);
    const [value, setValue] = useState('');
    const inputRef = useRef<TextInput>(null);
    return <Dialog visible={visible} title="내용 입력" onRequestClose={() => setVisible(false)} initialFocusRef={inputRef}
      actions={<Button label="확인" onPress={() => setVisible(false)} />}>
      <TextField ref={inputRef} label="시험 값" value={value} onChangeText={setValue} />
    </Dialog>;
  }
  await render(<Example />);
  await fireEvent.changeText(screen.getByLabelText('시험 값'), '가상 값');
  expect(screen.getByLabelText('시험 값')).toHaveDisplayValue('가상 값');

  await fireEvent.press(screen.getByRole('button', { name: '확인' }));

  expect(screen.queryByLabelText('시험 값')).toBeNull();
});

test('onShow에서 현재 입력 ref의 포커스를 요청하고 제거된 ref는 건너뛴다', async () => {
  // OS 포커스 이동 자체는 native에서 확인하며 여기서는 요청 대상/수명만 검사한다.
  const focus = jest.fn();
  const initialFocusRef = { current: { focus } };
  await render(<Dialog visible title="입력" initialFocusRef={initialFocusRef} onRequestClose={() => {}} />);

  await fireEvent(screen.root!, 'show');
  expect(focus).toHaveBeenCalledTimes(1);

  await screen.rerender(<Dialog visible title="입력" initialFocusRef={createRef()} onRequestClose={() => {}} />);
  await fireEvent(screen.root!, 'show');
  expect(focus).toHaveBeenCalledTimes(1);
});

test('iOS dismiss가 늦게 와도 다시 열린 모달에서 배경으로 포커스를 빼앗지 않는다', async () => {
  const focus = jest.fn();
  const returnFocusRef = { current: { focus } };
  await render(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  const modal = screen.root!;
  const onDismiss = modal.props.onDismiss;

  await screen.rerender(<Dialog visible={false} title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await screen.rerender(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await act(() => onDismiss());

  expect(focus).not.toHaveBeenCalled();
});

test('Android 닫힘은 iOS 전용 onDismiss 없이 복귀 포커스를 요청한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const focus = jest.fn();
  const returnFocusRef = { current: { focus } };
  const frames: FrameRequestCallback[] = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  await render(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);

  await screen.rerender(<Dialog visible={false} title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await act(() => { frames.forEach((callback) => callback(0)); });

  expect(focus).toHaveBeenCalledTimes(1);
});

test('iOS 닫힘 완료 때 복귀 대상이 사라졌으면 포커스를 요청하지 않는다', async () => {
  const focus = jest.fn();
  const returnFocusRef: { current: { focus: () => void } | null } = { current: { focus } };
  await render(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  const onDismiss = screen.root!.props.onDismiss;
  await screen.rerender(<Dialog visible={false} title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  returnFocusRef.current = null;

  await act(() => onDismiss());

  expect(focus).not.toHaveBeenCalled();
});

test('Android 버튼 복귀는 취소 가능한 경로를 쓰고 재열림 때 대기를 정리한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const cancel = jest.fn();
  const requestKeyboardFocus = jest.fn(() => cancel);
  const focus = jest.fn();
  const returnFocusRef = { current: { focus, requestKeyboardFocus } };
  const frames: FrameRequestCallback[] = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  await render(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await screen.rerender(<Dialog visible={false} title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await act(() => { frames.forEach((callback) => callback(0)); });
  expect(requestKeyboardFocus).toHaveBeenCalledTimes(1);
  expect(focus).not.toHaveBeenCalled();
  await screen.rerender(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('초기 버튼의 대기는 모달 닫힘과 unmount에서 정리한다', async () => {
  const cancel = jest.fn();
  const initialFocusRef = { current: { focus: jest.fn(), requestKeyboardFocus: jest.fn(() => cancel) } };
  await render(<Dialog visible title="안내" initialFocusRef={initialFocusRef} onRequestClose={() => {}} />);
  await fireEvent(screen.root!, 'show');
  await screen.rerender(<Dialog visible={false} title="안내" initialFocusRef={initialFocusRef} onRequestClose={() => {}} />);
  expect(cancel).toHaveBeenCalledTimes(1);
  await screen.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('이전 iOS dismiss는 다시 열린 모달의 초기 버튼 대기를 취소하지 않는다', async () => {
  const cancel = jest.fn();
  const initialFocusRef = { current: { focus: jest.fn(), requestKeyboardFocus: jest.fn(() => cancel) } };
  const returnFocusRef = { current: { focus: jest.fn() } };
  await render(<Dialog visible title="안내" initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  const oldDismiss = screen.root!.props.onDismiss;
  await screen.rerender(<Dialog visible={false} title="안내" initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await screen.rerender(<Dialog visible title="안내" initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await fireEvent(screen.root!, 'show');
  await act(() => oldDismiss());
  expect(cancel).not.toHaveBeenCalled();
});

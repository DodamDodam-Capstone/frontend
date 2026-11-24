import { createRef, useRef, useState } from 'react';
import { afterEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text, TextInput, View } from 'react-native';

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

test('iOS 모달 본문은 스크롤로 처리되지 않은 터치에도 입력 키보드를 유지하도록 설정한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  await render(<Dialog visible title="내용 입력" onRequestClose={() => {}}>
    <TextField label="시험 값" value="" onChangeText={() => {}} />
  </Dialog>);

  const body = screen.container.queryAll((element) => element.props.keyboardShouldPersistTaps != null);
  expect(body).toHaveLength(1);
  expect(body[0]).toHaveProp('keyboardShouldPersistTaps', 'always');
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

test('입력 없는 모달은 버튼 입력 포커스를 옮기지 않고 화면 읽기 시작 위치를 요청한다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const focus = jest.spyOn(View.prototype, 'focus').mockClear().mockImplementation(() => {});
  const accessibilityFocus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockClear().mockImplementation(() => {});
  await render(<Dialog visible title="확인 안내" onRequestClose={() => {}} />);

  await fireEvent(screen.root!, 'show');

  expect(focus).not.toHaveBeenCalled();
  expect(accessibilityFocus).toHaveBeenCalledTimes(1);
  expect(accessibilityFocus).toHaveBeenCalledWith(expect.anything(), 'focus');
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

test.each(['reopen', 'unmount'])('Android 입력 복귀 frame 전 %s이면 포커스를 요청하지 않는다', async (transition) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const focus = jest.fn();
  const returnFocusRef = { current: { focus } };
  const frames: FrameRequestCallback[] = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  const cancelFrame = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  await render(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  await screen.rerender(<Dialog visible={false} title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  if (transition === 'reopen') {
    await screen.rerender(<Dialog visible title="안내" returnFocusRef={returnFocusRef} onRequestClose={() => {}} />);
  } else {
    await screen.unmount();
  }
  // 취소된 콜백이 늦게 전달돼도 수명 가드가 입력 포커스를 보호한다.
  await act(() => { frames.forEach((callback) => callback(0)); });
  expect(cancelFrame).toHaveBeenCalledWith(1);
  expect(focus).not.toHaveBeenCalled();
});

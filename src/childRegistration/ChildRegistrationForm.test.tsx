import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, BackHandler, Dimensions, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { ChildRegistrationForm } from './ChildRegistrationForm';
import type { ChildDraft } from './childRegistrationData';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => { jest.restoreAllMocks(); });

const draft = {
  name: '가상이', nickname: '새싹', birthDate: '2024-02-29', gender: 'FEMALE' as const,
  interests: ['그림'], characterId: 'test-dodam-girl',
};

function props() {
  return {
    draft, errors: {}, confirmation: false, busy: false, retryWaiting: false, checkOnly: false,
    charactersAvailable: true, onChange: jest.fn(), onNext: jest.fn(), onBack: jest.fn(), onSubmit: jest.fn(),
  };
}

test('iOS 키보드 보정은 입력 스크롤에만 적용하고 하단 버튼은 화면 하단에 둔다', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const keyboardLayout = jest.spyOn(KeyboardAvoidingView.prototype, 'render');
  await render(<ChildRegistrationForm {...props()} />);
  const layout = keyboardLayout.mock.contexts.at(-1) as KeyboardAvoidingView | undefined;
  expect(layout?.props.enabled).toBe(false);
  const [formScroll] = screen.container.queryAll(view => view.props.automaticallyAdjustKeyboardInsets === true);
  expect(formScroll).toBeDefined();
  expect(within(formScroll).queryByRole('button', { name: '뒤로 가기' })).not.toBeOnTheScreen();
  expect(within(formScroll).queryByRole('button', { name: '다음으로' })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeVisible();
  expect(screen.getByRole('button', { name: '다음으로' })).toBeVisible();
});

test('아이 등록 표시줄은 입력과 확인 사이를 오갈 때 현재 단계만 바꾼다', async () => {
  const window = Dimensions.get('window');
  const settings = props();
  const inputStep = '아이 등록 2단계 중 1단계, 프로필 입력. 아이 정보·도담이 선택';
  const confirmStep = '아이 등록 2단계 중 2단계, 등록 확인. 입력한 내용 확인 후 등록';
  try {
    await act(() => Dimensions.set({ window: { ...window, width: 1180, height: 820 } }));
    await render(<ChildRegistrationForm {...settings} />);
    expect(screen.getByLabelText(inputStep)).toBeVisible();
    expect(screen.getByText('프로필 입력')).toBeVisible();
    expect(screen.getByText('아이 정보·도담이 선택')).toBeVisible();
    expect(screen.getByText('등록 확인')).toBeVisible();
    expect(screen.getByText('입력한 내용 확인 후 등록')).toBeVisible();
    expect(screen.queryByText('계정 만들기')).not.toBeOnTheScreen();
    expect(screen.queryByText('로그인')).not.toBeOnTheScreen();

    await screen.rerender(<ChildRegistrationForm {...settings} confirmation />);
    expect(screen.getByLabelText(confirmStep)).toBeVisible();
    await screen.rerender(<ChildRegistrationForm {...settings} />);
    expect(screen.getByLabelText(inputStep)).toBeVisible();
    await screen.rerender(<ChildRegistrationForm {...settings} checkOnly />);
    expect(screen.getByLabelText(confirmStep)).toBeVisible();
  } finally {
    await act(() => Dimensions.set({ window }));
  }
});

test('확인 전환 중 뒤로 갈 수 있고 화면이 나타나기 전 연속 탭으로 등록되지 않는다', async () => {
  const settings = props();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  try {
    await render(<ChildRegistrationForm {...settings} />);
    expect(timing).not.toHaveBeenCalled();

    await screen.rerender(<ChildRegistrationForm {...settings} confirmation />);
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      toValue: 1, duration: 220, useNativeDriver: true,
    }));
    const register = screen.getByRole('button', { name: '등록하고 시작' });
    expect(register).toBeDisabled();
    await fireEvent.press(register);
    expect(settings.onSubmit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(settings.onBack).toHaveBeenCalledTimes(1);

    await screen.rerender(<ChildRegistrationForm {...settings} />);
    expect(animation.stop).toHaveBeenCalled();
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
    await screen.rerender(<ChildRegistrationForm {...settings} confirmation />);
    const previousFinish = animation.start.mock.calls[0][0];
    await act(() => { previousFinish?.({ finished: true }); });
    expect(screen.getByRole('button', { name: '등록하고 시작' })).toBeDisabled();
    const currentFinish = animation.start.mock.lastCall?.[0];
    await act(() => { currentFinish?.({ finished: true }); });
    expect(screen.getByRole('button', { name: '등록하고 시작' })).toBeEnabled();
  } finally {
    timing.mockRestore();
  }
});

test('동작 줄이기가 켜져 있으면 확인 화면을 즉시 사용할 수 있다', async () => {
  const settings = props();
  const timing = jest.spyOn(Animated, 'timing');
  try {
    await render(<ChildRegistrationForm {...settings} />);
    await screen.rerender(<ChildRegistrationForm {...settings} confirmation />);
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '등록하고 시작' })).toBeEnabled();
  } finally {
    timing.mockRestore();
  }
});

test.each([
  { characterId: 'test-dodam-girl', gender: 'MALE', fileName: 'preview-girl.png' },
  { characterId: 'test-dodam-boy', gender: 'FEMALE', fileName: 'preview-boy.png' },
] as const)('등록 확인 이미지는 아이 성별과 별개로 $characterId 캐릭터를 표시한다', async ({ characterId, gender, fileName }) => {
  await render(<ChildRegistrationForm {...props()} confirmation draft={{ ...draft, characterId, gender }}
    characters={[{ id: characterId, label: '도담이' }]} />);
  const portrait = screen.getByTestId('child-confirmation-portrait');
  expect(portrait).toHaveProp('source', expect.objectContaining({ testUri: expect.stringContaining(fileName) }));
  expect(portrait).toHaveProp('resizeMode', 'contain');
  expect(portrait).toHaveStyle({ width: '192%', height: '192%' });
});

test('등록 확인에서 선택한 캐릭터 이미지가 없으면 기본 이미지를 표시한다', async () => {
  const character = { id: 'new-dodam', label: '새 도담이' };
  await render(<ChildRegistrationForm {...props()} confirmation draft={{ ...draft, characterId: character.id }} characters={[character]} />);
  expect(screen.getByTestId('child-confirmation-portrait')).toHaveProp('source',
    expect.objectContaining({ testUri: expect.stringContaining('signup-complete-character.png') }));
});

test('관심사 안내는 직접 입력란에 표시하고 추가 버튼 없이 키보드로 확정한다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} draft={{ ...draft, interests: [] }} />);
  const guide = '아래에서 고르거나 직접 추가해 주세요';
  const input = screen.getByLabelText('직접 입력');
  expect(input).toHaveProp('placeholder', guide);
  expect(screen.queryByText(guide)).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '추가' })).not.toBeOnTheScreen();
  await fireEvent(input, 'focus');
  expect(screen.queryByPlaceholderText(guide)).not.toBeOnTheScreen();
  await fireEvent.changeText(input, '공룡');
  await fireEvent(input, 'submitEditing');
  expect(settings.onChange).toHaveBeenCalledWith({ interests: ['공룡'] });
  expect(input).toHaveDisplayValue('');
  await fireEvent(input, 'blur');
  expect(input).toHaveProp('placeholder', guide);
});

test('가로 화면에서 관심사를 추가해도 캐릭터 미리보기는 상단에 정렬된다', async () => {
  const window = Dimensions.get('window');
  const settings = props();
  function Form() {
    const [value, setValue] = useState<ChildDraft>({ ...draft, interests: [] });
    return <ChildRegistrationForm {...settings} draft={value} onChange={change => setValue(current => ({ ...current, ...change }))} />;
  }

  try {
    await act(() => Dimensions.set({ window: { ...window, width: 1180, height: 820, fontScale: 1 } }));
    await render(<Form />);
    const preview = screen.getByTestId('child-character-preview');
    expect(preview).toHaveStyle({ alignSelf: 'flex-start' });
    for (const title of ['그림', '노래', '책 읽기', '운동']) {
      await fireEvent.press(screen.getByRole('button', { name: title }));
    }
    expect(screen.getByText('아이의 관심사 (선택) · 4/10')).toBeVisible();
    expect(preview).toHaveStyle({ alignSelf: 'flex-start' });
    expect(screen.getByPlaceholderText('직접 작성할 수도 있어요')).toBeVisible();
    await fireEvent(screen.getByLabelText('직접 입력'), 'focus');
    expect(screen.queryByPlaceholderText('직접 작성할 수도 있어요')).not.toBeOnTheScreen();
    await fireEvent(screen.getByLabelText('직접 입력'), 'blur');
    for (const title of ['그림', '노래', '책 읽기', '운동']) {
      await fireEvent.press(screen.getByRole('button', { name: `${title} 관심사 제거` }));
    }
    expect(screen.getByPlaceholderText('아래에서 고르거나 직접 추가해 주세요')).toBeVisible();
  } finally {
    await act(() => Dimensions.set({ window }));
  }
});

test('직접 입력 관심사는 추가하기 전까지 다음으로 넘어가지 않고 Enter로 확정한다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} />);
  const input = screen.getByLabelText('직접 입력');
  await fireEvent.changeText(input, ' 그림 ');
  expect(screen.getByRole('button', { name: '다음으로' })).toBeDisabled();
  await fireEvent(input, 'submitEditing');
  expect(screen.getByText('이미 추가한 관심사예요.')).toBeVisible();
  expect(settings.onChange).not.toHaveBeenCalled();
  await fireEvent.changeText(input, ' 책 놀이 ');
  await fireEvent(input, 'submitEditing');
  expect(settings.onChange).toHaveBeenCalledWith({ interests: ['그림', '책 놀이'] });
  await fireEvent.press(screen.getByRole('button', { name: '그림 관심사 제거' }));
  expect(settings.onChange).toHaveBeenLastCalledWith({ interests: [] });
});

test('Android 뒤로 가기는 성별 메뉴를 먼저 닫고 그다음 화면의 뒤로 가기를 실행한다', async () => {
  const settings = props();
  const back = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  try {
    await render(<ChildRegistrationForm {...settings} />);
    await fireEvent.press(screen.getByRole('button', { name: '성별' }));
    const pressBack = () => act(() => {
      expect(back.mock.calls.at(-1)?.[1]({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true);
    });
    await pressBack();
    expect(screen.queryByRole('button', { name: '여자' })).not.toBeOnTheScreen();
    expect(settings.onBack).not.toHaveBeenCalled();
    await pressBack();
    expect(settings.onBack).toHaveBeenCalledTimes(1);
  } finally {
    back.mockRestore();
  }
});

test('날짜 선택을 취소하면 입력을 보존하고 다시 열어 확인하면 선택 날짜를 확정한다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} />);
  const open = () => fireEvent.press(screen.getByRole('button', { name: '생년월일 선택' }));
  await open();
  await fireEvent.press(screen.getByRole('button', { name: '일 28' }));
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));
  expect(settings.onChange).not.toHaveBeenCalled();
  await open();
  expect(screen.getByText('2024.02.29')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '일 28' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(settings.onChange).toHaveBeenCalledWith({ birthDate: '2024-02-28' });
});

test('캐릭터 목록 없는 환경에서는 테스트 선택지를 막고 재확인 화면은 등록 버튼 없이 표시된다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} charactersAvailable={false} />);
  expect(screen.queryByRole('button', { name: '여자 도담이' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '남자 도담이' })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '다음으로' })).toBeDisabled();
  await screen.rerender(<ChildRegistrationForm {...settings} checkOnly feedback="등록 상태를 확인해 주세요." />);
  expect(screen.getByRole('header', { name: '등록 상태 확인' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '등록하고 시작' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '다시 확인' }));
  expect(settings.onSubmit).toHaveBeenCalledTimes(1);
});

test('생년월일 전체 필드를 누르면 선택창이 열리고 별도 키보드 입력은 없다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} />);
  const birthDate = screen.getByRole('button', { name: '생년월일 선택' });
  expect(birthDate).toHaveAccessibilityValue({ text: '2024.02.29' });
  expect(screen.queryByLabelText('생년월일')).not.toBeOnTheScreen();
  expect(screen.queryByText('날짜 선택', { exact: true })).not.toBeOnTheScreen();
  await fireEvent.press(birthDate);
  expect(screen.getByRole('header', { name: '생년월일 선택' })).toBeVisible();
});

test('성별 선택지는 프로필 레이아웃 밖에 펼쳐지고 눌러 선택할 수 있다', async () => {
  const settings = props();
  await render(<ChildRegistrationForm {...settings} />);
  const trigger = screen.getByRole('button', { name: '성별' });
  const chevron = () => screen.getByTestId('child-gender-chevron');
  const closedRotation = StyleSheet.flatten(chevron().props.style).transform;
  await fireEvent.press(trigger);

  expect(screen.getByTestId('child-gender-options')).toHaveStyle({ position: 'absolute' });
  expect(screen.getByRole('button', { name: '성별', expanded: true })).toBeVisible();
  expect(chevron()).toHaveStyle({ transform: [{ rotate: '90deg' }] });
  await fireEvent.press(screen.getByRole('button', { name: '남자' }));
  expect(settings.onChange).toHaveBeenCalledWith({ gender: 'MALE' });
  expect(screen.queryByTestId('child-gender-options')).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '성별', expanded: false })).toBeVisible();
  expect(StyleSheet.flatten(chevron().props.style).transform).toEqual(closedRotation);
});

test('생년월일 선택창을 열었다 닫으면 열려 있던 성별 선택지는 닫혀 있다', async () => {
  await render(<ChildRegistrationForm {...props()} />);
  await fireEvent.press(screen.getByRole('button', { name: '성별' }));
  expect(screen.getByRole('button', { name: '남자' })).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '생년월일 선택' }));
  await fireEvent.press(screen.getByRole('button', { name: '취소' }));

  expect(screen.getByRole('button', { name: '성별', expanded: false })).toBeVisible();
  expect(screen.queryByRole('button', { name: '남자' })).not.toBeOnTheScreen();
});

test('모션을 사용할 때 성별 메뉴와 화살표가 함께 열리고 선택은 전환을 기다리지 않는다', async () => {
  const settings = props();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  await render(<ChildRegistrationForm {...settings} />);
  await fireEvent.press(screen.getByRole('button', { name: '성별' }));

  expect(timing).toHaveBeenLastCalledWith(expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 150, useNativeDriver: true }));
  expect(screen.getByTestId('child-gender-options')).toHaveStyle({
    position: 'absolute', opacity: 0.85, transform: [{ translateY: -4 }],
  });
  await fireEvent.press(screen.getByRole('button', { name: '남자' }));
  expect(settings.onChange).toHaveBeenCalledWith({ gender: 'MALE' });
  expect(screen.queryByTestId('child-gender-options')).not.toBeOnTheScreen();
  expect(animation.stop).toHaveBeenCalled();
  expect(timing).toHaveBeenLastCalledWith(timing.mock.calls[0][0],
    expect.objectContaining({ toValue: 0, duration: 150, useNativeDriver: true }));
});

test('생년월일 선택창이 나타나는 동안에도 날짜를 확인하고 즉시 닫을 수 있다', async () => {
  const settings = props();
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  await render(<ChildRegistrationForm {...settings} />);
  const open = () => fireEvent.press(screen.getByRole('button', { name: '생년월일 선택' }));
  await open();

  expect(timing).toHaveBeenLastCalledWith(expect.anything(),
    expect.objectContaining({ toValue: 1, duration: 160, useNativeDriver: true }));
  await fireEvent.press(screen.getByRole('button', { name: '일 28' }));
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(settings.onChange).toHaveBeenCalledWith({ birthDate: '2024-02-28' });
  expect(screen.queryByRole('header', { name: '생년월일 선택' })).not.toBeOnTheScreen();
  expect(animation.stop).toHaveBeenCalled();
  await open();
  expect(timing).toHaveBeenCalledTimes(2);
});

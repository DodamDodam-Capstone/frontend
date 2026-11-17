import { createRef } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, Platform, Text } from 'react-native';

import { AppText } from './AppText';

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
const resize = (fontScale: number, width = 1024) => act(() => {
  Dimensions.set({ window: { width, height: 768, scale: 2, fontScale } });
});

beforeEach(async () => { jest.replaceProperty(Platform, 'OS', 'ios'); await resize(1); });
afterEach(async () => {
  await act(() => Dimensions.set({ window: originalWindow, screen: originalScreen }));
  jest.restoreAllMocks();
});

test('iOS 글자 배율 왕복 변경은 텍스트만 갱신하고 같은 배율·회전은 host를 유지한다', async () => {
  await render(<AppText accessibilityRole="header">확인 안내</AppText>);
  const initial = screen.getByRole('header', { name: '확인 안내' });
  await resize(2);
  const enlarged = screen.getByRole('header', { name: '확인 안내' });
  expect(enlarged).not.toBe(initial);
  await screen.rerender(<AppText accessibilityRole="header">확인 안내</AppText>);
  await resize(2, 768);
  expect(screen.getByRole('header', { name: '확인 안내' })).toBe(enlarged);
  await resize(1);
  expect(screen.getByRole('header', { name: '확인 안내' })).not.toBe(enlarged);
});

test('제목 ref와 접근성·스타일 속성은 배율 변경 후 현재 Text에 전달된다', async () => {
  const ref = createRef<Text>();
  await render(<AppText ref={ref} accessibilityRole="header" nativeID="dialog-title"
    style={{ color: '#123456' }} allowFontScaling={false}>안내</AppText>);
  const first = ref.current;
  expect(first).not.toBeNull();
  await resize(2);
  expect(ref.current).not.toBeNull();
  expect(ref.current).not.toBe(first);
  const title = screen.getByRole('header', { name: '안내' });
  expect(title).toHaveStyle({ color: '#123456' });
  expect(title).toHaveProp('nativeID', 'dialog-title');
  expect(title).toHaveProp('allowFontScaling', false);
});

test('Android 배율 변경에서는 Text host를 교체하지 않는다', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await render(<AppText>안내</AppText>);
  const initial = screen.getByText('안내');
  await resize(2);
  expect(screen.getByText('안내')).toBe(initial);
});

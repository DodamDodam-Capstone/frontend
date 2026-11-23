import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, StyleSheet } from 'react-native';

import type { HomeData } from './homeData';
import { HomeScreen } from './HomeScreen';

const data: HomeData = {
  child: {
    childId: '22222222-2222-4222-8222-222222222222',
    name: '가상 어린이',
    nickname: '별이',
    characterId: 'test-character',
  },
  greeting: '별이, 오늘도 반가워!',
  joinedAt: '2026-08-05T10:00:00+09:00',
  daysTogether: 1,
  activeConversationId: null,
  menus: [{ code: 'TALK', status: 'AVAILABLE' }, { code: 'PLAY', status: 'COMING_SOON' }],
  availability: {
    timeZone: 'Asia/Seoul',
    serviceDate: '2026-08-05',
    serverTime: '2026-08-05T11:00:00+09:00',
    opensAt: '2026-08-05T08:00:00+09:00',
    closesAt: '2026-08-06T00:00:00+09:00',
    canEnter: true,
    reason: null,
    nextOpensAt: null,
  },
};

function homeProps() {
  return {
    data, logoutDisabled: false, onTalk: jest.fn(), onGuardian: jest.fn(),
    onLogout: jest.fn(), onRefresh: jest.fn(),
  };
}

test('서버 날짜·함께한 날·애칭 인사를 표시하고 출석 안내에서 배경 동작을 막는다', async () => {
  const props = homeProps();
  await render(<HomeScreen {...props} talkState="start" />);

  expect(screen.getByText('별이, 오늘도 반가워!')).toBeVisible();
  expect(screen.getByText('1일째')).toBeVisible();
  expect(screen.getByText('8월 5일 수요일')).toBeVisible();
  expect(screen.getByText('이용시간 08:00–24:00')).toBeVisible();
  expect(screen.queryByText(data.child.name)).not.toBeOnTheScreen();
  expect(screen.getByText('도담이 꾸미기 · 준비 중')).toBeVisible();
  expect(screen.getByText('추억 다시보기 · 준비 중')).toBeVisible();
  expect(screen.getByText('같이 놀기 · 준비 중')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '출석 · 준비 중' }));
  expect(screen.getByRole('header', { name: '출석 보상은 준비 중이에요!' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '대화하기' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: '보호자 모드' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(screen.queryByRole('button', { name: '확인' })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: '대화하기' })).toBeEnabled();
  expect(props.onTalk).not.toHaveBeenCalled();
  expect(props.onGuardian).not.toHaveBeenCalled();
  expect(props.onRefresh).not.toHaveBeenCalled();
});

test('출석 안내가 열리면 뒤로 가기를 처리하고 닫은 뒤 해제한다', async () => {
  const remove = jest.fn();
  const back = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
  try {
    await render(<HomeScreen {...homeProps()} talkState="start" />);
    await fireEvent.press(screen.getByRole('button', { name: '출석 · 준비 중' }));
    expect(back).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    const handleBack = back.mock.calls[0][1];
    await act(() => { expect(handleBack({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true); });
    expect(screen.queryByRole('button', { name: '확인' })).not.toBeOnTheScreen();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    back.mockRestore();
  }
});

test('종료 처리 중에는 대화를 차단하고 재확인과 보호자 접근을 제공한다', async () => {
  const props = homeProps();
  await render(<HomeScreen {...props} talkState="closing" />);
  expect(screen.getByRole('button', { name: '대화하기' })).toBeDisabled();
  const character = screen.getByRole('button', { name: '도담이 캐릭터로 대화하기' });
  expect(character).toBeDisabled();
  expect(character.props.pointerEvents).toBe('none');
  await fireEvent.press(screen.getByRole('button', { name: '다시 확인' }));
  await fireEvent.press(screen.getByRole('button', { name: '보호자 모드' }));
  expect(props.onRefresh).toHaveBeenCalledTimes(1);
  expect(props.onGuardian).toHaveBeenCalledTimes(1);
  expect(props.onTalk).not.toHaveBeenCalled();
});

test('이용시간 밖에는 다음 이용 시각을 알리고 보호자 모드는 계속 제공한다', async () => {
  const props = homeProps();
  const outside: HomeData = {
    ...data,
    availability: {
      ...data.availability,
      serverTime: '2026-08-05T07:59:00+09:00',
      canEnter: false,
      reason: 'OUTSIDE_SERVICE_HOURS',
      nextOpensAt: data.availability.opensAt,
    },
  };
  await render(<HomeScreen {...props} data={outside} talkState="outside" />);

  expect(screen.getByText('오전 8시에 만나요')).toBeVisible();
  expect(screen.getByRole('button', { name: '대화하기' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '도담이 캐릭터로 대화하기' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '보호자 모드' })).toBeEnabled();
});

test('준비 중 안내에서 시스템 뒤로 가면 홈을 그대로 다시 표시한다', async () => {
  const remove = jest.fn();
  const back = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
  try {
    const props = homeProps();
    await render(<HomeScreen {...props} talkState="start" />);
    await fireEvent.press(screen.getByRole('button', { name: '같이 놀기 · 준비 중' }));
    expect(screen.getByRole('header', { name: '같이 놀기' })).toBeVisible();
    const handleBack = back.mock.calls[0][1];
    await act(() => { expect(handleBack({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true); });
    expect(screen.getByRole('button', { name: '같이 놀기 · 준비 중' })).toBeEnabled();
    expect(props.onRefresh).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    back.mockRestore();
  }
});

test.each([
  ['도담이 캐릭터로 대화하기', 'character-press-outline.png'],
  ['대화하기', 'character-press-outline.png'],
  ['도담이 꾸미기 · 준비 중', 'dress-up-outline.png'],
  ['추억 다시보기 · 준비 중', 'memories-outline.png'],
  ['같이 놀기 · 준비 중', 'play-outline.png'],
])('%s 터치 중에 그림과 글자 테두리를 함께 표시하고 취소하면 없앤다', async (label, outline) => {
  jest.useFakeTimers();
  try {
    const props = homeProps();
    await render(<HomeScreen {...props} talkState="start" />);
    const artwork = screen.getByRole('button', { name: label });
    const tintedImages = () => screen.container.queryAll(
      element => Boolean(StyleSheet.flatten(element.props.style)?.tintColor),
    );
    const highlightedCaptions = () => screen.container.queryAll(
      element => StyleSheet.flatten(element.props.style)?.borderColor === '#D99639',
    );
    expect(tintedImages()).toHaveLength(0);
    expect(highlightedCaptions()).toHaveLength(0);

    const touch = { persist: jest.fn(), nativeEvent: { touches: [], pageX: 0, pageY: 0 }, currentTarget: { measure: jest.fn() } };
    await fireEvent(artwork, 'responderGrant', touch);
    const [edge] = tintedImages();
    expect(tintedImages()).toHaveLength(1);
    expect(edge.props.source.testUri.split('/').at(-1)).toBe(outline);
    expect(highlightedCaptions()).toHaveLength(1);

    await fireEvent(artwork, 'responderTerminate', touch);
    await act(() => { jest.advanceTimersByTime(150); });
    expect(tintedImages()).toHaveLength(0);
    expect(highlightedCaptions()).toHaveLength(0);
    expect(props.onTalk).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

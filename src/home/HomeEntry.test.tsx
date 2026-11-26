import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { AccessibilityInfo, Animated } from 'react-native';

import { createApiClient, type ApiFetch } from '../api/client';
import { EntrySessionContext } from '../navigation/entrySession';
import { HomeEntry } from './HomeEntry';
import { createHomeFixture, MOCK_CHILD_ID } from './homeFixture';

const homeResponse = () => new Response(JSON.stringify({ data: createHomeFixture({
  serverTime: '2026-11-25T12:00:00+09:00', closing: true,
}) }), { headers: { 'Content-Type': 'application/json' } });

function homeVisit(fetchImpl: ApiFetch, animateRegistrationEntry: boolean, reduceMotion: boolean) {
  const result = createApiClient({
    appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1',
  }, { fetchImpl });
  if (!result.ok) throw new Error('Invalid synthetic configuration');
  return <EntrySessionContext.Provider value={{
    client: result.value,
    receiveProtectedAuthResult: async () => false,
    isHomeVisitCurrent: () => true, getHomeRetryAt: () => undefined, rememberHomeRetry: jest.fn(),
    refreshEntry: async () => {}, childCharacters: [], submitChild: async () => undefined,
    checkChildRegistration: async () => {}, submitLogin: async () => undefined,
    submitLogout: async () => {}, retryLogoutCsrf: async () => {},
  }}>
    <HomeEntry visit={1} childId={MOCK_CHILD_ID} animateRegistrationEntry={animateRegistrationEntry} reduceMotion={reduceMotion} />
  </EntrySessionContext.Provider>;
}

test.each([
  { animateRegistrationEntry: true, reduceMotion: false, expected: [180] },
  { animateRegistrationEntry: true, reduceMotion: true, expected: [] },
  { animateRegistrationEntry: false, reduceMotion: false, expected: [] },
])('홈 진입 요청과 새 장면 표시 후 모션을 확인한다 ($animateRegistrationEntry, $reduceMotion)', async ({
  animateRegistrationEntry, reduceMotion, expected,
}) => {
  const preference = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(() => {}));
  const animation = { start: jest.fn<Animated.CompositeAnimation['start']>(), stop: jest.fn(), reset: jest.fn() };
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
  let resolveHome!: (response: Response) => void;
  const home = new Promise<Response>(resolve => { resolveHome = resolve; });
  const fetchHome = jest.fn<ApiFetch>().mockReturnValueOnce(home).mockImplementation(async () => homeResponse());
  try {
    await render(homeVisit(fetchHome, animateRegistrationEntry, reduceMotion));
    expect(fetchHome).toHaveBeenCalledWith(`https://api.example.invalid/api/v1/children/${MOCK_CHILD_ID}/home`, expect.objectContaining({ method: 'GET' }));
    expect(screen.getByLabelText('홈 정보 확인 중')).toBeVisible();
    expect(screen.queryByText('별이, 오늘도 반가워!')).not.toBeOnTheScreen();
    expect(timing).not.toHaveBeenCalled();

    await act(() => { resolveHome(homeResponse()); });
    await screen.findByText('별이, 오늘도 반가워!');
    expect(timing.mock.calls.map(([, config]) => config.duration)).toEqual(expected);
    expect(preference).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '다시 확인' }));
    await screen.findByText('별이, 오늘도 반가워!');
    expect(fetchHome).toHaveBeenCalledTimes(2);
    expect(timing.mock.calls.map(([, config]) => config.duration)).toEqual(expected);
  } finally {
    timing.mockRestore();
    preference.mockRestore();
  }
});

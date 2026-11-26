import { expect, test } from '@jest/globals';
import { registerExampleHandlers } from '../api/mockAuthMe';
import { getHomeBoundaryDelay, getHomeTalkState, parseHomeData, type HomeTalkState } from './homeData';
import { createHomeFixture, MOCK_CHILD_ID } from './homeFixture';

const conversationId = '33333333-3333-4333-8333-333333333333';
const afternoon = '2026-11-24T13:00:00+09:00';

test.each<[string, string, string | null, boolean, HomeTalkState, number]>([
  ['새 대화', '2026-11-24T08:00:00+09:00', null, false, 'start', 16 * 3600_000],
  ['이어하기', '2026-11-24T23:59:59+09:00', conversationId, false, 'resume', 1000],
  ['종료 처리 중', afternoon, null, true, 'closing', 11 * 3600_000],
  ['자정 이후, 종료 처리 중보다 시간 외 우선', '2026-11-25T00:00:00+09:00', conversationId, true, 'outside', 8 * 3600_000],
  ['시작 직전', '2026-11-24T07:59:59+09:00', null, false, 'outside', 1000],
])('%s 상태를 서버 시각과 응답으로 판별한다', (_label, serverTime, activeConversationId, closing, talkState, delay) => {
  const fixture = createHomeFixture({ serverTime, activeConversationId, closing });
  const data = parseHomeData(fixture, MOCK_CHILD_ID);
  expect(data).toEqual(fixture);
  expect(data?.child.nickname).toBe('별이');
  expect(data?.greeting).toContain('별이');
  expect(data && getHomeTalkState(data)).toBe(talkState);
  expect(data && getHomeBoundaryDelay(data)).toBe(delay);
});

test('다른 아이의 응답을 홈 화면에 제공하지 않는다', () => {
  expect(parseHomeData(createHomeFixture(), conversationId)).toBeNull();
});

test('서버가 준 함께한 날과 인사를 재계산하지 않는다', () => {
  const fixture = { ...createHomeFixture({ serverTime: afternoon }), daysTogether: 47, greeting: '별이, 환영해!' };
  expect(parseHomeData(fixture, MOCK_CHILD_ID)).toEqual(fixture);
});

test('가상 프로필의 등록 시각은 고정하고 KST 날짜가 바뀌면 함께한 날을 증가시킨다', () => {
  const before = createHomeFixture({ serverTime: '2026-11-24T23:59:59+09:00' });
  const after = createHomeFixture({ serverTime: '2026-11-25T00:00:00+09:00' });
  expect(after.joinedAt).toBe(before.joinedAt);
  expect(after.daysTogether).toBe(before.daysTogether + 1);
});

test('애칭 길이를 Unicode 코드포인트 단위로 검사한다', () => {
  const valid = createHomeFixture({ nickname: '🌟'.repeat(20) });
  const tooLong = createHomeFixture({ nickname: '🌟'.repeat(21) });
  expect(parseHomeData(valid, MOCK_CHILD_ID)).toEqual(valid);
  expect(parseHomeData(tooLong, MOCK_CHILD_ID)).toBeNull();
});

test('응답 속성 누락, 잘못된 시각과 서로 모순되는 대화 상태를 거절한다', () => {
  const good = createHomeFixture({ serverTime: afternoon });
  const closing = createHomeFixture({ serverTime: afternoon, closing: true });
  const outside = createHomeFixture({ serverTime: '2026-11-24T07:59:59+09:00' });
  const bad = [
    null,
    { ...good, activeConversationId: undefined },
    { ...good, activeConversationId: 'bad-id' },
    { ...good, child: { ...good.child, nickname: '  ' } },
    { ...good, daysTogether: 0 },
    { ...good, daysTogether: 1.5 },
    { ...good, joinedAt: '2026-02-30T09:30:00+09:00' },
    { ...good, availability: { ...good.availability, timeZone: 'UTC' } },
    { ...good, availability: { ...good.availability, serverTime: '2026-11-24T07:59:59+09:00' } },
    { ...good, availability: { ...good.availability, serviceDate: '2026-11-25' } },
    { ...good, availability: { ...good.availability, closesAt: '2026-11-26T00:00:00+09:00' } },
    { ...good, availability: { ...good.availability, opensAt: '2026-11-24T09:00:00+09:00' } },
    { ...good, menus: good.menus.slice().reverse() },
    { ...good, menus: [{ code: 'TALK', status: 'UNAVAILABLE' }, good.menus[1]] },
    { ...good, menus: [good.menus[0], { code: 'PLAY', status: 'AVAILABLE' }] },
    { ...closing, activeConversationId: conversationId },
    { ...closing, availability: { ...closing.availability, nextOpensAt: closing.availability.opensAt } },
    { ...outside, availability: { ...outside.availability, nextOpensAt: null } },
    { ...outside, availability: { ...outside.availability, reason: 'CONVERSATION_CLOSING', nextOpensAt: null } },
  ];
  for (const value of bad) expect(parseHomeData(value, MOCK_CHILD_ID)).toBeNull();
});

test('등록된 아이 mock의 계정 조회와 홈 조회는 동일한 프로필을 제공한다', async () => {
  const mock = registerExampleHandlers('childRegistered');
  const account = await mock({ method: 'GET', path: '/auth/me' });
  const { data: { childId } } = await account.json();
  const home = await mock({ method: 'GET', path: `/children/${childId}/home` });
  const { data } = await home.json();
  expect(childId).toBe(MOCK_CHILD_ID);
  expect(home.status).toBe(200);
  expect(home.headers.get('Cache-Control')).toBe('no-store');
  expect(parseHomeData(data, childId)?.child.nickname).toBe('별이');
  await expect(mock({ method: 'GET', path: `/children/${conversationId}/home` })).rejects.toThrow('Unsupported example request');
});

test.each(['signedIn', 'signedOut'] as const)('%s mock은 등록된 아이의 홈 데이터 요청을 거절한다', async (scenario) => {
  const mock = registerExampleHandlers(scenario);
  await expect(mock({ method: 'GET', path: `/children/${MOCK_CHILD_ID}/home` })).rejects.toThrow('Unsupported example request');
});

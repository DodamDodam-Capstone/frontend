import type { HomeData } from './homeData';

export const MOCK_CHILD_ID = '22222222-2222-4222-8222-222222222222';

const hour = 3600_000;
const joinedAt = '2026-10-02T09:00:00+09:00';
function formatKst(time: number): string {
  return `${new Date(time + 9 * hour).toISOString().slice(0, 19)}+09:00`;
}

export function createHomeFixture({
  childId = MOCK_CHILD_ID,
  serverTime = formatKst(Date.now()),
  activeConversationId = null,
  closing = false,
  nickname = '별이',
}: {
  childId?: string;
  serverTime?: string;
  activeConversationId?: string | null;
  closing?: boolean;
  nickname?: string;
} = {}): HomeData {
  const serviceDate = serverTime.slice(0, 10);
  const opensAt = `${serviceDate}T08:00:00+09:00`;
  const start = Date.parse(opensAt);
  const joinedDay = Date.parse(`${joinedAt.slice(0, 10)}T08:00:00+09:00`);
  const window = { timeZone: 'Asia/Seoul', serverTime, serviceDate, opensAt, closesAt: formatKst(start + 16 * hour) } as const;
  const availability: HomeData['availability'] = serverTime < opensAt
    ? { ...window, canEnter: false, reason: 'OUTSIDE_SERVICE_HOURS', nextOpensAt: opensAt }
    : closing
      ? { ...window, canEnter: false, reason: 'CONVERSATION_CLOSING', nextOpensAt: null }
      : { ...window, canEnter: true, reason: null, nextOpensAt: null };

  return {
    child: { childId, name: '도담친구', characterId: 'dodam', nickname },
    greeting: `${nickname}, 오늘도 반가워!`,
    joinedAt,
    daysTogether: 1 + Math.floor((start - joinedDay) / (24 * hour)),
    activeConversationId: availability.canEnter ? activeConversationId : null,
    menus: [
      { code: 'TALK', status: availability.canEnter ? 'AVAILABLE' : 'UNAVAILABLE' },
      { code: 'PLAY', status: 'COMING_SOON' },
    ],
    availability,
  };
}

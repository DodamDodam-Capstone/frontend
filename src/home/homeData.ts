import { isKstDateTime, isUuid } from '../api/accountView';

type HomeServiceWindow = {
  timeZone: 'Asia/Seoul';
  serverTime: string;
  serviceDate: string;
  opensAt: string;
  closesAt: string;
};

type HomeAvailability = HomeServiceWindow & (
  | { canEnter: true; reason: null; nextOpensAt: null }
  | { canEnter: false; reason: 'CONVERSATION_CLOSING'; nextOpensAt: null }
  | { canEnter: false; reason: 'OUTSIDE_SERVICE_HOURS'; nextOpensAt: string }
);

export type HomeData = {
  child: {
    childId: string;
    name: string;
    characterId: string;
    nickname: string;
  };
  greeting: string;
  joinedAt: string;
  daysTogether: number;
  activeConversationId: string | null;
  menus: [{ code: 'TALK'; status: 'AVAILABLE' | 'UNAVAILABLE' }, { code: 'PLAY'; status: 'COMING_SOON' }];
  availability: HomeAvailability;
};

export type HomeTalkState = 'start' | 'resume' | 'closing' | 'outside';

const hour = 3600_000;

function recordWithSize(value: unknown, size: number): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === size;
}

function parseAvailability(value: unknown): HomeAvailability | null {
  if (!recordWithSize(value, 8)) return null;
  const { timeZone, serverTime, serviceDate, opensAt, closesAt, canEnter, reason, nextOpensAt } = value;
  if (timeZone !== 'Asia/Seoul' || !isKstDateTime(serverTime) || serviceDate !== serverTime.slice(0, 10)
      || opensAt !== `${serviceDate}T08:00:00+09:00`
      || !isKstDateTime(closesAt) || Date.parse(closesAt) - Date.parse(opensAt) !== 16 * hour) return null;

  const serviceWindow = { timeZone, serverTime, serviceDate, opensAt, closesAt } satisfies HomeServiceWindow;
  if (serverTime < opensAt) {
    return canEnter === false && reason === 'OUTSIDE_SERVICE_HOURS' && nextOpensAt === opensAt
      ? { ...serviceWindow, canEnter, reason, nextOpensAt } : null;
  }
  if (nextOpensAt !== null) return null;
  if (canEnter === true && reason === null) return { ...serviceWindow, canEnter, reason, nextOpensAt };
  if (canEnter === false && reason === 'CONVERSATION_CLOSING') return { ...serviceWindow, canEnter, reason, nextOpensAt };
  return null;
}

export function parseHomeData(value: unknown, childId: string): HomeData | null {
  if (!recordWithSize(value, 7)) return null;
  const { child, greeting, joinedAt, daysTogether, activeConversationId, menus } = value;
  if (!recordWithSize(child, 4) || !isUuid(child.childId) || child.childId.toLowerCase() !== childId.toLowerCase()) return null;
  const { name, characterId, nickname } = child;
  if (typeof name !== 'string' || typeof characterId !== 'string' || typeof nickname !== 'string') return null;
  const nicknameLength = [...nickname.trim()].length;
  if (nicknameLength < 1 || nicknameLength > 20 || typeof greeting !== 'string' || !isKstDateTime(joinedAt)
      || typeof daysTogether !== 'number' || !Number.isInteger(daysTogether) || daysTogether < 1
      || (activeConversationId !== null && !isUuid(activeConversationId))) return null;

  const availability = parseAvailability(value.availability);
  if (!availability || (!availability.canEnter && activeConversationId !== null)) return null;
  const talkStatus = availability.canEnter ? 'AVAILABLE' : 'UNAVAILABLE';
  if (!Array.isArray(menus) || menus.length !== 2) return null;
  const [talk, play]: unknown[] = menus;
  if (!recordWithSize(talk, 2) || talk.code !== 'TALK' || talk.status !== talkStatus
      || !recordWithSize(play, 2) || play.code !== 'PLAY' || play.status !== 'COMING_SOON') return null;

  return {
    child: { childId: child.childId, name, characterId, nickname }, greeting, joinedAt, daysTogether, activeConversationId,
    menus: [{ code: 'TALK', status: talkStatus }, { code: 'PLAY', status: 'COMING_SOON' }], availability,
  };
}

export function getHomeTalkState(data: HomeData): HomeTalkState {
  if (data.availability.canEnter) return data.activeConversationId === null ? 'start' : 'resume';
  return data.availability.reason === 'CONVERSATION_CLOSING' ? 'closing' : 'outside';
}

// 기기 시각 대신 서버 응답 안의 간격으로 다음 상태 변경을 예약한다.
export function getHomeBoundaryDelay({ availability }: HomeData): number {
  const { serverTime, closesAt, nextOpensAt } = availability;
  return Date.parse(nextOpensAt ?? closesAt) - Date.parse(serverTime);
}

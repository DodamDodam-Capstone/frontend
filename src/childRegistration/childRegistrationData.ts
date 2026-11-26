export type ChildDraft = {
  name: string;
  nickname: string;
  birthDate: string;
  gender: '' | 'MALE' | 'FEMALE';
  interests: string[];
  characterId: string;
};

export type ChildRegistrationInput = Omit<ChildDraft, 'gender'> & { gender: Exclude<ChildDraft['gender'], ''> };
export type ChildFieldErrors = Partial<Record<keyof ChildDraft, string>>;
export type ChildCharacter = { id: string; label: string };

// J-04 확정 전 mock 모드에서만 사용하는 ID다. 실서버 카탈로그의 교체 지점이다.
export const TEST_CHILD_CHARACTERS = [
  { id: 'test-dodam-girl', label: '여자 도담이' },
] as const satisfies readonly ChildCharacter[];
export const UPCOMING_TEST_CHILD_CHARACTER = { id: 'test-dodam-boy', label: '남자 도담이' } as const satisfies ChildCharacter;

export const childFieldMessages = {
  name: '아이 이름을 1~5자로 입력해 주세요.',
  nickname: '아이 애칭을 1~20자로 입력해 주세요.',
  birthDate: '오늘까지의 유효한 생년월일을 YYYY-MM-DD로 입력해 주세요.',
  gender: '성별을 선택해 주세요.',
  interests: '관심사는 중복 없이 10개까지 추가할 수 있어요.',
  characterId: '지원되는 캐릭터를 선택해 주세요.',
} satisfies Record<keyof ChildDraft, string>;

// BE의 Character.isWhitespace 또는 isSpaceChar와 같은 양끝 공백만 제거한다.
function trimChildText(value: string) {
  return value.replace(/^[\p{Z}\u0009-\u000d\u001c-\u001f]+|[\p{Z}\u0009-\u000d\u001c-\u001f]+$/gu, '');
}

function hasValidLength(value: string, max: number) {
  return value.length > 0 && !/[\u0000\uD800-\uDFFF]/u.test(value) && [...value].length <= max;
}

export function isChildBirthDate(value: unknown, latestDate: string) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || value.startsWith('0000') || value > latestDate) return false;
  const utc = Date.parse(value);
  return Number.isFinite(utc) && new Date(utc).toISOString().slice(0, 10) === value;
}

export function addChildInterest(interests: string[], raw: string): { ok: true; interests: string[] } | { ok: false; message: string } {
  const value = trimChildText(raw);
  if (!hasValidLength(value, 30)) return { ok: false, message: '관심사를 1~30자로 입력해 주세요.' };
  if (interests.includes(value)) return { ok: false, message: '이미 추가한 관심사예요.' };
  if (interests.length >= 10) return { ok: false, message: '관심사는 10개까지 추가할 수 있어요.' };
  return { ok: true, interests: [...interests, value] };
}

export function validateChildDraft(draft: ChildDraft, characters: readonly ChildCharacter[], now = Date.now()):
  { ok: true; value: ChildRegistrationInput } | { ok: false; errors: ChildFieldErrors } {
  const { birthDate, gender, characterId } = draft;
  const name = trimChildText(draft.name);
  const nickname = trimChildText(draft.nickname);
  const interests = draft.interests.map(trimChildText);
  const errors: ChildFieldErrors = {};
  if (!hasValidLength(name, 5)) errors.name = childFieldMessages.name;
  if (!hasValidLength(nickname, 20)) errors.nickname = childFieldMessages.nickname;
  const todayKst = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  if (!isChildBirthDate(birthDate, todayKst)) errors.birthDate = childFieldMessages.birthDate;
  if (!characters.some(character => character.id === characterId)) errors.characterId = childFieldMessages.characterId;
  if (interests.length > 10 || interests.some(value => !hasValidLength(value, 30)) || new Set(interests).size !== interests.length) {
    errors.interests = childFieldMessages.interests;
  }
  if (gender !== 'MALE' && gender !== 'FEMALE') return { ok: false, errors: { ...errors, gender: childFieldMessages.gender } };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, nickname, birthDate, gender, interests, characterId } };
}

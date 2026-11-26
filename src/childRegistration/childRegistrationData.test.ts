import { describe, expect, test } from '@jest/globals';

import { addChildInterest, TEST_CHILD_CHARACTERS, validateChildDraft } from './childRegistrationData';

const now = Date.parse('2026-11-24T15:00:00Z');
const draft = {
  name: ' 도담😀😀😀 ', nickname: '😀'.repeat(20), birthDate: '2026-11-25',
  gender: 'MALE' as const, interests: [], characterId: 'test-dodam-girl',
};

describe('아이 등록 입력 계약', () => {
  test('Unicode 코드포인트 길이와 KST 오늘을 허용하고 성별과 캐릭터를 독립 처리한다', () => {
    expect(validateChildDraft(draft, TEST_CHILD_CHARACTERS, now)).toEqual({
      ok: true, value: { ...draft, name: '도담😀😀😀' },
    });
  });

  test('목 등록 목록에서는 미리보기 전용 남자 도담이 ID를 거절한다', () => {
    expect(validateChildDraft({ ...draft, characterId: 'test-dodam-boy' }, TEST_CHILD_CHARACTERS, now))
      .toMatchObject({ ok: false, errors: { characterId: expect.any(String) } });
  });

  test.each(['2026-11-26', '2025-02-29', '2026-2-01', '2026-11-25\n'])('잘못된 생년월일 %j를 거절한다', birthDate => {
    expect(validateChildDraft({ ...draft, birthDate }, TEST_CHILD_CHARACTERS, now)).toMatchObject({
      ok: false, errors: { birthDate: expect.any(String) },
    });
  });

  test('필수 필드, 이름·애칭 제한, 폐기 ID를 각각 표시한다', () => {
    expect(validateChildDraft({
      ...draft, name: '😀'.repeat(6), nickname: '😀'.repeat(21), gender: '', characterId: 'removed-id',
    }, TEST_CHILD_CHARACTERS, now)).toMatchObject({
      ok: false, errors: { name: expect.any(String), nickname: expect.any(String), gender: expect.any(String), characterId: expect.any(String) },
    });
    expect(validateChildDraft({ ...draft, name: '　', nickname: '\u0000', characterId: '' }, TEST_CHILD_CHARACTERS, now))
      .toMatchObject({ ok: false, errors: { name: expect.any(String), nickname: expect.any(String), characterId: expect.any(String) } });
  });

  test('선택 관심사를 입력 순서로 보관하며 개수·길이·trim 중복을 검사한다', () => {
    expect(addChildInterest(['노래'], '　그림　')).toEqual({ ok: true, interests: ['노래', '그림'] });
    expect(addChildInterest(['그림'], ' 그림 ')).toMatchObject({ ok: false });
    expect(addChildInterest([], '😀'.repeat(30))).toMatchObject({ ok: true });
    expect(addChildInterest([], '😀'.repeat(31))).toMatchObject({ ok: false });
    expect(addChildInterest(Array.from({ length: 10 }, (_, i) => String(i)), '열하나')).toMatchObject({ ok: false });
    expect(validateChildDraft({ ...draft, interests: ['그림', ' 그림 '] }, TEST_CHILD_CHARACTERS, now))
      .toMatchObject({ ok: false, errors: { interests: expect.any(String) } });
  });
});

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { parseApiResponse } from './response';

const requestId = '22222222-2222-4222-8222-222222222222';
const jsonExpectation = { kind: 'json', statuses: [200, 201, 202] } as const;
function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers({ 'Content-Type': 'application/json', 'X-Request-ID': requestId });
  new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}
afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-166 JSON·204 응답', () => {
  it.each([200, 201, 202])('%i JSON envelope에서 nullable DTO 값을 보존한다', async (status) => {
    expect(await parseApiResponse(jsonResponse({ data: { childId: null, hasPin: false } }, status), jsonExpectation))
      .toMatchObject({ kind: 'json', data: { childId: null, hasPin: false }, meta: { status } });
  });

  it.each([null, false, 0, '', [], [1, null]])('data:unknown을 변형하지 않으며 업무 DTO를 보증하지 않는다: %#', async (data) => {
    expect(await parseApiResponse(jsonResponse({ data }), jsonExpectation)).toMatchObject({ kind: 'json', data });
  });

  it('201의 상대 Location과 선택한 헤더를 읽되 쿠키와 임의 필드는 전달하지 않는다', async () => {
    const result = await parseApiResponse(jsonResponse({ data: { childId: 'synthetic-child' }, extra: 'private-extra' }, 201, {
      Location: '/api/v1/children/synthetic-child', 'Retry-After': '0', 'Set-Cookie': 'synthetic-cookie',
    }), { kind: 'json', statuses: [201] });
    expect(result).toEqual({ kind: 'json', data: { childId: 'synthetic-child' }, meta: {
      status: 201, headers: { requestId, location: '/api/v1/children/synthetic-child', retryAfter: '0', contentType: 'application/json' },
    } });
  });

  it('허용한204는 Content-Type이나 본문을 요구하지 않고 읽지 않는다', async () => {
    const response = new Response(null, { status: 204 });
    const text = jest.spyOn(response, 'text');
    const json = jest.spyOn(response, 'json');
    expect(await parseApiResponse(response, { kind: 'empty', statuses: [204] })).toEqual({ kind: 'empty', meta: {
      status: 204, headers: { requestId: null, location: null, retryAfter: null, contentType: null },
    } });
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    [204, jsonExpectation],
    [201, { kind: 'json', statuses: [200] } as const],
    [200, { kind: 'empty', statuses: [204] } as const],
    [205, jsonExpectation],
  ])('예상하지 않은 성공 상태%i를 성공으로 처리하거나 읽지 않는다', async (status, expectation) => {
    const response = new Response(null, { status });
    const text = jest.spyOn(response, 'text');
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'format_error', reason: 'unexpected_status', meta: { status } });
    expect(text).not.toHaveBeenCalled();
  });

  it.each(['application/json', 'Application/JSON; charset=UTF-8', 'application/json;charset="utf-8"'])('%s MIME을 수용한다', async (contentType) => {
    expect(await parseApiResponse(jsonResponse({ data: {} }, 200, { 'Content-Type': contentType }), jsonExpectation)).toMatchObject({ kind: 'json' });
  });

  it.each([null, '', 'text/html', 'application/problem+json', 'application/json;charset=iso-8859-1'])('MIME 오류는 읽기 전 거절한다: %s', async (contentType) => {
    const response = new Response('{"data":{}}', { status: 200 });
    response.headers.delete('Content-Type');
    if (contentType !== null) response.headers.set('Content-Type', contentType);
    const text = jest.spyOn(response, 'text');
    expect(await parseApiResponse(response, jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_content_type' });
    expect(text).not.toHaveBeenCalled();
  });

  it.each(['', ' ', '{', '<html>synthetic-secret</html>'])('빈2xx/잘못된 JSON 원문은 반환하지 않는다: %#', async (body) => {
    const response = new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } });
    expect(await parseApiResponse(response, jsonExpectation)).toEqual({ kind: 'format_error', reason: 'invalid_json', meta: {
      status: 200, headers: { requestId, contentType: 'application/json', location: null, retryAfter: null },
    } });
  });

  it.each([null, [], true, 'text', {}, { error: {} }])('data가 없는 envelope는 성공으로 표시하지 않는다: %#', async (body) => {
    expect(await parseApiResponse(jsonResponse(body), jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_envelope' });
  });

  it('한번 읽은 Response를 다시 읽지 않는다', async () => {
    const response = jsonResponse({ data: { value: 1 } });
    expect(await parseApiResponse(response, jsonExpectation)).toMatchObject({ kind: 'json' });
    const text = jest.spyOn(response, 'text');
    expect(await parseApiResponse(response, jsonExpectation)).toMatchObject({ kind: 'body_read_error', reason: 'already_used', meta: { status: 200 } });
    expect(text).not.toHaveBeenCalled();
  });

  it.each(['AbortError', 'TypeError', 'SyntaxError'])('본문 읽기의%s는 JSON 문법 오류나 미전송으로 오인하지 않는다', async (name) => {
    const response = jsonResponse({ data: {} }, 200, { Location: '/resource', 'Retry-After': 'invalid' });
    jest.spyOn(response, 'text').mockRejectedValue(Object.assign(new Error('synthetic-secret'), { name }));
    expect(await parseApiResponse(response, jsonExpectation)).toEqual({ kind: 'body_read_error', reason: 'read_failed', meta: {
      status: 200, headers: { requestId, contentType: 'application/json', location: '/resource', retryAfter: 'invalid' },
    } });
  });
});

function errorResponse(status = 400, overrides: Record<string, unknown> = {}, headers?: HeadersInit) {
  return jsonResponse({ error: { code: 'VALIDATION_FAILED', message: '입력을 확인하세요', requestId, fields: [], ...overrides } }, status, headers);
}

describe('SCRUM-166 HTTP 오류 전달', () => {
  it.each([
    [400, 'VALIDATION_FAILED'], [401, 'AUTHENTICATION_REQUIRED'], [403, 'CSRF_INVALID'],
    [409, 'CHILD_LIMIT_REACHED'], [413, 'PAYLOAD_TOO_LARGE'], [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [429, 'RATE_LIMITED'], [500, 'INTERNAL_ERROR'], [503, 'AUTH_STATE_UNAVAILABLE'],
  ])('%i %s를 성공 예상 종류와 관계없이 전달한다', async (status, code) => {
    expect(await parseApiResponse(errorResponse(status, { code }), { kind: 'empty', statuses: [204] }))
      .toMatchObject({ kind: 'http_error', error: { code, message: '입력을 확인하세요', requestId, fields: [] }, meta: { status } });
  });

  it('fields 누락만 빈 배열로 호환하고 미정의 필드를 결과로 복사하지 않는다', async () => {
    const response = jsonResponse({ error: { code: 'FUTURE_CODE', message: '', requestId, privateExtra: 'synthetic-password' }, privateExtra: 'synthetic-token' }, 400);
    expect(await parseApiResponse(response, jsonExpectation)).toEqual({ kind: 'http_error', error: {
      code: 'FUTURE_CODE', message: '', requestId, fields: [],
    }, meta: { status: 400, headers: { requestId, contentType: 'application/json', location: null, retryAfter: null } } });
  });

  it('fields의 이름·사유를 전달하되 임의 원문 필드는 전달하지 않는다', async () => {
    const result = await parseApiResponse(errorResponse(400, { fields: [{ field: 'nickname', reason: '필수입니다', rejectedValue: 'synthetic-private' }] }), jsonExpectation);
    if (result.kind !== 'http_error') throw new Error('Expected HTTP error');
    expect(result.error.fields).toEqual([{ field: 'nickname', reason: '필수입니다' }]);
  });

  it.each([null, 'invalid', {}, [null], [[]], [{}], [{ field: 'x' }], [{ field: 1, reason: 'bad' }], [{ field: 'x', reason: false }]])('잘못된 fields는 정규화로 숨기지 않는다: %#', async (fields) => {
    expect(await parseApiResponse(errorResponse(400, { fields }), jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_envelope', meta: { status: 400 } });
  });

  it.each([
    { code: null }, { code: 1 }, { message: null }, { message: [] },
    { requestId: undefined }, { requestId: null }, { requestId: 'not-a-uuid' },
  ])('잘못된 공통 오류 필드를 거절하고 헤더로 body ID를 대체하지 않는다: %#', async (overrides) => {
    expect(await parseApiResponse(errorResponse(400, overrides), jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_envelope', meta: { headers: { requestId } } });
  });

  it.each([null, [], {}, { data: {} }, { error: null }, { error: [] }])('HTTP 오류의 잘못된 envelope를 거절한다: %#', async (body) => {
    expect(await parseApiResponse(jsonResponse(body, 500), jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_envelope', meta: { status: 500 } });
  });

  it('body UUID를 v4로 제한하지 않고 헤더 ID 불일치·Retry-After를 원형 보존한다', async () => {
    const bodyId = '01890a5d-ac96-7777-8888-000000000000';
    expect(await parseApiResponse(errorResponse(429, { requestId: bodyId }, { 'Retry-After': '1' }), jsonExpectation))
      .toMatchObject({ kind: 'http_error', error: { requestId: bodyId }, meta: { headers: { requestId, retryAfter: '1' } } });
  });

  it('잘못된 MIME/읽기/JSON 오류에서도 HTTP 오류의 status와 Retry-After를 보존한다', async () => {
    const mime = errorResponse(503, {}, { 'Content-Type': 'text/html', 'Retry-After': 'invalid' });
    expect(await parseApiResponse(mime, jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_content_type', meta: { status: 503, headers: { retryAfter: 'invalid' } } });
    const read = errorResponse(503, {}, { 'Retry-After': '0' });
    jest.spyOn(read, 'text').mockRejectedValue(new Error('synthetic-token'));
    expect(await parseApiResponse(read, jsonExpectation)).toMatchObject({ kind: 'body_read_error', reason: 'read_failed', meta: { status: 503, headers: { retryAfter: '0' } } });
    const malformed = new Response('{', { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '1' } });
    expect(await parseApiResponse(malformed, jsonExpectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_json', meta: { status: 503, headers: { retryAfter: '1' } } });
  });

  it('대화 시작409 ACTIVE_CONVERSATION_EXISTS에서만 ID 확장을 보존한다', async () => {
    const activeConversationId = '33333333-3333-4333-8333-333333333333';
    const result = await parseApiResponse(errorResponse(409, { code: 'ACTIVE_CONVERSATION_EXISTS', activeConversationId }), {
      kind: 'json', statuses: [201], errorContext: 'conversation_start',
    });
    expect(result).toMatchObject({ kind: 'http_error', error: { code: 'ACTIVE_CONVERSATION_EXISTS', activeConversationId } });
  });

  it.each([undefined, null, '', 'not-a-uuid'])('대화 시작 충돌의 필수 ID가 잘못되면 형식 실패다: %s', async (activeConversationId) => {
    expect(await parseApiResponse(errorResponse(409, { code: 'ACTIVE_CONVERSATION_EXISTS', activeConversationId }), {
      kind: 'json', statuses: [201], errorContext: 'conversation_start',
    })).toMatchObject({ kind: 'format_error', reason: 'invalid_envelope' });
  });

  it.each<[number, string, 'conversation_start' | undefined]>([
    [409, 'ACTIVE_CONVERSATION_EXISTS', undefined],
    [400, 'ACTIVE_CONVERSATION_EXISTS', 'conversation_start'],
    [409, 'CHILD_LIMIT_REACHED', 'conversation_start'],
    [409, 'CONVERSATION_CLOSING', 'conversation_start'],
  ])('일반 문맥/다른 상태·code에 확장을 노출하지 않는다: %#', async (status, code, errorContext) => {
    const result = await parseApiResponse(errorResponse(status, { code, activeConversationId: '33333333-3333-4333-8333-333333333333' }), {
      kind: 'json', statuses: [201], errorContext,
    });
    expect(result.kind).toBe('http_error');
    if (result.kind !== 'http_error') return;
    expect(result.error).not.toHaveProperty('activeConversationId');
  });

  it('성공·오류·형식 실패의 원문과 예외를 console에 기록하지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
    await parseApiResponse(jsonResponse({ data: { value: 'synthetic-password' } }), jsonExpectation);
    await parseApiResponse(errorResponse(400, { message: 'synthetic-pin' }), jsonExpectation);
    const response = jsonResponse({ data: {} });
    jest.spyOn(response, 'text').mockRejectedValue(new Error('synthetic-token'));
    const result = await parseApiResponse(response, jsonExpectation);
    expect(JSON.stringify(result)).not.toContain('synthetic-token');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

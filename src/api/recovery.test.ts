import { describe, expect, it } from '@jest/globals';
import { classifyRecovery, parseRetryAfter, type RecoveryOperation } from './recovery';
import { parseApiResponse, type ParsedApiResponse } from './response';

const headerId = '11111111-1111-4111-8111-111111111111';
const bodyId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const meta = { status: 200, headers: { requestId: headerId, location: null, retryAfter: null, contentType: 'application/json' } };
async function failure(status: number, code: string, extra: Record<string, unknown> = {}, retryAfter?: string) {
  return parseApiResponse(new Response(JSON.stringify({ error: { code, message: '시험 오류', requestId: bodyId, ...extra } }), {
    status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': headerId, ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
  }), { kind: 'json', statuses: [200] });
}

describe('Retry-After의 계약상 정수 초', () => {
  it.each<[string, number]>([['1', 1], ['60', 60], [' \t002\t ', 2], ['9007199254740991', 9007199254740991]])('%s를 정확한 초로 전달한다', (raw, seconds) => {
    expect(parseRetryAfter(raw)).toEqual({ kind: 'valid', seconds });
  });
  it('누락은 대기 시간이 확정되지 않은 상태다', () => {
    expect(parseRetryAfter(null)).toEqual({ kind: 'missing' });
  });
  it.each(['', ' ', '0', '00', '-1', '+1', '1.5', '1e2', '0x10', '1, 2', 'Infinity', 'NaN', '9007199254740992', '9007199254740993', '１', '\n1', '1\r', '\u00a01', 'Wed, 21 Oct 2015 07:28:00 GMT'])('%s를 기본 지연이나 즉시 재시도로 보정하지 않는다', (raw) => {
    expect(parseRetryAfter(raw)).toEqual({ kind: 'invalid' });
  });
});

describe('HTTP/code에 따른 순수 복구 분류', () => {
  it.each<[number, string, RecoveryOperation, string]>([
    [401, 'AUTHENTICATION_REQUIRED', 'general', 'authentication_required'],
    [401, 'LOGIN_FAILED', 'login', 'login_failed'],
    [403, 'CSRF_INVALID', 'general', 'csrf_invalid'],
    [403, 'PIN_SETUP_AUTHORIZATION_REQUIRED', 'general', 'pin_setup_authorization_required'],
    [403, 'PIN_RESET_AUTHORIZATION_REQUIRED', 'general', 'pin_reset_authorization_required'],
    [403, 'GUARDIAN_UNLOCK_REQUIRED', 'general', 'guardian_unlock_required'],
    [403, 'CHILD_SESSION_REQUIRED', 'general', 'child_session_required'],
    [403, 'SERVICE_HOURS_CLOSED', 'general', 'service_hours_closed'],
    [409, 'CONVERSATION_CLOSING', 'general', 'conversation_closing'],
    [409, 'CONVERSATION_ENDED', 'general', 'conversation_ended'],
    [400, 'VALIDATION_FAILED', 'general', 'validation_failed'],
    [400, 'VERIFICATION_INVALID', 'general', 'verification_invalid'],
    [400, 'PIN_INVALID', 'general', 'pin_invalid'],
    [404, 'RESOURCE_NOT_FOUND', 'general', 'resource_not_found'],
    [409, 'ACTIVE_CONVERSATION_EXISTS', 'general', 'active_conversation_exists'],
    [409, 'TURN_IN_PROGRESS', 'general', 'turn_in_progress'],
    [409, 'IDEMPOTENCY_CONFLICT', 'general', 'idempotency_conflict'],
    [409, 'PIN_ALREADY_SET', 'general', 'pin_already_set'],
    [409, 'PIN_NOT_SET', 'general', 'pin_not_set'],
    [409, 'CHILD_LIMIT_REACHED', 'general', 'child_limit_reached'],
    [409, 'ACCOUNT_ALREADY_EXISTS', 'general', 'account_already_exists'],
    [409, 'PASSWORD_RESET_NOT_AVAILABLE', 'general', 'password_reset_not_available'],
    [410, 'AUDIO_EXPIRED', 'general', 'audio_expired'],
    [413, 'REQUEST_TOO_LARGE', 'general', 'request_too_large'],
    [413, 'AUDIO_TOO_LARGE', 'general', 'audio_too_large'],
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'general', 'unsupported_media_type'],
    [415, 'AUDIO_FORMAT_UNSUPPORTED', 'general', 'audio_format_unsupported'],
    [422, 'STT_NO_SPEECH', 'general', 'stt_no_speech'],
    [502, 'AI_UPSTREAM_FAILED', 'general', 'ai_upstream_failed'],
    [504, 'AI_TIMEOUT', 'general', 'ai_timeout'],
    [503, 'AUTH_STATE_UNAVAILABLE', 'login', 'auth_state_unavailable'],
    [503, 'EMAIL_DELIVERY_UNAVAILABLE', 'general', 'email_delivery_unavailable'],
  ])('%i %s를 별도 복구 종류로 전달한다', async (status, code, operation, kind) => {
    const result = await failure(status, code);
    const decision = classifyRecovery(result, operation);
    expect(decision).toEqual({ kind, result });
    expect(decision.result).toBe(result);
  });

  it.each<[number, string, RecoveryOperation]>([
    [403, 'AUTHENTICATION_REQUIRED', 'general'], [401, 'CSRF_INVALID', 'general'],
    [401, 'LOGIN_FAILED', 'general'], [403, 'GUARDIAN_UNKNOWN', 'general'],
    [401, 'FUTURE_ERROR', 'general'], [500, 'AUTH_STATE_UNAVAILABLE', 'general'],
    [400, 'RATE_LIMITED', 'general'], [429, 'FUTURE_ERROR', 'general'],
  ])('미등록 조합 %i %s를 인증 만료나 재시도로 추측하지 않는다', async (status, code, operation) => {
    const result = await failure(status, code);
    expect(classifyRecovery(result, operation)).toEqual({ kind: 'unclassified', result });
  });

  it('fields 누락의 빈 배열과 서로 다른 본문/헤더 requestId를 보존한다', async () => {
    const result = await failure(401, 'AUTHENTICATION_REQUIRED');
    expect(classifyRecovery(result, 'general').result).toMatchObject({
      error: { code: 'AUTHENTICATION_REQUIRED', message: '시험 오류', requestId: bodyId, fields: [] },
      meta: { status: 401, headers: { requestId: headerId } },
    });
    const fields = [{ field: 'email', reason: 'invalid' }];
    const invalid = await failure(400, 'VALIDATION_FAILED', { fields });
    expect(classifyRecovery(invalid, 'general').result).toMatchObject({ error: { fields } });
  });

  it.each<[string | undefined, object]>([['2', { kind: 'valid', seconds: 2 }], [undefined, { kind: 'missing' }], ['0', { kind: 'invalid' }]])('429의 대기 정보 %s를 분리한다', async (raw, expected) => {
    const result = await failure(429, 'RATE_LIMITED', {}, raw);
    expect(classifyRecovery(result, 'general')).toEqual({ kind: 'rate_limited', retryAfter: expected, result });
  });

  it.each(['general', 'login'] as const)('일반 성공을 로그인 확정으로 치환하지 않는다: %s', (operation) => {
    const result: ParsedApiResponse = { kind: 'json', data: { authenticated: true }, meta };
    expect(classifyRecovery(result, operation)).toEqual({ kind: 'none', result });
  });
  it.each<ParsedApiResponse>([
    { kind: 'empty', meta: { ...meta, status: 204 } },
    { kind: 'bytes', bytes: new ArrayBuffer(1), meta },
    { kind: 'redirect', meta: { ...meta, status: 302 } },
  ])('$kind는 인증/복구 효과를 지시하지 않는다', (result) => {
    expect(classifyRecovery(result, 'general')).toEqual({ kind: 'none', result });
  });
  it.each<ParsedApiResponse>([
    { kind: 'format_error', reason: 'invalid_envelope', meta: { ...meta, status: 401 } },
    { kind: 'body_read_error', reason: 'read_failed', meta: { ...meta, status: 503 } },
  ])('$kind를 HTTP/code 오류로 추측하지 않고 원래 종류를 유지한다', (result) => {
    expect(classifyRecovery(result, 'general')).toEqual({ kind: 'unclassified', result });
  });
});

describe('end202 재확인의 제한된 문맥', () => {
  const pending = (data: unknown): ParsedApiResponse => ({ kind: 'json', data, meta: { ...meta, status: 202, headers: { ...meta.headers, retryAfter: '1' } } });
  it('정확한 EndPendingReceipt와 명시적인 end 문맥만 재확인 정보로 분류한다', () => {
    const result = pending({ conversationId, status: 'CLOSING' });
    expect(classifyRecovery(result, 'conversation_end')).toEqual({ kind: 'end_pending', retryAfter: { kind: 'valid', seconds: 1 }, result });
    expect(classifyRecovery(result, 'general')).toEqual({ kind: 'none', result });
  });
  it.each([null, [], {}, { conversationId, status: 'ENDED' }, { conversationId: 'invalid', status: 'CLOSING' }, { conversationId, status: 'CLOSING', extra: true }])('형식이 맞지 않는 end202는 재확인으로 분류하지 않는다: %j', (data) => {
    const result = pending(data);
    expect(classifyRecovery(result, 'conversation_end')).toEqual({ kind: 'unclassified', result });
  });
});

it.each<[string | null, object]>([[null, { kind: 'missing' }], ['bad', { kind: 'invalid' }]])('end202의 미확정 대기 %s를 즉시 재확인으로 바꾸지 않는다', (raw, retryAfter) => {
  const result: ParsedApiResponse = { kind: 'json', data: { conversationId, status: 'CLOSING' }, meta: { ...meta, status: 202, headers: { ...meta.headers, retryAfter: raw } } };
  expect(classifyRecovery(result, 'conversation_end')).toEqual({ kind: 'end_pending', result, retryAfter });
});

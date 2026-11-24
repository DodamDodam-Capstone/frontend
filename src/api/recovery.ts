import type { CsrfFailure } from './csrf';
import { parseApiResponse, readResponseMetadata, type ParsedApiResponse } from './response';

export type RecoveryOperation = 'general' | 'login' | 'conversation_end';
export type RetryAfterResult = { kind: 'valid'; seconds: number } | { kind: 'missing' | 'invalid' };

// HTTP만으로 세션 만료·재시도를 추측하지 않는다. 업무별 후속 처리는 호출부 소유다.
const errorKinds = {
  '400:VALIDATION_FAILED': 'validation_failed',
  '400:VERIFICATION_INVALID': 'verification_invalid',
  '400:PIN_INVALID': 'pin_invalid',
  '401:AUTHENTICATION_REQUIRED': 'authentication_required',
  '401:LOGIN_FAILED': 'login_failed',
  '403:CSRF_INVALID': 'csrf_invalid',
  '403:PIN_SETUP_AUTHORIZATION_REQUIRED': 'pin_setup_authorization_required',
  '403:PIN_RESET_AUTHORIZATION_REQUIRED': 'pin_reset_authorization_required',
  '403:GUARDIAN_UNLOCK_REQUIRED': 'guardian_unlock_required',
  '403:CHILD_SESSION_REQUIRED': 'child_session_required',
  '403:SERVICE_HOURS_CLOSED': 'service_hours_closed',
  '404:RESOURCE_NOT_FOUND': 'resource_not_found',
  '409:ACTIVE_CONVERSATION_EXISTS': 'active_conversation_exists',
  '409:CONVERSATION_CLOSING': 'conversation_closing',
  '409:CONVERSATION_ENDED': 'conversation_ended',
  '409:TURN_IN_PROGRESS': 'turn_in_progress',
  '409:IDEMPOTENCY_CONFLICT': 'idempotency_conflict',
  '409:PIN_ALREADY_SET': 'pin_already_set',
  '409:PIN_NOT_SET': 'pin_not_set',
  '409:CHILD_LIMIT_REACHED': 'child_limit_reached',
  '409:ACCOUNT_ALREADY_EXISTS': 'account_already_exists',
  '409:PASSWORD_RESET_NOT_AVAILABLE': 'password_reset_not_available',
  '410:AUDIO_EXPIRED': 'audio_expired',
  '413:REQUEST_TOO_LARGE': 'request_too_large',
  '413:AUDIO_TOO_LARGE': 'audio_too_large',
  '415:UNSUPPORTED_MEDIA_TYPE': 'unsupported_media_type',
  '415:AUDIO_FORMAT_UNSUPPORTED': 'audio_format_unsupported',
  '422:STT_NO_SPEECH': 'stt_no_speech',
  '502:AI_UPSTREAM_FAILED': 'ai_upstream_failed',
  '503:AUTH_STATE_UNAVAILABLE': 'auth_state_unavailable',
  '503:EMAIL_DELIVERY_UNAVAILABLE': 'email_delivery_unavailable',
  '504:AI_TIMEOUT': 'ai_timeout',
} as const;
export type RecoveryDecision = { result: ParsedApiResponse } & (
  | { kind: 'none' | 'unclassified' | typeof errorKinds[keyof typeof errorKinds] }
  | { kind: 'rate_limited' | 'end_pending'; retryAfter: RetryAfterResult }
);

export function parseRetryAfter(raw: string | null): RetryAfterResult {
  if (raw === null) return { kind: 'missing' };
  // HTTP OWS만 허용한다. 날짜·소수·오버플로를 0이나 임의 운영값으로 보정하지 않는다.
  const value = raw.replace(/^[ \t]+|[ \t]+$/g, '');
  const seconds = Number(value);
  return /^[0-9]+$/.test(value) && Number.isSafeInteger(seconds) && seconds >= 1
    ? { kind: 'valid', seconds } : { kind: 'invalid' };
}

function isEndPending(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  return Object.keys(value).length === 2 && value.status === 'CLOSING'
    && typeof value.conversationId === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.conversationId);
}

// 부수 효과 없는 분류다. 원래 오류·헤더를 보존하며 결과 전체를 로그에 남기지 않는다.
export function classifyRecovery(result: ParsedApiResponse, operation: RecoveryOperation): RecoveryDecision {
  if (result.kind === 'http_error') {
    const { status } = result.meta;
    const { code } = result.error;
    if (status === 429 && code === 'RATE_LIMITED') {
      return { kind: 'rate_limited', retryAfter: parseRetryAfter(result.meta.headers.retryAfter), result };
    }
    const kind = errorKinds[`${status}:${code}` as keyof typeof errorKinds];
    return { kind: kind && (kind !== 'login_failed' || operation === 'login') ? kind : 'unclassified', result };
  }
  if (result.kind === 'format_error' || result.kind === 'body_read_error') return { kind: 'unclassified', result };
  if (operation === 'conversation_end' && result.kind === 'json' && result.meta.status === 202) {
    // 최소 형식만 방어한다. 요청 ID 일치·현재 인증·복구 권한의 업무 검증은 호출부 책임이다.
    return isEndPending(result.data)
      ? { kind: 'end_pending', retryAfter: parseRetryAfter(result.meta.headers.retryAfter), result }
      : { kind: 'unclassified', result };
  }
  return { kind: 'none', result };
}

// 원시 Response는 공개 실패 객체에 넣지 않는다. 직렬화 시 본문·쿠키 노출을 막고
// 실패 객체가 사라지면 수거된다. body 읽기 Promise는 쿠키 응답 drain에 등록하지 않는다.
const csrfResponses = new WeakMap<CsrfFailure, { response: Response; parsed?: Promise<ParsedApiResponse> }>();
export function createCsrfHttpFailure(response: Response): CsrfFailure {
  const meta = readResponseMetadata(response);
  const id = meta.headers.requestId;
  const requestId = id && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id : undefined;
  const failure: CsrfFailure = { ok: false, reason: 'http', status: response.status, meta, ...(requestId ? { requestId } : {}) };
  csrfResponses.set(failure, { response });
  return failure;
}

// 같은 실패를 여러 수신자가 처리해도 본문은 한 번만 소비한다. 200은 전용 parser 소유다.
export async function readCsrfFailure(failure: CsrfFailure): Promise<ParsedApiResponse | undefined> {
  const stored = csrfResponses.get(failure);
  if (!stored) return undefined;
  stored.parsed ??= parseApiResponse(stored.response, { kind: 'json', statuses: [] });
  return stored.parsed;
}

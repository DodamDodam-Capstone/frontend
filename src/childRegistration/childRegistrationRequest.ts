import { isKstDateTime, isUuid } from '../api/accountView';
import type { ApiClient, ApiResult } from '../api/client';
import type { CsrfFailure } from '../api/csrf';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { prepareRequestBody } from '../api/requestBody';
import { parseApiResponse } from '../api/response';
import { childFieldMessages, isChildBirthDate, type ChildFieldErrors, type ChildRegistrationInput } from './childRegistrationData';

type ChildReadControls = {
  isCurrent: () => boolean;
  receiveProtectedAuthResult: (result: ApiResult, stillCurrent?: () => boolean) => Promise<boolean>;
};
type ChildWriteControls = ChildReadControls & { beforeSend: () => boolean };
export type ChildRegistrationResult =
  | { kind: 'ignored' }
  | { kind: 'check'; reason: 'created' | 'existing' | 'uncertain'; message: string; expectedChildId?: string }
  | { kind: 'rejected'; message: string; errors?: ChildFieldErrors; retryAt?: number };
export type RegisteredChildResult =
  | { kind: 'found'; childId: string }
  | { kind: 'unresolved'; retryAt?: number }
  | { kind: 'ignored' };

const uncertain = { kind: 'check', reason: 'uncertain', message: '등록 결과를 확인하고 있어요.' } as const;
const rateLimitMessage = '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';
const csrfMessage = '보안 확인을 마치지 못했어요. 다시 시도해 주세요.';
const inputMessage = '입력한 정보를 확인해 주세요.';
const edgeWhitespace = /^[\p{Z}\u0009-\u000d\u001c-\u001f]|[\p{Z}\u0009-\u000d\u001c-\u001f]$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProfileText(value: unknown, max: number) {
  return typeof value === 'string' && value.length > 0 && [...value].length <= max
    && !edgeWhitespace.test(value) && !/[\u0000\uD800-\uDFFF]/u.test(value);
}

function isChildView(value: unknown): value is { childId: string } {
  if (!isRecord(value) || Object.keys(value).length !== 8) return false;
  const { childId, name, nickname, birthDate, gender, interests, characterId, createdAt } = value;
  // 응답의 날짜는 기기 시계 대신 서버의 KST 생성일을 기준으로 검증한다.
  return typeof createdAt === 'string' && isKstDateTime(createdAt) && isChildBirthDate(birthDate, createdAt.slice(0, 10))
    && isUuid(childId) && isProfileText(name, 5) && isProfileText(nickname, 20)
    && (gender === 'MALE' || gender === 'FEMALE')
    && Array.isArray(interests) && interests.length <= 10 && new Set(interests).size === interests.length
    && interests.every(interest => isProfileText(interest, 30))
    && typeof characterId === 'string' && characterId.length >= 1 && characterId.length <= 64
    && !/[^A-Za-z0-9_-]/.test(characterId);
}

function retryAtFor(decision: RecoveryDecision, receivedAt: number): { retryAt?: number } {
  if (decision.kind === 'rate_limited' && decision.retryAfter.kind === 'valid') {
    const retryAt = receivedAt + decision.retryAfter.seconds * 1_000;
    if (Number.isSafeInteger(retryAt)) return { retryAt };
  }
  return {};
}

async function readCsrfLimit(failure: CsrfFailure | undefined, receivedAt: number) {
  if (failure?.reason !== 'http' || failure.status !== 429) return;
  const parsed = await readCsrfFailure(failure);
  if (!parsed) return;
  const decision = classifyRecovery(parsed, 'general');
  if (decision.kind === 'rate_limited') return retryAtFor(decision, receivedAt);
}

async function readProtectedResponse(
  result: Extract<ApiResult, { kind: 'response' }>,
  status: 200 | 201,
  receiveProtectedAuthResult: ChildReadControls['receiveProtectedAuthResult'],
  stillCurrent: () => boolean,
) {
  // 진입 컨트롤러는 소비하지 않은 본문을 복제해 인증 오류를 확인한다.
  if (result.response.status === 401 && await receiveProtectedAuthResult(result, stillCurrent)) return;
  if (!stillCurrent()) return;
  const parsed = await parseApiResponse(result.response, { kind: 'json', statuses: [status] });
  if (stillCurrent()) return parsed;
}

export async function requestChildRegistration(
  client: ApiClient, input: ChildRegistrationInput, controls: ChildWriteControls,
): Promise<ChildRegistrationResult> {
  const context = client.captureCurrentContext();
  const stillCurrent = () => controls.isCurrent() && client.isCurrentContext(context);
  if (!stillCurrent()) return { kind: 'ignored' };

  const { name, nickname, birthDate, gender, interests, characterId } = input;
  const body = prepareRequestBody({ kind: 'json', value: { name, nickname, birthDate, gender, interests, characterId } });
  if (!body.ok) return { kind: 'rejected', message: inputMessage };

  const result = await client.request({ method: 'POST', path: '/children', ...body.value },
    () => stillCurrent() && controls.beforeSend());
  if (!stillCurrent() || result.kind === 'stale_response') return { kind: 'ignored' };
  const receivedAt = Date.now();

  if (result.kind === 'not_sent') {
    if (result.reason === 'invalid_request') return { kind: 'rejected', message: inputMessage };
    if (result.reason !== 'csrf_unavailable') return { kind: 'ignored' };
    const limited = await readCsrfLimit(result.csrf, receivedAt);
    if (!stillCurrent()) return { kind: 'ignored' };
    return limited ? { kind: 'rejected', message: rateLimitMessage, ...limited } : { kind: 'rejected', message: csrfMessage };
  }
  if (result.kind === 'transport_error') return uncertain;

  const parsed = await readProtectedResponse(result, 201, controls.receiveProtectedAuthResult, stillCurrent);
  if (!parsed || !stillCurrent()) return { kind: 'ignored' };
  if (parsed.kind === 'json' && isChildView(parsed.data)
    && parsed.meta.headers.location === `/api/v1/children/${parsed.data.childId}`) {
    return { kind: 'check', reason: 'created', expectedChildId: parsed.data.childId, message: '아이 정보를 불러오고 있어요.' };
  }
  if (parsed.kind !== 'http_error') return uncertain;

  const decision = classifyRecovery(parsed, 'general');
  switch (decision.kind) {
    case 'validation_failed': {
      const errors: ChildFieldErrors = {};
      for (const { field } of parsed.error.fields) {
        if (Object.hasOwn(childFieldMessages, field)) {
          const key = field as keyof typeof childFieldMessages;
          errors[key] = childFieldMessages[key];
        }
      }
      return { kind: 'rejected', message: inputMessage, errors };
    }
    case 'child_limit_reached':
      return { kind: 'check', reason: 'existing', message: '이미 등록된 아이 정보를 확인하고 있어요.' };
    case 'rate_limited':
      return { kind: 'rejected', message: rateLimitMessage, ...retryAtFor(decision, receivedAt) };
    case 'csrf_invalid': {
      const recovery = await client.recoverCsrf(result.context);
      if (!stillCurrent()) return { kind: 'ignored' };
      if (recovery.kind === 'failed') {
        const limited = await readCsrfLimit(recovery.failure, Date.now());
        if (!stillCurrent()) return { kind: 'ignored' };
        if (limited) return { kind: 'rejected', message: rateLimitMessage, ...limited };
      }
      const ready = recovery.kind === 'refreshed' || recovery.kind === 'already_recovered';
      return { kind: 'rejected', message: ready ? '보안 확인을 다시 마쳤어요. 다시 등록해 주세요.' : csrfMessage };
    }
    case 'request_too_large':
      return { kind: 'rejected', message: '등록 요청의 크기가 너무 커요. 입력을 확인해 주세요.' };
    case 'unsupported_media_type':
      return { kind: 'rejected', message: '등록 요청 형식을 처리할 수 없어요.' };
    default:
      // 서버가 저장했는지 확정할 수 없는 응답은 조회로 확인한다.
      return uncertain;
  }
}

export async function requestRegisteredChild(client: ApiClient, controls: ChildReadControls): Promise<RegisteredChildResult> {
  const context = client.captureCurrentContext();
  const stillCurrent = () => controls.isCurrent() && client.isCurrentContext(context);
  if (!stillCurrent()) return { kind: 'ignored' };

  const result = await client.request({ method: 'GET', path: '/children' }, stillCurrent);
  if (!stillCurrent() || result.kind === 'stale_response') return { kind: 'ignored' };
  if (result.kind !== 'response') return { kind: 'unresolved' };
  const receivedAt = Date.now();

  const parsed = await readProtectedResponse(result, 200, controls.receiveProtectedAuthResult, stillCurrent);
  if (!parsed || !stillCurrent()) return { kind: 'ignored' };
  if (parsed.kind === 'json' && isRecord(parsed.data) && Object.keys(parsed.data).length === 1) {
    const { items } = parsed.data;
    if (Array.isArray(items) && items.length === 1 && isChildView(items[0])) {
      return { kind: 'found', childId: items[0].childId };
    }
  }
  return { kind: 'unresolved', ...retryAtFor(classifyRecovery(parsed, 'general'), receivedAt) };
}

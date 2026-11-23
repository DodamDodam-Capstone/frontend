import type { ApiClient, AuthContext, AuthOutcome } from '../api/client';
import type { CsrfResult } from '../api/csrf';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { parseApiResponse } from '../api/response';

export type LogoutResult = (
  | { kind: 'accepted'; csrfFailed: boolean }
  | { kind: 'expired' }
  | { kind: 'rejected'; feedback: string }
  | { kind: 'uncertain' }
  | { kind: 'ignored' }
) & { context?: AuthContext; retryAt?: number; csrfLimited?: true };

type LogoutDecision = { outcome: AuthOutcome; expired?: true; feedback?: string; retryAt?: number };

const csrfFeedback = '로그아웃 보안 확인에 실패했어요. 다시 시도해 주세요.';
const rateLimitFeedback = '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';

function retryAtFor(decision: RecoveryDecision, receivedAt: number): number | undefined {
  if (decision.kind === 'rate_limited' && decision.retryAfter.kind === 'valid') {
    return receivedAt + decision.retryAfter.seconds * 1000;
  }
}

async function classifyLogout(response: Response): Promise<LogoutDecision> {
  const receivedAt = Date.now();
  const parsed = await parseApiResponse(response, { kind: 'empty', statuses: [204] });
  if (parsed.kind === 'empty') return { outcome: 'changed' };

  const decision = classifyRecovery(parsed, 'general');
  switch (decision.kind) {
    case 'authentication_required':
      // 인증 만료에 따른 정리와 토큰 폐기는 공통 만료 처리에서 한 번 수행한다.
      return { outcome: 'unchanged', expired: true };
    case 'csrf_invalid':
      return { outcome: 'csrf_invalid' };
    case 'rate_limited':
      return { outcome: 'unchanged', feedback: rateLimitFeedback, retryAt: retryAtFor(decision, receivedAt) };
    case 'validation_failed':
    case 'request_too_large':
    case 'unsupported_media_type':
      return { outcome: 'unchanged', feedback: '로그아웃 요청을 처리할 수 없어요.' };
    default:
      // 503이나 계약과 다른 응답 뒤에는 서버 세션을 다시 확인한다.
      return { outcome: 'unknown' };
  }
}

async function csrfRateLimit(result: CsrfResult | undefined, receivedAt: number) {
  if (result?.ok !== false || result.reason !== 'http' || result.status !== 429) return;
  const parsed = await readCsrfFailure(result);
  if (!parsed) return;
  const decision = classifyRecovery(parsed, 'general');
  if (decision.kind === 'rate_limited') {
    const retryAt = retryAtFor(decision, receivedAt);
    return { retryAt, csrfLimited: retryAt === undefined ? undefined : true as const };
  }
}

export async function submitLogoutRequest(client: ApiClient, onConfirmed?: () => void): Promise<LogoutResult> {
  const classified: { decision?: LogoutDecision } = {};
  const { context, operation, outcome, refresh } = await client.authTransition(
    { method: 'POST', path: '/auth/logout' },
    async (response) => {
      const decision = await classifyLogout(response);
      classified.decision = decision;
      // 204 확정과 익명 CSRF 발급은 별개다. 발급 대기 중에도 보호 화면을 정리한다.
      if (decision.outcome === 'changed') onConfirmed?.();
      return decision.outcome;
    },
  );
  const receivedAt = Date.now();

  if (outcome === 'unknown') return { kind: 'uncertain', context };
  if (classified.decision?.expired) return { kind: 'expired', context };

  const preflight = operation.kind === 'not_sent' && operation.reason === 'csrf_unavailable';
  const limited = await csrfRateLimit(preflight ? operation.csrf : refresh, receivedAt);
  if (outcome === 'changed') return { kind: 'accepted', csrfFailed: refresh?.ok !== true, context, ...limited };
  if (limited) return { kind: 'rejected', feedback: rateLimitFeedback, context, ...limited };
  if (outcome === 'csrf_invalid') return {
    kind: 'rejected', context,
    feedback: refresh?.ok ? '보안 확인을 다시 마쳤어요. 로그아웃을 다시 눌러 주세요.' : csrfFeedback,
  };
  if (preflight) return { kind: 'rejected', feedback: csrfFeedback, context };
  if (classified.decision?.feedback) return {
    kind: 'rejected', feedback: classified.decision.feedback, context, retryAt: classified.decision.retryAt,
  };
  return { kind: 'ignored', context };
}

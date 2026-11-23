import { isAccountView } from '../api/accountView';
import type { ApiClient, AuthOutcome } from '../api/client';
import type { CsrfResult } from '../api/csrf';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { prepareRequestBody } from '../api/requestBody';
import { parseApiResponse } from '../api/response';

export type LoginFeedback = { message: string; fields?: { email?: string; password?: string }; retryAt?: number };
export type EmailLoginResult =
  | { kind: 'accepted'; csrfFailed: boolean; retryAt?: number }
  | { kind: 'uncertain'; feedback: LoginFeedback }
  | { kind: 'rejected'; feedback: LoginFeedback; retryAt?: number; csrfLimited?: true };

type LoginDecision = { outcome: AuthOutcome; feedback?: LoginFeedback; retryAt?: number };

const uncertainFeedback = { message: '로그인 결과를 확인할 수 없어요. 로그인 상태를 다시 확인해 주세요.' };
const csrfFeedback = { message: '로그인 요청을 준비할 수 없어요. 다시 시도해 주세요.' };
const rateLimitFeedback = { message: '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.' };
const inputFeedback = { message: '입력한 이메일과 비밀번호를 확인해 주세요.' };

function retryAtFor(decision: RecoveryDecision, receivedAt: number): number | undefined {
  if (decision.kind === 'rate_limited' && decision.retryAfter.kind === 'valid') {
    return receivedAt + decision.retryAfter.seconds * 1000;
  }
}

async function classifyLogin(response: Response): Promise<LoginDecision> {
  const receivedAt = Date.now();
  const parsed = await parseApiResponse(response, { kind: 'json', statuses: [200] });
  if (parsed.kind === 'json' && isAccountView(parsed.data)) return { outcome: 'changed' };
  if (parsed.kind !== 'http_error') return { outcome: 'unknown' };

  const decision = classifyRecovery(parsed, 'login');
  switch (decision.kind) {
    case 'validation_failed': {
      const fields: NonNullable<LoginFeedback['fields']> = {};
      for (const issue of parsed.error.fields) {
        if (issue.field === 'email') fields.email = '이메일을 확인해 주세요.';
        if (issue.field === 'password') fields.password = '비밀번호를 확인해 주세요.';
      }
      return { outcome: 'unchanged', feedback: { ...inputFeedback, fields } };
    }
    case 'login_failed':
      return { outcome: 'unchanged', feedback: { message: '이메일 또는 비밀번호가 올바르지 않아요.' } };
    case 'request_too_large':
      return { outcome: 'unchanged', feedback: { message: '로그인 요청의 크기가 너무 커요. 입력을 확인해 주세요.' } };
    case 'unsupported_media_type':
      return { outcome: 'unchanged', feedback: { message: '로그인 요청 형식을 처리할 수 없어요.' } };
    case 'rate_limited':
      return { outcome: 'unchanged', feedback: rateLimitFeedback, retryAt: retryAtFor(decision, receivedAt) };
    case 'csrf_invalid':
      return { outcome: 'csrf_invalid' };
    default:
      // 세션 저장 503과 계약과 다른 응답은 실제 서버 세션 상태를 확인해야 한다.
      return { outcome: 'unknown' };
  }
}

async function csrfRateLimit(result: CsrfResult | undefined, receivedAt: number) {
  if (result?.ok !== false || result.reason !== 'http' || result.status !== 429) return;
  const parsed = await readCsrfFailure(result);
  if (!parsed) return;
  const decision = classifyRecovery(parsed, 'login');
  if (decision.kind === 'rate_limited') return { retryAt: retryAtFor(decision, receivedAt) };
}

export async function submitEmailLogin(client: ApiClient, email: string, password: string): Promise<EmailLoginResult> {
  const fields: NonNullable<LoginFeedback['fields']> = {};
  if (email.trim() === '') fields.email = '이메일을 입력해 주세요.';
  if (password === '') fields.password = '비밀번호를 입력해 주세요.';
  if (fields.email || fields.password) return { kind: 'rejected', feedback: { ...inputFeedback, fields } };

  const body = prepareRequestBody({ kind: 'json', value: { email, password } });
  if (!body.ok) return { kind: 'rejected', feedback: inputFeedback };

  const classified: { result?: LoginDecision } = {};
  const transition = await client.authTransition({ method: 'POST', path: '/auth/login', ...body.value }, async (response) => {
    classified.result = await classifyLogin(response);
    return classified.result.outcome;
  });
  const { outcome, operation, refresh } = transition;
  const receivedAt = Date.now();

  if (outcome === 'unknown') return { kind: 'uncertain', feedback: uncertainFeedback };

  const preflightFailed = operation.kind === 'not_sent' && operation.reason === 'csrf_unavailable';
  const limited = await csrfRateLimit(preflightFailed ? operation.csrf : refresh, receivedAt);

  if (outcome === 'changed') {
    return { kind: 'accepted', csrfFailed: refresh?.ok !== true, ...(limited?.retryAt ? { retryAt: limited.retryAt } : {}) };
  }
  if (limited) {
    return { kind: 'rejected', feedback: rateLimitFeedback,
      ...(limited.retryAt ? { retryAt: limited.retryAt, csrfLimited: true } : {}),
    };
  }
  if (outcome === 'csrf_invalid' && refresh?.ok) {
    return { kind: 'rejected', feedback: { message: '보안 확인을 다시 마쳤어요. 다시 로그인해 주세요.' } };
  }
  if (preflightFailed || outcome === 'csrf_invalid') return { kind: 'rejected', feedback: csrfFeedback };

  const decision = classified.result;
  if (decision?.feedback) {
    return { kind: 'rejected', feedback: decision.feedback, ...(decision.retryAt ? { retryAt: decision.retryAt } : {}) };
  }
  return { kind: 'rejected', feedback: { message: '로그인을 시작하지 못했어요. 다시 시도해 주세요.' } };
}

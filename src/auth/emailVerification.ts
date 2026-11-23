import { isAccountEmail } from '../api/accountView';
import type { ApiClient, ApiResult, AuthContext } from '../api/client';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { prepareRequestBody } from '../api/requestBody';
import { parseApiResponse } from '../api/response';

export type VerificationPurpose = 'SIGNUP' | 'RESET_PASSWORD' | 'PIN_SETUP' | 'PIN_RESET';
type Step = 'form' | 'email' | 'code' | 'success' | 'verified';
type RateScope = 'issue' | 'verify' | 'csrf';
type PinFailure = Extract<RecoveryDecision['kind'], 'authentication_required' | 'pin_setup_authorization_required'
  | 'pin_reset_authorization_required' | 'pin_already_set' | 'pin_not_set'>;
export type VerificationSnapshot = Readonly<{
  step: Step;
  email: string;
  busy: boolean;
  message?: string;
  expiresAt?: number;
  tokenExpiresAt?: number;
  issueRetryAt?: number;
  verifyRetryAt?: number;
  challengeId?: string;
}>;
export type EmailVerificationFlow = ReturnType<typeof createEmailVerification>;

const issuePath = '/auth/email-verifications';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limited = '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.';
const uncertain = '요청 결과를 확인할 수 없어요. 인증번호를 새로 받아 주세요.';
const expired = '인증 시간이 지났어요. 인증번호를 새로 받아 주세요.';
const security = '보안 확인이 필요해요. 잠시 후 다시 시도해 주세요.';

// OpenAPI의 KST 소수 초(최대 6자리)를 양 OS에서 같은 절대 시각으로 읽는다.
function deadline(value: unknown): number | undefined {
  if (typeof value !== 'string') return;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\+09:00$/.exec(value);
  if (!match || match[0] !== value) return;
  const fraction = (match[2] ?? '').padEnd(6, '0');
  const calendar = match[1] + '.' + fraction.slice(0, 3);
  const local = Date.parse(calendar + 'Z');
  if (!Number.isFinite(local) || new Date(local).toISOString() !== calendar + 'Z') return;
  // Date.now() 단위에서 최초로 now >= expiry가 되는 밀리초.
  return Date.parse(calendar + '+09:00') + (Number(fraction.slice(3)) > 0 ? 1 : 0);
}

// BE EmailAddress.normalize의 Java isWhitespace/isSpaceChar와 같은 바깥 공백만 처리한다.
function validEmail(value: string) {
  const trimmed = value.replace(/^[\p{Z}\u0009-\u000d\u001c-\u001f]+|[\p{Z}\u0009-\u000d\u001c-\u001f]+$/gu, '');
  return isAccountEmail(trimmed.toLowerCase());
}

function verifiedData(data: unknown, challengeId?: string) {
  if (!data || typeof data !== 'object' || Object.keys(data).length !== 2) return;
  const fields = data as Record<string, unknown>;
  if (challengeId === undefined) {
    const id = fields.challengeId;
    const expiresAt = deadline(fields.expiresAt);
    if (typeof id === 'string' && id.length === 36 && uuid.test(id) && expiresAt !== undefined) {
      return { kind: 'challenge', challengeId: id, expiresAt } as const;
    }
  } else {
    const token = fields.verificationToken;
    const tokenExpiresAt = deadline(fields.tokenExpiresAt);
    if (typeof token === 'string' && token.length === 80 && token.slice(0, 36).toLowerCase() === challengeId.toLowerCase()
        && /^\.[A-Za-z0-9_-]{43}$/.test(token.slice(36)) && tokenExpiresAt !== undefined) {
      return { kind: 'grant', token, tokenExpiresAt } as const;
    }
  }
}

/** 한 화면 흐름이 소유한다. 공개 snapshot에 코드와 일회성 토큰을 넣지 않는다. */
type VerificationOptions = {
  receiveProtectedAuthResult?: (result: ApiResult) => Promise<boolean>;
  isActive?: () => boolean;
  entryCsrf?: () => Promise<void> | undefined;
  onCsrfLimited?: (deadline: number) => void;
  onPinUnavailable?: (reason: PinFailure) => void;
};

export function createEmailVerification(client: ApiClient, purpose: VerificationPurpose, options: VerificationOptions = {}) {
  const { receiveProtectedAuthResult, isActive = () => true } = options;
  const pin = purpose === 'PIN_SETUP' || purpose === 'PIN_RESET';
  const listeners = new Set<() => void>();
  let state: VerificationSnapshot = { email: '', step: 'form', busy: false };
  let pending: AbortController | undefined;
  let scope: AuthContext | undefined;
  let token: string | undefined;

  function update(next: VerificationSnapshot) {
    state = next;
    listeners.forEach(listener => listener());
  }

  function clear(step: Step, message?: string) {
    token = undefined;
    scope = undefined;
    update({ step, email: state.email, ...limits(), busy: false, message });
  }

  function limits() {
    return { issueRetryAt: state.issueRetryAt, verifyRetryAt: state.verifyRetryAt };
  }

  function authorizationFailed(reason: PinFailure, message: string) {
    clear(pin ? 'form' : 'email', message);
    if (pin) options.onPinUnavailable?.(reason);
  }

  function cancelPending() {
    const prior = pending;
    pending = undefined;
    prior?.abort();
  }

  function reset() {
    cancelPending();
    scope = undefined;
    token = undefined;
    update({ email: '', step: 'form', busy: false });
  }

  function syncTime() {
    const now = Date.now();
    const issueRetryAt = (state.issueRetryAt ?? 0) > now ? state.issueRetryAt : undefined;
    const verifyRetryAt = (state.verifyRetryAt ?? 0) > now ? state.verifyRetryAt : undefined;
    if (state.issueRetryAt !== issueRetryAt || state.verifyRetryAt !== verifyRetryAt) {
      update({ ...state, issueRetryAt, verifyRetryAt,
        message: !issueRetryAt && !verifyRetryAt && state.message === limited ? undefined : state.message });
    }
    if (scope && !client.isCurrentContext(scope)) {
      reset();
    } else if (!pending && ((state.expiresAt !== undefined && state.expiresAt <= now)
        || (state.tokenExpiresAt !== undefined && state.tokenExpiresAt <= now))) {
      clear(state.step === 'form' || state.step === 'verified' ? 'form' : 'email', expired);
    }
  }

  function setEmail(email: string) {
    if (pin || email === state.email || !isActive()) return;
    cancelPending();
    token = undefined;
    scope = undefined;
    update({ email, busy: false, step: state.step === 'form' || state.step === 'verified' ? 'form' : 'email',
      ...limits() });
  }

  function openEmail() {
    if (!isActive() || pending) return;
    syncTime();
    if (state.step !== 'form' && state.step !== 'verified') return;
    if (!pin && !validEmail(state.email)) {
      update({ ...state, message: '이메일 주소를 확인해 주세요.' });
      return;
    }
    update({ ...state, step: state.challengeId ? 'code' : 'email',
      message: state.issueRetryAt || (state.challengeId && state.verifyRetryAt) ? limited : undefined });
  }

  function closeDialog() {
    if (!isActive()) return;
    if (state.step === 'success') { finish(); return; }
    if (state.step === 'verified' || state.step === 'form') return;
    if (pending) {
      cancelPending();
      clear('form', uncertain);
      return;
    }
    update({ ...state, step: token ? 'verified' : 'form', message: undefined });
  }

  function finish() {
    if (!isActive()) return;
    syncTime();
    if (state.step === 'success' && token) update({ ...state, step: 'verified' });
  }

  function takeToken(expected: VerificationPurpose) {
    if (expected !== purpose || !isActive()) return;
    syncTime();
    if (state.step !== 'verified' || !token) return;
    const value = token;
    clear('form');
    return value;
  }

  function suspend() {
    if (pending) {
      cancelPending();
      clear('email', uncertain);
    } else if (!pin) {
      // /me 재확인으로 익명 인증 문맥도 바뀐다. 같은 가입 화면 복원 여부는 진입 컨트롤러가 판정한다.
      scope = undefined;
    }
  }

  function deferUntil(deadline: number, target: RateScope = 'csrf') {
    if (deadline <= Date.now()) return;
    const issueRetryAt = target === 'verify' ? state.issueRetryAt : Math.max(deadline, state.issueRetryAt ?? 0);
    const verifyRetryAt = target === 'issue' ? state.verifyRetryAt : Math.max(deadline, state.verifyRetryAt ?? 0);
    update({ ...state, issueRetryAt, verifyRetryAt, message: limited });
  }

  function setRateLimit(decision: Extract<RecoveryDecision, { retryAfter: unknown }>, receivedAt: number, target: RateScope) {
    if (decision.retryAfter.kind !== 'valid') { update({ ...state, message: limited }); return; }
    const deadline = receivedAt + decision.retryAfter.seconds * 1000;
    deferUntil(deadline, target);
    if (target === 'csrf') options.onCsrfLimited?.(deadline);
  }

  async function submit(code?: string) {
    if (!isActive() || pending) return;
    syncTime();
    const verifying = code !== undefined;
    const waiting = () => ((verifying ? state.verifyRetryAt : state.issueRetryAt) ?? 0) > Date.now();
    if (waiting()) return;
    if (state.step !== 'code' && (verifying || state.step !== 'email')) return;
    const id = verifying ? state.challengeId : undefined;
    if (verifying && (!id || code.length !== 6 || !/^[0-9]{6}$/.test(code))) {
      update({ ...state, message: '이메일로 받은 숫자 6자리를 입력해 주세요.' });
      return;
    }
    if (!verifying && !pin && !validEmail(state.email)) {
      update({ ...state, message: '이메일 주소를 입력해 주세요.' });
      return;
    }

    const context = client.captureCurrentContext();
    if (!context) return;
    const value = verifying ? { challengeId: id, code } : pin ? { purpose } : { purpose, email: state.email };
    const body = prepareRequestBody({ kind: 'json', value });
    if (!body.ok) return;
    const attempt = new AbortController();
    pending = attempt;
    update({ ...state, busy: true, message: undefined });
    const current = () => pending === attempt && isActive() && client.isCurrentContext(context);
    try {
      const checking = options.entryCsrf?.();
      if (checking) {
        await checking;
        if (!current() || waiting()) return;
        if (verifying && (state.expiresAt ?? 0) <= Date.now()) { clear('email', expired); return; }
      }
      const result = await client.request({
        method: 'POST', path: verifying ? issuePath + '/verify' : issuePath, ...body.value, signal: attempt.signal,
      });
      if (!current()) return;
      const receivedAt = Date.now();
      if (result.kind === 'not_sent') {
        const failure = result.reason === 'csrf_unavailable' && result.csrf ? await readCsrfFailure(result.csrf) : undefined;
        if (!current()) return;
        const decision = failure && classifyRecovery(failure, 'general');
        if (decision?.kind === 'rate_limited') setRateLimit(decision, receivedAt, 'csrf');
        else update({ ...state, message: security });
        return;
      }
      if (result.kind !== 'response') { clear('email', uncertain); return; }
      if (pin && result.response.status === 401 && receiveProtectedAuthResult) {
        if (await receiveProtectedAuthResult(result)) {
          if (pending === attempt) authorizationFailed('authentication_required', '다시 로그인한 뒤 인증해 주세요.');
          return;
        }
        if (!current()) return;
      }

      const parsed = await parseApiResponse(result.response, { kind: 'json', statuses: [200] });
      if (!current()) return;
      if (parsed.kind === 'json') {
        const next = verifiedData(parsed.data, id);
        if (!next) { clear('email', uncertain); return; }
        scope = result.context;
        if (next.kind === 'challenge' && next.expiresAt > Date.now()) {
          token = undefined;
          update({ ...limits(), email: state.email, step: 'code', busy: false, challengeId: next.challengeId, expiresAt: next.expiresAt });
        } else if (next.kind === 'grant' && next.tokenExpiresAt > Date.now()) {
          token = next.token;
          update({ ...limits(), email: state.email, step: 'success', busy: false, tokenExpiresAt: next.tokenExpiresAt });
        } else clear('email', expired);
        return;
      }

      const decision = classifyRecovery(parsed, 'general');
      switch (decision.kind) {
        case 'rate_limited':
          setRateLimit(decision, receivedAt, verifying ? 'verify' : 'issue'); break;
        case 'validation_failed':
          update({ ...state, message: verifying ? '인증번호 입력을 확인해 주세요.' : '이메일 주소를 확인해 주세요.' }); break;
        case 'verification_invalid':
          update({ ...state, message: '인증번호를 확인하거나 새 번호를 받아 주세요.' }); break;
        case 'csrf_invalid': {
          const recovered = await client.recoverCsrf(result.context);
          if (!current()) return;
          const error = recovered.kind === 'failed' ? await readCsrfFailure(recovered.failure) : undefined;
          if (!current()) return;
          const limit = error && classifyRecovery(error, 'general');
          if (limit?.kind === 'rate_limited') setRateLimit(limit, Date.now(), 'csrf');
          else update({ ...state, message: security });
          break;
        }
        case 'authentication_required': authorizationFailed(decision.kind, '다시 로그인한 뒤 인증해 주세요.'); break;
        case 'pin_setup_authorization_required':
        case 'pin_reset_authorization_required': authorizationFailed(decision.kind, '현재 계정에서 이메일 인증을 다시 시작해 주세요.'); break;
        case 'pin_already_set': authorizationFailed(decision.kind, '이미 보호자 PIN이 설정되어 있어요.'); break;
        case 'pin_not_set': authorizationFailed(decision.kind, '설정된 보호자 PIN이 없어요.'); break;
        case 'email_delivery_unavailable': clear('email', '메일을 보낼 수 없어요. 잠시 후 새 번호를 요청해 주세요.'); break;
        case 'auth_state_unavailable': clear('email', '인증 상태를 확인할 수 없어요. 잠시 후 새 번호를 요청해 주세요.'); break;
        default: clear('email', uncertain);
      }
    } catch {
      if (current()) clear('email', uncertain);
    } finally {
      if (pending === attempt) {
        pending = undefined;
        if (state.busy) {
          if (!isActive() || !client.isCurrentContext(context)) clear('email', uncertain);
          else update({ ...state, busy: false });
        }
        syncTime();
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setEmail, openEmail, closeDialog, finish, suspend, reset, syncTime, takeToken, deferUntil,
    issue: () => submit(),
    verify: (code: string) => submit(code),
  };
}

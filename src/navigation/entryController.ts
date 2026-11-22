import type { ApiClient, ApiResult, AuthContext } from '../api/client';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { parseApiResponse } from '../api/response';
import { ROUTES, type RoutePath } from './routes';

type EntryError = {
  kind: 'error';
  reason: 'request_failed' | 'auth_state_unavailable' | 'rate_limited' | 'invalid_response' | 'csrf_unavailable';
  retryAt?: number;
};
type EntryRoute = { kind: 'route'; route: RoutePath };
type EntryAttempt = {
  aborter: AbortController;
  finishCancelled: () => void;
  context: AuthContext;
  account?: EntryRoute | EntryError;
  csrf?: { kind: 'ready' } | EntryError;
};

export type EntrySnapshot = { kind: 'loading' } | EntryRoute | EntryError;

const loading = { kind: 'loading' } as const;
const jsonResponse = { kind: 'json', statuses: [200] } as const;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const kstSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}

function isAccountEmail(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 254 || /[^!-~]/.test(value)) return false;
  // 서버가 검증한 주소에 따옴표로 감싼 로컬 부분과 주소 리터럴도 포함될 수 있다.
  const separator = value.lastIndexOf('@');
  return separator > 0 && separator < value.length - 1;
}

function isKstDateTime(value: unknown): boolean {
  if (typeof value !== 'string' || value.length !== 25 || !kstSeconds.test(value)) return false;
  // UTC는 비교 표기일 뿐이다. 달력에 없는 날이나 24시를 JS가 정규화하면 거절한다.
  const localTime = `${value.slice(0, -6)}.000Z`;
  const time = Date.parse(localTime);
  return Number.isFinite(time) && new Date(time).toISOString() === localTime;
}

function routeForAccount(value: unknown): RoutePath | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  const { accountId, email: address, childId, hasPin, guardianUnlockedUntil } = value as Record<string, unknown>;
  if (Object.keys(value).length !== 5 || !isUuid(accountId) || !isAccountEmail(address) || typeof hasPin !== 'boolean'
    || (guardianUnlockedUntil !== null && !isKstDateTime(guardianUnlockedUntil))) return;
  if (childId === null) return ROUTES.childRegistration;
  if (isUuid(childId)) return ROUTES.home;
}

function rateLimit(decision: RecoveryDecision, receivedAt: number): EntryError | undefined {
  if (decision.kind !== 'rate_limited') return;
  return decision.retryAfter.kind === 'valid' ? {
    kind: 'error', reason: 'rate_limited', retryAt: receivedAt + decision.retryAfter.seconds * 1000,
  } : { kind: 'error', reason: 'rate_limited' };
}

async function prepareCsrf(client: ApiClient): Promise<NonNullable<EntryAttempt['csrf']>> {
  const result = await client.prepareCsrf();
  if (result.ok) return { kind: 'ready' };
  if (result.reason === 'http' && result.status === 429) {
    const receivedAt = Date.now();
    const parsed = await readCsrfFailure(result);
    const limited = parsed && rateLimit(classifyRecovery(parsed, 'general'), receivedAt);
    if (limited) return limited;
  }
  return { kind: 'error', reason: 'csrf_unavailable' };
}

function combineFailures(account: EntryError | undefined, csrf: EntryError | undefined): EntryError | undefined {
  if (account?.reason !== 'rate_limited') return csrf?.reason === 'rate_limited' ? csrf : account ?? csrf;
  return (csrf?.retryAt ?? 0) > (account.retryAt ?? 0) ? csrf : account;
}

export function createEntryController(client: ApiClient) {
  let snapshot: EntrySnapshot = loading;
  const listeners = new Set<() => void>();
  let mounted = false;
  let mountId = 0;
  let currentAttempt: EntryAttempt | undefined;
  let retryAt = 0;

  function publish(next: EntrySnapshot) {
    if (snapshot === next) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function cancelAttempt() {
    const previous = currentAttempt;
    currentAttempt = undefined;
    previous?.aborter.abort();
    previous?.finishCancelled();
  }

  function discardAttempt() {
    cancelAttempt();
    publish(loading);
  }

  function isCurrentAttempt(attempt: EntryAttempt): boolean {
    if (currentAttempt !== attempt) return false;
    if (client.isCurrentContext(attempt.context)) return true;
    discardAttempt();
    return false;
  }

  function receiveExpiry(context: AuthContext): boolean {
    return client.expireIfCurrent(context, () => {
      cancelAttempt();
      publish({ kind: 'route', route: ROUTES.login });
    });
  }

  function publishAttempt(attempt: EntryAttempt) {
    if (!isCurrentAttempt(attempt)) return;
    const account = attempt.account;
    const csrf = attempt.csrf;
    const failure = combineFailures(account?.kind === 'error' ? account : undefined, csrf?.kind === 'error' ? csrf : undefined);
    const next = failure ?? (account?.kind === 'route' && csrf?.kind === 'ready' ? account : undefined);
    if (!next) return;
    // 계정 응답을 기다리는 동안 CSRF 실패는 알리되, 보호 화면은 두 결과가 모두 준비된 뒤에 결정한다.
    client.commitIfCurrent(attempt.context, () => {
      retryAt = Math.max(retryAt, failure?.retryAt ?? 0);
      publish(next);
    });
  }

  async function checkAccount(attempt: EntryAttempt) {
    const result = await client.request({ method: 'GET', path: '/auth/me', signal: attempt.aborter.signal });
    if (!isCurrentAttempt(attempt)) return;
    if (result.kind === 'stale_response' || (result.kind === 'not_sent' && result.reason !== 'invalid_request')) {
      discardAttempt();
      return;
    }
    if (result.kind === 'not_sent') {
      attempt.account = { kind: 'error', reason: 'invalid_response' };
    } else {
      if (result.kind === 'transport_error') {
        attempt.account = { kind: 'error', reason: 'request_failed' };
      } else {
        const receivedAt = Date.now();
        const parsed = await parseApiResponse(result.response, jsonResponse);
        if (!isCurrentAttempt(attempt)) return;
        const decision = classifyRecovery(parsed, 'general');
        if (decision.kind === 'authentication_required') {
          // CSRF 실패나 지연은 확정된 미인증 구분을 막지 않는다.
          receiveExpiry(result.context);
          return;
        }
        const route = parsed.kind === 'json' ? routeForAccount(parsed.data) : undefined;
        attempt.account = route ? { kind: 'route', route } : rateLimit(decision, receivedAt) ?? {
          kind: 'error', reason: decision.kind === 'auth_state_unavailable' ? 'auth_state_unavailable' : 'invalid_response',
        };
      }
    }
    publishAttempt(attempt);
  }

  async function refresh(): Promise<void> {
    if (!mounted) return;
    if (retryAt > Date.now()) {
      if (snapshot.kind !== 'error' || snapshot.retryAt !== retryAt) {
        publish({ kind: 'error', reason: 'rate_limited', retryAt });
      }
      return;
    }
    discardAttempt();
    const context = client.captureCurrentContext();
    if (!context) return;
    let finishCancelled!: () => void;
    const cancelled = new Promise<void>((resolve) => { finishCancelled = resolve; });
    const attempt: EntryAttempt = { aborter: new AbortController(), finishCancelled, context };
    currentAttempt = attempt;

    try {
      // Strict Mode에서 즉시 정리된 첫 실행은 전송하지 않는다.
      await Promise.resolve();
      if (!isCurrentAttempt(attempt)) return;
      const csrf = prepareCsrf(client).then((result) => {
        attempt.csrf = result;
        publishAttempt(attempt);
      });
      await Promise.race([Promise.all([csrf, checkAccount(attempt)]), cancelled]);
    } finally {
      if (currentAttempt === attempt) currentAttempt = undefined;
    }
  }

  function start(): Promise<void> {
    mounted = true;
    return refresh();
  }

  async function retry(): Promise<void> {
    if (snapshot.kind === 'error') await refresh();
  }

  function stop() {
    mounted = false;
    mountId += 1;
    discardAttempt();
  }

  async function receiveProtectedAuthResult(result: ApiResult): Promise<boolean> {
    if (!mounted || result.kind !== 'response' || result.response.status !== 401 || !client.isCurrentContext(result.context)) return false;
    const receivedOnMount = mountId;
    let response: Response;
    try {
      response = result.response.clone();
    } catch {
      // 호출부에서 이미 소비한 본문으로 만료를 단정할 수 없다.
      return false;
    }
    const parsed = await parseApiResponse(response, jsonResponse);
    return mounted && mountId === receivedOnMount && classifyRecovery(parsed, 'general').kind === 'authentication_required'
      && receiveExpiry(result.context);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start, refresh, retry, stop, receiveProtectedAuthResult,
  };
}

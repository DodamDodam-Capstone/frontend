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

export type EntrySnapshot = { kind: 'loading' } | (EntryRoute & { visit: number; generation: number }) | EntryError;

const loading = { kind: 'loading' } as const;
const jsonResponse = { kind: 'json', statuses: [200] } as const;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const kstSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;
const emailAtom = /[a-z\d!#$%&'*+/=?^_`{|}~-]+/.source;
const quotedEmailAtom = /"(?:[a-z\d!#$%&'*.(),<>[\]:;@+/=?^_`{|}~-]|\\["\\])+"/.source;
const emailWord = `(?:${emailAtom}|${quotedEmailAtom})`;
const emailLocalPart = new RegExp(`^${emailWord}(?:\\.${emailWord})*$`, 'i');
const emailLabelAtom = /[a-z\d!#$%&'*+/=?^_`{|}~]+/.source;
const emailDomainLabel = new RegExp(`^${emailLabelAtom}(?:-+${emailLabelAtom})*$`, 'i');

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}

function isIpv6EmailLiteral(address: string): boolean {
  const halves = address.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => half === '' ? [] : half.split(':'));
  const tail = groups.at(-1);
  let size = groups.length;
  if (tail?.includes('.')) {
    const octet = /^(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/;
    const octets = tail.split('.');
    if (!address.endsWith(tail) || octets.length !== 4 || !octets.every((part) => octet.test(part))) return false;
    groups.pop();
    size += 1; // IPv4 꼬리는 16비트 그룹 두 개를 사용한다.
  }
  return groups.every((part) => /^[\da-f]{1,4}$/i.test(part)) && (halves.length === 2 ? size < 8 : size === 8);
}

function isAccountEmail(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 254 || /[^!-~]/.test(value)) return false;
  // Hibernate @Email과 동일하게 로컬 부분의 따옴표 안에는 @가 올 수 있다.
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator > 64 || !emailLocalPart.test(value.slice(0, separator))) return false;
  const domain = value.slice(separator + 1);
  if (/^\[(?:\d{1,3}\.){3}\d{1,3}\]$/.test(domain)) return true;
  if (/^\[ipv6:fe80:(?::[\da-f]{0,4}){0,4}%[a-z\d]+\]$/i.test(domain)) return true;
  const ipv6 = /^\[ipv6:([\da-f:.]+)\]$/i.exec(domain);
  if (ipv6) return isIpv6EmailLiteral(ipv6[1]);
  return domain.split('.').every((label) => label.length <= 63 && emailDomainLabel.test(label));
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

export function createEntryController(client: ApiClient, readForegroundGeneration: () => number) {
  let snapshot: EntrySnapshot = loading;
  const listeners = new Set<() => void>();
  let mounted = false;
  let suspended = false;
  let mountId = 0;
  let visit = 0;
  let generation = -1;
  let lastTaskReentry = -1;
  let currentAttempt: EntryAttempt | undefined;
  let retryAt = 0;

  function publish(next: typeof loading | EntryRoute | EntryError) {
    if (snapshot === next) return;
    // React가 확인 중 렌더를 합쳐도 같은 경로의 이전 화면 상태를 재사용하지 않는다.
    snapshot = next.kind === 'route' ? { ...next, visit: ++visit, generation } : next;
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

  function isForegroundGeneration(): boolean {
    return generation >= 0 && generation === readForegroundGeneration();
  }

  function isCurrentAttempt(attempt: EntryAttempt): boolean {
    if (currentAttempt !== attempt) return false;
    if (!client.isCurrentContext(attempt.context)) {
      discardAttempt();
      return false;
    }
    // OS가 먼저 전환되면 늦은 429의 대기 기한과 503도 다음 복귀에 넘기지 않는다.
    if (!isForegroundGeneration()) {
      cancelAttempt();
      return false;
    }
    return true;
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
    if (!mounted || suspended) return;
    if (retryAt > Date.now()) {
      if (snapshot.kind !== 'error' || snapshot.retryAt !== retryAt) {
        publish({ kind: 'error', reason: 'rate_limited', retryAt });
      }
      return;
    }
    discardAttempt();
    const context = client.captureCurrentContext();
    if (!context) return;
    // 요청과 목적지에 같은 네이티브 세대를 적용한다.
    generation = readForegroundGeneration();
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

  function suspend() {
    if (!mounted || suspended) return;
    suspended = true;
    client.discardRequestContexts();
    cancelAttempt();
    // 복귀 전 보호 화면을 내린다. 이미 표시된 오류의 재시도는 사용자에게 맡긴다.
    if (snapshot.kind !== 'error') publish(loading);
  }

  async function resume() {
    if (!suspended) return;
    suspended = false;
    if (snapshot.kind !== 'error') await refresh();
  }

  function reenterTask(returnedGeneration: number) {
    // Android의 최근 앱에서는 Activity가 pause되지 않고 다시 맨 앞으로 올 수 있다.
    if (!mounted || suspended || returnedGeneration <= lastTaskReentry || returnedGeneration !== readForegroundGeneration()) return;
    lastTaskReentry = returnedGeneration;
    if (returnedGeneration === generation) return; // AppState 복귀가 같은 세대를 이미 조회했다.
    suspend();
    void resume();
  }

  async function retry(): Promise<void> {
    if (snapshot.kind === 'error') await refresh();
  }

  function stop() {
    mounted = false;
    suspended = false;
    mountId += 1;
    discardAttempt();
  }

  async function receiveProtectedAuthResult(result: ApiResult): Promise<boolean> {
    if (!mounted || suspended || result.kind !== 'response' || result.response.status !== 401
      || !client.isCurrentContext(result.context) || !isForegroundGeneration()) return false;
    const receivedOnMount = mountId;
    let response: Response;
    try {
      response = result.response.clone();
    } catch {
      // 호출부에서 이미 소비한 본문으로 만료를 단정할 수 없다.
      return false;
    }
    const parsed = await parseApiResponse(response, jsonResponse);
    return mounted && !suspended && mountId === receivedOnMount && isForegroundGeneration()
      && classifyRecovery(parsed, 'general').kind === 'authentication_required'
      && receiveExpiry(result.context);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start, suspend, resume, reenterTask, refresh, retry, stop, receiveProtectedAuthResult,
  };
}

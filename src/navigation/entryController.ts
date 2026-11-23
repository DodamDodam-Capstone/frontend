import { isAccountView } from '../api/accountView';
import type { ApiClient, ApiResult, AuthContext } from '../api/client';
import { classifyRecovery, readCsrfFailure, type RecoveryDecision } from '../api/recovery';
import { parseApiResponse } from '../api/response';
import { submitEmailLogin, type LoginFeedback } from '../auth/emailLogin';
import { submitLogoutRequest } from '../auth/logout';
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
  expired?: boolean;
};

type EntryVisit = EntryRoute & {
  visit: number;
  generation: number;
  loginRetryAt?: number;
  loginFeedback?: LoginFeedback;
  loginBlocked?: boolean;
  loginCsrfRecovery?: boolean;
  logoutPending?: boolean;
  logoutRetryAt?: number;
  logoutFeedback?: string;
};
export type EntrySnapshot = { kind: 'loading' } | EntryVisit | EntryError;

const loading = { kind: 'loading' } as const;
const jsonResponse = { kind: 'json', statuses: [200] } as const;
function routeForAccount(value: unknown): RoutePath | undefined {
  if (!isAccountView(value)) return;
  return value.childId === null ? ROUTES.childRegistration : ROUTES.home;
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
  let entryCsrf: Promise<void> | undefined;
  let retryAt = 0;
  let loginPending = false;
  let loginRetryAt = 0;
  let loginFeedback: LoginFeedback | undefined;
  let logoutPending = false;
  let logoutRetryAt = 0;
  let logoutFeedback: string | undefined;
  let showSignedOutOnResume = false;
  let loginCsrfRecovery = false;
  let retryingLogoutCsrf = false;

  function loginControls() {
    return {
      ...(loginRetryAt > Date.now() ? { loginRetryAt } : {}),
      ...(logoutPending || retryingLogoutCsrf ? { loginBlocked: true } : {}),
      ...(loginCsrfRecovery ? { loginCsrfRecovery: true } : {}),
    };
  }

  function logoutControls() {
    return {
      ...(logoutPending ? { logoutPending: true } : {}),
      ...(logoutRetryAt > Date.now() ? { logoutRetryAt } : {}),
      ...(logoutFeedback ? { logoutFeedback } : {}),
    };
  }

  function publish(next: typeof loading | EntryRoute | EntryError) {
    // React가 확인 중 렌더를 합쳐도 같은 경로의 이전 화면 상태를 재사용하지 않는다.
    const loginState = next.kind === 'route' && next.route === ROUTES.login ? {
      ...loginControls(),
      ...(loginFeedback ? { loginFeedback } : {}),
    } : undefined;
    if (next.kind === 'route') loginFeedback = undefined;
    const controls = next.kind === 'route' ? loginState ?? logoutControls() : undefined;
    setSnapshot(next.kind === 'route' ? { ...next, visit: ++visit, generation, ...controls } : next);
  }

  function setSnapshot(next: EntrySnapshot) {
    if (snapshot === next) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function waitToRetryLogin(deadline: number, csrfLimited = false) {
    loginRetryAt = Math.max(loginRetryAt, deadline);
    if (csrfLimited) retryAt = Math.max(retryAt, deadline);
    if (snapshot.kind === 'route' && snapshot.route === ROUTES.login && isForegroundGeneration()) {
      setSnapshot({ ...snapshot, loginRetryAt });
    }
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
      confirmSignedOut();
    });
  }

  function confirmSignedOut() {
    cancelAttempt();
    logoutFeedback = undefined;
    logoutRetryAt = 0;
    if (suspended || !isForegroundGeneration()) {
      showSignedOutOnResume = true;
      publish(loading);
      return;
    }
    showSignedOutOnResume = false;
    if (snapshot.kind === 'route' && snapshot.route === ROUTES.login) {
      setSnapshot({
        ...snapshot, loginBlocked: undefined, loginCsrfRecovery: undefined, loginRetryAt: undefined, ...loginControls(),
      });
    } else {
      publish({ kind: 'route', route: ROUTES.login });
    }
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
          attempt.expired = receiveExpiry(result.context);
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
    const nextGeneration = readForegroundGeneration();
    if (logoutPending) {
      if (generation !== nextGeneration) discardAttempt();
      generation = nextGeneration;
      return;
    }
    if (nextGeneration >= 0 && (showSignedOutOnResume || loginCsrfRecovery)) {
      generation = nextGeneration;
      confirmSignedOut();
      return;
    }
    if (retryAt > Date.now()) {
      if (snapshot.kind !== 'error' || snapshot.retryAt !== retryAt) {
        publish({ kind: 'error', reason: 'rate_limited', retryAt });
      }
      return;
    }
    discardAttempt();
    // 복귀가 먼저 처리되어도 인증 전환이 끝날 때까지 계정 조회를 보류한다.
    generation = nextGeneration;
    if (loginPending || generation < 0) return;
    const requestedGeneration = generation;
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
        if (entryCsrf === csrf) {
          entryCsrf = undefined;
          // /me 401이 먼저 로그인 화면을 열어도, 이미 전송한 CSRF 조회의 대기 기한은 지킨다.
          const currentSession = client.isCurrentContext(attempt.context) || attempt.expired;
          if (currentSession && !suspended && requestedGeneration === readForegroundGeneration()
            && result.kind === 'error' && result.retryAt !== undefined) {
            waitToRetryLogin(result.retryAt, true);
          }
        }
        attempt.csrf = result;
        publishAttempt(attempt);
      });
      entryCsrf = csrf;
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
    loginFeedback = undefined;
    // 화면이 바뀌어도 동일 세션의 로그아웃 또는 토큰 재획득 결과는 이어 받는다.
    if (!logoutPending && !retryingLogoutCsrf) client.discardRequestContexts();
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

  async function submitLogin(email: string, password: string): Promise<LoginFeedback | undefined> {
    if (!mounted || suspended || loginPending || logoutPending || loginCsrfRecovery || !isForegroundGeneration()
      || snapshot.kind !== 'route' || snapshot.route !== ROUTES.login) return;
    const submittedVisit = snapshot.visit;
    const isSameForm = () => mounted && !suspended && isForegroundGeneration()
      && snapshot.kind === 'route' && snapshot.visit === submittedVisit;
    loginPending = true;
    let result;
    try {
      if (entryCsrf) await entryCsrf;
      if (loginRetryAt > Date.now() && isSameForm()) {
        return { message: '요청이 많아요. 잠시 기다린 뒤 다시 시도해 주세요.', retryAt: loginRetryAt };
      }
      if (isSameForm()) result = await submitEmailLogin(client, email, password);
    } finally {
      loginPending = false;
    }
    if (!mounted) return;
    if (result?.kind === 'rejected') {
      if (result.retryAt !== undefined) waitToRetryLogin(result.retryAt, result.csrfLimited);
      if (isSameForm()) return { ...result.feedback, retryAt: result.retryAt };
    } else if (result?.kind === 'accepted' && result.csrfFailed) {
      retryAt = Math.max(retryAt, result.retryAt ?? 0);
      publish(result.retryAt === undefined
        ? { kind: 'error', reason: 'csrf_unavailable' }
        : { kind: 'error', reason: 'rate_limited', retryAt });
      return;
    } else if (result?.kind === 'uncertain' && isSameForm()) {
      loginFeedback = result.feedback;
    }

    // 화면이 이미 사라졌어도 현재 진입이 조회를 이어 간다. 네이티브가 먼저
    // 전환된 경우는 AppState 또는 최근 앱 이벤트가 복귀 확인을 시작한다.
    if (isForegroundGeneration()) await refresh();
  }

  async function submitLogout(): Promise<void> {
    if (!mounted || suspended || logoutPending || loginPending || !isForegroundGeneration()
      || snapshot.kind !== 'route' || snapshot.route === ROUTES.login || logoutRetryAt > Date.now()) return;
    const submittedVisit = snapshot.visit;
    const submittedMount = mountId;
    const isSameMount = () => mounted && submittedMount === mountId;
    logoutPending = true;
    logoutFeedback = undefined;
    setSnapshot({ ...snapshot, logoutPending: true, logoutFeedback: undefined });
    let result;
    try {
      result = await submitLogoutRequest(client, () => {
        // 204가 확정되면 CSRF 갱신과 별개로 이전 수신자를 내린다.
        if (isSameMount()) confirmSignedOut();
      });
    } finally {
      logoutPending = false;
    }
    if (!isSameMount()) {
      if (mounted) await refresh();
      return;
    }
    if (!client.isCurrentContext(result.context)) {
      await refresh();
      return;
    }
    if (result.retryAt !== undefined) {
      if (result.kind === 'accepted') waitToRetryLogin(result.retryAt);
      else logoutRetryAt = Math.max(logoutRetryAt, result.retryAt);
      if (result.csrfLimited) retryAt = Math.max(retryAt, result.retryAt);
    }
    if (result.kind === 'accepted') {
      loginCsrfRecovery = result.csrfFailed;
      confirmSignedOut();
    } else if (result.kind === 'expired') {
      receiveExpiry(result.context!);
    } else if (result.kind === 'rejected' && !suspended && isForegroundGeneration()
      && snapshot.kind === 'route' && snapshot.visit === submittedVisit) {
      logoutFeedback = result.feedback;
      setSnapshot({ ...snapshot, logoutPending: undefined, ...logoutControls() });
    } else {
      if (result.kind === 'rejected') logoutFeedback = result.feedback;
      await refresh();
    }
  }

  async function retryLogoutCsrf(): Promise<void> {
    if (!mounted || suspended || !loginCsrfRecovery || logoutPending || retryingLogoutCsrf
      || !isForegroundGeneration() || loginRetryAt > Date.now()) return;
    const context = client.captureCurrentContext();
    const submittedMount = mountId;
    retryingLogoutCsrf = true;
    confirmSignedOut();
    let result;
    try {
      result = await prepareCsrf(client);
    } finally {
      retryingLogoutCsrf = false;
    }
    if (!mounted || submittedMount !== mountId) return;
    if (client.isCurrentContext(context)) {
      loginCsrfRecovery = result.kind !== 'ready';
      if (result.kind === 'error' && result.retryAt !== undefined) waitToRetryLogin(result.retryAt, true);
    }
    confirmSignedOut();
  }

  function stop() {
    mounted = false;
    suspended = false;
    mountId += 1;
    entryCsrf = undefined;
    loginFeedback = undefined;
    logoutFeedback = undefined;
    showSignedOutOnResume = false;
    loginCsrfRecovery = false;
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
    start, suspend, resume, reenterTask, refresh, retry, stop, receiveProtectedAuthResult, submitLogin, submitLogout, retryLogoutCsrf,
  };
}

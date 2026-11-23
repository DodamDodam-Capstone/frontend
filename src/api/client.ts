import { readEnvironment, resolveApiConfig, resolveApiMode, type ConfigResult, type EnvironmentInput } from '../config/env';
import { createCsrfManager, type CsrfFailure, type CsrfResult } from './csrf';
import { registerExampleHandlers, type ExampleScenario } from './mockAuthMe';

declare const authContextBrand: unique symbol;
// 실제 값은 client가 발급하는 빈 불변 객체다. 세대·계정·자격 정보를 공개하지 않는다.
export type AuthContext = { readonly [authContextBrand]: true };

export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ApiRequest = { method: 'GET' | 'POST'; path: string; headers?: HeadersInit; body?: BodyInit; signal?: AbortSignal };
export type ApiResult =
  | { kind: 'response'; response: Response; readonly context: AuthContext }
  | { kind: 'not_sent'; reason: 'invalid_request' | 'auth_transition' | 'cancelled' }
  | { kind: 'not_sent'; reason: 'csrf_unavailable'; csrf?: CsrfFailure }
  | { kind: 'transport_error'; readonly context: AuthContext }
  | { kind: 'stale_response' };
// 업무 응답의 의미는 125 호출부가 판정한다. 비-2xx를 일괄 unchanged로 판단하지 않는다.
export type AuthOutcome = 'changed' | 'unchanged' | 'csrf_invalid' | 'unknown';
export type AuthTransitionResult = { operation: ApiResult; outcome: AuthOutcome | 'not_attempted'; refresh?: CsrfResult; readonly context?: AuthContext };
export type CsrfRecoveryResult =
  | { kind: 'refreshed' | 'already_recovered' }
  | { kind: 'skipped'; reason: 'stale_context' | 'ineligible_request' | 'superseded_token' }
  | { kind: 'failed'; failure: CsrfFailure };
type ContextState = {
  generation: number;
  requestGeneration: number;
  source: 'request' | 'transition' | 'expired' | 'snapshot';
  sentVersion?: object;
};
type RecoveryAttempt = { pending: Promise<CsrfResult>; restoredVersion?: object };

export type ApiClient = {
  prepareCsrf(): Promise<CsrfResult>;
  recoverCsrf(context: AuthContext | undefined): Promise<CsrfRecoveryResult>;
  captureCurrentContext(): AuthContext | undefined;
  isCurrentContext(context: AuthContext | undefined): boolean;
  commitIfCurrent(context: AuthContext | undefined, apply: () => undefined): boolean;
  expireIfCurrent(context: AuthContext | undefined, onExpired: (next: AuthContext) => undefined): boolean;
  discardRequestContexts(): void;
  request(request: ApiRequest, beforeSend?: () => boolean): Promise<ApiResult>;
  authTransition(request: ApiRequest, classify: (response: Response) => AuthOutcome | Promise<AuthOutcome>): Promise<AuthTransitionResult>;
};
type PreparedRequest = ApiRequest & { url: string; headers: Headers };

function apiAddress(baseUrl: string, path: string): string | undefined {
  // API endpoint의 경로는 ASCII segment로 한정하고 query는 그대로 전달한다.
  // URL parser가 보정하는 경로·encoded separator·fragment는 요청 전에 거절한다.
  if (typeof path !== 'string' || /[\s\\#\u0000-\u001f\u007f]/.test(path)
    || !/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/i.test(path.split('?')[0])) return;
  try {
    const base = new URL(baseUrl);
    const basePath = base.pathname.replace(/\/+$/, '');
    const target = new URL(`${base.origin}${basePath}${path}`);
    if (target.origin === base.origin && target.pathname.startsWith(`${basePath}/`)) return target.href;
  } catch {
    // 파서 예외에는 주소 전체가 들어갈 수 있다.
  }
}

export function createApiClient(
  input: EnvironmentInput = readEnvironment(),
  options: { fetchImpl?: ApiFetch; scenario?: ExampleScenario } = {},
): ConfigResult<ApiClient> {
  const mode = resolveApiMode(input);
  if (!mode.ok) return mode;
  const config = resolveApiConfig(input);
  if (!config.ok) return config;
  const baseUrl = config.value.apiBaseUrl;
  const csrfUrl = apiAddress(baseUrl, '/auth/csrf');
  if (!csrfUrl) return { ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'invalid_url' }] };
  const mock = mode.value === 'mock' ? registerExampleHandlers(options.scenario ?? 'signedIn') : undefined;

  // CSRF 준비 대기는 포함하지 않고 실제 전송된 응답 헤더만 추적한다.
  const headersPending = new Set<Promise<Response>>();
  async function send(path: string, url: string, init: RequestInit): Promise<Response> {
    const pending = mock ? mock({ method: init.method ?? 'GET', path }) : (options.fetchImpl ?? fetch)(url, init);
    headersPending.add(pending);
    try { return await pending; } finally { headersPending.delete(pending); }
  }
  const csrf = createCsrfManager(() => send('/auth/csrf', csrfUrl, {
    method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
    headers: new Headers({ Accept: 'application/json' }),
  }), csrfUrl);

  let generation = 0;
  let lastExpiryGeneration = -1;
  let requestGeneration = 0;
  let transitioning = false;
  const inFlight = new Set<Promise<ApiResult>>();
  const contexts = new WeakMap<AuthContext, ContextState>();
  const recoveries = new WeakMap<object, RecoveryAttempt>();
  let recoveryPending: Promise<CsrfResult> | undefined;

  function captureContext(source: ContextState['source'] = 'request'): AuthContext {
    const context = Object.freeze({}) as AuthContext;
    contexts.set(context, { generation, requestGeneration, source });
    return context;
  }

  // 별도 요청으로 받는 결과를 같은 인증 문맥의 화면에서 반영할 때만 사용한다.
  function captureCurrentContext(): AuthContext | undefined {
    return transitioning ? undefined : captureContext('snapshot');
  }

  // 전환 내부는 자신의 세대만 검사한다. 외부 반영에는 gate 해제도 필요하다.
  function ownsContext(context: AuthContext | undefined): boolean {
    return context !== undefined && contexts.get(context)?.generation === generation;
  }
  function isCurrentContext(context: AuthContext | undefined): boolean {
    const state = context && contexts.get(context);
    return !transitioning && state?.generation === generation && state.requestGeneration === requestGeneration;
  }
  function commitIfCurrent(context: AuthContext | undefined, apply: () => undefined): boolean {
    if (!isCurrentContext(context)) return false;
    // 마지막 await 뒤 사용한다. callback에서 시작한 비동기 후속 반영은 다시 검사해야 한다.
    apply();
    return true;
  }
  function expireIfCurrent(context: AuthContext | undefined, onExpired: (next: AuthContext) => undefined): boolean {
    if (!isCurrentContext(context)) return false;
    // 호출부가 계약상 만료를 확인한 뒤 호출한다. 먼저 무효화하여 중복 통지를 막는다.
    generation += 1;
    lastExpiryGeneration = generation;
    csrf.invalidate();
    onExpired(captureContext('expired'));
    return true;
  }

  function discardRequestContexts() {
    // 이전 화면의 응답 반영만 막는다. 진행 중인 인증 전환은 이미 이전 세대를 폐기했다.
    if (!transitioning) requestGeneration += 1;
  }

  // 원래 요청 자체는 취소하지 않는다. 취소된 호출의 대기와 listener만 정리한다.
  async function waitForPending<T>(pending: Promise<T> | undefined, signal?: AbortSignal) {
    if (!pending || !signal) return pending;
    if (signal.aborted) return;
    let onAbort!: () => void;
    const cancelled = new Promise<undefined>((resolve) => {
      onAbort = () => resolve(undefined);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([pending, cancelled]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  function prepareRequest(value: ApiRequest): PreparedRequest | undefined {
    if (!value || (value.method !== 'GET' && value.method !== 'POST')) return;
    const { method, path, body, signal } = value;
    const url = apiAddress(baseUrl, path);
    if (!url || path.split('?')[0].replace(/\/+$/, '').toLowerCase() === '/auth/csrf'
      || (method === 'GET' && body !== undefined)) return;
    try {
      const headers = new Headers(value.headers);
      let invalidValue = false;
      headers.forEach((headerValue) => { if (/[\u0000-\u001f\u007f]/.test(headerValue)) invalidValue = true; });
      if (invalidValue || ['Cookie', 'Authorization', 'X-XSRF-TOKEN'].some((name) => headers.has(name))) return;
      return { method, path, body, signal, url, headers };
    } catch {
      return;
    }
  }

  // 인증 전송도 같은 검증·CSRF 설정을 사용한다. 공개 bypass 옵션은 제공하지 않는다.
  async function perform(
    value: PreparedRequest, blocked: () => boolean, context: AuthContext, beforeSend?: () => boolean,
  ): Promise<ApiResult> {
    const { method, path, body, signal, url, headers } = value;
    if (signal?.aborted) return { kind: 'not_sent', reason: 'cancelled' };
    if (method === 'POST') {
      const state = contexts.get(context)!;
      // 이미 기다리던 준비가 끝난 직후 복구가 시작된 경우에도 폐기한 토큰을 보내지 않는다.
      do {
        const pending = state.source === 'request' ? recoveryPending ?? csrf.prepare() : csrf.prepare();
        const prepared = await waitForPending(pending, signal);
        if (blocked()) return { kind: 'not_sent', reason: 'auth_transition' };
        if (signal?.aborted) return { kind: 'not_sent', reason: 'cancelled' };
        if (!prepared) return { kind: 'not_sent', reason: 'csrf_unavailable' };
        if (!prepared.ok) return { kind: 'not_sent', reason: 'csrf_unavailable', csrf: prepared };
      } while (state.source === 'request' && recoveryPending);
      const token = csrf.token();
      const version = csrf.version();
      if (!token || !version) return { kind: 'not_sent', reason: 'csrf_unavailable' };
      headers.set('X-XSRF-TOKEN', token);
      state.sentVersion = version;
    }
    // 호출부의 일회성 권한은 CSRF 대기 중에도 만료될 수 있다.
    if (beforeSend && !beforeSend()) return { kind: 'not_sent', reason: 'cancelled' };
    try {
      const response = await send(path, url, {
        method, credentials: 'include', cache: 'no-store', redirect: 'error', headers,
        ...(body !== undefined ? { body } : {}), ...(signal !== undefined ? { signal } : {}),
      });
      return { kind: 'response', response, context };
    } catch {
      // 취소·통신 실패 뒤에도 서버 처리 여부는 알 수 없으며 재전송하지 않는다.
      return { kind: 'transport_error', context };
    }
  }

  async function request(value: ApiRequest, beforeSend?: () => boolean): Promise<ApiResult> {
    const prepared = prepareRequest(value);
    if (!prepared) return { kind: 'not_sent', reason: 'invalid_request' };
    if (transitioning) return { kind: 'not_sent', reason: 'auth_transition' };
    const context = captureContext();
    const blocked = () => !isCurrentContext(context);
    const operation = perform(prepared, blocked, context, beforeSend);
    inFlight.add(operation);
    try {
      const result = await operation;
      // 이미 전송된 응답을 미전송으로 표시하지 않는다. OS 쿠키 적용을 되돌리는 기능은 아니다.
      return result.kind === 'response' && blocked() ? { kind: 'stale_response' } : result;
    } finally {
      inFlight.delete(operation);
    }
  }

  async function prepareCsrf(): Promise<CsrfResult> {
    if (transitioning) return { ok: false, reason: 'auth_transition' };
    const started = generation;
    let result: CsrfResult;
    do {
      result = await (recoveryPending ?? csrf.prepare());
      if (transitioning || generation !== started) {
        // 같은 진입의 401이 먼저 끝나도, 이미 발급을 요청한 서버의 429는 토큰을 복구하지 않는다.
        // 로그인 폼이 너무 빨리 같은 발급 요청을 다시 보내지 않도록 대기 응답만 전달한다.
        if (!transitioning && generation === started + 1 && generation === lastExpiryGeneration
          && !result.ok && result.reason === 'http' && result.status === 429) return result;
        return { ok: false, reason: 'auth_transition' };
      }
    } while (result.ok && recoveryPending);
    return result;
  }

  // 호출부가 403 + CSRF_INVALID를 확인한 응답의 context를 전달한다. 원래 POST는 재실행하지 않는다.
  async function recoverCsrf(context: AuthContext | undefined): Promise<CsrfRecoveryResult> {
    if (!isCurrentContext(context)) return { kind: 'skipped', reason: 'stale_context' };
    const state = contexts.get(context!)!;
    if (state.source !== 'request' || !state.sentVersion) return { kind: 'skipped', reason: 'ineligible_request' };
    const version = state.sentVersion;
    let attempt = recoveries.get(version);
    const startedHere = !attempt;
    if (!attempt) {
      if (csrf.version() !== version) return { kind: 'skipped', reason: 'superseded_token' };
      // 새 POST가 복구를 기다리는 동안 이 목록에는 새로 들어오지 않는다.
      const drained = Promise.allSettled([...headersPending, csrf.settlePending()]);
      csrf.invalidate();
      const created: RecoveryAttempt = { pending: drained.then(async () => {
        // 이미 시작한 복구는 같은 인증 세션의 다음 화면도 기다릴 수 있다.
        if (transitioning || !ownsContext(context)) return { ok: false, reason: 'auth_transition' };
        const result = await csrf.prepare();
        if (result.ok) created.restoredVersion = csrf.version();
        return result;
      }) };
      const pending = created.pending.finally(() => {
        if (recoveryPending === pending) recoveryPending = undefined;
      });
      created.pending = pending;
      recoveries.set(version, created);
      recoveryPending = pending;
      attempt = created;
    }
    const result = await attempt.pending;
    // 공유·캐시 결과도 마지막 await 이후 검사한다. 새 문맥을 만들어 성공처럼 포장하지 않는다.
    if (!isCurrentContext(context)) return { kind: 'skipped', reason: 'stale_context' };
    if (!result.ok) return { kind: 'failed', failure: result };
    if (!attempt.restoredVersion || attempt.restoredVersion !== csrf.version()) {
      return { kind: 'skipped', reason: 'superseded_token' };
    }
    return { kind: startedHere ? 'refreshed' : 'already_recovered' };
  }

  async function authTransition(value: ApiRequest, classify: (response: Response) => AuthOutcome | Promise<AuthOutcome>): Promise<AuthTransitionResult> {
    const prepared = prepareRequest(value);
    if (!prepared || prepared.method !== 'POST' || typeof classify !== 'function') {
      return { operation: { kind: 'not_sent', reason: 'invalid_request' }, outcome: 'not_attempted' };
    }
    if (transitioning) return { operation: { kind: 'not_sent', reason: 'auth_transition' }, outcome: 'not_attempted' };
    if (prepared.signal?.aborted) return { operation: { kind: 'not_sent', reason: 'cancelled' }, outcome: 'not_attempted' };
    transitioning = true;
    generation += 1;
    const context = captureContext('transition');
    const blocked = () => !ownsContext(context);
    try {
      // 일반 403도 CSRF 쿠키를 발급하므로 기존 일반 요청과 발급 응답을 모두 기다린다.
      await waitForPending(Promise.allSettled([...inFlight, csrf.settlePending(), recoveryPending]), prepared.signal);
      const operation = await perform(prepared, blocked, context);
      if (operation.kind === 'not_sent') return { operation, outcome: 'not_attempted', context };
      if (blocked()) return { operation, outcome: 'unknown', context };
      let outcome: AuthOutcome = 'unknown';
      if (operation.kind === 'response') {
        try {
          // 판정에서 본문을 읽어도 호출부에 원래 Response를 그대로 돌려준다.
          const decision = await classify(operation.response.clone());
          if (['changed', 'unchanged', 'csrf_invalid', 'unknown'].includes(decision)) outcome = decision;
        } catch {
          // 판정 실패도 인증 실패 확정이나 이전 상태 복구의 근거가 아니다.
        }
      }
      if (blocked()) return { operation, outcome: 'unknown', context };
      if (outcome !== 'unchanged') csrf.invalidate();
      if (outcome === 'changed' || outcome === 'csrf_invalid') {
        const refresh = await csrf.prepare();
        return { operation, outcome, refresh, context };
      }
      return { operation, outcome, context };
    } finally {
      transitioning = false;
    }
  }

  return { ok: true, value: {
    prepareCsrf, recoverCsrf, captureCurrentContext, request, authTransition, isCurrentContext, commitIfCurrent, expireIfCurrent,
    discardRequestContexts,
  } };
}

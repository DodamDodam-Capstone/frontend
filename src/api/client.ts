import { readEnvironment, resolveApiConfig, resolveApiMode, type ConfigResult, type EnvironmentInput } from '../config/env';
import { createCsrfManager, type CsrfFailure, type CsrfResult } from './csrf';
import { registerExampleHandlers, type ExampleScenario } from './mockAuthMe';

export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ApiRequest = { method: 'GET' | 'POST'; path: string; headers?: HeadersInit; body?: BodyInit; signal?: AbortSignal };
export type ApiResult =
  | { kind: 'response'; response: Response }
  | { kind: 'not_sent'; reason: 'invalid_request' | 'auth_transition' | 'cancelled' }
  | { kind: 'not_sent'; reason: 'csrf_unavailable'; csrf?: CsrfFailure }
  | { kind: 'transport_error' }
  | { kind: 'stale_response' };
// 업무 응답의 의미는 125 호출부가 판정한다. 비-2xx를 일괄 unchanged로 판단하지 않는다.
export type AuthOutcome = 'changed' | 'unchanged' | 'csrf_invalid' | 'unknown';
export type AuthTransitionResult = { operation: ApiResult; outcome: AuthOutcome | 'not_attempted'; refresh?: CsrfResult };
export type ApiClient = {
  prepareCsrf(): Promise<CsrfResult>;
  request(request: ApiRequest): Promise<ApiResult>;
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

  function send(path: string, url: string, init: RequestInit): Promise<Response> {
    if (mock) return mock({ method: init.method ?? 'GET', path });
    return (options.fetchImpl ?? fetch)(url, init);
  }
  const csrf = createCsrfManager(() => send('/auth/csrf', csrfUrl, {
    method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
    headers: new Headers({ Accept: 'application/json' }),
  }), csrfUrl);

  let generation = 0;
  let transitioning = false;

  // 공유 CSRF GET 자체는 취소하지 않는다. 취소된 호출의 대기와 listener만 정리한다.
  async function waitForCsrf(pending: Promise<CsrfResult> | undefined, signal?: AbortSignal) {
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
  async function perform(value: PreparedRequest, blocked: () => boolean): Promise<ApiResult> {
    const { method, path, body, signal, url, headers } = value;
    if (signal?.aborted) return { kind: 'not_sent', reason: 'cancelled' };
    if (method === 'POST') {
      const prepared = await waitForCsrf(csrf.prepare(), signal);
      if (blocked()) return { kind: 'not_sent', reason: 'auth_transition' };
      if (signal?.aborted) return { kind: 'not_sent', reason: 'cancelled' };
      if (!prepared) return { kind: 'not_sent', reason: 'csrf_unavailable' };
      if (!prepared.ok) return { kind: 'not_sent', reason: 'csrf_unavailable', csrf: prepared };
      const token = csrf.token();
      if (!token) return { kind: 'not_sent', reason: 'csrf_unavailable' };
      headers.set('X-XSRF-TOKEN', token);
    }
    try {
      const response = await send(path, url, {
        method, credentials: 'include', cache: 'no-store', redirect: 'error', headers,
        ...(body !== undefined ? { body } : {}), ...(signal !== undefined ? { signal } : {}),
      });
      return { kind: 'response', response };
    } catch {
      // 취소·통신 실패 뒤에도 서버 처리 여부는 알 수 없으며 재전송하지 않는다.
      return { kind: 'transport_error' };
    }
  }

  async function request(value: ApiRequest): Promise<ApiResult> {
    const prepared = prepareRequest(value);
    if (!prepared) return { kind: 'not_sent', reason: 'invalid_request' };
    if (transitioning) return { kind: 'not_sent', reason: 'auth_transition' };
    const started = generation;
    const blocked = () => transitioning || generation !== started;
    const result = await perform(prepared, blocked);
    // 이미 전송된 응답을 미전송으로 표시하지 않는다. OS 쿠키 적용을 되돌리는 기능은 아니다.
    return result.kind === 'response' && blocked() ? { kind: 'stale_response' } : result;
  }

  async function prepareCsrf(): Promise<CsrfResult> {
    if (transitioning) return { ok: false, reason: 'auth_transition' };
    const started = generation;
    const result = await csrf.prepare();
    return transitioning || generation !== started ? { ok: false, reason: 'auth_transition' } : result;
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
    try {
      // 오래된 CSRF 응답의 Set-Cookie가 인증 전송 뒤에 도착하지 않도록 기다린다.
      await waitForCsrf(csrf.settlePending(), prepared.signal);
      const operation = await perform(prepared, () => false);
      if (operation.kind === 'not_sent') return { operation, outcome: 'not_attempted' };
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
      if (outcome !== 'unchanged') csrf.invalidate();
      if (outcome === 'changed' || outcome === 'csrf_invalid') {
        const refresh = await csrf.prepare();
        return { operation, outcome, refresh };
      }
      return { operation, outcome };
    } finally {
      transitioning = false;
    }
  }

  return { ok: true, value: { prepareCsrf, request, authTransition } };
}

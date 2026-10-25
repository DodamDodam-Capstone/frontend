import { readEnvironment, resolveApiConfig, resolveApiMode, type ConfigResult, type EnvironmentInput } from '../config/env';
import { createCsrfManager, type CsrfFailure, type CsrfResult } from './csrf';
import { registerExampleHandlers, type ExampleScenario } from './mockAuthMe';

export type ApiFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ApiRequest = { method: 'GET' | 'POST'; path: string; headers?: HeadersInit; body?: BodyInit };
export type ApiResult =
  | { kind: 'response'; response: Response }
  | { kind: 'not_sent'; reason: 'invalid_request' }
  | { kind: 'not_sent'; reason: 'csrf_unavailable'; csrf?: CsrfFailure }
  | { kind: 'transport_error' };
export type ApiClient = { prepareCsrf(): Promise<CsrfResult>; request(request: ApiRequest): Promise<ApiResult> };

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

  async function request(value: ApiRequest): Promise<ApiResult> {
    if (!value || (value.method !== 'GET' && value.method !== 'POST')) return { kind: 'not_sent', reason: 'invalid_request' };
    const { method, path, body } = value;
    const url = apiAddress(baseUrl, path);
    if (!url || path.split('?')[0].replace(/\/+$/, '').toLowerCase() === '/auth/csrf'
      || (method === 'GET' && body !== undefined)) return { kind: 'not_sent', reason: 'invalid_request' };
    let headers: Headers;
    try {
      headers = new Headers(value.headers);
      let invalidValue = false;
      headers.forEach((headerValue) => { if (/[\u0000-\u001f\u007f]/.test(headerValue)) invalidValue = true; });
      if (invalidValue || ['Cookie', 'Authorization', 'X-XSRF-TOKEN'].some((name) => headers.has(name))) {
        return { kind: 'not_sent', reason: 'invalid_request' };
      }
    } catch {
      return { kind: 'not_sent', reason: 'invalid_request' };
    }
    if (method === 'POST') {
      const prepared = await csrf.prepare();
      if (!prepared.ok) return { kind: 'not_sent', reason: 'csrf_unavailable', csrf: prepared };
      const token = csrf.token();
      if (!token) return { kind: 'not_sent', reason: 'csrf_unavailable' };
      headers.set('X-XSRF-TOKEN', token);
    }
    try {
      const response = await send(path, url, {
        method, credentials: 'include', cache: 'no-store', redirect: 'error', headers,
        ...(body !== undefined ? { body } : {}),
      });
      return { kind: 'response', response };
    } catch {
      // HTTP/code별 복구는 후속 계층에서 판단하며, 여기서는 재전송하지 않는다.
      return { kind: 'transport_error' };
    }
  }

  return { ok: true, value: { prepareCsrf: csrf.prepare, request } };
}

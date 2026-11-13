import { createCsrfHttpFailure } from './recovery';
import type { ResponseMetadata } from './response';

export type CsrfFailure =
  | { ok: false; reason: 'network' | 'invalid_response' | 'auth_transition' | 'invalidated' }
  | { ok: false; reason: 'http'; status: number; requestId?: string; meta: ResponseMetadata };
export type CsrfResult = { ok: true } | CsrfFailure;

// token은 client 내부 메모리에서만 사용하고 공개 준비 결과에는 포함하지 않는다.
export function createCsrfManager(load: () => Promise<Response>, expectedUrl: string) {
  let token: string | undefined;
  let revision = 0;
  let version: object | undefined;
  let pending: Promise<CsrfResult> | undefined;

  async function issue(): Promise<CsrfResult> {
    const started = revision;
    let response: Response;
    try {
      response = await load();
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (response.status !== 200) return createCsrfHttpFailure(response);
    if (response.redirected || (response.url && response.url !== expectedUrl)
      || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return { ok: false, reason: 'invalid_response' };
    }
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object') return { ok: false, reason: 'invalid_response' };
      const value = body as Record<string, unknown>;
      if (value.headerName !== 'X-XSRF-TOKEN' || value.parameterName !== '_csrf'
        || typeof value.token !== 'string' || !value.token.length
        || value.token.trim() !== value.token || /[\u0000-\u001f\u007f]/.test(value.token)) {
        return { ok: false, reason: 'invalid_response' };
      }
      // 헤더 생성 시 거절되거나 정규화될 값은 사용하지 않는다. 원문은 변형하지 않는다.
      if (new Headers({ 'X-XSRF-TOKEN': value.token }).get('X-XSRF-TOKEN') !== value.token) {
        return { ok: false, reason: 'invalid_response' };
      }
      // 만료 중 끝난 발급이 이전 token과 준비 성공을 되살리지 못하게 한다.
      if (revision !== started) return { ok: false, reason: 'invalidated' };
      token = value.token;
      // 같은 문자열이 재발급되어도 성공한 발급의 문맥은 새로 구분한다.
      version = Object.freeze({});
      return { ok: true };
    } catch {
      return { ok: false, reason: 'invalid_response' };
    }
  }

  function prepare(): Promise<CsrfResult> {
    if (token) return Promise.resolve({ ok: true });
    if (!pending) pending = issue().finally(() => { pending = undefined; });
    return pending;
  }

  return {
    prepare, token: () => token, version: () => version,
    settlePending: () => pending,
    // pending은 유지하여 이미 시작한 쿠키 응답의 대기 순서를 보존한다.
    invalidate: () => { revision += 1; token = undefined; version = undefined; },
  };
}

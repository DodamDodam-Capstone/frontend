export type CsrfFailure =
  | { ok: false; reason: 'network' | 'invalid_response' }
  | { ok: false; reason: 'http'; status: number; requestId?: string };
export type CsrfResult = { ok: true } | CsrfFailure;

// token은 client 내부 메모리에서만 사용하고 공개 준비 결과에는 포함하지 않는다.
export function createCsrfManager(load: () => Promise<Response>, expectedUrl: string) {
  let token: string | undefined;
  let pending: Promise<CsrfResult> | undefined;

  async function issue(): Promise<CsrfResult> {
    let response: Response;
    try {
      response = await load();
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (response.status !== 200) {
      const id = response.headers.get('X-Request-ID');
      const requestId = id && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ? id : undefined;
      return { ok: false, reason: 'http', status: response.status, ...(requestId ? { requestId } : {}) };
    }
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
      token = value.token;
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

  return { prepare, token: () => token };
}

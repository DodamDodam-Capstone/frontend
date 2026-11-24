import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch } from './client';
import { prepareRequestBody, type RequestBody } from './requestBody';

afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-166 요청 본문 준비', () => {
  it('JSON의 UTF-8 문자열·중첩 값·비밀번호 공백을 보존하고 caller 헤더를 바꾸지 않는다', () => {
    const headers = new Headers({ Accept: 'application/json' });
    const input = { nickname: '도담', password: '  synthetic-secret  ', enabled: false, items: [0, '한글', { value: true }] };
    const result = prepareRequestBody({ kind: 'json', value: input }, headers);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe('{"nickname":"도담","password":"  synthetic-secret  ","enabled":false,"items":[0,"한글",{"value":true}]}');
    expect(result.value.headers.get('Content-Type')).toBe('application/json');
    expect(result.value.headers.get('Accept')).toBe('application/json');
    expect(headers.has('Content-Type')).toBe(false);
    expect(input.password).toBe('  synthetic-secret  ');
  });

  it.each(['application/json', 'application/json;charset=UTF-8', 'Application/JSON; charset="utf-8"'])('JSON과 none에서 유효한 %s를 유지한다', (type) => {
    for (const body of [{ kind: 'json', value: {} }, { kind: 'none' }] as const) {
      const result = prepareRequestBody(body, { 'Content-Type': type });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.headers.get('Content-Type')).toBe(type);
    }
  });

  it('none은 body와 Content-Type을 만들지 않는다', () => {
    const result = prepareRequestBody({ kind: 'none' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty('body');
    expect(result.value.headers.has('Content-Type')).toBe(false);
  });

  it.each(['', 'text/plain', 'application/*', 'application/json;charset=ISO-8859-1', 'application/json, text/plain', 'application/json; charset=UTF-8; charset=UTF-8', 'application/json; boundary=x'])('JSON과 none의 호환되지 않는 Content-Type %s를 거절한다', (type) => {
    for (const body of [{ kind: 'json', value: {} }, { kind: 'none' }] as const) {
      expect(prepareRequestBody(body, { 'Content-Type': type })).toEqual({ ok: false, reason: 'invalid_content_type' });
    }
  });

  it('같은 FormData를 전달하고 multipart boundary는 런타임에 맡긴다', () => {
    const data = new FormData();
    data.append('clientRequestId', '11111111-1111-4111-8111-111111111111');
    const result = prepareRequestBody({ kind: 'formData', value: data });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe(data);
    expect(result.value.headers.has('Content-Type')).toBe(false);
  });

  it.each(['multipart/form-data', 'multipart/form-data; boundary=manual', 'application/json', ''])('FormData 수동 Content-Type %s를 거절한다', (type) => {
    expect(prepareRequestBody({ kind: 'formData', value: new FormData() }, { 'Content-Type': type }))
      .toEqual({ ok: false, reason: 'invalid_content_type' });
  });

  it.each([
    ['undefined', undefined], ['객체 undefined', { omitted: undefined }],
    ['배열 undefined', [undefined]], ['빈 배열 슬롯', Array(1)],
    ['NaN', { value: NaN }], ['Infinity', [Infinity]], ['-Infinity', -Infinity],
    ['BigInt', { value: BigInt(1) }], ['함수', { value: () => 1 }],
    ['Symbol 값', [Symbol('synthetic')]], ['Date', new Date('2026-10-28T00:00:00Z')],
    ['Map', new Map([['value', 1]])], ['사용자 prototype', Object.create({ inherited: true })],
    ['Symbol 키', { [Symbol('hidden')]: 1 }],
  ])('%s를 조용히 생략하거나 변환하지 않는다', (_name, value) => {
    expect(prepareRequestBody({ kind: 'json', value })).toEqual({ ok: false, reason: 'invalid_body' });
  });

  it('순환 참조를 안전하게 거절한다', () => {
    const value: { next?: unknown } = {};
    value.next = value;
    expect(prepareRequestBody({ kind: 'json', value })).toEqual({ ok: false, reason: 'invalid_body' });
  });

  it('같은 자식을 공유하는 비순환 JSON과 null 값은 변형하지 않는다', () => {
    // null의 endpoint별 허용 여부는 호출부 DTO 검증 책임이다.
    const child = { value: null };
    const result = prepareRequestBody({ kind: 'json', value: { first: child, second: child } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.body).toBe('{"first":{"value":null},"second":{"value":null}}');
  });

  it('getter와 custom toJSON을 실행하지 않고 거절한다', () => {
    const getter = jest.fn(() => 'synthetic-secret');
    const toJSON = jest.fn(() => ({ changed: true }));
    const accessor = Object.defineProperty({}, 'password', { enumerable: true, get: getter });
    expect(prepareRequestBody({ kind: 'json', value: accessor })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(prepareRequestBody({ kind: 'json', value: { toJSON } })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('숨은 객체 필드와 배열의 추가 필드를 유실시키지 않고 거절한다', () => {
    const hidden = Object.defineProperty({}, 'value', { value: 1 });
    const extra = Object.assign([1], { hidden: 'synthetic' });
    expect(prepareRequestBody({ kind: 'json', value: hidden })).toEqual({ ok: false, reason: 'invalid_body' });
    expect(prepareRequestBody({ kind: 'json', value: extra })).toEqual({ ok: false, reason: 'invalid_body' });
  });

  it('prototype 없는 객체와 __proto__라는 JSON 키를 값 그대로 직렬화한다', () => {
    const value = Object.assign(Object.create(null), JSON.parse('{"__proto__":{"value":1},"empty":[]}'));
    const result = prepareRequestBody({ kind: 'json', value });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.body).toBe('{"__proto__":{"value":1},"empty":[]}');
  });

  it.each([null, { kind: 'unknown' }, { kind: 'formData', value: {} }, { kind: 'none', value: '{}' }])('잘못된 런타임 입력을 거절한다: %#', (input) => {
    expect(prepareRequestBody(input as RequestBody)).toEqual({ ok: false, reason: 'invalid_body' });
  });

  it('잘못된 헤더의 원문 예외를 반환하지 않는다', () => {
    expect(prepareRequestBody({ kind: 'none' }, [['bad name', 'synthetic-secret']]))
      .toEqual({ ok: false, reason: 'invalid_headers' });
    expect(prepareRequestBody({ kind: 'none' }, { 'X-Example': 'synthetic\u0001secret' }))
      .toEqual({ ok: false, reason: 'invalid_headers' });
  });
});

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
function receiver(status = 204) {
  const codes: Record<number, string> = {
    401: 'AUTHENTICATION_REQUIRED', 403: 'CSRF_INVALID', 429: 'RATE_LIMITED', 503: 'AUTH_STATE_UNAVAILABLE',
  };
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': '22222222-2222-4222-8222-222222222222' };
  return jest.fn<ApiFetch>(async (url) => {
    if (url.endsWith('/auth/csrf')) return new Response(
      '{"headerName":"X-XSRF-TOKEN","parameterName":"_csrf","token":"synthetic-csrf"}', { status: 200, headers },
    );
    if (status === 204) return new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': headers['X-Request-ID'] } });
    return new Response(JSON.stringify({ error: {
      code: codes[status], message: '시험 오류', requestId: headers['X-Request-ID'], fields: [],
    } }), { status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '1' } : {}) } });
  });
}
function client(fetchImpl: ApiFetch) {
  const result = createApiClient(config, { fetchImpl });
  if (!result.ok) throw new Error('Invalid test configuration');
  return result.value;
}

describe('SCRUM-166 요청 준비와 기존 client 연결', () => {
  it.each([
    '/auth/logout', '/guardian/lock',
    '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/resume',
    '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/end',
  ])('%s의 POST에 body를 추가하지 않고 쿠키·CSRF를 적용한다', async (path) => {
    const send = receiver();
    const api = client(send);
    const prepared = prepareRequestBody({ kind: 'none' });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect((await api.request({ method: 'POST', path, ...prepared.value })).kind).toBe('response');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toBe(`https://api.example.invalid/api/v1${path}`);
    const init = send.mock.calls[1][1];
    expect(init).not.toHaveProperty('body');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error' });
  });

  it('명시한 JSON/UTF-8 헤더의 0바이트 logout을 인증 전환과 CSRF 갱신에 연결한다', async () => {
    const send = receiver();
    const prepared = prepareRequestBody({ kind: 'none' }, { 'Content-Type': 'application/json;charset=UTF-8' });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const result = await client(send).authTransition(
      { method: 'POST', path: '/auth/logout', ...prepared.value },
      (response) => response.status === 204 ? 'changed' : 'unknown',
    );
    expect(result).toMatchObject({ operation: { kind: 'response' }, outcome: 'changed', refresh: { ok: true } });
    expect(send.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.invalid/api/v1/auth/csrf',
      'https://api.example.invalid/api/v1/auth/logout',
      'https://api.example.invalid/api/v1/auth/csrf',
    ]);
    expect(send.mock.calls[1][1]).not.toHaveProperty('body');
    expect(new Headers(send.mock.calls[1][1].headers).get('Content-Type')).toBe('application/json;charset=UTF-8');
  });

  it('JSON 준비 뒤 CSRF 대기 중 원본 DTO를 바꿔도 전송 본문은 바뀌지 않는다', async () => {
    const send = receiver();
    const input = { password: 'synthetic-original', pin: '0012' };
    const prepared = prepareRequestBody({ kind: 'json', value: input });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const pending = client(send).request({ method: 'POST', path: '/auth/login', ...prepared.value });
    input.password = 'synthetic-mutated';
    await pending;
    expect(send.mock.calls[1][1].body).toBe('{"password":"synthetic-original","pin":"0012"}');
    expect(new Headers(send.mock.calls[1][1].headers).get('Content-Type')).toBe('application/json');
  });

  it('FormData 준비 결과를 client가 같은 본문으로 전송한다', async () => {
    const send = receiver();
    const data = new FormData();
    data.append('clientRequestId', '11111111-1111-4111-8111-111111111111');
    const prepared = prepareRequestBody({ kind: 'formData', value: data });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    await client(send).request({ method: 'POST', path: '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/turns', ...prepared.value });
    expect(send.mock.calls[1][1].body).toBe(data);
    expect(new Headers(send.mock.calls[1][1].headers).has('Content-Type')).toBe(false);
    expect(new Headers(send.mock.calls[1][1].headers).get('X-XSRF-TOKEN')).toBe('synthetic-csrf');
  });

  it('준비 실패 분기에서는 CSRF 발급과 업무 요청을 모두 하지 않는다', async () => {
    const send = receiver();
    const api = client(send);
    const prepared = prepareRequestBody({ kind: 'json', value: { password: BigInt(1) } });
    if (prepared.ok) await api.request({ method: 'POST', path: '/auth/login', ...prepared.value });
    expect(prepared).toEqual({ ok: false, reason: 'invalid_body' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 503])('준비한 POST의 HTTP %s를 자동 재전송하지 않는다', async (status) => {
    const send = receiver(status);
    const prepared = prepareRequestBody({ kind: 'json', value: { password: 'synthetic' } });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const result = await client(send).request({ method: 'POST', path: '/auth/login', ...prepared.value });
    expect(result.kind).toBe('response');
    if (result.kind === 'response') expect(result.response.status).toBe(status);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('SCRUM-166 요청 준비 보안 경계', () => {
  it('JSON에만 합성 자격 증명을 담고 URL·로그·저장소로 복사하지 않는다', async () => {
    const outputs = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const logs = outputs.map((name) => jest.spyOn(console, name));
    const writes = jest.fn();
    const storageNames = ['localStorage', 'sessionStorage'] as const;
    const originals = storageNames.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    storageNames.forEach((name) => Object.defineProperty(globalThis, name, { configurable: true, value: { setItem: writes } }));
    try {
      const send = receiver();
      const api = client(send);
      // 값 운반의 비노출 검사이며 endpoint DTO 유효성을 검증하는 fixture는 아니다.
      const value = { password: 'synthetic-password', pin: '0012', code: '000123', verificationToken: 'synthetic-verification' };
      const prepared = prepareRequestBody({ kind: 'json', value });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      await api.request({ method: 'POST', path: '/auth/login', ...prepared.value });
      expect(send.mock.calls.map(([url]) => url)).toEqual([
        'https://api.example.invalid/api/v1/auth/csrf', 'https://api.example.invalid/api/v1/auth/login',
      ]);
      expect(send.mock.calls[1][1].body).toBe('{"password":"synthetic-password","pin":"0012","code":"000123","verificationToken":"synthetic-verification"}');
      const bad = new Proxy({}, { ownKeys() { throw new Error('synthetic-password'); } });
      expect(prepareRequestBody({ kind: 'json', value: bad })).toEqual({ ok: false, reason: 'invalid_body' });
      logs.forEach((log) => expect(log).not.toHaveBeenCalled());
      expect(writes).not.toHaveBeenCalled();
    } finally {
      storageNames.forEach((name, index) => {
        const original = originals[index];
        if (original) Object.defineProperty(globalThis, name, original);
        else Reflect.deleteProperty(globalThis, name);
      });
    }
  });

  it.each(['Cookie', 'Authorization', 'X-XSRF-TOKEN'])('본문 준비를 거쳐도 caller의 %s는 client에서 거절된다', async (header) => {
    const send = receiver();
    const prepared = prepareRequestBody({ kind: 'json', value: {} }, { [header]: 'synthetic-override' });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(await client(send).request({ method: 'POST', path: '/auth/login', ...prepared.value }))
      .toEqual({ kind: 'not_sent', reason: 'invalid_request' });
    expect(send).not.toHaveBeenCalled();
  });
});

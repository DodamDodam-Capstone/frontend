import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createApiClient, type ApiFetch } from './client';
import { parseApiResponse } from './response';

const expectation = { kind: 'binary', statuses: [200] } as const;
const requestId = '22222222-2222-4222-8222-222222222222';
// 실제 음성/codec이 아닌 운반 시험용 바이트와 MIME이다. D13/D14 운영값이 아니다.
const source = new Uint8Array([0, 127, 128, 255, 10, 13]);
function audioResponse(contentType: string | null = 'audio/x-synthetic', bytes = source, status = 200) {
  const response = new Response(bytes.buffer, { status, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } });
  response.headers.delete('Content-Type');
  if (contentType !== null) response.headers.set('Content-Type', contentType);
  return response;
}
afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-166 바이너리 응답', () => {
  it('성공 bytes를 변경하거나 JSON으로 읽거나 clone하지 않는다', async () => {
    const response = audioResponse();
    const text = jest.spyOn(response, 'text');
    const json = jest.spyOn(response, 'json');
    const clone = jest.spyOn(response, 'clone');
    const read = jest.spyOn(response, 'arrayBuffer');
    const result = await parseApiResponse(response, expectation);
    expect(result.kind).toBe('bytes');
    if (result.kind !== 'bytes') return;
    expect(Array.from(new Uint8Array(result.bytes))).toEqual([0, 127, 128, 255, 10, 13]);
    expect(result.meta).toEqual({ status: 200, headers: { requestId, contentType: 'audio/x-synthetic', location: null, retryAfter: null } });
    expect(read).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'body_read_error', reason: 'already_used' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(['audio/wav', 'audio/ogg; codecs=opus', 'AUDIO/MPEG'])('초안 audio 계열 %s를 운반하되 codec 지원을 보증하지 않는다', async (type) => {
    expect(await parseApiResponse(audioResponse(type), expectation)).toMatchObject({ kind: 'bytes', meta: { headers: { contentType: type } } });
  });

  it.each([null, '', 'application/octet-stream', 'application/json', 'text/html', 'audio/*', 'audio/', 'audio/wav, application/json'])('계약 밖/불완전 MIME을 읽기 전에 거절한다: %s', async (type) => {
    const response = audioResponse(type);
    const read = jest.spyOn(response, 'arrayBuffer');
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_content_type', meta: { status: 200 } });
    expect(read).not.toHaveBeenCalled();
  });

  it('0바이트200은 FE 빈2xx 규칙으로 거절하며204 성공으로 바꾸지 않는다', async () => {
    expect(await parseApiResponse(audioResponse('audio/x-synthetic', new Uint8Array(0)), expectation))
      .toMatchObject({ kind: 'format_error', reason: 'empty_body', meta: { status: 200, headers: { requestId } } });
  });

  it.each([201, 202, 204, 206])('binary 성공으로 허용하지 않은%i를 읽지 않는다', async (status) => {
    const response = new Response(null, { status, headers: { 'Content-Type': 'audio/x-synthetic' } });
    const read = jest.spyOn(response, 'arrayBuffer');
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'format_error', reason: 'unexpected_status', meta: { status } });
    expect(read).not.toHaveBeenCalled();
  });

  it('본문 읽기 거절은 원문 예외 없이 HTTP 메타데이터와 함께 반환한다', async () => {
    const response = audioResponse();
    jest.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('synthetic-private'));
    expect(await parseApiResponse(response, expectation)).toEqual({ kind: 'body_read_error', reason: 'read_failed', meta: {
      status: 200, headers: { requestId, contentType: 'audio/x-synthetic', location: null, retryAfter: null },
    } });
  });

  it.each<[number, string]>([[401, 'AUTHENTICATION_REQUIRED'], [403, 'CHILD_SESSION_REQUIRED'], [410, 'AUDIO_EXPIRED'], [429, 'RATE_LIMITED'], [503, 'AUTH_STATE_UNAVAILABLE']])('%i JSON 오류는 바이너리보다 먼저 해석한다', async (status, code) => {
    const response = new Response(JSON.stringify({ error: { code, message: '시험 오류', requestId, fields: [] } }), {
      status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId, 'Retry-After': '1' },
    });
    const read = jest.spyOn(response, 'arrayBuffer');
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'http_error', error: { code }, meta: { status, headers: { retryAfter: '1' } } });
    expect(read).not.toHaveBeenCalled();
  });

  it('오류 상태의 audio MIME과 성공 상태의 JSON을 서로 바꿔 해석하지 않는다', async () => {
    expect(await parseApiResponse(audioResponse('audio/x-synthetic', source, 503), expectation))
      .toMatchObject({ kind: 'format_error', reason: 'invalid_content_type', meta: { status: 503 } });
    const response = new Response('{"data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    expect(await parseApiResponse(response, expectation)).toMatchObject({ kind: 'format_error', reason: 'invalid_content_type' });
    expect(await parseApiResponse(audioResponse(), { kind: 'json', statuses: [200] }))
      .toMatchObject({ kind: 'format_error', reason: 'invalid_content_type' });
  });
});

describe('SCRUM-166 관측 redirect 분리', () => {
  it.each([301, 302, 303, 307, 308])('%i는 본문을 읽거나 Location을 자동 실행하지 않는 별도 결과다', async (status) => {
    const response = new Response('synthetic-private', { status, headers: { Location: '/synthetic-destination', 'X-Request-ID': requestId } });
    response.headers.delete('Content-Type');
    const text = jest.spyOn(response, 'text');
    const bytes = jest.spyOn(response, 'arrayBuffer');
    expect(await parseApiResponse(response, expectation)).toEqual({ kind: 'redirect', meta: {
      status, headers: { requestId, contentType: null, location: '/synthetic-destination', retryAfter: null },
    } });
    expect(text).not.toHaveBeenCalled();
    expect(bytes).not.toHaveBeenCalled();
  });

  it.each([null, 'javascript:synthetic', 'https://provider.example.invalid/authorize?state=synthetic-private'])('Location은 누락/미검증이어도 관측값이며 안전한 탐색 승인이 아니다: %#', async (location) => {
    const response = new Response(null, { status: 302, headers: location === null ? undefined : { Location: location } });
    expect(await parseApiResponse(response, { kind: 'json', statuses: [200] })).toMatchObject({ kind: 'redirect', meta: { status: 302, headers: { location } } });
  });

  it.each([300, 304, 305, 306])('%i를 OAuth 이동이나 정상 응답으로 오인하지 않는다', async (status) => {
    expect(await parseApiResponse(new Response(null, { status }), expectation)).toMatchObject({ kind: 'format_error', reason: 'unexpected_status' });
  });

  it('redirect:error로 거절된 전송을 관측302로 바꾸지 않는다', async () => {
    const send = jest.fn<ApiFetch>(async () => { throw new TypeError('synthetic-private'); });
    const configured = createApiClient({ appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' }, { fetchImpl: send });
    if (!configured.ok) throw new Error('Invalid synthetic configuration');
    expect(await configured.value.request({ method: 'GET', path: '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/turns/33333333-3333-4333-8333-333333333333/audio' })).toEqual({ kind: 'transport_error', context: expect.any(Object) });
    expect(send.mock.calls[0][1].redirect).toBe('error');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

const config = { appEnv: 'test', apiMode: 'real', apiBaseUrl: 'https://api.example.invalid/api/v1' };
const audioPath = '/children/11111111-1111-4111-8111-111111111111/conversations/22222222-2222-4222-8222-222222222222/turns/33333333-3333-4333-8333-333333333333/audio';

describe('SCRUM-166 바이너리·redirect client 연결', () => {
  it('실제 client의 음성 GET은 쿠키를 포함하고 CSRF 발급 없이 bytes를 인계한다', async () => {
    const send = jest.fn<ApiFetch>(async () => audioResponse());
    const configured = createApiClient(config, { fetchImpl: send });
    if (!configured.ok) throw new Error('Invalid synthetic configuration');
    const received = await configured.value.request({ method: 'GET', path: audioPath });
    if (received.kind !== 'response') throw new Error('Expected raw response');
    const result = await parseApiResponse(received.response, expectation);
    expect(result.kind).toBe('bytes');
    if (result.kind === 'bytes') expect(Array.from(new Uint8Array(result.bytes))).toEqual([0, 127, 128, 255, 10, 13]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(`${config.apiBaseUrl}${audioPath}`);
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' });
    expect(new Headers(send.mock.calls[0][1].headers).has('X-XSRF-TOKEN')).toBe(false);
  });

  it.each([301, 302, 303, 307, 308])('주입 수신자의 POST%i를 해석해도 Location 탐색·재전송이 없다', async (status) => {
    // 합성 Response를 직접 주입한다. native fetch가3xx를 노출한다는 증거가 아니다.
    const send = jest.fn<ApiFetch>(async (url) => url.endsWith('/auth/csrf')
      ? new Response('{"headerName":"X-XSRF-TOKEN","parameterName":"_csrf","token":"synthetic-csrf"}', { headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status, headers: { Location: 'https://other.example.invalid/synthetic' } }));
    const configured = createApiClient(config, { fetchImpl: send });
    if (!configured.ok) throw new Error('Invalid synthetic configuration');
    const received = await configured.value.request({ method: 'POST', path: '/guardian/lock' });
    if (received.kind !== 'response') throw new Error('Expected injected response');
    expect(await parseApiResponse(received.response, { kind: 'empty', statuses: [204] })).toMatchObject({ kind: 'redirect', meta: { status } });
    expect(send.mock.calls.map(([url]) => url.split('/').pop())).toEqual(['csrf', 'lock']);
    expect(send.mock.calls[1][1]).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(send.mock.calls[1][1]).not.toHaveProperty('body');
  });

  it('바이너리·Location·읽기 예외를 console이나 추가 fetch로 복사하지 않는다', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
    const fetch = jest.spyOn(globalThis, 'fetch');
    await parseApiResponse(audioResponse(), expectation);
    await parseApiResponse(new Response(null, { status: 302, headers: { Location: 'https://provider.example.invalid/authorize?state=synthetic-private' } }), expectation);
    const failed = audioResponse();
    jest.spyOn(failed, 'arrayBuffer').mockRejectedValue(new Error('synthetic-private'));
    const result = await parseApiResponse(failed, expectation);
    expect(JSON.stringify(result)).not.toContain('synthetic-private');
    expect(fetch).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

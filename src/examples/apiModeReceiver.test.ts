import { describe, expect, it, jest } from '@jest/globals';
import * as mockHandlers from '../api/mockAuthMe';
import { createExampleTransport, type ExampleFetch } from '../api/exampleTransport';

const config = {
  appEnv: 'development',
  apiMode: 'mock',
  apiBaseUrl: 'https://api.example.invalid/api/v1',
};
const authMe = { method: 'GET', path: '/auth/me' };

function ready<T>(result: { ok: true; value: T } | { ok: false; errors: unknown[] }): T {
  if (!result.ok) throw new Error(`Unexpected configuration error: ${JSON.stringify(result.errors)}`);
  return result.value;
}

describe('SCRUM-161 API 모드 테스트 수신자', () => {
  it('mock 모드가 명세의 계정 상태를 재현하며 네트워크를 호출하지 않는다', async () => {
    const fetchImpl = jest.fn<ExampleFetch>();
    const request = ready(createExampleTransport(config, { fetchImpl, scenario: 'signedIn' }));

    const response = await request(authMe);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: {
      accountId: '11111111-1111-4111-8111-111111111111',
      email: 'guardian@example.com',
      childId: null,
      hasPin: false,
      guardianUnlockedUntil: null,
    } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mock 비로그인 응답은 401 코드와 동일한 서버 requestId 헤더를 준다', async () => {
    const request = ready(createExampleTransport(config, { scenario: 'signedOut' }));

    const response = await request(authMe);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
      requestId: '22222222-2222-4222-8222-222222222222',
      fields: [],
    } });
    expect(response.headers.get('X-Request-ID')).toBe(body.error.requestId);
  });

  it('mock에 정의하지 않은 요청은 네트워크로 넘어가지 않는다', async () => {
    const fetchImpl = jest.fn<ExampleFetch>();
    const request = ready(createExampleTransport(config, { fetchImpl }));

    await expect(request({ method: 'GET', path: '/unregistered' })).rejects.toThrow('Unsupported example request');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('real 모드는 mock handler를 등록·실행하지 않고 실제 전송 함수를 사용한다', async () => {
    const register = jest.spyOn(mockHandlers, 'registerExampleHandlers');
    const fetchImpl = jest.fn<ExampleFetch>(async () => new Response('{"data":{}}', { status: 200 }));
    try {
      const request = ready(createExampleTransport({ ...config, apiMode: 'real' }, { fetchImpl, scenario: 'signedOut' }));
      expect(register).not.toHaveBeenCalled();

      const response = await request(authMe);

      expect(response.status).toBe(200);
      expect(fetchImpl).toHaveBeenCalledWith('https://api.example.invalid/api/v1/auth/me', expect.objectContaining({
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
      }));
      expect(register).not.toHaveBeenCalled();
    } finally {
      register.mockRestore();
    }
  });

  it('real 전송 실패를 mock 성공으로 바꾸지 않는다', async () => {
    const fetchImpl = jest.fn<ExampleFetch>(async () => { throw new Error('transport unavailable'); });
    const request = ready(createExampleTransport({ ...config, apiMode: 'real' }, { fetchImpl }));

    const pending = request(authMe);
    await expect(pending).rejects.toBeInstanceOf(Error);
    await expect(pending).rejects.not.toThrow('transport unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('real 모드의 미지원 요청도 Promise로 거절하고 전송하지 않는다', async () => {
    const fetchImpl = jest.fn<ExampleFetch>();
    const request = ready(createExampleTransport({ ...config, apiMode: 'real' }, { fetchImpl }));

    await expect(request({ method: 'POST', path: '/auth/me' })).rejects.toThrow('Unsupported example request');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('설정 오류가 있으면 요청 실행기를 만들지 않는다', () => {
    expect(createExampleTransport({ ...config, apiMode: 'm0ck' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_MODE', code: 'invalid_mode' }],
    });
    expect(createExampleTransport({ ...config, apiMode: 'real', apiBaseUrl: undefined })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'required' }],
    });
  });
});

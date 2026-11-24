import { describe, expect, it } from '@jest/globals';
import { readEnvironment, resolveApiConfig, resolveApiMode, resolveOAuthConfig } from './env';

const development = {
  appEnv: 'development',
  apiBaseUrl: 'http://localhost:8080/api/v1',
  oauthRedirectUri: 'dev.dodamdodamcapstone.dodamdodam://oauth/callback',
};

describe('API 설정 준비', () => {
  it.each(['development', 'test', 'production'])('%s 환경에 공급한 주소를 다른 환경으로 대체하지 않는다', (appEnv) => {
    expect(resolveApiConfig({ appEnv, apiBaseUrl: 'https://api.example.invalid/api/v1' })).toEqual({
      ok: true, value: { appEnv, apiBaseUrl: 'https://api.example.invalid/api/v1' },
    });
  });

  it('OAuth 미설정이어도 개발 API 설정은 사용할 수 있다', () => {
    expect(resolveApiConfig({ appEnv: 'development', apiBaseUrl: development.apiBaseUrl })).toEqual({
      ok: true, value: { appEnv: 'development', apiBaseUrl: development.apiBaseUrl },
    });
  });

  it.each([undefined, '', '   '])('환경 미설정(%s)은 운영 환경으로 대체하지 않는다', (appEnv) => {
    expect(resolveApiConfig({ ...development, appEnv })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_APP_ENV', code: 'required' }],
    });
  });

  it('알 수 없는 환경은 거절한다', () => {
    expect(resolveApiConfig({ ...development, appEnv: 'prod' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_APP_ENV', code: 'invalid_environment' }],
    });
  });

  it.each([undefined, '', '  '])('API 주소 미설정(%s)은 명시적으로 실패한다', (apiBaseUrl) => {
    expect(resolveApiConfig({ ...development, apiBaseUrl })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'required' }],
    });
  });

  it.each([
    '/api/v1', 'not-a-url', 'https:/api.example.invalid',
    'https://api.example.invalid/a b', 'https://api.example.invalid\\path',
    'https://api.example.invalid/?token=private-value',
    'https://user:password@api.example.invalid', 'https://api.example.invalid/#secret',
    'file:///tmp/api', 'javascript:alert(1)',
  ])('사용할 수 없는 주소를 거절하고 입력값을 오류에 노출하지 않는다: %s', (apiBaseUrl) => {
    const result = resolveApiConfig({ ...development, apiBaseUrl });
    expect(result).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'invalid_url' }],
    });
    expect(JSON.stringify(result)).not.toContain(apiBaseUrl);
  });

  it.each(['\u0000', '\u001f', '\u007f'])('URL 파서가 제거하거나 보정하는 제어문자는 거절한다', (control) => {
    expect(resolveApiConfig({ ...development, apiBaseUrl: `https://api.example.invalid/api/v1${control}` }).ok).toBe(false);
    expect(resolveOAuthConfig({ ...development, oauthRedirectUri: `${development.oauthRedirectUri}${control}` }).ok).toBe(false);
  });

  it.each(['test', 'production'])('%s 환경에서 평문 HTTP를 거절한다', (appEnv) => {
    expect(resolveApiConfig({ ...development, appEnv }).ok).toBe(false);
  });
});

describe('OAuth 복귀 설정 준비', () => {
  it('API 설정과 독립적으로 현재 앱 scheme의 복귀 URI를 읽는다', () => {
    expect(resolveOAuthConfig({ appEnv: 'development', oauthRedirectUri: development.oauthRedirectUri })).toEqual({
      ok: true, value: { appEnv: 'development', oauthRedirectUri: development.oauthRedirectUri },
    });
  });

  it('HTTPS 복귀 주소의 형식을 검증한다 (앱 링크 등록 검증은 아님)', () => {
    expect(resolveOAuthConfig({ appEnv: 'production', oauthRedirectUri: 'https://app.example.invalid/oauth/callback' }).ok).toBe(true);
  });

  it('미설정 복귀 주소를 임의로 생성하지 않는다', () => {
    expect(resolveOAuthConfig({ appEnv: 'development' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_OAUTH_REDIRECT_URI', code: 'required' }],
    });
  });

  it.each([
    'exp://localhost:8081', 'unregistered://oauth/callback',
    'javascript:alert(1)', 'data:text/plain,abc',
    'dev.dodamdodamcapstone.dodamdodam://oauth/callback?code=secret',
    'dev.dodamdodamcapstone.dodamdodam://oauth/callback#token',
    '/login/oauth2/code/google',
  ])('개발 서버·미등록 scheme·인증 결과가 포함된 URI를 설정으로 허용하지 않는다: %s', (oauthRedirectUri) => {
    expect(resolveOAuthConfig({ ...development, oauthRedirectUri })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_OAUTH_REDIRECT_URI', code: 'invalid_url' }],
    });
  });
});

it('설정을 읽는 것만으로 누락값 검증 예외를 던지지 않는다', () => {
  expect(() => readEnvironment()).not.toThrow();
});

describe('API 실행 모드', () => {
  it.each(['development', 'test'])('%s 환경에서 mock과 real을 각각 명시적으로 선택한다', (appEnv) => {
    expect(resolveApiMode({ appEnv, apiMode: 'mock' })).toEqual({ ok: true, value: 'mock' });
    expect(resolveApiMode({ appEnv, apiMode: 'real' })).toEqual({ ok: true, value: 'real' });
  });

  it.each([undefined, '', '  '])('모드 누락(%s)을 real이나 mock으로 대체하지 않는다', (apiMode) => {
    expect(resolveApiMode({ appEnv: 'development', apiMode })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_MODE', code: 'required' }],
    });
  });

  it('모드 오타는 값 노출 없이 거절한다', () => {
    expect(resolveApiMode({ appEnv: 'development', apiMode: 'm0ck' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_MODE', code: 'invalid_mode' }],
    });
  });

  it('운영 환경의 mock 선택을 거절하고 real만 허용한다', () => {
    expect(resolveApiMode({ appEnv: 'production', apiMode: 'mock' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_MODE', code: 'mock_in_production' }],
    });
    expect(resolveApiMode({ appEnv: 'production', apiMode: 'real' })).toEqual({ ok: true, value: 'real' });
  });
});

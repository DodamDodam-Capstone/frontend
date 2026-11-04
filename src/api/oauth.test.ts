import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Linking } from 'react-native';
import * as environment from '../config/env';
import { resolveOAuthStartUrl } from './oauth';

const config = { appEnv: 'test', apiBaseUrl: 'https://api.example.invalid/api/v1' };
afterEach(() => { jest.restoreAllMocks(); });

describe('SCRUM-166 OAuth 시작 주소 준비', () => {
  it.each(['', '/', '/api/v1', '/api/v1/', '/proxy/api/v1'])('API base path %s와 무관하게 origin의 framework 경로를 만든다', (path) => {
    expect(resolveOAuthStartUrl({ ...config, apiBaseUrl: `https://api.example.invalid:8443${path}` })).toEqual({
      ok: true, value: 'https://api.example.invalid:8443/oauth2/authorization/google',
    });
  });

  it('개발 HTTP origin을 보존하고 운영 주소나 앱 callback으로 대체하지 않는다', () => {
    expect(resolveOAuthStartUrl({ appEnv: 'development', apiBaseUrl: 'http://127.0.0.1:8080/api/v1' })).toEqual({
      ok: true, value: 'http://127.0.0.1:8080/oauth2/authorization/google',
    });
  });

  it('복귀 URI나 그 query를 OAuth 시작 URL에 붙이지 않는다', () => {
    expect(resolveOAuthStartUrl({ ...config, oauthRedirectUri: 'dev.example://callback?token=synthetic-private' })).toEqual({
      ok: true, value: 'https://api.example.invalid/oauth2/authorization/google',
    });
  });

  it('인자를 생략하면 기존 환경 읽기를 재사용한다', () => {
    // Expo의 정적 환경 치환은 test:env가 검증한다. 여기서는 reader 이후의 URL 생성을 검증한다.
    jest.spyOn(environment, 'readEnvironment').mockReturnValue(config);
    expect(resolveOAuthStartUrl()).toEqual({ ok: true, value: 'https://api.example.invalid/oauth2/authorization/google' });
  });

  it.each([
    'https://api.example.invalid/api/v1?token=synthetic-private',
    'https://api.example.invalid/api/v1#synthetic-private',
    'https://user:synthetic-private@api.example.invalid/api/v1',
    '/oauth2/authorization/google', 'javascript:synthetic-private',
    'https:/api.example.invalid', 'https://api.example.invalid/api/v1\u0000',
    'https://api.example.invalid\\synthetic-private',
  ])('API 설정의 자격증명·query·fragment·잘못된 URL을 고정 오류로 거절한다: %#', (apiBaseUrl) => {
    expect(resolveOAuthStartUrl({ ...config, apiBaseUrl })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'invalid_url' }],
    });
  });

  it.each(['test', 'production'])('%s 환경의 평문 HTTP는 거절한다', (appEnv) => {
    expect(resolveOAuthStartUrl({ appEnv, apiBaseUrl: 'http://api.example.invalid/api/v1' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'invalid_url' }],
    });
  });

  it('필수 환경·주소를 임의 기본값으로 채우지 않는다', () => {
    expect(resolveOAuthStartUrl({ apiBaseUrl: config.apiBaseUrl })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_APP_ENV', code: 'required' }],
    });
    expect(resolveOAuthStartUrl({ ...config, appEnv: 'prod' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_APP_ENV', code: 'invalid_environment' }],
    });
    expect(resolveOAuthStartUrl({ appEnv: 'test' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'required' }],
    });
  });

  it('주소 준비만으로 fetch·OS 이동·원문 로그를 실행하지 않는다', () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const open = jest.spyOn(Linking, 'openURL');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
    expect(resolveOAuthStartUrl(config).ok).toBe(true);
    expect(resolveOAuthStartUrl({ ...config, apiBaseUrl: 'https://user:synthetic-private@api.example.invalid' }).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

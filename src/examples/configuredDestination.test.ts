import { describe, expect, it } from '@jest/globals';

import { prepareDestinationExample } from './configuredDestination';
import { ROUTES, type RouteName } from '../navigation/routes';

const input = { appEnv: 'test', apiBaseUrl: 'https://api.example.invalid/api/v1' };

describe('후속 기능용 설정·경로 사용 예제', () => {
  it.each(['login', 'childRegistration', 'home'] as RouteName[])('%s 수신자에게 공통 경로와 검증된 설정을 전달한다', (target) => {
    expect(prepareDestinationExample(target, input)).toEqual({
      ok: true,
      value: { path: ROUTES[target], appEnv: 'test', apiBaseUrl: 'https://api.example.invalid/api/v1' },
    });
  });

  it('환경 설정 실패 시 이동 준비 결과를 만들지 않는다', () => {
    expect(prepareDestinationExample('home', { appEnv: 'production' })).toEqual({
      ok: false, errors: [{ variable: 'EXPO_PUBLIC_API_BASE_URL', code: 'required' }],
    });
  });
});

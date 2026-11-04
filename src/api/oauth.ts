import { readEnvironment, resolveApiConfig, type ConfigResult, type EnvironmentInput } from '../config/env';

// 시작 URL에는 query가 없다. 브라우저 실행·앱 복귀·쿠키 연결은126/129에서 담당한다.
export function resolveOAuthStartUrl(input: EnvironmentInput = readEnvironment()): ConfigResult<string> {
  const config = resolveApiConfig(input);
  if (!config.ok) return config;
  return { ok: true, value: new URL('/oauth2/authorization/google', config.value.apiBaseUrl).href };
}

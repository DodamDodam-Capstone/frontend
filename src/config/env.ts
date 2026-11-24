import appConfig from '../../app.json';

export type AppEnvironment = 'development' | 'test' | 'production';
export type ApiMode = 'mock' | 'real';
export type EnvironmentInput = {
  appEnv?: string;
  apiMode?: string;
  apiBaseUrl?: string;
  oauthRedirectUri?: string;
};
export type ConfigError = {
  variable: 'EXPO_PUBLIC_APP_ENV' | 'EXPO_PUBLIC_API_MODE' | 'EXPO_PUBLIC_API_BASE_URL' | 'EXPO_PUBLIC_OAUTH_REDIRECT_URI';
  code: 'required' | 'invalid_environment' | 'invalid_mode' | 'mock_in_production' | 'invalid_url';
};
export type ConfigResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ConfigError[] };

// Expo only inlines static dot-notation references. Do not destructure process.env.
// Reading is safe before configuration exists; each consumer validates when needed.
export function readEnvironment(): EnvironmentInput {
  return {
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    apiMode: process.env.EXPO_PUBLIC_API_MODE,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    oauthRedirectUri: process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URI,
  };
}

function failure(variable: ConfigError['variable'], code: ConfigError['code']): ConfigResult<never> {
  return { ok: false, errors: [{ variable, code }] };
}

function resolveAppEnvironment(value: string | undefined): ConfigResult<AppEnvironment> {
  if (!value?.trim()) return failure('EXPO_PUBLIC_APP_ENV', 'required');
  if (value !== 'development' && value !== 'test' && value !== 'production') {
    return failure('EXPO_PUBLIC_APP_ENV', 'invalid_environment');
  }
  return { ok: true, value };
}

export function resolveApiMode(input: EnvironmentInput = readEnvironment()): ConfigResult<ApiMode> {
  const environment = resolveAppEnvironment(input.appEnv);
  if (!environment.ok) return environment;
  if (!input.apiMode?.trim()) return failure('EXPO_PUBLIC_API_MODE', 'required');
  if (input.apiMode !== 'mock' && input.apiMode !== 'real') {
    return failure('EXPO_PUBLIC_API_MODE', 'invalid_mode');
  }
  if (environment.value === 'production' && input.apiMode === 'mock') {
    return failure('EXPO_PUBLIC_API_MODE', 'mock_in_production');
  }
  return { ok: true, value: input.apiMode };
}

function validAddress(value: string, protocols: string[]): boolean {
  // Reject URL-parser repairs and credential-bearing settings before parsing.
  if (!/^[a-z][a-z0-9+.-]*:\/\/[^/]/i.test(value) || /[\s\\?#]/.test(value)) return false;
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return false;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    // Never expose the parser exception: it can contain the complete input.
    return false;
  }
}

export function resolveApiConfig(input: EnvironmentInput = readEnvironment()): ConfigResult<{
  appEnv: AppEnvironment;
  apiBaseUrl: string;
}> {
  const environment = resolveAppEnvironment(input.appEnv);
  if (!environment.ok) return environment;
  if (!input.apiBaseUrl?.trim()) return failure('EXPO_PUBLIC_API_BASE_URL', 'required');
  const protocols = environment.value === 'development' ? ['https:', 'http:'] : ['https:'];
  if (!validAddress(input.apiBaseUrl, protocols)) return failure('EXPO_PUBLIC_API_BASE_URL', 'invalid_url');
  return { ok: true, value: { appEnv: environment.value, apiBaseUrl: input.apiBaseUrl } };
}

export function resolveOAuthConfig(input: EnvironmentInput = readEnvironment()): ConfigResult<{
  appEnv: AppEnvironment;
  oauthRedirectUri: string;
}> {
  const environment = resolveAppEnvironment(input.appEnv);
  if (!environment.ok) return environment;
  if (!input.oauthRedirectUri?.trim()) return failure('EXPO_PUBLIC_OAUTH_REDIRECT_URI', 'required');
  // Without expo.scheme, prebuild registers the package/bundle identifier.
  // URL validity alone does not prove OS linking or the backend redirect allowlist.
  const protocols = ['https:', `${appConfig.expo.ios.bundleIdentifier}:`];
  if (environment.value === 'development') protocols.push('http:');
  if (!validAddress(input.oauthRedirectUri, protocols)) return failure('EXPO_PUBLIC_OAUTH_REDIRECT_URI', 'invalid_url');
  return { ok: true, value: { appEnv: environment.value, oauthRedirectUri: input.oauthRedirectUri } };
}

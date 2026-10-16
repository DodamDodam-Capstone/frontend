import { readEnvironment, resolveApiConfig, type AppEnvironment, type ConfigResult, type EnvironmentInput } from '../config/env';
import { ROUTES, type RouteName, type RoutePath } from '../navigation/routes';

// Minimal receiver example for SCRUM-160: no navigation, auth decision or request.
// Real screens should consume the same definitions; this is not an access guard.
export function prepareDestinationExample(
  target: RouteName,
  input: EnvironmentInput = readEnvironment(),
): ConfigResult<{ path: RoutePath; appEnv: AppEnvironment; apiBaseUrl: string }> {
  const config = resolveApiConfig(input);
  if (!config.ok) return config;
  return { ok: true, value: { ...config.value, path: ROUTES[target] } };
}

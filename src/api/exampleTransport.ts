import { readEnvironment, resolveApiConfig, resolveApiMode, type ConfigResult, type EnvironmentInput } from '../config/env';
import { registerExampleHandlers } from './mockAuthMe';
import type { ExampleScenario } from './mockAuthMe';

export type ExampleRequest = { method: string; path: string };
export type ExampleTransport = (request: ExampleRequest) => Promise<Response>;
export type ExampleFetch = (url: string, init: { method: 'GET' }) => Promise<Response>;

export function createExampleTransport(
  input: EnvironmentInput = readEnvironment(),
  options: { fetchImpl?: ExampleFetch; scenario?: ExampleScenario } = {},
): ConfigResult<ExampleTransport> {
  const mode = resolveApiMode(input);
  if (!mode.ok) return mode;
  const config = resolveApiConfig(input);
  if (!config.ok) return config;

  if (mode.value === 'mock') {
    return { ok: true, value: registerExampleHandlers(options.scenario ?? 'signedIn') };
  }

  return { ok: true, value: async ({ method, path }) => {
    if (method !== 'GET' || path !== '/auth/me') throw new Error('Unsupported example request');
    const url = `${config.value.apiBaseUrl.replace(/\/+$/, '')}${path}`;
    return (options.fetchImpl ?? fetch)(url, { method: 'GET' });
  } };
}

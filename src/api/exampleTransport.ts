import { readEnvironment, type ConfigResult, type EnvironmentInput } from '../config/env';
import { createApiClient, type ApiFetch } from './client';
import type { ExampleScenario } from './mockAuthMe';

export type ExampleRequest = { method: string; path: string };
export type ExampleTransport = (request: ExampleRequest) => Promise<Response>;
export type ExampleFetch = ApiFetch;

export function createExampleTransport(
  input: EnvironmentInput = readEnvironment(),
  options: { fetchImpl?: ExampleFetch; scenario?: ExampleScenario } = {},
): ConfigResult<ExampleTransport> {
  const client = createApiClient(input, options);
  if (!client.ok) return client;
  return { ok: true, value: async ({ method, path }) => {
    if (method !== 'GET' || path !== '/auth/me') throw new Error('Unsupported example request');
    const result = await client.value.request({ method, path });
    if (result.kind === 'response') return result.response;
    throw new Error('Example request failed');
  } };
}

import type { ExampleTransport } from './exampleTransport';

export type ExampleScenario = 'signedIn' | 'signedOut';

export function registerExampleHandlers(scenario: ExampleScenario): ExampleTransport {
  return async ({ method, path }) => {
    if (method !== 'GET' || path !== '/auth/me') throw new Error('Unsupported example request');

    const requestId = '22222222-2222-4222-8222-222222222222';
    const signedIn = scenario === 'signedIn';
    const body = signedIn
      ? { data: {
        accountId: '11111111-1111-4111-8111-111111111111',
        email: 'guardian@example.com',
        childId: null,
        hasPin: false,
        guardianUnlockedUntil: null,
      } }
      : { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required', requestId, fields: [] } };

    return new Response(JSON.stringify(body), {
      status: signedIn ? 200 : 401,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
    });
  };
}

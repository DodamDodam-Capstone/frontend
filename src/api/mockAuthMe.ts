import { createHomeFixture, MOCK_CHILD_ID } from '../home/homeFixture';
import { TEST_CHILD_CHARACTERS, validateChildDraft, type ChildRegistrationInput } from '../childRegistration/childRegistrationData';
import type { ExampleTransport } from './exampleTransport';

export type ExampleScenario = 'signedIn' | 'signedOut' | 'childRegistered';
export const MOCK_NEW_CHILD_ID = '44444444-4444-4444-8444-444444444444';
type MockChild = ChildRegistrationInput & { childId: string; createdAt: string };

function readProfile(body: BodyInit | undefined) {
  try {
    if (typeof body !== 'string') return;
    const { name, nickname, birthDate, gender, characterId, interests = [], ...extra } = JSON.parse(body);
    if (Object.keys(extra).length > 0 || typeof name !== 'string' || typeof nickname !== 'string'
      || typeof birthDate !== 'string' || typeof characterId !== 'string'
      || !Array.isArray(interests) || interests.some(value => typeof value !== 'string')) return;
    return validateChildDraft({ name, nickname, birthDate, gender, characterId, interests }, TEST_CHILD_CHARACTERS);
  } catch {
    return;
  }
}

export function registerExampleHandlers(scenario: ExampleScenario): ExampleTransport {
  let signedIn = scenario !== 'signedOut';
  let registered: MockChild | undefined = scenario === 'childRegistered' ? {
    childId: MOCK_CHILD_ID, name: '도담친구', nickname: '별이', birthDate: '2020-02-29', gender: 'FEMALE',
    characterId: 'dodam', interests: [], createdAt: '2026-10-02T09:00:00+09:00',
  } : undefined;
  return async ({ method, path, body }) => {
    const requestId = '22222222-2222-4222-8222-222222222222';
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId };
    const json = (status: number, value: unknown, extra?: Record<string, string>) => new Response(JSON.stringify(value), {
      status, headers: { ...headers, ...extra },
    });
    const error = (status: number, code: string, fields: { field: string; reason: string }[] = []) =>
      json(status, { error: { code, message: code, requestId, fields } });
    if (method === 'GET' && path === '/auth/csrf') {
      return new Response(JSON.stringify({ headerName: 'X-XSRF-TOKEN', parameterName: '_csrf', token: 'mock-csrf-token' }), {
        status: 200, headers,
      });
    }
    if (method === 'POST' && path === '/auth/logout') {
      if (!signedIn) return error(401, 'AUTHENTICATION_REQUIRED');
      signedIn = false;
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId } });
    }
    if (method === 'POST' && path === '/children') {
      if (!signedIn) return error(401, 'AUTHENTICATION_REQUIRED');
      const profile = readProfile(body);
      if (!profile?.ok) {
        const fields = Object.keys(profile?.errors ?? { body: true }).map(field => ({ field, reason: 'invalid' }));
        return error(400, 'VALIDATION_FAILED', fields);
      }
      if (registered) return error(409, 'CHILD_LIMIT_REACHED');
      const createdAt = `${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 19)}+09:00`;
      registered = { ...profile.value, childId: MOCK_NEW_CHILD_ID, createdAt };
      return json(201, { data: registered }, { Location: `/api/v1/children/${registered.childId}` });
    }
    if (method === 'GET' && path === '/children') {
      return signedIn ? json(200, { data: { items: registered ? [registered] : [] } }) : error(401, 'AUTHENTICATION_REQUIRED');
    }
    if (method === 'GET' && registered && path === `/children/${registered.childId}/home`) {
      if (!signedIn) return error(401, 'AUTHENTICATION_REQUIRED');
      return json(200, { data: createHomeFixture({ ...registered, joinedAt: registered.createdAt }) });
    }
    if (method !== 'GET' || path !== '/auth/me') throw new Error('Unsupported example request');

    const response = signedIn
      ? { data: {
        accountId: '11111111-1111-4111-8111-111111111111',
        email: 'guardian@example.com',
        childId: registered?.childId ?? null,
        hasPin: false,
        guardianUnlockedUntil: null,
      } }
      : { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required', requestId, fields: [] } };

    return new Response(JSON.stringify(response), {
      status: signedIn ? 200 : 401,
      headers,
    });
  };
}

import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { createApiClient, type ApiFetch, type ApiResult, type AuthOutcome, type AuthTransitionResult } from '../../src/api/client';
import type { CsrfResult } from '../../src/api/csrf';

const allCases = ['login', 'logout', 'login-failed', 'csrf-invalid', 'unknown503', 'classifier-error', 'auth-network',
  'refresh401', 'refresh403', 'refresh429', 'refresh503', 'refresh-invalid', 'refresh-network', 'refresh302',
  'auth-held', 'refresh-held', 'drain-csrf', 'cancel-csrf', 'cancel-drain', 'cancel-auth', 'cancel-body', 'stale-get', 'stale-post', 'pre-cancel', 'late-csrf', 'cancel-old'];
const selected = process.env.EXPO_PUBLIC_NATIVE_PROBE_CASE;
const cases = selected && allCases.includes(selected) ? [selected] : allCases;
type SmallResult = { kind?: ApiResult['kind']; status?: number; reason?: string; ok?: boolean };
type State = { csrf: number; auth: number; post: number; get: number; old: number; held: number; activeResponses: number; waiters: number;
  authPairs: boolean; postPairs: boolean; oldPairs: boolean; authBytes: number; authBodyMatches: boolean; anonymous: boolean;
  refreshCookieAbsent: boolean; refreshHadOldCookie: boolean; refreshCookieMatchesAuth: boolean; oldMissingCsrfCookie: boolean; authSawCsrfMismatch: boolean;
  authClosed: boolean; authFinished: boolean; authClosedBeforeRelease: boolean; blockedLateWrite: boolean; positive: number; sink: number; events: string[] };
type CookieState = { cookieNamePresent: boolean; matchesOldCookie: boolean; matchesCurrentCookie: boolean; matchesAuthCookie: boolean; csrfCookieNamePresent: boolean; csrfCookieMatchesCurrent: boolean };
type Report = { platform: string; stage: '5'; pass: boolean; cleanup: boolean; fetchCalls: number; classified: number;
  checks: Record<string, boolean>; operation?: SmallResult; secondary?: SmallResult; refresh?: SmallResult;
  outcome?: AuthTransitionResult['outcome']; before?: State; issue?: 'incomplete' | 'deadline' };
const small = (value: ApiResult): SmallResult => value.kind === 'response' ? { kind: value.kind, status: value.response.status }
  : value.kind === 'not_sent' ? { kind: value.kind, reason: value.reason } : { kind: value.kind };
const success = (value: ApiResult) => value.kind === 'response' && value.response.status === 200;
const blocked = (value: ApiResult) => value.kind === 'not_sent' && value.reason === 'auth_transition';
function bounded<T>(promise: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('probe_incomplete')), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

async function runCase(name: string) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  const root = `http://${host}:48591/runs/${Platform.OS}-auth-${name}-${Date.now().toString(36)}`;
  const report: Report = { platform: Platform.OS, stage: '5', pass: false, cleanup: false, fetchCalls: 0, classified: 0, checks: {} };
  const tasks = new Set<Promise<unknown>>(); const controllers: AbortController[] = [];
  let expired = false; let active = 0; let authSent = false; let classifyStarted!: () => void;
  const classification = new Promise<void>((resolve) => { classifyStarted = resolve; });
  const track = <T,>(promise: Promise<T>) => { tasks.add(promise); promise.then(() => tasks.delete(promise), () => tasks.delete(promise)); return promise; };
  const control = async (path: string, body?: Report, cleanup = false) => {
    if (expired && !cleanup) throw new Error('probe_incomplete');
    const abort = new AbortController(); const stop = setTimeout(() => abort.abort(), 3000);
    try {
      const response = await fetch(`${root}/${path}`, { credentials: 'include', cache: 'no-store', redirect: 'error', signal: abort.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      if (response.status !== 200) throw new Error('probe_incomplete');
      return await response.json();
    } finally { clearTimeout(stop); }
  };
  const observe = async (cleanup = false): Promise<CookieState> => (await control('api/v1/observe', undefined, cleanup)).data;
  const send: ApiFetch = async (url, init) => {
    if (expired) throw new Error('probe_incomplete');
    if (/\/auth\/(login|logout)$/.test(url)) authSent = true;
    report.fetchCalls += 1; active += 1;
    try { return await fetch(url, init); } finally { active -= 1; }
  };
  const configured = createApiClient({ appEnv: 'development', apiMode: 'real', apiBaseUrl: `${root}/api/v1` }, { fetchImpl: send });
  report.checks.inert = report.fetchCalls === 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { expired = true; report.issue = 'deadline'; reject(new Error('probe_incomplete')); }, 20000); });
  try {
    const passed = await Promise.race([(async () => {
      await control(`start?mode=${name}`);
      if (!configured.ok) throw new Error('probe_incomplete');
      const api = configured.value;
      const classify = async (response: Response): Promise<AuthOutcome> => {
        report.classified += 1; classifyStarted();
        if (name === 'classifier-error') throw new Error('synthetic-private-classifier-value');
        if (response.status === 204) return 'changed';
        const body = await response.json();
        if (response.status === 200 && body.data?.synthetic === true) return 'changed';
        if (response.status === 401 && body.error?.code === 'LOGIN_FAILED') return 'unchanged';
        if (response.status === 403 && body.error?.code === 'CSRF_INVALID') return 'csrf_invalid';
        return 'unknown';
      };
      const auth = (signal?: AbortSignal, logout = name === 'logout') => track(api.authTransition({ method: 'POST', path: logout ? '/auth/logout' : '/auth/login',
        ...(logout ? {} : { body: 'synthetic-auth', headers: { 'Content-Type': 'text/plain' } }), ...(signal ? { signal } : {}) }, classify));
      const remember = async (value: AuthTransitionResult) => {
        report.operation = small(value.operation); report.outcome = value.outcome;
        if (value.refresh) report.refresh = value.refresh;
        if (value.operation.kind === 'response' && name !== 'cancel-body') {
          const response = value.operation.response;
          const body = response.status === 204 ? await response.text() : await response.json();
          report.checks.originalReadable = response.status === 204 ? body === '' : response.status === 200
            ? body.data?.synthetic === true : typeof body.error?.code === 'string';
        }
      };
      const post = () => track(api.request({ method: 'POST', path: '/probe' }));
      const snapshot = async (): Promise<State> => control('snapshot');
      const cookieCurrent = async () => { const value = await observe(); return value.matchesCurrentCookie && !value.matchesOldCookie; };
      const gate = async () => {
        const values = await Promise.all([api.request({ method: 'GET', path: '/probe' }), post(), api.prepareCsrf(), auth(undefined, true)]);
        report.secondary = small(values[3].operation);
        return blocked(values[0]) && blocked(values[1]) && !values[2].ok && values[2].reason === 'auth_transition'
          && values[3].outcome === 'not_attempted' && blocked(values[3].operation);
      };
      const ordering = (state: State) => {
        const first = state.events.indexOf('csrf1.finished'); const auth = state.events.indexOf('auth1.received'); const fresh = state.events.indexOf('csrf2.received');
        return first >= 0 && auth > first && fresh > auth;
      };

      if (name === 'pre-cancel') {
        const abort = new AbortController(); abort.abort();
        const first = await auth(abort.signal); report.secondary = small(first.operation); report.before = await snapshot();
        report.checks.preCancelled = first.outcome === 'not_attempted' && first.operation.kind === 'not_sent' && first.operation.reason === 'cancelled'
          && report.before.csrf === 0 && report.before.auth === 0;
        const next = await auth(); await remember(next);
        report.checks.recovered = next.outcome === 'changed' && next.refresh?.ok === true && success(await post());
      } else if (['auth-held', 'refresh-held'].includes(name)) {
        const pending = auth();
        const phase = name === 'auth-held' ? 'auth' : 'refresh'; await control(`wait?phase=${phase}`);
        report.before = await snapshot(); report.checks.gate = await gate();
        await control(`release?phase=${phase}`); const result = await pending; await remember(result);
        const state = await snapshot(); report.checks.notQueued = state.auth === 1 && state.post === 0 && state.get === 0;
        report.checks.refreshBlocked = result.outcome === 'changed' && result.refresh?.ok === true;
        report.checks.recovered = success(await post());
      } else if (['drain-csrf', 'cancel-csrf', 'cancel-drain'].includes(name)) {
        let oldPost: Promise<ApiResult> | undefined; let preparation: Promise<CsrfResult> | undefined;
        if (name === 'drain-csrf') { oldPost = post(); preparation = track(api.prepareCsrf()); }
        if (name === 'cancel-drain') preparation = track(api.prepareCsrf());
        const abort = new AbortController(); controllers.push(abort);
        const first = auth(name === 'drain-csrf' ? undefined : abort.signal);
        await control('wait?phase=csrf');
        let pending = first;
        if (name !== 'drain-csrf') {
          abort.abort(); const cancelled = await bounded(first); report.secondary = small(cancelled.operation);
          report.checks.preCancelled = cancelled.outcome === 'not_attempted' && cancelled.operation.kind === 'not_sent' && cancelled.operation.reason === 'cancelled';
          pending = auth(undefined, name === 'cancel-csrf');
        }
        report.before = await snapshot();
        report.checks.drained = report.before.csrf === 1 && report.before.auth === 0 && report.before.post === 0 && report.before.held === 1;
        report.checks.gate = blocked(await post());
        await control('release?phase=csrf');
        if (oldPost) { const value = await oldPost; report.secondary = small(value); report.checks.oldBlocked = blocked(value); }
        if (preparation) { const value = await preparation; report.checks.oldResult = !value.ok && value.reason === 'auth_transition'; }
        const result = await pending; await remember(result);
        const state = await snapshot(); report.checks.ordering = ordering(state); report.checks.notQueued = state.post === 0;
        report.checks.recovered = result.refresh?.ok === true && success(await post());
      } else if (name === 'late-csrf' || name === 'cancel-old') {
        if (!(await api.prepareCsrf()).ok) throw new Error('probe_incomplete');
        if (name === 'late-csrf') await control('drop-csrf');
        const old = track(api.request({ method: name === 'late-csrf' ? 'POST' : 'GET', path: name === 'late-csrf' ? '/old-csrf' : '/old' }));
        await control('wait?phase=old');
        const abort = new AbortController(); controllers.push(abort);
        let pending = auth(name === 'cancel-old' ? abort.signal : undefined);
        // 현재 microtask를 소진해 인증 전송 시도 여부를 관찰한다. 운영 지연 값이 아니다.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const sentBeforeRelease = authSent;
        if (name === 'cancel-old') {
          abort.abort(); const cancelled = await bounded(pending); report.secondary = small(cancelled.operation);
          report.checks.preCancelled = cancelled.outcome === 'not_attempted' && cancelled.operation.kind === 'not_sent' && cancelled.operation.reason === 'cancelled';
          pending = auth();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        report.before = await snapshot();
        report.checks.drained = !sentBeforeRelease && report.before.auth === 0 && report.before.old === 1;
        let result: AuthTransitionResult;
        if (name === 'late-csrf' && sentBeforeRelease) {
          // 수정 전에는 auth/refresh 뒤 오래된 403 쿠키가 도착하는 실패를 실제로 재현한다.
          result = await pending; await control('release?phase=old');
        } else { await control('release?phase=old'); result = await pending; }
        const late = await old;
        if (name === 'late-csrf') report.secondary = small(late);
        report.checks.oldResult = late.kind === 'stale_response';
        await remember(result);
        const state = await snapshot();
        report.checks.ordering = state.events.indexOf('old1.finished') < state.events.indexOf('auth1.received') && ordering(state);
        report.checks.recovered = result.refresh?.ok === true && success(await post());
      } else if (name === 'stale-get' || name === 'stale-post') {
        if (!(await api.prepareCsrf()).ok) throw new Error('probe_incomplete');
        const old = track(api.request({ method: name === 'stale-get' ? 'GET' : 'POST', path: '/old' }));
        await control('wait?phase=old'); report.before = await snapshot();
        const pending = auth();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        report.checks.drained = !authSent && (await snapshot()).auth === 0;
        await control('release?phase=old'); const late = await old; report.secondary = small(late);
        const result = await pending; await remember(result);
        report.checks.cookieBefore = await cookieCurrent();
        report.checks.oldResult = late.kind === 'stale_response';
        const state = await snapshot(); report.checks.ordering = ordering(state)
          && state.events.indexOf('old1.finished') < state.events.indexOf('auth1.received') && state.old === 1;
        report.checks.recovered = success(await post());
      } else if (name === 'cancel-auth' || name === 'cancel-body') {
        const abort = new AbortController(); controllers.push(abort);
        const pending = auth(abort.signal); await control(`wait?phase=${name === 'cancel-body' ? 'headers' : 'auth'}`);
        if (name === 'cancel-body') await bounded(classification);
        report.before = await snapshot(); abort.abort(); report.checks.abortSettled = false;
        const result = await bounded(pending); await remember(result);
        report.checks.abortSettled = result.outcome === 'unknown' && (name === 'cancel-auth'
          ? result.operation.kind === 'transport_error' && report.classified === 0
          : result.operation.kind === 'response' && result.operation.response.status === 200 && report.classified === 1);
        await control('wait?phase=auth-closed');
        const before = await observe(); report.checks.cookieBefore = name === 'cancel-body'
          ? before.matchesCurrentCookie && !before.matchesOldCookie : before.matchesOldCookie && !before.matchesCurrentCookie;
        report.checks.unknownCleared = (await api.prepareCsrf()).ok && (await snapshot()).csrf === 2;
        report.checks.recovered = success(await post());
        await control(`release?phase=${name === 'cancel-body' ? 'body' : 'auth'}`); await control('wait?phase=settled');
        const state = await snapshot(); report.checks.lateWriteBlocked = state.authClosed && !state.authFinished && state.authClosedBeforeRelease && state.blockedLateWrite;
      } else {
        // 목적지 양성 대조는 실제 redirect 수신과 구분한다.
        if (name === 'refresh302') {
          const response = await fetch(`${root}/api/v1/sink`, { headers: { 'X-Probe-Control': 'reachability' }, credentials: 'include', cache: 'no-store' });
          report.checks.positive = response.status === 200;
        }
        const result = await auth(); await remember(result);
        if (name.startsWith('refresh')) {
          const failed = result.refresh;
          const expectedReason = name === 'refresh-invalid' ? 'invalid_response' : ['refresh-network', 'refresh302'].includes(name) ? 'network' : 'http';
          report.checks.refreshFailure = result.outcome === 'changed' && failed?.ok === false && failed.reason === expectedReason
            && (failed.reason !== 'http' || failed.status === Number(name.slice(7)));
          report.checks.cookieBefore = await cookieCurrent();
          const denied = await post(); report.secondary = small(denied);
          const state = await snapshot(); report.before = state;
          report.checks.notQueued = denied.kind === 'not_sent' && denied.reason === 'csrf_unavailable' && state.auth === 1 && state.post === 0;
          await control('recover'); report.checks.recovered = success(await post());
        } else if (['unknown503', 'classifier-error', 'auth-network'].includes(name)) {
          const state = await snapshot(); const observed = await observe(); report.before = state;
          report.checks.classified = name === 'auth-network' ? result.operation.kind === 'transport_error' && report.classified === 0
            : result.operation.kind === 'response' && result.operation.response.status === (name === 'unknown503' ? 503 : 200) && report.classified === 1;
          report.checks.cookieBefore = name === 'auth-network' ? observed.matchesOldCookie && !observed.matchesCurrentCookie : observed.matchesCurrentCookie && !observed.matchesOldCookie;
          report.checks.unknownCleared = result.outcome === 'unknown' && result.refresh === undefined && state.csrf === 1 && (await api.prepareCsrf()).ok;
          report.checks.recovered = success(await post());
        } else if (name === 'login-failed') {
          const observed = await observe(); report.checks.cookieBefore = observed.matchesOldCookie && observed.matchesCurrentCookie;
          report.checks.classified = result.outcome === 'unchanged' && result.refresh === undefined && report.classified === 1;
          report.checks.recovered = success(await post()) && (await snapshot()).csrf === 1;
        } else {
          report.checks.classified = result.outcome === (name === 'csrf-invalid' ? 'csrf_invalid' : 'changed') && result.refresh?.ok === true;
          report.checks.recovered = success(await post());
        }
      }
      const state = await snapshot();
      report.checks.authOnce = state.auth === 1 && state.authPairs && state.authBodyMatches && state.authBytes === (name === 'logout' || name === 'cancel-csrf' ? 0 : 14);
      report.checks.postOnce = state.post === 1 && state.postPairs && state.oldPairs && state.get === 0 && state.sink === 0;
      const expectedOutcome = ['unknown503', 'classifier-error', 'auth-network', 'cancel-auth', 'cancel-body'].includes(name) ? 'unknown'
        : name === 'login-failed' ? 'unchanged' : ['csrf-invalid', 'late-csrf'].includes(name) ? 'csrf_invalid' : 'changed';
      report.checks.classified = report.checks.classified !== false && report.outcome === expectedOutcome
        && report.classified === (['auth-network', 'cancel-auth'].includes(name) ? 0 : 1);
      const observed = await observe();
      if (name === 'late-csrf') report.checks.cookieAfter = observed.matchesCurrentCookie && observed.matchesOldCookie
        && observed.csrfCookieMatchesCurrent && state.oldMissingCsrfCookie && state.authSawCsrfMismatch;
      else if (name === 'login-failed') report.checks.cookieAfter = observed.matchesOldCookie && observed.matchesCurrentCookie;
      else if (name === 'logout' || name === 'cancel-csrf') {
        report.checks.cookieBefore = state.refreshCookieAbsent && !state.refreshHadOldCookie;
        report.checks.cookieAfter = observed.matchesCurrentCookie && !observed.matchesOldCookie && state.anonymous;
        report.checks.classified = report.checks.classified && report.refresh?.ok === true;
      } else if (['auth-network', 'cancel-auth', 'refresh302'].includes(name)) {
        report.checks.cookieAfter = observed.matchesCurrentCookie && !observed.matchesOldCookie
          && (name !== 'refresh302' || state.refreshCookieMatchesAuth);
      } else {
        report.checks.cookieAfter = observed.matchesCurrentCookie && !observed.matchesOldCookie && observed.matchesAuthCookie
          && state.refreshCookieMatchesAuth && !state.anonymous;
      }
      return Object.values(report.checks).every((value) => value);
    })(), deadline]);
    report.pass = passed;
  } catch { report.issue ??= 'incomplete'; report.pass = false; }
  finally {
    expired = true; if (timer) clearTimeout(timer); controllers.forEach((abort) => abort.abort());
    try {
      await control('release?phase=all', undefined, true);
      await bounded(Promise.allSettled([...tasks]));
      await control('wait?phase=settled', undefined, true);
      const state: State = await control('snapshot', undefined, true);
      if (active !== 0 || state.held !== 0 || state.activeResponses !== 0 || state.waiters !== 0) throw new Error('probe_incomplete');
      await control('finish', undefined, true);
      const absent = await observe(true);
      report.checks.cleanupAbsent = !absent.cookieNamePresent && (name !== 'late-csrf' || !absent.csrfCookieNamePresent);
      report.cleanup = report.checks.cleanupAbsent;
      report.pass = report.pass && report.cleanup;
    } catch { report.issue ??= 'incomplete'; report.pass = false; }
  }
  try { await control('report', report, true); } catch { report.issue ??= 'incomplete'; }
  return { name, pass: report.pass && !report.issue && report.cleanup, clean: report.cleanup };
}
async function execute() {
  if (!__DEV__ || !['android', 'ios'].includes(Platform.OS)) throw new Error('development_probe_only');
  const results: { name: string; pass: boolean; clean: boolean }[] = [];
  for (const name of cases) { const result = await runCase(name); results.push(result); if (!result.clean) break; }
  return results;
}
let running: ReturnType<typeof execute> | undefined;
function AuthProbe() {
  const [results, setResults] = useState<{ name: string; pass: boolean }[]>();
  useEffect(() => { running ??= execute(); running.then(setResults, () => setResults([])); }, []);
  return <View style={{ padding: 36 }}><Text accessibilityRole="header">SCRUM-165 · 5단계 네이티브 인증 검증</Text>
    <Text selectable>{results ? results.map((value) => `${value.name}: ${value.pass ? 'PASS' : 'FAIL'}`).join('\n') : '검증 중'}</Text></View>;
}
registerRootComponent(AuthProbe);

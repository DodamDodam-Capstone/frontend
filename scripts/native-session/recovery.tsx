import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { createApiClient, type ApiFetch, type ApiRequest, type AuthContext } from '../../src/api/client';
import { classifyRecovery, readCsrfFailure } from '../../src/api/recovery';
import { parseApiResponse } from '../../src/api/response';
import { checksPassed, matchesResponseDecision, safeReport, summarizeCases } from './report';

const allCases = ['current', 'late-json-logout', 'late-json-same', 'late-json-other', 'late401', 'late403', 'afterparse',
  'expiry-cleanup', 'concurrent401', 'csrf-concurrent', 'csrf-recovery-held', 'csrf-invalidated', 'csrf-failure-late', 'guardian403', 'unavailable503'];
const checkNames = ['prepared', 'result', 'counts', 'pairs', 'cleanupAbsent'];
const selected = process.env.EXPO_PUBLIC_NATIVE_PROBE_CASE;
const cases = selected ? allCases.filter((name) => name === selected) : allCases;
type Snapshot = { csrf: number; login: number; logout: number; post: number; get: number; held: number; activeResponses: number; waiters: number; pairs: boolean; bodyEmpty: boolean; account: 'a' | 'b' | 'none' };
type Report = { platform: string; stage: '167-6'; pass: boolean; cleanup: boolean; fetchCalls: number; checks: Record<string, boolean>; issue?: 'incomplete' | 'deadline' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function bounded<T>(promise: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('probe_incomplete')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

async function runCase(name: string) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  const root = `http://${host}:48591/runs/${Platform.OS}-recovery-${name}-${Date.now().toString(36)}`;
  const report: Report = { platform: Platform.OS, stage: '167-6', pass: false, cleanup: false, fetchCalls: 0, checks: {} };
  const tasks = new Set<Promise<unknown>>(); const controllers: AbortController[] = [];
  let expired = false; let active = 0;
  const track = <T,>(promise: Promise<T>) => {
    tasks.add(promise); promise.then(() => tasks.delete(promise), () => tasks.delete(promise)); return promise;
  };
  const control = async (path: string, cleanup = false, body?: Report) => {
    if (expired && !cleanup) throw new Error('probe_incomplete');
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 3000);
    try {
      const response = await fetch(`${root}/${path}`, { credentials: 'include', cache: 'no-store', redirect: 'error', signal: abort.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(safeReport(body, checkNames)) } : {}) });
      if (response.status !== 200) throw new Error('probe_incomplete');
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const send: ApiFetch = async (url, init) => {
    if (expired) throw new Error('probe_incomplete');
    const abort = new AbortController(); controllers.push(abort);
    active += 1; report.fetchCalls += 1;
    try { return await fetch(url, { ...init, signal: abort.signal }); } finally { active -= 1; }
  };
  const configured = createApiClient({ appEnv: 'development', apiMode: 'real', apiBaseUrl: `${root}/api/v1` }, { fetchImpl: send });
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
    expired = true; report.issue = 'deadline'; controllers.forEach((abort) => abort.abort()); reject(new Error('probe_incomplete'));
  }, 20000); });
  try {
    await Promise.race([(async () => {
      await control(`start?mode=${name}`);
      if (!configured.ok) throw new Error('probe_incomplete');
      const api = configured.value;
      const state = { account: 'a' as 'a' | 'b' | 'none', effects: 0, expirations: 0 };
      const get = { method: 'GET', path: '/probe' } as const;
      const post = { method: 'POST', path: '/probe' } as const;
      const snapshot = async (): Promise<Snapshot> => control('snapshot');
      const transition = async (account: 'a' | 'b' | 'none') => {
        const logout = account === 'none';
        const result = await track(api.authTransition({ method: 'POST', path: logout ? '/auth/logout' : '/auth/login',
          ...(logout ? {} : { body: JSON.stringify({ account }), headers: { 'Content-Type': 'application/json' } }) }, async (response) => {
          const parsed = await track(parseApiResponse(response, logout ? { kind: 'empty', statuses: [204] } : { kind: 'json', statuses: [200] }));
          return parsed.kind === 'empty' || (parsed.kind === 'json' && (parsed.data as { account: string }).account === account) ? 'changed' : 'unknown';
        }));
        if (result.outcome !== 'changed' || !result.refresh?.ok || !api.commitIfCurrent(result.context, () => { state.account = account; })) {
          throw new Error('probe_incomplete');
        }
      };
      const consume = async (request: ApiRequest, hooks: { headers?: () => void; afterParse?: () => Promise<void>; failureBody?: () => void; expired?: (next: AuthContext) => undefined } = {}) => {
        const raw = await track(api.request(request));
        if (raw.kind !== 'response') return { applied: false, kind: raw.kind, parsedKind: undefined };
        const { context } = raw; hooks.headers?.();
        const parsed = await track(parseApiResponse(raw.response, { kind: 'json', statuses: [200] }));
        const decision = classifyRecovery(parsed, 'general');
        await hooks.afterParse?.();
        const expire = () => api.expireIfCurrent(context, (next) => {
          state.account = 'none'; state.expirations += 1; state.effects += 1; hooks.expired?.(next);
        });
        if (decision.kind === 'authentication_required') return { applied: expire(), kind: decision.kind, parsedKind: parsed.kind };
        let recovery: string | undefined; let recoveryReason: string | undefined;
        let failureDecision: { kind: string; parsedKind: string } | undefined;
        if (decision.kind === 'csrf_invalid') {
          const result = await track(api.recoverCsrf(context)); recovery = result.kind;
          if (result.kind === 'skipped') recoveryReason = result.reason;
          if (result.kind === 'failed') {
            const reading = track(readCsrfFailure(result.failure)); hooks.failureBody?.();
            const failure = await reading;
            if (failure) failureDecision = { kind: classifyRecovery(failure, 'general').kind, parsedKind: failure.kind };
            if (failureDecision?.kind === 'authentication_required') return { applied: expire(), kind: decision.kind, parsedKind: parsed.kind, recovery, failureDecision };
          }
        }
        const applied = api.commitIfCurrent(context, () => {
          state.effects += 1;
          if (parsed.kind === 'json') state.account = (parsed.data as { account: 'a' | 'b' | 'none' }).account;
        });
        return { applied, kind: decision.kind, parsedKind: parsed.kind, recovery, recoveryReason, failureDecision };
      };
      if (name === 'csrf-invalidated') {
        const preparing = track(api.prepareCsrf());
        await control('wait?phase=recovery');
        const result = await consume(get);
        await control('release?phase=recovery');
        const stale = await preparing;
        const before = await snapshot();
        report.checks.prepared = !stale.ok && stale.reason === 'auth_transition' && (await track(api.prepareCsrf())).ok;
        report.checks.result = result.applied && state.account === 'none' && state.expirations === 1 && before.csrf === 1;
      } else {
        report.checks.prepared = (await track(api.prepareCsrf())).ok;
        if (!report.checks.prepared) throw new Error('probe_incomplete');
        if (name.startsWith('late-') || name === 'late401' || name === 'late403') {
          const headers = deferred(); let done = false;
          const request = name === 'late401' || name === 'late403' ? post : get;
          const pending = track(consume(request, { headers: headers.resolve })).then((result) => { done = true; return result; });
          await control('wait?phase=body'); await bounded(headers.promise);
          const heldBefore = !done;
          await transition('none');
          const next = name === 'late-json-same' ? 'a' : ['late-json-other', 'late401'].includes(name) ? 'b' : 'none';
          if (next !== 'none') await transition(next);
          const before = await snapshot();
          await control('release?phase=body');
          const result = await bounded(pending);
          const expected = name === 'late401' ? 'authentication_required' : name === 'late403' ? 'csrf_invalid' : 'none';
          report.checks.result = matchesResponseDecision(result, expected)
            && (name !== 'late403' || (result.recovery === 'skipped' && result.recoveryReason === 'stale_context'))
            && heldBefore && !result.applied && state.account === next && state.effects === 0 && state.expirations === 0
            && (await track(api.prepareCsrf())).ok && (await snapshot()).csrf === before.csrf;
        } else if (name === 'afterparse') {
          const ready = deferred(); const release = deferred();
          const pending = track(consume(get, { afterParse: () => { ready.resolve(); return release.promise; } }));
          await bounded(ready.promise); await transition('b'); release.resolve();
          const result = await bounded(pending);
          report.checks.result = matchesResponseDecision(result, 'none') && !result.applied && state.account === 'b' && state.effects === 0;
        } else if (name === 'expiry-cleanup') {
          const release = deferred(); let cleanup!: Promise<boolean>;
          const result = await consume(get, { expired: (next) => {
            cleanup = track(release.promise.then(() => api.commitIfCurrent(next, () => { state.account = 'none'; state.effects += 1; })));
          } });
          await transition('b'); release.resolve();
          report.checks.result = result.applied && !(await bounded(cleanup)) && state.account === 'b' && state.effects === 1 && state.expirations === 1;
        } else if (name === 'concurrent401' || name === 'csrf-concurrent') {
          const values = await bounded(Promise.all([consume(post), consume(post)]));
          report.checks.result = name === 'concurrent401'
            ? values.filter((value) => value.applied).length === 1 && state.account === 'none' && state.expirations === 1 && state.effects === 1
            : values.every((value) => value.applied) && values.map((value) => value.recovery).sort().join(',') === 'already_recovered,refreshed'
              && state.account === 'a' && state.expirations === 0 && state.effects === 2;
        } else if (name === 'csrf-recovery-held') {
          const pending = track(consume(post)); await control('wait?phase=recovery');
          const next = track(api.request(post)); const before = await snapshot();
          await control('release?phase=recovery');
          const [first, second] = await bounded(Promise.all([pending, next]));
          report.checks.result = before.post === 1 && before.csrf === 2 && first.recovery === 'refreshed' && first.applied
            && second.kind === 'response' && state.account === 'a' && state.expirations === 0;
          if (second.kind === 'response') await track(second.response.text());
        } else if (name === 'csrf-failure-late') {
          const reading = deferred();
          const pending = track(consume(post, { failureBody: reading.resolve }));
          await control('wait?phase=recovery'); await bounded(reading.promise);
          await transition('none'); await transition('b');
          await control('release?phase=recovery'); const result = await bounded(pending);
          report.checks.result = matchesResponseDecision(result, 'csrf_invalid') && matchesResponseDecision(result.failureDecision, 'authentication_required')
            && result.recovery === 'failed' && !result.applied && state.account === 'b' && state.expirations === 0 && state.effects === 0;
        } else {
          const result = await consume(name === 'current' ? get : post);
          report.checks.result = result.applied && state.account === 'a' && state.expirations === 0 && state.effects === 1
            && result.kind === (name === 'current' ? 'none' : name === 'guardian403' ? 'guardian_unlock_required' : 'auth_state_unavailable');
        }
      }
      const actual = await snapshot();
      const counts: Record<string, number[]> = {
        current: [1, 0, 0, 0, 1], 'late-json-logout': [2, 0, 1, 0, 1], 'late-json-same': [3, 1, 1, 0, 1],
        'late-json-other': [3, 1, 1, 0, 1], late401: [3, 1, 1, 1, 0], late403: [2, 0, 1, 1, 0], afterparse: [2, 1, 0, 0, 1],
        'expiry-cleanup': [3, 1, 0, 0, 1], concurrent401: [1, 0, 0, 2, 0], 'csrf-concurrent': [2, 0, 0, 2, 0],
        'csrf-recovery-held': [2, 0, 0, 2, 0], 'csrf-invalidated': [2, 0, 0, 0, 1], 'csrf-failure-late': [5, 1, 1, 1, 0],
        guardian403: [1, 0, 0, 1, 0], unavailable503: [1, 0, 0, 1, 0],
      };
      report.checks.counts = [actual.csrf, actual.login, actual.logout, actual.post, actual.get].every((value, index) => value === counts[name][index]);
      report.checks.pairs = actual.pairs && actual.bodyEmpty;
    })(), deadline]);
  } catch { report.issue ??= 'incomplete'; }
  finally {
    expired = true; clearTimeout(timer!); controllers.forEach((abort) => abort.abort());
    try {
      await control('release?phase=all', true);
      await bounded(Promise.allSettled([...tasks])); await control('wait?phase=settled', true);
      const state: Snapshot = await control('snapshot', true);
      if (active || state.held || state.activeResponses || state.waiters) throw new Error('probe_incomplete');
      await control('finish', true);
      report.checks.cleanupAbsent = (await control('api/v1/observe', true)).data.cookiePresent === false;
      report.cleanup = report.checks.cleanupAbsent;
    } catch { report.issue ??= 'incomplete'; }
  }
  report.pass = !report.issue && report.cleanup && checksPassed(report.checks, checkNames);
  try { await control('report', true, report); } catch { report.pass = false; }
  return { name, pass: report.pass, clean: report.cleanup };
}
async function execute() {
  if (!__DEV__ || !['android', 'ios'].includes(Platform.OS)) throw new Error('development_probe_only');
  const results = [];
  for (const name of cases) { const result = await runCase(name); results.push(result); if (!result.clean) break; }
  return { results, summary: summarizeCases(allCases, results) };
}
let running: ReturnType<typeof execute> | undefined;
function RecoveryProbe() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof execute>>>();
  useEffect(() => { running ??= execute(); running.then(setResult, () => setResult({ results: [], summary: summarizeCases(allCases, []) })); }, []);
  return <View style={{ padding: 36 }}><Text accessibilityRole="header">SCRUM-167 · 6단계 네이티브 복구 검증</Text>
    <Text selectable>{result ? `전체: ${result.summary.pass ? 'PASS' : 'FAIL'}\n${result.results.map((value) => `${value.name}: ${value.pass ? 'PASS' : 'FAIL'}`).join('\n')}` : '검증 중'}</Text></View>;
}
registerRootComponent(RecoveryProbe);

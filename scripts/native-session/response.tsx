import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { createApiClient, type ApiFetch } from '../../src/api/client';
import { prepareRequestBody } from '../../src/api/requestBody';
import { parseApiResponse, type ParsedApiResponse, type ResponseExpectation } from '../../src/api/response';

const allCases = ['json', 'empty', 'end', 'multipart', 'binary', 'binary-empty', 'binary-error',
  'json-invalid', 'json-mime', 'fields-missing', 'fields-invalid', 'delay-json', 'cancel-json', 'disconnect-json',
  'delay-binary', 'cancel-binary', 'disconnect-binary', 'late-json', 'late-binary', 'late-clone-json', 'late-clone-binary', 'redirect', 'post-loss', 'post503', 'auth-json'];
const selected = process.env.EXPO_PUBLIC_NATIVE_PROBE_CASE;
const cases = selected && allCases.includes(selected) ? [selected] : allCases;
type State = { csrf: number; get: number; post: number; sourceBytes: number; bodyMatches: boolean; pairs: boolean;
  cookiePresent: boolean; headersSent: boolean; activeResponses: number; held: number; closed: number; finished: number; sink: number; positive: number };
type Report = { platform: string; stage: '166-5'; pass: boolean; cleanup: boolean; fetchCalls: number; checks: Record<string, boolean>;
  outcome?: { kind: string; reason?: string; status?: number }; issue?: 'incomplete' | 'deadline' };
const requestId = '22222222-2222-4222-8222-222222222222';
function bounded<T>(promise: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('probe_incomplete')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function payload(result: ParsedApiResponse, binary: boolean) {
  if (binary) return result.kind === 'bytes' && new Uint8Array(result.bytes).join(',') === '0,127,128,255,10,13';
  return result.kind === 'json' && JSON.stringify(result.data) === '{"synthetic":true,"value":null}';
}

async function runCase(name: string) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  const root = `http://${host}:48591/runs/${Platform.OS}-response-${name}-${Date.now().toString(36)}`;
  const report: Report = { platform: Platform.OS, stage: '166-5', pass: false, cleanup: false, fetchCalls: 0, checks: {} };
  const tasks = new Set<Promise<unknown>>(); const controllers: AbortController[] = [];
  let expired = false; let active = 0;
  const track = <T,>(promise: Promise<T>) => {
    tasks.add(promise); promise.then(() => tasks.delete(promise), () => tasks.delete(promise)); return promise;
  };
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
  const snapshot = async (cleanup = false): Promise<State> => control('snapshot', undefined, cleanup);
  const send: ApiFetch = async (url, init) => {
    if (expired) throw new Error('probe_incomplete');
    report.fetchCalls += 1; active += 1;
    try { return await fetch(url, init); } finally { active -= 1; }
  };
  const configured = createApiClient({ appEnv: 'development', apiMode: 'real', apiBaseUrl: `${root}/api/v1` }, { fetchImpl: send });
  report.checks.inert = report.fetchCalls === 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
    expired = true; report.issue = 'deadline'; controllers.forEach((abort) => abort.abort()); reject(new Error('probe_incomplete'));
  }, 20000); });
  try {
    await Promise.race([(async () => {
      await control(`start?mode=${name}`);
      if (!configured.ok) throw new Error('probe_incomplete');
      const api = configured.value;
      report.checks.prepared = (await track(api.prepareCsrf())).ok;
      if (!report.checks.prepared) throw new Error('probe_incomplete');
      const binary = name.includes('binary');
      const expectation: ResponseExpectation = name === 'empty' ? { kind: 'empty', statuses: [204] }
        : binary ? { kind: 'binary', statuses: [200] } : { kind: 'json', statuses: [200, 201, 202] };
      const post = ['json', 'empty', 'end', 'multipart', 'post-loss', 'post503', 'auth-json'].includes(name);
      const form = new FormData(); form.append('probe', 'synthetic');
      const body = prepareRequestBody(name === 'multipart' ? { kind: 'formData', value: form }
        : ['json', 'auth-json'].includes(name) ? { kind: 'json', value: { probe: 'synthetic' } } : { kind: 'none' });
      if (!body.ok) throw new Error('probe_incomplete');
      const abort = new AbortController(); controllers.push(abort);
      const request = { method: post ? 'POST' as const : 'GET' as const, path: '/probe', signal: abort.signal, ...body.value };
      let parsed: ParsedApiResponse | undefined;
      if (name === 'auth-json') {
        const result = await track(api.authTransition(request, async (response) => {
          const value = await track(parseApiResponse(response, expectation));
          return value.meta.status === 200 && payload(value, false) ? 'changed' : 'unknown';
        }));
        report.checks.refresh = result.outcome === 'changed' && result.refresh?.ok === true;
        report.checks.originalReadable = result.operation.kind === 'response' && !result.operation.response.bodyUsed;
        if (result.operation.kind !== 'response') throw new Error('probe_incomplete');
        parsed = await track(parseApiResponse(result.operation.response, expectation));
        report.checks.result = payload(parsed, false);
      } else {
        if (name === 'redirect') {
          const positive = await fetch(`${root}/api/v1/sink`, { headers: { 'X-Probe-Control': 'reachability' },
            credentials: 'include', cache: 'no-store', redirect: 'error', signal: abort.signal });
          report.checks.positive = positive.status === 200; await positive.text();
        }
        const pending = track(api.request(request));
        const held = /^(delay|cancel|disconnect|late)-/.test(name);
        if (held) await control('wait?phase=headers');
        // 실제 런타임이 헤더와 본문을 분리해서 전달하는지 확인한다. 시간 초과를 성공으로 취급하지 않는다.
        const raw = await bounded(pending);
        if (['redirect', 'post-loss'].includes(name)) {
          report.outcome = { kind: raw.kind };
          report.checks.result = raw.kind === 'transport_error';
        } else {
          if (raw.kind !== 'response') throw new Error('probe_incomplete');
          if (name.startsWith('late-')) {
            const state = await snapshot();
            report.checks.headersBeforeBody = state.headersSent && state.held === 1;
            await control('disconnect'); await control('wait?phase=settled');
          }
          let done = false;
          const reading = track(parseApiResponse(name.startsWith('late-clone-') ? raw.response.clone() : raw.response, expectation)).then((value) => { done = true; return value; });
          if (held && !name.startsWith('late-')) {
            const state = await snapshot();
            report.checks.headersBeforeBody = state.headersSent && state.held === 1;
            report.checks.pendingBeforeRelease = !done;
            if (name.startsWith('delay-')) await control('release');
            else if (name.startsWith('cancel-')) abort.abort();
            else await control('disconnect');
          }
          parsed = await bounded(reading);
          if (/^(cancel|disconnect|late)-/.test(name)) report.checks.result = parsed.kind === 'body_read_error' && parsed.reason === 'read_failed';
          else if (name === 'empty') report.checks.result = parsed.kind === 'empty' && parsed.meta.status === 204;
          else if (name === 'end') report.checks.result = parsed.kind === 'json' && parsed.meta.status === 202
            && JSON.stringify(parsed.data) === '{"conversationId":"33333333-3333-4333-8333-333333333333","status":"CLOSING"}' && parsed.meta.headers.retryAfter === '1';
          else if (name === 'binary-error') report.checks.result = parsed.kind === 'http_error' && parsed.error.code === 'AUDIO_EXPIRED' && parsed.meta.status === 410;
          else if (name === 'fields-missing') report.checks.result = parsed.kind === 'http_error' && parsed.error.code === 'VALIDATION_FAILED' && parsed.error.fields.length === 0 && parsed.meta.status === 400;
          else if (name === 'post503') report.checks.result = parsed.kind === 'http_error' && parsed.error.code === 'AUTH_STATE_UNAVAILABLE' && parsed.meta.status === 503 && parsed.meta.headers.retryAfter === '0';
          else if (['binary-empty', 'json-invalid', 'json-mime', 'fields-invalid'].includes(name)) {
            const reason = { 'binary-empty': 'empty_body', 'json-invalid': 'invalid_json', 'json-mime': 'invalid_content_type', 'fields-invalid': 'invalid_envelope' }[name];
            report.checks.result = parsed.kind === 'format_error' && parsed.reason === reason;
          } else report.checks.result = payload(parsed, binary) && parsed.meta.status === (['json', 'multipart'].includes(name) ? 201 : 200);
        }
      }
      if (parsed) {
        report.outcome = { kind: parsed.kind, status: parsed.meta.status, ...('reason' in parsed ? { reason: parsed.reason } : {}) };
        report.checks.metadata = parsed.meta.headers.requestId === requestId;
      }
      const state = await snapshot();
      report.checks.body = state.bodyMatches && state.pairs && state.cookiePresent;
      report.checks.notReplayed = state.post === (post ? 1 : 0) && state.get === (post ? 0 : 1)
        && state.csrf === (name === 'auth-json' ? 2 : 1) && report.fetchCalls === (name === 'auth-json' ? 3 : 2);
      if (name === 'redirect') report.checks.sinkBlocked = state.sink === 0 && state.positive === 1;
      report.pass = Object.values(report.checks).every(Boolean);
    })(), deadline]);
  } catch { report.issue ??= 'incomplete'; report.pass = false; }
  finally {
    clearTimeout(timer!); expired = true; controllers.forEach((abort) => abort.abort());
    try {
      await control('release', undefined, true);
      await bounded(Promise.allSettled([...tasks]));
      await control('wait?phase=settled', undefined, true);
      const state = await snapshot(true);
      if (active !== 0 || state.held !== 0 || state.activeResponses !== 0) throw new Error('probe_incomplete');
      await control('finish', undefined, true);
      report.checks.cleanupAbsent = !(await control('api/v1/observe', undefined, true)).data.cookiePresent;
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
function ResponseProbe() {
  const [results, setResults] = useState<{ name: string; pass: boolean }[]>();
  useEffect(() => { running ??= execute(); running.then(setResults, () => setResults([])); }, []);
  return <View style={{ padding: 36 }}><Text accessibilityRole="header">SCRUM-166 · 응답 파서 네이티브 검증</Text>
    <Text selectable>{results ? results.map((value) => `${value.name}: ${value.pass ? 'PASS' : 'FAIL'}`).join('\n') : '검증 중'}</Text></View>;
}
registerRootComponent(ResponseProbe);

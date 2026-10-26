import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { createApiClient, type ApiFetch, type ApiResult } from '../../src/api/client';

// 알려진 한 사례만 재현할 수 있는 진단 전용 선택자다. 제품 환경 설정에는 추가하지 않는다.
const bodyCases = ['post-loss-empty', 'post-loss-json', 'post-loss-binary', 'post-loss-multipart', 'post503-zero'];
const allCases = ['reuse', 'concurrent', 'http401', 'http403', 'http429', 'http503', 'invalid-json', 'network', 'expire', 'csrf302',
  ...[301, 302, 303, 307, 308].flatMap((status) => [`post${status}-same`, `post${status}-cross`]), 'post-loss', ...bodyCases];
const selectedCase = process.env.EXPO_PUBLIC_NATIVE_PROBE_CASE;
const cases = selectedCase && allCases.includes(selectedCase) ? [selectedCase] : allCases;
type Counts = { csrf: number; get: number; post: number };
type Snapshot = Counts & { sourceBytes: number; sourceBodyMatches?: boolean; cookieMatches: boolean; cookieNamePresent: boolean; postPairsMatch: boolean; sameSink: number; crossSink: number; positiveSame: number; positiveCross: number };
type Outcome = { kind: ApiResult['kind']; status?: number; reason?: string; csrfReason?: string; csrfStatus?: number };
type Report = {
  platform: string; stage: '3b'; pass: boolean; fetchCalls: number; cleanup: boolean;
  outcome?: Outcome; secondOutcome?: Outcome; preparation?: unknown; beforeRelease?: Counts; pendingBoth?: boolean;
  cookiePresentBefore?: boolean; cookiePresentAfter?: boolean; cookieMatchesAfterRejectedResponse?: boolean;
  positiveSame?: boolean; positiveCross?: boolean; issue?: 'probe_incomplete';
};
const outcome = (value: ApiResult): Outcome => value.kind === 'response'
  ? { kind: value.kind, status: value.response.status }
  : value.kind === 'not_sent' ? { kind: value.kind, reason: value.reason, ...(value.reason === 'csrf_unavailable' && value.csrf ? { csrfReason: value.csrf.reason, ...(value.csrf.reason === 'http' ? { csrfStatus: value.csrf.status } : {}) } : {}) } : { kind: value.kind };
const success = (value: ApiResult) => value.kind === 'response' && value.response.status === 200;

async function runCase(name: string): Promise<boolean> {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  const id = `${Platform.OS}-${name}-${Date.now().toString(36)}`;
  const root = `http://${host}:48591/runs/${id}`;
  const report: Report = { platform: Platform.OS, stage: '3b', pass: false, fetchCalls: 0, cleanup: false };
  let expired = false; let active = 0;
  // 로컬 제어 요청만 취소 상한을 적용한다. 제품 전송 인자는 바꾸지 않는다.
  const control = async (path: string, body?: Report) => {
    const abort = new AbortController(); const stop = setTimeout(() => abort.abort(), 3000);
    try {
      const response = await fetch(`${root}/${path}`, body
        ? { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : { cache: 'no-store', signal: abort.signal });
      if (response.status !== 200) throw new Error('probe_incomplete');
      return await response.json();
    } finally { clearTimeout(stop); }
  };
  const send: ApiFetch = async (url, init) => {
    if (expired) throw new Error('probe_incomplete');
    report.fetchCalls += 1; active += 1;
    try { return await fetch(url, init); } finally { active -= 1; }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('probe_incomplete')); }, 15000); });
  try {
    const passed = await Promise.race([(async () => {
      await control(`start?mode=${name}`);
      const configured = createApiClient({ appEnv: 'development', apiMode: 'real', apiBaseUrl: `${root}/api/v1` }, { fetchImpl: send });
      if (!configured.ok || expired) throw new Error('probe_incomplete');
      const client = configured.value;
      if (name === 'reuse') {
        const first = await client.request({ method: 'POST', path: '/probe' });
        const second = await client.request({ method: 'POST', path: '/probe' });
        report.outcome = outcome(first); report.secondOutcome = outcome(second);
        const state: Snapshot = await control('snapshot');
        return success(first) && success(second) && state.csrf === 1 && state.post === 2 && state.postPairsMatch;
      } else if (name === 'concurrent') {
        let firstDone = false; let secondDone = false;
        const first = client.request({ method: 'POST', path: '/probe' }).finally(() => { firstDone = true; });
        const second = client.request({ method: 'POST', path: '/probe' }).finally(() => { secondDone = true; });
        await control('wait-csrf');
        const before: Snapshot = await control('snapshot');
        report.beforeRelease = { csrf: before.csrf, get: before.get, post: before.post };
        report.pendingBoth = !firstDone && !secondDone;
        await control('release');
        const [a, b] = await Promise.all([first, second]);
        report.outcome = outcome(a); report.secondOutcome = outcome(b);
        const state: Snapshot = await control('snapshot');
        return report.pendingBoth && before.csrf === 1 && before.post === 0 && success(a) && success(b) && state.csrf === 1 && state.post === 2 && state.postPairsMatch;
      } else if (name === 'post-loss') {
        const result = await client.request({ method: 'POST', path: '/probe', body: 'synthetic-body' });
        report.outcome = outcome(result);
        const state: Snapshot = await control('snapshot');
        return result.kind === 'transport_error' && report.fetchCalls === 2 && state.csrf === 1
          && state.post === 1 && state.postPairsMatch && state.sourceBytes === 14;
      } else if (bodyCases.includes(name)) {
        let body: BodyInit | undefined = 'synthetic-body';
        let headers: HeadersInit | undefined;
        let expectedBytes: number | undefined = 14;
        if (name === 'post-loss-empty') { body = undefined; expectedBytes = 0; }
        else if (name === 'post-loss-json') {
          body = JSON.stringify({ probe: 'synthetic' }); headers = { 'Content-Type': 'application/json' }; expectedBytes = 21;
        } else if (name === 'post-loss-binary') {
          body = new Uint8Array([0, 127, 128, 255]).buffer; headers = { 'Content-Type': 'application/octet-stream' }; expectedBytes = 4;
        } else if (name === 'post-loss-multipart') {
          body = new FormData(); body.append('probe', 'synthetic');
          // boundary 길이는 가정하지 않고 수신자의 필드·boundary 일치 검사로 보존을 확인한다.
          expectedBytes = undefined;
        }
        const result = await client.request({ method: 'POST', path: '/probe', body, headers });
        report.outcome = outcome(result);
        const expectedOutcome = name === 'post503-zero'
          ? result.kind === 'response' && result.response.status === 503 && result.response.headers.get('Retry-After') === '0'
            && (await result.response.json()).error?.code === 'SYNTHETIC_FAILURE'
          : result.kind === 'transport_error';
        const state: Snapshot = await control('snapshot');
        return expectedOutcome && report.fetchCalls === 2 && state.csrf === 1 && state.get === 0 && state.post === 1
          && state.postPairsMatch && (expectedBytes === undefined ? state.sourceBytes > 0 : state.sourceBytes === expectedBytes) && state.sourceBodyMatches === true;
      } else if (name === 'expire') {
        const prepared = await client.prepareCsrf(); report.preparation = prepared;
        if (!prepared.ok) throw new Error('probe_incomplete');
        const before = await client.request({ method: 'GET', path: '/probe' });
        if (!success(before)) throw new Error('probe_incomplete');
        report.cookiePresentBefore = (await control('snapshot')).cookieNamePresent;
        await control('finish');
        const after = await client.request({ method: 'GET', path: '/probe' });
        if (!success(after)) throw new Error('probe_incomplete');
        const state: Snapshot = await control('snapshot'); report.cookiePresentAfter = state.cookieNamePresent;
        return report.cookiePresentBefore === true && report.cookiePresentAfter === false && state.csrf === 1 && state.get === 2 && state.post === 0;
      } else if (name === 'csrf302' || name.startsWith('post')) {
        // 정확한 목적지에 직접 도달한 대조 요청은 실제 redirect 수신 횟수와 분리한다.
        const samePath = name === 'csrf302' ? 'api/v1/sink' : 'sink';
        report.positiveSame = (await fetch(`${root}/${samePath}`, { headers: { 'X-Probe-Control': 'reachability' } })).status === 200;
        report.positiveCross = (await fetch(`http://${host}:48592/runs/${id}/api/v1/sink`, { headers: { 'X-Probe-Control': 'reachability' } })).status === 200;
        const result = await client.request({ method: 'POST', path: '/probe', ...(name.startsWith('post') ? { body: 'synthetic-body' } : {}) });
        report.outcome = outcome(result);
        if (name === 'csrf302') {
          const observed = await client.request({ method: 'GET', path: '/probe' });
          if (!success(observed)) throw new Error('probe_incomplete');
          report.cookieMatchesAfterRejectedResponse = (await control('snapshot')).cookieMatches;
        }
        const state: Snapshot = await control('snapshot');
        const rejected = name === 'csrf302' ? result.kind === 'not_sent' && result.reason === 'csrf_unavailable' && result.csrf?.reason === 'network' : result.kind === 'transport_error';
        return report.positiveSame && report.positiveCross && rejected && state.csrf === 1
          && state.post === (name === 'csrf302' ? 0 : 1) && state.sameSink === 0 && state.crossSink === 0
          && (name === 'csrf302' ? state.get === 1 : state.postPairsMatch && state.sourceBytes === 14);
      } else {
        const result = await client.request({ method: 'POST', path: '/probe' }); report.outcome = outcome(result);
        const state: Snapshot = await control('snapshot');
        const expectedFailure = result.kind === 'not_sent' && result.reason === 'csrf_unavailable' && (name.startsWith('http')
          ? result.csrf?.reason === 'http' && result.csrf.status === Number(name.slice(4))
          : result.csrf?.reason === (name === 'network' ? 'network' : 'invalid_response'));
        return expectedFailure && state.post === 0 && (name === 'network' ? state.csrf >= 1 : state.csrf === 1) && report.fetchCalls === 1;
      }
    })(), deadline]);
    report.pass = passed === true;
  } catch { report.issue = 'probe_incomplete'; report.pass = false; }
  finally {
    if (timer) clearTimeout(timer);
    if (active === 0) { try { await control('finish'); report.cleanup = true; } catch { report.issue = 'probe_incomplete'; } }
  }
  try { await control('report', report); } catch { report.issue = 'probe_incomplete'; }
  return report.pass && !report.issue && report.cleanup;
}

async function execute() {
  if (!__DEV__ || !['android', 'ios'].includes(Platform.OS)) throw new Error('development_probe_only');
  const results: { name: string; pass: boolean }[] = [];
  for (const name of cases) {
    const pass = await runCase(name); results.push({ name, pass });
    // 실패 뒤 후속 전송을 자동으로 이어가지 않는다. 다른 OS는 독립 실행한다.
    if (!pass) break;
  }
  return results;
}
let running: ReturnType<typeof execute> | undefined;
function ProbeCases() {
  const [results, setResults] = useState<{ name: string; pass: boolean }[]>();
  useEffect(() => { running ??= execute(); running.then(setResults, () => setResults([])); }, []);
  return <View style={{ padding: 36 }}><Text accessibilityRole="header">SCRUM-165 · 3-B 네이티브 검증</Text><Text selectable>{results ? results.map((item) => `${item.name}: ${item.pass ? 'PASS' : 'FAIL / STOP'}`).join('\n') : '검증 중'}</Text></View>;
}
registerRootComponent(ProbeCases);

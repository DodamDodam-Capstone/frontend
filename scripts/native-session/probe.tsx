import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { createApiClient, type ApiFetch } from '../../src/api/client';

type Observation = { status: number; urlEqualsRequested: boolean; sameOriginAndPath: boolean; hasCacheQuery: boolean; redirectedPropertyPresent: boolean };
type Summary = {
  platform: string; reachable: boolean; inert: boolean; observations: Observation[];
  preparation: unknown; cookieRoundTrip: boolean | 'not_verified'; firstPost: unknown;
  explicitCounts?: { csrf: number; get: number; post: number };
  cleanup: boolean; issue?: 'probe_transport_failure' | 'observation_deadline';
};

// 별도 Metro bundle로만 실행하는 시험. 일반 앱 진입점에서는 import하지 않는다.
async function execute(): Promise<Summary> {
  if (!__DEV__ || (Platform.OS !== 'android' && Platform.OS !== 'ios')) throw new Error('development_probe_only');
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  const runId = `${Platform.OS}-${Date.now().toString(36)}`;
  const root = `http://${host}:48591/runs/${runId}`;
  const summary: Summary = { platform: Platform.OS, reachable: false, inert: false, observations: [], preparation: 'not_run', cookieRoundTrip: 'not_verified', firstPost: 'blocked', cleanup: false };
  let expired = false;
  let activeRequests = 0;
  // 제어·정리·보고 요청의 상한도 시험용이며 제품 전송 설정에는 적용하지 않는다.
  const control = async (path: string, report?: Summary) => {
    const abort = new AbortController();
    const stop = setTimeout(() => abort.abort(), 3000);
    try {
      const response = await fetch(`${root}/${path}`, report
        ? { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }
        : { cache: 'no-store', signal: abort.signal });
      if (response.status !== 200) throw new Error('probe_transport_failure');
      return await response.json();
    } finally { clearTimeout(stop); }
  };
  // 기본 fetch에 인자를 그대로 전달하고 민감값 없는 응답 메타데이터만 관측한다.
  const observeFetch: ApiFetch = async (url, init) => {
    if (expired) throw new Error('observation_deadline');
    activeRequests += 1;
    let response: Response;
    try { response = await fetch(url, init); } finally { activeRequests -= 1; }
    const requested = new URL(url);
    let actual: URL | undefined;
    try { if (response.url) actual = new URL(response.url); } catch { /* 관측 실패가 실제 응답을 바꾸지 않는다. */ }
    summary.observations.push({ status: response.status, urlEqualsRequested: response.url === url,
      sameOriginAndPath: actual?.origin === requested.origin && actual?.pathname === requested.pathname,
      hasCacheQuery: actual?.searchParams.has('_') ?? false, redirectedPropertyPresent: typeof response.redirected === 'boolean' });
    return response;
  };
  const create = () => createApiClient({ appEnv: 'development', apiMode: 'real', apiBaseUrl: `${root}/api/v1` }, { fetchImpl: observeFetch });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 시험의 관찰 상한이며 제품의 timeout 계약이 아니다. 미결을 성공으로 처리하지 않는다.
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('observation_deadline')); }, 20000); });
  try {
    await Promise.race([(async () => {
      await control('start');
      await control('health');
      if (expired) return;
      summary.reachable = true;
      const client = create();
      if (!client.ok) throw new Error('probe_transport_failure');
      const before = await control('snapshot');
      if (expired) return;
      summary.inert = before.csrf === 0 && before.get === 0 && before.post === 0;
      const prepared = await client.value.prepareCsrf();
      if (expired) return;
      summary.preparation = prepared;
      // 발급 실패 뒤에도 읽기 전용 GET으로 쿠키 재전송만 독립 관측하며 POST는 보내지 않는다.
      const account = await client.value.request({ method: 'GET', path: '/probe' });
      if (account.kind === 'response' && account.response.status === 200) {
        const body = await account.response.json();
        summary.cookieRoundTrip = body.data?.cookieMatches === true;
      }
      const counts = await control('snapshot');
      summary.explicitCounts = { csrf: counts.csrf, get: counts.get, post: counts.post };
      if (prepared.ok && !expired) {
        // 독립된 새 client에서 사전 prepare 없는 최초 POST를 검증한다.
        await control('start');
        if (expired) return;
        const fresh = create();
        if (!fresh.ok) throw new Error('probe_transport_failure');
        const post = await fresh.value.request({ method: 'POST', path: '/probe' });
        summary.firstPost = post.kind === 'response' ? { kind: post.kind, status: post.response.status } : post;
      }
    })(), deadline]);
  } catch (error) {
    summary.issue = error instanceof Error && error.message === 'observation_deadline' ? 'observation_deadline' : 'probe_transport_failure';
  } finally {
    if (timer) clearTimeout(timer);
    // 전송 중인 요청이 남았으면 쿠키 정리가 끝났다고 주장하지 않는다.
    if (activeRequests === 0) {
      try { await control('finish'); summary.cleanup = true; } catch { /* 원문 예외를 노출하지 않는다. */ }
    }
  }
  try { await control('report', summary); } catch { summary.issue ??= 'probe_transport_failure'; }
  return summary;
}

let running: Promise<Summary> | undefined;
function Probe() {
  const [result, setResult] = useState<Summary>();
  useEffect(() => {
    running ??= execute();
    running.then(setResult, () => setResult({ platform: Platform.OS, reachable: false, inert: false, observations: [], preparation: 'not_run', cookieRoundTrip: 'not_verified', firstPost: 'blocked', cleanup: false, issue: 'probe_transport_failure' }));
  }, []);
  return <View style={{ padding: 36 }}><Text accessibilityRole="header">SCRUM-165 · 3-A 네이티브 진단</Text><Text selectable>{result ? JSON.stringify({ ...result, observations: result.observations[0] }, null, 2) : '검증 중'}</Text></View>;
}
registerRootComponent(Probe);

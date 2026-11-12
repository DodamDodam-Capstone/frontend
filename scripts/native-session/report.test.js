const { test, expect } = require('@jest/globals');
const { safeReport, checksPassed, summarizeCases, authCases, responseCases, transportCases, requiredAuthChecks, requiredResponseChecks } = require('./report');

const secret = 'synthetic-private-report';
const allTrue = (names) => Object.fromEntries(names.map((name) => [name, true]));

test('전송 직전 원시 CSRF 실패·응답·예외·임의 키를 enum/count/boolean으로 제한한다', () => {
  const failure = { ok: false, reason: 'http', status: 503, requestId: secret, meta: { headers: { location: secret, retryAfter: secret } }, response: { body: secret } };
  const report = { platform: 'android', stage: '167-6', pass: true, cleanup: true, fetchCalls: 3, classified: 1,
    checks: { prepared: true, result: true, [secret]: true, ignored: secret }, refresh: failure, preparation: failure,
    outcome: { kind: 'http_error', status: 401, error: { message: secret, fields: [secret] } },
    operation: { kind: 'response', status: 200, response: { headers: { 'set-cookie': secret } } },
    before: { csrf: 1, cookie: secret, events: [secret] }, token: secret, error: new Error(secret) };
  const encoded = JSON.stringify(safeReport(report, ['prepared', 'result']));
  expect(encoded).not.toContain(secret);
  expect(JSON.parse(encoded)).toMatchObject({ platform: 'android', stage: '167-6', pass: true, cleanup: true, fetchCalls: 3,
    checks: { prepared: true, result: true }, refresh: { ok: false, reason: 'http', status: 503 }, operation: { kind: 'response', status: 200 } });
  expect(report.refresh.meta.headers.location).toBe(secret);
});

test('자유 형식 enum·유효하지 않은 횟수와 진단 상태를 그대로 내보내지 않는다', () => {
  const encoded = JSON.stringify(safeReport({ platform: secret, stage: secret, issue: secret, outcome: secret,
    refresh: { reason: secret, kind: secret, status: 999, ok: secret }, fetchCalls: Infinity, checks: { result: secret } }, ['result']));
  expect(encoded).not.toContain(secret);
  expect(JSON.parse(encoded)).toMatchObject({ checks: {}, fetchCalls: 0, refresh: {} });
});

test('기존 기본 probe 관측값에서도 CSRF 메타데이터와 임의 필드를 제거한다', () => {
  const value = safeReport({ platform: 'ios', reachable: true, inert: true, cleanup: true, cookieRoundTrip: true,
    preparation: { ok: false, reason: 'http', status: 429, meta: secret }, firstPost: { kind: 'not_sent', reason: 'csrf_unavailable', csrf: secret },
    observations: [{ status: 200, urlEqualsRequested: true, sameOriginAndPath: true, hasCacheQuery: false, redirectedPropertyPresent: true, url: secret }],
    explicitCounts: { csrf: 1, get: 1, post: 0, token: secret } }, []);
  expect(JSON.stringify(value)).not.toContain(secret);
  expect(value.observations).toEqual([{ status: 200, urlEqualsRequested: true, sameOriginAndPath: true, hasCacheQuery: false, redirectedPropertyPresent: true }]);
});

test('필수 check 누락·false·빈 목록은 통과하지 않는다', () => {
  expect(checksPassed({}, ['result'])).toBe(false);
  expect(checksPassed({ result: false }, ['result'])).toBe(false);
  expect(checksPassed({ result: true }, [])).toBe(false);
  expect(checksPassed({ result: true, cleanup: true }, ['result', 'cleanup'])).toBe(true);
});

test.each(['partial', 'duplicate', 'unknown', 'cleanup', 'failed'])('%s 실행은 전체 행렬 통과가 아니다', (mode) => {
  const expected = ['first', 'second'];
  const first = { name: 'first', pass: true, clean: true };
  const second = { name: 'second', pass: true, clean: true };
  const rows = mode === 'partial' ? [first] : mode === 'duplicate' ? [first, first, second] : mode === 'unknown' ? [first, second, { name: secret, pass: true }]
    : mode === 'cleanup' ? [first, { ...second, clean: false }] : [first, { ...second, pass: false }];
  const summary = summarizeCases(expected, rows);
  expect(summary.pass).toBe(false);
  expect(JSON.stringify(summary)).not.toContain(secret);
  if (mode === 'partial') expect(summary.missing).toEqual(['second']);
});

test('전체 기대 사례가 정확히 한 번 완료·정리된 경우에만 통과한다', () => {
  expect(summarizeCases(['first', 'second'], [{ name: 'first', pass: true, clean: true }, { name: 'second', pass: true, clean: true }]))
    .toEqual({ pass: true, expected: 2, completed: 2, missing: [], failed: [] });
  expect(summarizeCases([], []).pass).toBe(false);
});

test('기존 OS별 행렬과 모든 case별 필수 검사에 cleanup을 포함한다', () => {
  expect(authCases).toHaveLength(26); expect(responseCases).toHaveLength(25); expect(transportCases).toHaveLength(26);
  for (const [names, required] of [[authCases, requiredAuthChecks], [responseCases, requiredResponseChecks]]) {
    for (const name of names) {
      const checks = required(name);
      expect(checks).toContain('cleanupAbsent');
      expect(checksPassed(allTrue(checks), checks)).toBe(true);
      for (const omitted of checks) {
        const partial = allTrue(checks); delete partial[omitted];
        expect(checksPassed(partial, checks)).toBe(false);
      }
    }
  }
});

test.each([{ cleanup: false }, { cleanup: true, issue: 'deadline' }, { cleanup: true, issue: 'probe_incomplete' }, {}])('cleanup 실패나 미완료 보고서는 pass:true를 내보내지 않는다: %j', (state) => {
  expect(safeReport({ platform: 'ios', stage: '3b', pass: true, ...state }).pass).toBe(false);
});

test.each([
  [{ parsedKind: 'json', kind: 'none' }, 'none', true],
  [{ parsedKind: 'http_error', kind: 'authentication_required' }, 'authentication_required', true],
  [{ parsedKind: 'http_error', kind: 'csrf_invalid' }, 'csrf_invalid', true],
  [{ parsedKind: 'body_read_error', kind: 'unclassified', applied: false }, 'authentication_required', false],
  [{ parsedKind: 'format_error', kind: 'unclassified', applied: false }, 'csrf_invalid', false],
  [{ parsedKind: 'http_error', kind: 'unclassified', applied: false }, 'authentication_required', false],
  [{ parsedKind: 'body_read_error', kind: 'unclassified', applied: false }, 'none', false],
])('지연 응답 차단은 기대 본문 해석·분류까지 일치해야 한다: %j → %s', (value, expected, pass) => {
  expect(require('./report').matchesResponseDecision(value, expected)).toBe(pass);
});

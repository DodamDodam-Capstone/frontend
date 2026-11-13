// 개발 probe에서만 사용한다. API 오류 원문을 바꾸지 않고 직렬화 직전에 허용 필드만 추출한다.
const authCases = ['login', 'logout', 'login-failed', 'csrf-invalid', 'unknown503', 'classifier-error', 'auth-network',
  'refresh401', 'refresh403', 'refresh429', 'refresh503', 'refresh-invalid', 'refresh-network', 'refresh302',
  'auth-held', 'refresh-held', 'drain-csrf', 'cancel-csrf', 'cancel-drain', 'cancel-auth', 'cancel-body', 'stale-get', 'stale-post', 'pre-cancel', 'late-csrf', 'cancel-old'];
const responseCases = ['json', 'empty', 'end', 'multipart', 'binary', 'binary-empty', 'binary-error', 'json-invalid', 'json-mime',
  'fields-missing', 'fields-invalid', 'delay-json', 'cancel-json', 'disconnect-json', 'delay-binary', 'cancel-binary',
  'disconnect-binary', 'late-json', 'late-binary', 'late-clone-json', 'late-clone-binary', 'redirect', 'post-loss', 'post503', 'auth-json'];
const transportCases = ['reuse', 'concurrent', 'http401', 'http403', 'http429', 'http503', 'invalid-json', 'network', 'expire', 'csrf302',
  ...[301, 302, 303, 307, 308].flatMap((status) => [`post${status}-same`, `post${status}-cross`]), 'post-loss',
  'post-loss-empty', 'post-loss-json', 'post-loss-binary', 'post-loss-multipart', 'post503-zero'];
const kinds = ['response', 'not_sent', 'transport_error', 'stale_response', 'json', 'empty', 'bytes', 'redirect', 'http_error', 'format_error', 'body_read_error',
  'refreshed', 'already_recovered', 'skipped', 'failed'];
const reasons = ['invalid_request', 'auth_transition', 'cancelled', 'csrf_unavailable', 'network', 'invalid_response', 'http', 'invalidated',
  'unexpected_status', 'invalid_content_type', 'invalid_json', 'invalid_envelope', 'empty_body', 'already_used', 'read_failed',
  'stale_context', 'ineligible_request', 'superseded_token'];
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 0;
function safeResult(value) {
  if (['not_run', 'blocked', 'not_verified'].includes(value)) return value;
  const result = {};
  if (kinds.includes(value?.kind)) result.kind = value.kind;
  if (reasons.includes(value?.reason)) result.reason = value.reason;
  if (typeof value?.ok === 'boolean') result.ok = value.ok;
  if (Number.isInteger(value?.status) && value.status >= 100 && value.status <= 599) result.status = value.status;
  if (reasons.includes(value?.csrfReason)) result.csrfReason = value.csrfReason;
  if (Number.isInteger(value?.csrfStatus) && value.csrfStatus >= 100 && value.csrfStatus <= 599) result.csrfStatus = value.csrfStatus;
  return result;
}
function safeReport(value, allowedChecks = []) {
  const result = { checks: {} };
  if (['android', 'ios'].includes(value?.platform)) result.platform = value.platform;
  if (['3b', '5', '166-5', '167-6'].includes(value?.stage)) result.stage = value.stage;
  for (const key of ['pass', 'cleanup', 'reachable', 'inert', 'cookieRoundTrip', 'pendingBoth', 'cookiePresentBefore', 'cookiePresentAfter',
    'cookieMatchesAfterRejectedResponse', 'positiveSame', 'positiveCross']) if (typeof value?.[key] === 'boolean') result[key] = value[key];
  for (const key of ['fetchCalls', 'classified']) if (key in value) result[key] = number(value[key]);
  for (const key of allowedChecks) if (typeof value?.checks?.[key] === 'boolean') result.checks[key] = value.checks[key];
  for (const key of ['operation', 'secondary', 'refresh', 'preparation', 'firstPost', 'secondOutcome']) if (key in value) result[key] = safeResult(value[key]);
  if ('outcome' in value) result.outcome = ['changed', 'unchanged', 'csrf_invalid', 'unknown', 'not_attempted'].includes(value.outcome)
    ? value.outcome : safeResult(value.outcome);
  for (const key of ['before', 'beforeRelease', 'explicitCounts']) if (value[key]) {
    result[key] = Object.fromEntries(['csrf', 'get', 'post', 'auth', 'old'].filter((name) => name in value[key]).map((name) => [name, number(value[key][name])]));
  }
  if (Array.isArray(value.observations)) result.observations = value.observations.slice(0, 8).map((item) => ({ status: number(item?.status),
    urlEqualsRequested: item?.urlEqualsRequested === true, sameOriginAndPath: item?.sameOriginAndPath === true,
    hasCacheQuery: item?.hasCacheQuery === true, redirectedPropertyPresent: item?.redirectedPropertyPresent === true }));
  if (value.issue) result.issue = ['incomplete', 'deadline', 'probe_incomplete', 'probe_transport_failure', 'observation_deadline'].includes(value.issue) ? value.issue : 'incomplete';
  if ('pass' in result) result.pass = result.pass === true && result.cleanup === true && !value.issue;
  return result;
}
function matchesResponseDecision(value, expected) {
  return value?.parsedKind === (expected === 'none' ? 'json' : 'http_error') && value.kind === expected;
}
function checksPassed(checks, required) {
  return required.length > 0 && required.every((key) => checks?.[key] === true) && Object.values(checks ?? {}).every((value) => value === true);
}
function summarizeCases(expected, results) {
  const missing = expected.filter((name) => !results.some((item) => item.name === name));
  const failed = expected.filter((name) => {
    const matches = results.filter((item) => item.name === name);
    return matches.length > 0 && (matches.length !== 1 || matches[0].pass !== true || ('clean' in matches[0] && matches[0].clean !== true));
  });
  return { pass: expected.length > 0 && new Set(expected).size === expected.length && results.length === expected.length
    && missing.length === 0 && failed.length === 0 && results.every((item) => expected.includes(item.name)),
  expected: expected.length, completed: new Set(results.filter((item) => expected.includes(item.name)).map((item) => item.name)).size, missing, failed };
}
function requiredAuthChecks(name) {
  if (!authCases.includes(name)) return [];
  const required = ['inert', 'classified', 'authOnce', 'postOnce', 'recovered', 'cookieAfter', 'cleanupAbsent'];
  if (!['auth-network', 'cancel-auth', 'cancel-body'].includes(name)) required.push('originalReadable');
  if (name === 'pre-cancel') required.push('preCancelled');
  else if (['auth-held', 'refresh-held'].includes(name)) required.push('gate', 'notQueued', 'refreshBlocked');
  else if (['drain-csrf', 'cancel-csrf', 'cancel-drain'].includes(name)) {
    required.push('drained', 'gate', 'ordering', 'notQueued');
    if (name === 'drain-csrf') required.push('oldBlocked'); else required.push('preCancelled');
    if (name !== 'cancel-csrf') required.push('oldResult');
  } else if (['late-csrf', 'cancel-old'].includes(name)) {
    required.push('drained', 'oldResult', 'ordering');
    if (name === 'cancel-old') required.push('preCancelled');
  } else if (['stale-get', 'stale-post'].includes(name)) required.push('drained', 'oldResult', 'ordering');
  else if (['cancel-auth', 'cancel-body'].includes(name)) required.push('abortSettled', 'unknownCleared', 'lateWriteBlocked');
  else if (name.startsWith('refresh')) {
    required.push('refreshFailure', 'notQueued');
    if (name === 'refresh302') required.push('positive');
  } else if (['unknown503', 'classifier-error', 'auth-network'].includes(name)) required.push('unknownCleared');
  if (['logout', 'login-failed', 'cancel-csrf', 'stale-get', 'stale-post', 'cancel-auth', 'cancel-body', 'unknown503', 'classifier-error', 'auth-network'].includes(name)
    || (name.startsWith('refresh') && name !== 'refresh-held')) required.push('cookieBefore');
  return required;
}
function requiredResponseChecks(name) {
  if (!responseCases.includes(name)) return [];
  const required = ['inert', 'prepared', 'result', 'body', 'notReplayed', 'cleanupAbsent'];
  if (!['redirect', 'post-loss'].includes(name)) required.push('metadata');
  if (/^(delay|cancel|disconnect|late)-/.test(name)) {
    required.push('headersBeforeBody');
    if (!name.startsWith('late-')) required.push('pendingBeforeRelease');
  }
  if (name === 'auth-json') required.push('refresh', 'originalReadable');
  if (name === 'redirect') required.push('positive', 'sinkBlocked');
  return required;
}
module.exports = { safeReport, matchesResponseDecision, checksPassed, summarizeCases, authCases, responseCases, transportCases, requiredAuthChecks, requiredResponseChecks };

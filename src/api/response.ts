export type ResponseExpectation = (
  | { kind: 'json'; statuses: readonly (200 | 201 | 202)[] }
  | { kind: 'empty'; statuses: readonly 204[] }
) & { errorContext?: 'conversation_start' };
export type ResponseMetadata = {
  status: number;
  headers: { requestId: string | null; location: string | null; retryAfter: string | null; contentType: string | null };
};
export type ApiError = {
  code: string; message: string; requestId: string; fields: { field: string; reason: string }[];
  activeConversationId?: string;
};
export type ParsedApiResponse = { meta: ResponseMetadata } & (
  | { kind: 'json'; data: unknown }
  | { kind: 'empty' }
  | { kind: 'http_error'; error: ApiError }
  | { kind: 'format_error'; reason: 'unexpected_status' | 'invalid_content_type' | 'invalid_json' | 'invalid_envelope' }
  | { kind: 'body_read_error'; reason: 'already_used' | 'read_failed' }
);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
function parseError(body: unknown, status: number, context: ResponseExpectation['errorContext']): ApiError | undefined {
  if (!record(body) || !record(body.error)) return;
  const error = body.error;
  if (typeof error.code !== 'string' || typeof error.message !== 'string' || !uuid(error.requestId)) return;
  const fields: ApiError['fields'] = [];
  // OpenAPI required와 달리 공통 계약은 fields 누락만 빈 배열로 호환한다.
  if (Object.hasOwn(error, 'fields')) {
    if (!Array.isArray(error.fields)) return;
    for (const item of error.fields) {
      if (!record(item) || typeof item.field !== 'string' || typeof item.reason !== 'string') return;
      fields.push({ field: item.field, reason: item.reason });
    }
  }
  const result: ApiError = { code: error.code, message: error.message, requestId: error.requestId, fields };
  if (context === 'conversation_start' && status === 409 && error.code === 'ACTIVE_CONVERSATION_EXISTS') {
    if (!uuid(error.activeConversationId)) return;
    result.activeConversationId = error.activeConversationId;
  }
  // 미정의 필드를 펼치지 않고 호출 문맥에서 허용한 값만 반환한다.
  return result;
}

// body/error 메타데이터에도 개인정보가 있을 수 있으므로 결과 전체를 기록하지 않는다.
// 이 함수는 envelope만 검사하며 업무 DTO·재시도·인증 상태는 호출부 책임이다.
export async function parseApiResponse(response: Response, expectation: ResponseExpectation): Promise<ParsedApiResponse> {
  const meta: ResponseMetadata = { status: response.status, headers: {
    requestId: response.headers.get('X-Request-ID'), location: response.headers.get('Location'),
    retryAfter: response.headers.get('Retry-After'), contentType: response.headers.get('Content-Type'),
  } };
  const httpError = response.status >= 400 && response.status <= 599;
  if (!httpError && !(expectation.statuses as readonly number[]).includes(response.status)) {
    return { kind: 'format_error', reason: 'unexpected_status', meta };
  }
  if (!httpError && expectation.kind === 'empty') return { kind: 'empty', meta };
  if (!/^application\/json(?: *; *charset *= *(?:utf-8|"utf-8"))?$/i.test(meta.headers.contentType ?? '')) {
    return { kind: 'format_error', reason: 'invalid_content_type', meta };
  }
  if (response.bodyUsed) return { kind: 'body_read_error', reason: 'already_used', meta };
  let text: string;
  try {
    text = await response.text();
  } catch {
    // 런타임 예외명으로 취소 원인을 추정하거나 원문 예외를 반환하지 않는다.
    return { kind: 'body_read_error', reason: 'read_failed', meta };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: 'format_error', reason: 'invalid_json', meta };
  }
  if (httpError) {
    const error = parseError(body, response.status, expectation.errorContext);
    return error ? { kind: 'http_error', error, meta } : { kind: 'format_error', reason: 'invalid_envelope', meta };
  }
  if (!record(body) || !Object.hasOwn(body, 'data')) {
    return { kind: 'format_error', reason: 'invalid_envelope', meta };
  }
  return { kind: 'json', data: body.data, meta };
}

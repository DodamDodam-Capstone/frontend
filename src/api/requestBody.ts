export type RequestBody =
  | { kind: 'none' }
  | { kind: 'json'; value: unknown }
  | { kind: 'formData'; value: FormData };
export type RequestBodyResult =
  | { ok: true; value: { headers: Headers; body?: BodyInit } }
  | { ok: false; reason: 'invalid_body' | 'invalid_headers' | 'invalid_content_type' };

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

// getter/toJSON을 실행하거나 JSON.stringify가 값을 생략·변환하기 전에 plain 값만 복사한다.
// endpoint별 필드·null 허용 여부는 DTO를 만드는 호출부가 검증한다.
function copyJson(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Invalid JSON input');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid JSON input');
  }
  const properties = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(properties);
  if (keys.some((key) => typeof key !== 'string')) throw new Error('Invalid JSON input');
  ancestors.add(value);
  try {
    if (array) {
      // 배열의 hole·추가 필드는 JSON 직렬화 때 null로 바뀌거나 사라지므로 거절한다.
      if (keys.length !== value.length + 1) throw new Error('Invalid JSON input');
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const property = properties[String(index)];
        if (!property?.enumerable || !('value' in property)) throw new Error('Invalid JSON input');
        result.push(copyJson(property.value, ancestors));
      }
      return result;
    }
    const result: { [key: string]: JsonValue } = Object.create(null);
    for (const key of keys as string[]) {
      const property = properties[key];
      if (!property.enumerable || !('value' in property)) throw new Error('Invalid JSON input');
      result[key] = copyJson(property.value, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

// 공통 계약은 JSON UTF-8이다. 수동 multipart boundary는 허용하지 않는다.
const jsonContentType = /^application\/json(?: *; *charset *= *(?:utf-8|"utf-8"))?$/i;

/** 전송하지 않고 body/headers만 준비한다. 실패하면 호출부는 client를 호출하지 않는다. */
export function prepareRequestBody(input: RequestBody, inputHeaders?: HeadersInit): RequestBodyResult {
  let headers: Headers;
  try {
    headers = new Headers(inputHeaders);
    let invalidValue = false;
    headers.forEach((value) => { if (/[\u0000-\u001f\u007f]/.test(value)) invalidValue = true; });
    if (invalidValue) return { ok: false, reason: 'invalid_headers' };
  } catch {
    return { ok: false, reason: 'invalid_headers' };
  }
  try {
    if (!input || !['none', 'json', 'formData'].includes(input.kind)) return { ok: false, reason: 'invalid_body' };
    const contentType = headers.get('Content-Type');
    if (input.kind === 'formData') {
      if (!(input.value instanceof FormData)) return { ok: false, reason: 'invalid_body' };
      if (contentType !== null) return { ok: false, reason: 'invalid_content_type' };
      return { ok: true, value: { headers, body: input.value } };
    }
    if (contentType !== null && !jsonContentType.test(contentType)) return { ok: false, reason: 'invalid_content_type' };
    if (input.kind === 'none') {
      if ('value' in input) return { ok: false, reason: 'invalid_body' };
      return { ok: true, value: { headers } };
    }
    const body = JSON.stringify(copyJson(input.value));
    if (contentType === null) headers.set('Content-Type', 'application/json');
    return { ok: true, value: { headers, body } };
  } catch {
    // 입력값·예외에 인증정보가 포함될 수 있으므로 고정 사유만 반환한다.
    return { ok: false, reason: 'invalid_body' };
  }
}

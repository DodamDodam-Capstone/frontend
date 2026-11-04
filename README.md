# DodamDodam Frontend

DodamDodam 캡스톤 프로젝트의 프론트엔드 애플리케이션 저장소입니다.

Expo SDK 57·React Native·TypeScript로 만든 Android/iOS **가로 고정 태블릿 앱**입니다.
네이티브 프로젝트는 Expo 설정에서 생성하며 `android/`·`ios/`를 Git에 넣지 않습니다.
앱 식별자·방향 등 현재 설정은 [`app.json`](app.json)에 있습니다. 환경별 공개 설정은
[`src/config/env.ts`](src/config/env.ts), 공통 화면 경로는
[`src/navigation/routes.ts`](src/navigation/routes.ts)에서 관리합니다.

## 설치와 개발 실행

Node.js `24.20.0`과 npm `11.19.0`을 사용합니다. 버전 기준은 [`.nvmrc`](.nvmrc),
[`package.json`](package.json), `package-lock.json`입니다.

```bash
node --version
npm --version
npm ci
```

현재 `npm ci`는 설치 후 [Forge 임시 보완](scripts/security/patchForge.cjs)과
[Expo 본문 오류 보완](scripts/native-session/patchExpoFetch.cjs)을 적용합니다.
원본 버전·파일이 달라지면 설치를 중단합니다. 감사 잔여 항목과 공식 버전 전환 시 제거 조건은
[검증 기록](docs/FE_TEST_CI_PLAN.md)을 확인합니다.

Metro만 열어 볼 때는 `npm start`를 실행합니다. 아래 `npm run android`와
`npm run ios`도 개발 서버를 시작하므로 플랫폼 검증은 하나씩 진행하고 이전 서버를
종료한 뒤 다음 플랫폼을 실행합니다.

Android Studio의 Android 태블릿 에뮬레이터 또는 Xcode의 iPad 시뮬레이터를 준비한 뒤,
각 플랫폼을 별도로 실행합니다. 첫 실행에는 네이티브 프로젝트 생성·컴파일이 포함됩니다.
Android는 JDK 17, SDK Platform 36, Build Tools `36.0.0`, NDK `27.1.12297006`이
필요하고 iOS는 Xcode 26.6과 CocoaPods가 필요합니다.

```bash
npm run android
npm run ios
```

`npm run ios`는 macOS에서 실행합니다. 현재 앱은 iPad에서 가로 전체 화면을 사용하므로
Split View·Slide Over는 지원하지 않습니다. Expo Go 실행만으로 네이티브 빌드·실행을
검증한 것으로 기록하지 않습니다.

## 공개 환경 설정과 공통 경로 — SCRUM-160

`.env.example`을 `.env.local`로 복사한 뒤 필요한 **공개 설정만** 입력합니다.
예시 파일은 공란이며 기존 `.env.local`을 덮어쓰지 마세요. 환경 파일과 실제 운영값은
커밋하지 않습니다. `EXPO_PUBLIC_*`는 번들에 노출되므로 secret 저장소가 아닙니다.

| 변수 | 용도·검증 시점 |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `development` / `test` / `production` 중 명시적으로 선택. 누락·오타에 기본값 없음 |
| `EXPO_PUBLIC_API_MODE` | `mock` / `real` 중 명시적으로 선택. `production`에서 `mock`은 거절 |
| `EXPO_PUBLIC_API_BASE_URL` | `resolveApiConfig()` 사용 시 필수. 절대 URL, test/production은 HTTPS만 허용 |
| `EXPO_PUBLIC_OAUTH_REDIRECT_URI` | `resolveOAuthConfig()` 사용 시 필수. API 주소와 독립적으로 검증 |

앱 환경은 `NODE_ENV`와 별개입니다. `EXPO_PUBLIC_APP_ENV=test`가 `.env.test`를 자동으로
선택하지 않습니다. 로컬은 선택한 환경의 값을 `.env.local`에 공급하고, CI는 프로세스
환경으로 공개 시험값을 공급합니다. 충돌하는 파일·셸 값을 함께 사용하지 마세요.
이 프로젝트의 Expo SDK 57에서 동작을 확인하며 SDK 58 전용 로딩 규칙을 소급하지 않습니다.

- 개발: 개발용 주소를 명시합니다. HTTP는 개발 환경의 주소 형식 검사에서만 허용하며,
  Android cleartext/iOS ATS 예외나 네트워크 접근을 이 모듈이 허용해 주는 것은 아닙니다.
- 테스트: 공개 시험용 HTTPS 주소를 사용합니다. CI 주입 검사는 `.invalid` 도메인을
  사용하고 서버에 요청하지 않습니다. `test:env`는 환경별 값을 자체 공급하므로 개인 파일이 필요 없습니다.
- 운영: SCRUM-129에서 확인한 HTTPS API 주소·허용된 복귀 URI를 빌드 환경에 공급합니다.
  미확정 값을 개발/시험 주소로 대체하지 않습니다. 현재 앱 식별자는 개발용입니다.

`readEnvironment()`는 읽기만 수행합니다. 모듈 import나 설정 읽기가 미설정 때문에 앱을
종료시키지 않습니다. 사용처는 `resolveApiConfig()` 또는 `resolveOAuthConfig()` 결과의
`ok`를 확인한 뒤 `value`를 사용하세요. 실패 시 요청/인증을 시작하지 말고 `errors`의
변수 이름과 오류 코드만 처리합니다. 원래 환경값·URL 전체·파서 예외를 로그로 남기지 마세요.
URL의 자격 증명, query, fragment, 공백, 역슬래시는 설정 오류로 거절합니다.

설정 읽기는 Expo의 정적 `process.env.EXPO_PUBLIC_이름` 참조를 유지해야 합니다.
개발 중 `.env.local` 변경 후 앱을 완전히 Reload하고, 셸 환경을 바꿨다면 Metro도 재시작합니다.
배포 번들은 다시 생성해야 합니다. 앱 scheme·식별자 같은 네이티브 설정 변경은 새 빌드가 필요합니다.

### 네이티브 앱 주소와 OAuth 책임

현재 Android/iOS 앱에는 웹 FE origin이 없어 별도 웹 주소를 필수 변수로 만들지 않습니다.
앱 진입 식별자는 `app.json`의 package/bundleIdentifier로 확인합니다. 웹/WebView 기능에서
FE origin이 필요해지면 해당 기능에서 설정을 추가하고 SCRUM-129에서 실제 값을 확인합니다.

현재 명시적 `expo.scheme`이 없으므로 prebuild가 등록하는 개발용 package/bundleIdentifier
scheme과 HTTPS 복귀 URI의 형식을 지원합니다. 개발 환경에서는 HTTP 형식도 허용합니다.
`exp://`·개발 클라이언트 접속 URL을 OAuth 복귀 주소로 사용하지 않습니다.
BE의 `/login/oauth2/code/google`은 공급자 콜백이며 앱의 복귀 주소가 아닙니다.
**형식 통과는 OS 링크 등록·BE allowlist·Google 로그인 성공을 의미하지 않습니다.**
실제 복귀 값, 앱 링크 등록, 허용 목록, 세션 전달과 서버 왕복 검증은 SCRUM-129에서 수행합니다.

### 공통 경로 사용

로그인 `/login`, 아이 등록 `/children/register`, 홈 `/home`은 중앙 `ROUTES`에 있습니다.
Jira와 FE_Handoff v3.1의 화면 역할을 대조했지만 구체적인 FE 경로 문자열은 명시되지 않아
이번에 FE 내부 개발용으로 정의했습니다. 공개 딥링크·BE API 계약으로 확정한 주소가 아닙니다.
외부 계약 확정 시 이 중앙 정의와 실제 라우터 연결을 함께 검토합니다.

```ts
import { resolveApiConfig } from './src/config/env';
import { ROUTES } from './src/navigation/routes';

const config = resolveApiConfig();
if (config.ok) {
  // 후속 요청 계층에 config.value.apiBaseUrl을 전달합니다.
  // 후속 화면 이동에는 ROUTES.login / ROUTES.childRegistration / ROUTES.home을 재사용합니다.
}
```

실행 가능한 최소 수신자 예제는
[`prepareDestinationExample`](src/examples/configuredDestination.ts)입니다. 설정이 유효하면
선택한 공통 경로와 API 설정을 반환하고, 누락되면 오류를 반환합니다. 예제는 화면 이동·인증
판단·네트워크 요청을 하지 않으며 접근 제어에 쓰지 않습니다.

## mock·실제 API 모드 — SCRUM-161

개발 중 `.env.local`에서 앱 환경·API 모드·공개 API 주소를 명시적으로 선택합니다.
mock 검증에는 `EXPO_PUBLIC_APP_ENV=test`, `EXPO_PUBLIC_API_MODE=mock`,
`EXPO_PUBLIC_API_BASE_URL=https://api.example.invalid/api/v1` 같은 **가상 주소**를
사용할 수 있습니다. `production`과 `mock`의 조합은 설정 오류입니다.

[`createExampleTransport`](src/api/exampleTransport.ts)는 현재 테스트 수신자인
`GET /auth/me`만 지원합니다. mock 모드에서는 로컬 handler가 명세 기반 200 계정 상태를
반환하고, 테스트에서 `signedOut` 시나리오를 주면 401 `AUTHENTICATION_REQUIRED`를
반환합니다. 등록하지 않은 요청은 네트워크로 넘기지 않고 거절합니다. real 모드는
mock handler를 등록·실행하지 않으며, 수신자가 요청할 때에만 `fetch`를 호출합니다.
후속 API를 추가할 때 해당 요청의 mock handler와 실제 전송 경계를 이 위치에서 확장합니다.
테스트의 가상 응답은 실제 서버·세션·쿠키 동작을 검증한 결과가 아닙니다.

개발 빌드의 첫 화면은 선택한 모드를 간단히 표시합니다. mock에서는 위 가상 응답의
HTTP 상태를 보여주고, real에서는 시작 시 서버 요청 없이 모드 선택만 표시합니다.
실제 서버 왕복·인증·쿠키·CSRF 확인은 SCRUM-129와 해당 기능 작업에서 수행합니다.
`.env.local` 변경 후 앱을 다시 로드하고, 셸 환경을 변경했다면 Metro를 재시작하세요.

### 검증과 후속 연결

- `npm test`: 설정 정상·오류·경계와 공통 정의를 참조하는 예제 사용처를 검사합니다.
- `npm run test:env`: 설치된 Expo Babel preset으로 **실제 설정 모듈**을 Android/iOS별
  변환한 뒤 런타임 환경값이 없는 상태에서 실행합니다. 미설정과 환경·API 모드 14개 조합을
  확인합니다. 이는 변환 경계 검사이며 전체 Metro export·기기 실행은 별도로 확인합니다.
- 기존 CI의 JS job에서 두 명령과 양 플랫폼 export를 실행합니다. 네이티브 빌드·집계 게이트를 유지합니다.
- 123/124/125는 실제 요청·화면·인증 사용처를 연결합니다. 서버 왕복 검증은 129에서 수행합니다.

## 세션·CSRF 공통 요청 — SCRUM-165

`src/api/client.ts`의 `createApiClient()`는 기존 환경·API 모드 검증을 재사용합니다.
생성만으로 요청하지 않으며, 쿠키 문맥마다 같은 client를 재사용합니다. `prepareCsrf()`는
`GET /auth/csrf`의 wrapper 없는 응답을 검증해 token을 메모리에 보관하고 준비 결과만 반환합니다.
POST는 초기 발급이 필요하면 기다리고, 준비 실패 시 전송하지 않습니다. 준비된 token은 재사용하며
JS 계층에서 실패한 POST를 재호출하지 않습니다. Android 네이티브 재전송 차단은 아래 정책을 따릅니다.
mock은 `/auth/csrf`·`/auth/me` 예제만 제공하고,
미등록 요청을 실제 네트워크로 넘기지 않습니다.

```ts
import { createApiClient } from './src/api/client';

const client = createApiClient(); // 설정 검증만 수행하며 네트워크 요청은 하지 않습니다.
export async function requestAccountExample() {
  if (!client.ok) return client;
  return client.value.request({ method: 'GET', path: '/auth/me' });
}
```

- `request()`의 경로는 API base 뒤의 `/auth/me` 같은 ASCII segment이며 query를 붙일 수 있습니다.
  절대 URL·경로 이탈·encoded separator·fragment는 거절합니다. CSRF endpoint는 `prepareCsrf()`로만 호출합니다.
- `GET`·`POST`만 지원하며, caller의 `Cookie`·`Authorization`·`X-XSRF-TOKEN` 헤더는 거절합니다.
  `credentials: include`, `cache: no-store`, `redirect: error`를 적용하고 쿠키·token을 별도 저장하거나 기록하지 않습니다.
- 본문은 전달받은 값 그대로 보내고 빈 객체나 Content-Type을 자동 생성하지 않습니다.
  일반 응답 해석·직렬화는166, HTTP/code별 복구·인증 만료 판단은167에서 확장합니다.
- 결과의 `kind=response`는 HTTP 응답 수신을 뜻하며 4xx·5xx도 포함합니다. `not_sent`는 요청을
  보내지 않았다는 뜻이고, `transport_error`는 서버 처리 여부를 단정할 수 없는 통신 실패입니다.
  `stale_response`는 전송 후 인증 전환을 가로질러 도착한 응답입니다. 이를 이전 사용자 상태에 반영하거나
  미전송으로 간주해 POST를 자동 재실행하지 않습니다.
- **SCRUM-165의 6단계까지 로컬 구현·검증을 완료했습니다(2026-10-26).** 최종 검사와 AC별 근거는
  [기능별 테스트 기록](docs/FE_TEST_CI_PLAN.md)의 6단계에 있습니다. 실제 로그인·로그아웃 호출부 연결은125,
  실서버 검증은129 범위입니다. 원격 CI·GitHub PR 리뷰·병합·Jira 완료는 별도입니다.
  3-A에서 Android·iOS 개발 빌드의 초기 CSRF 발급·쿠키 재전송·최초 POST 왕복을 로컬 수신자로 확인했습니다.
  3-B에서 재현한 Android POST 중복 전송을 보완한 뒤 양 OS 각26개, **총52개 네이티브 검사가 통과**했습니다.
- Android는 `plugins/withSingleUsePost.js`를 prebuild에 적용해 RN/Expo의 OkHttp client 생성 전에
  factory를 등록하고, 요청 전송 시 POST 본문을 `isOneShot=true`로 감쌉니다. 연결 손실과 `503 + Retry-After: 0`에서 본문 재전송을 막으며,
  본문·Content-Type·길이와 기본 쿠키 bridge를 보존합니다. GET의 재시도 설정은 바꾸지 않습니다.
  이 정책은 해당 factory를 사용하는 Android RN/Expo POST 전체에 적용됩니다. 설정 변경 후에는
  `npx --no-install expo prebuild --platform android --no-install`과 Android 앱 재빌드가 필요합니다.
  일반 JS reload나 기존 development build에는 네이티브 변경이 적용되지 않습니다.
- 이동 거절 후에도 최초 응답 쿠키는 반영될 수 있고, 통신 실패 후 서버 처리 여부는 알 수 없습니다.
  로컬 결과·한 번의 전송 관측을 운영 HTTPS·OAuth·실제 서버 연동129의 성공이나 exactly-once 보장으로 확대하지 않습니다.
  재현 조건·이전 실패와 수정 후 결과는 [기능별 테스트 기록](docs/FE_TEST_CI_PLAN.md)에 남깁니다.

### 요청 본문 준비 — SCRUM-166 2단계

`src/api/requestBody.ts`의 `prepareRequestBody(input, headers?)`는 전송 전에 본문과
헤더를 준비합니다. 성공은 `{ ok: true, value: { headers, body? } }`, 실패는
`{ ok: false, reason }`입니다. 실패하면 client를 호출하지 않습니다. 기존 raw
`client.request()`는 그대로이며, 준비 함수 자체는 CSRF 발급이나 네트워크 요청을 하지 않습니다.

| 입력 | 준비 결과 |
| --- | --- |
| `{ kind: 'json', value: dto }` | JSON 문자열과 기본 `application/json`. 기존 JSON/UTF-8 헤더는 유지합니다. |
| `{ kind: 'none' }` | body와 기본 Content-Type을 생략합니다. 명시한 JSON/UTF-8 헤더는 허용합니다. |
| `{ kind: 'formData', value: formData }` | 같은 FormData를 전달합니다. Content-Type은 런타임이 boundary와 함께 정하므로 수동 지정은 거절합니다. |

JSON Content-Type은 `application/json`과 선택적인 UTF-8 charset 형태를 지원합니다.
JSON 입력의 undefined·배열 빈 슬롯·비유한 숫자·BigInt·순환·함수·Symbol·사용자 클래스와
getter/custom toJSON 등은 `invalid_body`로 거절합니다. 선택 필드는 DTO 생성 시 생략합니다.
이 함수는 endpoint별 DTO validator가 아닙니다. 허용 필드·필수값·null은 호출부에서 검증하며,
현재 요청 계약에는 null 허용 필드가 없습니다. 일반 JSON null을 변환하거나 자동 생성하지 않습니다.
JSON은 준비 시점의 값으로 고정하지만 FormData는 같은 객체이므로 전송 완료 전 변경하지 않습니다.

준비 결과에는 전송할 본문이 있으므로 로그·URL·영구 저장소로 복사하지 않습니다.
실패 결과에는 입력·원문 예외가 없으며 `invalid_body`, `invalid_headers`,
`invalid_content_type`만 반환합니다. Cookie/Authorization/CSRF 헤더 보호는 기존 client가
계속 담당합니다. 정상 준비 결과도 전송 성공을 뜻하지 않으며 기존 `ApiResult`를 확인해야 합니다.
응답 parser는 아래166의3·4단계에서 제공하며, code별 복구 정책은167에서 구현합니다.

### 응답 해석 — SCRUM-166 3·4단계

[`parseApiResponse(response, expectation)`](src/api/response.ts)는 기존 client의
`kind: 'response'`를 받은 호출부에서 사용합니다. 기존 `not_sent`/`transport_error`/
`stale_response`는 그대로 처리하며 parser에 넘기지 않습니다. 호출부는 endpoint 계약에 맞는
성공 종류와 허용 상태를 명시합니다. JSON은200/201/202, empty는204, binary는200을 지원합니다.
0바이트 POST라고 응답도 empty인 것은 아닙니다. resume는JSON200, end는JSON200/202입니다.

```ts
import { parseApiResponse } from './src/api/response';

async function readAccountExample() {
  if (!client.ok) return client;
  const received = await client.value.request({ method: 'GET', path: '/auth/me' });
  if (received.kind !== 'response') return received;
  return parseApiResponse(received.response, { kind: 'json', statuses: [200] });
}
```

| 결과 kind | 호출부가 받는 정보 |
| --- | --- |
| `json` | `data: unknown`. envelope만 확인하므로 실제 DTO는 호출부에서 검증합니다. |
| `empty` | 허용한204이며 본문을 읽거나 JSON으로 변환하지 않습니다. |
| `bytes` | 음성200의 `bytes: ArrayBuffer`. 바이트를 변형하거나 자동 재생하지 않습니다. |
| `redirect` | 관측한301/302/303/307/308. Location은 메타데이터일 뿐 자동 이동하지 않습니다. |
| `http_error` | 4xx/5xx의 `error: { code, message, requestId, fields }`. 기대 성공 종류와 관계없이 처리합니다. |
| `format_error` | 예상 밖 상태·MIME·JSON·envelope·빈 바이너리의 고정 사유. 원문 본문/예외는 포함하지 않습니다. |
| `body_read_error` | `already_used` 또는 `read_failed`. 응답 이후 실패를 미전송이나 확정 취소로 바꾸지 않습니다. |

모든 결과의 `meta`에 HTTP `status`와 선택한 헤더만 있습니다.
`meta.headers.requestId`, `location`, `retryAfter`, `contentType`은 받은 문자열 또는 누락 시null입니다.
본문 읽기·형식 실패에도 유지하며, 잘못된 헤더 값을 임의 ID·대기시간으로 보정하지 않습니다.
오류 body의 `error.requestId`는 UUID로 확인하되 헤더 ID와 서로 덮어쓰지 않습니다.
`Retry-After` 해석·재시도·인증 만료 판단은167, Location으로 자동 탐색하는 기능은 제공하지 않습니다.

`fields` 누락만[]로 처리하고 null/잘못된 배열 원소는 형식 오류입니다. 확인한 필드만 새 객체로
구성하고 미정의 필드를 펼치지 않으며, 전체 OpenAPI schema 검증을 대신하지 않습니다.
대화 시작 호출부는 `errorContext: 'conversation_start'`를 지정합니다. 이 문맥의409
`ACTIVE_CONVERSATION_EXISTS`에서만 UUID `activeConversationId`를 요구·보존합니다.
일반 요청·다른 상태/code에는 확장을 반환하지 않습니다.

parser는 전달받은 본문을 최대 한번 읽습니다. 원본이 필요한 호출부만 미리 clone하며,
`authTransition()` classifier의 clone과 반환된 원본은 각각 해석할 수 있습니다.
인증 결과와 CSRF refresh 결과는 계속 분리합니다. parser는 세션/UI를 변경하지 않으며,
헤더 수신 뒤 늦게 읽은 data의 반영 여부는125/167이 현재 인증 문맥과 함께 판단합니다.

결과에는 응답 data/message/fields와 헤더 원문이 있으므로 전체를 URL·console·영구 저장소로
복사하지 않습니다. 파서 자체는 로깅·저장·재전송을 하지 않습니다. 실제 Android/iOS의 새 파서 검증 결과와 재현 절차는 아래5단계 및
[테스트 기록](docs/FE_TEST_CI_PLAN.md)에 구분해서 남깁니다. 실서버 연동은129의 책임입니다.

### 바이너리·OAuth — SCRUM-166 4단계

음성 GET의 raw Response에는 `{ kind: 'binary', statuses: [200] }`를 지정합니다.
성공이면 `arrayBuffer()`로 한번 읽고 `kind: 'bytes'`로 반환합니다. JSON4xx/5xx는
바이너리보다 먼저 공통 오류로 해석합니다. 누락/잘못된 MIME은 읽기 전에 거절하며,
이미 소비한 본문과 읽기 거절도3단계와 같은 결과로 구분합니다.

현재 `audio/*`는 실제 MIME이 미정인 명세 초안입니다. 파서는 구체적인 `audio/…` media type을
확인하고 매개변수가 있는 헤더 원문도 보존합니다. literal `audio/*`와 `application/octet-stream`은
성공 MIME으로 인정하지 않습니다. 이 검사는 codec·재생 가능 여부·운영 allowlist 검증이 아닙니다.
빈200은 FE의 빈2xx 방어 규칙에 따라 `format_error/empty_body`로 반환합니다.
BE의 음성 최소 크기나 확정 MIME·TTL 규정으로 해석하지 않으며 D13/D14 확정 후 대조해야 합니다.

```ts
import { resolveOAuthStartUrl } from './src/api/oauth';

const start = resolveOAuthStartUrl(); // 검증된 환경 설정 → ConfigResult<string>
// 성공 value는 서버 origin + /oauth2/authorization/google이며 query가 없습니다.
// 이 호출은 브라우저 실행이나 네트워크 요청을 하지 않습니다.
```

OAuth 시작 경로는 `/api/v1` 밖입니다. helper는 기존 API 설정의 환경·URL 검증을 재사용하고
origin/port를 유지하며 API base path는 붙이지 않습니다. 별도 target URL·query 인자를 받지 않고,
앱 복귀 URI나 token/state/redirect_uri를 시작 주소에 추가하지 않습니다. 실제 프록시 배포 경로가
달라지면 D17 계약과 함께 확인합니다. 주소 생성은 운영 host allowlist나 OS 링크 검증이 아닙니다.
외부 브라우저 실행·앱 callback·세션 쿠키 연결은126/129에서 담당합니다.

파서는 실제로 받은301/302/303/307/308을 `redirect`로 분류하고 본문을 읽지 않습니다.
300/304/305/306은 `unexpected_status`이며 특히304를 OAuth 이동으로 간주하지 않습니다.
`meta.headers.location`은 누락·미검증 값을 포함한 관측 원문이므로 바로 열거나 기록하지 않습니다.
서버 allowlist 확인과 앱 이동 정책은 해당 호출부 책임입니다. 기존 `fetch`의 `redirect: 'error'`를
유지하며, 이동 거절로 fetch가 실패하면 기존 `transport_error`입니다. 합성302 테스트의 통과는
네이티브에서302를 읽었거나 실제 OAuth 로그인이 성공했다는 증거가 아닙니다.

### 응답 파서 네이티브 검증 — SCRUM-166 5단계

일반 `index.ts`와 분리한 `scripts/native-session/response.tsx`가 실제 global fetch로
요청 준비→client→parser를 실행합니다. 기존 loopback 수신자에25개 응답 사례를 추가했습니다.
JSON·204·202·multipart·바이너리·오류 envelope와 본문 지연/취소/단절, 파서 호출 전 단절과 늦은 clone 읽기,
POST 재전송 없음, 인증 classifier clone/원본·CSRF 재획득을 검사합니다.
합성 바이트와 `audio/x-synthetic`은 실제 음성 형식·codec 정책이 아닙니다.

Expo `57.0.31`의 원본 native buffered reader에서 Android의 부분 본문 성공과 iOS의 오류 후
미완료 대기를 재현했습니다. `npm ci`의 postinstall은 기존 Forge 보완 뒤
[`patchExpoFetch.cjs`](scripts/native-session/patchExpoFetch.cjs)를 적용합니다. Android의 오류 상태
보존과 Android/iOS `text()`·`arrayBuffer()` 및 늦은 clone의 stream 시작 시 오류 reject를 변경합니다. 버전과3개 소스의
원본/패치 SHA256을 모두 확인하며, 예상과 다르면 설치가 실패합니다. SDK 갱신 시 이 보완을
그대로 우회하지 말고 공식 수정 여부와 아래 실제 네이티브 회귀를 확인한 뒤 제거/갱신합니다.
이미 빌드한 앱·Expo Go에는 적용되지 않으므로 **설치 후 development build 재빌드가 필요합니다.**

수신자 실행 후 `EXPO_NO_DOTENV=1 npx --no-install expo start --dev-client --localhost --port 8082`로
Metro를 시작합니다. 진단용 bundle URL은
`http://127.0.0.1:8082/scripts/native-session/response.bundle?platform=android&dev=true&minify=false&modulesOnly=false&runModule=true`이며
iOS는 platform을 `ios`로 바꿉니다. 해당 URL을 URL-encode하여
`exp+dodamdodam://expo-development-client/?url=…`로 엽니다. Android는 `adb reverse tcp:8082 tcp:8082`가
필요하며 수신자 주소는 Android `10.0.2.2:48591`, iOS `127.0.0.1:48591`입니다.
`scripts/native-session/cases.bundle`와 `auth.bundle`로 기존 회귀도 실행합니다.
`EXPO_PUBLIC_NATIVE_PROBE_CASE`로 알려진 사례 하나를 선택할 수 있습니다.

Android 지연 JSON은 chunked 전송으로 개발 Network Inspector의 본문 미리 읽기를 피합니다.
iOS의 단절 시험은 전체 Content-Length로 잘림을 명확하게 만듭니다. iOS에서 chunked 연결 종료는
정상 EOF로 전달되어 잘린 JSON이 `invalid_json`으로 분류되는 경우를 관측했습니다. 바이너리는 두 OS
모두 전체 Content-Length를 유지합니다. MIME·Accept를 바꾸거나 오류 응답을 성공으로 인정하지 않습니다. HTTP/code/메타데이터 결과, 실제 요청 횟수와 쿠키 정리 boolean만
기록하며 원문 URL·쿠키·토큰·본문·예외는 기록하지 않습니다. 진단의3초/20초 제한은 운영 timeout이 아닙니다.
진단 종료 후 일반 Metro URL로 App에 복귀하고 해당 앱·서버·장치·adb reverse를 정리합니다.

2026-11-04 최종 빌드에서 각 OS77개(새 응답25·기존 요청26·인증26), 총154개 사례가 통과했습니다.
깨끗한 설치의 Jest473개·온라인 Expo·양 플랫폼 export/빌드도 통과했습니다.

이 검사는 에뮬레이터/시뮬레이터의 HTTP loopback 검사입니다. 운영 HTTPS·실기기·BE·OAuth callback,
확정 음성 codec/크기/TTL 검증과 원격 PR CI는 별도로 수행해야 합니다.

### 로그인·로그아웃의 CSRF 갱신

125 호출부는 인증 상태를 바꾸는 POST에 `authTransition(request, classify)`를 사용합니다.
일반 `request()`는 업무 응답을 해석해 인증 수명주기를 자동 실행하지 않습니다. 같은 OS 쿠키 문맥에서는
하나의 client를 재사용해야 gate와 token을 공유합니다. 여러 client 간 동기화는 제공하지 않습니다.

`classify`는 복제된 Response의 HTTP/code·확정 DTO를 읽고 아래 판정만 반환합니다. 원래 Response는
`operation`에 남아 있어 다시 읽을 수 있습니다. 구체적인 로그인 성공·실패/503 분류와 화면 상태는125가 소유하며,
비-2xx라는 이유만으로 `unchanged`를 반환하지 않습니다. 판정 중 추가 요청은 gate에서 거절됩니다.

| 호출부 판정 | 공통 계층 동작 |
| --- | --- |
| `changed` | 이전 token 준비를 해제하고 새 CSRF GET 완료까지 기다림 |
| `unchanged` | 세션·CSRF가 유지된 확정 실패에만 사용. 성공 정리·추가 발급 없음 |
| `csrf_invalid` | 이전 token 해제·GET 재획득. 원래 실패 POST는 반복하지 않음 |
| `unknown` | 이전 token 준비 해제. 인증 성공/실패를 추측하거나 자동 발급·POST 재전송하지 않음 |

반환값의 `operation`과 `refresh`를 별도로 확인합니다. 인증 성공 후 `refresh.ok=false`여도
인증 실패로 바꾸지 않으며 이전 token을 복구하지 않습니다. `refresh`가 없으면 갱신을 시도하지 않은 것입니다.
초기 준비 실패·전송 전 취소·중첩 전환은 `outcome=not_attempted`와 미전송 사유를 반환합니다.
전송 실패·판정 예외·정의되지 않은 판정은 `unknown`으로 정리하고 gate를 해제합니다.

```ts
import { prepareRequestBody } from './src/api/requestBody';

// 204 성공만 판정하는 예제. 실제 오류 code별 분류는125에서 연결합니다.
async function logoutExample() {
  if (!client.ok) return client;
  const prepared = prepareRequestBody({ kind: 'none' });
  if (!prepared.ok) return prepared;
  return client.value.authTransition(
    { method: 'POST', path: '/auth/logout', ...prepared.value },
    (response) => response.status === 204 ? 'changed' : 'unknown',
  );
}
```

전환을 시작하면 진행 중인 CSRF 발급과 **이미 시작된 일반 요청의 응답 헤더 수신**을 먼저 기다린 뒤 인증 POST를 전송합니다.
일반 POST의 403도 CSRF 쿠키를 발급할 수 있어, JS 응답 폐기만으로 늦은 쿠키 덮어쓰기를 막을 수 없기 때문입니다.
응답이 늦으면 인증 시작도 지연됩니다. `signal`로 인증 대기를 취소할 수 있으며 원래 요청은 강제로 취소하지 않습니다.
다음 인증도 남은 요청을 먼저 기다립니다. 전환 중 GET·POST·`prepareCsrf()` 및 겹친 인증 전환은 자동 대기열에 넣지 않습니다.
전환 이전 CSRF를 기다리던 POST도 `not_sent/auth_transition`으로 반환합니다.

`ApiRequest.signal`로 취소할 수 있습니다. POST 전 취소는 `not_sent/cancelled`, 전송 호출 뒤 실패는
`transport_error`로 구분합니다. 공유 CSRF GET을 기다리던 호출을 취소하면 그 대기와 listener만 해제하며,
GET 자체는 유지합니다. 다음 인증 전환도 남은 응답을 먼저 기다립니다. 네이티브에서 헤더 수신 전 취소와
헤더 수신 후 본문 읽기 취소를 구분해 검사합니다. 이미 적용된 쿠키를 JS 세대 검사로 원복한다고 가정하지 않습니다. 이미 반환한 Response의
후속 화면 반영은125/167에서 현재 인증 문맥과 함께 확인해야 합니다. OAuth 외부 복귀는126/129 범위입니다.

### 네이티브 인증 검증 재현

개발 전용 `scripts/native-session/auth.tsx`는 합성 loopback 수신자와 실제 Expo global fetch로 동작합니다.
일반 앱에서 import하지 않으며 `index.ts`·`App.tsx`·개인 환경 파일을 바꾸지 않습니다. 로그인 body의
`synthetic-auth`와 응답의 `synthetic` 표시는 시험 수신자 전용이며 실제 API DTO가 아닙니다.

기존 수신자와 Metro를 실행한 뒤 개발 클라이언트의 `url`에
`http://127.0.0.1:8082/scripts/native-session/auth.bundle?platform=android&dev=true&minify=false&modulesOnly=false&runModule=true`를
URL 인코딩해 전달합니다. iOS는 `platform=ios`를 사용합니다. 수신자·개발 scheme·adb reverse 실행법은
[테스트 기록](docs/FE_TEST_CI_PLAN.md)의 3-A 절을 따릅니다. 알려진 단일 사례는 Metro 프로세스에만
`EXPO_PUBLIC_NATIVE_PROBE_CASE=late-csrf`처럼 공급하고 개인 `.env`에는 넣지 않습니다.
진단 후에는 bundle 경로 없는 일반 Metro URL로 복귀합니다. 수정 후 Android/iOS 각52개(인증26·기존회귀26), **총104개가 통과**했습니다. 실제 BE·운영 HTTPS·OAuth 검증과 구분한 상세 결과는 5단계 기록에 남깁니다.

## 로컬 검사와 플랫폼별 빌드

앱 변경 후 다음 명령을 실행합니다. 테스트는 watch 모드 없이 실제 테스트를 발견해야 하며,
0개면 실패합니다. Debug 네이티브 빌드는 JS 번들을 포함하지 않으므로 Android·iOS
번들 검사도 각각 필요합니다.

```bash
npx --no-install expo install --check
npm run lint
npm run typecheck
CI=true npm run test
npm run test:env
npx --no-install expo export --platform android --output-dir dist/android
npx --no-install expo export --platform ios --output-dir dist/ios
```

공통 `npm run build` 스크립트는 없습니다. 플랫폼마다 도구가 달라 깨끗한 checkout에서
다음과 같이 별도로 컴파일합니다. **`expo prebuild`는 기존 네이티브 폴더를 기본적으로
재생성하므로**, 이 절차를 무시된 로컬 `android/`·`ios/`의 보존해야 할 변경 위에서
실행하지 마세요. `--no-install`은 npm 패키지와 CocoaPods 설치를 모두 건너뜁니다.

```bash
# Android: Linux 또는 macOS, JDK 17/SDK 36/NDK 27.1.12297006 준비 후
npm ci
npx --no-install expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleDebug --no-daemon)

# iOS: macOS, Xcode 26.6/CocoaPods 준비 후 별도 깨끗한 checkout에서
npm ci
npx --no-install expo prebuild --platform ios --no-install
(cd ios && pod install)
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

빌드 출력은 각각 `android/app/build/outputs/apk/debug/`, Xcode DerivedData에 있습니다.
CI의 `js-quality`·`android-debug-build`·`ios-simulator-debug-build`가 모두 성공해야
필수 검사 `frontend-quality`가 통과합니다. PR에서는 최신 커밋의 실제 로그를 확인합니다.
이 검사는 앱의 실제 서버 연동이나 의존성 보안 감사를 통과했다는 뜻이 아닙니다.
비밀값·운영 환경 설정은 저장소나 `EXPO_PUBLIC_` 클라이언트 번들에 넣지 않습니다.

Organization 전체 협업 흐름은
[integration 저장소 문서](https://github.com/DodamDodam-Capstone/integration/blob/main/docs/GITHUB_WORKFLOW.md)에서
관리합니다.

Frontend의 Jira Epic·Task 명명과 GitHub Issue·브랜치·PR 연결 규칙은
[`docs/JIRA_WORKFLOW.md`](docs/JIRA_WORKFLOW.md)를 따릅니다.

처음 업무를 시작하는 팀원은 Jira-first와 GitHub-first 선택 기준, 실제 branch,
commit, PR 예시가 포함된
[`docs/TEAM_WORKFLOW_GUIDE.md`](docs/TEAM_WORKFLOW_GUIDE.md)를 먼저 확인합니다.

기능별 테스트 작성 시점과 로컬·CI·기기·실제 서버 검증 범위는
[`docs/FE_TEST_CI_PLAN.md`](docs/FE_TEST_CI_PLAN.md)에 정리했습니다. 작업 시에는
해당 Jira의 최신 완료 기준과 현재 실행 명령을 함께 확인합니다.

애플리케이션 개발을 시작하기 전에 저장소 초기화, CI 준비 상태, 저장소 전용
Slack 알림 경로를 검증했습니다.

기능 변경은 작업 브랜치에서 `development`로 squash merge합니다. 검증된
`development`는 보호된 PR에서 필수 CI를 통과한 뒤 merge commit으로 `main`에
승격합니다. `main` 대상 PR의 source branch는 `development`만 허용하며 긴급
수정도 먼저 `development`에 반영합니다. 2026-10-16 팀장 결정(담당자 전달)에 따라
FE는 사람 승인 대신 최신 변경의 GPT 코드 리뷰·지적 사항 검토·대화 해결과 필수 CI를
확인합니다. 같은 날 development Ruleset의 승인 수 0·마지막 push 승인 해제를
확인했습니다. main 설정과 다른 저장소까지 동일하다고 가정하지 않으며, 병합 시 실제
보호 조건을 다시 확인합니다.
`main` 반영이 완료되면 Bot PR이
integration의 `development`에서 프론트엔드 commit SHA를 자동으로 갱신합니다.

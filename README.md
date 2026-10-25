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

## 초기 세션·CSRF 공통 요청 — SCRUM-165 2단계

`src/api/client.ts`의 `createApiClient()`는 기존 환경·API 모드 검증을 재사용합니다.
생성만으로 요청하지 않으며, 쿠키 문맥마다 같은 client를 재사용합니다. `prepareCsrf()`는
`GET /auth/csrf`의 wrapper 없는 응답을 검증해 token을 메모리에 보관하고 준비 결과만 반환합니다.
POST는 초기 발급이 필요하면 기다리고, 준비 실패 시 전송하지 않습니다. 준비된 token은 재사용하며
실패한 POST를 자동 재전송하지 않습니다. mock은 `/auth/csrf`·`/auth/me` 예제만 제공하고,
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
- **현재는 초기 발급 단계입니다.** 로그인·로그아웃 뒤 갱신과 인증 전환 중 요청 차단은4단계에서 구현합니다.
  네이티브의 쿠키 전달 및 `redirect: error` 준수는 Jest로 입증되지 않았으며3단계에서 확인합니다.
  초기 URL 제한만으로 리디렉션 이후의 목적지까지 제한됐다고 판단하지 않습니다. 실제 서버 연동은129입니다.

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

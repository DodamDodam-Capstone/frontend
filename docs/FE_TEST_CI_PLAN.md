# FE 기능별 테스트·CI 도입 계획

작성 기준: 2026-10-14 KST · 계획 재검토: 2026-10-16 KST · SCRUM-165 최종 확인: 2026-10-26 KST · 대상: Expo/React Native/TypeScript Android·iOS 앱
상태: **SCRUM-159~161은 development `6bddb664`에 반영, SCRUM-165는 6단계까지 로컬 구현·검증 완료**. 2026-10-26 확인 시 Jira165는 해야 할 일, 부모123은 진행 중이다. 원격 CI·GitHub PR 리뷰·병합·Jira 완료 및 실제 서버 검증129와 구분한다.

## 목표와 현재 상태

이번 스프린트의 FE 작업을 구현할 때 각 Jira 완료 기준에서 정상 동작, 핵심 오류, 경계 조건을 테스트로 연결한다. **각 기능의 최소 동작을 구현한 직후 해당 기능의 테스트를 만들고, 같은 Subtask를 완료하거나 PR을 올리기 전에 통과시킨다.** 여러 기능이 이어져야 가능한 연결·기기·실서버 검증은 선행 기능이 준비된 뒤 수행한다. 로컬에서 먼저 검사하고, 같은 코드를 깨끗한 CI 환경에서도 검사한다.

- 현재 기준 기술은 Expo `57.0.31`, React Native `0.86.3`, React `19.2.3`, TypeScript `6.0.3`, Node `24.20.0`, npm `11.19.0`이다. 실제 기준은 변경 시 [`package.json`](../package.json), [`.nvmrc`](../.nvmrc), lockfile에서 다시 확인한다.
- 현재 `package.json`에는 `start`·`android`·`ios`와 실제 실행한 `lint`·`typecheck`·`test` 스크립트가 있다. 공통 `build` 스크립트는 없으며, 이 React Native 앱의 빌드는 Android·iOS별 네이티브 명령으로 검증한다. [CI 구성](../.github/workflows/ci.yml)은 필수 파일·스크립트, JS 검사·양 플랫폼 export, Android·iOS 네이티브 빌드의 실패·취소·건너뜀을 `frontend-quality` 실패로 연결한다. [PR #29의 실행 결과](https://github.com/DodamDodam-Capstone/frontend/actions/runs/38769299920)에서 JS·Android·iOS와 최종 집계가 모두 통과했다.
- 로컬 SCRUM-159의 1~5단계는 완료됐다. Pixel Tablet(Android API 36)과 iPad Pro 11형(iOS 26.5)에서 development build 컴파일·설치·가로 화면·재실행을 확인했다. 변경된 lockfile에서 설치·lint·typecheck·최소 화면 테스트와 Android·iOS JS export를 실행했다. 첫 PR의 온라인 Expo 검사는 `57.0.29` 대신 `~57.0.30`을 요구해 실패했고, 패치 갱신 후 로컬 온라인 검사와 깨끗한 checkout의 양쪽 네이티브 빌드, PR 원격 CI가 통과했다. Jira 상태와 로컬 단계 완료는 별개다.
- 이번 스프린트 범위는 [SCRUM-121](https://dodamdodam.atlassian.net/browse/SCRUM-121), [SCRUM-123](https://dodamdodam.atlassian.net/browse/SCRUM-123), [SCRUM-122](https://dodamdodam.atlassian.net/browse/SCRUM-122), [SCRUM-125](https://dodamdodam.atlassian.net/browse/SCRUM-125), [SCRUM-124](https://dodamdodam.atlassian.net/browse/SCRUM-124), [SCRUM-136](https://dodamdodam.atlassian.net/browse/SCRUM-136)의 부모 6개와 자식 19개다. 실제 서버 왕복은 별도 [SCRUM-129](https://dodamdodam.atlassian.net/browse/SCRUM-129)에서 검증한다.

Jira 원문과 최종 OpenAPI·ERD·확정된 후속 결정을 테스트의 기대값으로 삼는다. 이 문서의 사례는 현재 범위의 **검증 항목**이며, 미확정 API 필드·운영값·음성 제한을 새로 정하는 명세가 아니다.

## 실행 시작점과 작업 방법

이 문서는 2026-10-14에 작성하고 2026-10-15의 진행 상태와 2026-10-16의 CI 재검토를 반영했다. 후속 작업자는 먼저 현재 브랜치·변경 파일·해당 Jira의 최신 AC·실제 `package.json` 스크립트와 CI를 확인하고, 이미 완료된 단계를 반복하지 않는다. 변경된 사실은 최신 Jira와 실행 결과를 우선하며 이 계획의 해당 항목을 갱신한다.

**현재 확인 대상은 [SCRUM-165](https://dodamdodam.atlassian.net/browse/SCRUM-165)의 세션·CSRF 수명주기다.** 2026-10-26 최종 로컬 검증과 AC 대조는 아래 6단계 기록을 따른다. 아래159~161 기록은 당시 실행 이력으로 보존한다. FE의 GitHub PR 리뷰·필수 CI·대화 해결은 후속 PR에서 최신 커밋을 기준으로 확인하며, 이번 로컬 완료로 부모123이나 다른 Subtask를 완료하지 않는다.

- [x] 3단계에서 `expo-dev-client`를 설치하고 `npx expo run:android`로 Pixel Tablet(Android API 36), `npx expo run:ios --device 979FC60C-8633-430F-AB66-D324B8D31355`로 iPad Pro 11형(iOS 26.5)의 development build를 컴파일·설치·실행했다. 두 태블릿에서 가로 첫 화면과 재실행을 확인했다. 이 기기 ID는 해당 Mac의 시뮬레이터 식별자다. 이는 로컬 빌드 증거이며 CI 빌드나 실기기·실서버 검증 증거는 아니다. 최종 공유용 재현 명령·결과는 5단계 README·PR 검증란에 남긴다.
- [x] 4단계에서 `git status --short --branch`와 159·부모 121의 최신 AC를 대조했다. SDK 57용 Jest 29 계열·RNTL·renderer의 peer 관계와 실제 최소 테스트를 확인하고, `package.json`·lockfile에 `lint`·`typecheck`·`test` 스크립트를 구성했다. ESLint가 루트 앱·진입점·테스트 파일을 검사하는지도 확인했다. 별도 Jest setup 파일은 필요하지 않았다.
- [x] 4단계 의존성 변경 후 `npm ci`, `npx expo install --check`, `npm run lint`, `npm run typecheck`, `CI=true npm run test`를 로컬에서 다시 실행했다. 3단계의 설치·TypeScript 검사 결과를 새 lockfile의 통과 증거로 재사용하지 않았다. 테스트 0개는 종료 코드 1로 실패하며, 공통 `build` 스크립트가 없는 이유를 아래에 기록했다.
- [x] 5단계에서 `.github/workflows/ci.yml`과 README를 맞췄다. 필수 파일·스크립트 누락, 테스트 0개, Android/iOS JS export 또는 네이티브 빌드 실패가 `frontend-quality`를 실패시키도록 구성했다. 로컬 설치·JS 검사·양 플랫폼 export와 CI 결과 집계 실패 사례를 실행했다. 당시 원격 CI는 미검증이었다.
- [x] 6단계에서 SCRUM-159 파일만 커밋·PR에 올렸고, 커밋 `8b38209`의 JS·Android·iOS job, 최종 `frontend-quality`, 제목·Jira 키 검사를 확인했다. 첫 온라인 Expo 실패는 패치 갱신으로 해결했고 요구 검사를 낮추지 않았다.
- [x] 159의 최신 필수 CI·GPT 리뷰·화면 증빙·대화 해결 후 PR #29를 squash 병합했고 Jira MERGED·완료를 확인했다.
- [x] 160의 환경/경로 구현과 PR #30 병합을 확인했다. 161에서 모드 구현·해당 테스트를 작성했고 설치·양 플랫폼 번들·네이티브 빌드·태블릿 실행을 로컬에서 재현했다. 이후 부모 선행에 따라 아래 기능별 표를 한 Subtask씩 따른다.

### SCRUM-165 착수 전 Expo 호환성 보정 — 2026-10-25

- SCRUM-165의 기준 검사에서 온라인 `npx --no-install expo install --check`가 설치된 Expo `57.0.30` 대신 `~57.0.31`을 요구하며 종료 코드 1로 실패했다. 공식 SDK 57 메타데이터와 npm 패키지를 확인한 뒤 Expo를 `57.0.31`로 고정하고 lockfile을 갱신했다. React `19.2.3`·React Native `0.86.3`은 유지했고 검사 제외·오프라인 우회는 적용하지 않았다.
- Node `24.20.0`·npm `11.19.0`에서 갱신한 lockfile로 `npm ci`를 재현했다. manifest 검사, 온라인 Expo 호환성 검사, `npm run lint`, `npm run typecheck`, `npm run test`의 **4개 suite·58개 테스트**, `npm run test:env`의 **Android/iOS 14개 조합**이 통과했다. `npx --no-install expo export --platform android`와 `--platform ios`도 각각 임시 출력 경로에서 성공했다.
- Expo Modules Core·JSI 등 네이티브 의존성도 갱신돼 전용 worktree에 `npx --no-install expo prebuild --no-install`로 새 네이티브 프로젝트를 생성했다. 생성 과정에서 추적 설정 파일의 추가 변경은 없었다. JDK 17·SDK 36의 `./gradlew :app:assembleDebug --no-daemon`은 `BUILD SUCCESSFUL`, CocoaPods `1.16.2`의 `pod install` 후 Xcode `26.6`의 `xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/scrum165-expo31-derived-data CODE_SIGNING_ALLOWED=NO build`는 `BUILD SUCCEEDED`였다.
- 이번 결과는 착수 전 로컬 호환성 보정이다. 세션·CSRF 기능 구현, 새 빌드의 기기 실행·쿠키 왕복, 원격 CI·PR 병합·Jira 완료 또는 SCRUM-129의 실제 서버 연동 검증을 뜻하지 않는다. 설치 감사의 high 5건은 남아 있으며 강제 의존성 보정은 수행하지 않았다.

### SCRUM-165 2단계 — 초기 세션·CSRF 공통 요청 · 2026-10-25

- `client.ts`·`csrf.ts`에 API 목적지 제한, 쿠키 포함·no-store·redirect 거절 설정, 최초 CSRF 발급·메모리 재사용·동시 발급 공유와 실패 전달을 구현했다. caller의 인증·CSRF 헤더 덮어쓰기를 거절하며 본문·Content-Type을 임의 생성하지 않는다. 기존 `/auth/me` 예제도 공통 client를 거치고 real 모드 시작 시 무요청 동작을 유지한다.
- 초기 계약 테스트47개의 실패를 확인한 뒤 구현했고, 예제 연결 테스트2개의 실패를 확인한 뒤 연결했다. CSRF 대기 중 caller가 요청 객체를 바꿨을 때 method가 달라지는 추가 실패를 재현한 뒤 method·path·body를 대기 전에 고정했다. 민감값의 URL·결과·콘솔 비노출과 서버 requestId의 UUID 형식도 검증한다.
- Node `24.20.0`·npm `11.19.0`에서 전체 Jest **5개 suite·113개 테스트**, lint·typecheck, 공개 환경 주입 **14개 조합**, Android/iOS JS export가 통과했다. React Native가 사용하는 `whatwg-fetch`의 Headers로 개행·제어문자 등이 통과하는 실패5개를 재현하고 명시적 값 검증을 추가해 해결했다. 의존성·네이티브 설정 변경이 없어 설치·네이티브 컴파일은 이번 단계에서 반복하지 않았다.
- 로그인·로그아웃 뒤 갱신·인증 변경 경계는4단계, 양 OS의 실제 쿠키·redirect 동작은3단계, 인증 전환 경합의 기기 검증은5단계다. 이번 단위 테스트를 해당 기기 검증이나 SCRUM-129의 서버 연동 성공으로 보고하지 않는다. 원격 CI·PR·Jira 변경은 수행하지 않았다.

### SCRUM-165 3-A — 네이티브 정상 발급·쿠키 왕복 · 2026-10-25

- `scripts/native-session/probe.tsx`는 일반 `index.ts`에서 import하지 않는 개발 전용 Metro 진입점이다. `receiver.mjs`는 `127.0.0.1:48591`에만 바인딩하며 합성 세션·CSRF 값은 메모리에만 둔다. 개인 환경 파일, 제품 `client.ts`·`csrf.ts`, 의존성·네이티브 설정은 변경하지 않았다.
- Node `24.20.0`·npm `11.19.0`, Expo `57.0.31`·React Native `0.86.3`을 사용했다. 앞 단계에서 빌드한 APK/iOS Simulator 앱을 데이터 초기화 없이 갱신 설치했다. Android Pixel Tablet API 36과 iPad Pro 11형 M5/iOS 26.5에서 실제 앱으로 실행했다.
- 명시적 준비 사례와 사전 준비 없는 최초 POST 사례는 새 client·새 합성 값으로 분리한다. 각 사례 초기화 전에 수신 횟수를 별도 보존하며, 쿠키는 시험 경로에만 한정한다. 관측 함수는 기본 global fetch에 URL·RequestInit을 그대로 넘기고 Response도 그대로 반환한다. 원문 URL·쿠키·토큰·본문 대신 HTTP 상태·URL 일치 boolean·횟수만 기록한다.

| 검증 | Android API 36 | iOS 26.5 |
| --- | --- | --- |
| 로컬 수신자에 앱 내부 직접 접근 | 통과 | 통과 |
| client 생성 직후 API 요청 | 0회 | 0회 |
| 명시적 CSRF 준비 후 GET | CSRF 1회·GET 1회·POST 0회, 준비 성공·쿠키 일치 | 동일 |
| 새 client의 최초 POST | CSRF 1회·POST 1회, HTTP 200·쿠키/CSRF 발급 조합 일치 | 동일 |
| 일반 App 복귀·real 모드 시작 | 화면 및 수신자 API 요청 0회 확인 | 동일 |

- 검토 때 제기한 `whatwg-fetch`의 `no-store` cache-buster와 엄격한 URL 비교 충돌은 두 OS에서 재현되지 않았다. 요청 URL과 응답 URL이 일치했고 `_` query는 없었다. Expo SDK 57은 기본적으로 global fetch를 자체 네이티브 구현으로 교체한다(`expo/src/winter/runtime.native.ts`). `EXPO_PUBLIC_USE_RN_FETCH` 미설정인 이번 결과를 RN fetch를 명시적으로 선택한 환경에 확대하지 않는다. `_` 부재는 캐시 정책 전체 준수의 증거가 아니다.
- 생성된 Android 개발 앱에는 `exp+dodamdodam` scheme이 등록돼 있었고 앱 식별자 scheme은 등록돼 있지 않았다. iOS는 두 scheme이 등록돼 있었다. 검증에는 양 OS 공통 개발 scheme을 사용했다. 이는 OAuth 복귀 URI 확정이나 `resolveOAuthConfig()`의 허용 규칙 변경이 아니다. 실제 등록 차이는 SCRUM-129 연동 때 다시 대조한다.
- 진단 관찰 상한은 20초, 제어·정리·보고 요청 상한은 3초다. 모두 시험용 값이며 운영 timeout 정책이 아니다. 관찰 상한 이후 새 API 전송을 차단하고, 진행 중인 전송이 남으면 정리 성공으로 표시하지 않는다. 두 OS의 정상 사례에서는 상한에 도달하지 않았다.
- 시험 종료 때 해당 합성 쿠키만 만료시키는 응답을 200으로 수신했다. 실제 삭제·실패·동시성·리디렉션 동작은 3-B에서 검증하며, 만료 응답 수신을 삭제 검증 통과로 확대하지 않는다. 3-B·4단계 인증 전환·5단계 경합은 미착수다. HTTP loopback 결과는 운영 HTTPS의 Secure/Domain/SameSite, OAuth 쿠키 공유, 실제 서버 SCRUM-129 성공을 뜻하지 않는다.

- 최종 로컬 검사: 온라인 `expo install --check`, `npm run lint`, `npm run typecheck`, 전체 Jest **5 suite·113 tests**, `npm run test:env` **14개 조합**, 일반 앱 Android/iOS export가 통과했다. 수신자 프로토콜 사전 검사와 알 수 없는 입력 필드의 로그 제외 검사도 통과했다. 의존성·네이티브 설정 변경이 없어 설치·네이티브 컴파일은 반복하지 않았다. 일반 앱으로 복귀한 뒤 이 작업의 앱·기기·서버·adb reverse를 종료했으며 원격 CI·PR·Jira 변경은 하지 않았다.

재현은 전용 작업 공간에서 다음 순서로 수행한다. 같은 Metro에서 두 플랫폼을 동시에 실행하지 않고 이전 플랫폼의 앱·서버를 종료한 뒤 다음 플랫폼을 실행한다. 진단 후에는 개발 클라이언트를 일반 Metro URL로 열어 기존 App으로 복귀시킨다.

```bash
# 프로젝트 지정 Node 24.20.0 PATH를 먼저 적용한다.
node scripts/native-session/receiver.mjs
# 별도 터미널: 개인 .env를 읽지 않는 IPv4 루프백 Metro
NODE_OPTIONS=--dns-result-order=ipv4first EXPO_NO_DOTENV=1 npx --no-install expo start --dev-client --localhost --port 8082
```

- Android: `adb reverse tcp:8082 tcp:8082` 후 개발 클라이언트의 `url` 인자에 `http://127.0.0.1:8082/scripts/native-session/probe.bundle?platform=android&dev=true&minify=false&modulesOnly=false&runModule=true`를 URL 인코딩해 전달한다.
- iOS: 동일 경로의 `platform=ios` URL을 인코딩해 `xcrun simctl openurl <시험 UDID> 'exp+dodamdodam://expo-development-client/?url=<인코딩한 URL>'`로 전달한다. Android도 같은 개발 scheme을 사용하며 `adb shell am start`의 VIEW intent로 연다.
- 일반 앱 복귀 URL은 진단 bundle 경로가 없는 `http://127.0.0.1:8082`다. real 모드 복귀 검증에 사용한 API 주소는 로컬 시험 수신자의 별도 경로이며 프로세스 환경에만 공급했다. 수신자 집계·화면·실행 결과는 로컬 임시 증빙에 보관하며 합성 값 원문은 포함하지 않는다.

### SCRUM-165 3-B — 네이티브 경계 검증·Android 중복 POST 재현 · 2026-10-25

아래는 수정 전 체크포인트다. 실패는 그대로 보존하며, 현재 해결 결과와 재현 명령은 이어지는 **Android 중복 POST 보완** 기록을 따른다.

- 사용자 승인 범위는 3-B 검증까지다. 제품 `client.ts`·`csrf.ts`, 일반 앱 진입점, 개인 환경 파일, 패키지·네이티브 설정은 바꾸지 않았다. 기존 `receiver.mjs`를 확장하고 별도 개발 진입점 `scripts/native-session/cases.tsx`를 추가했다. 합성 값만 사용하며 일반 앱에서는 두 진단 진입점을 import하지 않는다.
- 3-A와 같은 Expo `57.0.31`·React Native `0.86.3` 기본 fetch, Android Pixel Tablet/API 36, iPad Pro 11형 M5/iOS 26.5 개발 빌드를 재사용했다. 두 플랫폼은 별도로 실행했다. 기본 행렬은 각 OS **20개, 합계 40개 사례**가 통과했다. GET의 전송 계층 재시도 관측으로 추가한 POST 연결 손실 사례는 Android 실패·iOS 통과였다. 최종 **42개 고유 검사 중 41개 통과·1개 실패**이며, Android POST 중복 방지 미충족으로 다음 기능 단계 진입을 보류한다.

| 사례 | 양 OS의 실제 결과 |
| --- | --- |
| 연속 POST | CSRF GET 1회·POST 2회, 두 POST의 세션/토큰 조합 일치 |
| 동시 최초 POST | 서버 latch 해제 전 CSRF 1회·POST 0회·두 호출 미완료, 해제 후 CSRF 1회·POST 2회·두 조합 일치 |
| CSRF HTTP 401·403·429·503 | 각 사례 JS fetch 1회·수신 GET 1회·POST 0회, 해당 HTTP 상태의 실패 전달 |
| CSRF 잘못된 JSON | `invalid_response`, POST 0회 |
| CSRF 소켓 단절 | `network`, JS fetch 호출 1회·수신 GET 3회·POST 0회 |
| POST 본문 수신 직후 소켓 단절 추가 검사 | Android: JS POST 호출 1회인데 수신 POST 2회·28바이트로 실패. iOS: POST 1회·14바이트로 통과. 둘 다 `transport_error` |
| 합성 쿠키 만료 | 만료 전 이름 존재, 만료 응답 후 Set-Cookie 없는 GET에서 이름 부재. CSRF 추가 발급·POST 없음 |
| CSRF 302 + Set-Cookie | 준비 실패로 POST 0회·redirect 목적지 0회. 후속 GET에서 302가 발급한 합성 쿠키는 존재 |
| POST 301·302·303·307·308, 각 same/cross origin | 원래 POST 1회·쿠키/CSRF 일치·합성 본문 14바이트 확인 후 `transport_error`. 두 목적지에 대한 직접 접근 대조는 성공했고 실제 redirect 수신은 0회 |

- **당시 차단 사항:** 합성 POST 본문을 전부 받은 뒤 응답 없이 소켓을 끊는 조건에서 Android의 중복 POST를 재현했다. JS 전송 함수 호출은 CSRF GET 1회 + POST 1회였지만 서버의 POST 수신은 2회였고 두 조합과 총 28바이트를 확인했다. iOS 동일 조건은 POST 1회였다. 제품 코드는 고치지 않았으며 재전송 정책 보완 승인 전 4단계로 진행하지 않는다. 기존 40개 행렬 통과나 Jest 통과로 이 실패를 덮지 않는다.
- JS `RequestInit`에는 현재 native retry 설정이 없다. 읽기 전용 조사상 Expo client 생성 전에 RN 공개 `OkHttpClientProvider.setOkHttpClientFactory()`를 등록하는 조정 접점은 있다. `retryOnConnectionFailure(false)`나 POST body의 `isOneShot()` 처리는 후속 수정 후보이며, 다른 요청·쿠키 jar·503/421 follow-up 영향과 지속 가능한 Expo prebuild 반영을 확인해야 한다. 이번에는 적용하거나 해결됐다고 판단하지 않았다. JS 재호출 방지·사후 Abort·미확정 `clientRequestId` 추가로 해결했다고 보지 않는다.
- 소켓 단절의 수신 GET 3회는 FE에서 fetch를 세 번 호출한 결과가 아니다. 관측한 네이티브 전송 계층의 재시도와 FE의 실패 POST 자동 재실행을 구분한다. 3회가 운영 재시도 정책이나 상한이라는 뜻이 아니며, 401·403·429·503 응답을 일괄 재시도하도록 구현하지 않았다.
- `redirect: error`로 이동을 거절해도 최초 응답의 `Set-Cookie`가 적용될 수 있음을 두 OS에서 확인했다. 이것을 이동 차단 실패나 임의의 쿠키 롤백 요구로 해석하지 않는다. 4단계 인증 전환 설계와 5단계 경합 검증에서는 JS 준비 실패만으로 OS 쿠키가 그대로라고 가정하면 안 된다.
- 두 수신 포트 `48591`·`48592`는 모두 `127.0.0.1`에만 바인딩한다. 포트 변경은 다른 origin 시험이며 다른 cookie host/Domain/SameSite 격리 증거가 아니다. 이번 결과는 HTTP loopback의 해당 개발 빌드와 시험한 응답에 한정하며 운영 HTTPS·다른 호스트·OAuth 쿠키 공유·SCRUM-129 실제 BE 연동 검증을 대신하지 않는다.
- 리디렉션은 기존 대표 302/307 확인과 함께 같은 fixture로 301/303/308도 매개변수 대조했다. 상태 코드별 목적지 직접 접근과 실제 redirect 요청을 별도 집계하며, 수신자에는 쿠키·토큰·본문 원문 대신 enum·boolean·횟수·길이만 기록한다. HTTP 오류 fixture는 발급 실패 전달 시험이며 업무 `error.code`별 의미·복구 정책 검증은167에 남긴다.
- 각 사례는 새 client와 고유 쿠키 경로로 시작한다. 사례 관찰 상한 15초, 제어·정리·보고 요청 상한 3초는 진단용 값이며 제품 timeout 계약이 아니다. 상한 후 새 API 전송은 차단하고, 미결 전송이 있으면 정리 성공으로 판정하지 않는다. 기본 40개와 추가 2개 검사 모두 상한에 도달하지 않았다.
- 독립 진단 코드 검토에서 쿠키 관측 GET 성공 확인, 원래 POST의 조합·본문 길이 확인, 시간 초과 뒤 늦은 PASS 변경 방지를 보완한 뒤 최종 기기 시험을 다시 실행했다. 수정은 진단 코드에만 한정했다.
- 최종 lint·typecheck, 전체 Jest **5 suite·113 tests**, 환경 주입 **14개 조합**, 온라인 Expo 호환성 검사와 일반 앱 Android/iOS export가 통과했다. 수신자의 latch·오류·목적지 사전 검사 및 보고 필드 allowlist 검사도 통과했다. 설치·네이티브 재컴파일은 변경이 없어 반복하지 않았다. 양 OS에서 진단 bundle 대신 기존 App 진입점으로 복귀한 화면을 확인하고, 이 작업이 실행한 앱·기기·Metro·두 수신 포트·adb reverse를 종료했다. 복귀 실행은 개인 환경 파일을 읽지 않는 조건이므로 환경 미설정 안내가 정상 표시됐다. real 모드 시작 무요청 회귀는 기존 Jest에서 재확인했다.

재현은 3-A의 명령을 재사용하고 bundle 경로만 `scripts/native-session/cases.bundle`로 바꾼다. 이 체크포인트의 기본 실행은 21개 사례이며 `post-loss`를 마지막에 포함했다. 현재 기본 행렬은 아래 보완에서 26개로 확장했다. 연결 손실 사례만 확인하려면 Metro 프로세스에 진단 전용 `EXPO_PUBLIC_NATIVE_PROBE_CASE=post-loss`를 공급한다. 개인 환경 파일이나 제품 환경 설정에는 이 선택자를 추가하지 않는다. 수신자는 두 포트를 모두 제공한다. 앱 화면에는 사례별 PASS/FAIL만 표시하며, 실패 시 해당 OS의 나머지 사례는 자동 실행하지 않는다. 실제 결과 기록은 기존 작업 기록과 로컬 임시 증빙에 두고 별도 Subtask 문서를 만들지 않는다. 4단계 인증 갱신·5단계 인증 전환 경합은 아직 미착수이며 원격 CI·PR·Jira 변경은 하지 않았다.

### SCRUM-165 Android 중복 POST 보완 — 2026-10-25

- 사용자가 실패 수정을 승인해 이 보완 단계만 진행했다. 4단계 인증 갱신은 아직 미착수다. 수정 전 Android에서 기존 연결 손실 POST가 2회·28바이트 수신됐고, 추가한 `503 + Retry-After: 0`도 JS POST 1회인데 수신 POST 2회·28바이트로 실패했다. 이 기대값을 바꾸거나 실패를 제외하지 않았다.
- 실제 Gradle dependency insight에서 해석된 OkHttp **4.12.0**과 RN/Expo의 공개 client factory 연결을 확인했다. `plugins/withSingleUsePost.js`를 `app.json`에 등록하고, Kotlin `MainApplication.super.onCreate()` 직후·`loadReactNative()` 전에 factory를 설치한다. application interceptor에서 POST body만 `isOneShot=true`로 감싸며 `contentType`·`contentLength`·`writeTo`·`isDuplex`는 원래 body로 위임한다. `client.ts`·`csrf.ts`는 수정하지 않았다.
- factory는 요청마다가 아니라 client 생성마다 기본 context builder로 새 client를 만든다. Expo의 쿠키 bridge·timeout을 유지하고 GET 재시도 설정은 바꾸지 않는다. 적용 범위는 이 factory를 사용하는 **Android RN/Expo POST 전체**이며 특정 운영 주소를 가정하지 않는다. RN의 context 없는 client 생성 경로에도 context builder의 HTTP cache가 추가될 수 있지만, Expo는 기존에도 context builder를 사용했다. 전역 `retryOnConnectionFailure(false)`·fetch 교체·`node_modules` 수정·새 의존성은 적용하지 않았다.
- 실제 Expo MainApplication mod의 등록 순서·반복 적용·지원하지 않는 Java/초기화 템플릿 거절을 검사하는 4개 Jest 테스트를 먼저 실패시킨 뒤 구현해 통과시켰다. 실제 `CI=1 EXPO_NO_DOTENV=1 npx --no-install expo prebuild --platform android --no-install`도 두 번 실행해 생성된 MainApplication이 byte 단위로 같고 factory가 한 번만 등록됨을 확인했다. 이전에 보존한 네이티브 소스 18개 중 MainApplication만 달라졌다. 생성된 네이티브 파일은 추적하지 않는다.
- `receiver.mjs`·`cases.tsx`에 빈 본문·JSON·바이너리·multipart의 연결 손실과 `503 + Retry-After: 0`을 추가했다. 본문은 합성 값이며 원문 대신 일치 boolean·수신 횟수·길이만 보고한다. multipart는 실제 boundary와 필드 내용으로 비교하며 특정 길이를 통과 조건으로 고정하지 않는다.

| 수정 후 실제 네이티브 검사 | Android API 36 | iOS 26.5 |
| --- | --- | --- |
| 전체 행렬 | 26/26 통과 | 26/26 통과 |
| 기존 POST 연결 손실 | 수신 POST 1회·14바이트, `transport_error` | 동일 |
| 빈 본문·JSON·바이너리 연결 손실 | 각 POST 1회·0/21/4바이트, 본문 일치 | 동일 |
| multipart 연결 손실 | POST 1회·본문/헤더 boundary 일치, 관측 151바이트 | 동일 |
| POST `503 + Retry-After: 0` | POST 1회·14바이트, 503 응답 그대로 전달 | 동일 |
| 기존 쿠키·CSRF·동시 최초 발급·만료·이동 차단 | 전부 통과 | 전부 통과 |
| CSRF GET 소켓 단절 | JS fetch 1회·수신 GET 3회·POST 0회 | 동일 |

- Android는 수정 APK를 다시 빌드해 `adb install -r`로 데이터 보존 설치한 뒤 시험했다. iOS는 같은 SDK의 기존 native runtime과 새 진단 JS로 회귀했고 iOS native 코드·정책은 변경하지 않았다. 양 플랫폼의 실제 global Expo fetch를 사용했으며 우회 전송 구현을 넣지 않았다. 모든 사례에서 정리 완료·redirect 실제 목적지 수신 0회를 확인했다. CSRF 302의 Set-Cookie 적용 관측도 그대로 유지된다.
- Node **24.20.0**·npm **11.19.0**에서 `npm run lint`, `npm run typecheck`, 전체 Jest **6 suite·117 tests**, `npm run test:env` **14개 조합**, 온라인 `expo install --check`, 일반 앱 Android/iOS export가 통과했다. Android JDK 17·SDK 36의 `./gradlew :app:assembleDebug --no-daemon --console=plain`은 `BUILD SUCCESSFUL`, iOS Simulator의 `xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/scrum165-repair-ios-derived-data CODE_SIGNING_ALLOWED=NO build`는 `BUILD SUCCEEDED`였다. 새 의존성이 없어 npm 설치는 반복하지 않았다. 독립 코드 검토에서 수정이 필요한 P1/P2 지적은 없었다. 원격 CI는 이번 커밋에서 실행하지 않았다.
- 현재 재현은 3-A의 수신자·Metro 명령과 `scripts/native-session/cases.bundle` 진입점을 사용한다. Android는 먼저 위 prebuild와 앱 재빌드·설치가 필요하다. 선택자 없이 OS별 26개를 실행하고, 한 사례만 보려면 Metro 프로세스에 `EXPO_PUBLIC_NATIVE_PROBE_CASE=post503-zero` 또는 알려진 사례명을 공급한다. 개인 `.env`·제품 설정에는 추가하지 않는다. 증빙은 로컬 임시 파일 `native-results-green.json`의 52개 고유 결과와 빌드 로그에 보관한다.
- 이 보완은 **본문이 전송된 POST의 네이티브 재전송 차단**이다. 전송 시작 전 연결 경로 재시도까지 금지하거나 서버 업무의 exactly-once 처리를 보장하지 않는다. 연결 손실은 계속 `transport_error`이며 성공·`not_sent`로 바꾸거나 자동 재실행하지 않는다. 4단계 인증 전환·5단계 기기 경합, SCRUM-129 실제 BE·HTTPS·OAuth 통합 검증은 남아 있다. 양 OS를 진단 bundle에서 일반 App 화면으로 복귀시켰고, 개인 환경 파일을 읽지 않아 환경 미설정 안내가 정상 표시됐다. 이 작업의 앱·시뮬레이터·Metro·두 수신 포트·adb reverse를 종료했다. 기존 작업 공간·개인 변경을 보존하고 push·PR·병합·Jira 변경은 하지 않았다.

### SCRUM-165 4단계 — 인증 전환·로그인/로그아웃 뒤 CSRF 갱신 · 2026-10-25

- 이 단계의 시작점은 로컬 `4246f65`다. 원격 FE development는 `6bddb664069884543e7968209c579c722dddedf7`, BE development는 `752e7ebca2a758f57970f36fdafa3cac2d2851d2`로 재확인했다. Jira165는 고영준·해야 할 일로 기존 AC와 같았다. 기존 3개 작업 공간의 HEAD·브랜치·status·변경 파일 SHA-256을 보존했다. PR·push·병합·Jira 변경은 하지 않았다.
- 적용 근거는 BE [`Integrated_OpenAPI.yaml`](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/docs/p0/Integrated_OpenAPI.yaml)의 **API 문서 `info.version=3.1.0`·OpenAPI 규격 `openapi=3.0.3`**, [`01-common.md` §3·§5.1](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/docs/p0/api/01-common.md), [`02-auth.md` §6.1·6.5·6.7](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/docs/p0/api/02-auth.md), [`DEVELOPMENT_SETUP.md` §10.2·10.4·10.5](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/docs/DEVELOPMENT_SETUP.md#L483-L597)다. 로그인 503은 이전 권한 폐기 등 일부 부작용 뒤 발생할 수 있으므로 모든 비-2xx를 세션 유지로 처리하지 않는다. 현재 BE의 이메일 로그인·API logout은 후속 구현이며 기본 `/logout` 302를 계약상 `/api/v1/auth/logout` 204로 대신하지 않았다.
- `client.ts`에 `authTransition(request, classify)`를 추가했다. 125의 classifier가 복제된 응답을 `changed/unchanged/csrf_invalid/unknown`으로 판정하고 공통 계층은 그 판정의 CSRF 처리만 수행한다. 원래 Response·인증 결과와 CSRF 갱신 성공/실패를 분리한다. 업무 DTO·오류 의미를 이 계층에 새로 정의하지 않았고 실제 화면·로그인 상태 연결도125에 남겼다. 일반 `request()`의 업무 응답에 이 수명주기를 자동 적용하지 않는다.
- 공통 계층은 인증 전환 시작 즉시 gate와 세대를 갱신하고 기존 CSRF 발급을 drain한 뒤 내부 인증 POST를 보낸다. 공개 bypass는 없고, 주소·헤더·본문·CSRF 설정을 기존 공통 경로로 검증한다. 전환 중 일반 GET/POST·준비·중첩 인증은 대기열 없이 반환하고, 초기 CSRF 대기 중 세대를 가로지른 POST도 보내지 않는다. 이미 보낸 요청의 늦은 응답은 `stale_response`이며 `not_sent`나 자동 재실행 대상으로 표시하지 않는다.
- 성공/CSRF_INVALID 뒤에는 이전 token 준비를 비우고 GET 완료까지 gate를 유지한다. 갱신 실패 시에도 원래 인증 결과는 유지하고 이전 token을 복구하지 않는다. 확정 세션·CSRF 유지 실패만 `unchanged`로 처리한다. 전송 실패·취소 후 전송 결과 불명·판정 예외·잘못된 판정은 `unknown`으로 token 준비를 해제한다. gate는 `finally`로 해제한다. 이후 명시적 새 준비/요청은 가능하나 실패했던 POST를 자동 반복하지 않는다.
- `ApiRequest.signal`을 추가했다. 전송 전 취소는 미전송으로, 실제 fetch 호출 뒤 실패는 처리 여부 불명의 `transport_error`로 전달한다. 공유 CSRF GET 중 취소는 그 호출의 대기/listener만 해제하며 발급 자체는 취소하지 않는다. 다음 인증은 남아 있는 발급을 먼저 drain한다. 운영 timeout·동작 모드·새 BE 필드·의존성·네이티브 설정은 추가하지 않았다.

| 4단계 테스트 응답 검증 | 기대 결과·실제 결과 |
| --- | --- |
| 로그인 성공 / 로그아웃 204 | 새 CSRF 적용, logout 본문·Content-Type 자동 생성 없음, 원래 응답 재독해 가능 |
| 확정 LOGIN_FAILED / CSRF_INVALID | 전자는 기존 준비 유지, 후자는 갱신하되 실패 POST 반복 없음 |
| 갱신 HTTP·network·invalid JSON 실패 | 인증 결과 유지·실패 전달·이전 token 미복구. 후속 명시적 요청의 재준비도 실패하면 POST 미전송 |
| auth 503 unknown·통신 실패·판정 예외/미정의 판정 | 인증 실패로 추측하지 않음·이전 token 준비 해제·gate 해제 |
| 중첩 인증·전환 중 요청·기존 CSRF 대기 | 자동 queue 없음·CSRF 선행 drain·이전 세대 POST 미전송 |
| 이미 보낸 GET/POST의 늦은 응답 | `stale_response`, 실제 전송을 미전송으로 표시하지 않음 |
| 전송 전/중 취소·공유 GET 대기 취소 | 미전송/unknown 구분, 취소 대기 즉시 해제, 다음 인증도 기존 GET drain |
| 주소·보안 헤더·민감값 | 기존 검증 유지, token·비밀번호·PIN·예외 원문 URL/결과/콘솔 복사 없음 |

- 새 인증 테스트 30개를 기능 부재로 실패시킨 뒤 구현해 통과시켰다. 이어 공유 CSRF 대기 중 취소 반환이 늦는 경우를 테스트 2개에서 재현했다(기존 1개 강화·1개 추가, 29통과·2실패). 대기만 취소하도록 고친 뒤 최종 인증 **31개**, 전체 Jest **7 suite·148 tests**가 통과했다. 테스트의 1초 상한은 취소 반환 확인용이며 운영 timeout이 아니다. 타입 검사 초기에 테스트의 readonly table/async 반환 타입 표기 2곳을 수정했으며 기대값은 낮추지 않았다.
- 최종 `npm test` **7 suite·148 tests**, `npm run typecheck`, `npm run lint`, `npm run test:env` **14개 조합**, 온라인 `expo install --check`, 일반 App 진입점 Android/iOS JS export가 모두 통과했다. 기존 CI는 전체 Jest를 발견·실행하므로 새 테스트가 포함되며, 이번 커밋의 원격 CI는 실행하지 않는다. 네이티브 의존성·설정 변경이 없어 설치·Gradle/Xcode 재컴파일은 반복하지 않는다.
- 독립 소스 검토에서 확정 P1/P2는 없었다. 취소 대기 보완은 추가 RED→GREEN으로 검증했다. 5단계에서는 실제 OS 쿠키·Abort 이후 종료·지연 CSRF·인증 경합을 확인해야 한다. JS 응답 폐기는 OS Set-Cookie 원복을 뜻하지 않는다. 같은 쿠키 문맥의 client 재사용, 이미 반환한 응답의 화면 반영과 실제 classifier는125/167 연결 시 확인한다. OAuth 외부 복귀126/129, 실서버·HTTPS 연동129는 이번 단계의 성공으로 보고하지 않는다.

### SCRUM-165 5단계 — 네이티브 인증·쿠키 경합 및 일반 응답 drain 보완 · 2026-10-25

- 시작 HEAD는 `54e4d39221bf21e495d29be5f92d46ac4dedf0bd`, 원격 FE development는 `6bddb664069884543e7968209c579c722dddedf7`로 확인했다. Jira165는 담당 고영준·해야 할 일·기존 AC와 같았다. 기존 3개 작업 공간의 HEAD·브랜치·status·변경 파일 SHA-256을 보존한다. 이번 승인 범위는5단계이며6단계·push·PR·병합·Jira 변경은 포함하지 않는다.
- `auth.tsx`는 일반 앱에서 import하지 않는 개발 전용 진입점이다. 기존 `receiver.mjs`에 독립된 `authReceiver.js`를 연결했다. 실제 Expo `57.0.31`·RN `0.86.3` global fetch로 Android Pixel Tablet/API36 및 iPad Pro 11형 M5/iOS26.5 시뮬레이터를 각각 검증했다. Android는 재전송 보완 APK를 `adb install -r`, iOS는 같은 SDK의 기존 개발 앱을 데이터 초기화 없이 설치했다. 개인 `.env`·일반 진입점·패키지·네이티브 설정은 바꾸지 않았다.
- body `synthetic-auth`·응답의 `synthetic` 표시는 수신자 전용 합성 데이터이며 실제 로그인 DTO가 아니다. classifier는 시험 응답만 판정한다. 실제 이메일 로그인/API logout은 BE에서 아직 후속 구현이고, 로그인 결과·화면 연결125, 일반 오류167, 실제 BE/HTTPS129·OAuth126/129의 완료를 뜻하지 않는다.

**발견한 경합과 수정**

- 최초 인증24개/OS와 기존26개/OS의100개 행렬은 통과했지만, 최종 BE 대조에서 일반 POST의403도 쿠키를 발급할 수 있음을 확인해2개/OS를 추가했다. [BE SecurityConfig](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/src/main/java/com/dodamdodam/backend/global/config/SecurityConfig.java#L71-L74)·[개발환경 §10.4](https://github.com/DodamDodam-Capstone/backend/blob/752e7ebca2a758f57970f36fdafa3cac2d2851d2/docs/DEVELOPMENT_SETUP.md#L545-L548), Spring Security7.1.1의 [CsrfFilter](https://github.com/spring-projects/spring-security/blob/7.1.1/web/src/main/java/org/springframework/security/web/csrf/CsrfFilter.java#L121-L132)·[RepositoryDeferredCsrfToken](https://github.com/spring-projects/spring-security/blob/7.1.1/web/src/main/java/org/springframework/security/web/csrf/RepositoryDeferredCsrfToken.java#L66-L70)·[CookieCsrfTokenRepository](https://github.com/spring-projects/spring-security/blob/7.1.1/web/src/main/java/org/springframework/security/web/csrf/CookieCsrfTokenRepository.java#L93-L140)를 대조했다. CSRF 쿠키가 없거나 비었을 때 새 token 저장 후403이 나올 수 있으며, nonempty cookie와 헤더의 단순 mismatch가 언제나 새 쿠키를 발급하는 것은 아니다.
- `late-csrf`는 세션·CSRF의 합성 쿠키를 구분한다. 초기 발급 뒤 CSRF 쿠키만 만료시키고, 일반 POST의403 응답과 그 쿠키를 보류한다. 수정 전 Android에서 auth/refresh가 먼저 끝난 뒤 이전403 쿠키가 도착해 다음 POST의 헤더·쿠키가 불일치하는 실패를 재현했다. auth1회·old1회·POST1회였고, `refresh.ok=true`여도 최종 조합이 틀렸다. raw 실패 증빙은 로컬 `native-ordinary-red.json`에 보존한다.
- `client.ts`는 일반 요청의 진행 중 Promise를 private Set으로 추적하고 `finally`에서 제거한다. 인증 gate를 설정한 뒤 기존 일반 요청과 CSRF 발급을 함께 기다리고 내부 auth POST를 전송한다. auth 자체는 Set에 넣지 않아 자기 대기가 없다. 이미 보낸 이전 응답은 계속 `stale_response`로 전달한다. 원래 요청을 강제 취소하지 않으며 인증 대기만 취소해도 다음 인증은 남은 요청을 먼저 기다린다. 느린 일반 응답은 인증 전송을 지연시킬 수 있다. 이를 숨기려고 미확정 운영 timeout을 추가하지 않았다.
- 기존 stale GET/POST 사례도 `인증 intent → 이전 응답 완료 → auth 전송` 순서를 확인하도록 바꿨다. 세대가 달라진 응답은 폐기하며, 이전 응답이 끝나기 전에 인증 완료를 요구하는 fixture 교착은 만들지 않는다. native 실패를 바탕으로 일반 응답 drain 테스트2개를 먼저 실패시킨 뒤 수정했고, fixture의 추가 cookie 관측 테스트도 실패→통과로 확인했다.

| 최종 실제 네이티브 검사 | Android API36 | iOS26.5 |
| --- | --- | --- |
| 인증 행렬 + 기존 회귀 | 26 + 26, 52/52 통과 | 26 + 26, 52/52 통과 |
| 성공·확정 실패·CSRF_INVALID·503/판정 예외 unknown | 원래 응답·판정·갱신 결과 분리, auth POST 각1회 | 동일 |
| logout204 | auth 본문0바이트·Content-Type 미생성, 익명 발급 요청에서 이전 쿠키 부재 | 동일 |
| 갱신401·403·429·503·잘못된JSON·단절·302 | 실패 전달·auth 재실행 없음, 후속 재준비 실패도 POST 미전송, fixture 복구 후 명시적 새 POST 성공 | 동일 |
| auth/refresh 보류 중 gate | GET/POST·준비·중첩 인증 즉시 거절, 완료 후에도 차단 요청 수신0회 | 동일 |
| 지연 CSRF·일반 응답·세대 전환 | 이전 응답 완료 뒤 auth 전송, old GET/POST의 `stale_response`, 차단 POST 수신0회 | 동일 |
| 일반403의 늦은 CSRF 쿠키 | 수정 전 실패 → 이전 응답 drain 뒤 header/cookie 일치·POST 성공 | 같은 수정 코드로 통과 |
| 전송 전·CSRF/일반 응답 대기 취소 | 미전송·대기만 해제, 다음 auth도 남은 응답 drain | 동일 |
| auth 헤더 수신 전 취소 | `transport_error/unknown`, classifier0회·auth1회·서버 close 후 새 CSRF | 동일 |
| auth 헤더 수신 뒤 본문 취소 | HTTP200 Response는 수신했으나 판정 unknown, 이미 받은 쿠키 유지·token 재준비 | 동일 |
| 정리 | 보류/진행 응답/waiter0 확인 → 쿠키 만료 → 무발급 GET에서 이름 부재 | 동일 |

- 최종 **104개 고유 결과**는 앱의 PASS 표시와 별도로 수신자 횟수·조합·본문 길이·이벤트 순서·보고 allowlist를 독립 대조했다. 모든 인증 사례의 auth POST는1회, 정상 대조 POST는1회였고 cookie/token 조합과 합성 로그인14바이트/로그아웃0바이트를 확인했다. `late-csrf`의 추가 CSRF 쿠키도 마지막에 만료·부재를 확인했다. 최초100개 통과만으로 추가 경합을 해결했다고 처리하지 않았다.
- 쿠키 비교는 존재 여부만 사용하지 않는다. 발급·auth 응답의 세대를 보존하고, Set-Cookie 없는 GET과 갱신 요청 수신 시점에서 이전/현재/auth 쿠키 일치와 logout 이전 쿠키 부재를 검사한다. 수신자 보류 응답의 값도 요청 수신 시점에 캡처한다. 첫 독립 검토에서 발견한 로그인 익명 fallback 오인·logout 만료 미관측·판정 덮어쓰기·gate GET 누락4곳을 보완했다. 입력 cookie/token/예외/Response 원문은 보고하지 않는다.
- 취소 후 JS fetch 완료만으로 정리 성공을 판단하지 않는다. 서버 `close/finish`와 해제 ack를 대조했다. 두 OS 모두 헤더 전 취소는 연결이 닫혀 보류 헤더 전송 자체가 불가능했고, 헤더 후 본문 취소는 이미 적용된 auth 쿠키가 남았다. 이는 전달된 쿠키를 OS가 무시하거나 JS가 원복한다는 증거가 아니다. 본문을 아직 읽는 호출부의 화면 반영은125/167에서 현재 인증 문맥과 함께 처리한다.
- CSRF 단절의 전송 계층 GET 시도 수는 OS·연결 상태에 따라 달랐다. 최종 `refresh-network` 사례는 초기·실패2회·복구 단계를 합쳐 wire GET Android6회/iOS8회였고 JS 전송 호출은각6회, auth POST는각1회였다. 이 관측을 운영 GET 재시도 상한으로 정하지 않는다. HTTP401/403/429/503을 일괄 자동 재시도하거나 실패 POST를 재실행하지 않았다.
- Node24.20.0/npm11.19.0의 최종 `npm test`는 **8 suite·160 tests**(인증33·수신자10 포함), `npm run typecheck`·`npm run lint`도 통과했다. 기존 CI의 전체 Jest가 새 수신자 테스트를 발견한다. 이번 단계는 네이티브 설정·의존성 변경이 없어 패키지 의존성 설치·prebuild·Gradle/Xcode 재컴파일을 반복하지 않았고, 원격 CI도 실행하지 않았다. 일반 App은 각 플랫폼의 실제 Metro로 로드해 양 OS의 화면 복귀를 확인했다. 6단계의 최종 AC 대조·필요 회귀/빌드 확인은 별도 승인 뒤 수행한다.
- 재현은3-A의 수신자/Metro 명령과 `scripts/native-session/auth.bundle`을 사용한다. 선택자 없이 OS별26개, `EXPO_PUBLIC_NATIVE_PROBE_CASE=late-csrf`면 해당 사례만 실행한다. 관찰20초·제어/정리3초와 event-loop 확인용0ms timer는 진단 값이며 운영 정책이 아니다. 상한 후 새 제품 요청을 막고 정리 실패를 PASS로 바꾸지 않는다. 실제 운영 host·HTTPS·Secure/Domain/SameSite·OAuth·BE129 통합으로 확대하지 않는다.

### SCRUM-165 6단계 — 최종 AC·재현·검토 · 2026-10-26

- 시작 HEAD `69c64dde6a1e7c417dc0b29a563b95faca9870bc`의 제품 코드·설정·lockfile은 유지했다. ponytail 원칙으로 추가 기능·추상화·의존성 없이 최종 검증과 기존 문서만 정리했다. 독립 코드 검토와 AC 대조에서 추가 구현 결함은 발견하지 못했다. 이 로컬 검토는 GitHub PR 코드 리뷰를 대신하지 않는다.
- Jira165·부모123과 명세를 다시 읽었다. 원격 FE development는 `6bddb664069884543e7968209c579c722dddedf7`, BE development는 위 명세 링크의 `752e7ebca2a758f57970f36fdafa3cac2d2851d2`로 유지됐다. 미확정 DTO·운영값은 추가하지 않았다.

| SCRUM-165 완료 기준 | 로컬 구현·검증 근거 |
| --- | --- |
| 적용 명세·쿠키 포함·모든 POST CSRF | 4단계의 고정 commit 명세·절 링크, [`client.ts`](../src/api/client.ts)·[`csrf.ts`](../src/api/csrf.ts), [`client.test.ts`](../src/api/client.test.ts)의 초기/동시 발급·POST·헤더 보호 검사 |
| 초기 및 로그인·로그아웃 후 갱신과 성공/실패 전달 | [`authTransition.test.ts`](../src/api/authTransition.test.ts)의 인증 결과/갱신 결과 분리·갱신 실패·이전 token 미복구, 5단계 양 OS 인증26개/OS의 쿠키 세대·경합·취소 검사 |
| FE token/session의 URL·로그·영속 저장 금지, 실패 POST 자동 반복 금지 | 내부 메모리 보관·노출 방지 단위 검사, 네이티브 보고 allowlist·cookie/header 조합·수신 횟수, Android one-shot 본문 보존 및503/연결 손실의 POST 재전송 차단 검사 |

다음 명령은 지정 Node `24.20.0`·npm `11.19.0`으로 이번 단계에 새로 실행했다. Expo 명령은 개인 `.env`를 읽지 않는 `EXPO_NO_DOTENV=1`로 실행했고, prebuild·export에 `CI=1`을 적용했다. iOS 빌드는 서명 없이 수행했다.

| 명령·환경 | 결과 |
| --- | --- |
| `npm ci`, `node .github/scripts/validate_frontend_project.mjs`, 온라인 `expo install --check` | 종료0, 호환성 정상 |
| `npm run lint`, `npm run typecheck`, `npm test` | 모두 종료0, **8 suite·160 tests** |
| `npm run test:env` | Android/iOS **14개 조합** 통과 |
| `expo export --platform android`, `--platform ios` | 일반 `index.ts` 양 플랫폼 번들 생성 성공 |
| 각 플랫폼 `expo prebuild --platform … --no-install`, 문서 편집 전 `git diff --exit-code` | 양 플랫폼 성공·추적 파일 추가 변경0 |
| JDK `17.0.20.1`·SDK36 `./gradlew :app:assembleDebug --no-daemon --console=plain` | `BUILD SUCCESSFUL`, Debug APK 생성 |
| CocoaPods `1.16.2`의 `pod install`, Xcode `26.6`의 `xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath <임시 경로> CODE_SIGNING_ALLOWED=NO build` | 설치 종료0, `BUILD SUCCEEDED`, Simulator `.app` 생성 |

- 네이티브 런타임 **104개 PASS(52/OS)**는 제품 코드·네이티브 정책·의존성 변경이 없는 **2026-10-25의 5단계 증거**다. 이번에 재생성한 앱에서104개를 다시 실행하지 않았다. 선택한30개 생성 파일 해시 중29개와 Podfile.lock은 동일하고, 재생성된 `project.pbxproj`는 달라 전체 생성물의 바이트 동일성은 주장하지 않는다. 이번 결과는 새 prebuild·네이티브 컴파일·JS export의 재현 증거다.
- 원격 문서와 실제 설정을 구분했다. development `6bddb664`와 이 브랜치의 팀/Jira 문서는 다른 Write 권한자 승인1건을 요구하고, main `f06a1f36` 문서는 1인 담당의 별도 승인 불요를 설명한다. 세션에 제공된 AGENTS의 10/16 FE 결정은 최신 변경의 GPT/Codex GitHub PR 리뷰를 요구한다. 실제 development Ruleset은 승인0·마지막 push 승인 해제·strict 필수3검사·대화 해결·squash이며, main은 마지막 push 승인 요구·merge다. 이번에 팀 문서나 보호 설정을 변경하지 않았다.
- 기존3개 작업 공간의 HEAD·브랜치·status·변경 파일 SHA-256을 보존했다. 설치 감사의 **high5건은 남아 있으며** 강제 갱신하지 않았다. 실행 로그는 로컬 임시 증빙 `scrum165-stage6-20261026`에, 네이티브104개 원본은5단계 증빙에 보관한다.
- **로컬 6단계 완료**이며 push·PR·병합·Jira 변경은 수행하지 않았다. 공통 DoD의 GitHub PR 리뷰·대화 해결·최신 필수 원격 CI·development squash 병합과 Jira 반영 확인은 별도 요청 후 진행한다. 실제 인증 호출부125, 직렬화/응답166, 오류·인증 만료167, 확대 계약/비저장168, 실서버/HTTPS129·OAuth126/129는 각 작업 경계를 유지한다.

### SCRUM-161 로컬 구현·검증 — 2026-10-17

- 명시적 `EXPO_PUBLIC_API_MODE=mock|real`을 추가하고 `production/mock`을 거절한다. `GET /auth/me`의 200·401 가상 응답만 제공한다. real 모드에서는 mock handler를 등록·실행하지 않고, 미지원 요청과 전송 실패를 성공 응답으로 바꾸지 않는다. 개발 화면은 real 모드에서 시작 시 요청을 보내지 않는다.
- `npm ci`, lint, typecheck, Jest **58개**, Android/iOS별 공개 환경 주입 **14개 조합**, 두 플랫폼 JS export와 Android·iOS Simulator Debug 빌드가 로컬에서 통과했다. `expo install --check`는 종료 코드 0이지만 네트워크가 제한된 실행에서는 로컬 의존성 맵을 사용했으므로 온라인 호환성 확인과 구분한다.
- Pixel Tablet API 36 및 iPad Pro 11형 iOS 26.5 개발 빌드에서 가로 화면의 mock 200과 real 모드의 `서버 요청 없음` 표시를 각각 확인했다. iPad 시뮬레이터는 가로로 회전한 뒤 화면을 재확인했다. real 모드는 이 개발 화면에서 요청을 보내지 않으며, 가상 응답은 실제 서버 연결 증거가 아니다.
- 이 브랜치의 로컬 결과는 PR 최신 커밋의 GitHub CI·GPT 리뷰·병합·Jira 완료를 뜻하지 않는다. 새 CI job이나 필수 검사 변경 없이 기존 JS·네이티브 게이트가 이 테스트를 실행하도록 유지한다.

### SCRUM-160 로컬 구현·검증 — 2026-10-16

- `feature/SCRUM-160-env-routes`에서 공개 설정 읽기·기능별 검증, 공통 경로, 최소 수신자 예제를 구현했다. `.env.example` 값은 공란이며 API/OAuth 설정은 각각 필요한 시점에 검증한다. 웹 origin 변수는 현재 네이티브 앱에서 쓰지 않는다.
- 설정과 공통 사용처 테스트의 실패를 확인한 뒤 구현했다. 최종 Node `24.20.0`·npm `11.19.0`에서 `npm ci`, manifest 검사, lint, typecheck, Jest 42개가 통과했고 Expo 호환성도 확인했다.
- `npm run test:env`는 설치된 Expo preset으로 실제 설정 모듈을 양 플랫폼별 변환·실행해 미설정/개발/테스트/운영 8개 조합을 확인한다. 동적 환경변수 참조로 임시 변형했을 때 실패함을 확인하고 원복했다. 기존 JS CI job에 이 검사를 추가했으며 원격 CI는 아직 실행하지 않았다.
- 최종 `expo export --platform all`로 Android/iOS JS 번들을 생성했다. Pixel Tablet API36·iPad Pro 11 M5 iOS26.5의 기존 개발 빌드에서 공개 시험 설정과 공통 경로의 전달 결과를 확인했다. 임시 진단을 제거한 뒤 기존 첫 화면 재실행도 확인했다.
- 초기 임시 작업 폴더의 셸이 Node26을 선택해 manifest 검사가 실패했다. Node24 경로를 명시해 설치·검사·최종 export를 다시 통과시켰다. 네이티브 설정·의존성·lockfile 변경이 없어 로컬 네이티브 재컴파일은 반복하지 않았으며 이번 앱 실행은 기존 네이티브 빌드+새 JS로 확인한 결과다.
- 경로는 FE 내부 개발용이며 외부 딥링크 계약은 아니다. OAuth 검증 성공은 URI 형식 검사만 뜻한다. 실제 서버·인증 왕복은129, mock 분리는161에서 검증한다. 현재 첫 화면은 예제 수신자를 제품 기능으로 연결하지 않는다.
- 로컬 독립 리뷰에서 제어문자 URL 경계를 발견해 실패 재현 후 차단을 추가하고 전체 검사를 다시 통과했다. push/PR/원격 CI/병합/Jira 완료는 이번 로컬 결과와 구분한다. 현재 완료 지점은 로컬 구현·검증, 다음 작업은 리뷰 결과 반영 후 PR 진행 범위 확인이다.

### SCRUM-159 4단계 로컬 결과 — 2026-10-15

- 선택한 도구는 `jest-expo@57.0.6`, `jest@29.7.0`, `@types/jest@29.5.14`, RNTL `14.0.1`, `test-renderer@1.2.0`, `eslint-config-expo@57.0.2`, `eslint@9.39.5`다. 처음 설치한 ESLint `9.18.0`에는 Expo flat 설정이 요구하는 `eslint/config` 내보내기가 없어 `9.39.5`로 맞추고 실제 lint 실행으로 확인했다. `npm ls jest jest-expo @react-native/jest-preset @testing-library/react-native test-renderer --all`은 종료 코드 0이었다.
- `npm ci --no-fund`와 `npx --no-install expo install --check`가 성공했다. `npm run lint`는 `App.tsx`, `index.ts`, `App.test.tsx`, `eslint.config.js` 4개 파일을 실제 검사했고, 생성된 `android/`·`ios/`는 제외했다. `npm run typecheck`와 `CI=true npm run test`도 성공했고 테스트는 **1개 발견·1개 통과**했다. 제목을 임시 변경했을 때 이 테스트가 실패하고 원복 후 통과하는 것을 확인했다. 일치하는 테스트가 0개인 패턴은 종료 코드 1이었다.
- 공통 `build` 스크립트는 두지 않는다. Android·iOS의 빌드 대상·도구가 다르고, 3단계에서는 `expo run:android`와 `expo run:ios`로 개발 빌드를 컴파일·설치·실행했다. 5단계에서는 두 플랫폼의 `expo export`를 필수 JS 번들 검사로, Gradle·Xcode Debug 컴파일을 별도 네이티브 검사로 구성한다. Debug 컴파일은 JS 번들을 건너뛰므로 둘 다 필요하다. 실제 원격 결과는 6단계 PR에서 확인한다. 이번 4단계는 개발 도구·검사 설정만 추가했고 앱의 직접 네이티브 의존성·app config는 변경하지 않아 로컬 네이티브 빌드를 반복하지 않았다.
- `npm audit`는 전체 59건(높음 47·보통 12), `--omit=dev`는 35건(높음 23·보통 12)을 보고했다. 설치·검사 통과를 보안 통과로 해석하지 않는다. 제안된 `npm audit fix --force`는 승인된 Expo/RN 조합을 바꾸므로 실행하지 않았다. 호환 가능한 보안 갱신 가능성은 별도 검토하고, CI·PR에서 실제 영향과 남은 제한을 구분해 보고한다.

### SCRUM-159 5단계 로컬 결과 — 2026-10-16

- 최초 `npm ci` 성공, `npm run lint`·`npm run typecheck` 성공, `CI=true npm run test`는 1개 suite·1개 테스트 통과. 최초 `npx --no-install expo install --check`는 종료 코드 0이지만 네트워크가 비활성화되어 로컬 의존성 맵으로 판정했다.
- `npx --no-install expo export --platform android --output-dir dist/android`와 iOS의 동일 명령이 각각 성공했다. 두 플랫폼의 JS 번들과 asset export를 확인했다. 로컬 생성물 `dist/`는 Git 제외다.
- `.github/scripts/validate_frontend_project.mjs`의 정상 입력은 통과하고, 필수 파일 누락·빈 테스트 스크립트·다른 패키지 관리자 lockfile의 임시 복사본은 실패했다. YAML 파싱과 각 `run` 명령의 Bash 구문도 통과했다. 집계 job의 JS 실패·Android 실패·iOS 취소·예상 밖 skip 모의 입력은 모두 실패, 세 job 성공 입력만 통과했다.
- README에 설치·개발 실행·플랫폼별 JS export와 깨끗한 checkout의 Android/iOS Debug 컴파일 절차를 기록했다. 3단계의 로컬 태블릿 네이티브 실행 증거는 유지하지만 이번 5단계에서 다시 컴파일하지 않았다. GitHub runner의 실제 결과와 보안 감사 통과는 아직 주장하지 않는다.
- PR #29 첫 실행의 JS job은 온라인 Expo 검사에서 `expo@57.0.29`가 기대 범위 `~57.0.30`보다 낮아 실패했고, 두 native job은 건너뛰었으며 집계도 실패했다. Expo를 `57.0.30`으로 갱신하고 `npm ci`부터 온라인 `expo install --check`, lint, typecheck, 1개 테스트, 두 플랫폼 JS export까지 다시 통과했다. 원격 결과는 아래 6단계에서 확인했다.

### SCRUM-159 6단계 검증 기록 — 2026-10-16

- Expo 패치 변경 후 깨끗한 로컬 checkout에서 Node `24.20.0`·npm `11.19.0`으로 `npm ci`하고 Android·iOS `expo prebuild --no-install` 뒤 추적 설정에 diff가 없음을 확인했다. Android JDK 17·SDK 36·NDK `27.1.12297006`의 `:app:assembleDebug`는 `BUILD SUCCESSFUL`, iOS Xcode 26.6의 `pod install` 후 서명 없는 Simulator Debug 빌드는 `BUILD SUCCEEDED`였다. APK와 `.app` 출력도 확인했다.
- PR #29의 커밋 `8b38209`에서 `js-quality`, `android-debug-build`, `ios-simulator-debug-build`, 최종 `frontend-quality`, `gitmoji-conventional-title`, `jira-issue-key`가 모두 통과했다. 이후 문서만 변경하더라도 최신 커밋 기준 CI를 다시 확인해야 한다. 해당 시점의 승인 리뷰는 없었고 Jira 159는 `해야 할 일` 상태였다.
- `npm ci`의 의존성 감사 출력은 환경·조회 시점에 따라 58~59건을 보였다. 이 작업에서 보안 감사 필수 게이트를 추가하거나 경고를 해결했다고 주장하지 않는다.

**각 구현 Subtask의 공통 종료 순서:** 최신 AC에서 테스트 사례를 먼저 고른다 → 기능의 최소 동작을 구현한다 → 그 동작의 정상·핵심 오류·경계 테스트를 작성·실행한다 → 로컬 필수 검사를 실행한다 → 해당되는 기기/시각 확인을 한다 → PR 검증란 또는 기존 Jira 작업 기록에 명령·결과·미실행 사유를 남긴다. 필요한 기능이 모두 연결된 후의 통합 검사는 168·164·174·171 등 담당 검증 Subtask에서 수행한다. 전체 FE 기능이 끝날 때까지 개별 테스트를 미루지 않는다.

159에서 손댈 파일은 최소 앱/검사 명령의 `package.json`·`package-lock.json`, 필요한 테스트와 설정, `.github/workflows/ci.yml`, 재현 절차의 `README.md`, 이 계획 문서다. 160 이후 기능 파일 경로는 실제 구현 구조를 확인해 정하고, 테스트는 해당 기능 코드 가까이에 둔다. 새로운 공통 helper나 별도 기록 문서는 중복이 생기기 전에는 만들지 않는다.

## 언제, 어디서 검사하는가

| 시점 | 실행 위치 | 검사 내용 | 완료 판단 |
| --- | --- | --- | --- |
| 각 기능의 최소 동작 구현 직후, 같은 Subtask 종료 전 | 로컬 | 변경한 로직의 단위·화면·계약 테스트와 해당 lint/typecheck | 해당 정상·오류·경계 사례가 실제로 실행·통과 |
| PR 전 | 로컬 | `npm ci`, Expo 호환성, 전체 lint/typecheck/비대화형 테스트, Android·iOS JS export, 변경 기능의 앱 실행·기기 확인 | 사용한 명령과 결과를 PR에 기록. 실행하지 않은 검사는 표시하지 않음 |
| PR CI | 깨끗한 GitHub Actions runner | 같은 JS 검사·양 플랫폼 JS export와 Android debug·iOS simulator 네이티브 빌드. 누락·실패·취소·예상 밖 skip은 실패 | PR 최신 커밋에서 필수 `frontend-quality`가 실제 검사 결과를 집계해 통과 |
| 기능 연결·회귀 | 구현한 기능의 마지막 검증 Subtask | 앞선 테스트를 재사용하면서 화면·상태·API 연결과 누락된 AC 확인 | 개별 테스트의 복제가 아니라 통합 동작 증거 확보 |
| 실제 기기 검증 | Android·iOS emulator/simulator 및 필요한 실제 기기 | OS 권한, 마이크·녹음·재생, 키보드/포커스, 앱 재실행 | 기기·OS·앱 빌드·기대/실제 결과 기록. Jest mock 결과로 대체하지 않음 |
| 실제 서버 연동 | SCRUM-129의 격리된 시험 환경 | 실제 API·OAuth 복귀·쿠키·CSRF·오류의 왕복. 브라우저/WebView 경로가 확정되면 그 경로의 CORS도 확인 | 실제 HTTP/code와 `requestId` 증거 확보. mock 통과와 구분 |

테스트는 모든 코드를 같은 방식으로 덮는 대신 실패 영향이 큰 동작부터 만든다. 우선순위는 **세션·CSRF·인증 상태와 민감정보 보호 → 사용자가 보는 핵심 흐름 → OS 고유 동작 → 단순 표시**다. 의미 없는 스냅샷, 설정값을 그대로 읽어 확인하는 테스트, 근거 없는 커버리지 백분율 목표는 만들지 않는다.

| 담당 작업 | 구현 직후 만들 검사 | 연결 뒤에 확인할 것 |
| --- | --- | --- |
| 159~161 | 최소 화면 RNTL, 설정·경로 선택, mock/실제 모드 분리 테스트 | 161에서 설치·양쪽 빌드·필수 CI 전체 재현 |
| 165~168 | 165~167에서 순수 로직/모의 응답 계약 테스트 | 168에서 요청→응답→오류 전달과 비저장 연결 확인 |
| 162~164 | 162의 원본 대조, 163의 상태별 RNTL 상호작용 테스트 | 164에서 초기 화면 조합의 시각·키보드·포커스 기기 확인 |
| 172~174 | 172~173의 로그인·로그아웃 RNTL/공통 API 경계 테스트 | 174에서 정상·실패·만료 상태 전달 확인 |
| 169~171 | 169~170의 온보딩·상태별 진입 RNTL 테스트 | 171에서 앱 재실행·만료·확정된 외부 진입 경로 확인 |
| 175~177 | 기기 조사 범위 확정과 양쪽 OS의 권한·녹음·재생 직접 시험 | 177에서 환경별 성공·실패·차단·미검증 결과 정리 |
| 129 | 실제 서버·시험 계정·데이터 초기화가 준비된 뒤 서버 왕복 시험 | mock 결과와 분리해 HTTP/code·requestId 및 네이티브 OAuth·세션 결과 확인 |

자동 검사는 `CI=true npm run test`가 실제 테스트를 발견·실행해야 하며, 수동 기기 확인은 기기/OS/빌드와 기대·실제 결과를 PR 검증란이나 기존 Jira 작업 기록에 남긴다. 해당 환경이 없어 필수 검증을 못했다면 이유·확인 담당·다음 확인 시점을 남기고 완료로 표시하지 않는다.

## 도입 순서와 기능별 테스트

필수 선행은 `121 → 123·122·136`, `123+122 → 125·124`다. 기본 구현 순서는 `121 → 123 → 122 → 125 → 124`이며, 136은 121 후 기기를 쓸 수 있는 시점에 한정해 진행한다. 한 번에 구현 Subtask 하나를 진행한다. 기능 구현 직후 같은 Subtask에서 그 기능의 테스트를 끝내고, 마지막 검증 Subtask에서는 여러 기능의 연결과 회귀를 확인한다.

### 1. 검사 기반 — SCRUM-121

| Subtask | 테스트를 만드는 시점과 대상 | 증거 |
| --- | --- | --- |
| [159](https://dodamdodam.atlassian.net/browse/SCRUM-159) 앱 실행·빌드·필수 검사 | 3단계 양쪽 태블릿 development build, 4~5단계의 `jest-expo`·Jest·RNTL 최소 화면 테스트와 ESLint·TypeScript 검사, 5단계 양 플랫폼 JS export는 로컬에서 완료했다. 접근 가능한 헤더를 확인하는 테스트 1개가 통과했고 테스트 0개는 실패한다. 공통 `build` 스크립트 대신 Android·iOS별 네이티브 컴파일을 쓰는 이유를 기록했다. fail-closed JS 검사·양 플랫폼 export·네이티브 컴파일 게이트는 PR #29의 커밋 `8b38209`에서 통과했다. | 3단계 양쪽 태블릿 로컬 빌드·실행, 4~5단계 로컬 검사와 export, 최종 구현 커밋 `4dcf760`의 원격 CI·GPT 리뷰 통과와 squash `b55d4fd`·Jira 완료 확인 |
| [160](https://dodamdodam.atlassian.net/browse/SCRUM-160) 환경 변수·공통 라우트 | 환경별 FE/API/OAuth 복귀 주소의 **선택 규칙**과 공통 경로 정의의 재사용을 검사한다. 예시 설정에 비밀이 없고 클라이언트 공개 설정에 자격 증명이 없는지도 확인한다. 목적지 화면과 서버 왕복은 이 작업의 테스트가 아니다. | 설정 선택·경로 참조 테스트와 비밀값 없는 예시 |
| [161](https://dodamdodam.atlassian.net/browse/SCRUM-161) 테스트 응답 분리·CI 재현 | mock 모드에서 명세 기반 응답을 재현하고, 실제 API 모드에서는 mock handler가 **등록도 실행도 되지 않음**을 검증한다. 159·160 결과로 설치→실행→빌드→필수 검사를 다시 수행한다. | 모드별 테스트·실행 로그, README 명령과 CI 일치 여부 |

159의 4단계에서는 Expo의 [공식 단위 테스트 절차](https://docs.expo.dev/develop/unit-testing/)를 참고해 SDK 57용 `jest-expo`와 React Native Testing Library를 설치했다. 선택 버전·peer 관계·최소 테스트의 실제 결과는 위 로컬 기록에 있다. 이후 패키지 버전이 바뀌면 실제 peer dependency, RNTL v14의 비동기 `render`·상호작용 API, `npx expo install --check`를 다시 확인한다.

### 2. 공통 API·보안 계약 — SCRUM-123

공통 요청 계층은 후속 기능이 모두 쓰므로 이 단계에서 정상 응답뿐 아니라 실패 처리까지 PR CI가 실행하는 테스트로 만든다. 기대 필드·코드는 최종 OpenAPI와 대조한다.

| Subtask | 최소 테스트 사례 |
| --- | --- |
| [165](https://dodamdodam.atlassian.net/browse/SCRUM-165) 세션 쿠키·CSRF | 필요한 요청에 세션 쿠키를 포함한다. 공개 인증을 포함한 모든 POST에 `X-XSRF-TOKEN`을 적용하고 로그인·로그아웃 후 값을 재획득한다. 토큰이 URL·로그·지속 저장소에 남지 않는다. 모의 네트워크 테스트와 별개로 선택한 네이티브 세션 전달 방식의 동작을 양쪽 OS에서 검증한다. |
| [166](https://dodamdodam.atlassian.net/browse/SCRUM-166) 응답·본문 규칙 | `{data:…}`와 `{error:{code,message,requestId,fields}}`를 구분하고 누락된 `fields`는 `[]`로 처리한다. 204 무본문, CSRF 응답, OAuth 복귀/리디렉션, 음성 바이너리를 JSON으로 잘못 해석하지 않는다. `logout/lock/resume/end` 요청 본문은 `{}`도 없는 0바이트다. 미정의 필드·`null`을 임의 전송하지 않는다. 네이티브 `fetch`에서 302를 직접 가로채는 방식은 전제하지 않는다. |
| [167](https://dodamdodam.atlassian.net/browse/SCRUM-167) 오류·재시도 | 실제 `error.code`로 401·403·429·503 등 계약상 오류를 구분한다. 실패한 POST와 CSRF 재획득 뒤 변경 요청을 무조건 재실행하지 않고, 400을 자동 반복하지 않는다. 429의 초 단위 `Retry-After`를 따른다. 보호자 권한·이용시간·대화 종료 오류는 노출/입력/재생 차단 등 해당 기능에 필요한 상태로 전달한다. |
| [168](https://dodamdodam.atlassian.net/browse/SCRUM-168) 계약·비저장 확인 | 165~167 테스트를 재사용해 요청→응답→오류 전달 연결을 확인한다. 쿠키·PIN·token·원본 개인 대화가 URL·로그·영속 저장소·증빙에 남지 않는지 확인한다. `X-Request-ID`와 `clientRequestId`를 혼동하지 않는다. |

서버를 mock한 계약 테스트는 **FE가 보내는 요청과 받는 응답 처리**를 검증한다. 서버 구현 자체가 그 계약을 지킨다는 증거로 보고하지 않는다.

### 3. 공통 화면 — SCRUM-122

| Subtask | 테스트와 확인 항목 |
| --- | --- |
| [162](https://dodamdodam.atlassian.net/browse/SCRUM-162) 에셋 | 초기 화면에 쓰는 원본 폰트·색상·캐릭터의 출처와 적용 결과를 디자인 프레임과 대조한다. 임시 자산을 원본 완료로 표시하지 않는다. 단순 색상 상수 복제 테스트는 만들지 않는다. |
| [163](https://dodamdodam.atlassian.net/browse/SCRUM-163) 공통 UI | 버튼·입력·모달·로딩·오류의 실제 사용 상태를 RNTL로 검사한다. 누름·입력·비활성화·오류 노출 등 사용자 행동과 접근 가능한 이름/라벨을 확인한다. |
| [164](https://dodamdodam.atlassian.net/browse/SCRUM-164) 최종 대조 | 실제 초기 화면 조합에서 키보드·포커스·라벨과 시각 차이를 Android·iOS로 확인한다. 162·163의 개별 테스트를 다시 작성하지 않는다. |

### 4. 이메일 로그인·로그아웃 — SCRUM-125

| Subtask | 최소 테스트 사례 |
| --- | --- |
| [172](https://dodamdodam.atlassian.net/browse/SCRUM-172) 로그인 | 입력·대기·성공·실패 상태와 시안 일치를 확인한다. 대기 중 중복 제출은 한 요청만 발생하고, 오류 응답은 성공 화면으로 바뀌지 않는다. 회원가입 규칙을 기존 계정 로그인에 잘못 적용하지 않는다. 이번 범위에서 카카오 로그인·로그인 유지 체크박스를 추가하지 않는다. |
| [173](https://dodamdodam.atlassian.net/browse/SCRUM-173) 로그아웃 | 0바이트 본문 계약을 공통 계층에서 재사용하고, 로그아웃 후 현재 계정의 인증·공통 상태를 정리하며 CSRF를 재획득한다. 다른 계정에 이전 인증·공통 상태를 넘기지 않는다. |
| [174](https://dodamdodam.atlassian.net/browse/SCRUM-174) 연결 검증 | 정상·실패·만료 후 상태가 다음 화면/공통 상태 수신자에게 올바르게 전달되고 시안과 맞는지 확인한다. 아직 없는 후속 화면은 테스트 수신자로 구분하고, 123 계약 테스트를 복제하지 않는다. |

### 5. 진입·온보딩·상태별 이동 — SCRUM-124

| Subtask | 최소 테스트 사례 |
| --- | --- |
| [169](https://dodamdodam.atlassian.net/browse/SCRUM-169) 온보딩 | 마이크 사용 안내와 허용/거부 이후 사용자가 보는 상태를 확인한다. 이 단계에서 카메라·알림 권한을 요청하지 않는다. 실제 OS 권한 팝업의 문구·동작은 기기에서 확인한다. |
| [170](https://dodamdodam.atlassian.net/browse/SCRUM-170) 진입 분기 | CSRF 준비 상태와 `auth/me` 결과의 대기·인증·미인증·오류에 따라 **로그인·아이 등록·홈** 중 계약상 맞는 경로로 간다. 실패나 대기 중 보호 화면과 이전 사용자 정보를 잠시라도 보여주지 않는다. |
| [171](https://dodamdodam.atlassian.net/browse/SCRUM-171) 재진입·만료 | 앱 완전 종료 후 재실행, 세션 만료, 외부 진입 경로에서 상태를 다시 확인한다. Jira의 웹 표현인 `새로고침·직접 URL`을 네이티브에서 앱 재실행·딥링크 등 무엇으로 검증할지는 해당 구현 착수 전에 Jira/확정 설계와 대조한다. |

### 6. 음성 환경 조사 — SCRUM-136

| Subtask | 검사 방법과 완료 증거 |
| --- | --- |
| [175](https://dodamdodam.atlassian.net/browse/SCRUM-175) 환경·상한 | 대상 OS·브라우저·버전과 에뮬레이터/시뮬레이터/실기기 여부를 기록한다. 네이티브 앱에 브라우저 항목이 해당하지 않으면 Jira/설계와 대조해 `N/A` 근거를 남긴다. 전체 조사 시간 상한·단계별 배분·중단 시 미확인 항목을 정하고, 확인하지 않은 환경을 지원 완료로 표시하지 않는다. |
| [176](https://dodamdodam.atlassian.net/browse/SCRUM-176) 권한·녹음·재생 | 기기에서 마이크 허용/거부, 녹음, 재생을 확인하고 아동 정보가 없는 시험 음성의 MIME/codec/sample rate/channels/duration/bytes를 기록한다. Jest의 네이티브 mock은 이 결과를 대신하지 않는다. |
| [177](https://dodamdodam.atlassian.net/browse/SCRUM-177) 호환성 정리 | 환경별 성공/실패/차단/미검증 표와 권장 방식을 남긴다. D13/D14의 미확정 제한값은 임의 숫자로 채우지 않고 확인 담당·다음 확인 시점을 남긴다. |

## CI를 어떻게 바꿀 것인가

이 절은 **향후 구현 기준**이다. 현재 workflow가 이미 아래처럼 동작한다는 뜻이 아니다.

1. **159의 5단계에서 검사 누락 차단:** `.nvmrc`, `package.json`, 단일 `package-lock.json`, `packageManager`·engine의 Node/npm 버전, 비어 있지 않은 `lint`·`typecheck`·`test` 스크립트를 사전 검사한다. 모든 job에서 Node `24.20.0`·npm `11.19.0`으로 맞추고 실제 버전을 확인한다. 없는 파일·스크립트나 테스트 0개는 실패한다. CI는 `npm ci` → `npx --no-install expo install --check` → lint/typecheck/test를 실제 실행한다. 원본을 보존하는 임시 복사본에서 누락 파일·스크립트 실패도 확인한다. `.npmrc`가 없는 현재 저장소에 이를 새 필수 파일로 가정하지 않는다.
2. **159의 5단계에서 JS 번들과 네이티브를 각각 검사:** JS job은 Android·iOS `npx --no-install expo export --platform …`를 각각 필수로 실행한다. Android Debug와 iOS Debug 컴파일은 JS 번들을 건너뛰므로 export도 필수다. JS 통과 후 Linux의 JDK 17·SDK 36·NDK `27.1.12297006` Android 빌드와 macOS의 Xcode 26.6·Pods 설치·서명 없는 iOS Simulator 빌드를 병렬 수행한다. prebuild는 깨끗한 checkout에서만 실행한다. export는 기기 실행이나 네이티브 컴파일을 대신하지 않는다.
3. **159의 5~6단계에서 필수 검사와 PR 증거 연결:** JS·Android·iOS job의 실패·취소·건너뜀을 유일한 `frontend-quality` 집계 job이 실패로 처리한다. workflow 이름 `Frontend CI`, PR 트리거·읽기 권한·비밀값 경계·전체 SHA로 고정한 Action과 기존 `gitmoji-conventional-title`·`jira-issue-key` 및 Jira/Slack/GitHub 자동화를 유지한다. 5단계는 로컬 검사·README·CI 구성까지다. 6단계에서 해당 파일을 커밋·PR에 올린 뒤 **PR 최신 커밋**의 실제 JS·Android·iOS·집계 로그를 확인한다. 수동 workflow 실행 결과를 PR 검사로 대신하지 않는다.
4. **161에서 모드 분리 후 회귀:** mock/실제 API 모드와 실제 모드의 handler 미등록·미실행 테스트를 추가하고 159의 설치·실행·양 플랫폼 export·빌드·필수 검사를 새 변경에 대해 다시 확인한다. 누락 파일·스크립트 실패 기준을 161까지 미루지 않는다.
5. **이후 기능 PR:** 123의 공통 계약, 122의 상태별 UI, 125의 로그인·로그아웃, 124의 진입 분기를 각각 최소 동작으로 구현한 직후 해당 테스트를 추가하고 로컬에서 통과시킨다. 그 Subtask의 PR을 올리기 전에 같은 `test` 대상이 CI에서도 실행되도록 한다. 마지막 검증 Subtask에서는 관련 기능이 연결된 뒤에만 가능한 연결 테스트와 기기 확인을 보강한다.
6. **129의 실제 서버 검사:** 124·125·126·128의 필요한 결과와 안정적인 시험 서버, 격리된 시험 계정·초기화 방법, 신뢰할 수 있는 FE/API/OAuth 주소, CI에서 공급할 자격 증명 경로가 준비되면 실제 요청 테스트를 별도 job으로 추가한다. 이메일·Google 로그인, 로그아웃, 비밀번호 재설정, 앱 진입과 세션·CSRF·대표 오류의 왕복을 확인한다. 선택한 네이티브 OAuth 복귀·쿠키 전달 방식은 Android·iOS에서 별도 검증한다. 브라우저/WebView 경로가 실제 범위일 때만 그 경로의 CORS를 확인한다. 처음에는 독립적으로 실행해 환경 장애와 제품 결함을 구분하고, 반복 실행이 재현 가능하며 팀이 실패를 처리할 수 있는 상태가 되면 필수 게이트 편입을 검토한다. 편입·Ruleset 변경은 그 작업 범위에서 검토한다. 준비 전의 mock 계약 테스트를 실제 BE 연동 성공으로 표시하지 않는다.

CI의 비밀값은 로그·artifact·프론트엔드 번들에 넣지 않는다. [`EXPO_PUBLIC_` 변수는 클라이언트 번들에 포함된다](https://docs.expo.dev/guides/environment-variables/)는 점을 기준으로, 공개 가능한 주소와 자격 증명을 구분한다. 실제 서버 시험 증거에는 환경·재현 절차·기대/실제 HTTP 및 오류 code·서버 `requestId`만 남기고 cookie/token/PIN/원본 개인 대화는 제외한다.

## 시험기간 일정에 맞춘 적용 방식

- **10/23까지:** 평일 2~3시간 개발을 전제로 완료된 159를 바탕으로 160·161의 환경/모드 테스트를 이어 붙인다. Subtask를 하루에 하나씩 끝낸다는 가정은 하지 않는다. 기기 사용이 가능한 주말에는 121 선행 충족 후 136의 한정된 조사도 배치할 수 있다.
- **121 이후:** 123의 공통 보안 계약을 우선 구현·검증하고, 이어 122의 초기 UI를 확인한다. 122+123 완료 후 125·124의 기능 테스트를 같은 작업 흐름에서 추가한다. 124와 125 사이에 새 필수 선행을 만들지 않는다.
- **10/23 점검:** 실제 통과한 검사, 남은 Jira AC, 기기 접근, FE/BE 계약 질문을 확인한다. 미실행 항목을 완료로 표시하지 않는다.
- **10/30 점검:** 남은 구현·검증·리뷰·병합 경로를 확인한다. 근거 없이 완료를 약속하거나 테스트/보안 조건을 줄이지 않고, 필요한 경우 기존 스프린트 계획의 이월 검토 기준을 따른다.
- **11/3 18:00 KST 전:** 이번 스프린트의 부모·자식별 완료 증거와 남은 제한을 정리한다. SCRUM-129의 실제 서버 검증이나 전체 FE P0 E2E를 이번 스프린트 완료량으로 섞지 않는다.

## 실행·보고 기준

- 테스트 파일은 기능 코드와 가까이 둔다. 공통 테스트 helper는 반복이 생긴 뒤에만 만든다. 테스트 이름에는 사용자가 하는 행동과 기대 결과를 드러낸다. React Native 화면 테스트는 역할·라벨로 요소를 찾고, `testID`는 필요한 경우에만 쓴다.
- 정상 사례 하나만으로 완료하지 않는다. 해당 Subtask에서 사용자 피해가 큰 오류와 경계를 함께 확인한다. 비동기 화면에서는 실제 결과를 기다리며, 네트워크 mock은 FE 경계에서만 사용한다.
- PR에는 실행 명령과 결과, 양쪽 플랫폼 확인 범위, 실제 서버/기기 시험 여부, 미실행 사유를 구분한다. 기존 Jira·PR 규칙은 [기여 가이드](../CONTRIBUTING.md)와 [팀 운영 가이드](TEAM_WORKFLOW_GUIDE.md)를 따른다. Subtask마다 별도 테스트 계획 문서를 만들지 않는다.
- 테스트 실패를 일단 skip하거나 규칙을 낮춰 초록색으로 만들지 않는다. 실패의 재현 조건과 책임 위치를 확인한 뒤 고친다. 외부 환경이 차단되면 Jira의 현재 지점·사유·확인 담당·다음 확인일에 기록하고 준비된 작업으로 전환한다.
- 보안 계약과 테스트 데이터 범위는 [보안 정책](../SECURITY.md) 및 최종 FE 인수인계/API 문서에 따른다. 실제 아동 정보는 시험 음성·계정·로그·스크린샷에 쓰지 않는다.

## 착수 시 다시 확인할 항목

1. 각 Jira의 최신 범위·AC, 최종 OpenAPI/ERD, Android/iOS 제품 결정. 특히 `새로고침·직접 URL`의 네이티브 대응과 OAuth 복귀 방식은 추정하지 않는다.
2. Expo 57과 설치한 `jest-expo`·RNTL·renderer·ESLint의 lockfile 변경 여부 및 현재 runner/Xcode 제공 버전. 변경되면 peer 관계와 최소 테스트를 다시 확인한다.
3. SCRUM-129 시험 서버·시험 계정·데이터 초기화·CI secret 공급 경로. 이 조건이 미확정이면 실제 서버 테스트의 필수 게이트 날짜를 확정하지 않는다.
4. SCRUM-159에서 실제 구현한 검사 명령과 이 문서의 목표 명령이 구현 이후에도 일치하는지 확인한다.

## 참고 근거

- 이번 스프린트의 부모·자식 및 선행: 각 [Jira 원문](https://dodamdodam.atlassian.net/browse/SCRUM-121). 로컬 초안보다 최신 Jira를 우선한다.
- [Expo 단위 테스트](https://docs.expo.dev/develop/unit-testing/), [Expo CLI 호환성 검사](https://docs.expo.dev/more/expo-cli/), [Expo native mocking의 범위](https://docs.expo.dev/modules/mocking/).
- [React Native Testing Library 버전별 API](https://github.com/callstack/react-native-testing-library/tree/main/skills/react-native-testing/references), [Expo 네이티브 빌드](https://docs.expo.dev/build/introduction/), [Expo의 모바일 E2E 예시](https://docs.expo.dev/eas/workflows/examples/e2e-tests/).
- [React Native 네트워킹의 cookie·redirect·CORS 제약](https://reactnative.dev/docs/network).

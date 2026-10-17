# FE 기능별 테스트·CI 도입 계획

작성 기준: 2026-10-14 KST · 계획 재검토: 2026-10-16 KST · 대상: Expo/React Native/TypeScript Android·iOS 앱
상태: **SCRUM-159 완료, SCRUM-160 진행 중**. PR #29가 development에 squash 병합됐다(`b55d4fd`). 최신 구현 커밋 `4dcf760`의 필수 CI·GPT 리뷰와 Jira 완료를 확인했다. SCRUM-160의 로컬 결과와 이후 원격 검사는 구분하며 실제 서버 검증은 SCRUM-129 범위다.

## 목표와 현재 상태

이번 스프린트의 FE 작업을 구현할 때 각 Jira 완료 기준에서 정상 동작, 핵심 오류, 경계 조건을 테스트로 연결한다. **각 기능의 최소 동작을 구현한 직후 해당 기능의 테스트를 만들고, 같은 Subtask를 완료하거나 PR을 올리기 전에 통과시킨다.** 여러 기능이 이어져야 가능한 연결·기기·실서버 검증은 선행 기능이 준비된 뒤 수행한다. 로컬에서 먼저 검사하고, 같은 코드를 깨끗한 CI 환경에서도 검사한다.

- 현재 기준 기술은 Expo `57.0.30`, React Native `0.86.3`, React `19.2.3`, TypeScript `6.0.3`, Node `24.20.0`, npm `11.19.0`이다. 실제 기준은 변경 시 [`package.json`](../package.json), [`.nvmrc`](../.nvmrc), lockfile에서 다시 확인한다.
- 현재 `package.json`에는 `start`·`android`·`ios`와 실제 실행한 `lint`·`typecheck`·`test` 스크립트가 있다. 공통 `build` 스크립트는 없으며, 이 React Native 앱의 빌드는 Android·iOS별 네이티브 명령으로 검증한다. [CI 구성](../.github/workflows/ci.yml)은 필수 파일·스크립트, JS 검사·양 플랫폼 export, Android·iOS 네이티브 빌드의 실패·취소·건너뜀을 `frontend-quality` 실패로 연결한다. [PR #29의 실행 결과](https://github.com/DodamDodam-Capstone/frontend/actions/runs/38769299920)에서 JS·Android·iOS와 최종 집계가 모두 통과했다.
- 로컬 SCRUM-159의 1~5단계는 완료됐다. Pixel Tablet(Android API 36)과 iPad Pro 11형(iOS 26.5)에서 development build 컴파일·설치·가로 화면·재실행을 확인했다. 변경된 lockfile에서 설치·lint·typecheck·최소 화면 테스트와 Android·iOS JS export를 실행했다. 첫 PR의 온라인 Expo 검사는 `57.0.29` 대신 `~57.0.30`을 요구해 실패했고, 패치 갱신 후 로컬 온라인 검사와 깨끗한 checkout의 양쪽 네이티브 빌드, PR 원격 CI가 통과했다. Jira 상태와 로컬 단계 완료는 별개다.
- 이번 스프린트 범위는 [SCRUM-121](https://dodamdodam.atlassian.net/browse/SCRUM-121), [SCRUM-123](https://dodamdodam.atlassian.net/browse/SCRUM-123), [SCRUM-122](https://dodamdodam.atlassian.net/browse/SCRUM-122), [SCRUM-125](https://dodamdodam.atlassian.net/browse/SCRUM-125), [SCRUM-124](https://dodamdodam.atlassian.net/browse/SCRUM-124), [SCRUM-136](https://dodamdodam.atlassian.net/browse/SCRUM-136)의 부모 6개와 자식 19개다. 실제 서버 왕복은 별도 [SCRUM-129](https://dodamdodam.atlassian.net/browse/SCRUM-129)에서 검증한다.

Jira 원문과 최종 OpenAPI·ERD·확정된 후속 결정을 테스트의 기대값으로 삼는다. 이 문서의 사례는 현재 범위의 **검증 항목**이며, 미확정 API 필드·운영값·음성 제한을 새로 정하는 명세가 아니다.

## 실행 시작점과 작업 방법

이 문서는 2026-10-14에 작성하고 2026-10-15의 진행 상태와 2026-10-16의 CI 재검토를 반영했다. 후속 작업자는 먼저 현재 브랜치·변경 파일·해당 Jira의 최신 AC·실제 `package.json` 스크립트와 CI를 확인하고, 이미 완료된 단계를 반복하지 않는다. 변경된 사실은 최신 Jira와 실행 결과를 우선하며 이 계획의 해당 항목을 갱신한다.

**현재 작업은 [SCRUM-160](https://dodamdodam.atlassian.net/browse/SCRUM-160)의 환경 설정·공통 경로와 검증이다.** FE는 팀장 결정에 따라 최신 변경의 GPT 리뷰·지적 사항 처리·필수 CI·대화 해결을 확인한다. 2026-10-16 development Ruleset의 승인 수 0·마지막 push 승인 해제를 재확인했다. main 및 다른 저장소에는 확대하지 않는다. 160·161과 부모 AC 확인 전에는 부모121을 완료하지 않는다.

- [x] 3단계에서 `expo-dev-client`를 설치하고 `npx expo run:android`로 Pixel Tablet(Android API 36), `npx expo run:ios --device 979FC60C-8633-430F-AB66-D324B8D31355`로 iPad Pro 11형(iOS 26.5)의 development build를 컴파일·설치·실행했다. 두 태블릿에서 가로 첫 화면과 재실행을 확인했다. 이 기기 ID는 해당 Mac의 시뮬레이터 식별자다. 이는 로컬 빌드 증거이며 CI 빌드나 실기기·실서버 검증 증거는 아니다. 최종 공유용 재현 명령·결과는 5단계 README·PR 검증란에 남긴다.
- [x] 4단계에서 `git status --short --branch`와 159·부모 121의 최신 AC를 대조했다. SDK 57용 Jest 29 계열·RNTL·renderer의 peer 관계와 실제 최소 테스트를 확인하고, `package.json`·lockfile에 `lint`·`typecheck`·`test` 스크립트를 구성했다. ESLint가 루트 앱·진입점·테스트 파일을 검사하는지도 확인했다. 별도 Jest setup 파일은 필요하지 않았다.
- [x] 4단계 의존성 변경 후 `npm ci`, `npx expo install --check`, `npm run lint`, `npm run typecheck`, `CI=true npm run test`를 로컬에서 다시 실행했다. 3단계의 설치·TypeScript 검사 결과를 새 lockfile의 통과 증거로 재사용하지 않았다. 테스트 0개는 종료 코드 1로 실패하며, 공통 `build` 스크립트가 없는 이유를 아래에 기록했다.
- [x] 5단계에서 `.github/workflows/ci.yml`과 README를 맞췄다. 필수 파일·스크립트 누락, 테스트 0개, Android/iOS JS export 또는 네이티브 빌드 실패가 `frontend-quality`를 실패시키도록 구성했다. 로컬 설치·JS 검사·양 플랫폼 export와 CI 결과 집계 실패 사례를 실행했다. 당시 원격 CI는 미검증이었다.
- [x] 6단계에서 SCRUM-159 파일만 커밋·PR에 올렸고, 커밋 `8b38209`의 JS·Android·iOS job, 최종 `frontend-quality`, 제목·Jira 키 검사를 확인했다. 첫 온라인 Expo 실패는 패치 갱신으로 해결했고 요구 검사를 낮추지 않았다.
- [x] 159의 최신 필수 CI·GPT 리뷰·화면 증빙·대화 해결 후 PR #29를 squash 병합했고 Jira MERGED·완료를 확인했다.
- [ ] 159가 완료된 뒤 160의 환경/경로 구현→해당 테스트, 161의 mock/실제 모드 구현→해당 테스트·전체 재현을 진행한다. 이후 부모 선행에 따라 아래 기능별 표를 한 Subtask씩 따른다.

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

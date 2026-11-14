# FE 기능별 테스트·CI 도입 계획

작성 기준: 2026-10-14 KST · 계획 재검토: 2026-10-16 KST · SCRUM-166 검증·병합: 2026-11-04 KST · SCRUM-167 착수: 2026-11-04 KST · 1단계 최종 정리·2~3단계 구현: 2026-11-05 KST · 4~6단계 구현·검증: 2026-11-12 KST · 7단계 최종 정리: 2026-11-13 KST · SCRUM-168 착수: 2026-11-14 KST · 대상: Expo/React Native/TypeScript Android·iOS 앱
상태: **SCRUM-165(PR #33)·166(PR #35)·167(PR #36)은 development 병합·Jira 완료이며, SCRUM-168은 전용 작업 공간에서1~2단계 계약·기준선 확인과 AC별 검증 사례 구체화를 완료했다.** 168의 FE 출발점은 `41875136`, 부모123은 진행 중이고 Jira168은 해야 할 일이다. 168의 계약·보안 연결 보강과 실제 서버129는 남아 있다. 아래 과거 기록은 당시 실행 이력이며 새 기능의 통과 증거로 재사용하지 않는다.

## 목표와 현재 상태

이번 스프린트의 FE 작업을 구현할 때 각 Jira 완료 기준에서 정상 동작, 핵심 오류, 경계 조건을 테스트로 연결한다. **각 기능의 최소 동작을 구현한 직후 해당 기능의 테스트를 만들고, 같은 Subtask를 완료하거나 PR을 올리기 전에 통과시킨다.** 여러 기능이 이어져야 가능한 연결·기기·실서버 검증은 선행 기능이 준비된 뒤 수행한다. 로컬에서 먼저 검사하고, 같은 코드를 깨끗한 CI 환경에서도 검사한다.

- 현재 기준 기술은 Expo `57.0.33`, React Native `0.86.3`, React `19.2.3`, TypeScript `6.0.3`, Node `24.20.0`, npm `11.19.0`이다. 실제 기준은 변경 시 [`package.json`](../package.json), [`.nvmrc`](../.nvmrc), lockfile에서 다시 확인한다.
- 현재 `package.json`에는 `start`·`android`·`ios`와 실제 실행한 `lint`·`typecheck`·`test` 스크립트가 있다. 공통 `build` 스크립트는 없으며, 이 React Native 앱의 빌드는 Android·iOS별 네이티브 명령으로 검증한다. [CI 구성](../.github/workflows/ci.yml)은 필수 파일·스크립트, JS 검사·양 플랫폼 export, Android·iOS 네이티브 빌드의 실패·취소·건너뜀을 `frontend-quality` 실패로 연결한다. [PR #29의 실행 결과](https://github.com/DodamDodam-Capstone/frontend/actions/runs/38769299920)에서 JS·Android·iOS와 최종 집계가 모두 통과했다.
- 로컬 SCRUM-159의 1~5단계는 완료됐다. Pixel Tablet(Android API 36)과 iPad Pro 11형(iOS 26.5)에서 development build 컴파일·설치·가로 화면·재실행을 확인했다. 변경된 lockfile에서 설치·lint·typecheck·최소 화면 테스트와 Android·iOS JS export를 실행했다. 첫 PR의 온라인 Expo 검사는 `57.0.29` 대신 `~57.0.30`을 요구해 실패했고, 패치 갱신 후 로컬 온라인 검사와 깨끗한 checkout의 양쪽 네이티브 빌드, PR 원격 CI가 통과했다. Jira 상태와 로컬 단계 완료는 별개다.
- 이번 스프린트 범위는 [SCRUM-121](https://dodamdodam.atlassian.net/browse/SCRUM-121), [SCRUM-123](https://dodamdodam.atlassian.net/browse/SCRUM-123), [SCRUM-122](https://dodamdodam.atlassian.net/browse/SCRUM-122), [SCRUM-125](https://dodamdodam.atlassian.net/browse/SCRUM-125), [SCRUM-124](https://dodamdodam.atlassian.net/browse/SCRUM-124), [SCRUM-136](https://dodamdodam.atlassian.net/browse/SCRUM-136)의 부모 6개와 자식 19개다. 실제 서버 왕복은 별도 [SCRUM-129](https://dodamdodam.atlassian.net/browse/SCRUM-129)에서 검증한다.

Jira 원문과 최종 OpenAPI·ERD·확정된 후속 결정을 테스트의 기대값으로 삼는다. 이 문서의 사례는 현재 범위의 **검증 항목**이며, 미확정 API 필드·운영값·음성 제한을 새로 정하는 명세가 아니다.

## 실행 시작점과 작업 방법

이 문서는 2026-10-14에 작성하고 2026-10-15의 진행 상태와 2026-10-16의 CI 재검토를 반영했다. 후속 작업자는 먼저 현재 브랜치·변경 파일·해당 Jira의 최신 AC·실제 `package.json` 스크립트와 CI를 확인하고, 이미 완료된 단계를 반복하지 않는다. 변경된 사실은 최신 Jira와 실행 결과를 우선하며 이 계획의 해당 항목을 갱신한다.

**현재 작업 대상은 [SCRUM-168](https://dodamdodam.atlassian.net/browse/SCRUM-168)의 계약 테스트·민감정보 비저장 확인이다.** 아래168의 기준을 적용하고, 159~167 기록은 당시 실행 이력으로 보존한다. 후속 사용자 지시에 따라 각 단계의 검증을 통과하면 다음 단계로 이어가고 전체 구현·검증·로컬 리뷰 후 보고한다. 부모123과 실제 서버129의 완료와 구분한다.

- [x] 3단계에서 `expo-dev-client`를 설치하고 `npx expo run:android`로 Pixel Tablet(Android API 36), `npx expo run:ios --device 979FC60C-8633-430F-AB66-D324B8D31355`로 iPad Pro 11형(iOS 26.5)의 development build를 컴파일·설치·실행했다. 두 태블릿에서 가로 첫 화면과 재실행을 확인했다. 이 기기 ID는 해당 Mac의 시뮬레이터 식별자다. 이는 로컬 빌드 증거이며 CI 빌드나 실기기·실서버 검증 증거는 아니다. 최종 공유용 재현 명령·결과는 5단계 README·PR 검증란에 남긴다.
- [x] 4단계에서 `git status --short --branch`와 159·부모 121의 최신 AC를 대조했다. SDK 57용 Jest 29 계열·RNTL·renderer의 peer 관계와 실제 최소 테스트를 확인하고, `package.json`·lockfile에 `lint`·`typecheck`·`test` 스크립트를 구성했다. ESLint가 루트 앱·진입점·테스트 파일을 검사하는지도 확인했다. 별도 Jest setup 파일은 필요하지 않았다.
- [x] 4단계 의존성 변경 후 `npm ci`, `npx expo install --check`, `npm run lint`, `npm run typecheck`, `CI=true npm run test`를 로컬에서 다시 실행했다. 3단계의 설치·TypeScript 검사 결과를 새 lockfile의 통과 증거로 재사용하지 않았다. 테스트 0개는 종료 코드 1로 실패하며, 공통 `build` 스크립트가 없는 이유를 아래에 기록했다.
- [x] 5단계에서 `.github/workflows/ci.yml`과 README를 맞췄다. 필수 파일·스크립트 누락, 테스트 0개, Android/iOS JS export 또는 네이티브 빌드 실패가 `frontend-quality`를 실패시키도록 구성했다. 로컬 설치·JS 검사·양 플랫폼 export와 CI 결과 집계 실패 사례를 실행했다. 당시 원격 CI는 미검증이었다.
- [x] 6단계에서 SCRUM-159 파일만 커밋·PR에 올렸고, 커밋 `8b38209`의 JS·Android·iOS job, 최종 `frontend-quality`, 제목·Jira 키 검사를 확인했다. 첫 온라인 Expo 실패는 패치 갱신으로 해결했고 요구 검사를 낮추지 않았다.
- [x] 159의 최신 필수 CI·GPT 리뷰·화면 증빙·대화 해결 후 PR #29를 squash 병합했고 Jira MERGED·완료를 확인했다.
- [x] 160의 환경/경로 구현과 PR #30 병합을 확인했다. 161에서 모드 구현·해당 테스트를 작성했고 설치·양 플랫폼 번들·네이티브 빌드·태블릿 실행을 로컬에서 재현했다. 이후 부모 선행에 따라 아래 기능별 표를 한 Subtask씩 따른다.

### SCRUM-168 1단계 — 작업 공간·계약·기준선 확인 · 2026-11-14

사용자가 승인한 6단계 계획 중 **1단계만 완료**했다. 이번 변경은 착수 기록이며 제품 코드·테스트·의존성·CI·네이티브 설정은 변경하지 않았다. 2단계 AC별 기존 증거 매핑과 신규 테스트 작성은 아직 시작하지 않았다.

#### 출발점과 보존

- 작업 공간: `/Users/youngjun/.codex/worktrees/scrum-168-contract-security/frontend`, branch `feature/SCRUM-168-contract-security`.
- FE 출발점: development [`41875136bfb4c3569f9459293013b9f01d317ec0`](https://github.com/DodamDodam-Capstone/frontend/commit/41875136bfb4c3569f9459293013b9f01d317ec0). [SCRUM-167 PR #36](https://github.com/DodamDodam-Capstone/frontend/pull/36)의 2026-11-13 15:00:52 KST squash 병합 커밋이다. GitHub branch SHA와 fetch 후 `origin/development`의 일치를 확인하고 `--no-track`으로 새 브랜치를 만들었다. 공유 이력 재작성이나 기존 development checkout의 pull은 하지 않았다.
- BE 기준: development [`1e66ddb895789bbaf72c21e3b76441bce251aa61`](https://github.com/DodamDodam-Capstone/backend/commit/1e66ddb895789bbaf72c21e3b76441bce251aa61). 아래 계약 링크는 이 SHA에 고정한다.
- Jira [SCRUM-168](https://dodamdodam.atlassian.net/browse/SCRUM-168): 계획123-S4, 담당 고영준, 해야 할 일. 선행121·165·166·167은 완료, 부모123은 진행 중이다. 현재 스프린트 종료는 **2026-11-17 18:00 KST**이며 과거11/3 목표와 구분한다. Jira 상태·스프린트·댓글은 변경하지 않았다.
- 원래 checkout의 변경10개와 번역 worktree의 변경7개를 포함해 기존8개 작업 공간의 HEAD·브랜치·index 항목·diff·미커밋 파일 SHA-256을 전후 대조해 보존했다. 없어져 prunable로 표시된 과거 임시 worktree는 정리하지 않았다. 원래 경로의 `AGENTS.md`를 적용하며 새 worktree에 하위 AGENTS는 없다.

#### 적용 계약과 책임 경계

API 계약 **v3.1**, OpenAPI 문법 `3.0.3`과 `info.version: 3.1.0`을 구분한다. Jira가 참조하는 원문 공통 계약v0.4는 앞선 작업에서 출처로 기록한 자료이며 원문 세부 절 직접 대조를 수행했다고 주장하지 않는다. 이번에는 현재 게시된 다음 계약의 파일·절을 적용한다.

| 고정된 파일·절 | SCRUM-168 적용 내용 |
| --- | --- |
| [공통 §3·3.1·3.2·5](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/api/01-common.md) | 쿠키·POST CSRF·갱신, envelope와 예외, no-store, 오류 정보, 서버 추적 ID와 업무 ID, 민감정보 비기록 |
| [인증 §4.2~4.4·6.1·6.3~6.7](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/api/02-auth.md) | 인증번호·검증 토큰·가입·로그인의 실제 DTO, CSRF 발급, 로그인·로그아웃 갱신, logout204 |
| [보호자 §4.8·6.12~6.13](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/api/04-guardian.md) | PIN 본문·앞자리0, PIN 오류와 세션 만료 구분, lock0바이트 |
| [대화 §4.10·7.1·7.3·7.7](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/api/06-conversations.md) | clientRequestId JSON 운반, 시작201/200·429, resume/end0바이트와 명시적 종료 재확인 |
| [오류·복구 §9·미정 값 §10](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/api/08-errors-and-validation.md) / [OpenAPI paths·responses·schemas](https://github.com/DodamDodam-Capstone/backend/blob/1e66ddb895789bbaf72c21e3b76441bce251aa61/docs/p0/Integrated_OpenAPI.yaml) | endpoint별 HTTP/code·필수 필드·헤더, Retry-After, 미확정 값의 경계 |

- 정상 계약 fixture, 공통 운반 fixture, 비정상 응답 방어 fixture를 구분한다. 정상 오류의 `X-Request-ID`와 `error.requestId`는 같은 서버 UUID이며 업무 `clientRequestId`와 다르다. 시작201과 같은 endpoint의429에서 요청 준비→client→파서→복구 분류를 연결한다. 서버의 실제 멱등성 검증이나 재시도 스케줄러 구현으로 확대하지 않는다.
- 비밀번호·PIN·인증번호·검증 토큰은 해당 DTO의 본문, CSRF는 전용 헤더, 세션은 OS 쿠키 경로를 사용한다. 세션을 요청 DTO에 넣지 않는다. 공통 계층이 URL·로그·별도 영구 저장소·진단 산출물로 복사하지 않는지 검사하며 필요한 메모리 보유와 원문 오류 전달 계약은 유지한다. 일반 query는 그대로 전달되는 API이므로 모든 민감 query 자동 차단을 보장하지 않는다.
- 현재 테스트에서 다루는 인증번호·검증 토큰의 운반 검증도 재사용한다. 다섯 민감값마다 실제 실행·요청 횟수·결과 도달을 함께 확인한다. 웹 storage spy는 RN 전체 저장소 안전성의 증거가 아니다. 진단은 직렬화·전송 전 허용 필드 추출과 수신 후 검사를 유지한다.
- 후속 계정 store173·화면 연결174·실제 서버129·OAuth 실제 복귀 및 운영 쿠키/CORS 검증은 별도 책임이다. D13/D14·D17 미확정 운영값을 fixture 정책으로 만들지 않는다. 기존 클라이언트·파서·복구 API는 재사용하고 실제 결함이 확인될 때만 제품 코드를 최소 수정한다.

#### 승인된 실행 순서와 중간 지점

| 단계 | 수행 범위 | 종료 기준 |
| --- | --- | --- |
|1 작업 공간·계약 | 새 작업 공간, 기준 SHA·명세·환경, 기존 변경 보존, 고정 설치와 기본 검사 | 아래 이번 실행 결과와 보존 대조 확인. 제품 코드 미변경 |
|2 AC별 증거 매핑 | 부모AC1~5 → 기존 테스트 이름·검증 경계 → 누락·후속 책임 | 추가 테스트·정상/방어 fixture·기대 결과 확정 |
|3 계약 연결 보강 | 로그인/조회/로그아웃, 시작201·429의 업무/추적 ID, 기존 늦은 응답·CSRF 복구 재사용 | 실제 요청·파싱·분류·최종 반영과 횟수 확인, 관련 회귀 통과 |
|4 민감정보 비복사 | 확정 DTO별 다섯 민감값과 CSRF, URL·로그·연결된 저장 경로·보고서 | 허용 운반과 금지 복사를 구분하고 미실행으로 인한 잘못된 통과 방지 |
|5 로컬·네이티브·CI 준비 | 전체 Jest·환경·export, 기존 recovery15개×양OS, 변경 영향에 따른 확대 | 누락·중복·cleanup 실패 없이 최신 코드/환경에 결과 귀속 |
|6 리뷰·인계 | Astra 로컬 리뷰, 이 문서·필요한 README, 최종diff·보존 확인 | 로컬 PR 제출 준비. 요청 후 원격CI·GitHub 리뷰, 별도 요청한 병합/Jira 확인 |

2~3시간 회차마다 완료 지점·검증·커밋·다음 한 가지·차단 사항을 보고하고 단계별 사용자 확인 후 이어간다. 단계별 실제 변경과 검증이 있는 경우 SCRUM-168 키로 저장하며 준비만 한 경우 빈 커밋을 만들지 않는다. 이번 로컬 착수 승인은 push·PR 생성·병합·Jira 변경을 포함하지 않는다.

기본 네이티브 실행은 기존 recovery15개를 **각 OS에서 전부** 실행한다. 선택한 일부 사례는 전체 기대 목록과 비교하면 FAIL이므로 판정을 완화하지 않는다. 기존167 합성 프로토콜 실행은 런타임 회귀, 새DTO/ID는 Jest 계약 검증으로 구분한다. 전송·쿠키·취소·인증 수명주기·패치 변경 또는 Jest만으로 판단 불가능한 누출이 발견되면 관련 신규 사례와92개/OS 전체 행렬의 영향 범위를 정한다. 새 진단 행동을 추가할 때만 probe·receiver·report의 stage/허용필드/필수check/기대목록/cleanup을 함께 보강한다. 기존167 결과를168 신규 행동 검증으로 재명명하지 않는다.

#### 이번 실행 결과

로컬 환경은 macOS **27.2.1 (26B131), arm64**, Node **24.20.0**, npm **11.19.0**이다. 새 작업 공간의 제품/테스트/lockfile은 출발점41875136과 동일하다.

| 명령·확인 | 실제 결과 |
| --- | --- |
| `npm ci` | 성공. 967개 설치, Expo57.0.33/core57.0.26의 기존 네이티브4개 파일 패치 확인. lockfile 미변경 |
| `npx --no-install expo install --check` | 온라인 검사 성공, `Dependencies are up to date` |
| `npm run lint` | 성공, 오류·경고0 |
| `npm run typecheck` | 성공 |
| `npm test` | **26 suites / 704 tests 통과**, snapshot0. 기존 기준선이며168 신규 테스트는 아직 없음 |
| 기존8개 작업 공간 | HEAD·브랜치·index 항목·diff·변경파일 내용 보존 |

설치 중 감사 요약은 low9·moderate8, high/critical 보고0이며 deprecated 및 allowScripts 미등록 경고가 남아 있다. 이번에 의존성·설치 허용 정책을 변경하거나 `npm audit fix`를 실행하지 않았다. 별도 전체 재감사·취약점 수정 완료로 보고하지 않는다.

`test:env`, 양OS export·Swift 직접 실행·네이티브 빌드·probe·원격CI는 이번1단계에서 실행하지 않았다. 이들은5단계 및 PR 요청 후 검증으로 구분한다. 현재CI가 전체Jest를 실행하고 환경 주입·양OS export·Swift 회귀·양OS 빌드를 수행하는 것은 확인했으며 실제 OS probe 실행은 포함하지 않는다. 과거167의704/Swift55/네이티브92 결과를168 변경 후 통과 증거로 재사용하지 않는다.

증빙: `/private/tmp/scrum168-stage1-20261114-3px9ymgn/`의 `npm-ci.log`, `expo-check.log`, `lint.log`, `typecheck.log`, `jest.log`와 각 명령의 JSON 결과, `preservation-before.json`, `preservation-after.json`, `preservation-result.json`. 로그는 로컬 임시 증빙이며 저장소에는 이 요약만 남긴다.

#### 문서·현재 설정 차이와 다음 작업

CONTRIBUTING·팀/Jira 가이드·README·SECURITY·PR 템플릿·테스트 계획·실제 workflow는 위 FE 출발점에서 확인했다. 팀/Jira 가이드에는 다른 Write 권한자 승인1건 문구가 남아 있다. 반면 원래AGENTS·10/16 결정·README는 최신 GitHub GPT/Codex 리뷰를 요구한다. 11/14 development Ruleset21153783은 승인0, last-push 승인false, 대화 해결, strict 필수검사 `frontend-quality`·`gitmoji-conventional-title`·`jira-issue-key`, squash다. 차이를 기록하고 보호 설정이나 협업 문서를 이 작업에서 변경하지 않는다.

**현재 완료:** 1단계 작업 공간·계약·기존 기준선 확인. **다음 한 가지:** 사용자 확인 후2단계 AC1~5의 테스트별 증거·누락 매핑. **현재 차단:** 없음. 구현·전체SCRUM-168 완료, 원격CI·실서버 성공으로 확대하지 않는다.


### SCRUM-168 2단계 — 완료 기준별 증거·추가 사례 확정 · 2026-11-14

FE `41875136bfb4c3569f9459293013b9f01d317ec0`, BE `1e66ddb895789bbaf72c21e3b76441bce251aa61`와 Jira168·부모123의 상태·범위를 다시 조회해1단계와 같음을 확인했다. 읽은 작업 HEAD는 `9fad3a9baffea8ddbde11781cbcd3ec2ad67fc32`다. 아래는 실제 테스트 이름과 소스의 정적 대조 결과이며 새 테스트 실행 결과가 아니다. 제품 결함을 새로 재현한 것은 없고, 정상 DTO로 연결한 증거의 공백을 확인했다.

#### 부모 AC1~5와 재사용할 증거

파일 링크의 이름은 현 소스의 `it`/`it.each` 제목 그대로다. `%s`·`%i`·`$name` 등은 기존 매개변수 표기다.

| 완료 기준 | 기존 파일·정확한 테스트 이름 | 입증 범위·남은 경계 |
| --- | --- | --- |
| AC1 쿠키·POST CSRF | [client.test.ts](../src/api/client.test.ts): `생성만으로 요청하지 않고 GET은 쿠키 포함·캐시 금지·redirect 거절 설정으로 전송한다`, `동시 최초 POST는 하나의 CSRF 발급을 공유하고 발급 전에는 전송하지 않는다` | credentials/include·no-store·redirect/error와 초기 발급 공유. 실제 OS 쿠키 저장·송수신 증거와 구분 |
| AC1 인증 후 갱신 | [authTransition.test.ts](../src/api/authTransition.test.ts): `로그인 성공의 원래 응답을 보존하고 새 CSRF를 다음 POST에 사용한다`, `로그아웃 204는 0바이트 POST를 유지하고 익명 CSRF를 다시 준비한다` | 전환·갱신 프로토콜. 로그인 응답은 authenticated fixture이며 전체 정상 DTO 흐름은 C1에서 보강 |
| AC2 JSON·204 | [response.test.ts](../src/api/response.test.ts): `%i JSON envelope에서 nullable DTO 값을 보존한다`, `data:unknown을 변형하지 않으며 업무 DTO를 보증하지 않는다: %#`, `허용한204는 Content-Type이나 본문을 요구하지 않고 읽지 않는다` | envelope·null·204 본문 미읽기. 공통 파서가 업무 DTO validator라는 뜻은 아님 |
| AC2 0바이트 POST | [requestBody.test.ts](../src/api/requestBody.test.ts): `%s의 POST에 body를 추가하지 않고 쿠키·CSRF를 적용한다`; [response.integration.test.ts](../src/api/response.integration.test.ts): `0바이트 lock 요청의204는 읽기나 JSON 변환 없이 완료된다` | logout/lock/resume/end의 body 부재와 요청→응답 연결. 같은 사례 중복 추가하지 않음 |
| AC2 음성·빈 본문 | [response.binary.test.ts](../src/api/response.binary.test.ts): `성공 bytes를 변경하거나 JSON으로 읽거나 clone하지 않는다`, `0바이트200은 FE 빈2xx 규칙으로 거절하며204 성공으로 바꾸지 않는다`, `실제 client의 음성 GET은 쿠키를 포함하고 CSRF 발급 없이 bytes를 인계한다` | 합성 bytes 운반·빈200 거절. 실제 재생/codec·D13/D14 형식 확정 증거는 아님 |
| AC2 OAuth·302 | [oauth.test.ts](../src/api/oauth.test.ts): `복귀 URI나 그 query를 OAuth 시작 URL에 붙이지 않는다`, `주소 준비만으로 fetch·OS 이동·원문 로그를 실행하지 않는다`; [response.binary.test.ts](../src/api/response.binary.test.ts): `redirect:error로 거절된 전송을 관측302로 바꾸지 않는다` | 주소 준비와 redirect 결과 분리. 실제 브라우저 이동·복귀/세션 인계는126·129 |
| AC3 오류 전달 | [response.test.ts](../src/api/response.test.ts): `fields 누락만 빈 배열로 호환하고 미정의 필드를 결과로 복사하지 않는다`, `fields의 이름·사유를 전달하되 임의 원문 필드는 전달하지 않는다`, `대화 시작409 ACTIVE_CONVERSATION_EXISTS에서만 ID 확장을 보존한다` | code/fields/requestId 및 문맥별 확장. 정상 헤더/본문 추적ID 일치는 C3에서 연결 |
| AC3 HTTP/code 분류 | [recovery.test.ts](../src/api/recovery.test.ts): `%i %s를 별도 복구 종류로 전달한다`, `미등록 조합 %i %s를 인증 만료나 재시도로 추측하지 않는다`; [authContext.test.ts](../src/api/authContext.test.ts): `인증 성공+CSRF 갱신503 실패에도 전환 문맥과 인증 결과를 보존한다` | 순수 분류와 인증/갱신 결과 분리. 실제 화면·store 소비는173·174 및 해당 기능 책임 |
| AC3 늦은 반영 | [recovery.integration.test.ts](../src/api/recovery.integration.test.ts): `로그아웃 후 $nextAccount 상태에서 이전 $name 본문이 상태·CSRF를 바꾸지 않는다`, `파싱 완료 후 추가 await 중 재로그인해도 $name 결과를 반영하지 않는다`, `현재 문맥의 정상 결과는 반영된다` | 최소 수신자의 마지막 await 뒤 commitIfCurrent 및 긍정 대조군. 모든 실제 화면이 연결됐다는 증거는 아님 |
| AC3·4 동시성 | [recovery.integration.test.ts](../src/api/recovery.integration.test.ts): `동시401은 한 번만 만료·통지하고 원래 POST를 재실행하지 않는다`, `만료 통지의 비동기 정리가 끝날 때 새 로그인을 덮어쓰지 않는다`, `같은 버전의 두403은 복구1회로 연결되고 로그인 유지·원래POST2회를 보존한다` | 세대별 만료·비동기 정리·CSRF single-flight. 기존 회귀로 재사용 |
| AC4 자동 재전송 금지 | [response.integration.test.ts](../src/api/response.integration.test.ts): `%i 오류 해석이 CSRF 갱신이나 POST 재전송을 일으키지 않는다`; [csrfRecovery.test.ts](../src/api/csrfRecovery.test.ts): `분류한 CSRF 오류만 복구하고 원래 POST를 재실행하지 않는다` | 401·403·429·503와 명시적 CSRF 복구. C3에서도 업무 POST1회 확인 |
| AC4 대기·준비 실패 | [recovery.test.ts](../src/api/recovery.test.ts): `%s를 정확한 초로 전달한다`, `누락은 대기 시간이 확정되지 않은 상태다`, `%s를 기본 지연이나 즉시 재시도로 보정하지 않는다`; [csrfFailure.test.ts](../src/api/csrfFailure.test.ts): `초기429에서 POST는 미전송이며 헤더를 먼저 전달하고 공유된 본문을 한 번만 읽는다`, `인증 성공 뒤 갱신%i 실패를 인증 결과와 분리하고 POST를 재전송하지 않는다` | Retry-After 정수 초/누락/invalid와 인증 성공 후 실패 분리. 임의 기본 지연이나 scheduler 추가 없음 |
| AC5 민감값 운반 | [requestBody.test.ts](../src/api/requestBody.test.ts): `JSON에만 합성 자격 증명을 담고 URL·로그·저장소로 복사하지 않는다`; [recovery.security.test.ts](../src/api/recovery.security.test.ts): `성공 응답까지 처리해도 자격 증명은 요청 본문·CSRF 헤더에만 전송한다` | 기존 password/PIN/code/verificationToken 운반 증거. login에 여러 값을 함께 넣은 fixture는 endpoint DTO 증거가 아니므로 S1·S2와 기존 사례 보강 필요 |
| AC5 오류·예외 비복사 | [recovery.security.test.ts](../src/api/recovery.security.test.ts): `오류 원문·fields·requestId를 메모리에 보존하면서 로그·저장소·추가 URL로 복사하지 않는다`, `%s 예외의 합성 민감값을 반환·로그에 노출하지 않는다`; [csrfFailure.test.ts](../src/api/csrfFailure.test.ts): `HTTP 실패 객체를 직렬화해도 원시 Response 본문·쿠키를 포함하지 않는다` | 오류 원문의 필요한 메모리 보유와 외부 복사 금지를 구분. 예외 fixture에 인증번호·검증 토큰 추가 예정 |
| AC5 진단 출력 | [report.test.js](../scripts/native-session/report.test.js): `전송 직전 원시 CSRF 실패·응답·예외·임의 키를 enum/count/boolean으로 제한한다`; [recoveryReceiver.test.js](../scripts/native-session/recoveryReceiver.test.js): `보고서는 허용된 검사·횟수만 기록하고 원문·헤더·임의 필드를 버린다` | 송신 전·수신 후 허용 필드 추출. 실제 OS probe는5단계, 개발자 도구 전체의 민감값 제거를 보장하지 않음 |

`response.integration.test.ts`의 기존201은 자녀 생성이며, `clientRequestId`의 기존 사례는 FormData 운반이다. 대화 시작 JSON의 업무ID와 서버 추적ID를 연결한 정상201·429는 없다. `response.test.ts`의 `body UUID를 v4로 제한하지 않고 헤더 ID 불일치·Retry-After를 원형 보존한다`와 `recovery.test.ts`의 `fields 누락의 빈 배열과 서로 다른 본문/헤더 requestId를 보존한다`는 비정상 입력의 보존 시험이며 정상 서버 계약의 ID 일치 증거로 쓰지 않는다.

#### 3단계에 추가할 정상 계약 사례 — 아직 미구현·미실행

기존 [response.integration.test.ts](../src/api/response.integration.test.ts)에 아래3개만 추가한다. 실제 prepareRequestBody/client/parser/classifier와 최소 동기 수신자를 사용하고 fetch 응답만 합성한다. 업무 DTO validator·상태 store·API별 service·새 공용 테스트 프레임워크를 만들지 않는다.

| 사례·예정 제목 | 요청·기대 결과·종료 조건 |
| --- | --- |
| C1 `확정 DTO로 로그인·계정 조회·0바이트 로그아웃과 CSRF 갱신을 연결한다` | 동일 client에서 GET csrf→POST login→GET csrf→GET me→POST logout→GET csrf, 총6회. login은 email/password만, 응답은 AccountView 전체 필드와 nullable 값. me는 body·CSRF 헤더 없는 GET. logout은 로그인 후 token을 쓰는 body 없는 POST,204 본문 미읽기. 인증 결과·갱신 성공을 각각 확인하고 마지막 await 후 현재 문맥에서만 테스트 상태를 반영한다. 로그인/로그아웃 POST 각1회, 최종 prepareCsrf는 추가 요청 없이 성공 |
| C2 `대화 시작201의 업무 ID와 서버 추적 ID를 구분하고 Location을 자동 요청하지 않는다` | POST children/{childId}/conversations에 clientRequestId=A 하나만 보냄. StartConversationResult의 conversationId/status/startedAt/serviceDate/scheduledEndAt을 그대로 인계. 서버 X-Request-ID=B, A≠B. 명세의 상대 Location 보존, 분류 none·현재 문맥 반영1회. csrf1회+업무POST1회, 추가 GET 없음 |
| C3 `대화 시작429의 추적 ID·대기 정보를 전달하고 인증 만료·자동 재전송하지 않는다` | 같은 시작 DTO의 A와 별개인 B를 오류본문 requestId와 X-Request-ID에 동일하게 사용.429 RATE_LIMITED·fields·Retry-After 전달, rate_limited 분류·현재 문맥 유지. Retry-After의2초는 합성 관측값이며 운영 기본값이 아님. csrf1회+업무POST1회, 오류 해석 뒤 추가 발급·POST·만료 통지 없음 |

기존 authTransition 성공 fixture, 확정 DTO 로그인→CSRF까지만 연결한 response.integration 사례, 로그인 body 없는 recovery.integration 전환 helper를 C1 전체 흐름의 증거로 대체 인용하지 않는다. 늦은 응답·single-flight·만료 사례는 위 기존 테스트를 회귀 실행하며 복제하지 않는다. C2·C3의 classifyRecovery operation은 기존 `general`을 사용한다.

#### 4단계에 보강할 비복사 사례 — 아직 미구현·미실행

[recovery.security.test.ts](../src/api/recovery.security.test.ts)의 기존 출력/웹 storage 관측·정확한 URL 대조를 재사용한다. 정상 계약 오류는 민감값을 echo하지 않으며, 오류 message/fields에 민감값을 넣은 기존 방어 fixture는 그 목적을 유지한다.

| 대상 | 확정할 관측·변경 |
| --- | --- |
| 비밀번호·CSRF·세션 | 기존 성공 사례를 email/password와 정상 AccountView 응답으로 보강한다. 이는 요청 운반/분류 시험이며 전체 인증 전환은 C1이 담당한다. body·CSRF 헤더 허용 운반, Set-Cookie가 선택 메타데이터·진단으로 복사되지 않음, credentials/include·caller Cookie/Authorization 부재를 확인. 세션을 DTO에 넣지 않음 |
| S1 `PIN 해제 오류를 전달하면서 PIN을 URL·로그·저장소로 복사하지 않는다` | 실제 GuardianUnlockRequest `{pin}`으로 POST guardian/unlock. 앞자리0인4자리 문자열 보존,400 PIN_INVALID 정상 오류를 parse/classify해 pin_invalid 인계, 현재 문맥 유지. csrf1회+POST1회, 정상 결과 도달·오류 인계까지 확인해 미실행 통과 방지 |
| S2 `인증번호 검증과 가입에서 번호·검증 토큰을 허용 본문 외부로 복사하지 않는다` | verify에 challengeId와 앞자리0인6자리 code→200 VerificationGrant의 verificationToken/tokenExpiresAt→signup에 verificationToken/password→201 accountId. 토큰은 UUID+점+43자 Base64url 형식의 합성값, 새 비밀번호는15~128 코드포인트. 파싱한 토큰의 메모리 전달은 허용하며 URL·로그·웹 storage로 복사하지 않음. csrf1회+각POST1회, 가입 뒤 자동로그인·추가 발급 없음. Location의 실제 endpoint 형태를 임의로 확정하지 않음 |
| 예외·진단·취소 | 기존 transport/body 예외 fixture에 code·verificationToken을 포함한다. 오류 원문 보유·취소/복구 실패·report/receiver 허용목록 테스트를 재사용하고 새 진단 프레임워크는 만들지 않는다 |

검사는 실행된 요청·정확한 본문·응답 읽기·분류·수신자 호출 횟수를 함께 확인한다. `console.log/info/warn/error/debug`와 웹 `localStorage/sessionStorage.setItem` spy의 통과 범위는 해당 JS 경로다. 제품 소스의 저장 API/로그 호출 및 신규 import를 함께 검토하며 RN AsyncStorage/SecureStore 전체·OS 쿠키 저장·DevTools/전이 의존성 안전성으로 확대하지 않는다. 세션 쿠키의 OS 보관은 인증 전송에 필요한 경로이고 별도 영구 저장소 복사 금지와 구분한다.

#### 검증·후속 책임·이번 종료 지점

- 3단계는 대상 integration 테스트와 기존 client/authTransition/requestBody/response/binary/oauth/authContext/recovery/csrfRecovery/csrfFailure 회귀 및 lint/typecheck를 실행한다. 4단계는 보안·본문·진단 report/receiver 회귀와 필요한 정적 검사를 실행한다. 실패하면 먼저 결함을 재현하고 제품 코드 수정 필요성을 판단한다.
- 5단계 전체 Jest·test:env·양OS export와 recovery15개×양OS를 실행한다. 현재CI는 전체Jest를 발견하므로 기존 파일의 신규 테스트도 포함되며 runtime probe는 CI 밖의 로컬 증거다. 신규 native 행동이 필요할 때만1단계의 probe/receiver/report 동시 보강 조건을 적용한다.
- 공통 계층은 결과·문맥·복구 의도를 인계한다. 실제 계정 정리173·화면/store 소비174, 해당 기능124/125, OAuth 실제 이동/복귀126, 실제BE/쿠키/CORS·서버 멱등성129의 책임은 유지한다. 129 완료를168의 새 선행으로 만들지 않는다. 현재 단계에서 이슈·운영값·승인 절차를 추가하지 않았다.
- 이번2단계는 문서만 변경했다. 실제 테스트 제목·파일 링크·diff 공백 오류를 검증하고, 제품/테스트/스크립트/설정71개 파일의 SHA-256과 기존8개 작업 공간 보존을 확인한다. 제품 변경이 없으므로1단계의26 suites/704 tests 기준선을 반복 실행하지 않았으며 신규 사례는 아직 통과로 표시하지 않는다.
- 증빙: `/private/tmp/scrum168-stage2-20261114-uq603ya4/`의 코드 해시·테스트 참조 검증·작업 공간 스냅샷·최종 결과. 저장소에는 이 요약만 남긴다.

**2단계 완료 지점:** AC별 재사용 증거와 계약3개·보안2개 추가 사례 확정. **다음:** 3단계 계약 연결 테스트 구현. **차단:** 없음. 사용자의 후속 지시에 따라 단계별 검증을 통과하면 자동으로 다음 단계로 진행하고, 전체 구현·검증·로컬 리뷰 후 보고한다. push·PR·병합·Jira 변경은 별도 요청 범위다.


### SCRUM-167 1단계 — 작업 공간·계약·API 기준 · 2026-11-04~05

이 절은 승인된 7단계 중 **1단계의 완료 기록과 2~7단계의 구현 계약**이다. 아래 API는 아직 제품 코드에 추가하지 않았다. 기존 단계 기록은 당시의 증거로 보존하고, 이후 단계의 변경·판단·검증 결과를 이 문서에 이어 기록한다.

#### 출발점·적용 근거

- 작업 공간: `/Users/youngjun/.codex/worktrees/scrum-167-error-auth-recovery/frontend`, branch `feature/SCRUM-167-error-auth-recovery`.
- FE 출발점: development [`da9493fb883442e771d0bee99fddef8c5d88d5ec`](https://github.com/DodamDodam-Capstone/frontend/commit/da9493fb883442e771d0bee99fddef8c5d88d5ec). SCRUM-166 PR #35 병합을 포함한다. fetch 후 GitHub branch SHA와 일치를 확인했다. 작업 브랜치의 초기 `origin/development` upstream은 해제했으며, 공유 시 해당 feature branch를 명시한다.
- Jira [SCRUM-167](https://dodamdodam.atlassian.net/browse/SCRUM-167): 계획123-S3, 담당 고영준, 진행 중, 부모123 진행 중. 선행121·165·166은 완료이며 후행168은 해야 할 일이다. 이 단계에서 Jira를 변경하지 않았다.
- 원래 checkout의 변경10개·번역 worktree의 변경7개 및 문서178·165·166·179 worktree의 HEAD/index/미커밋 파일 해시를 기록했다. 해당 변경은 이 작업 공간에 가져오지 않는다. 원래 경로의 `AGENTS.md`를 적용한다.
- BE 기준: development [`bb11afdd2a26888ce05feae29b11df73366fdb7e`](https://github.com/DodamDodam-Capstone/backend/commit/bb11afdd2a26888ce05feae29b11df73366fdb7e). 아래 계약 링크는 모두 이 SHA에 고정한다. API 계약 v3.1과 OpenAPI 문법3.0.3/`info.version: 3.1.0`을 구분한다.

| 파일·절 | 이번 적용 내용 |
| --- | --- |
| [공통 §3·3.1·3.2·5](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/01-common.md) | 세션·CSRF·무효화, 오류 필드, 서버 추적 ID, 비저장, POST 재실행 금지 |
| [인증 §6.1·6.5·6.7](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/02-auth.md) | CSRF 전용200, LOGIN_FAILED와 세션 상실 구분, 로그인/로그아웃 후 갱신 |
| [오류·FE 복구 §9·미정 값 §10](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/08-errors-and-validation.md) | HTTP/code별 복구와 Retry-After, 미확정 운영값을 만들지 않는 경계 |
| [보호자 §6.11~6.14](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/04-guardian.md) / [대화 §7.1·7.3·7.7](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/06-conversations.md) | 권한·내용 차단의 기능 인계, end202의 명시적 재확인 계약 |
| [OpenAPI paths·responses·schemas](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/Integrated_OpenAPI.yaml) | endpoint별 허용 HTTP/code, 오류 타입·필수값·헤더 |
| [AuthStateErrorHandler](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/src/main/java/com/dodamdodam/backend/auth/session/AuthStateErrorHandler.java) / [CsrfAccessDeniedHandler](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/src/main/java/com/dodamdodam/backend/global/auth/CsrfAccessDeniedHandler.java) | 실제 Java의401 AUTHENTICATION_REQUIRED,403 CSRF_INVALID,503 AUTH_STATE_UNAVAILABLE 구분 |

Jira96의 `Backend_P0_Common_Spec.md v0.4`는 이전 원문 출처다. 현재 [OpenAPI source manifest](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/Integrated_OpenAPI.yaml#L5961)에 원문 이름·SHA256이 기록돼 있고, [p0 README](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/README.md#L21)는 원문을 게시하지 않는다고 설명한다. 원문 v0.4의 세부 절 직접 대조는 미실행이며, 현재 Jira94/95와 v3.1의 확인된 정책을 적용한다. 버전 숫자 차이를 충돌로 판정하지 않는다. 현 BE에 CSRF·logout 등 구현은 있지만 이메일 로그인/auth-me/공통429 전체 구현을 확인한 것은 아니다. permitAll 경로 선언을 구현 완료로 해석하지 않으며 실제 서버 검증은129의 책임이다.

#### 파일 경계와 API 결정

`client.ts`가 하나의 쿠키 문맥에 대한 인증 세대를 계속 소유한다. `csrf.ts`의 발급 버전은 토큰 유효성·복구 중복 방지용이며 인증 세대와 용도가 다르다. `response.ts`는 기존의 순수 형식 파서다. 새 `src/api/recovery.ts`는 분류·대기 정보·CSRF 실패 해석을 담당하고 전역 store, 화면 이동, 재시도 scheduler를 소유하지 않는다. DTO·보호자/대화 상태와 실제 화면 반영은 각 기능에 인계한다.

다음 이름·형태를 2~4단계 구현 기준으로 고정한다. 새 타입의 상세 discriminant는 아래 동작과 일치시켜 인접 테스트에서 확인한다.

| API/결과 | 계약 |
| --- | --- |
| `AuthContext` | client에 귀속된 불투명 메모리 객체. 세션값·계정 ID·CSRF token을 담지 않는다. 다른 client의 객체·없는 객체는 유효하지 않다. 숫자 세대를 호출자가 만들거나 수정하지 않는다. |
| 기존 `request(request)` / `ApiResult` | 요청 허용 후 첫 비동기 대기 전에 문맥을 캡처한다. `response`와 `transport_error` 결과에 읽기용 `context`를 추가한다. `not_sent`/`stale_response`는 상태 반영 권한을 제공하지 않으며 기존 kind의 전송 의미를 보존한다. POST의 실제 token 버전은 prepare 이후 헤더를 붙이는 시점에 문맥 내부에 연결한다. |
| 기존 `authTransition(request, classify)` / `AuthTransitionResult` | 전환 시작의 세대 증가 직후 자체 문맥을 만들고 상위 결과의 `context`로 전달한다. operation/outcome/refresh는 계속 분리한다. gate 안의 classifier·갱신은 전환 소유 문맥으로 검사하며, 외부 반영은 gate 해제 후 현재 문맥 검사로 수행한다. 완료 시 새 문맥을 다시 캡처해 이전 결과를 최신처럼 포장하지 않는다. |
| `isCurrentContext(context: AuthContext \| undefined): boolean` | 같은 client·현재 세대·인증 전환 중이 아님을 확인한다. 정상 데이터뿐 아니라 오류와 후속 정리에도 적용한다. CSRF-only 갱신만으로 인증 문맥을 만료시키지 않는다. |
| `commitIfCurrent(context, apply: () => undefined): boolean` | 최종 비동기 처리 뒤 검사와 동기 반영을 연속 실행한다. stale이면 apply 호출0회. Promise 반환 callback은 typecheck에서 거부한다. 내부에서 시작한 비동기 작업의 나중 반영은 이 호출이 보호하지 않으므로 마지막 await 뒤 다시 호출해야 한다. |
| `expireIfCurrent(context, onExpired: (next: AuthContext) => undefined): boolean` | 현재 문맥의 계약상 만료만 한 번 무효화하고 CSRF 준비를 해제한 뒤 동기 통지한다. 같은 옛 문맥의 후속 오류는 false이며 재통지하지 않는다. 비동기 상태 정리는 전달된 next 문맥을 마지막 await 뒤 확인한다. 세대를 이전 값으로 되돌리지 않는다. |
| `recoverCsrf(context): Promise<CsrfRecoveryResult>` | 현재 일반 POST의 실제 전송 token 버전만 복구한다. 결과는 refreshed/already_recovered/skipped/failed로 구분하고 실패 원인을 전달한다. 오래된 문맥·전송 token 없음·인증 전환 중에는 새 발급을 시작하지 않는다. 원래 POST를 실행하지 않는다. 인증 전환은 이 함수를 호출하지 않고 전환 소유 문맥으로 기존 내부 발급 경로를 유지하며, refresh는 기존 CsrfResult를 반환한다. 두 경로는 CsrfFailure의 오류 해석만 공유한다. |
| `parseRetryAfter(raw: string \| null): RetryAfterResult` | valid(seconds)/missing/invalid. HTTP 선택 공백을 정리한 ASCII 십진 정수이며1 이상, JS 안전 정수로 정확히 표현 가능한 값만 valid다. 이는 FE 표현 한계이며 서버 운영 상한을 새로 정하는 것이 아니다. 0·음수·소수·날짜·지수·합쳐진 값·범위 초과를0이나 기본 지연으로 보정하지 않는다. 타이머를 만들지 않는다. |
| `classifyRecovery(result: ParsedApiResponse, operation: RecoveryOperation): RecoveryDecision` | operation은 general/login/conversation_end. HTTP·code·호출 문맥으로 복구 종류와 대기 정보를 반환하는 순수 함수다. 일반 성공으로 로그인 확정을 하지 않는다. 원래 오류 필드·메타데이터를 손실 없이 인계하고 미정의 조합은 unclassified로 전달한다. conversation_end202는 호출자의 EndPendingReceipt 검증 이후에만 적용하며 자동 end 호출은 하지 않는다. |
| `readCsrfFailure(failure: CsrfFailure): Promise<ParsedApiResponse \| undefined>` | 비200 HTTP 실패만166 파서로 읽는다. CSRF 정상200은 전용 parser를 유지한다. non-200 Response와 선택 헤더는 실패 결과에 메모리로 보관하고, body 읽기는 요청/CSRF cookie-header drain 바깥에서 한 번 수행한다. 통신 실패는 HTTP/code를 생성하지 않는다. |

CSRF 실패는 헤더 수신 시 status·선택 헤더를 확보한다. 기존 `requestId`는 유효한 헤더 ID라는 의미를 유지하고, body의 error.requestId와 덮어쓰지 않는다. 본문 지연/읽기 실패도 헤더 정보에 접근할 수 있어야 한다. 일반 요청의 body와 비200 CSRF 오류 body를 새로 logout 대기에 포함하지 않는다. 반면 기존 CSRF 정상 발급/일반 요청의 쿠키 응답 순서는 보존한다.

CSRF 복구는 같은 실패 token 버전의 진행 중 Promise를 공유한다. 늦은 같은 버전 오류가 새로 발급한 token을 다시 지우지 않는다. 그 복구가 실패했다면 동일 요청 문맥의 반복 처리로 무한 재발급하지 않고 실패를 전달한다. 새 시도는 현재 상태와 사용자 의도를 확인한 호출부의 명시적 요청으로 구분한다. 이미 시작된 쿠키 응답을 기다리는 동안 인증 전환이 시작되면 세대를 재확인해 이전 복구를 중단하며, 내부 발급이 자기 gate 또는 자기 inFlight를 기다리지 않게 한다.

#### 오류·복구 결정표

| 입력 | 공통 처리 / 후속 책임 |
| --- | --- |
|401 AUTHENTICATION_REQUIRED | 현재 문맥만 무효화·통지. 로그인 복귀는124/125, 새 로그인 후 CSRF 갱신은165의 전환 경로. 원래 POST 재실행 없음. |
|401 LOGIN_FAILED | 로그인 입력 실패 전달. 다른401/일반 오류를 이 코드로 대체하지 않고 인증 성공/전역 만료를 추측하지 않음. |
|403 CSRF_INVALID | 현재 일반 POST만 위 recoverCsrf 경로. 로그인·현재 업무 상태 확인 정보를 전달. CSRF-only 복구가 로그인 해제 통지를 발생시키지 않음. |
|403 PIN_SETUP_AUTHORIZATION_REQUIRED / PIN_RESET_AUTHORIZATION_REQUIRED / GUARDIAN_UNLOCK_REQUIRED | 목적별 이메일 재인증 또는 PIN 확인 정보 전달. 현재 로그인 전체의 만료로 처리하지 않음. |
|403 CHILD_SESSION_REQUIRED / SERVICE_HOURS_CLOSED,409 CONVERSATION_CLOSING / CONVERSATION_ENDED | 명시 resume·입력/내용/재생 차단·Home 갱신 등 업무 상태를 담당 기능에 전달. 공통 계층에서 화면/대화 자원을 직접 변경하지 않음. |
|400 VALIDATION_FAILED / VERIFICATION_INVALID 및 기타 계약상 업무 오류 | fields/code/requestId와 복구 분류 전달. 자동 반복 없음. ACTIVE_CONVERSATION_EXISTS의 ID 확장은166의 conversation_start 문맥에만 유지. |
|429 RATE_LIMITED | 유효한 Retry-After 이후 시도 가능 정보 전달. missing/invalid는 대기 미확정이며 즉시 재시도를 허용하는0으로 처리하지 않음. 폐기된 challenge의 복구를 대기만으로 확정하지 않음. |
|202 검증된 EndPendingReceipt | conversation_end 문맥에서 Retry-After 이후 동일 end 재확인 정보를 제공. 실제 재확인·종료 판정은141 등 해당 업무 소유. 일반POST 재시도 정책으로 확대하지 않음. |
|503 AUTH_STATE_UNAVAILABLE / EMAIL_DELIVERY_UNAVAILABLE | 확인/전달 장애와 결과 확인 필요 전달. 로그인 성공·비로그인·메일 성공으로 치환하지 않고 Retry-After 유무만으로 POST 재전송하지 않음. |
|미전송·통신/형식/읽기 오류·미등록 HTTP/code·stale | 기존 종류와 메타데이터 보존. 응답/통신 실패를 미전송으로 바꾸지 않음. stale의 성공·오류는 CSRF 변경을 포함한 효과에 적용하지 않음. |

#### 단계별 구현·검증 행렬

| 단계 | 변경/검증 위치 | 중간 완료 기준 |
| --- | --- | --- |
|1 작업 공간·계약 | 이 문서, 현재 Git/Jira/명세/CI와 기존 코드 조회 | 위 출발점·API 결정·기준선 확인. 제품 코드는 미변경. |
|2 오류·메타데이터 | `src/api/recovery.ts`, `csrf.ts`, 인접 `recovery.test.ts`·기존 response/client 테스트 | 분류표, fields/requestId 보존, Retry-After 최소1·누락·잘못된 값·안전 정수 경계, 초기 발급429, 인증 성공+갱신429/503, 오류 body 실패. 실패하는 테스트를 먼저 확인하고 구현 후 통과. |
|3 인증 문맥 | `client.ts`와 `authTransition.test.ts`, 새 `authContext.test.ts` | 요청 전 캡처, 다른 client 거부, 같은 계정 재로그인, 전환 내부/외부 판정, 동시 만료 통지1회, 만료 후 비동기 정리 중 새 로그인 보호. 동기 callback 타입 검사 포함. |
|4 CSRF 복구 | `client.ts`·`csrf.ts`, 새 `csrfRecovery.test.ts` | 발급 중 무효화 뒤 token 복원/준비 성공 없음, 실제 전송 token 버전, 같은 버전 동시/늦은403 중복 발급 방지, 실패 복구 반복 방지, 새 token 오류의 정상 복구, 전환 경쟁·자기 대기 교착 없음, POST1회. |
|5 수신자·회귀·비저장 | `src/api/recovery.integration.test.ts`, 기존 response integration 및 필요한 테스트 수신자 | 지연 성공/오류+로그아웃, 타/동일 계정 재로그인, 파싱 후 추가 await 전환, 정상 대조. final state와 수신자/요청 횟수 모두 검사. 가짜 비밀값이 URL·console·저장소 호출·증빙에 없는지 성공/실패/취소/복구 실패와 message/fields까지 확인. |
|6 Android·iOS | 기존 `scripts/native-session` probe와 receiver 확장 | 양 OS 지연 본문·늦은 오류·CSRF 무효화·복구, 기존 요청/응답/인증 회귀, 요청 횟수·이벤트 순서·cleanup 확인. 서버는 합성 loopback이며 실제 BE 검증과 구분. |
|7 리뷰·CI 준비·인계 | 최종 diff·이 문서·필요한 README 설명 | AC1~6 대응, 로컬 리뷰, 전체 Jest CI 포함,173/174 사용 책임 인계. PR 요청 후 최신 commit의 원격 CI와 GitHub 코드 리뷰를 별도로 확인. |

순서: 1→2→3→4→5→6→7. 단계마다 관련 lint/typecheck/테스트를 실행하고 변경 범위를 확인해 SCRUM-167 커밋으로 저장한다. 사용자의 단계별 보고·확인 후 다음 단계로 진행한다. 별도 Jira 업무나 문서를 매 단계 생성하지 않는다. PR/push/병합/Jira 변경은 별도 요청 범위다.

원격 CI의 `js-quality`는 전체 Jest·lint/typecheck·환경 검사·Expo 검사·양 OS export를 실행하고, Android/iOS job은 네이티브 **빌드**다. loopback 경합 probe의 실제 실행을 대신하지 않는다. 단위·연결 테스트 통과, 양 OS 실행, 원격 빌드/필수 CI, 실제 서버129를 각각 기록한다.

#### 문서·실제 설정 차이

이 작업의 CONTRIBUTING/팀 가이드/README/테스트 계획은 위 FE development 출발점의 파일이다. 기본159 checkout의 미커밋 문서를 적용본으로 가져오지 않는다. development 팀 가이드·Jira 가이드에는 사람 승인1건 문구가 남아 있지만 README·10/16 결정·원래 AGENTS는 최신 GitHub 코드 리뷰를 요구한다. 11/4 실제 development Ruleset은 승인0·last-push 승인false·대화 해결·strict 필수 CI3개·squash이며, main은 승인0이지만 last-push 승인true·merge다. 이 차이를 기록하고 보호 설정이나 팀 문서를 이 작업에서 완화하지 않는다.

#### 1단계 실행 결과와 다음 작업

- 최종 실행 환경: Node24.20.0 / npm11.19.0. 작업 셸마다 `export PATH='/Users/youngjun/.nvm/versions/node/v24.20.0/bin':"$PATH"`로 명시하고 버전을 확인했다. 프로젝트 기준 자체는 `.nvmrc`·package.json이며 위 절대 경로는 이 Mac의 재현 경로다.
- 최초 권한 확장 셸은 Node26.5.0/npm11.17.0을 선택해 manifest 검사에서 실패했다. 고정 버전을 명시하여 설치와 기준선 전체를 재실행했고 아래 최종 결과는 Node24 실행만 사용한다. 제품 코드의 테스트 실패를 수정한 것이 아니다.
- `npm ci` 성공, Expo57.0.31 본문 오류 패치3파일 검증 성공. 설치 감사는 low6·moderate42가 남았으며 high/critical은 보고되지 않았다. 전체 무취약 상태로 표현하지 않는다. fsevents/unrs-resolver 설치 스크립트 allowScripts 미등록 경고는 남았고 허용 설정을 임의로 변경하지 않았다.
- `npm run lint`, `npm run typecheck`, `npm test` 모두 성공. Jest **18 suites / 467 tests** 통과. `npm run test:env`14개, manifest 검사, 온라인 `npx --no-install expo install --check`도 성공했다.
- 이 단계에서 새 기능 테스트·네이티브 실행·export/네이티브 빌드·원격 CI·실제 서버 시험은 실행하지 않았다. 기존 테스트 통과를 SCRUM-167 기능 통과로 보고하지 않는다.
- 로컬 증빙: `/private/tmp/scrum167-stage1/*-node24.log`, 보존 기준 `/private/tmp/scrum167-preservation-before.json`. 임시 파일은 저장소에 포함하지 않는다.
- 11/5 문서 검토에서 일반 POST의 recoverCsrf와 인증 전환 내부 갱신 경로의 혼동을 수정했다. 전환은 gate 안에서 기존 발급 경로를 유지하고 오류 해석만 공유한다. 제품 코드 변경은 없다.
- 현재 완료: **1단계 작업 공간·계약·API 기준·기준선 검증**. 다음 한 가지: 승인 후 **2단계 오류 분류·메타데이터 전달**. 알려진 착수 차단 없음. v0.4 원문 직접 대조와 실서버/미구현 BE 경로의 재현 한계는 위 근거에 남긴다.

### SCRUM-167 2단계 — 오류 분류·메타데이터 전달 · 2026-11-05

- FE/BE development SHA와 Jira167의 AC1~6·담당·진행 상태·선행 완료가 1단계와 같음을 재확인했다. Jira의 현재 active sprint 종료는 **2026-11-17 18:00 KST**로 조회됐다. 과거11/3 목표와 구분하며 스프린트나 Jira를 변경하지 않았다.
- `src/api/recovery.ts`의 `classifyRecovery`는 정확한 HTTP/code 조합과 general/login/conversation_end 문맥으로 분류한다. 원래 ParsedApiResponse를 `result`로 보존하여 code/message/fields/본문 requestId와 헤더 메타데이터를 유지한다. LOGIN_FAILED는 login 문맥에서만 분류하고, 미정의 조합·형식/읽기 오류는 unclassified다. 일반 성공·이동·바이너리를 인증 성공으로 확정하지 않는다.
- PIN_INVALID를 포함한 v3.1의 확정 업무 오류도 별도 kind로 인계한다. AUTH_STATE_UNAVAILABLE와 EMAIL_DELIVERY_UNAVAILABLE를 구분하며, 후자는 폐기된 challenge 확인 후 제한 내 새 발급이 호출부 책임이다. 분류 함수는 화면·store·네트워크·타이머를 변경하지 않는다.
- `parseRetryAfter`는 HTTP OWS를 제외한 ASCII 십진 정수초(1 이상, JS 안전 정수)만 valid로 반환한다. missing/invalid를0이나 기본 지연으로 보정하지 않는다. 대기 정보는 RATE_LIMITED429와 적격 end202에만 붙이며 자동 POST 재전송은 없다.
- **계획 구체화:** 문자열 operation만으로 DTO 검증 여부를 보장할 수 없으므로 end202에는 정확한2필드(conversationId UUID, status=CLOSING)의 최소 방어 검사도 적용했다. 요청한 conversationId 일치·현재 인증·종료 복구 권한은 여전히141 등 호출부에서 검사한다. 전체 DTO 검사나 실제 end 재호출을 대신하지 않는다.
- `csrf.ts`의 비200 HTTP 실패는 선택 헤더를 `meta`로 즉시 전달한다. 기존 `requestId`는 UUID 검사를 통과한 진단 ID이며, `meta.headers.requestId`는 생 헤더로 따로 보존한다. 생 헤더·message·fields에는 민감정보가 들어갈 수 있으므로 결과 전체를 로그/저장소에 기록하지 않는다.
- 원시 Response는 `recovery.ts`의 WeakMap에 원본 실패 객체를 키로 보관하여 공개 실패 객체의 직렬화에 본문/쿠키가 들어가지 않는다. `readCsrfFailure`에 **원본 실패 객체**를 전달하면166 파서로 본문을 한 번만 읽어 결과를 공유한다. 복사·직렬화한 객체에는 본문 읽기 기능을 복원하지 않는다. 본문 읽기는 기존 CSRF/일반 요청의 쿠키 응답 대기에 등록하지 않는다. 정상200 전용 파서·기존 인증 전환 순서·operation/outcome/refresh 분리는 유지한다.
- `response.ts`의 선택 헤더 추출만 `readResponseMetadata`로 재사용했다. 기존 JSON/204/이동/바이너리·오류 형식 해석은 유지한다. 비200 CSRF302는 redirect,204/예상 밖2xx는 format_error, body 실패는 body_read_error이며 HTTP/code를 만들어 넣지 않는다.

| 검증 | 결과 |
| --- | --- |
| 구현 전 실패 확인 | recovery 테스트66건, CSRF 실패 테스트11건이 기능 미구현으로 실패. 이후 구현으로 통과 |
| 새 테스트 | recovery84건 + csrfFailure12건 =96건 통과. Retry-After 경계·오류 분류·메타데이터·동시/반복 본문 읽기·인증 성공+갱신429/503·오류 body 지연 중 로그아웃·비200 예외 포함 |
| 전체 회귀 | `npm test`: **20 suites / 563 tests** 통과. 기존401/403/429/503 테스트에 실제 classifyRecovery 연결 후에도 POST1회 유지 |
| 정적 검사 | `npm run lint`, `npm run typecheck`, `git diff --check` 통과 |
| 로컬 리뷰 | Astra의 읽기 전용 검토에서2단계 범위의 수정 필요 결함 없음. 원격 GitHub 리뷰와 구분 |
| 실행 환경 | Node24.20.0 / npm11.19.0의 명시 경로 사용. package/lockfile 변경 없음 |
| 중간 실패 | 새 meta가 빠진 기존 기대값5건과 새 테스트의 Jest tuple/afterEach 타입을 수정했다. 검사 완화 없이 새 계약의 값을 검증하며 최종 전체 검사 통과 |
| 미실행 | 네이티브 실행/export/빌드·원격 CI·실서버 검증. 의존성이 바뀌지 않아 설치/Expo 호환성/감사를 반복하지 않음 |

로컬 로그는 `/private/tmp/scrum167-stage2/`에 있으며 저장소에 포함하지 않는다. 이 단계의 완료는 오류 정보 전달·분류까지다. **이전 세션의 늦은 결과 반영을 차단하는 인증 문맥과 실제 CSRF 복구 실행은 아직 구현하지 않았다.** 다음 한 가지는 사용자 확인 후3단계 인증 문맥·조건부 상태 반영 구현이다. PR/push/병합/Jira 변경은 하지 않았다.

### SCRUM-167 3단계 — 인증 문맥·조건부 상태 반영 · 2026-11-05

- Jira167의 AC1~6·고영준·진행 중 상태를 재조회했고 2단계와 같음을 확인했다. 구현 출발점은 이 작업 브랜치의2단계 커밋 `c2b6289`다.
- `client.ts`에 client별 불투명 `AuthContext`를 추가했다. 실제 값은 필드 없는 동결 객체이며 세대는 내부 WeakMap에만 보관한다. 일반 요청 허용 후 첫 await 전에 캡처하여 response/transport_error의 읽기 전용 context로 반환한다. 다른 client의 문맥·복사/임의 객체·undefined는 유효하지 않다. 일반 not_sent/stale_response는 반영 문맥을 제공하지 않는다.
- 로그인·로그아웃 전환은 시작 시 기존 세대를 증가시킨 직후 자체 문맥을 캡처한다. 내부 classifier·갱신은 소유 세대만 검사하고, 외부 반영은 gate 해제까지 확인한다. 시작 전 거절은 문맥이 없고, 시작 후 취소/초기 CSRF 실패는 상위 전환 결과의 문맥을 유지한다. operation/outcome/refresh 의미는 유지한다. **현재 문맥이라는 판정은 로그인 성공이나 세션 생존 판정이 아니다.** unchanged/unknown/미전송 결과의 의미를 별도로 처리한다.
- `isCurrentContext`는 같은 client·현재 세대·전환 중이 아님을 검사한다. `commitIfCurrent(context, apply)`는 마지막 await 뒤 검사와 동기 반영을 수행하고, 오래된 문맥이면 callback을 실행하지 않는다. callback의 Promise 반환은 타입 검사에서 거부한다. callback 안에서 별도로 시작한 비동기 작업은 마지막 await 뒤 다시 검사해야 한다.
- `expireIfCurrent(context, onExpired)`는 현재 문맥만 세대 증가·CSRF 무효화 후 한 번 통지하고 next 문맥을 전달한다. 같은 이전 세대의 다른 오류는 재통지하지 않는다. onExpired에서 시작한 비동기 정리는 next 문맥으로 마지막 await 뒤 검사한다. callback 예외에도 세대·token을 이전 상태로 복구하지 않는다. 이 함수는 HTTP를 분류하지 않으므로 호출부는2단계의 정확한 authentication_required 판정 이후에만 호출한다. 임의403이나 LOGIN_FAILED에 연결하지 않는다.
- **계획 순서 보완:** expireIfCurrent가 진행 중인 CSRF 발급보다 먼저 끝나면 이전 token이 복원될 수 있어,4단계 예정이던 최소 발급 revision 방어만 이번 단계에 앞당겼다. invalidate에서 revision 증가·token 제거, issue 시작 시 revision 캡처,200 token 저장 직전 불일치면 `invalidated` 실패를 반환한다. pending은 유지하여 쿠키 응답 대기 순서를 보존한다. 실제 전송 token 버전 연결·recoverCsrf·동시/늦은403 복구 중복 방지는4단계에 남긴다.
- 실제 계정/화면 store에는 아직 연결하지 않았다. 공통 보호와 테스트 수신자 검증이며173/174의 소유 계정 연결·연결 회귀를 대신하지 않는다. guard를 거치지 않는 임의 상태 반영이나 OS의 쿠키 적용까지 차단한다고 주장하지 않는다.

| 검증 | 결과 |
| --- | --- |
| RED→GREEN | 새 authContext 테스트21건이 기존 코드에서 실패한 뒤 구현 후 통과. 진행 중 발급의 늦은 token 복원도 구현 전 재현 |
| 문맥·전환 | 정상 반영 대조, 타 client/복사/없는 문맥 거절, 지연 본문+로그아웃, 같은 계정 재로그인+추가 await, 헤더 stale 유지,4가지 auth outcome, 인증 성공+갱신503, 전환 전/후 취소, 늦은 통신 실패 |
| 만료·발급 | 같은 세대 동시 오류 통지1회, 이전401이 새 로그인/CSRF를 무효화하지 않음, 만료 정리 중 재로그인 보호, 통지 예외 후 무효화 유지, 발급 본문 지연 중 만료 시 이전 token/준비 성공 복원 및 대기 POST 전송 없음 |
| 타입 계약 | async 반영/통지 callback, 임의 문맥 생성, 응답 context 재할당을 `@ts-expect-error`로 검증. typecheck가 해당 제한의 제거도 감지 |
| 전체 회귀 | `npm test`: **21 suites / 584 tests** 통과. 기존 테스트에는 새 context 기대값을 추가하고 기존 미전송/오류/outcome·요청 횟수 검증을 유지 |
| 정적 검사 | `npm run lint`, `npm run typecheck`, `git diff --check` 통과 |
| 로컬 리뷰 | Astra 읽기 전용 검토에서3단계 범위의 수정 필요 결함 없음. 원격 GitHub 리뷰와 구분 |
| 중간 실패 | 구현 편집 중 반환 객체에 타입 구문이 섞인1곳의 문법 오류를 수정했다. 이후 새 테스트·전체 검사 모두 통과 |
| 환경·미실행 | Node24.20.0/npm11.19.0 고정 경로. package/lockfile 변경 없음. 네이티브 실행/export/빌드·원격 CI·실서버 시험은 이번 단계 미실행 |

로그: `/private/tmp/scrum167-stage3/`. 다음 한 가지는 사용자 확인 후 **4단계 CSRF 복구 실행·중복 발급 방지**다. 단계별 기존 기록은 당시의 결과이며 이 절이 현재 완료 지점이다. PR/push/병합/Jira 변경은 하지 않았다.

### SCRUM-167 4단계 — CSRF 복구·중복 발급 방지 · 2026-11-12

- 전용 브랜치의 3단계 `351e160`에서 이어 구현했다. Jira167의 고영준·진행 중·AC1~6이 유지됨을 조회했다. FE development는 `da9493fb883442e771d0bee99fddef8c5d88d5ec`, BE development는 `1e66ddb895789bbaf72c21e3b76441bce251aa61`다. BE [PR #48](https://github.com/DodamDodam-Capstone/backend/pull/48)의 공통 권한·오류 처리가 추가됐지만 이전 BE 기준 이후 `docs/p0` 명세 파일은 바뀌지 않았다. 401 AUTHENTICATION_REQUIRED·403 CSRF_INVALID·503 AUTH_STATE_UNAVAILABLE 계약을 유지한다. BE 코드를 조회한 것이며 실제 서버 시험은 아니다.
- `client.recoverCsrf(context)`는 현재 client의 일반 POST에 실제 사용한 발급 버전만 복구한다. 호출부는 HTTP403 + CSRF_INVALID로 분류한 응답의 context를 전달해야 한다. 이 함수가 context만으로 오류 code를 증명하지는 않는다. GET·다른 client·복사/없는 문맥·인증 전환의 상위/operation 문맥·미전송 결과는 복구 권한을 제공하지 않는다.
- `csrf.ts`의 성공 발급마다 새 불투명 version을 만든다. 동일 token 문자열이 재발급되어도 버전은 구분하며, 무효화 revision 증가와 발급 성공을 혼동하지 않는다. POST는 헤더를 설정할 때 실제 버전을 내부 WeakMap 문맥에 연결한다. token/버전/세대는 공개 AuthContext에 노출하지 않는다.
- 결과는 `refreshed` / `already_recovered` / `skipped` / `failed`다. 이미 복구된 결과도 해당 성공 버전이 현재 유지될 때만 성공으로 반환한다. skipped 사유는 stale_context, ineligible_request, superseded_token이며 실패를 성공이나 미전송으로 바꾸지 않는다. CSRF-only 복구로 인증 세대를 바꾸지 않는다.
- 같은 실패 버전의 진행 중 복구와 완료된 실패를 WeakMap으로 공유한다. 늦은 같은 버전403은 새 토큰을 지우거나 실패한 발급을 반복하지 않는다. failed.failure는 원본 CsrfFailure여서 readCsrfFailure의 본문 한 번 읽기와 메타데이터 보존이 유지된다. 실패 후 호출부가 명시적으로 prepareCsrf를 실행한 새 준비와 새 버전 요청은 가능하며, 원래 업무 POST는 자동 재실행하지 않는다.
- 실제 send의 헤더 응답 Promise를 별도로 추적한다. 복구는 시작 전에 전송된 응답과 기존 CSRF 발급만 기다리고, 준비 중인 새 POST를 자기 대기에 넣지 않는다. 일반 POST와 prepareCsrf는 진행 중 복구를 공유한다. 캐시 준비 직후 복구가 시작돼도 최종 헤더 설정 전에 다시 대기한다. 새 POST는 복구 성공·현재 인증 문맥·미취소 조건에서만1회 전송하며 복구 실패/취소/인증 전환 시0회다.
- 인증 전환은 기존 내부 발급 경로를 유지하며 기존 inFlight·CSRF 대기에 recoveryPending을 추가한다. 복구 쪽은 inFlight를 기다리지 않으므로 서로의 준비를 기다리는 순환을 피한다. 발급 시작 전과 공유/캐시 결과의 마지막 await 후 인증 문맥을 확인한다. 일반 응답 본문·비200 CSRF 오류 본문은 전환 대기에 추가하지 않고 정상 CSRF200 발급의 기존 대기는 유지한다.

| 검증 | 결과 |
| --- | --- |
| 재개 기준선 | Node24.20.0/npm11.19.0, 기존 client/authTransition/authContext/csrfFailure **121 tests** 통과 |
| RED→GREEN | 신규 csrfRecovery **21건**이 recoverCsrf 미구현으로 실패한 뒤 구현 후 통과. 추가 경계4건까지 **25건** 통과 |
| 복구·경합 | 동시/늦은403, 같은 문자열 재발급, 갱신 실패 반복·원본 실패 객체/본문1회, 오래된 성공 재사용 거절,3요청 헤더 대기·신규POST 경합, prepareCsrf 공유, 실패 후 명시적 준비 |
| 인증·취소 | 일반/인증 전환 문맥 구분, 대기POST 취소/전환 시0회, 복구 대기·완료 뒤 이전 세대 성공 차단, 발급 body 중 만료 시 token 복원 방지, 오류 body 대기와 logout 분리 |
| 최종 전체 회귀 | `npm test`: **22 suites / 609 tests** 통과 |
| 정적 검사 | `npm run typecheck`, `npm run lint`, `git diff --check` 통과 |
| 로컬 리뷰 | Astra의 독립 읽기 전용 리뷰에서4단계 범위의 수정 필요 결함 없음. 원격 GitHub 리뷰가 아님 |
| 보존 | 다른7개 checkout/worktree의 HEAD·index·미커밋 상태/내용 해시 유지. package/lockfile·네이티브 설정 변경 없음 |
| 미실행 | 네이티브 경합 실행/export/빌드·원격 CI·실제 BE 시험. 의존성 미변경으로 재설치/Expo 호환성/감사를 반복하지 않음 |

로그: `/private/tmp/scrum167-stage4/`, 최초 RED 로그 `/private/tmp/scrum167-stage4-red.log`. 새 테스트는 기존 CI의 전체 Jest 대상이지만 이번 커밋의 원격 실행 증거는 아직 없다. 다음 한 가지는 사용자 확인 후 **5단계 수신자 연결 회귀·민감정보 비저장 검증**이다. PR/push/병합/Jira 변경은 하지 않았다.

후속 계획의 보완사항도 유지한다. 5단계는 오류 message/fields의 메모리 전달과 URL·로그·영구 저장소 복사 금지를 별도로 검사하고, 웹 저장소 spy만으로 RN 전체 비저장을 주장하지 않는다. 6단계는 원본 refresh/meta를 보고서에 넣지 않고 전송 전에 허용한 필드만 추출하며, OS별 기대 사례/필수 check 누락·중단·cleanup 실패를 통과로 집계하지 않는다. 합성 receiver 자체 테스트는 CI Jest에 포함하고 OS 실행·원격 빌드·실서버129 결과는 각각 구분한다. 실제 계정 store 연결173과 연결 회귀174는 이 단계에 포함하지 않는다.

### SCRUM-167 5단계 — 수신자 연결 회귀·민감정보 비저장 검증 · 2026-11-12

- 전용 브랜치의4단계 `55fc845`에서 이어 진행했다. 제품 API 구현·의존성·네이티브 설정 변경 없이 `recovery.integration.test.ts`와 `recovery.security.test.ts`를 추가했다. 기존4단계 구현에서 새 동작 검사가 처음부터 통과했으므로 새 결함의 RED→GREEN 수정으로 기록하지 않는다.
- 연결 테스트27건은 실제 client →166 응답 파서 →167 분류/복구 →최종 동기 반영을 실행한다. fetch만 합성 응답으로 대체하고, 테스트 내부의 최소 수신자로 최종 accountId·반영/만료 통지 횟수·CSRF GET·업무 POST 횟수를 확인한다. 실제 계정 store/UI 연결173·연결 회귀174를 구현한 것은 아니다.
- 로그인 상태의 성공/401/403 본문이 지연되는 동안 로그아웃, 동일 계정 재로그인, 다른 계정 재로그인을 각각 완료한 뒤 이전 본문을 해제한다. 이전 성공/오류는 최종 상태·통지·CSRF를 바꾸지 않으며 새 준비는 기존 token을 유지한다. 파싱 후 추가 await 중 전환, 만료 callback의 비동기 정리 중 재로그인도 마지막 await 뒤 문맥 검사로 막는다. 현재 정상 결과의 반영을 양성 대조로 검사한다.
- 현재 동시401은 한 번만 만료·통지한다. 같은 버전403 두 건은 CSRF 복구1회를 공유하며 로그인 상태를 유지하고 원래 업무 POST는 각각1회다. 보호자403·503·일반 문맥 LOGIN_FAILED·잘못된 HTTP/code 조합·429를 전역 만료나 자동 POST 재실행으로 확대하지 않는다. CSRF 복구 실패401의 지연 본문은 현재 문맥에서만 만료하며, 재로그인 뒤 도착하면 반영하지 않는다.
- 보안 연결 테스트6건은 성공·오류·CSRF 대기 취소·복구 실패·통신/본문 읽기 예외를 실행한다. 합성 비밀번호/PIN은 의도한 요청 본문, CSRF는 의도한 헤더에만 전달되고 추가 URL 전송·console 출력·관측한 저장소 쓰기는 없다. 오류 code/message/fields/requestId와 선택 헤더는 메모리에 보존한다. 오류 원문에 합성 민감값이 있다는 이유로 파서 결과 전체를 삭제하거나 일괄 마스킹하지 않는다. 원시 예외의 민감값은 오류 결과에 복사하지 않는다.
- 저장소 spy는 웹 localStorage/sessionStorage의 setItem 경로에 한정된다. 별도로 src 제품 코드·App.tsx/index.ts의 import/출력/저장 경로와 직접 의존성을 조회했으며 해당 API 경로에 console·영구 저장 호출은 없다. Expo 전이 의존성에는 expo-file-system57.0.7이 있으므로 RN 자체에 저장 기능이 없다는 결론은 내리지 않는다. OS의 세션 쿠키 관리는 FE가 자격 증명을 별도 저장소에 복사하는 것과 구분한다. 실제 기기 저장·진단 보고서까지 안전성을 입증한 것은 아니다.

| 검증 | 결과 |
| --- | --- |
| 신규 연결·보안 | 연결27건 + 보안6건 = **33 tests** 통과. 지연 단계는 Promise 신호로 제어하며 임의 sleep 없음 |
| 최종 전체 회귀 | `npm test`: **24 suites / 642 tests** 통과 |
| 정적 검사 | `npm run typecheck`, `npm run lint`, `git diff --check` 통과 |
| 중간 실패 | 새 테스트의 중첩 함수에서 ApiResult의 response 타입 축소가 유지되지 않아 타입 검사1건 실패. 확인된 AuthContext를 지역 상수로 캡처하여 해결. 제품 동작 테스트 실패는 없었음 |
| 로컬 리뷰 | Astra 독립 읽기 전용 리뷰에서5단계 범위의 수정 필요 결함 없음. 리뷰어도 신규33건을 재실행해 통과 |
| 출력 증거 | 이번 단계 테스트/정적 검사 로그4개에서 합성 민감값 일치0개. 테스트 소스의 가상 fixture와 실행 출력은 구분 |
| 보존 | 다른7개 checkout/worktree의 HEAD·index·미커밋 상태/내용 해시 유지 |
| CI 연결 | 기존 ci.yml의 전체 `npm run test`가 두 신규 test 파일을 발견·실행한다. workflow 수정 없음. 이번 커밋의 원격 실행은 아직 없음 |
| 미실행 | 네이티브 경합 실행/export/빌드·원격 CI·실제 BE 시험. 의존성이 바뀌지 않아 재설치/Expo 검사/감사는 반복하지 않음 |

로그: `/private/tmp/scrum167-stage5/`. 다음 한 가지는 사용자 확인 후 **6단계 Android·iOS 합성 loopback 검증**이다.6단계에서는 원시 refresh/meta의 진단 보고서 전송을 전송 전 허용 필드 추출로 보완하고, 기대 사례/필수 check 누락·중단·cleanup 실패를 검출한다. PR/push/병합/Jira 변경은 하지 않았다.

### SCRUM-167 6단계 — 진단 보고서 보완·Android/iOS 네이티브 검증 · 2026-11-12

- 전용 브랜치의5단계 `4f582aa`에서 진행했다. Jira167은 고영준·진행 중·AC1~6 유지, FE development `da9493fb883442e771d0bee99fddef8c5d88d5ec`와 BE development `1e66ddb895789bbaf72c21e3b76441bce251aa61`도 동일함을 재조회했다. 이 단계에서 제품 API·App/index·의존성/lockfile·네이티브 설정은 변경하지 않았다.
- `scripts/native-session/recovery.tsx`와 `recoveryReceiver.js`를 추가했다. 실제 Expo global fetch로 정상 대조, 지연 성공+로그아웃/동일·다른 계정 재로그인, 늦은401/403, 파싱 뒤 추가 await, 만료 후 비동기 정리, 동시401·CSRF 복구 공유, 복구 중 새POST 대기, 발급 중 무효화, 복구 실패 본문 지연, 보호자403·503의15개 사례를 검사한다. 호출 횟수·최종 상태·통지·쿠키/token 쌍·cleanup을 각각 확인한다. a/b 계정과 로그인 DTO는 로컬 합성 프로토콜이며 실제 로그인 API DTO로 제안한 값이 아니다.
- 공통 `report.js`를 통해 모든 기존 진단 진입점도 **JSON 직렬화 전** 허용 enum·횟수·boolean만 추출한다. raw refresh/meta·오류 원문·쿠키·token·임의 키는 보고서와 기본 probe 화면에 복사하지 않는다. 기존 API 파서가 오류 원문을 메모리로 전달하는 계약은 유지한다. 수신 후 필터만으로 전송 전 노출을 막았다고 간주하지 않는다.
- auth/response/recovery는 필수 check가 빠지거나 false이면 실패다. 전체 행렬 요약은 OS별 기대 사례의 누락·중복·알 수 없는 사례·일부 선택·중단을 통과시키지 않는다. receiver는 실제 finish와 미결 응답/대기자0을 요구하며 finish 뒤 새 API 요청이 오면 완료 표시를 무효화한다. issue/cleanup 실패 보고서의 pass도 false로 정규화한다.
- Astra 리뷰에서 **늦은 결과의 미반영만 확인하면 읽기/파싱 실패도 PASS가 될 수 있는 검증 공백1건**을 발견했다. 정상 JSON/정확한401·403 분류, stale_context 복구 거절, CSRF 실패401 본문 분류까지 검사하도록 보강했다. 새 검사7건의 실패 후 구현·통과를 확인했고, 보강된 최종 코드로 양 OS 전체 행렬을 다시 실행했다. 제품에서 로그아웃 후 로그인되는 결함을 재현한 것은 아니다.

| 검증 | 결과 |
| --- | --- |
| 재현 후 수정 | 필수 check 누락·finish 누락·이전 finish 재사용·issue/cleanup 실패의 잘못된 PASS를 테스트로 재현 후 수정. 지연 응답 해석/분류 검사 추가 |
| Jest 전체 | `npm test`: **26 suites / 695 tests** 통과.5단계 대비53건 추가 |
| 정적 검사 | `npm run typecheck`, `npm run lint`, `git diff --check` 통과 |
| Android | Pixel Tablet/API36, 개발 APK 재빌드·설치. 복구15 + 요청26 + 인증26 + 응답25 = **92/92 PASS** |
| iOS | iPad Pro11형 M5/iOS26.5 Simulator, 서명 없는 Debug 재빌드·설치. 동일 **92/92 PASS** |
| 최종 행렬 | 총 **184개 고유 사례**. 필수 검사/사례 누락·중복0, 실패/issue0, cleanup 전부true. 관측 대상의 held/activeResponses/waiters0 |
| 출력 경계 | 최종 보고서에 합성 UUID 값0. enum/count/boolean 허용 목록의 직렬화 테스트와 함께 확인했으며 RN 전체 저장소 안전성으로 확대하지 않음 |
| 빌드 근거 | Node24.20.0/npm11.19.0, Expo57.0.31/RN0.86.3, JDK17, CocoaPods1.16.2, Xcode26.6. Android316 tasks 성공·iOS BUILD SUCCEEDED. Expo 본문 보완3파일 SHA 빌드 전후 일치·single-use POST 생성 코드 확인 |
| 환경·중간 실행 | 남아 있던 Android APK가166 본문 패치 전 빌드여서 새로 빌드. prebuild cwd/Pods 실행 경로 오류는 격리 경로·올바른 도구 경로로 수정. 수정 중 Fast Refresh로 중복된 예비 로그는 별도 보존하고 최종 집계에서 제외 |
| 범위·미실행 | 에뮬레이터/시뮬레이터와 HTTP loopback 합성 수신자 검증. 실기기·운영 HTTPS/쿠키 속성·OAuth·실제 BE129·원격 CI는 미실행. 일반 앱 JS export는 제품/설정 미변경으로 이번 단계 반복하지 않음 |

빌드는 `/private/tmp/scrum167-stage6/native-build`의 HEAD archive에서 수행했다. 기존 node_modules를 재사용해 무시되는 네이티브 의존성 빌드 출력은 생성됐지만 소스 패치·패키지 버전은 유지됐다. 원래 checkout·다른 worktree에는 생성 프로젝트를 만들지 않았다. 본문/CSRF 테스트 기한은 기존20초, 제어/정리3초의 진단 값이며 운영 timeout으로 확정하지 않는다.

재현은 기존 receiver·IPv4 localhost Metro 명령을 그대로 사용하고 새 bundle은 `scripts/native-session/recovery.bundle`로 지정한다. `EXPO_PUBLIC_NATIVE_PROBE_CASE` 없이 recovery15/auth26/response25/cases26을 OS별로 순서대로 실행한다. 단일 사례 선택은 진단용이며 전체 통과가 아니다. 마지막 결과마다 필수 check·실제 요청 횟수·cleanup을 확인하고 OS별 기대 목록과 정확히 한 번씩 대조한다.

다른7개 checkout/worktree의 HEAD·index·미커밋 상태/내용 해시가 보존됐음을 최종 확인했다. 양 OS를 일반 index.ts 진입점으로 복귀시켜 bundle 요청을 확인한 뒤 앱·이번에 시작한 가상 기기·Metro·합성 서버와 adb reverse를 정리했다.

최종 증빙: `/private/tmp/scrum167-stage6/native-results-final.log`, `android-matrix.log`, `ios-matrix.log`, `full-test-final.log`, `native-build-evidence.json`과 빌드 로그. 예비/리뷰 보완 전 로그는 이름에 preliminary/before-review-fix로 구분했다. 실제 계정 store173·연결 회귀174와 실서버129는 별도 책임이다. 다음 한 가지는 사용자 확인 후 **7단계 최종 리뷰·CI 준비·인계**다. PR/push/병합/Jira 변경은 하지 않았다.

### SCRUM-167 7단계 — 로컬 최종 리뷰·Expo 호환성 보완·인계 · 2026-11-12~13

기준 HEAD는 `4d3438262d8cc5c9ab52b24b1ca5f6151193ece8`이다. 원격 development `da9493fb`와 Jira 167 고영준·진행 중 상태를 재확인했다. 사용자가 로컬 최종 리뷰·CI와 이후 발견된 Expo 호환성 보완을 승인했다. PR/push/병합/Jira 변경은 수행하지 않았다.

- 온라인 검사가 Expo 57.0.31→~57.0.32, dev-client 57.0.20→~57.0.21을 요구해 실패하여 두 의존성과 lockfile을 갱신했다. React/RN과 API 계약은 유지했다. 공식 tarball SHA512를 registry/lock과 대조했고 기존 fetch 3개 파일의 원본 SHA256이 57.0.31과 동일하여 해당 보완을 유지했다.
- 새 CLI 57.0.33에서 내부 경로·JSON Schema·MCP schema의 Zod 인자 주입 API가 바뀌어 호환성 테스트가 실패했다. 실제 새 함수를 사용해 기존 13개 의미 검증을 유지했다. 프로젝트 Zod를 주입한 helper 호환성 검사이며 선택 기능인 expo-mcp 서버 기동/등록은 검증하지 않았다.
- iOS 네이티브 검증 중 CDP 리디렉션의 `httpBodyData`→`CFStreamClose`에서 앱 종료를 관측했다. core 57.0.24/.25의 해당 경로 5개 파일은 동일하므로 새 버전이 도입한 오류로 단정하지 않는다. core 57.0.25의 `CdpNetworkTypes.swift`에서 리디렉션 진단 이벤트만 전송용 stream 재수집을 생략했다. 초기 요청/직접 Data 수집·메타데이터와 실제 전송은 유지하며, 개발 Network 탭에서 리디렉션 stream 본문이 표시되지 않는 제한이 있다.
- 실제 Swift 소스의 307/308 회귀는 수정 전 55 assertion 중 10개 실패, 수정 후 55/55 통과했다. 설치기는 Expo/core 버전과 **4개 파일** 해시를 모두 검증한 뒤 쓰고 변조·일부 패치·심볼릭 링크·소스 빌드 설정 누락을 거절한다.
- 첫 재빌드는 precompiled core를 사용해 실제 코드 바이너리가 바뀌지 않았다. 이 결과를 패치 반영 증거에서 제외했다. 공식 `expo.autolinking.apple.buildFromSource=["expo-modules-core"]`를 지정하고 CI에 Swift 회귀와 실제 Pods source phase 검사를 추가했다. 이전 prebuilt 프로젝트는 실패하며 최종 프로젝트는 통과한다. 최종 SwiftCompile 및 arm64/x86_64 패치 심볼을 확인했다.

| 최종 검증 | 결과 |
| --- | --- |
| 깨끗한 설치 | Node 24.20.0/npm 11.19.0 `npm ci` 성공. Expo 57.0.32/core 57.0.25 네이티브 4개 파일 패치, 최종 iOS 격리 clone에서도 재현 |
| JS CI | 온라인 Expo 호환성·manifest·lint·typecheck·diff 검사 통과. Jest **26 suites / 704 tests**, Jira 규칙 7건·환경 주입 14건·양 OS export 통과 |
| iOS 추가 회귀 | 실제 Swift 소스 **55 assertion / 0 failure**, 패치 파일 source phase 검사 통과 |
| 네이티브 빌드 | Android Debug 316 tasks 성공. iOS Simulator Debug 성공, 실제 패치 소스 컴파일과 양 아키텍처 심볼 확인 |
| 최종 OS 실행 | Android 92/92 + iOS 92/92 = **184개 고유 사례 PASS**. 누락·중복·issue 0건, 필수 check·cleanup 통과, 관측 대상 held/activeResponses/waiters 0건, 원시 UUID 0개 |
| 감사·경고 | 설치 감사 low 9·moderate 9·high 0·critical 0. allowScripts/의존성 deprecated 등 경고는 남음 |
| Astra 리뷰 | API/진단 경계·의존성/설치기·CLI 호환성·iOS 보완/Swift 회귀·소스 빌드/CI에서 추가 조치가 필요한 지적 없음 |

증빙은 `/private/tmp/scrum167-expo5732/logs/`의 `source-final-js-results.json`, `jest-source-final.log`, `final-js-results.json`, `native-results-final.log`, `native-summary-final.json`, `android-summary.json`, `ios-final-source-results.json`, `ios-final-source-linked-symbols.json`, `final-source-parity.json`이다. Android APK SHA는 `1ed6273f…`, 패치 포함 iOS debug dylib SHA는 `2c305891…`이며 전체 값은 해당 기록에 있다. 첫 iOS 충돌 및 prebuilt 제한 기록을 최종 184건에 합산하지 않았다. 빌드 중 추가한 CI 외 런타임 입력은 동일했고, CI 반영 후 소스 88개가 검증 clone과 일치했다. Android 바이너리는 같은 버전·같은 Android 소스로 만들었으며 후속 변경은 iOS 전용 소스/빌드 설정이다.

양 OS를 일반 index.ts로 복귀시켜 실제 bundle 로드를 확인했다. 로컬 호스트 macOS 27.2 arm64는 GitHub Ubuntu 24.04/macOS 26 runner와 다르며, 실제 원격 필수 CI/리뷰는 PR 요청 후 최신 commit에서 확인한다. 이번 OS 실행은 합성 HTTP loopback·에뮬레이터/시뮬레이터로, 실기기·운영 HTTPS/쿠키·OAuth·실제 BE 129 완료를 뜻하지 않는다.

후속 173은 요청 문맥을 유지하고 **마지막 await 뒤** `commitIfCurrent`로 동기 반영한다. 계약상 현재 401만 `expireIfCurrent`로 처리하며 전달된 next 문맥으로 비동기 정리를 보호한다. 174는 실제 store/화면에서 로그아웃·동일/다른 계정 재로그인과 늦은 성공/오류를 연결 검증한다. `recoverCsrf`는 원래 POST를 재실행하지 않으며 UI 자동 재시도·화면 이동은 공통 계층의 책임이 아니다.

### SCRUM-167 7단계 후속 — PR #36 온라인 호환성 보완 · 2026-11-13

[PR #36](https://github.com/DodamDodam-Capstone/frontend/pull/36)을 development 대상으로 게시했다. 첫 커밋 `a2798f5`의 원격 리뷰는 지적 없이 완료됐고 Jira 키·제목 검사는 통과했다. 그러나 [첫 Frontend CI](https://github.com/DodamDodam-Capstone/frontend/actions/runs/43363659010)는 온라인 Expo 검사가 `57.0.32` 대신 `~57.0.33`을 요구하여 실패했다. 로컬에서도 같은 실패를 재현했다. 이후 JS 단계와 Android/iOS 빌드는 skipped이며 성공으로 집계하지 않는다.

- 공식 Expo `57.0.33` / core `57.0.26` tarball의 SHA512와 이전 배포본을 대조했다. 기존 패치 대상 4개 원본 및 패치 결과 SHA256이 모두 같아 보완을 유지한다. 설치기는 새 정확한 버전만 허용하며 파일 해시·경로·전체 검증 후 쓰기·소스 빌드 요구를 완화하지 않았다. dev-client는 `~57.0.21`을 유지한다.
- Expo/core/constants의 Android·iOS 런타임 소스는 동일하지만 core podspec과 autolinking의 prebuilt 선택 경로가 변경됐다. `buildFromSource`를 유지하고 새 Pods의 실제 source phase·SwiftCompile·arm64/x86_64 패치 심볼을 재검증했다. 앱 debug dylib SHA256은 `5ce486b9206acee4f710447f941923bbaa22595dee92b525e887c940fe88542e`다.
- 새 버전 테스트를 기존 설치기에 적용해 16개 실패/8개 통과를 확인한 뒤 버전 guard를 갱신했다. 최종 깨끗한 설치·온라인 Expo 검사·manifest·lint·typecheck·Jest **26 suites / 704 tests**·Jira 규칙 7건·환경 14건·양 OS export가 통과했다.
- 새 iOS 격리 빌드와 실제 Swift **55/55**, 새 앱의 네이티브 **92/92**(복구 15·전송 26·인증 26·응답 25)가 통과했다. 누락·중복·issue·관측 중인 미정리 요청·원시 UUID는 0이다. 일반 index.ts로 복귀시켜 bundle 로드를 확인한 뒤 이번에 시작한 앱·시뮬레이터·Metro·수신자를 정리했다.
- 이번 후속 수정에서 Android 로컬 빌드·기기 92건은 반복하지 않았다. Android 런타임 소스가 동일한 근거와 이전 `.32` 실행을 보존하고, 새 `.33` Android 컴파일은 PR의 원격 CI로 확인한다. 이전 양 OS 184건을 새 `.33` 실행 결과로 표현하지 않는다.
- 설치 감사는 low 9·moderate 8·high 0·critical 0이며 설치 스크립트 경고는 남는다. 후속 변경 로컬 리뷰에서 추가 수정 지적은 없었다. 최신 커밋의 원격 CI·리뷰는 재확인 전까지 미완료다. 병합·Jira 변경은 하지 않았다.

후속 증빙: `/private/tmp/scrum167-expo5733/comparison.json`, `native-diff.json`, `fix-review.md`, `logs/local-ci.json`, `logs/ios-results.json`, `logs/ios-source-snapshot.json`, `logs/ios-matrix.log`, `logs/native-summary.json`. 후속 173/174와 실제 BE 129의 책임 및 개발 Network 탭의 stream 본문 표시 제한은 앞 기록과 같다.

### SCRUM-166 1단계 — 작업 공간·계약 기준 · 2026-10-28

이 절은 SCRUM-166 구현 전에 합의한 계약과 검증 계획이다. 1단계 당시 2~5단계의 기능·테스트는 미구현이었으며, 이후 실행 결과는 아래 단계별 기록을 따른다. 기존 SCRUM-165 기록은 당시 실행 이력으로 보존한다.

#### 작업 기준과 근거

- 전용 branch: `feature/SCRUM-166-request-response`. 시작점은 FE development [`3d402b58bf0d91191b8caf7b87a81da26a7bdb2c`](https://github.com/DodamDodam-Capstone/frontend/commit/3d402b58bf0d91191b8caf7b87a81da26a7bdb2c)다. 기존 checkout·번역·SCRUM-178·165·179 worktree의 변경을 가져오지 않는다.
- Jira [SCRUM-166](https://dodamdodam.atlassian.net/browse/SCRUM-166): 담당 고영준, 진행 중, 부모 123 진행 중. 계획 번호 123-S2, 부모 선행 121, 별도 Subtask 선행 없음. 165는 완료이며 [PR #33](https://github.com/DodamDodam-Capstone/frontend/pull/33)으로 development에 반영됐다. 166 완료가 부모 123 완료를 뜻하지 않는다.
- BE development는 [`f9a86e91f70a42faaee63b4e9c69368498376478`](https://github.com/DodamDodam-Capstone/backend/commit/f9a86e91f70a42faaee63b4e9c69368498376478)이다. 아래 링크는 모두 이 커밋에 고정한다. API 계약 v3.1, OpenAPI 문법 `3.0.3`·`info.version: 3.1.0`을 구분한다. BE Draft PR #46은 병합 전이므로 구현 기준이나 새 선행으로 삼지 않는다.

| 적용 파일·절 | 이 작업의 근거 |
| --- | --- |
| [공통 계약 §3·3.2·5](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/api/01-common.md) | JSON UTF-8, envelope, 0바이트 POST, null·추가 필드, 오류·추적 헤더·민감값 비기록 |
| [인증 §6.1·6.7·6.17·6.18](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/api/02-auth.md) / [보호자 §6.13](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/api/04-guardian.md) | CSRF 전용 응답, logout/lock 204, OAuth framework 경로·302 예외 |
| [대화 §7.1·7.3·7.7](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/api/06-conversations.md) | 시작409 확장, resume/end 0바이트 요청, end200/202 응답 |
| [음성 §4.11·7.4~7.8](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/api/07-voice.md) | multipart, JSON201/202, 성공200 바이너리와 JSON 오류 구분 |
| [OpenAPI paths·components/schemas](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/Integrated_OpenAPI.yaml) / [Decision Record §1·2](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/docs/p0/Decision_Record.md) | 정확한 상태·필드·UUID와 D13/D14/D17 미확정 범위 |
| [LogoutRequestGuardFilter](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/src/main/java/com/dodamdodam/backend/auth/session/LogoutRequestGuardFilter.java) / [LogoutContractTests](https://github.com/DodamDodam-Capstone/backend/blob/f9a86e91f70a42faaee63b4e9c69368498376478/src/test/java/com/dodamdodam/backend/LogoutContractTests.java) | 현재 BE 구현은 Content-Type 없음·`application/json`·`application/json;charset=UTF-8` 각각의 0바이트 logout을 허용한다. 소스 확인이며 이번 FE 작업에서 BE 테스트를 실행한 것은 아니다. |

명세와 설정의 차이도 유지한다. OpenAPI `ApiError.required`에는 `fields`가 있지만 공통 §3과 FE 작업 규칙은 누락 시 `[]`를 요구하므로 이 호환 동작을 적용한다. `fields`가 OpenAPI에서 선택이라고 문서를 바꾸지 않는다. development의 팀/Jira 가이드에는 사람 승인 1건 문구가 남아 있으나, README·10/16 팀 결정·원래 경로의 AGENTS 및 10/28 조회한 Ruleset은 승인 수 0, 마지막 push 승인 불필요, strict 필수 검사 3개·대화 해결·squash다. 팀 결정의 최신 GitHub 코드 리뷰는 여전히 필요하며 이 문서 작업으로 검사나 정책을 변경하지 않는다. main 설정이나 오래된 로컬 159 문서를 development 설정으로 간주하지 않는다.

#### 구현 경계와 결과 형태

기존 [`client.ts`](../src/api/client.ts)의 raw `request()`/`ApiResult`, [`csrf.ts`](../src/api/csrf.ts)의 전용 parser, `authTransition()`을 보존한다. 작은 `src/api/requestBody.ts`, `src/api/response.ts`와 테스트를 후속 단계에서 추가한다. 새 HTTP 라이브러리·범용 schema framework·모든 endpoint DTO validator를 도입하지 않는다.

| 경계 | 후속 구현에서 지킬 형태·책임 |
| --- | --- |
| 요청 준비 | `json` / `none` / `formData`를 명시적으로 선택한다. 준비 성공은 기존 client에 넘길 body·headers, 실패는 입력 원문 없는 고정 사유다. 실패하면 client/CSRF/fetch를 호출하지 않는다. 기존 전송 결과에 새 미전송 사유를 섞지 않는다. |
| JSON | JSON-compatible plain 값만 직렬화한다. 선택 필드 생략과 DTO별 허용 필드·필수값·null은 호출부 책임이다. 현재 요청 DTO에는 null 허용 필드가 없으며 임의 null을 생성하지 않는다. NaN/Infinity, 배열 undefined·hole, BigInt, 순환, Date/custom `toJSON` 등 손실·암묵 변환 입력은 전송 전 실패시킨다. JSON Content-Type을 맞추고 잘못된 MIME/charset 조합은 거절한다. 비밀번호/PIN/token을 trim하거나 정규화하지 않는다. |
| none | `body`를 생략한다. `{}`·`null` 문자열·공백도 만들지 않는다. Content-Type을 자동 추가하지 않되 유효한 JSON/UTF-8 Content-Type을 일괄 거절하지 않는다. logout/lock/resume/end에 같은 0바이트 원칙을 적용한다. Part1 16,384바이트 제한을 Part2 전체의 공통 상한으로 확대하지 않는다. |
| FormData | 같은 FormData를 전달한다. 호출자가 Content-Type/boundary를 수동 지정한 충돌은 준비 실패로 처리하고 실제 boundary 생성은 런타임에 맡긴다. multipart 필드·파일 제약은 해당 호출부/확정 음성 계약 책임이다. |
| 응답 해석 입력 | 응답의 예상 종류와 허용 성공 HTTP 상태를 호출부가 명시한다. parser는 raw `ApiResult.kind=response`일 때만 호출하며, 다른 기존 결과는 그대로 인계한다. 204는 해당 endpoint 계약에서 허용할 때만 성공이고 본문을 읽지 않는다. |
| 성공 결과 | JSON은 HTTP 상태·메타데이터와 `data: unknown`, 무본문은 별도 empty 결과, 바이너리는 별도 bytes 결과로 구분한다. JSON200/201/202는 `{data:…}` 존재·형식을 검사하되 업무 DTO 검증이나 `as T`로 타입 안전성을 주장하지 않는다. 응답 DTO의 nullable 값은 보존한다. |
| HTTP 오류 | 4xx/5xx는 바이너리보다 JSON 오류 처리를 우선한다. `code`, `message`, UUID `requestId`, `{field,reason}[]`를 전달한다. `fields` 누락만 `[]`; null·문자열·잘못된 항목은 형식 실패다. 일반 오류에 임의 필드를 펼치지 않는다. 시작 endpoint의409 `ACTIVE_CONVERSATION_EXISTS`에서만 UUID `activeConversationId`를 별도 보존한다. |
| 메타데이터 | HTTP 상태와 필요한 `X-Request-ID`, `Location`, `Retry-After`, Content-Type을 본문 읽기 전에 확보하여 형식/읽기 실패에도 접근할 수 있게 한다. 누락·잘못된 값은 임의 ID나 대기시간으로 채우지 않는다. 오류 body의 requestId와 서버 헤더를 구분해 대조할 수 있게 하고 업무 중복키 clientRequestId와 혼합하지 않는다. 헤더·Location 원문도 로그/영구 저장소에 복사하지 않는다. |
| 형식 실패·읽기 실패 | 빈2xx(204 제외), 잘못된 JSON/MIME/envelope는 format failure다. 이미 소비한 본문, 헤더 이후 읽기 취소·통신 실패는 별도 body-read failure로 분류한다. HTTP 응답을 받은 뒤의 실패를 미전송으로 표시하지 않는다. 원문 body·예외 메시지를 진단 결과에 넣지 않는다. |
| 본문 소유권 | parser는 전달받은 Response의 본문을 최대 한 번 읽는다. 원본 보존이 필요한 호출부만 clone하며 모든 바이너리를 무조건 복제하지 않는다. `authTransition()` classifier가 받는 clone과 반환되는 원본, 인증 결과와 CSRF refresh 결과의 분리를 유지한다. |
| 인증 문맥 | 기존 세대 검사는 헤더 수신까지다. parser는 세션/UI 상태를 바꾸지 않는다. 늦은 body 결과의 상태 반영 전 현재 인증 문맥 확인은125/167 책임이다. auth gate를 모든 body 읽기까지 확장하지 않는다. |
| OAuth | 검증된 API 설정의 서버 origin과 `/oauth2/authorization/google`로 시작 주소를 만든다(`/api/v1` 밖). 임의 URL/query/비밀값을 받지 않는다. 3xx는 JSON 오류와 분리하고 Location을 자동 탐색하지 않는다. 기존 fetch `redirect:error`를 유지하며 이때 통신 실패를 관측302로 바꾸지 않는다. 합성302 시험은 네이티브302 접근 증거가 아니다. 외부 브라우저 실행·callback/쿠키 연동은126/129다. |
| 167 인계 | 정상/HTTP 오류/redirect/format failure/body-read failure와 기존 not_sent/transport_error/stale_response를 구분할 수 있게 한다. code별 복구·인증 만료 상태·Retry-After 적용·재시도 결정은167에서 한다. 166은 401/403/429/503이나 CSRF 갱신 뒤 POST를 자동 반복하지 않는다. |

#### 단계별 테스트와 완료 지점

각 단계는 2~3시간 단위 중간 저장 지점이며 소요시간 보장이 아니다. 최소 동작마다 실패 테스트→구현→관련 테스트 및 전체 Jest를 실행한다. 실제 변경만 해당 166 키로 커밋하고 결과 보고 후 다음 단계 승인을 받는다.

| 단계 | 예정 파일·검증 | 완료 지점 |
| --- | --- | --- |
| 1 작업 공간·계약 | 기존 파일 보존 비교, 최신 FE/BE/Jira·문서·CI 대조, 고정 환경 설치와 기존 Jest 기준선 | 이 절과 계약/책임/테스트 행렬 확정. 제품 코드 미변경 |
| 2 요청 준비 | `requestBody.ts`·인접 테스트. JSON 정상/UTF-8/암묵 변환 실패, none의 네 경로·헤더 허용/오류, FormData/수동 Content-Type 충돌. serializer→실제 client→주입 fetch에서 최종 body·헤더·전송 횟수를 확인 | 준비 실패 때 CSRF·POST 모두 0회, 0바이트에 body 없음, POST CSRF 적용. 합성 비밀번호/PIN/token의 URL·로그·영구 저장 비노출 |
| 3 JSON·204·오류 | `response.ts`·인접 테스트.200/201/202,204 무읽기,204 예상 밖 상태, 빈/잘못된 JSON·MIME·envelope, fields 누락/잘못된 타입, 시작409 확장 제한, requestId·Location·Retry-After 보존 | serializer→client→parser 연결. 기존 authTransition clone/원본·refresh 성공/실패 회귀. bodyUsed·읽기 취소/단절·늦은 결과와 인증 문맥 경계 검증 |
| 4 바이너리·OAuth | `response.ts`와 작은 OAuth 주소 helper·인접 테스트. 합성 음성 bytes 보존, 음성 요청의 JSON4xx/5xx, 잘못된 MIME,3xx 별도 분류, origin·framework 경로/임의 query 차단 | 비밀값 없는 OAuth handoff, 자동 이동/재전송 없음. 음성 MIME·TTL 예시를 운영 확정값으로 고정하지 않음 |
| 5 연결·네이티브·인계 | 기존 `scripts/native-session` 수신자/개발 전용 probe를 필요한 만큼 확장. 양 OS에서0바이트·JSON·multipart·바이너리·읽기 취소·redirect 거절과 Android POST1회 회귀. 기존 README와 이 기록 갱신 | 로컬 전체 검사·양 플랫폼 export/필요 빌드·런타임 결과 구분,167/168 인계 및 PR 준비. 실제 서버129 성공이나 PR 완료로 보고하지 않음 |

- 기존 `client.test.ts`의 0바이트/FormData 통과 사례와 Android one-shot 보완을 재사용한다. parser를 거치는 정상 fixture에는 JSON Content-Type을 명시하되 누락 MIME의 실패 fixture는 남긴다. `src/examples/apiModeReceiver.test.ts`의 연결도 필요한 단계에서 보강한다.
- 제품 mock은 GET csrf/me 예제만 유지한다. 추가 POST/204/바이너리 사례는 real 모드의 주입 fetch 또는 격리 loopback 수신자로 시험하며, 운영 mock에 미구현 API 전체를 추가하지 않는다. App/index의 일반 진입점에서 진단 모듈을 import하지 않는다.
- 보안 검증은 2단계부터 각 기능에 포함하며 168까지 미루지 않는다. 합성 데이터만 쓰고 원문 요청/응답, cookie/token/PIN, 원본 대화·음성을 로그·결과·증빙·영구 저장소로 복사하지 않는다.
- 로컬 기본 명령은 `npm run lint`, `npm run typecheck`, `CI=true npm test`; 최종 검증은 온라인 `npx --no-install expo install --check`, `npm run test:env`, Android/iOS export 및 필요한 네이티브 빌드·런타임 검사다. 의존성 변경 또는 깨끗한 재현이 필요할 때 `npm ci`를 다시 실행한다.
- 현재 PR CI는 전체 Jest를 수집하므로 새 인접 `*.test.ts`가 포함되는지 실제 실행에서 확인한다. JS job은 manifest·Jira 검사 회귀·고정 npm·설치·온라인 Expo·lint·typecheck·Jest·환경 주입·양 플랫폼 export, 후속 job은 Android/iOS 빌드이며 세 job 성공을 `frontend-quality`가 집계한다. CI 빌드는 네이티브 probe 실행을 대신하지 않는다. PR을 요청받은 뒤에는 최신 commit의 실제 원격 검사 로그를 별도로 확인한다.

#### 2026-11-04 재확인·남은 단계 실행 계획

- FE development `3d402b58bf0d91191b8caf7b87a81da26a7bdb2c`는 동일하며, 전용 branch는 2단계 커밋 `7c1575d`에서 이어간다. Jira166은 담당 고영준·진행 중, 부모123 진행 중이다. 기존 작업 공간은 보존한다.
- BE development는 [`bb11afdd2a26888ce05feae29b11df73366fdb7e`](https://github.com/DodamDodam-Capstone/backend/commit/bb11afdd2a26888ce05feae29b11df73366fdb7e)로 갱신됐다. 이전 기준 이후 docs/p0 변경은 없고 OpenAPI info.version `3.1.0`과 D13/D14/D17 미확정 범위는 유지된다. 위 표의 고정 링크는 10/28 근거이며 최신 소스와 구별한다.
- 최신 BE의 `auth/api/AuthLogoutController`와 `global/web/Part1JsonRequestGuardFilter`를 적용 근거로 사용한다. 0바이트 logout/204 계약은 동일하다. 새 guard의16KiB/JSON 제한은 POST logout·children에 한정하며 음성/모든 API로 확대하지 않는다. 자녀 등록의201+상대 Location,409 CHILD_LIMIT_REACHED,500/503 오류는 공통 파서의 실제 구현 기반 fixture로 활용한다. Location으로 자동 GET·화면 이동하지 않는다.

| 중간 완료 지점 | 구체적인 구현·검증 기준 |
| --- | --- |
| 3-A JSON·204와 실패 경계 | `parseApiResponse(response, expectation)`에 예상 `json`/`empty`와 허용 성공 상태를 명시한다. JSON200/201/202의 data는 unknown,204는 허용한 경우에만 empty이며 읽지 않는다. 읽기 전에 HTTP 상태와 X-Request-ID/Location/Retry-After/Content-Type만 메타데이터로 확보한다. `text()` 읽기와 `JSON.parse()`를 나누어 본문 소비/읽기 실패와 JSON 형식 오류를 구분한다. 읽기 예외의 취소 원인을 추정하지 않고 고정 사유만 반환한다. |
| 3-B 오류·연결·회귀 | 오류의 code/message/requestId/fields를 검증·전달한다. `errorContext: 'conversation_start'`를 지정한409 ACTIVE_CONVERSATION_EXISTS에만 UUID activeConversationId를 요구·보존한다. 동일 status/code라도 일반 호출은 확장을 반환하지 않는다. 요청 준비→real client→parser,201 상대 Location,204/오류,이미 읽은 본문,읽기 거절,authTransition의 clone/원본·refresh 실패 분리,늦은 본문과 인증 문맥 경계를 검증한다. 전체 Jest·lint·typecheck 및 diff 확인 후3단계 커밋·보고한다. |
| 4 바이너리·OAuth | 승인 후200 bytes 보존과 JSON4xx/5xx 우선 처리,명세가 허용한 MIME 판단,관측3xx 별도 결과와 OAuth 시작 주소 helper를 구현한다. `redirect:error` 전송 실패를 관측302로 위장하지 않는다. 운영 음성 MIME/제한은 미확정으로 유지한다. |
| 5-A 로컬·CI 준비 | 새 테스트의 전체 Jest 수집을 확인하고 설치 재현·온라인 Expo·환경 주입·양 플랫폼 export/필요 빌드를 실행한다. 실제 실행 명령과 결과를 기록하며 기존 CI 검사를 우회하지 않는다. |
| 5-B 새 파서의 네이티브 검증·인계 | 기존 loopback 수신자와 개발 probe를 확장해 합성 바이너리 응답 수신,본문 지연·단절·취소를 새 parser로 통과시킨다. 양 OS에서 결과·메타데이터 보존을 확인한다. 기존 post-loss-binary는 업로드/재전송, cancel-body는 인증 classifier 검사이므로 새 파서 증거를 대신하지 않는다. 런타임이 헤더/본문 경계를 노출하는지 실제로 확인하고 관측 불가한 경우를 성공으로 표기하지 않는다. 기존0바이트·multipart·redirect·Android POST1회는 회귀로 유지한다. README/이 기록 및167/168 인계를 마무리한다. |

- 각 행은2~3시간 단위 중간 완료 지점이며 소요시간 보장이 아니다. 이번 승인은3단계까지 실행하고, 사용자의 기존 단계별 승인 요청에 따라 완료 보고 후4단계로 넘어간다. PR·push·병합·Jira 변경과 원격 CI 실행은 이번 범위에 포함하지 않는다.
- 공통 parser는 전체 OpenAPI/업무 DTO validator가 아니다. 확인한 필드를 새 결과로 구성하며 미정의 error/envelope 필드를 그대로 펼치지 않는다. fields 누락만[]이며 null/잘못된 항목은 형식 실패다. generic data 보존 시험은 해당 endpoint가 primitive/null DTO를 허용한다는 증거가 아니다.
- JSON MIME은 application/json과 선택적인 UTF-8 charset을 수용한다. requestId는 UUID 형식만 확인하며 v4로 제한하지 않는다. body requestId와 헤더 원문은 별도로 유지해 불일치를 호출부가 확인할 수 있게 한다. 헤더 누락/잘못된 값을 생성·보정하거나 Retry-After 재시도 정책을 여기서 적용하지 않는다.
- 결과 종류는 JSON·empty·HTTP 오류·형식 실패·본문 읽기 실패를 구별한다. 기존 ApiResult의 미전송/통신 실패/stale은 그대로 인계하며 parser는 raw response일 때만 호출한다. 인증 세대·UI 상태 변경은 하지 않는다. 원문 payload/예외를 실패 진단에 넣거나 어떤 결과든 일괄 로그·영구 저장하지 않는다.
- 종전11/3 목표는 지났다. 남은 구현·기기·리뷰·원격 CI·병합 결과를 확인해 일정을 판단하며 이 기록으로 Jira 일정/상태를 변경하지 않는다.

#### 미확정 사항과 1단계 실행 기록

- D13/D14의 실제 MIME·codec·크기·길이·AI 기한·TTL, D17의 운영 origin·callback·쿠키/CORS·제한은 미확정이다. 현재 단계의 형식 처리 개발은 명세 fixture로 진행할 수 있으나 실제 음성·OAuth·서버 통합 완료는 해당 확정값과129 환경이 필요하다. 다음 기능 단계 시작 시 계약 변경 여부를 다시 대조하고, 필요한 값이 여전히 없으면 해당 통합 검증을 미확인으로 남긴다.
- 새 작업 공간에서 Node `24.20.0`·npm `11.19.0`로 `npm ci --no-audit --no-fund` 성공, 기존 Forge postinstall 검증 성공. `fsevents`·`unrs-resolver` install-script 미승인 경고는 유지하고 승인 설정/의존성을 변경하지 않았다. 감사 명령은 실행하지 않았으므로 이번 설치를 새 취약점 감사 결과로 보고하지 않는다.
- `CI=true npm test`: **11개 suite·201개 테스트 통과**. 이는 기존 코드 기준선이며 아직 작성하지 않은 166 테스트의 통과가 아니다. 이번 1단계에는 기능·CI·의존성 변경이 없으므로 네이티브 빌드/런타임·실서버 검증을 재실행하지 않았다.
- 완료 지점: 전용 작업 공간, 계약 적용 범위와 결과 경계, 단계별 테스트 기준. 다음 한 가지: 승인 후 2단계 요청 준비의 실패 테스트부터 작성. PR 생성·push·병합·Jira 변경은 하지 않는다.

### SCRUM-166 2단계 — 요청 본문 준비·client 연결 · 2026-10-28

- 착수 시 FE development `3d402b58`·BE development `f9a86e91` 및 Jira166 진행 중을 재확인했다.1단계의 고정 계약을 유지하며 전용 worktree에서 진행했다.
- `src/api/requestBody.ts`에 순수 준비 함수 `prepareRequestBody()`와 `RequestBody`/`RequestBodyResult`를 추가했다. JSON·none·FormData를 구분하고 성공 시 body/headers만 전달한다. 실패는 `invalid_body`/`invalid_headers`/`invalid_content_type`이며 client를 호출하지 않는 사용법을 README에 기록했다. raw client와 CSRF·인증 전환 구현은 변경하지 않았다.
- JSON은 plain 값의 복사본에서 직렬화하여 준비 후 원본 DTO 변경의 영향을 차단한다. undefined·hole·비유한 숫자·BigInt·순환·getter/custom toJSON·숨은/추가 속성 등의 생략·암묵 변환을 거절한다. endpoint별 필드·null 허용은 호출부 책임이고, serializer가 일반 JSON null을 허용한다는 이유로 현재 DTO의 null을 허용한 것은 아니다.
- none은 body/기본 Content-Type을 만들지 않으며 명시된 JSON/UTF-8 헤더는 유지한다. FormData는 같은 객체를 보내고 수동 Content-Type을 거절한다. FormData의 전송 중 변경 금지는 호출부 책임으로 명시했다. MIME·용량·TTL 등 미확정 운영값이나 새 의존성을 추가하지 않았다.
- 최초52개 계약/연결 테스트는 최소 뼈대에서 **43개 실패·9개 통과**를 확인한 뒤 구현해 모두 통과했다. 기존 동작 보존·민감값 비노출·인증 전환 연결 사례를 보강하여 새 테스트는57개다. 실제 준비 함수→기존 real 모드 client→주입 fetch의 최종 URL/body/headers를 확인하며, 실패 시 CSRF/POST0회, logout 뒤 CSRF 재획득,401/403/429/503의 POST 자동 재전송 없음도 검사한다.
- 보안 검증은 합성 password/PIN/code/token의 JSON 운반, URL 비노출, console 비기록, localStorage/sessionStorage 쓰기 없음, 실패 결과의 원문 예외 미포함과 기존 인증 헤더 보호를 확인했다. 준비 성공 결과는 본문을 포함하므로 로그나 영구 저장 대상으로 사용하지 않는다. 네이티브 영구 저장소 전체를 계측한 시험으로 확대하지 않으며 제품 모듈에 저장 API/import를 추가하지 않았다.
- 검증 환경은 Node `24.20.0`·npm `11.19.0`이다. 최종 `npm run lint`, `npm run typecheck`, `CI=true npm test` **12개 suite·258개 테스트**, `git diff --check`가 통과했다. 최초 타입 검사의 테스트 afterEach 반환형 오류1개는 반환값 없는 block으로 수정 후 재검증했다.
- 제품 mock 확장·App/일반 진입점·의존성·CI·네이티브 설정 변경은 없다. 이번 단계는 Jest 연결 검사까지이며 설치·온라인 Expo·환경 주입·export·네이티브 빌드/런타임·실서버·원격 CI는 재실행하지 않았다. 양 OS의 실제 multipart boundary/0바이트 관측 등은5단계, 실제 서버는129 책임이다.
- 완료 지점: 요청 준비와 연결·보안 회귀. 다음 한 가지: 승인 후3단계 JSON/204/오류 응답 parser의 실패 테스트부터 작성. push·PR·병합·Jira 변경은 하지 않았다.

### SCRUM-166 3단계 — JSON·204·오류 응답과 연결 회귀 · 2026-11-04

- 재확인·구체화한 계획에 따라 `src/api/response.ts`에 `parseApiResponse()`와 입력/결과 타입을 추가했다. 기존 client/CSRF/요청 준비 구현은 보존했다. 성공 JSON의 data:unknown,204 무읽기,HTTP 오류,형식 실패,본문 읽기 실패를 구분한다. HTTP 상태와 선택 헤더를 본문 읽기 전에 확보하며 예외·원문 본문을 실패 결과에 넣지 않는다.
- 대화 시작을 명시한409 ACTIVE_CONVERSATION_EXISTS에만 UUID activeConversationId를 요구·보존한다. fields 누락만[]로 호환하고 잘못된 타입은 거절한다. 알려진 필드만 새 객체로 구성한다. code/message에 명세에 없는 minLength를 부과하거나 UUID를 v4로 제한하지 않는다. 전체 DTO/schema 검증,재시도/인증 만료 정책은 추가하지 않았다.
- 새 단위82개·연결13개,총95개 테스트를 추가했다. JSON/204/MIME/읽기 실패의 최초37개는 최소 뼈대에서31개 실패·6개 통과,HTTP 오류 확장 후82개는44개 실패·38개 통과를 확인하고 구현했다. 3-A 전체295개,3-B 전체340개를 거쳐 최종 전체353개가 통과했다.
- 구현 중 실패도 수정 후 확인했다. MIME 정상 사례3개 실패는 테스트 fixture에 대소문자가 다른 Content-Type 키를 중복 구성해 값이 합쳐진 원인이었으며 Headers.set으로 수정했다. 타입 검사2개 오류는 Jest29의 it.each와 readonly tuple 선언 간 불일치였고 명시적 tuple 타입으로 수정했다. children/end fixture는 최종 OpenAPI의 필수 DTO 필드와 KST 시각 형식에 맞춰 보완했다. 제품 파서의 검증 기준을 느슨하게 하거나 실패 검사를 제외하지 않았다.
- 실제 요청 준비→real client→parser에서201 상대 Location,0바이트 요청의204와 JSON200/202 차이,401/403/429/503 자동 재전송 없음,응답 수신 후 읽기 거절을 확인했다. authTransition clone 소비 후 원본 보존과 CSRF refresh503 분리,일반 본문이 늦어도 인증 전환을 막지 않는 책임 경계도 검사했다. 예제 real fixture에 MIME과 파서 확인을 추가했다. Jest의 주입 transport/본문 지연 시험은 양 OS의 실제 읽기 취소 성공을 뜻하지 않는다.
- Node `24.20.0`·npm `11.19.0`에서 최종 `npm run lint`, `npm run typecheck`, `CI=true npm test` **14개 suite·353개 테스트**, `git diff --check`가 통과했다. 읽기 전용 별도 코드 리뷰에서 이번 범위에 추가 조치가 필요한 결함은 발견하지 못했다. 기존 CI의 전체 Jest 명령이 새 테스트를 수집하는 것을 로컬에서 확인했으며 원격 CI를 실행한 것은 아니다.
- 기존 checkout·한국어 주석·SCRUM-178·165·179의5개 작업 공간은 착수 전후 HEAD/status와 변경 파일 해시가 동일했다. 일반 App/index·운영 mock·의존성·CI·네이티브 설정은 변경하지 않았다. 설치·온라인 Expo·환경 주입·export·기기 런타임·새 의존성 감사는 이번 단계에 재실행하지 않았고5단계/해당 별도 작업에 남는다.
- 완료 지점: 3단계 로컬 구현·검증과 README/이 기록. 다음 한 가지: 사용자 승인 후4단계 바이너리·OAuth. 이번 단계의 로컬 커밋만 수행하며 push·PR 생성·병합·Jira 변경은 하지 않는다.

### SCRUM-166 4단계 — 바이너리·OAuth · 2026-11-04

- 사용자 승인 후 전용 branch의3단계 커밋 `42451f9`에서 이어갔다. FE development `3d402b58`·BE development `bb11afdd` 및 Jira166 진행 중/담당 고영준이 동일함을 재확인했다. 위3단계 시점의 승인 기록과 이번4단계 승인을 구별한다.
- 적용 계약은 BE `bb11afdd`의 [음성 §7.8](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/07-voice.md), [인증 §6.17·6.18](https://github.com/DodamDodam-Capstone/backend/blob/bb11afdd2a26888ce05feae29b11df73366fdb7e/docs/p0/api/02-auth.md), OpenAPI `getTemporaryTurnAudio`/OAuth 시작 경로다. `audio/*`는 미정 MIME 초안이며 octet-stream 허용 근거가 없다. 음성 GET 오류 fixture는401 AUTHENTICATION_REQUIRED,403 CHILD_SESSION_REQUIRED,410 AUDIO_EXPIRED,429 RATE_LIMITED,503 AUTH_STATE_UNAVAILABLE를 사용했다.
- `response.ts`에 binary200 기대값과 bytes/redirect 결과를 추가했다. audio 계열의 구체적 media type을 확인하고 arrayBuffer를 한번 읽어 변형/clone 없이 반환한다. JSON4xx/5xx 우선,읽기 전 MIME 거절,본문 소비/읽기 실패·메타데이터 보존을 유지한다.0바이트200의 empty_body는 승인된 FE 빈2xx 방어 규칙이며 BE 최소 음성 크기를 새로 정한 것이 아니다. 실제 codec·크기·길이·TTL·운영 allowlist는 D13/D14에 남는다.
- 관측한301/302/303/307/308만 별도 redirect 결과로 반환하며 본문을 읽거나 Location을 열지 않는다.300/304/305/306은 예상 밖 상태다. Location 누락/미검증 원문은 메타데이터로만 보존한다. 기존 client의 redirect:error와 통신 실패 분류를 유지했으며 합성3xx와 실제 네이티브 관측을 구별했다.
- `oauth.ts`의 `resolveOAuthStartUrl()`는 기존 환경/API URL 검증 뒤 서버 origin과 `/oauth2/authorization/google`을 조합한다. API base path·앱 복귀 주소·임의 query는 붙이지 않는다. helper는 네트워크/OS 이동을 하지 않으며 OAuth 화면·callback·쿠키 연동126/129를 구현한 것이 아니다.
- 최초 바이너리/redirect37개 검사는16개 실패·21개 통과,OAuth20개는 최소 뼈대에서20개 실패를 확인하고 구현했다. client 연결·로그 비기록 회귀7개를 보강해 이번 새 검사는64개다. 음성 GET 쿠키 포함/CSRF 미발급,주입 POST3xx의 무재전송,redirect:error 전송 실패가 관측302로 변하지 않는 것을 검사했다.
- OAuth 기본입력 검사에서1개 실패가 발생했다. Expo가 정적으로 치환한 환경값을 Jest 실행 중 process.env 교체로 바꾸려던 테스트 가정이 원인이었다. reader 이후 URL 생성은 readEnvironment 경계 주입으로,정적 치환은 기존 test:env로 나누어 확인했다. 환경/제품 검증을 끄거나 동적 환경 참조로 바꾸지 않았다.
- Node24.20.0·npm11.19.0에서 최종 `CI=true npm test` **16개 suite·417개 테스트**, `npm run lint`, `npm run typecheck`, `npm run test:env` **Android/iOS14개 조합**, `git diff --check`가 통과했다. 별도 읽기 전용 리뷰에서도 이번 범위에 추가 조치가 필요한 결함을 발견하지 못했다. 기존5개 작업 공간의 HEAD/status/변경 파일 해시가 착수 전후 동일했다. 기존 App/index·client·CSRF·환경 모듈·의존성·CI·네이티브 설정을 변경하지 않았다. 설치·온라인 Expo·export/네이티브 빌드·기기 실행·실서버·원격 CI·새 의존성 감사는 이번 단계에 재실행하지 않았다.
- 완료 지점:4단계 로컬 구현과 사용법. 다음 한 가지: 사용자 승인 후5단계 최종 재현·새 파서의 양 OS 네이티브 검사·인계. 로컬 단계 커밋만 수행하고 push·PR·병합·Jira 변경은 하지 않는다.

### SCRUM-166 5단계 — 최종 재현·네이티브 오류 보완·인계 · 2026-11-04

- 전용 branch의4단계 `64e4325`에서 진행했다. 착수 때 FE development `3d402b58`·BE development `bb11afdd`와 Jira166 진행 중/담당 고영준을 다시 확인했다. API v3.1.0과 D13/D14/D17 미확정 경계를 유지하며 운영값·DTO를 새로 만들지 않았다.
- 일반 App/index·제품 client/CSRF/parser를 변경하지 않고 `scripts/native-session/response.tsx`와 격리 수신자를 추가했다. 실제 global fetch로25개 사례를 실행한다. JSON201·204·202·0바이트·multipart boundary, 바이트 보존/빈 바이너리/JSON 오류,잘못된 JSON/MIME/fields, 본문 지연·취소·단절·읽기 전 단절·늦은 clone,redirect 차단·실제 POST1회,authTransition classifier clone/원본과CSRF 재획득을 구분한다. 수신자41개·설치15개 테스트를 추가했다.
- 중간 실패를 통과로 처리하지 않았다. 최초 Android21개에서5개가 실패했다. 작은 고정 길이 JSON은 개발 Network Inspector의 본문 미리 읽기로 헤더 수신부터 대기했고, 취소/단절 바이너리는 Expo 원본 buffered reader가 부분 바이트를 성공으로 반환했다. iOS 원본 reader는 취소 후 Promise가 끝나지 않았다. 첫 패치 후 Android 원본 응답23개는 통과했으나, 추가한 늦은 clone 읽기는 양 OS에서 미완료 대기를 재현했다. 진단 보고서의 필수 platform/stage 누락도 실제 실행 중 발견해 수정했다.
- `patchExpoFetch.cjs`를 기존 Forge postinstall 뒤에 연결했다. Expo57.0.31의 Android NativeResponse 오류 상태 보존, 양 OS text/arrayBuffer의 오류 상태 reject, startStreaming의 선행 오류 throw를3개 네이티브 파일에 적용한다. 공식 원본/최종 패치 SHA256만 허용하고 파일·버전·프로젝트·경로를 모두 검증한 뒤 쓴다. 원본/일부 적용/재실행,잘못된 소스·버전·cwd·심볼릭 링크·중간 패치 거절15개를 확인했다. 패키지 버전·lockfile·JS parser API를 바꾸지 않았다. Expo Go나 기존 바이너리에는 적용되지 않으므로 development build 재빌드가 필수다.
- Android 지연 JSON은 chunked로 Inspector 간섭을 피한다. iOS에서 chunked의 서버 연결 종료가 정상 EOF로 전달되면 parser가 `invalid_json`을 반환하는 것을 관측했다. iOS의 본문 잘림 시험은 전체 Content-Length로 프레이밍 오류를 명확히 했고 바이너리는 두 OS 모두 전체 길이를 유지한다. 각 OS의 실제 헤더/단절 조건을 별도로 테스트했다. MIME/Accept를 속이거나 형식 실패를 성공으로 인정하지 않는다. 이 차이를 모든 네트워크 오류가 같은 kind로 전달된다는 주장으로 확대하지 않는다.
- 최종 코드와 동일한7개 구현 파일을 `git archive 64e4325`의 깨끗한 임시 복사본에 반영하고 해시로 일치를 확인했다. Node24.20.0/npm11.19.0의 fresh `npm ci`에서 Forge·Expo 패치 적용과 최종3개 SHA를 재검증했다. 온라인 `npx --no-install expo install --check`, manifest, Jira workflow 회귀7개, `npm run lint`, `npm run typecheck`, 전체 Jest **18 suites·473 tests**, `npm run test:env` **14개 조합**, 일반 index의 Android/iOS export가 모두 종료0이었다. 별도 `npm audit`의 종료1은 아래 별도 기록과 구분한다.
- 최종 `expo prebuild --platform android/ios --no-install` 후 기준76개 파일 변경이 없었다. JDK17.0.20.1/SDK36/NDK27.1의 `./gradlew :app:assembleDebug --no-daemon`은 BUILD SUCCESSFUL, CocoaPods1.16.2와 Xcode26.6의 `xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`는 BUILD SUCCEEDED였다. export·설치·두 빌드를 앞선 실패 버전의 결과로 대체하지 않았다.
- 최종 앱을 Android Pixel Tablet API36 에뮬레이터와 iPad Pro11형 M5/iOS26.5 시뮬레이터에 설치했다. 각 OS **새 응답25개 + 기존 요청26개 + 인증26개 =77개**, 합계 **154개** 고유 사례의 pass·cleanup을 확인했다. 단절 후 늦은 clone도 read_failed로 종료했고 기존 CSRF·redirect·0바이트/multipart·POST 단일 전송·인증 전환 회귀도 통과했다. 원문 데이터 대신 허용된 enum/횟수/boolean만 보고했다.
- 독립 코드 리뷰 후 추가 수정이 필요한 결함이 없음을 확인했다. 기존 CI는 `npm ci`의 새 설치 패치, 전체 Jest의 신규 테스트, 양 플랫폼 export/컴파일을 실행하도록 이미 연결돼 있어 workflow를 바꾸지 않았다. **CI가 준비돼 있다는 뜻이며 실제 원격 CI는 실행하지 않았다.** CI 컴파일이 로컬 probe154개 실행을 대신하지도 않는다.
- 기존 checkout·한국어 주석·SCRUM-178·165·179의5개 작업 공간은 HEAD/status와 미커밋17개 파일 해시가 시작 전과 같았다. 개인 `.env`를 로드하지 않고 검증했으며, 일반 App 복귀에서는 정상적으로 환경 설정 필요 안내가 나타났다. 이는 실서버 연결 완료 증거가 아니다.
- 완료 지점:166의5단계 로컬 구현·재현·네이티브 검증 및 인계. 다음 한 가지: 별도 요청에 따라 남은 Forge 보안 권고의 공식 수정/호환성 대책을 확인하고 PR 준비 여부를 판단한다. push·PR 생성/병합·Jira 변경은 하지 않았다. 일반 App 복귀 후 이번에 실행한 서버·장치·adb reverse를 정리했다. 이 단계의 변경만 로컬 커밋으로 저장한다.

후속 작업은 아래 경계를 이어받는다.

| 담당 범위 | 인계 내용 |
| --- | --- |
| SCRUM-167 | ApiResult의 미전송/통신/오래된 응답과 ParsedApiResponse의 HTTP/형식/읽기 실패를 먼저 구분한다. code·fields·requestId와 관측 헤더를 사용하되401·403·429·503 일괄 재시도나 실패 POST 재실행을 하지 않는다. Retry-After 원문 해석·인증 만료 상태·화면 반영 정책을 구현한다. 헤더 뒤 늦은 본문 반영은 현재 인증 문맥을 확인한다. |
| SCRUM-168 | 기존 계약 테스트를 확장하고 민감값이 URL·console·영구 저장소에 남지 않는 경계를 검증한다. parser 결과 전체와 FormData/준비 본문도 로그 대상으로 삼지 않는다. 설치 패치·기존 one-shot POST를 포함한 CI 및 실제 native 회귀의 증빙을 구분한다. |
| SCRUM-125·126·129 | 호출부의 확정 DTO·null/필드 허용을 검사한다. OAuth helper는 시작 주소 생성만 제공하며 브라우저/callback은126,실제 BE·HTTPS·쿠키/CORS와 확정 음성 정책 검증은129다. 합성 auth/음성/loopback 통과를 업무 API·실서버 성공으로 사용하지 않는다. |

- 아래 Forge 공식 버전 전환 전의 `npm audit --json`은 종료1, **49개(low6·moderate42·high1·critical0)**를 보고했다. high1은 `node-forge@1.4.0` 패키지 집계이며 high 권고6개를 포함한다. 기존 [DigestInfo 보완](https://github.com/advisories/GHSA-86w9-cpqp-85rv)의 적용 해시는 일치하지만 [PEM](https://github.com/advisories/GHSA-7wch-p9px-956x), [PKCS#12](https://github.com/advisories/GHSA-jc66-7q78-782g), [TLS 분할](https://github.com/advisories/GHSA-8hrf-8g6f-7xwp), [TLS 스택](https://github.com/advisories/GHSA-hqq3-7jhf-c5jx), [X.509](https://github.com/advisories/GHSA-5x38-2vff-x55p)는 그 패치 범위 밖이다. npm은 fixAvailable을 보고하므로 공식 수정 버전과 Expo 경로의 호환성을 별도 확인해야 한다. 이번 응답 처리 패치를 보안 감사 전체 해결로 보고하지 않는다. 의존 경로는 Expo→@expo/cli→node-forge와 @expo/code-signing-certificates이며 강제 upgrade/audit fix는 실행하지 않았다.

### SCRUM-166 후속 보완 — Forge 공식 수정 버전 전환 · 2026-11-04

- 사용자 승인에 따라 `e5452b0` 이후 같은 전용 작업 브랜치에서 진행했다. FE development `3d402b58`과 Jira166 진행 중/담당 고영준을 재확인했다. Expo SDK57.0.31과 제품 API 코드는 유지한다.
- 공식 npm의 최신 `node-forge@1.4.3`을 확인하고 `npm update node-forge --package-lock-only --ignore-scripts`로 해당 잠금 항목만 갱신했다. Expo CLI와 `@expo/code-signing-certificates`의 기존 허용 범위 `^1.3.3`을 만족하므로 새 직접 의존성이나 override는 추가하지 않았다. [공식 변경 기록](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md) 및 [이름 제약 수정 공지](https://github.com/digitalbazaar/forge/security/advisories/GHSA-3cc4-3294-vgjf)를 확인했다.
- 임시 `patchForge.cjs`와 해당 설치기 전용 테스트8개를 제거하고 postinstall은 Expo 본문 오류 패치만 유지한다. 기존 `forgeCompatibility.test.js`의20개 보안·실제 Expo 소비자 호환성 검사와 공개 fixture는 변경하지 않았다. 설치 시 Forge 소스를 별도로 수정하지 않는다.
- `forgeSecurity.test.js`에 제한된 자식 프로세스의 PEM 거부 검사와 합성 인증서의 허용/금지 이름 검사를 추가했다. 기존 임시 패치가 적용된1.4.0에서2개 모두 실패(PEM 제한시간 초과, 허용 범위 밖 인증서 수용)했고 공식1.4.3에서2개 모두 통과했다. 키는 실행 중 메모리에서만 생성하며 저장·로그하지 않는다. 이 두 사례로 모든 암호 취약점이나 앱의 원격 악용 가능성을 입증한 것은 아니다.
- Node24.20.0/npm11.19.0에서 격리 복사본과 작업 공간의 `npm ci --no-audit --no-fund`, 별도 격리 `npm ci --omit=dev --no-audit --no-fund`가 성공했다. 두 Expo 소비자가 공식1.4.3을 해석하는지 확인했으며 남겨둔 Expo 네이티브 패치도 정상 적용됐다.
- `npm run lint`, `npm run typecheck`, `npm test` **18 suites·467 tests**, `npm run test:env` **14개 조합**, manifest 검사, 온라인 `npx --no-install expo install --check`, Android/iOS `expo export`가 모두 통과했다. 기존473개에서 설치기 검사8개를 제거하고 보안 회귀2개를 추가한 결과다. 기존 CI는 전체 Jest를 수집하므로 신규 검사도 포함되며 workflow는 변경하지 않았다.
- 격리 복사본에서 `expo prebuild --no-install`·`pod install` 후 Android `:app:assembleDebug --no-daemon --console=plain`과 서명 없는 iOS Simulator Debug `xcodebuild`가 모두 성공했다. 앱·API·네이티브 패치 소스가 그대로이므로 이전154개 기기 probe는 이번에 반복하지 않았다. 이 기록은 원격 PR CI·실기기·실제 서버 검증을 대신하지 않는다.
- 전환 후 전체 `npm audit --json`은 **low6·moderate42·high0·critical0**, `--omit=dev`는 **low1·moderate18·high0·critical0**이며 두 결과에서 Forge 항목이 사라졌다. 잔여 low/moderate 때문에 두 감사 명령은 종료1이다. high/critical 해소와 전체 감사 통과를 구분하며 제외 규칙이나 가짜 버전을 적용하지 않았다.
- 변경 diff의 독립 검토에서 추가 수정이 필요한 결함은 발견하지 못했다. 설치·검사·빌드 로그는 로컬 `/private/tmp/scrum166-forge-logs`, 감사 결과는 `/tmp/scrum166-forge-audit.json` 및 `/tmp/scrum166-forge-audit-production.json`에 있다. 기존 다른 작업 공간은 보존하며 push·PR·병합·Jira 변경은 하지 않는다. 다음 한 가지는 사용자 요청 시 최신 커밋의 PR CI·GitHub 코드 리뷰다.

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

### SCRUM-165 의존성 보안 보완 — Zod 4.6.7 · 2026-10-26

- 기준 HEAD는 `bd55d1d85495f4fe00cfba20a453c392bd75d54d`다. `package.json`의 전역 override로 Zod를 `3.25.76 → 4.6.7`에 고정했다. Expo CLI뿐 아니라 ESLint 경로에도 이전 사본이 남지 않도록 설치 트리를 확인했다. lockfile 변경은 `node_modules/zod`의 version·resolved·integrity 세 필드뿐이며 Expo `57.0.31`·CLI `57.0.32`·RN `0.86.3`은 유지했다.
- [보안 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)의 수정 버전 범위와 [수정 PR](https://github.com/colinhacks/zod/pull/6652)을 대조했다. [zodCompatibility.test.js](../scripts/security/zodCompatibility.test.js)는 실제 CLI가 해석하는 Zod, 플러그인 descriptor·명령 schema·출력/오류/일반 텍스트 처리와 실제 ESLint의 Hook·Compiler 진단을 검사한다. 기존 Zod에서 조기 거부 검사1개 실패·나머지12개 통과 후 교체했고, 새 버전에서는13개 모두 통과했다.
- 상한2·입력1000개의 합성 배열은 기존1000개 처리/1001개 오류에서 **원소 처리0개/오류1개**로 바뀌었다. 이 숫자는 시험 fixture이며 운영 상한이 아니다. 현재 CLI의 상한 없는 출력 배열은 그대로이며, 이 결과를 모든 큰 입력의 메모리 제한이나 앱의 원격 악용 차단으로 확대하지 않는다. 미설치인 선택적 MCP의 실제 등록·전송 경계도 검증하지 않았다.
- Node `24.20.0`·npm `11.19.0`에서 `npm ci`, 온라인 `expo install --check`, lint·typecheck, 전체 Jest **9 suite·173 tests**, 환경 주입 **14개 조합**, 일반 진입점 Android/iOS export를 확인했다. 격리 프로젝트의 Android/iOS `prebuild --no-install`도 성공했고 app.json·manifest·lockfile에 추가 변경이 없었다. 네이티브 의존성·플러그인·앱 설정 변경이 없어 Gradle/Xcode 재컴파일은 반복하지 않았다.
- 격리 프로젝트의 `expo start --dev-client --localhost`를 임시 포트에서 실행해 `/status` HTTP200·Metro 준비 상태를 확인하고 해당 서버를 종료했다. 개인 환경 파일은 읽지 않았고, 일반 앱·기기·실제 API 서버 검증으로 취급하지 않는다.
- 전체 및 `--omit=dev` 감사는 **high5 → high4, critical0**이며 Zod 항목은 사라졌다. 남은 `node-forge`, `@expo/code-signing-certificates`, `@expo/cli`, `expo`는 Forge 취약점과 그 영향이다. Forge 패치는 이 단계에서 적용하지 않았다. 원래 보안 진단6개는5개 통과·Forge 기대값1개 실패로 바뀌었으며 해당 실패 원본을 보존했다. 감사 전체 통과로 보고하지 않는다.
- 검증 증빙은 로컬 임시 `scrum165-security-zod4-r6qpadh4`에 보관한다. 기존 작업 공간의 사용자 변경을 보존하고 PR·push·병합·Jira 변경은 수행하지 않았다. 공식 Expo CLI가 수정된 Zod를 직접 지원하면 override 제거 후 같은 호환성 검사를 실행한다. 다음 단계는 별도 진행 확인 후 Forge의 최소 패치·정상 서명/인증서 회귀 검사다.

### SCRUM-165 의존성 보안 보완 — Forge 설치 후 패치 · 2026-10-26

- 기준 HEAD는 `072c0f4b58c38ffa708df20a1a33d2c7e007b4f8`다. 공식 npm 최신 Forge는 `1.4.0`이고 수정 PR은 미병합이다. [고정 공개 수정안](https://github.com/digitalbazaar/forge/commit/85446800199c4995d3cd4b0ab5a8409df4455859)의 nested DigestAlgorithm 개수·빈 NULL 검사를 독립 검증한 뒤 최소 기능 변경만 로컬 적용했다. RSA 산술·패딩 정책·패키지 이름·버전은 바꾸지 않았다.
- [당시 patchForge.cjs](https://github.com/DodamDodam-Capstone/frontend/blob/3d402b58bf0d91191b8caf7b87a81da26a7bdb2c/scripts/security/patchForge.cjs)를 root `postinstall`에서 실행한다. lockfile의 모든 Forge 경로를 대상으로 잠금/설치 버전 `1.4.0`, 정규 경로·심볼릭 링크, 원본 SHA-256 또는 검증된 패치 후 SHA-256을 확인한다. 모든 사본을 먼저 검사한 뒤 변경하며 예상 밖 경로·버전·소스 또는 대상 부재는 설치 실패로 처리한다. 이미 패치된 사본은 재실행해도 유지한다. 새 의존성 없이 Node 기본 모듈만 사용하며 lockfile 변경은 root의 `hasInstallScript`뿐이다.
- [forgeCompatibility.test.js](../scripts/security/forgeCompatibility.test.js)의 공개 fixture·실제 CLI/인증서 해석 경로와 정상 서명·SHA NULL 생략/존재·기존 MD5 조건·Expo 인증서/manifest 검증을 확인했다. 수정 전20개 중7개 실패, 개수 검사만 적용하면 NULL 내용 검사1개 실패, 개수와 빈 NULL 검사 후20개 모두 통과했다. [당시 patchForge.test.js](https://github.com/DodamDodam-Capstone/frontend/blob/3d402b58bf0d91191b8caf7b87a81da26a7bdb2c/scripts/security/patchForge.test.js)는 다중 사본·재실행·알 수 없는 소스·버전·대상 부재·경로 탈출·심볼릭 링크를8개 검사로 확인한다. 실제 private key는 테스트 실행 중 메모리에서만 생성하며 저장·로그하지 않는다.
- 격리 공간에서 일반 `npm ci`와 별도 `npm ci --omit=dev`가 각각 root postinstall을 실행하고 동일한 패치 후 파일 해시를 만들었다. 원래 보안 진단6개는 두 설치 모드 모두 **6/6 통과**, 이전 Forge 실패도 통과했다. Node `24.20.0`·npm `11.19.0`의 전체 Jest는 **11 suite·201 tests**, lint·typecheck·환경 주입14개 조합·온라인 Expo 검사와 일반 앱 Android/iOS export가 통과했다.
- 격리 프로젝트의 Android/iOS prebuild는 성공했고 app.json·manifest·lockfile에 추가 변경이 없었다. 루프백 개발 서버 `/status` HTTP200을 확인하고 종료했다. 네이티브 SDK·플러그인·앱 설정 변경이 없어 Gradle/Xcode 재컴파일·기기 시험은 반복하지 않았으며, 실서버129·OAuth·앱 원격 악용 검증으로 확대하지 않는다.
- 전체 및 `--omit=dev` 재감사는 **high4·critical0, 종료1**이다. `node-forge`와 상위 `@expo/code-signing-certificates`·`@expo/cli`·`expo` 항목은 공식 버전 `1.4.0`에 대한 감사 판정으로 남는다. 로컬 파일 보완을 감사 DB가 인식하지 않으므로 보안 감사 통과로 표시하거나 제외 규칙·가짜 버전으로 숨기지 않았다. 회귀 증거는 알려진 비정상 DigestInfo 수용 차단이며 개인키 없는 위조나 모든 암호 취약점 해소를 입증하지 않는다.
- 현재 지원하는 설치 경계는 이 lockfile의 `npm ci` 트리다. 실제 두 소비자의 해석 경로가 잠금 대상에 속하는지도 검사한다. 공식 수정 릴리스가 나오면 API·보안 회귀와 감사 결과를 확인하며 해당 버전을 lockfile에 반영하고 임시 postinstall·패치 설치기를 제거한다. 알 수 없는 버전/소스에서 설치를 우회하지 않는다.
- 원본 실패·개수만 보완한 비교 실패·최종 성공·설치/감사 로그는 로컬 임시 `scrum165-security-forge-68kfxcim`에 보존한다. 기존 작업 공간의 사용자 변경을 보존했고 push·PR·병합·Jira 변경은 하지 않았다.

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

## SCRUM-179: Dependabot Jira 검사 회귀 — 2026-10-26

- `jira-issue-key`는 실행자 대신 PR 작성자 `dependabot[bot]`, 현재 저장소와 동일한 head 저장소, `dependabot/` 브랜치를 함께 확인한다. 사람이 PR을 갱신해도 기존 Dependabot 예외가 유지된다.
- `.github/scripts/test_jira_key.py`는 실제 `jira-key.yml`의 env 매핑과 검사 스크립트를 실행한다. 사람/봇 이벤트, 위장 브랜치·다른 저장소·누락 메타데이터, 일반 Jira 키·파트 표기, main 승격 및 기존 `bot/` 정책을 검증한다.
- 로컬 재현: `python3 -B -m unittest discover -s .github/scripts -p 'test_*.py' -v`. 기존 JS CI에서 같은 명령을 실행하며 실패는 `frontend-quality` 실패로 연결된다. 필수 검사 이름·읽기 권한·이벤트 종류는 유지한다.
- 수정 PR을 development에 반영한 뒤 PR #28·#32를 최신화해 새 `synchronize` 실행의 필수 검사를 확인한다. 과거 실패 run 재실행이나 로컬 통과를 새 원격 CI 통과로 간주하지 않는다.

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

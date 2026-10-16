# DodamDodam Frontend

DodamDodam 캡스톤 프로젝트의 프론트엔드 애플리케이션 저장소입니다.

Expo SDK 57·React Native·TypeScript로 만든 Android/iOS **가로 고정 태블릿 앱**입니다.
네이티브 프로젝트는 Expo 설정에서 생성하며 `android/`·`ios/`를 Git에 넣지 않습니다.
앱 식별자·방향 등 현재 설정은 [`app.json`](app.json)에 있습니다. 환경별 API 주소와
OAuth 복귀 경로는 후속 SCRUM-160에서 정의합니다.

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

## 로컬 검사와 플랫폼별 빌드

앱 변경 후 다음 명령을 실행합니다. 테스트는 watch 모드 없이 실제 테스트를 발견해야 하며,
0개면 실패합니다. Debug 네이티브 빌드는 JS 번들을 포함하지 않으므로 Android·iOS
번들 검사도 각각 필요합니다.

```bash
npx --no-install expo install --check
npm run lint
npm run typecheck
CI=true npm run test
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
수정도 먼저 `development`에 반영합니다. 프론트엔드 담당자가 한 명이어도
저장소 Ruleset에 따라 다른 `Write` 권한자의 승인 리뷰 1건이 필요합니다.
`main` 반영이 완료되면 Bot PR이
integration의 `development`에서 프론트엔드 commit SHA를 자동으로 갱신합니다.

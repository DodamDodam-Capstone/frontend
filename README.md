# DodamDodam Frontend

DodamDodam 캡스톤 프로젝트의 프론트엔드 애플리케이션 저장소입니다.

React 애플리케이션을 추가할 수 있도록 초기 설정되어 있습니다. `package.json`,
지원하는 lockfile, `.nvmrc` 또는 `.node-version`이 추가되면 CI가 실제
애플리케이션 검사를 자동으로 실행합니다. Node.js 버전은 프로젝트가 직접
관리하며 CI에는 특정 버전을 미리 고정하지 않았습니다.

Organization 전체 협업 흐름은
[integration 저장소 문서](https://github.com/DodamDodam-Capstone/integration/blob/main/docs/GITHUB_WORKFLOW.md)에서
관리합니다.

애플리케이션 개발을 시작하기 전에 저장소 초기화, CI 준비 상태, 저장소 전용
Slack 알림 경로를 검증했습니다.

변경 사항은 보호된 `development` → `main` PR에서 사람의 승인을 받은 후
squash merge합니다. `main` 반영이 완료되면 Bot PR이 integration 저장소의
프론트엔드 commit SHA를 자동으로 갱신합니다.

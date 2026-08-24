# DodamDodam Frontend

DodamDodam 캡스톤 프로젝트의 프론트엔드 애플리케이션 저장소입니다.

React 애플리케이션을 추가할 수 있도록 초기 설정되어 있습니다. `package.json`,
지원하는 lockfile, `.nvmrc` 또는 `.node-version`이 추가되면 CI가 실제
애플리케이션 검사를 자동으로 실행합니다. Node.js 버전은 프로젝트가 직접
관리하며 CI에는 특정 버전을 미리 고정하지 않았습니다.

Organization 전체 협업 흐름은
[integration 저장소 문서](https://github.com/DodamDodam-Capstone/integration/blob/main/docs/GITHUB_WORKFLOW.md)에서
관리합니다.

Frontend의 Jira Epic·Task 명명과 GitHub Issue·브랜치·PR 연결 규칙은
[`docs/JIRA_WORKFLOW.md`](docs/JIRA_WORKFLOW.md)를 따릅니다.

처음 업무를 시작하는 팀원은 Jira-first와 GitHub-first 선택 기준, 실제 branch,
commit, PR 예시가 포함된
[`docs/TEAM_WORKFLOW_GUIDE.md`](docs/TEAM_WORKFLOW_GUIDE.md)를 먼저 확인합니다.

애플리케이션 개발을 시작하기 전에 저장소 초기화, CI 준비 상태, 저장소 전용
Slack 알림 경로를 검증했습니다.

기능 변경은 작업 브랜치에서 `development`로 squash merge합니다. 검증된
`development`는 보호된 PR과 사람의 승인을 거쳐 merge commit으로 `main`에
승격합니다. `main` 반영이 완료되면 Bot PR이 integration의 `development`에서
프론트엔드 commit SHA를 자동으로 갱신합니다.

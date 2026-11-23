# Frontend 팀 업무 실행 가이드

이 문서는 Frontend 팀원이 Jira 또는 GitHub에서 업무를 시작해
`development` PR을 병합하고 완료 상태를 확인할 때 그대로 따라 하는 가이드입니다.

## 1. 이 저장소를 사용하는 업무

- Jira/GitHub 접두어: `[FE]`
- GitHub 저장소: `DodamDodam-Capstone/frontend`
- 일반 PR 대상: `development`
- 필수 CI: `frontend-quality`, `gitmoji-conventional-title`, `jira-issue-key`
- 알림 채널: `#frontend-actions`

화면, 브라우저 상태, 클라이언트 API 호출, 접근성, Frontend 테스트와 관련된
업무를 이 저장소에서 처리합니다. Backend·AI·통합 변경이 함께 필요하면 같은
Epic 아래에 `[BE]`, `[AI]`, `[INT]` Task를 별도로 만듭니다.

## 2. 시작 경로를 먼저 선택합니다

| 상황 | 작업 방법 |
| --- | --- |
| Jira `[FE]` Task가 이미 있음 | Jira 키로 바로 branch와 PR을 만듭니다. GitHub Task Form은 열지 않습니다. |
| Jira Task가 없음 | GitHub의 `Frontend Task` 또는 `Frontend Bug` Form으로 Jira 업무를 자동 생성합니다. |

이미 있는 Jira Task와 GitHub Issue Form을 함께 사용하면 Jira Task가 중복 생성될
수 있습니다. 한 업무에는 한 가지 시작 경로만 사용합니다.

## 3. Jira-first: Jira Task가 이미 있는 경우

예시 계획:

```text
Epic: SCRUM-200 [EPIC] 회원 인증 흐름 제공
Task: SCRUM-201 [FE] 로그인 화면과 인증 상태 처리
```

### 3.1 작업 브랜치 생성

```bash
git switch development
git pull --ff-only
git switch -c feature/SCRUM-201-login-page
```

### 3.2 commit과 PR 작성

```text
commit: ✨ feat(auth): SCRUM-201 [FE] 로그인 화면 추가
PR:     ✨ feat(auth): SCRUM-201 [FE] 로그인 화면 추가
base:   development
```

PR 본문에는 Jira 링크를 적습니다. GitHub Issue를 만들지 않은 Jira-first 업무에는
`Resolves #번호`를 넣지 않습니다.

```text
Jira: https://dodamdodam.atlassian.net/browse/SCRUM-201
관련 GitHub Issue: 없음 (Jira-first 업무)
```

### 3.3 병합 후 결과

1. 필수 CI와 리뷰를 통과합니다.
2. PR을 `development`에 squash merge합니다.
3. Jira의 Development 영역에 branch, commit, PR, build가 표시됩니다.
4. Jira Automation이 `SCRUM-201`을 `완료`로 전환합니다.
5. `#frontend-actions`에서 source, target, PR, commit, actor, 결과를 확인합니다.

이 경로에는 GitHub Issue가 없으므로 Jira Task만 완료됩니다.

## 4. GitHub-first: GitHub Issue에서 Jira Task를 만드는 경우

### 4.1 Issue Form 작성

`New issue`에서 `Frontend Task`를 선택합니다.

```text
제목: [FE] 로그인 오류 메시지 개선
상위 Jira 키: SCRUM-200
완료 목표: 로그인 실패 원인을 사용자가 구분할 수 있다.
완료 조건:
- [ ] 오류 유형별 메시지 표시
- [ ] 컴포넌트 테스트 통과
- [ ] development 대상 PR 준비
```

Issue를 연 뒤 Jira 키가 바로 붙지 않으면 팀원이 유형과 내용을 검토하고
`jira-sync` 레이블을 추가합니다. 이 레이블만으로 자동화가 Jira Task를 만들고
제목을 다음과 같이 변경합니다.

```text
frontend#123 SCRUM-205 [FE] 로그인 오류 메시지 개선
```

자동 결과:

- Jira `SCRUM-205` Task 생성 및 `SCRUM-200` Epic의 child로 연결
- GitHub Issue에 Jira 링크 댓글 추가
- `jira-linked` 레이블 추가
- Slack 전송 성공 시 `jira-notified` 레이블 추가
- `#frontend-actions`에 GitHub Issue → Jira 연결 결과 전송

### 4.2 자동 생성된 키로 작업

```text
branch: fix/SCRUM-205-login-error-message
commit: 🐛 fix(auth): SCRUM-205 [FE] 로그인 오류 메시지 수정
PR:     🐛 fix(auth): SCRUM-205 [FE] 로그인 오류 메시지 수정
base:   development
```

PR 본문:

```text
Jira: https://dodamdodam.atlassian.net/browse/SCRUM-205
Resolves #123
```

`development` 병합 후 `close-linked-issues`가 `frontend#123`을 닫고, Jira Automation이
`SCRUM-205`를 `완료`로 전환합니다.

## 5. Bug 업무 예시

```text
GitHub Form: Frontend Bug
Issue: SCRUM-206 [FE] 세션 만료 후 로그인 화면으로 이동하지 않음
branch: fix/SCRUM-206-expired-session-redirect
commit: 🐛 fix(auth): SCRUM-206 [FE] 만료 세션 이동 처리
PR: 🐛 fix(auth): SCRUM-206 [FE] 만료 세션 이동 처리
```

재현 절차, 기대 결과, 실제 결과, 브라우저와 OS를 Issue에 작성하되 token,
cookie, 개인정보는 첨부하지 않습니다.

## 6. PR 검증과 병합 규칙

- 일반 작업 branch와 `development` 대상 PR 제목에는 같은 `SCRUM-번호`를 정확히 하나 넣습니다.
- `development` 대상 PR 제목에는 `[FE]`만 정확히 하나 넣습니다.
- Gitmoji는 의미에 맞게 자유롭게 선택하고 `feat`, `fix`, `docs`, `test` 등의
  Conventional Commit type을 사용합니다.
- GitHub Issue가 있을 때만 `development` 대상 작업 PR에 같은 저장소 Issue를
  `Resolves #번호`로 연결합니다.
- `frontend-quality`와 모든 필수 검사를 통과합니다.
- 프론트엔드 담당자가 한 명이어도 작성자와 다른 `Write` 권한자의 승인 리뷰
  1건을 받은 뒤 병합합니다.
- 모든 review conversation을 해결한 뒤 일반 작업 PR을 `development`에 squash merge합니다.
- `development`와 `main`에는 직접 push하지 않습니다.
- `main` 대상 PR은 `development`에서만 만들며 긴급 수정도 같은 승격 경로를
  사용합니다.
- `main` 승격 PR에는 `Resolves #번호`, `Closes #번호`, `Fixes #번호`를
  적지 않습니다. GitHub는 기본 브랜치 병합 시 이 키워드로 Issue를 닫습니다.

### FE 스프린트 릴리스

1. **버전 결정.** 출시 전 작업 PR에서 루트 `VERSION`, Expo의 `app.json`, npm의 `package.json`과 `package-lock.json` 버전을 맞춥니다. 첫 버전은 `0.1.0`입니다. CI는 기존 빌드에서 APK의 `versionName`과 iOS 앱의 `CFBundleShortVersionString`까지 확인합니다.
2. **출시 범위 확인.** 직전 태그부터 이번 `development`까지 실제 포함된 PR과 Jira 키를 대조합니다. 첫 출시라면 비교를 시작한 `main` SHA를 적습니다. Jira의 스프린트별로 작업명·링크·검증 결과를 기록하고 중복 키를 합칩니다. 이월·스프린트 미지정은 그대로 표시합니다. 의존성 전용 출시로 Jira 작업이 없으면 그 사유와 PR을 기록합니다.
3. **승격 전 계보 확인.** 최신 원격에서 `git merge-base --is-ancestor origin/main origin/development`와 Ruleset을 확인합니다. 첫 준비 당시 `main` 고유 커밋은 2개, `development`는 20개였고 `main`과 공통 조상의 파일 트리는 같았습니다. 최신 base 요구로 승격이 막히면 별도 동기화 PR에서 최신 개발 트리 보존을 검토합니다. 계보를 잇는 merge commit에 필요한 권한은 실제 규칙에 따라 담당자와 확인합니다.
4. **승격 PR.** 같은 FE 저장소의 `development → main` PR을 엽니다. 제목 예시는 `🚀 chore(release): [FE] v0.1.0 스프린트 릴리스`입니다. 본문에 `## 스프린트 작업`과 그 아래 `### 실제 스프린트명`, 실제 작업 목록을 적습니다. 세 필수 검사·리뷰·대화 해결을 확인한 뒤 merge commit으로 병합합니다.
5. **발행 확인.** `main` push의 `frontend-quality` 통과 후 CI가 `release/vX.Y.Z` 브랜치·`vX.Y.Z` 태그를 같은 SHA에 만들고, 승격 PR 본문과 자동 변경 내역으로 GitHub Release를 발행합니다. API 오류나 기존 버전 충돌은 Actions 로그에서 원인을 확인합니다. 부분 실패는 같은 SHA 실행을 재실행하고 브랜치·태그·Release ID·발행 시각을 대조합니다. 이미 발행한 설명을 보완할 때는 본문만 편집하고 기존 자동 변경 내역을 보존합니다.
6. **통합 확인.** 발행 성공 후 기존 GitHub App이 해당 SHA를 integration에 전달합니다. 갱신 PR이 동일한 FE SHA를 가리키는지, 재실행 시 기존 PR을 재사용하는지 확인합니다. integration의 별도 Reconcile 경로에서 릴리스 성공 여부를 확인하는 일은 통합 담당자와 맞춥니다.

**원격 설정.** 첫 발행 전에 `release/*` 브랜치와 `v*` 태그의 Ruleset으로 갱신·삭제·강제 변경을 제한하고, CI가 새 버전의 ref를 생성할 수 있게 합니다. 기존 `main`·`development` 보호를 유지합니다.

**Jira Releases.** Jira에서 `frontend-X.Y.Z` Fix Version을 만들고 실제 출시 대상 Task에 연결합니다. Epic은 여러 스프린트에 걸쳐 유지합니다. 해당 Jira 버전의 Released 처리는 실제 통합·배포를 확인한 뒤 진행합니다.

## 7. 완료 확인

- GitHub-first: GitHub Issue `Closed`와 Jira Task `완료`를 모두 확인합니다.
- Jira-first: Jira Task `완료`와 Jira Development의 `MERGED` PR을 확인합니다.
- Team Board Gantt에서 업무가 사라지면 `Show completed tickets`를 켭니다.
- Epic은 모든 `[FE]`, `[BE]`, `[AI]`, `[INT]` child Task와 통합 검증이 끝난 뒤
  sprint review에서 수동 완료합니다.

## 8. 문제 발생 시

- `jira-issue-key` 실패: branch와 PR의 Jira 키, `[FE]`, target branch를 확인합니다.
- Jira 자동 생성이 건너뛰어짐: `task` 또는 `bug`를 확인한 뒤 `jira-sync` 레이블을
  추가합니다.
- Jira 자동 생성 실패: `jira-sync`를 제거 후 다시 추가하거나 `GitHub Issue to
  Jira`를 `main`에서 Issue 번호로 재실행합니다.
- 중복 Jira Task가 의심됨: 새 Task를 만들지 말고 `jira-linked` 댓글과 Jira의
  `github-frontend-<issue-number>` 레이블을 확인합니다.
- Issue가 닫히지 않음: 작업 PR의 대상이 `development`인지, 본문의
  `Resolves #번호`가 같은 저장소 Issue인지, `Close Linked Issues` 실행 결과를
  확인합니다.
- Jira Task가 완료되지 않음: PR 대상이 `development`인지, PR 제목의 Jira 키가
  해당 Task 키와 일치하는지, Jira Automation 감사 로그를 확인합니다.

Organization 전체 흐름과 다른 저장소 예시는
[integration 팀 가이드](https://github.com/DodamDodam-Capstone/integration/blob/main/docs/TEAM_WORKFLOW_GUIDE.md)를
기준으로 합니다.

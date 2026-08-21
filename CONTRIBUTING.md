# 기여 가이드

## 브랜치

- `main`: 안정화된 운영 기준 브랜치
- `development`: 개발 변경 사항을 통합하는 브랜치
- `feature/<issue>-<description>`: 기능 개발
- `fix/<issue>-<description>`: 일반 버그 수정
- `hotfix/<issue>-<description>`: `main`에서 시작하는 긴급 수정

`main`과 `development`의 모든 변경은 반드시 PR을 사용해야 합니다.

## PR 제목

Gitmoji 뒤에 Conventional Commit type을 작성합니다.

```text
<gitmoji> <type>(optional-scope): <description>
```

예시:

```text
✨ feat: 로그인 화면 추가
🐛 fix(auth): 만료된 access token 갱신
📝 docs: 로컬 실행 방법 문서화
👷 ci: PR 검사 추가
```

Gitmoji와 type을 의미상 고정해 연결하지 않습니다. 변경 내용을 설명하는 데
도움이 되는 Emoji를 선택하면 됩니다. Unicode Emoji와 `:shortcode:` 형식을
모두 허용합니다.

허용하는 type:

| Type | 용도 |
| --- | --- |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 리팩터링 |
| `docs` | 문서 |
| `test` | 테스트 |
| `ci` | CI/CD |
| `chore` | 설정 및 유지보수 |
| `perf` | 성능 개선 |
| `security` | 보안 |
| `revert` | 변경 되돌리기 |
| `style` | 서식 및 스타일 |
| `build` | 빌드 시스템 |
| `deps` | 의존성 갱신 |

## 병합 정책

- PR은 작고 명확한 한 가지 목적에 집중합니다.
- 모든 review conversation을 해결합니다.
- 필수 검사를 모두 통과해야 합니다.
- squash merge만 사용합니다.
- 자동 브랜치 삭제는 사용하지 않으며, 작업 브랜치는 sprint 정리 시 수동으로 삭제합니다.

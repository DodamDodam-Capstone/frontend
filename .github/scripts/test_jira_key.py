"""실제 PR 이벤트와 head의 VERSION으로 Jira 워크플로 검사를 실행한다."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / "workflows" / "jira-key.yml"
REPOSITORY = "DodamDodam-Capstone/frontend"
DEPENDABOT_BRANCHES = (
    "dependabot/github_actions/development/actions/setup-node-7.1.0",
    "dependabot/github_actions/development/actions/create-github-app-token-3.3.0",
)


class JiraKeyWorkflowTests(unittest.TestCase):
    def test_workflow_checks_merge_result_with_both_parent_commits(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("ref: ${{ github.sha }}", workflow)
        self.assertIn("fetch-depth: 2", workflow)
        self.assertIn("contents: read", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("run: python3 .github/scripts/validate_pr_contract.py", workflow)

    def check(self, expected, *, author="dependabot[bot]", actor="youngjun1227",
              head=DEPENDABOT_BRANCHES[0], base="development", title="⬆️ deps: update action",
              head_repository=REPOSITORY, repository=REPOSITORY,
              body="## 스프린트 작업\n### 현재 스프린트\n- 회원가입 화면 · PR #1", version="0.1.0"):
        pr = {
            "title": title, "body": body, "user": {"login": author},
            "head": {"ref": head, "repo": {"full_name": head_repository}},
            "base": {"ref": base, "repo": {"full_name": repository}},
        }
        with tempfile.TemporaryDirectory() as checkout:
            if base == "main":
                def git(*args):
                    return subprocess.check_output(["git", *args], cwd=checkout, text=True).strip()

                git("init", "--quiet")
                version_file = Path(checkout) / "VERSION"
                if version is not None:
                    version_file.write_text(version + "\n", encoding="utf-8")
                    git("add", "--", "VERSION")
                git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                    "-c", "commit.gpgsign=false", "commit", "--allow-empty", "--quiet", "-m", "PR head")
                pr["head"]["sha"] = git("rev-parse", "HEAD")
                # checkout에 보이는 값이 아니라 이벤트 head의 VERSION을 읽어야 한다.
                version_file.write_text("9.9.9\n", encoding="utf-8")
            event_path = Path(checkout) / "event.json"
            event_path.write_text(json.dumps({"pull_request": pr}), encoding="utf-8")
            env = {**os.environ, "GITHUB_EVENT_PATH": str(event_path),
                   "GITHUB_REPOSITORY": repository, "GITHUB_ACTOR": actor}
            result = subprocess.run(
                [sys.executable, "-B", str(Path(__file__).with_name("validate_pr_contract.py").resolve())],
                cwd=checkout, env=env, capture_output=True, text=True, timeout=5, check=False,
            )
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)

    def test_dependabot_pr_survives_human_or_bot_events(self):
        for branch in DEPENDABOT_BRANCHES:
            for actor in ("youngjun1227", "dependabot[bot]"):
                with self.subTest(branch=branch, actor=actor):
                    self.check(0, head=branch, actor=actor)

    def test_actor_or_branch_name_does_not_grant_human_pr_an_exception(self):
        for actor in ("youngjun1227", "dependabot[bot]"):
            with self.subTest(actor=actor):
                self.check(1, author="youngjun1227", actor=actor)

    def test_dependabot_exception_requires_repository_author_and_branch(self):
        for changes in (
            {"head_repository": "someone/frontend"},
            {"head_repository": ""},
            {"head_repository": "", "repository": ""},
            {"author": ""},
            {"head": "feature/dependency-update"},
        ):
            with self.subTest(changes=changes):
                self.check(1, actor="dependabot[bot]", **changes)

    def test_dependabot_cannot_target_main_directly(self):
        self.check(1, base="main", actor="dependabot[bot]")

    def test_regular_pr_still_requires_matching_jira_key_and_fe_prefix(self):
        valid_head = "fix/SCRUM-179-dependabot-jira-author"
        valid_title = "🐛 fix(ci): SCRUM-179 [FE] Dependabot 판별 수정"
        cases = (
            (valid_head, valid_title, 0),
            ("fix/no-key", valid_title, 1),
            (valid_head, "🐛 fix(ci): [FE] 키 누락", 1),
            (valid_head, "🐛 fix(ci): SCRUM-178 [FE] 키 불일치", 1),
            ("fix/SCRUM-179-SCRUM-178", valid_title, 1),
            (valid_head, valid_title + " SCRUM-178", 1),
            (valid_head, "🐛 fix(ci): SCRUM-179 접두어 누락", 1),
            (valid_head, "🐛 fix(ci): SCRUM-179 [BE] 잘못된 파트", 1),
            (valid_head, valid_title + " [FE]", 1),
        )
        for head, title, expected in cases:
            with self.subTest(head=head, title=title):
                self.check(expected, author="youngjun1227", head=head, title=title)

    def test_main_promotion_accepts_fe_version_without_jira_key(self):
        self.check(0, author="youngjun1227", head="development", base="main",
                   title="🚀 chore(release): [FE] v0.1.0 스프린트 릴리스")
        self.check(1, author="youngjun1227", head="development", base="main",
                   title="🚀 chore(release): [FE] v9.9.9 승격 checkout 버전")

    def test_main_promotion_refuses_invalid_source_version_and_notes(self):
        promotion = {"head": "development", "base": "main",
                     "title": "🚀 chore(release): [FE] v0.1.0 스프린트 릴리스"}
        for invalid in (
            {"head": "hotfix/SCRUM-179-fix"}, {"head_repository": "fork/frontend"},
            {"head_repository": ""}, {"version": None}, {"version": "0.2.0"},
            {"version": "v0.1.0"}, {"version": "00.1.0"},
            {"title": "🚀 chore(release): [FE] 릴리스"},
            {"title": "🚀 chore(release): [FE] v00.1.0 릴리스"},
            {"title": "🚀 chore(release): [BE] v0.1.0 릴리스"},
            {"title": "🚀 chore(release): [FE] v0.1.0 [FE] 릴리스"},
            {"title": "🚀 chore(release): [FE] v0.1.0 릴리스 v0.2.0"},
            {"title": "🚀 chore(release): [FE] v0.1.0  "},
            {"title": "chore(release): [FE] v0.1.0 설명"},
            {"body": None}, {"body": "## 요약\n변경 내용"},
            {"body": "## 스프린트 작업\n   \r\n## 검증\n확인"},
        ):
            with self.subTest(invalid=invalid):
                self.check(1, **{**promotion, **invalid})

    def test_existing_bot_branch_policy_is_preserved(self):
        self.check(0, author="integration[bot]", head="bot/component-update")
        self.check(1, author="integration[bot]", head="bot/component-update", base="main")


if __name__ == "__main__":
    unittest.main()

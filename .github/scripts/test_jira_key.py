"""실제 Jira Key 워크플로의 env 매핑과 검사 스크립트를 실행한다."""

import os
from pathlib import Path
import re
import subprocess
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / "workflows" / "jira-key.yml"
REPOSITORY = "DodamDodam-Capstone/frontend"
DEPENDABOT_BRANCHES = (
    "dependabot/github_actions/development/actions/setup-node-7.1.0",
    "dependabot/github_actions/development/actions/create-github-app-token-3.3.0",
)


class JiraKeyWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        # 이 워크플로의 단일 env/run 블록만 지원한다. 추출 실패를 성공으로 숨기지 않는다.
        env_blocks = re.findall(r"(?m)^    env:\n((?:      .+\n)+)", workflow)
        scripts = re.findall(
            r"(?m)^        run: \|\n((?:          .*\n|\n)+)", workflow
        )
        if len(env_blocks) != 1 or len(scripts) != 1:
            raise AssertionError("Jira 검사 env/run 블록을 하나씩 읽어야 합니다.")
        bindings = re.findall(
            r"(?m)^      ([A-Z_]+): \$\{\{ ([a-zA-Z_.]+) \}\}$", env_blocks[0]
        )
        if len(bindings) != len(env_blocks[0].splitlines()):
            raise AssertionError("지원하지 않는 env 매핑입니다.")
        if len(dict(bindings)) != len(bindings):
            raise AssertionError("중복 env 이름입니다.")
        cls.bindings = dict(bindings)
        cls.script = textwrap.dedent(scripts[0])

    def check(self, expected, *, author="dependabot[bot]", actor="youngjun1227",
              head=DEPENDABOT_BRANCHES[0], base="development", title="⬆️ deps: update action",
              head_repository=REPOSITORY, repository=REPOSITORY):
        context = {
            "github.event.pull_request.user.login": author,
            "github.actor": actor,
            "github.head_ref": head,
            "github.base_ref": base,
            "github.event.pull_request.title": title,
            "github.event.pull_request.head.repo.full_name": head_repository,
            "github.repository": repository,
        }
        env = {"PATH": os.environ.get("PATH", os.defpath)}
        env.update({key: context[value] for key, value in self.bindings.items()})
        result = subprocess.run(
            ["bash", "--noprofile", "--norc", "-e", "-c", self.script],
            env=env, capture_output=True, text=True, timeout=5, check=False,
        )
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
        )
        for head, title, expected in cases:
            with self.subTest(head=head, title=title):
                self.check(expected, author="youngjun1227", head=head, title=title)

    def test_main_promotion_still_requires_exactly_one_jira_key(self):
        for title, expected in (
            ("🚀 chore: SCRUM-33 [FE] 승격", 0),
            ("🚀 chore: [FE] 승격", 1),
            ("🚀 chore: SCRUM-33 SCRUM-123 [FE] 승격", 1),
        ):
            with self.subTest(title=title):
                self.check(expected, author="youngjun1227", head="development",
                           base="main", title=title)

    def test_existing_bot_branch_policy_is_preserved(self):
        self.check(0, author="integration[bot]", head="bot/component-update")
        self.check(1, author="integration[bot]", head="bot/component-update", base="main")


if __name__ == "__main__":
    unittest.main()

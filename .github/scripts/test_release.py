"""버전·PR 계약과 외부 쓰기 없는 릴리스 회귀 검사."""

import release
from copy import deepcopy
import os
import subprocess
import unittest
from unittest.mock import patch


SHA = "a" * 40
OTHER_SHA = "b" * 40
REPO = "DodamDodam-Capstone/frontend"
NOTES = "## 스프린트 작업\n\n### 테스트 스프린트\n- [SCRUM-187](https://dodamdodam.atlassian.net/browse/SCRUM-187) 릴리스 자동화\n"


class FakeGitHub:
    """GitHub ref의 생성 전용 의미를 보존하는 메모리 경계. 실제 네트워크는 쓰지 않는다."""

    def __init__(self):
        self.refs = {}
        self.releases = []
        self.tags = {}
        self.writes = []
        self.fail_release_once = False
        self.pulls = [{"number": 58, "merge_commit_sha": SHA, "merged_at": "2026-11-17T12:31:00Z",
                       "base": {"ref": "main", "repo": {"full_name": REPO}}, "head": {"ref": "development", "repo": {"full_name": REPO}},
                       "body": NOTES}]

    def __call__(self, endpoint, payload=None, *, paginate=False):
        path = endpoint.removeprefix(f"repos/{REPO}/")
        if payload is None:
            if path.startswith("git/matching-refs/"):
                prefix = "refs/" + path.removeprefix("git/matching-refs/")
                return [{"ref": ref, "object": obj} for ref, obj in self.refs.items() if ref.startswith(prefix)]
            if path.startswith("git/tags/"):
                return {"object": self.tags[path.removeprefix("git/tags/")]}
            if path == "releases?per_page=100":
                return list(self.releases)
            if path == f"commits/{SHA}/pulls?per_page=100":
                return self.pulls
        elif path == "git/refs":
            if payload["ref"] in self.refs:
                raise RuntimeError("Reference already exists")
            self.refs[payload["ref"]] = {"type": "commit", "sha": payload["sha"]}
            self.writes.append((path, payload))
            return {"ref": payload["ref"]}
        elif path == "releases":
            if self.fail_release_once:
                self.fail_release_once = False
                raise RuntimeError("GitHub unavailable")
            result = {**payload, "id": 42, "published_at": "2026-11-23T01:00:00Z",
                      "html_url": f"https://github.com/{REPO}/releases/tag/{payload['tag_name']}"}
            self.releases.append(result)
            self.writes.append((path, payload))
            return result
        raise AssertionError(f"Unexpected API: {endpoint}")


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        # 실제 구현을 호출하되 인증이 필요한 API 경계만 교체한다.
        self.github = FakeGitHub()
        self.api = patch.object(release, "api", self.github)
        self.api.start()
        self.addCleanup(self.api.stop)

    def test_create_then_rerun_preserves_refs_and_release(self):
        url = release.publish(REPO, SHA, "0.1.0")
        self.assertTrue(url.endswith("/releases/tag/v0.1.0"))
        self.assertEqual(set(self.github.refs), {"refs/heads/release/v0.1.0", "refs/tags/v0.1.0"})
        self.assertTrue(all(obj["sha"] == SHA for obj in self.github.refs.values()))
        self.assertEqual(self.github.releases[0]["target_commitish"], SHA)
        self.assertTrue(self.github.releases[0]["generate_release_notes"])
        recorded = deepcopy(self.github.releases)
        self.assertEqual(release.publish(REPO, SHA, "0.1.0"), url)
        self.assertEqual(self.github.releases, recorded)
        self.assertEqual(len(self.github.writes), 3)

    def test_release_contains_notes_from_its_promotion_pr(self):
        release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.releases[0].get("body"), NOTES)
        self.github.pulls[0]["body"] = NOTES + "PR 편집 내용"
        release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.releases[0]["body"], NOTES)
        self.assertEqual(len(self.github.writes), 3)

    def test_completed_release_still_requires_its_promotion_before_notification(self):
        release.publish(REPO, SHA, "0.1.0")
        self.github.pulls.clear()
        with self.assertRaisesRegex(ValueError, "승격 PR"):
            release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(len(self.github.writes), 3)

    def test_missing_or_wrong_promotion_pr_fails_before_ref_creation(self):
        original = deepcopy(self.github.pulls[0])
        variants = [[], [original, original]]
        for field, value in (("merge_commit_sha", OTHER_SHA), ("merged_at", None), ("body", ""),
                             ("body", "## 스프린트 작업\n\n## 검증\n통과"),
                             ("base", {"ref": "development", "repo": {"full_name": REPO}}),
                             ("base", {"ref": "main", "repo": {"full_name": "someone/frontend"}}),
                             ("head", {"ref": "hotfix/SCRUM-187-release", "repo": {"full_name": REPO}}),
                             ("head", {"ref": "development", "repo": {"full_name": "someone/frontend"}})):
            variants.append([{**original, field: value}])
        for pulls in variants:
            with self.subTest(pulls=pulls):
                self.github.pulls = pulls
                with self.assertRaises(ValueError):
                    release.publish(REPO, SHA, "0.1.0")
                self.assertEqual(self.github.writes, [])

    def test_conflicting_branch_or_tag_fails_before_any_write(self):
        for ref in ("refs/heads/release/v0.1.0", "refs/tags/v0.1.0"):
            with self.subTest(ref=ref):
                self.github.refs = {ref: {"type": "commit", "sha": OTHER_SHA}}
                with self.assertRaisesRegex(ValueError, "another commit"):
                    release.publish(REPO, SHA, "0.1.0")
                self.assertEqual(self.github.writes, [])

    def test_partial_failure_can_be_resumed_without_moving_refs(self):
        self.github.fail_release_once = True
        with self.assertRaisesRegex(RuntimeError, "unavailable"):
            release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(len(self.github.refs), 2)
        release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(len(self.github.writes), 3)

    def test_exact_ref_match_does_not_confuse_version_prefix(self):
        self.github.refs["refs/tags/v0.1.01"] = {"type": "commit", "sha": OTHER_SHA}
        release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.refs["refs/tags/v0.1.0"]["sha"], SHA)

    def test_annotated_tag_is_compared_by_commit(self):
        self.github.refs["refs/tags/v0.1.0"] = {"type": "tag", "sha": "c" * 40}
        self.github.tags["c" * 40] = {"type": "commit", "sha": SHA}
        release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.refs["refs/tags/v0.1.0"]["type"], "tag")

    def test_api_failure_is_not_treated_as_missing_ref(self):
        for failed_path in ("git/matching-refs/", "releases?", "/pulls?"):
            def deny_read(endpoint, payload=None, *, paginate=False):
                if payload is None and failed_path in endpoint:
                    raise RuntimeError("403 Forbidden")
                return self.github(endpoint, payload, paginate=paginate)

            with self.subTest(failed_path=failed_path), patch.object(release, "api", side_effect=deny_read):
                with self.assertRaisesRegex(RuntimeError, "403"):
                    release.publish(REPO, SHA, "0.1.0")
                self.assertEqual(self.github.writes, [])

    def test_invalid_inputs_and_draft_release_are_rejected(self):
        for version in ("01.1.0", "0.1", "0.1.0-rc.1", "0.1.0\nx", "../../x"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                release.publish(REPO, SHA, version)
        with self.assertRaises(ValueError):
            release.publish(REPO, "main", "0.1.0")
        self.github.releases = [{"tag_name": "v0.1.0", "draft": True, "prerelease": False}]
        with self.assertRaisesRegex(ValueError, "draft|prerelease"):
            release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.writes, [])

    def test_existing_release_with_unverifiable_tag_or_different_target_is_not_repaired(self):
        self.github.releases = [{"tag_name": "v0.1.0", "draft": False, "prerelease": False,
                                 "published_at": "2026-11-23T01:00:00Z", "target_commitish": SHA}]
        with self.assertRaisesRegex(ValueError, "no verifiable tag"):
            release.publish(REPO, SHA, "0.1.0")
        self.github.refs["refs/tags/v0.1.0"] = {"type": "commit", "sha": SHA}
        self.github.releases[0]["target_commitish"] = OTHER_SHA
        with self.assertRaisesRegex(ValueError, "another commit"):
            release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(self.github.writes, [])

    def test_missing_release_branch_requires_valid_notes_before_ref_repair(self):
        release.publish(REPO, SHA, "0.1.0")
        del self.github.refs["refs/heads/release/v0.1.0"]
        self.github.pulls.clear()
        with self.assertRaises(ValueError):
            release.publish(REPO, SHA, "0.1.0")
        self.assertEqual(len(self.github.writes), 3)

    def test_empty_sprint_section_and_fenced_or_commented_examples_are_rejected(self):
        for body in (
            "## 스프린트 작업\n<!-- 실제 작업을 작성하세요 -->",
            "## 스프린트 작업\n\n### 스프린트 이름\n\n## 검증\n성공",
            "```md\n## 스프린트 작업\n- 작업 내용\n```",
            "<!--\n## 스프린트 작업\n작업 내용\n-->",
            "## 스프린트 작업\n\n# 검증\n성공",
            "## 스프린트 작업\n\n   ## 검증\n성공",
        ):
            with self.subTest(body=body), self.assertRaises(ValueError):
                release.validate_notes(body)
        body = "## 요약\r\n의존성 갱신\r\n## 스프린트 작업\r\n\r\nJira 작업 없는 의존성 PR #1\r\n"
        self.assertEqual(release.validate_notes(body), body)
        fenced_tasks = "## 스프린트 작업\n```\n의존성 변경 PR #1\n```"
        self.assertEqual(release.validate_notes(fenced_tasks), fenced_tasks)

    def test_cli_rejects_checkout_mismatch(self):
        with patch.dict(os.environ, {
            "GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/main",
            "GITHUB_REPOSITORY": REPO, "GITHUB_SHA": SHA,
        }), patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, OTHER_SHA)):
            self.assertEqual(release.main(), 1)
        self.assertEqual(self.github.writes, [])

    def test_cli_rejects_pull_request_and_manual_events_before_api_calls(self):
        for event, ref in (("pull_request", "refs/pull/1/merge"), ("workflow_dispatch", "refs/heads/main"),
                           ("push", "refs/heads/development")):
            with self.subTest(event=event, ref=ref), patch.dict(os.environ, {
                "GITHUB_EVENT_NAME": event, "GITHUB_REF": ref,
                "GITHUB_REPOSITORY": REPO, "GITHUB_SHA": SHA,
            }):
                self.assertEqual(release.main(), 1)
        self.assertEqual(self.github.writes, [])


if __name__ == "__main__":
    unittest.main()

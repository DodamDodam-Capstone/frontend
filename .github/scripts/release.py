"""품질 검사를 통과한 main 커밋에 출시 브랜치, 태그와 GitHub Release를 생성한다."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys


VERSION_PATTERN = r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"


def validate_version(version):
    """정식 숫자 버전만 허용하여 ref·API 경로에 그대로 사용한다."""
    if not re.fullmatch(VERSION_PATTERN, version):
        raise ValueError("VERSION must contain a stable X.Y.Z version without leading zeros.")
    return version


def read_version(path=Path("VERSION")):
    """파일 누락과 잘못된 버전은 PR 또는 릴리스를 실패시킨다."""
    return validate_version(Path(path).read_text(encoding="utf-8").strip())


def validate_notes(body):
    """승격 PR의 표시되는 스프린트 작업을 검사하고 원래 본문을 보존한다."""
    visible = re.sub(r"<!--.*?(?:-->|\Z)", "", body or "", flags=re.S)
    in_section = False
    fence = ""
    for line in visible.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            if marker and marker[1].startswith(fence) and not marker[2].strip():
                fence = ""
            elif in_section and line.strip():
                return body
            continue
        if marker:
            fence = marker[1]
            continue
        heading = re.match(r"^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$", line)
        if heading:
            if len(heading[1]) <= 2:
                in_section = heading[1] == "##" and heading[2].strip() == "스프린트 작업"
        elif in_section and re.search(r"\w", line):
            return body
    raise ValueError("승격 PR 본문에 비어 있지 않은 '## 스프린트 작업' 섹션이 필요합니다.")


def api(endpoint, payload=None, *, paginate=False):
    """인증은 기존 GH_TOKEN에 맡기고 API 실패를 '없음'으로 바꾸지 않는다."""
    command = ["gh", "api", endpoint]
    if payload is not None:
        command += ["--method", "POST", "--input", "-"]
    if paginate:
        command += ["--paginate", "--slurp"]
    result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"GitHub API failed: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    return [item for page in data for item in page] if paginate else data


def ref_commit(repo, short_ref):
    """접두어 일치 ref를 걸러내고 annotated tag도 실제 커밋으로 비교한다."""
    refs = api(f"repos/{repo}/git/matching-refs/{short_ref}")
    obj = next((ref["object"] for ref in refs if ref["ref"] == f"refs/{short_ref}"), None)
    if obj is None:
        return None
    seen = set()
    while obj["type"] == "tag":
        if obj["sha"] in seen:
            raise ValueError("Cyclic annotated tag")
        seen.add(obj["sha"])
        obj = api(f"repos/{repo}/git/tags/{obj['sha']}")["object"]
    if obj["type"] != "commit":
        raise ValueError(f"{short_ref} must point to a commit.")
    return obj["sha"]


def find_promotion_pr(repo, sha):
    """현재 main merge commit을 만든 승격 PR 하나를 찾는다."""
    pulls = api(f"repos/{repo}/commits/{sha}/pulls?per_page=100", paginate=True)
    matches = [pr for pr in pulls if pr.get("merged_at") and pr.get("merge_commit_sha") == sha
               and pr["base"]["ref"] == "main" and pr["head"]["ref"] == "development"
               and (pr["base"].get("repo") or {}).get("full_name") == repo
               and (pr["head"].get("repo") or {}).get("full_name") == repo]
    if len(matches) != 1:
        raise ValueError("정확한 main 커밋에 연결된 승격 PR을 하나 찾을 수 있어야 합니다.")
    return matches[0]


def publish(repo, sha, version):
    """충돌을 먼저 검사한 뒤 누락된 ref와 Release만 순서대로 생성한다."""
    validate_version(version)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Release must use a full commit SHA.")
    tag = f"v{version}"
    refs = {ref: ref_commit(repo, ref) for ref in (f"heads/release/{tag}", f"tags/{tag}")}
    for ref, existing in refs.items():
        if existing is not None and existing != sha:
            raise ValueError(f"{ref} already refers to another commit; choose a new version.")
    releases = api(f"repos/{repo}/releases?per_page=100", paginate=True)
    existing_release = next((release for release in releases if release["tag_name"] == tag), None)
    if existing_release:
        if existing_release["draft"] or existing_release["prerelease"] or not existing_release["published_at"]:
            raise ValueError("Existing release must be published and must not be a draft or prerelease.")
        target = existing_release["target_commitish"]
        if re.fullmatch(r"[0-9a-f]{40}", target) and target != sha:
            raise ValueError("Existing release targets another commit; choose a new version.")
        if refs[f"tags/{tag}"] is None:
            raise ValueError("Existing release has no verifiable tag; inspect it before publishing.")

    # Jira 조회·목록 검토는 PR 준비 때 수행한다. 재실행은 이미 발행한 본문을 덮어쓰지 않는다.
    promotion = find_promotion_pr(repo, sha)
    notes = validate_notes(promotion.get("body")) if existing_release is None or None in refs.values() else None

    # 생성 API만 사용한다. 경합·부분 실패는 중단하고 같은 SHA로 재실행한다.
    for ref, existing in refs.items():
        if existing is None:
            api(f"repos/{repo}/git/refs", {"ref": f"refs/{ref}", "sha": sha})
    if existing_release is None:
        existing_release = api(f"repos/{repo}/releases", {
            "tag_name": tag, "target_commitish": sha, "name": tag,
            "draft": False, "prerelease": False, "generate_release_notes": True, "body": notes,
        })
    print(f"Released {tag} at {sha}: {existing_release['html_url']}")
    return existing_release["html_url"]


def main():
    """workflow 조건에 더해 로컬·PR·수동 실행의 원격 생성을 차단한다."""
    try:
        if os.environ.get("GITHUB_EVENT_NAME") != "push" or os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ValueError("Release publishing is allowed only for a main push after quality succeeds.")
        sha = os.environ["GITHUB_SHA"]
        checked_out = subprocess.run(["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
        if checked_out.stdout.strip() != sha:
            raise ValueError("Checkout must match the main push SHA.")
        publish(os.environ["GITHUB_REPOSITORY"], sha, read_version())
    except (ValueError, OSError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""작업 PR의 Jira 키와 main 승격 PR의 버전·스프린트 본문을 검사한다."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys

from release import VERSION_PATTERN, validate_notes, validate_version
from validate_pr_title import is_gitmoji


def head_version(sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("승격할 커밋의 전체 SHA가 필요합니다.")
    result = subprocess.run(["git", "show", f"{sha}:VERSION"], capture_output=True, text=True)
    if result.returncode:
        raise ValueError("승격할 커밋의 VERSION 파일을 읽을 수 없습니다.")
    return validate_version(result.stdout.strip())


def validate(pr, repository):
    head, base = pr["head"]["ref"], pr["base"]["ref"]
    head_repo = (pr["head"].get("repo") or {}).get("full_name")
    title = pr["title"]
    parts = re.findall(r"\[(?:FE|BE|AI|INT)\]", title)

    if base == "main":
        if head != "development" or not repository or head_repo != repository:
            raise ValueError("main은 같은 저장소의 development에서만 승격합니다.")
        match = re.fullmatch(
            rf"(\S+) chore\(release\): \[FE\] v(?P<version>{VERSION_PATTERN}) \S.*", title
        )
        if (not match or not is_gitmoji(match[1]) or parts != ["[FE]"]
                or len(re.findall(r"\bv[0-9]+\.[0-9]+\.[0-9]+\b", title)) != 1):
            raise ValueError("승격 제목은 <gitmoji> chore(release): [FE] vX.Y.Z <설명> 형식입니다.")
        if match["version"] != head_version(pr["head"]["sha"]):
            raise ValueError("승격 PR 제목의 버전과 VERSION 파일이 일치해야 합니다.")
        validate_notes(pr.get("body"))
        return f"Release version verified: {match['version']}"

    if base != "development":
        raise ValueError("지원하지 않는 PR 대상 브랜치입니다.")
    # 이벤트를 발생시킨 사람 대신 PR 작성자와 출처로 Dependabot을 확인한다.
    dependabot = (pr["user"]["login"] == "dependabot[bot]" and repository
                  and head_repo == repository and head.startswith("dependabot/"))
    if dependabot or head.startswith("bot/"):
        return "자동화 작업 PR은 Jira 키 검사를 건너뜁니다."

    head_keys = re.findall(r"\bSCRUM-\d+\b", head)
    title_keys = re.findall(r"\bSCRUM-\d+\b", title)
    if len(head_keys) != 1 or head_keys != title_keys:
        raise ValueError("브랜치와 제목에는 같은 SCRUM Jira 키가 정확히 하나 필요합니다.")
    if parts != ["[FE]"]:
        raise ValueError("Frontend 작업 PR 제목에는 [FE]를 정확히 하나 표시해야 합니다.")
    return f"Jira key verified: {head_keys[0]}"


def main():
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        print(validate(event["pull_request"], os.environ["GITHUB_REPOSITORY"]))
    except (KeyError, OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Exercise the release version checks against a project manifest and its paired files."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest


VALIDATOR = Path(__file__).with_name("validate_frontend_project.mjs").resolve()


class FrontendReleaseVersionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node_version = subprocess.check_output(
            ["node", "-p", "process.versions.node"], text=True
        ).strip()

    def validate(self, *, version="0.1.0", package="0.1.0", lock="0.1.0",
                 root="0.1.0", expo="0.1.0", env_script="node check-env.mjs"):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            if version is not None:
                (project / "VERSION").write_text(version + "\n")
            (project / ".nvmrc").write_text(self.node_version + "\n")
            manifest = {
                "name": "test-app", "version": package,
                "packageManager": "npm@11.19.0",
                "engines": {"node": self.node_version, "npm": "11.19.0"},
                "scripts": {"lint": "eslint .", "typecheck": "tsc", "test": "jest",
                            "test:env": env_script},
            }
            lockfile = {"name": "test-app", "version": lock, "packages": {"": {"version": root}}}
            for filename, content in (
                ("package.json", manifest),
                ("package-lock.json", lockfile),
                ("app.json", {"expo": {"version": expo}}),
            ):
                (project / filename).write_text(json.dumps(content))
            return subprocess.run(["node", str(VALIDATOR)], cwd=project,
                                  capture_output=True, text=True, timeout=10)

    def test_matching_release_version(self):
        result = self.validate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_invalid_or_inconsistent_version_fails_quality(self):
        for options in (
            {"version": None}, {"version": "00.1.0"}, {"version": "0.1.0-beta.1"},
            {"version": "0.1.1"}, {"package": "0.1.1"}, {"lock": "0.1.1"},
            {"root": "0.1.1"}, {"expo": "0.1.1"}, {"env_script": " "},
        ):
            with self.subTest(options=options):
                self.assertNotEqual(self.validate(**options).returncode, 0)

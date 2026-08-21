# Contributing

## Branches

- `main`: stable branch
- `development`: integration branch for ongoing work
- `feature/<issue>-<description>`: feature work
- `fix/<issue>-<description>`: regular bug fixes
- `hotfix/<issue>-<description>`: urgent fixes based on `main`

All changes to `main` and `development` must use a pull request.

## Pull request title

Use a Gitmoji followed by a Conventional Commit type.

```text
<gitmoji> <type>(optional-scope): <description>
```

Examples:

```text
✨ feat: add login page
🐛 fix(auth): refresh expired access tokens
📝 docs: document local setup
👷 ci: add pull request checks
```

The Gitmoji is not tied to a specific type. Choose any Emoji that helps explain
the change. Unicode Emoji and `:shortcode:` forms are both accepted.

Supported types:

| Type | Purpose |
| --- | --- |
| `feat` | Feature |
| `fix` | Bug fix |
| `refactor` | Refactoring |
| `docs` | Documentation |
| `test` | Tests |
| `ci` | CI/CD |
| `chore` | Configuration/maintenance |
| `perf` | Performance |
| `security` | Security |
| `revert` | Revert |
| `style` | Formatting/style |
| `build` | Build system |
| `deps` | Dependency update |

## Merge policy

- Keep pull requests small and focused.
- Resolve every review conversation.
- Required checks must pass.
- Use squash merge.
- Delete the source branch after merge.

# Contributing

Thanks for your interest in contextwatch. This guide covers how to set up the project, how changes are made, and how they are reviewed and released.

## Ground rules

- Be respectful. Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).
- Open an issue before starting a large change, so the approach can be agreed first.
- Keep each pull request to one topic.
- Write all code, comments, docs, commit messages and issue text in English.

## Development setup

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) 2.1.308 or newer and Node.js 22 or newer.

```bash
git clone https://github.com/yusirdemir/contextwatch.git
```

```bash
claude --plugin-dir ./contextwatch
```

The engine loads the mod and writes the API type definitions to `.claude-plugin/types/` (ignored by Git). Saving a file reloads the mod at the end of the turn.

## Checks

Run all three before opening a pull request. CI runs the first two.

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

```bash
npx tsc -p .
```

`tsc` needs the types the engine writes on first load.

## Code style

- TypeScript, strict mode. No `any`.
- Pure logic goes in `src/core/` and takes no `$`. Everything that touches the engine lives in `src/sources/`, `src/ui/` or `src/commands.ts`.
- A helper that receives `$` or `on` must be a `function` declaration, not an arrow function. The validator follows `$` only into declarations.
- Declare each `$.state` atom in the file that reads or writes it, with the same `plugin` and `key`. Add any new value to `types/index.d.ts`.
- UI uses theme keys (`success`, `warning`, `inactive`) instead of raw colours, and stays dim except for state markers.
- Comments explain why, not what. Keep them short.

## Tests

- Every change to `src/core/` comes with a test in `tests/core.test.ts`.
- UI changes are tested on both `terminal` and `desktop` surfaces.
- In tests, read a `turn.step` stream to its end (see `drain` in `tests/plugin.test.tsx`); awaiting `.result` alone does not run the plugin's hook body.

## Commit messages

We follow [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/).

```text
<type>(<optional scope>): <summary in the imperative, lower case, no period>

<optional body: what changed and why, wrapped at 72 characters>

<optional footer: BREAKING CHANGE: ..., Fixes #123>
```

| Type | Use for |
| --- | --- |
| `feat` | A new user-facing feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `test` | Adding or correcting tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `chore` | Build, CI, tooling, dependencies |

Scopes, when useful: `core`, `ui`, `pane`, `band`, `status`, `commands`, `ci`, `docs`.

Examples:

```text
feat(pane): show the TTL source next to the countdown
fix(core): treat a zero-token response as a miss, not a hit
docs: explain how the TTL is inferred
```

## Branches

Branch from `main` and name the branch after the change: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.

## Pull requests

1. Fill in the pull request template.
2. Make sure the checks pass.
3. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for any user-facing change.
4. A maintainer reviews the pull request. Pull requests are squash-merged, so the title must itself be a valid Conventional Commit.

## Reporting bugs and requesting features

Use the issue templates. For a bug, include your Claude Code version (`claude --version`), the surface (terminal or desktop), and what you expected to see.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Releases

Maintainers release from `main`:

1. Choose the version by [Semantic Versioning](https://semver.org/): `fix` → patch, `feat` → minor, breaking change → major. While the version is `0.x`, breaking changes bump the minor version.
2. Set `version` in `.claude-plugin/plugin.json`.
3. Move the **Unreleased** entries in `CHANGELOG.md` under the new version with today's date.
4. Commit as `chore(release): v<version>`, tag `v<version>`, and push the tag.
5. Publish a GitHub release whose notes are the changelog section.

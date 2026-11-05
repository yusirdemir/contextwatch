# CLAUDE.md

Guidance for AI coding agents working in this repository. Human contributors: see [CONTRIBUTING.md](CONTRIBUTING.md); everything there applies here too.

## Project

contextwatch is a Claude Code mod (a plugin with a hooks module) that shows how long the prompt cache stays warm, the cache hit rate and the context size. It runs inside Claude Code's plugin engine: no DOM, no Node, everything outside the module goes through `$`.

## Rules

- **English only**: code, comments, docs, commit messages, issue and PR text.
- **Public repository**: never add employer names, internal hostnames, private repository names, work email addresses, tokens or personal paths. Before committing, check the diff for them.
- **Commits** follow Conventional Commits (`feat(pane): ...`, `fix(core): ...`). See [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages).
- **Changelog**: add a line under **Unreleased** in `CHANGELOG.md` for every user-facing change.
- **Privacy**: the mod reads token counts and model names only. Do not read message text, write files or make network requests without an issue that agrees to it first; update `SECURITY.md` if that changes.

## Layout

| Path | Role |
| --- | --- |
| `hooks/register.tsx` | Entry point. Wires features together and runs the one-second ticker |
| `src/core/` | Pure functions, no `$`. All the maths and formatting |
| `src/sources/live.ts` | Turns `turn.step` usage into a `Snapshot` and stores it |
| `src/ui/` | Status line, band above the prompt, detail pane, theme |
| `src/commands.ts` | `/contextwatch` and `/contextwatch why` |
| `types/index.d.ts` | `$.state` contract: `contextwatch.history`, `contextwatch.now` |
| `tests/` | `core.test.ts` (pure logic), `plugin.test.tsx` (engine and UI) |
| `docs/` | How it works, and every field the mod reads |

## Engine rules that are easy to miss

The validator enforces these; breaking one fails `claude plugin validate`.

- A helper that receives `$` or `on` must be a `function` declaration. An arrow function assigned to a `const` is rejected.
- Each `$.state` atom must be declared in the file that reads or writes it: `const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])`. Importing the atom from another file is rejected.
- `turn.step` is a streaming event: its hook is an `async function*` and forwards with `yield* next(e)`.
- `on('session.start')` may be registered only once without a matcher.
- In tests, read a `turn.step` stream to its end before asserting; the engine stand-ins must answer `ui.status` and `ui.toast` with `{ value: undefined }`.

## Verify every change

```bash
claude plugin validate . && claude plugin test .
```

```bash
npx tsc -p .
```

`tsc` needs `.claude-plugin/types/`, which the engine writes when it first loads the mod (`claude --plugin-dir .`). The API reference is `.claude-plugin/types/claude-code/index.d.ts`; search it for an event or noun name rather than guessing a signature.

## Design

The UI must stay calm: one dim line in the band, colour only for the state marker (theme keys `success`, `warning`, `inactive`), no animation, no extra toasts. Anything new goes in the pane, not the band.

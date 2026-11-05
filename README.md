# contextwatch

Live prompt-cache and context telemetry for Claude Code.

Claude Code caches your conversation's prompt for a limited time (usually one hour, sometimes five minutes). While the cache is warm, each message is cheap and fast. Once it lapses, the next message re-sends the whole context at full price. contextwatch shows you where you stand before you hit send.

> **Status:** early skeleton (v0.0.1). The mod loads and registers `/contextwatch`; the figures below are the plan for the next versions.

## Planned features

- **Cache countdown**: time left until the prompt cache lapses, coloured as it runs low.
- **Hit rate**: how much of the last request the cache served.
- **Drop detection**: tells you when the cache was re-written, and why (TTL lapsed, model or tool set changed, compaction).
- **Context size**: tokens the next request re-sends.
- **Detail pane**: response history and compactions for the session.
- **`/contextwatch`** and **`/contextwatch why`** commands.

## Install

At the prompt of a Claude Code session:

```text
/plugin install contextwatch --marketplace yusirdemir/contextwatch
```

Answer `y` to add the marketplace, then pick a scope.

## Develop

```bash
claude --plugin-dir .
```

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

The engine writes the API types to `.claude-plugin/types/` when it loads the mod; after that, `npx tsc -p .` type-checks it.

## Layout

| Path | What it holds |
| --- | --- |
| `hooks/register.tsx` | Entry point; wires the features together |
| `src/core/` | Pure logic: TTL, remaining time, hit rate |
| `src/sources/` | Live usage from `turn.step`, extra facts from the session transcript |
| `src/ui/` | Status line, band above the prompt, detail pane |
| `src/commands.ts` | `/contextwatch` |
| `types/index.d.ts` | The `$.state` contract |
| `docs/fields.md` | Every usage and transcript field the mod reads |

## License

MIT

# contextwatch

**See how long your Claude Code prompt cache stays warm, and what your next message will cost.**

[![CI](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Claude Code caches your conversation for a limited time, usually one hour. While the cache is warm, each message is cheap and fast. Once it lapses, the next message sends the whole context again at full cost. On a long session, that can cost twenty times more than a cached message.

contextwatch shows how much time is left and what the next message costs, so you know before you send.

Under the prompt, in the status line:

```text
cache 55 min · read $0.06 · cold $2.55
```

## Features

- **Countdown**: minutes left before the cache lapses, in the status line under the prompt. It updates every 30 seconds and never shows seconds, so it stays out of the way.
- **Alerts only when needed**: a line above the prompt appears only after a model switch or an MCP change that will rewrite a warm cache.
- **Cache cost**: what the context costs on the next message, as a cache read while warm and as a cache rewrite once cold.
- **Model switch preview**: the cache cost of the first message on each other model, and a warning as soon as you switch.
- **Switch confirmation**: asks before a model switch that would throw away a warm cache for more than $0.50 (configurable).
- **MCP change warning**: flags a connected or dropped MCP server while the cache is warm, since the tool list is part of the cached prompt.
- **Away reminder** (off by default): one notice a few minutes before the cache lapses.
- **Calm colour**: green while warm, amber in the last ten minutes of an hour, grey once cold.
- **Detail pane**: the countdown, the cost comparison as bars, a chart of context growth with misses marked, and the session total.
- **Miss alerts**: a short notice when a response had to write the cache again.
- **`/contextwatch why`**: explains the last miss — the TTL lapsed, the model changed, or the prompt prefix changed.
- **TTL detection**: learns whether your cache lives one hour or five minutes from your own responses.

## Requirements

- Claude Code 2.1.308 or newer (desktop app or terminal)

## Install

At the prompt of a Claude Code session:

```text
/plugin install contextwatch --marketplace yusirdemir/contextwatch
```

Answer `y` to add the marketplace, then choose a scope. The pane opens with your next session.

## Usage

| Where | What you see |
| --- | --- |
| Status line (always) | `cache 55 min · read $0.06 · cold $2.55` |
| Above the prompt, after a model switch | `● Switched to Sonnet 5.5 · cache rewrite 187k tokens ~$0.75` and a **Details** button |
| Above the prompt, after an MCP change | `● MCP servers changed (+github) · likely cache rewrite ~$1.50` |
| Pane (**Context**) | Countdown, cache cost, switch costs per model, context chart, session cost |

| Command | Does |
| --- | --- |
| `/contextwatch` | Opens the pane and prints the current figures |
| `/contextwatch why` | Explains why the last response missed the cache |

The countdown starts after the first response of a session.

## Settings

Change these in the config menu, or under `pluginConfigs.contextwatch` in `~/.claude/settings.json`.

| Setting | Default | Does |
| --- | --- | --- |
| `confirmSwitchUsd` | `0.5` | Ask before a model switch that would rewrite a warm cache for more than this many dollars. `0` turns it off. |
| `awayReminder` | `false` | Send one notice shortly before the cache lapses. |
| `awayReminderMinutes` | `5` | How many minutes before the cache lapses the notice is sent. |

In terminals that support it (iTerm2, kitty, Ghostty) the reminder is a system notification; elsewhere, including the desktop app, it is an in-app notice that stays for a minute.

## How it works

After every model response, Claude Code reports how many tokens were read from the cache and how many were written to it. contextwatch records these figures for the main conversation (subagents have caches of their own), starts the countdown from the time of the response, and redraws every second.

The cache lifetime (TTL) is not part of those figures, so contextwatch assumes one hour and corrects itself from what it sees: a cache hit after more than five minutes proves a one-hour TTL; a miss after five to sixty minutes, on the same model, means five minutes.

Details: [docs/how-it-works.md](docs/how-it-works.md). Every field it reads: [docs/fields.md](docs/fields.md).

## Limitations

- **The countdown is an estimate.** The server can evict a cache entry early. The next response's hit rate shows what actually happened.
- **Costs are estimates** from Anthropic's list prices. They cover the context only; your new message and the answer come on top. On a Pro or Max subscription they show the API equivalent, not what you are billed.
- **The MCP warning is a heuristic.** It compares MCP servers in the tool list, so a tool loaded on demand from a server that was not loaded before can raise it. The next response's hit rate confirms.
- **Unknown models** show no cost. Prices live in `src/core/pricing.ts`.
- **History is per session.** A new or cleared session starts empty.
- **The TTL starts as an assumption** (one hour) until a response confirms it.

## Privacy

contextwatch reads token counts, model names, tool names and the session cost total only. It does not read your messages, write files, or make network requests. See [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, commit conventions and the release process.

## License

[MIT](LICENSE) © Yusuf Demir

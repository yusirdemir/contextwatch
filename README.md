# contextwatch

**See how long your Claude Code prompt cache stays warm, how full your usage limits are, and what a cold cache would add.**

[![CI](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Claude Code caches your conversation for a limited time, usually one hour. While the cache is warm, each message is cheap and fast. Once it lapses, the next message sends the whole context again at full cost. On a long session, that can cost twenty times more than a cached message.

contextwatch shows how much time is left, and when the cache has gone cold it says what the next message will cost, so you know before you send.

```text
● Cache warm · 55 min   [Details]
```

## Features

- **Countdown**: minutes left before the cache lapses, above the prompt and in the status line. It updates every 30 seconds and never shows seconds, so it stays out of the way. Costs appear only when they apply: once the cache is cold, or a switch is about to rewrite it.
- **Cold-send question**: send a message into a large cold cache and contextwatch asks first: send anyway, compact then send, or start fresh then send.
- **Compact before you leave**: in the last ten minutes, a quiet grey tip compares compacting now with coming back to a cold cache, with a **Compact** button. A compaction reads the whole context, which is cheap only while it is still cached.
- **Alerts in place**: after a model switch or an MCP change that will rewrite a warm cache, the line above the prompt turns amber and says so.
- **Usage limits** (in the pane): the 5-hour and weekly windows of a Pro or Max subscription, with when each resets. When the cache is cold, the 5-hour bar shows what the next message adds as a faint segment. With an API key, dollars instead.
- **Model switch preview**: what the first message on each other model would add, and a warning as soon as you switch.
- **Switch confirmation**: asks before a model switch that would throw away a warm cache for more than $0.50 (configurable).
- **MCP change warning**: flags a connected or dropped MCP server while the cache is warm, since the tool list is part of the cached prompt.
- **Away reminder** (off by default): one notice a few minutes before the cache lapses.
- **Calm colour**: green while warm, amber in the last ten minutes of an hour, grey once cold.
- **Detail pane**: the minutes left as one large figure, the usage windows, at most one suggestion, the other models on request, and a one-line session summary.
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
| Above the prompt | `● Cache warm · 55 min` and a **Details** button that opens the pane |
| Above the prompt, cooling | `● Cache cooling · 8 min · Leaving? Compact first` and a **Compact** button |
| Above the prompt, cold | `○ Cache cold · next message rewrites 187k (+6%)` |
| Above the prompt, after a model switch | `● Switched to Sonnet 5.5 · cache rewrite +3%` |
| Above the prompt, after an MCP change | `● MCP changed (+github) · likely cache rewrite +6%` |
| Status line | `cache 55 min`, or `cache cold · next message +6%` |
| Pane (**Context**) | Minutes left, 5-hour and weekly usage with reset times, one suggestion, other models on request, session summary |

| Command | Does |
| --- | --- |
| `/contextwatch` | Opens the pane and prints the current figures |
| `/contextwatch why` | Explains why the last response missed the cache |

The countdown starts after the first response of a session.

## Settings

Change these in the config menu, or under `pluginConfigs.contextwatch` in `~/.claude/settings.json`.

| Setting | Default | Does |
| --- | --- | --- |
| `askWhenCold` | `true` | Before a message goes into a cold cache of 60k tokens or more, ask whether to send anyway, compact first, or start fresh. |
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
- **Usage impact is learned.** Claude Code reports how full each window is, not how much one message uses. contextwatch learns how many points a dollar of list price moves the 5-hour window from your own spend, so the `+%` figures appear after a few messages and get steadier over time. Other sessions on the same account at the same time push them up.
- **Figures cover the context only.** Your new message and the answer come on top.
- **The MCP warning is a heuristic.** It compares MCP servers in the tool list, so a tool loaded on demand from a server that was not loaded before can raise it. The next response's hit rate confirms.
- **Unknown models** show no cost. Prices live in `src/core/pricing.ts`.
- **History is per session.** A new or cleared session starts empty.
- **The TTL starts as an assumption** (one hour) until a response confirms it.

## Privacy

contextwatch reads token counts, model names, tool names, the session cost total and the usage windows. It stores one number, the learned usage ratio, in its own settings file. It does not read your messages, write files, or make network requests. See [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, commit conventions and the release process.

## License

[MIT](LICENSE) © Yusuf Demir

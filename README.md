# contextwatch

**See how long your Claude Code prompt cache stays warm.**

[![CI](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Claude Code caches your conversation for a limited time, usually one hour. While the cache is warm, each message is cheap and fast. Once it lapses, the next message sends the whole context again at full cost. On a long session, that can cost twenty times more than a cached message.

contextwatch shows a live countdown, so you know before you send.

```text
● Cache 47:12 left · 98% hit · 114k context   [Details]
```

## Features

- **Countdown**: time left before the cache lapses, in the status line and above the prompt.
- **Calm colour**: green while warm, amber in the last sixth of the TTL, grey once cold.
- **Detail pane**: hit rate, context size, model, and the last eight responses, beside the chat.
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
| Above the prompt | `● Cache 47:12 left · 98% hit · 114k context` and a **Details** button |
| Status line | `cache 47:12 · 98% hit · 114k` |
| Pane (**Context**) | Large countdown, TTL, hit rate, context size, recent responses |

| Command | Does |
| --- | --- |
| `/contextwatch` | Opens the pane and prints the current figures |
| `/contextwatch why` | Explains why the last response missed the cache |

The countdown starts after the first response of a session.

## How it works

After every model response, Claude Code reports how many tokens were read from the cache and how many were written to it. contextwatch records these figures for the main conversation (subagents have caches of their own), starts the countdown from the time of the response, and redraws every second.

The cache lifetime (TTL) is not part of those figures, so contextwatch assumes one hour and corrects itself from what it sees: a cache hit after more than five minutes proves a one-hour TTL; a miss after five to sixty minutes, on the same model, means five minutes.

Details: [docs/how-it-works.md](docs/how-it-works.md). Every field it reads: [docs/fields.md](docs/fields.md).

## Limitations

- **The countdown is an estimate.** The server can evict a cache entry early. The next response's hit rate shows what actually happened.
- **History is per session.** A new or cleared session starts empty.
- **The TTL starts as an assumption** (one hour) until a response confirms it.

## Privacy

contextwatch reads token counts and model names only. It does not read your messages, write files, or make network requests. See [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, commit conventions and the release process.

## License

[MIT](LICENSE) © Yusuf Demir

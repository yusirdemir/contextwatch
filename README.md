# contextwatch

**See how long your Claude Code prompt cache stays warm, and what your next message will cost.**

[![CI](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/yusirdemir/contextwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Claude Code caches your conversation for a limited time, usually one hour. While the cache is warm, each message is cheap and fast. Once it lapses, the next message sends the whole context again at full cost. On a long session, that can cost twenty times more than a cached message.

contextwatch shows how much time is left and what the next message costs, so you know before you send.

```text
● Cache 59 min left · next message ~$0.04 · 187k context   [Details]
```

## Features

- **Countdown**: minutes left before the cache lapses, in the status line and above the prompt. It updates every 30 seconds and never shows seconds, so it stays out of the way.
- **Next-message cost**: what the next message costs with a warm cache, and what it would cost cold.
- **Model switch preview**: what the first message would cost on each other model, and a warning as soon as you switch.
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
| Above the prompt | `● Cache 59 min left · next message ~$0.04 · 187k context` and a **Details** button |
| After a model switch | `● Switched to Sonnet 5.5 · first message writes 187k tokens ~$0.75` |
| Status line | `cache 59 min · next $0.04` |
| Pane (**Context**) | Countdown, next-message cost, switch costs per model, context chart, session cost |

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
- **Costs are estimates** from Anthropic's list prices. They cover the context only; your new message and the answer come on top. On a Pro or Max subscription they show the API equivalent, not what you are billed.
- **Unknown models** show no cost. Prices live in `src/core/pricing.ts`.
- **History is per session.** A new or cleared session starts empty.
- **The TTL starts as an assumption** (one hour) until a response confirms it.

## Privacy

contextwatch reads token counts, model names and the session cost total only. It does not read your messages, write files, or make network requests. See [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, commit conventions and the release process.

## License

[MIT](LICENSE) © Yusuf Demir

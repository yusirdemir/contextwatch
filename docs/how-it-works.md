# How it works

## Prompt caching in one minute

Each request to the model sends the whole conversation. To avoid processing the same prefix again, the API caches it. A later request that starts with the same prefix reads it from the cache.

| Operation | Relative input cost |
| --- | --- |
| Read from the cache | about 0.1× |
| Write to the cache, five-minute TTL | about 1.25× |
| Write to the cache, one-hour TTL | about 2× |

Every cache read refreshes the entry, so the TTL counts from the last request, not the first. When the TTL passes with no request, the entry is evicted and the next request writes the whole prefix again.

Besides the TTL lapsing, the cache is also missed when the prefix changes: a different model, a different tool set or system prompt, or a compaction of the conversation.

## What contextwatch records

On every `turn.step` event of the main conversation, contextwatch stores a snapshot:

| Field | From |
| --- | --- |
| `at` | The engine clock when the response arrived |
| `model` | `usage.model` |
| `inputTokens` | `usage.input_tokens` |
| `cacheReadTokens` | `usage.cache_read_input_tokens` |
| `cacheCreationTokens` | `usage.cache_creation_input_tokens` |
| `outputTokens` | `usage.output_tokens` |
| `ttl`, `ttlSource` | Inferred (below) |

The last fifty snapshots are kept in session state. Responses from subagents (events with an `agentId`) are skipped, because they keep caches of their own.

## Figures

```text
prompt      = input + cacheRead + cacheCreation
hit rate    = cacheRead / prompt
context     = prompt + output                  tokens the next request sends
missed      = cacheCreation ≥ 1024 and hit rate < 10%
remaining   = at + TTL − now                   floored at zero
cooling     = remaining ≤ TTL / 6              ten minutes of an hour
```

## TTL inference

The live usage figures do not say which TTL an entry was written with. contextwatch starts from one hour (`ttlSource: default`) and updates it from the gap between consecutive responses:

| Gap since previous response | Result | Conclusion |
| --- | --- | --- |
| More than 5 minutes | Hit (≥ 50%) | TTL is one hour (`observed`) |
| 5 to 60 minutes, same model | Miss | TTL is five minutes (`observed`) |
| Anything else | — | Keep the previous TTL |

A miss right after a model change says nothing about the TTL and is ignored.

## Explaining a miss

`/contextwatch why` checks, in order:

1. **No previous response**: the first response always writes the cache.
2. **Gap longer than the TTL**: the entry lapsed.
3. **Model changed**: each model has its own cache.
4. **Otherwise**: the prompt prefix changed (tools, system prompt or a compaction).

## Costs

Prices come from Anthropic's published list prices, kept in `src/core/pricing.ts` with the date they were checked. A model that is not in the table shows no cost.

| Token kind | Price |
| --- | --- |
| Uncached input | Input price |
| Cache read | The model's cache-read price (0.025× to 0.1× of input) |
| Cache write, five-minute TTL | 1.25× input price |
| Cache write, one-hour TTL | 2× input price |
| Output | Output price |

```text
next message, warm   = context × cacheRead
next message, cold   = context × input × write multiplier
switch to model M    = warmPrefix × cacheRead(M) + (context − warmPrefix) × input(M) × write multiplier
```

`warmPrefix` is the context size of the last response on model M, if M's cache is still warm; otherwise zero. Each model keeps its own cache, so a model used earlier in the session may still hold the start of the conversation.

These figures cover the context alone. The new message and the answer are added on top and are not known in advance.

The session total in the pane is Claude Code's own figure (`$.session.usage().cost.usd`, the same as `/cost`), not an estimate.

## Guards

### Model switch confirmation

Claude Code raises `PreModelSwitch` before a switch, with `prompt_cache_warm` and `estimated_cache_write_usd` (its own price for writing the context to the new model). When the cache is warm and that estimate is at least `confirmSwitchUsd`, contextwatch answers `ask`, so Claude Code asks before switching. Otherwise the switch goes ahead untouched.

### MCP changes

The tool list is part of the cached prompt prefix, so connecting or dropping an MCP server rewrites the cache on the next message. After every response contextwatch records the MCP servers behind the tool list (`mcp__<server>__<tool>`). Each tick compares the current list against it; a difference while the cache is warm shows a warning in the band and the pane and a one-time notice. The next response resets the baseline.

### Away reminder

When `awayReminder` is on, the tick sends one notice per response once the time left drops below `awayReminderMinutes`.

## Redrawing

A 30-second ticker writes the engine clock to `contextwatch.now` in session state, and refreshes the session total and the active model. The band and the pane read these values, so they redraw on each tick and after every turn. The UI shows whole minutes only, so a slower tick changes nothing you can see.

## Charts

The desktop app draws SVG, so the pane shows bars and a context chart as SVG in mid-tone colours that read on light and dark backgrounds. The terminal has no SVG; it gets the same bars and trend as block characters.

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

## Redrawing

A one-second ticker writes the engine clock to `contextwatch.now` in session state. The band and the pane read it, so they redraw on every tick; the status line is updated in the same tick.

# Fields contextwatch reads

## Live, from the mod API

| Source | Field | Use |
| --- | --- | --- |
| `turn.step` result `usage` | `input_tokens` | Uncached input |
| | `cache_read_input_tokens` | Served from cache; large means a hit |
| | `cache_creation_input_tokens` | Written to cache this request |
| | `output_tokens` | Output |
| `$.session.usage()` | `context.tokens`, `context.window`, `context.percent` | Window fullness |
| | `rateLimits` | Five-hour and seven-day windows |
| | `cost` | Session cost |

The live usage has no TTL breakdown, so the TTL comes from the transcript.

## Transcript: `~/.claude/projects/<project>/<sessionId>.jsonl`

One JSON object per line, appended as the session runs.

### `type: "assistant"`

| Field | Use |
| --- | --- |
| `timestamp` | Start of the countdown |
| `isSidechain` | `true` for subagents; skip for the main cache |
| `requestedModel`, `effort` | A change breaks the cache |
| `message.usage.cache_creation.ephemeral_1h_input_tokens` | Non-zero: TTL is 1 hour |
| `message.usage.cache_creation.ephemeral_5m_input_tokens` | Non-zero: TTL is 5 minutes |
| `message.usage.iterations[]` | Sub-requests within one response |
| `message.usage.service_tier`, `speed` | Standard or fast mode |

### `type: "api-request"`

| Field | Use |
| --- | --- |
| `shapeHash` | Hash of the request shape (model, tools, system prompt); a change usually breaks the cache |
| `params.model`, `params.betas` | What was sent |

### System rows (`subtype`)

| subtype | Use |
| --- | --- |
| `compact_boundary` with `compactMetadata` | `trigger`, `preTokens`, `postTokens`, `durationMs`; the cache is re-written after it |
| `turn_duration` | Turn length |
| `away_summary` | Written after a long absence; the cache has likely lapsed |

## Formulas

```text
ttl         = ephemeral_1h > 0 ? 60 min : ephemeral_5m > 0 ? 5 min : last known
remaining   = last main response timestamp + ttl - now
hit rate    = cache_read / (cache_read + cache_creation + input)
dropped     = cache_read near 0 and cache_creation large
context     = input + cache_read + cache_creation
```

The countdown is an estimate: the server may evict an entry early. The next response's `cache_read_input_tokens` says what actually happened.

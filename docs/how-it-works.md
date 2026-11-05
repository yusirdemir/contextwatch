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

## Cost per question

Every request of a turn is recorded with its `turnId`. A question's cost is the sum of its requests at list price; the band shows the average of the last three, as points of the 5-hour window (or dollars with an API key). Each request re-reads the whole context from the cache, so the figure grows as the conversation grows and drops after a compaction.

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

## Usage limits

On a Pro or Max subscription, `$.session.usage().rateLimits` reports the `five_hour` and `seven_day` windows: how full each is (0 to 100, one decimal) and when it resets. It does not say how much one message uses.

contextwatch learns that from the session itself. It keeps an anchor (session cost and 5-hour percentage); once the window has moved at least one point, it takes `points ÷ dollars` as a sample and folds it into a running estimate (30% weight for each new sample). A window reset, or a drop in either figure, starts a new anchor. The estimate is saved in the plugin's store, so a new session starts with it.

```text
impact of a cold cache = cold rewrite (list price) × points per dollar
```

When the cache is cold, the pane draws that impact as a faint segment past the 5-hour fill. While it is warm, no hypothetical figure is shown. Until the first sample, the `+%` figures are left out. Other sessions using the same account at the same time move the window too, which makes the estimate high rather than low.

With an API key there are no windows; contextwatch shows dollars instead.

## Compact before you leave

A compaction sends the whole conversation to the model and gets a summary back. While the cache is warm, that read is a cache read; once it is cold, it is a full rewrite. So the cheapest moment to compact is just before stepping away.

```text
compact now     = context × cacheRead + summary × output
come back cold  = after × input × write multiplier          after compacting
                = context × input × write multiplier        without it
```

`summary` and `after` start at 10k and 20k tokens, typical of Claude Code compactions. After the session compacts once, contextwatch uses that compaction's own output and size (`session.compact` reports `tokensAfter` and its `usage`).

The tip appears only while cooling, only for contexts of 60k tokens or more, and only when compacting comes out cheaper. A response right after a compaction writes the cache for the shorter context; that write is not reported as a miss, and `/contextwatch why` names the compaction.

## Guards

### Model switch confirmation

Claude Code raises `PreModelSwitch` before a switch, with `prompt_cache_warm` and `estimated_cache_write_usd` (its own price for writing the context to the new model). When the cache is warm and that estimate is at least `confirmSwitchUsd`, contextwatch answers `ask`, so Claude Code asks before switching. Otherwise the switch goes ahead untouched.

### MCP changes

The tool list is part of the cached prompt prefix, so connecting or dropping an MCP server rewrites the cache on the next message. After every response contextwatch records the MCP servers behind the tool list (`mcp__<server>__<tool>`). Each tick compares the current list against it; a difference while the cache is warm shows a warning in the band and the pane and a one-time notice. The next response resets the baseline.

### Cold-send question

When `askWhenCold` is on and a typed message is about to go into a cold cache of 60k tokens or more, `prompt.submit` asks once per cold spell:

- **Send anyway**: the message goes as typed.
- **Compact, then send** / **Start fresh, then send**: compacting or clearing cannot run inside `prompt.submit` (it would wait on the turn the hook holds), so the message is held, the action runs right after the hook returns, and the message is then submitted as the person's own words. Attachments on the held message are not carried over.
- Dismissing the question keeps the message unsent and puts it back in the prompt box.

Slash commands and meta prompts pass untouched.

### Away reminder

When `awayReminder` is on, the tick sends one notice per response once the time left drops below `awayReminderMinutes`.

## Redrawing

A 30-second ticker writes the engine clock to `contextwatch.now` in session state, and refreshes the session total, usage windows and active model. The band and the pane read these values, so they redraw on each tick and after every turn. The UI shows whole minutes only, so a slower tick changes nothing you can see.

## Pane layout

The pane shows one large figure (minutes left) with a thin progress bar, the usage windows, and at most one suggestion: a model switch or MCP warning, or the compact tip while cooling. The model comparison stays closed until asked for. The content is at most 56 cells wide and centres in a wider pane; the bars fill that width. The desktop app draws the progress bar as SVG in a mid-tone colour that reads on light and dark backgrounds; the terminal draws it with block characters.

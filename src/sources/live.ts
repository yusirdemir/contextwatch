import type { EngineInterface, On, TurnUsage } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Snapshot } from '../../types'
import { cacheDropped, formatTokens } from '../core/metrics'
import { inferTtl } from '../core/ttl'
import { HISTORY_LIMIT } from '../state'
import { currentServers } from './tools'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const toolBaseline = atom({ plugin: 'contextwatch', key: 'toolBaseline' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const lastCompactAt = atom({ plugin: 'contextwatch', key: 'lastCompactAt' } as const, null)

// Records each main-thread response; subagents keep caches of their own.
export function watchLive(on: On) {
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    if (e.agentId === undefined && step.usage !== null) {
      await record($, step.usage)
    }

    return step
  })
}

export async function record($: EngineInterface, usage: TurnUsage) {
  const at = await $.clock.now()
  const list = await read($, history)
  const prev = list.at(-1) ?? null
  const base = {
    at,
    model: usage.model,
    inputTokens: usage.input_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
    outputTokens: usage.output_tokens,
  }
  const snapshot: Snapshot = { ...base, ...inferTtl(prev, base) }

  await update($, history, all => [...all, snapshot].slice(-HISTORY_LIMIT))

  // The tools this response was sent with: a later change rewrites the cache.
  const servers = await currentServers($)
  await update($, toolBaseline, () => servers)
  await update($, toolChange, () => null)

  // A compaction rewrites the conversation, so the write after it is expected.
  const compactedAt = await read($, lastCompactAt)
  const isAfterCompact = prev !== null && compactedAt !== null && compactedAt > prev.at
  if (prev !== null && cacheDropped(snapshot) && !isAfterCompact) {
    $.ui.toast(`Prompt cache was cold: ${formatTokens(snapshot.cacheCreationTokens)} tokens written again.`)
  }
}

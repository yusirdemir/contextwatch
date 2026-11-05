import type { Snapshot } from '../../types'
import { cacheDropped, formatTokens } from './metrics'
import { isSameModel, modelLabel } from './pricing'
import { formatDuration, TTL_MS, ttlLabel } from './ttl'

// Why the last response missed the cache, in one sentence.
export const explainLast = (list: readonly Snapshot[], lastCompactAt: number | null = null): string => {
  const last = list.at(-1)
  if (last === undefined) return 'No response yet in this session.'

  const prev = list.at(-2)
  if (!cacheDropped(last)) return 'The cache served the last response.'
  if (prev === undefined) return 'The first response of a session always writes the cache.'

  const gap = last.at - prev.at
  const written = formatTokens(last.cacheCreationTokens)

  if (lastCompactAt !== null && lastCompactAt > prev.at && lastCompactAt <= last.at) {
    return `A compaction replaced the conversation with a summary, so the cache was written again for the shorter context (${written} tokens).`
  }

  if (gap > TTL_MS[prev.ttl]) {
    return `The cache lapsed: the previous response was ${formatDuration(gap)} earlier, past its ${ttlLabel(prev.ttl)} TTL. ${written} tokens were written again.`
  }
  if (!isSameModel(prev.model, last.model)) {
    return `The model changed from ${modelLabel(prev.model)} to ${modelLabel(last.model)}; each model has its own cache. ${written} tokens were written again.`
  }

  return `The prompt prefix changed (tools, system prompt or a compaction) while the cache was still warm. ${written} tokens were written again.`
}

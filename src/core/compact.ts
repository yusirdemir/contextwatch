import type { CompactStats, Snapshot } from '../../types'
import { contextTokens } from './metrics'
import { priceOf, promptCost, WRITE_MULTIPLIER } from './pricing'
import { remainingMs } from './ttl'

// Until a compaction of this session is seen: a summary of about 10k tokens,
// leaving about 20k of context (typical Claude Code compactions land at 10-22k).
export const DEFAULT_COMPACT: CompactStats = { tokensAfter: 20_000, outputTokens: 10_000 }

// Below this, compacting saves too little to suggest.
export const COMPACT_MIN_TOKENS = 60_000

export type CompactAdvice = {
  // The compaction itself: reading the context, writing the summary.
  compactNow: number
  // Coming back to a cold cache after compacting.
  backCold: number
  // Coming back to a cold cache without compacting.
  stayCold: number
  saves: number
}

const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1_000_000

// Whether compacting now, while the cache is warm, beats returning to a
// cold cache later. A compaction reads the whole context, which is cheap
// only while it is still cached.
export const compactAdvice = (list: readonly Snapshot[], now: number, stats: CompactStats | null): CompactAdvice | null => {
  const last = list.at(-1)
  if (last === undefined) return null

  const context = contextTokens(last)
  const price = priceOf(last.model, context)
  if (price === null || context < COMPACT_MIN_TOKENS) return null

  const { tokensAfter, outputTokens } = stats ?? DEFAULT_COMPACT
  const isWarm = remainingMs(last, now) > 0
  const readContext = usd(context, isWarm ? price.cacheRead : price.input * WRITE_MULTIPLIER[last.ttl])
  const compactNow = readContext + usd(outputTokens, price.output)
  const backCold = promptCost(last.model, Math.min(tokensAfter, context), 0, last.ttl) ?? 0
  const stayCold = promptCost(last.model, context, 0, last.ttl) ?? 0
  const saves = stayCold - (compactNow + backCold)

  return saves > 0 ? { compactNow, backCold, stayCold, saves } : null
}

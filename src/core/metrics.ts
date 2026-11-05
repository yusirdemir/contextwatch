import type { Snapshot } from '../../types'

// Below this many written tokens a miss is noise, not a dropped cache.
const DROP_MIN_TOKENS = 1024

const promptTokens = (s: Snapshot) => s.inputTokens + s.cacheReadTokens + s.cacheCreationTokens

// Share of the prompt the cache served, 0 to 1.
export const hitRate = (s: Snapshot): number => {
  const total = promptTokens(s)

  return total === 0 ? 0 : s.cacheReadTokens / total
}

// True when the response wrote the prefix again instead of reading it.
export const cacheDropped = (s: Snapshot): boolean =>
  s.cacheCreationTokens >= DROP_MIN_TOKENS && hitRate(s) < 0.1

// Tokens the next request sends: this prompt plus this answer.
export const contextTokens = (s: Snapshot): number => promptTokens(s) + s.outputTokens

// 950 → "950", 113758 → "114k", 1250000 → "1.3M".
export const formatTokens = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`

  return `${(n / 1_000_000).toFixed(1)}M`
}

// 0.984 → "98%".
export const formatPercent = (ratio: number): string => `${Math.round(ratio * 100)}%`

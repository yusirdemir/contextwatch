import type { Snapshot } from '../../types'

// Share of the prompt the cache served, 0 to 1.
export const hitRate = (_snapshot: Snapshot): number => {
  // TODO: cacheRead / (cacheRead + cacheCreation + input).
  return 0
}

// True when the response re-wrote the prefix instead of reading it.
export const cacheDropped = (_snapshot: Snapshot): boolean => {
  // TODO: cacheRead near 0 while cacheCreation is large.
  return false
}

// Tokens the next request re-sends.
export const contextTokens = (_snapshot: Snapshot): number => {
  // TODO: input + cacheRead + cacheCreation.
  return 0
}

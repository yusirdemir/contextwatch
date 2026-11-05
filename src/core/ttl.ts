import type { Snapshot, Ttl, TtlSource } from '../../types'
import { cacheDropped, hitRate } from './metrics'
import { isSameModel } from './pricing'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

export const DEFAULT_TTL: Ttl = '1h'

export type Warmth = 'warm' | 'cooling' | 'cold'

// Settles the TTL of `next` from the gap since `prev`.
//
// The live usage carries no TTL, but the responses reveal it: a hit after
// more than five minutes means a one-hour entry, and a miss after five to
// sixty minutes, on the same model, means a five-minute one.
export const inferTtl = (
  prev: Snapshot | null,
  next: Omit<Snapshot, 'ttl' | 'ttlSource'>,
): { ttl: Ttl; ttlSource: TtlSource } => {
  if (prev === null) return { ttl: DEFAULT_TTL, ttlSource: 'default' }

  const gap = next.at - prev.at
  const probe = { ...next, ttl: prev.ttl, ttlSource: prev.ttlSource }
  const isPastShort = gap > TTL_MS['5m']

  if (isPastShort && hitRate(probe) >= 0.5) return { ttl: '1h', ttlSource: 'observed' }

  if (isPastShort && gap <= TTL_MS['1h'] && isSameModel(prev.model, next.model) && cacheDropped(probe)) {
    return { ttl: '5m', ttlSource: 'observed' }
  }

  return { ttl: prev.ttl, ttlSource: prev.ttlSource }
}

// Milliseconds until the entry written by `s` lapses; 0 once it has.
export const remainingMs = (s: Snapshot, now: number): number =>
  Math.max(0, s.at + TTL_MS[s.ttl] - now)

// Cooling in the last sixth of the TTL: ten minutes of an hour.
export const warmth = (s: Snapshot, now: number): Warmth => {
  const left = remainingMs(s, now)
  if (left === 0) return 'cold'

  return left <= TTL_MS[s.ttl] / 6 ? 'cooling' : 'warm'
}

// Whole minutes left, calm to read: "59 min", "<1 min", "cold".
export const formatMinutes = (ms: number): string => {
  if (ms <= 0) return 'cold'

  const minutes = Math.floor(ms / 60_000)

  return minutes < 1 ? '<1 min' : `${minutes} min`
}

// 45000 → "just now", 420000 → "7 min ago", 5400000 → "1 h 30 min ago".
export const formatAgo = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`
}

// 5400000 → "1 h 30 min", 1200000 → "20 min".
export const formatDuration = (ms: number): string => formatAgo(ms).replace(' ago', '').replace('just now', 'under a minute')

export const ttlLabel = (ttl: Ttl): string => (ttl === '1h' ? '1 hour' : '5 minutes')

import type { Snapshot, Ttl, TtlSource } from '../../types'
import { cacheDropped, hitRate } from './metrics'

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

  const isSameModel = prev.model === next.model
  if (isPastShort && gap <= TTL_MS['1h'] && isSameModel && cacheDropped(probe)) {
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

// 2832000 → "47:12".
export const formatClock = (ms: number): string => {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// 45000 → "45s ago", 420000 → "7m ago", 5400000 → "1h 30m ago".
export const formatAgo = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
}

export const ttlLabel = (ttl: Ttl): string => (ttl === '1h' ? '1 hour' : '5 minutes')

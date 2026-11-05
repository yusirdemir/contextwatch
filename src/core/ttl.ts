import type { Snapshot, Ttl } from '../../types'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

// Which TTL a response wrote with, from its cache_creation breakdown.
export const detectTtl = (_ephemeral5m: number, _ephemeral1h: number, fallback: Ttl): Ttl => {
  // TODO: 1h when ephemeral_1h > 0, 5m when ephemeral_5m > 0, else fallback.
  return fallback
}

// Milliseconds until the cache entry from `snapshot` lapses; 0 once it has.
export const remainingMs = (_snapshot: Snapshot, _now: number): number => {
  // TODO: snapshot.at + TTL_MS[snapshot.ttl] - now, floored at 0.
  return 0
}

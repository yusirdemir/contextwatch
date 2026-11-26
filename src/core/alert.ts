import type { Snapshot, ToolChange } from '../../types'
import { isSameModel } from './pricing'
import { formatChange } from './tools'
import { remainingMs } from './ttl'

// How long a change holds the band before its usual line comes back.
export const ALERT_MS = 30_000

// The change the band flags, as a key that tells one change from the next:
// a model switch or an MCP change that will rewrite a warm cache. Null when
// there is none, or the cache is cold anyway.
export const alertKey = (last: Snapshot | undefined, now: number, model: string | null, change: ToolChange | null): string | null => {
  if (last === undefined || remainingMs(last, now) === 0) return null
  if (model !== null && !isSameModel(model, last.model)) return `switch:${model}`
  if (change !== null) return `mcp:${formatChange(change)}`

  return null
}

// Whether `seen`, the change first noticed at `seen.at`, still holds the band.
export const isFresh = (seen: { key: string; at: number } | null, key: string | null, now: number): boolean =>
  seen !== null && key !== null && seen.key === key && now - seen.at < ALERT_MS

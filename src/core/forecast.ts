import type { Snapshot } from '../../types'
import { contextTokens } from './metrics'
import { isSameModel, modelLabel, promptCost, SWITCH_MODELS } from './pricing'
import { remainingMs } from './ttl'

export type Option = {
  model: string
  label: string
  isCurrent: boolean
  // Minutes this model's cache has left, 0 when cold.
  warmMs: number
  // Dollars for the context alone; null for an unknown model.
  cost: number | null
}

// The newest snapshot of each model, newest first.
const lastByModel = (list: readonly Snapshot[]): Snapshot[] => {
  const seen: Snapshot[] = []
  for (const s of [...list].reverse()) {
    if (!seen.some(t => isSameModel(t.model, s.model))) seen.push(s)
  }

  return seen
}

// What the next message costs if it stays on the current model.
export const stayCost = (list: readonly Snapshot[], now: number): { warm: number | null; cold: number | null } => {
  const last = list.at(-1)
  if (last === undefined) return { warm: null, cold: null }

  const context = contextTokens(last)
  const isWarm = remainingMs(last, now) > 0

  return {
    warm: isWarm ? promptCost(last.model, context, context - last.outputTokens, last.ttl) : null,
    cold: promptCost(last.model, context, 0, last.ttl),
  }
}

// The first message after switching to each model.
//
// Each model keeps its own cache. A model used earlier in the session may
// still hold the start of the conversation; the rest is written again.
export const switchOptions = (list: readonly Snapshot[], now: number): Option[] => {
  const last = list.at(-1)
  if (last === undefined) return []

  const context = contextTokens(last)
  const caches = lastByModel(list)
  const models = [last.model, ...SWITCH_MODELS.filter(m => !isSameModel(m, last.model))]

  return models.map(model => {
    const cache = caches.find(s => isSameModel(s.model, model))
    const warmMs = cache === undefined ? 0 : remainingMs(cache, now)
    const warmTokens = warmMs > 0 && cache !== undefined ? contextTokens(cache) : 0
    const ttl = cache?.ttl ?? last.ttl

    return {
      model,
      label: modelLabel(model),
      isCurrent: isSameModel(model, last.model),
      warmMs,
      cost: promptCost(model, context, warmTokens, ttl),
    }
  })
}

// What the next message costs, from the last response's own usage figures
// and the cache state, with no estimate: the last prompt is read from the
// cache, and the last answer, which joined the context after it was cached,
// is written. Cold, all of it is written. The new message itself (tens of
// tokens beside a context of thousands) and the answer come on top.
export const floorCost = (list: readonly Snapshot[], now: number): number | null => nextBreakdown(list, now)?.total ?? null

// The next message in two parts: what is read from the cache and what is
// written to it, in tokens and dollars. The pane draws the dollars as a bar.
export type Breakdown = { readTokens: number; writeTokens: number; readUsd: number; writeUsd: number; total: number }

export const nextBreakdown = (list: readonly Snapshot[], now: number): Breakdown | null => {
  const last = list.at(-1)
  if (last === undefined) return null

  const context = contextTokens(last)
  const readTokens = remainingMs(last, now) > 0 ? contextTokens(last) - last.outputTokens : 0
  const writeTokens = context - readTokens
  const readUsd = promptCost(last.model, readTokens, readTokens, last.ttl)
  const writeUsd = promptCost(last.model, writeTokens, 0, last.ttl)
  if (readUsd === null || writeUsd === null) return null

  return { readTokens, writeTokens, readUsd, writeUsd, total: readUsd + writeUsd }
}

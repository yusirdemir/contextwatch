import type { Snapshot } from '../../types'
import { contextTokens } from './metrics'
import { isSameModel, modelLabel, promptCost, responseCost, SWITCH_MODELS } from './pricing'
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
    warm: isWarm ? promptCost(last.model, context, context, last.ttl) : null,
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

// What a question has cost lately: the average of the last few turns, each the
// sum of its requests. It grows with the context, since every request re-reads it.
export const questionCost = (list: readonly Snapshot[], turns = 3): number | null => {
  const totals = new Map<string, number>()
  for (const s of list) {
    if (s.turnId === undefined) continue
    const cost = responseCost(s)
    if (cost === null) continue
    totals.set(s.turnId, (totals.get(s.turnId) ?? 0) + cost)
  }

  const recent = [...totals.values()].slice(-turns)
  if (recent.length === 0) return null

  return recent.reduce((a, b) => a + b, 0) / recent.length
}

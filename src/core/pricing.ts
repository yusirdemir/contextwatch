import type { Snapshot, Ttl } from '../../types'

// Anthropic first-party list prices in US dollars per million tokens.
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// Update PRICES_AS_OF and the table together when prices change.
export const PRICES_AS_OF = '2026-10-06'

export type Price = { input: number; output: number; cacheRead: number }

type Entry = Price & { label: string; longContext?: { above: number; price: Price } }

const PRICES: Record<string, Entry> = {
  'claude-fable-5-1': { label: 'Fable 5.1', input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { label: 'Fable 5', input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { label: 'Opus 5.5', input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { label: 'Opus 5', input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { label: 'Opus 4.8', input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { label: 'Opus 4.7', input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { label: 'Opus 4.6', input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5', input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { label: 'Sonnet 5', input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { label: 'Sonnet 4.6', input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': {
    label: 'Haiku 5.5',
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    longContext: { above: 100_000, price: { input: 0.5, output: 2.5, cacheRead: 0.05 } },
  },
  'claude-haiku-4-5': { label: 'Haiku 4.5', input: 1, output: 5, cacheRead: 0.1 },
}

// The models offered in the switch comparison, most capable first.
export const SWITCH_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

// Cache writes cost a multiple of the input price, by TTL.
export const WRITE_MULTIPLIER: Record<Ttl, number> = { '5m': 1.25, '1h': 2 }

// "claude-opus-5-5[1m]" and "claude-opus-5-5-20261001" both resolve to "claude-opus-5-5".
const resolve = (model: string): string | undefined => {
  const id = model.toLowerCase().replace(/\[.*\]$/, '')

  return Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find(key => id === key || id.startsWith(`${key}-`))
}

export const modelLabel = (model: string): string => {
  const key = resolve(model)

  return key === undefined ? model : (PRICES[key]?.label ?? model)
}

export const isSameModel = (a: string, b: string): boolean => (resolve(a) ?? a) === (resolve(b) ?? b)

// The price for a prompt of `promptTokens`, or null for an unknown model.
export const priceOf = (model: string, promptTokens: number): Price | null => {
  const key = resolve(model)
  const entry = key === undefined ? undefined : PRICES[key]
  if (entry === undefined) return null

  return entry.longContext !== undefined && promptTokens > entry.longContext.above ? entry.longContext.price : entry
}

const usd = (tokens: number, perMillion: number) => (tokens * perMillion) / 1_000_000

// What one recorded response cost.
export const responseCost = (s: Snapshot): number | null => {
  const prompt = s.inputTokens + s.cacheReadTokens + s.cacheCreationTokens
  const p = priceOf(s.model, prompt)
  if (p === null) return null

  return (
    usd(s.inputTokens, p.input) +
    usd(s.cacheReadTokens, p.cacheRead) +
    usd(s.cacheCreationTokens, p.input * WRITE_MULTIPLIER[s.ttl]) +
    usd(s.outputTokens, p.output)
  )
}

// What sending `context` tokens to `model` costs, when the first `warmTokens`
// of them are still in that model's cache and the rest must be written.
// Counts the context only: the new message and the answer come on top.
export const promptCost = (model: string, context: number, warmTokens: number, ttl: Ttl): number | null => {
  const p = priceOf(model, context)
  if (p === null) return null

  const read = Math.min(warmTokens, context)

  return usd(read, p.cacheRead) + usd(context - read, p.input * WRITE_MULTIPLIER[ttl])
}

// $0.0042 → "<$0.01", $0.0372 → "$0.04", $12.5 → "$12.50".
export const formatUsd = (value: number): string => (value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`)

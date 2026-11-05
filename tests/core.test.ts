import { expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { explainLast } from '../src/core/explain'
import { cacheDropped, contextTokens, formatTokens, hitRate } from '../src/core/metrics'
import { formatClock, inferTtl, remainingMs, TTL_MS, warmth } from '../src/core/ttl'

const MIN = 60_000

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  at: 0,
  model: 'claude-opus-5-5',
  ttl: '1h',
  ttlSource: 'default',
  inputTokens: 2,
  cacheReadTokens: 100_000,
  cacheCreationTokens: 300,
  outputTokens: 100,
  ...over,
})

test('hit rate and context size', () => {
  expect(hitRate(snap())).toBeGreaterThan(0.99)
  expect(contextTokens(snap())).toBe(100_402)
  expect(hitRate(snap({ inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }))).toBe(0)
})

test('a dropped cache is a large write with almost no read', () => {
  expect(cacheDropped(snap())).toBe(false)
  expect(cacheDropped(snap({ cacheReadTokens: 0, cacheCreationTokens: 100_000 }))).toBe(true)
  expect(cacheDropped(snap({ cacheReadTokens: 0, cacheCreationTokens: 500 }))).toBe(false)
})

test('remaining time counts down to zero and the warmth follows', () => {
  const s = snap({ at: 0 })
  expect(remainingMs(s, 10 * MIN)).toBe(50 * MIN)
  expect(warmth(s, 10 * MIN)).toBe('warm')
  expect(warmth(s, 55 * MIN)).toBe('cooling')
  expect(remainingMs(s, 61 * MIN)).toBe(0)
  expect(warmth(s, 61 * MIN)).toBe('cold')
})

test('the TTL is learned from the gap between responses', () => {
  const first = snap({ at: 0, ttl: '1h', ttlSource: 'default' })

  expect(inferTtl(null, first)).toEqual({ ttl: '1h', ttlSource: 'default' })
  // A hit twenty minutes later can only be a one-hour entry.
  expect(inferTtl(first, snap({ at: 20 * MIN }))).toEqual({ ttl: '1h', ttlSource: 'observed' })
  // A miss twenty minutes later, on the same model, means five minutes.
  const miss = snap({ at: 20 * MIN, cacheReadTokens: 0, cacheCreationTokens: 100_000 })
  expect(inferTtl(first, miss)).toEqual({ ttl: '5m', ttlSource: 'observed' })
  // A miss right after a model switch says nothing about the TTL.
  expect(inferTtl(first, { ...miss, model: 'claude-sonnet-5-5' })).toEqual({ ttl: '1h', ttlSource: 'default' })
  // A quick hit keeps what was known.
  expect(inferTtl(first, snap({ at: MIN }))).toEqual({ ttl: '1h', ttlSource: 'default' })
})

test('formatting', () => {
  expect(formatClock(47 * MIN + 12_000)).toBe('47:12')
  expect(formatClock(TTL_MS['5m'])).toBe('5:00')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(113_758)).toBe('114k')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})

test('the last miss is explained', () => {
  const miss = { cacheReadTokens: 0, cacheCreationTokens: 100_000 }

  expect(explainLast([])).toMatch(/No response/)
  expect(explainLast([snap()])).toMatch(/served/)
  expect(explainLast([snap(), snap({ at: 90 * MIN, ...miss })])).toMatch(/lapsed/)
  expect(explainLast([snap(), snap({ at: MIN, model: 'claude-sonnet-5-5', ...miss })])).toMatch(/model changed/)
  expect(explainLast([snap(), snap({ at: MIN, ...miss })])).toMatch(/prefix changed/)
})

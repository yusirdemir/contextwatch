import { expect, test } from 'claude-code/testing'

import type { Snapshot } from '../types'
import { compactAdvice } from '../src/core/compact'
import { explainLast } from '../src/core/explain'
import { cacheDropped, contextTokens, formatTokens, hitRate } from '../src/core/metrics'
import { floorCost, nextQuestionCost, questionCost, stayCost, switchOptions } from '../src/core/forecast'
import { formatUsd, modelLabel, priceOf, promptCost, responseCost } from '../src/core/pricing'
import { diffServers, formatChange, serversOf } from '../src/core/tools'
import { calibrate, formatImpact, formatLanding, formatUntil, parseLimits, pointsOf } from '../src/core/usage'
import { formatAgo, formatMinutes, inferTtl, remainingMs, warmth } from '../src/core/ttl'

const MIN = 60_000

// Dollar figures are sums of floats: compare to a millionth of a cent.
const near = (actual: number | null | undefined, expected: number) =>
  actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8

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
  expect(formatMinutes(59 * MIN + 55_000)).toBe('59 min')
  expect(formatMinutes(30_000)).toBe('<1 min')
  expect(formatMinutes(0)).toBe('cold')
  expect(formatAgo(5_000)).toBe('just now')
  expect(formatAgo(90 * MIN)).toBe('1 h 30 min ago')
  expect(formatUsd(0.004)).toBe('<$0.01')
  expect(formatUsd(1.4706)).toBe('$1.47')
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

test('models resolve to their list price', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelLabel('claude-opus-5')).toBe('Opus 5')
  expect(priceOf('claude-sonnet-5-5', 1000)?.input).toBe(2)
  // Haiku 5.5 charges more past 100K tokens of prompt.
  expect(priceOf('claude-haiku-5-5', 50_000)?.input).toBe(0.1)
  expect(priceOf('claude-haiku-5-5', 150_000)?.input).toBe(0.5)
  expect(priceOf('some-other-model', 1000)).toBeNull()
})

test('a response is priced by its four token counts', () => {
  // 2 × $4 + 100k × $0.20 + 300 × $4 × 2 (1-hour write) + 100 × $20, per million.
  expect(near(responseCost(snap()), 0.024408)).toBe(true)
  expect(responseCost(snap({ model: 'unknown' }))).toBeNull()
})

test('a warm cache makes the next message cheap', () => {
  expect(near(promptCost('claude-opus-5-5', 100_000, 100_000, '1h'), 0.02)).toBe(true)
  expect(near(promptCost('claude-opus-5-5', 100_000, 0, '1h'), 0.8)).toBe(true)
  expect(near(promptCost('claude-opus-5-5', 100_000, 0, '5m'), 0.5)).toBe(true)

  const cost = stayCost([snap({ at: 0 })], 10 * MIN)
  expect(near(cost.warm, 0.0200804)).toBe(true)
  expect(near(cost.cold, 0.803216)).toBe(true)
  expect(stayCost([snap({ at: 0 })], 61 * MIN).warm).toBeNull()
})

test('switching models writes the context again unless that model is still warm', () => {
  const list = [
    snap({ at: 0, model: 'claude-sonnet-5-5', cacheReadTokens: 60_000 }),
    snap({ at: 10 * MIN }),
  ]
  const options = switchOptions(list, 20 * MIN)
  const sonnet = options.find(o => o.model === 'claude-sonnet-5-5')
  const haiku = options.find(o => o.model === 'claude-haiku-5-5')

  expect(options[0]?.isCurrent).toBe(true)
  expect(sonnet?.warmMs).toBe(40 * MIN)
  // Sonnet still holds the first ~60k tokens: read those, write the rest.
  expect(near(sonnet?.cost, (60_402 * 0.2 + 40_000 * 2 * 2) / 1e6)).toBe(true)
  expect(haiku?.warmMs).toBe(0)
  expect(near(haiku?.cost, (100_402 * 0.5 * 2) / 1e6)).toBe(true)
})

test('MCP server changes are read from the tool list', () => {
  const tools = [
    { name: 'Bash', mcp: false },
    { name: 'mcp__github__create_issue', mcp: true },
    { name: 'mcp__github__list_prs', mcp: true },
    { name: 'mcp__slack__send', mcp: true },
  ]
  expect(serversOf(tools)).toEqual(['github', 'slack'])
  expect(diffServers(['github'], ['github'])).toBeNull()

  const change = diffServers(['github', 'jira'], ['github', 'slack'])
  expect(change).toEqual({ added: ['slack'], removed: ['jira'] })
  expect(formatChange(change!)).toBe('+slack −jira')
})

test('compacting while warm beats coming back to a cold cache', () => {
  const list = [snap({ at: 0 })]
  const advice = compactAdvice(list, 52 * MIN, null)

  // Read 100k from cache, write a ~10k summary at the output price.
  expect(near(advice?.compactNow, 100_402 * 0.2 / 1e6 + 10_000 * 20 / 1e6)).toBe(true)
  // Come back to ~20k cold instead of 100k cold.
  expect(near(advice?.backCold, 20_000 * 4 * 2 / 1e6)).toBe(true)
  expect(near(advice?.stayCold, 100_402 * 4 * 2 / 1e6)).toBe(true)
  expect(advice!.saves).toBeGreaterThan(0.4)

  // What the session's own compaction came to replaces the defaults.
  const learned = compactAdvice(list, 52 * MIN, { tokensAfter: 40_000, outputTokens: 4_000 })
  expect(near(learned?.backCold, 40_000 * 4 * 2 / 1e6)).toBe(true)

  // Too small to be worth it.
  expect(compactAdvice([snap({ cacheReadTokens: 30_000 })], 52 * MIN, null)).toBeNull()
})

test('a miss after a compaction is explained as the compaction', () => {
  const miss = { cacheReadTokens: 0, cacheCreationTokens: 20_000 }
  expect(explainLast([snap(), snap({ at: 2 * MIN, ...miss })], MIN)).toMatch(/compaction/)
})

test('usage windows and what a dollar moves them', () => {
  const limits = parseLimits([
    { kind: 'five_hour', percentUsed: 40, resetsAt: '1970-01-01T01:20:00Z' },
    { kind: 'seven_day', percentUsed: 20 },
  ])
  expect(limits?.fiveHour).toEqual({ percent: 40, resetsAt: 80 * MIN })
  expect(limits?.weekly?.resetsAt).toBeNull()
  expect(parseLimits([])).toBeNull()

  let cal = calibrate({ anchor: null, percentPerUsd: null }, 1, limits)
  expect(cal.percentPerUsd).toBeNull()
  // Half a point is too little to measure.
  cal = calibrate(cal, 2, parseLimits([{ kind: 'five_hour', percentUsed: 40.5 }]))
  expect(cal.percentPerUsd).toBeNull()
  cal = calibrate(cal, 3, parseLimits([{ kind: 'five_hour', percentUsed: 44 }]))
  expect(cal.percentPerUsd).toBe(2)
  // A window reset starts a new sample instead of a negative one.
  cal = calibrate(cal, 4, parseLimits([{ kind: 'five_hour', percentUsed: 1 }]))
  expect(cal).toEqual({ anchor: { usd: 4, percent: 1 }, percentPerUsd: 2 })

  expect(formatImpact(0.9, limits, cal)).toBe('+1.8%')
  expect(formatImpact(9, limits, cal)).toBe('+18%')
  expect(formatImpact(0.01, limits, cal)).toBe('<0.1%')
  expect(formatImpact(0.9, limits, { anchor: null, percentPerUsd: null })).toBeNull()
  expect(formatImpact(0.9, null, cal)).toBe('~$0.90')

  expect(formatUntil(80 * MIN, 0)).toBe('1 h 20 min')
  expect(formatUntil(3 * 24 * 60 * MIN + 4 * 60 * MIN, 0)).toBe('3 d 4 h')
})

test('a question costs the sum of its requests, averaged over recent turns', () => {
  const one = responseCost(snap())!
  // Turn a took two requests, turn b one: average (2 + 1) / 2 requests' worth.
  const list = [snap({ turnId: 'a' }), snap({ turnId: 'a' }), snap({ turnId: 'b' })]
  expect(near(questionCost(list), (one * 3) / 2)).toBe(true)
  // Only the last three turns count.
  const many = ['a', 'b', 'c', 'd'].map(turnId => snap({ turnId }))
  expect(near(questionCost([snap({ turnId: 'z', cacheReadTokens: 900_000 }), ...many]), one)).toBe(true)
  expect(questionCost([snap()])).toBeNull()
})

test('the next question costs at least one read of the context', () => {
  const list = [snap({ at: 0, turnId: 'a' })]
  // One cache read of 100,402 tokens on Opus 5.5.
  expect(near(floorCost(list, MIN), 100_402 * 0.2 / 1e6)).toBe(true)
  // Cold, the floor is the rewrite.
  expect(near(floorCost(list, 61 * MIN), 100_402 * 4 * 2 / 1e6)).toBe(true)
  // The recent turn cost more than the floor, so it sets the estimate.
  expect(near(nextQuestionCost(list, MIN), responseCost(snap())!)).toBe(true)
  // A cheap recent turn never takes the estimate below the floor.
  const cheap = [snap({ at: 0, turnId: 'a', cacheReadTokens: 0, cacheCreationTokens: 0, inputTokens: 10, outputTokens: 0 }), snap({ at: 0 })]
  expect(near(nextQuestionCost(cheap, MIN), floorCost(cheap, MIN)!)).toBe(true)

  const cal = { anchor: null, percentPerUsd: 5 }
  expect(pointsOf(0.4, cal)).toBe(2)
  expect(pointsOf(0.4, { anchor: null, percentPerUsd: null })).toBeNull()
  expect(formatLanding({ percent: 41, resetsAt: null }, 2.3)).toBe('41% → 43%')
  expect(formatLanding({ percent: 99, resetsAt: null }, 5)).toBe('99% → 100%')
})

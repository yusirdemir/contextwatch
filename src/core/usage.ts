import type { Calibration, Limits, LimitWindow } from '../../types'
import { formatUsd } from './pricing'

// Read from `$.session.usage().rateLimits`: the subscription's usage windows.
export const parseLimits = (rows: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Limits | null => {
  const pick = (kind: string): LimitWindow | null => {
    const row = rows.find(r => r.kind === kind)
    if (row === undefined) return null

    const at = row.resetsAt === undefined ? Number.NaN : Date.parse(row.resetsAt)

    return { percent: row.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
  }
  const fiveHour = pick('five_hour')
  const weekly = pick('seven_day')

  return fiveHour === null && weekly === null ? null : { fiveHour, weekly }
}

// The usage windows report a percentage, not dollars or tokens. To say what a
// message does to the 5-hour window, contextwatch learns how many points each
// dollar of list price moves it.
//
// The window is the account's, so the dollars must be too: every session that
// runs contextwatch adds its spend to a shared ledger (`totalSpend`), and the
// ratio divides the window's move by the ledger's. Spend the ledger cannot see
// (claude.ai, a session without the mod) only ever pushes a sample up, so the
// ratio is the lowest of the recent samples, not their average.

// A sample needs the window to move a point (it reports one decimal) and the
// ledger at least this many dollars, so neither rounding nor a quiet spell
// makes it.
const MIN_POINTS = 1
const MIN_DOLLARS = 0.25
const SAMPLES = 8

export const calibrate = (cal: Calibration, usd: number | null, limits: Limits | null): Calibration => {
  const percent = limits?.fiveHour?.percent
  if (usd === null || percent === undefined) return cal

  const anchor = cal.anchor
  // A reset, the first reading, or a session leaving the ledger: start again from here.
  if (anchor === null || percent < anchor.percent || usd < anchor.usd) {
    return { ...cal, anchor: { usd, percent } }
  }

  const points = percent - anchor.percent
  const dollars = usd - anchor.usd
  if (points < MIN_POINTS || dollars < MIN_DOLLARS) return cal

  const samples = [...cal.samples, points / dollars].slice(-SAMPLES)

  return { anchor: { usd, percent }, percentPerUsd: Math.min(...samples), samples }
}

// One session's line in the shared ledger: what it had spent when it joined,
// what it has spent now, and when it last wrote.
export type LedgerEntry = { first: number; usd: number; at: number }

// Entries untouched for this long belong to sessions that have ended.
export const LEDGER_TTL_MS = 6 * 60 * 60_000

// Spend across the ledger since each session joined it.
export const totalSpend = (entries: readonly LedgerEntry[], now: number): number =>
  entries.filter(e => now - e.at < LEDGER_TTL_MS).reduce((sum, e) => sum + Math.max(0, e.usd - e.first), 0)

export const isLedgerEntry = (value: unknown): value is LedgerEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as LedgerEntry).first === 'number' &&
  typeof (value as LedgerEntry).usd === 'number' &&
  typeof (value as LedgerEntry).at === 'number'

// Until the account's own ratio is learned, this stands in: points of the
// 5-hour window per dollar of list price, as measured on a Team seat. Figures
// built on it carry a "~" so they read as the estimate they are.
export const PRIOR_PERCENT_PER_USD = 3

export const ratioOf = (cal: Calibration): { ratio: number; isAssumed: boolean } =>
  cal.percentPerUsd === null ? { ratio: PRIOR_PERCENT_PER_USD, isAssumed: true } : { ratio: cal.percentPerUsd, isAssumed: false }

// What `usd` of list price comes to: "+6%" of the 5-hour window ("~+6%" while
// the ratio is assumed), or dollars where there are no usage windows (an API key).
export const formatImpact = (usd: number | null, limits: Limits | null, cal: Calibration): string | null => {
  if (usd === null) return null
  if (limits?.fiveHour == null) return `~${formatUsd(usd)}`

  const { ratio, isAssumed } = ratioOf(cal)
  const points = usd * ratio
  if (points < 0.1) return '<0.1%'
  if (isAssumed) return `~+${points < 10 ? points.toFixed(1) : Math.round(points)}%`

  return `+${points < 10 ? points.toFixed(1) : Math.round(points)}%`
}

// "1 h 20 min", "3 d 4 h", "now".
export const formatUntil = (at: number | null, now: number): string | null => {
  if (at === null) return null

  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes === 0) return 'now'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`

  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

// The points of the 5-hour window `usd` moves, by the learned or assumed ratio.
export const pointsOf = (usd: number | null, cal: Calibration): number | null => (usd === null ? null : usd * ratioOf(cal).ratio)

// "41% → 43%": where the 5-hour window lands after `points` more.
export const formatLanding = (window: LimitWindow, points: number): string =>
  `${formatPercentUsed(window.percent)} → ${formatPercentUsed(Math.min(100, window.percent + points))}`

// As precise as the engine reports it: "55%" for a whole number, "54.6%" for
// a decimal, so the figure never claims a precision it was not given.
const one = (percent: number): string => (Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`)

export const formatPercentUsed = (percent: number): string => one(Math.round(percent * 10) / 10)

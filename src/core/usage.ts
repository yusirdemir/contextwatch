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

// What `usd` of list price comes to: "+6%" of the 5-hour window when the
// ratio is known, dollars where there are no usage windows (an API key),
// and null while the ratio is still being learned.
export const formatImpact = (usd: number | null, limits: Limits | null, cal: Calibration): string | null => {
  if (usd === null) return null
  if (limits?.fiveHour == null) return `~${formatUsd(usd)}`
  if (cal.percentPerUsd === null) return null

  const points = usd * cal.percentPerUsd
  if (points < 0.1) return '<0.1%'

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

// The points of the 5-hour window `usd` moves; null while the ratio is unknown.
export const pointsOf = (usd: number | null, cal: Calibration): number | null =>
  usd === null || cal.percentPerUsd === null ? null : usd * cal.percentPerUsd

// "41% → 43%": where the 5-hour window lands after `points` more.
export const formatLanding = (window: LimitWindow, points: number): string =>
  `${formatPercentUsed(window.percent)} → ${formatPercentUsed(Math.min(100, window.percent + points))}`

// One decimal, as the window reports it, so a small move shows.
export const formatPercentUsed = (percent: number): string => `${percent.toFixed(1)}%`

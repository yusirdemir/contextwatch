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
// cache rewrite does to the 5-hour window, contextwatch learns how many
// percent each dollar of list price moves it, from this session's own spend.
// Other sessions using the same account at the same time push the figure up,
// so it is an estimate and is smoothed over several samples.

// Only a move of at least this many points is a sample: the window reports one decimal.
const MIN_POINTS = 1

const SMOOTHING = 0.3

export const calibrate = (cal: Calibration, usd: number | null, limits: Limits | null): Calibration => {
  const percent = limits?.fiveHour?.percent
  if (usd === null || percent === undefined) return cal

  const anchor = cal.anchor
  // A reset, or the first reading: start counting from here.
  if (anchor === null || percent < anchor.percent || usd < anchor.usd) {
    return { ...cal, anchor: { usd, percent } }
  }

  const points = percent - anchor.percent
  const dollars = usd - anchor.usd
  if (points < MIN_POINTS || dollars <= 0) return cal

  const sample = points / dollars
  const ratio = cal.percentPerUsd === null ? sample : cal.percentPerUsd * (1 - SMOOTHING) + sample * SMOOTHING

  return { anchor: { usd, percent }, percentPerUsd: ratio }
}

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

export const formatPercentUsed = (percent: number): string => `${Math.round(percent)}%`

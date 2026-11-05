import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Limits } from '../../types'
import { stayCost } from '../core/forecast'
import { formatMinutes, remainingMs } from '../core/ttl'
import { formatImpact, formatPercentUsed } from '../core/usage'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

// The always-on line under the prompt, e.g. "cache 55 min · 5h 62% · week 31%".
export async function showStatus($: EngineInterface) {
  const list = await read($, history)
  const last = list.at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const time = await read($, now)
  const windows: Limits | null = await read($, limits)
  const parts = [`cache ${formatMinutes(remainingMs(last, time))}`]

  if (windows !== null) {
    if (windows.fiveHour !== null) parts.push(`5h ${formatPercentUsed(windows.fiveHour.percent)}`)
    if (windows.weekly !== null) parts.push(`week ${formatPercentUsed(windows.weekly.percent)}`)
  } else {
    // An API key has no usage windows: dollars are the useful figure there.
    const cold = formatImpact(stayCost(list, time).cold, null, await read($, calibration))
    if (cold !== null) parts.push(`${cold} if cold`)
  }

  $.ui.status(parts.join(' · '))
}

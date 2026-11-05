import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Limits } from '../../types'
import { stayCost } from '../core/forecast'
import { formatMinutes, remainingMs } from '../core/ttl'
import { formatImpact } from '../core/usage'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

// The always-on line under the prompt: "cache 55 min", or what a cold cache costs.
export async function showStatus($: EngineInterface) {
  const list = await read($, history)
  const last = list.at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const time = await read($, now)
  const left = remainingMs(last, time)
  if (left > 0) {
    $.ui.status(`cache ${formatMinutes(left)}`)

    return
  }

  const windows: Limits | null = await read($, limits)
  const cold = formatImpact(stayCost(list, time).cold, windows, await read($, calibration))
  $.ui.status(cold === null ? 'cache cold' : `cache cold · next message ${cold}`)
}

import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import { stayCost } from '../core/forecast'
import { formatUsd } from '../core/pricing'
import { formatMinutes, remainingMs } from '../core/ttl'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

// One short status line entry, e.g. "cache 59 min · next $0.04".
export async function showStatus($: EngineInterface) {
  const list = await read($, history)
  const last = list.at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const time = await read($, now)
  const cost = stayCost(list, time)
  const next = cost.warm ?? cost.cold
  const price = next === null ? '' : ` · next ${formatUsd(next)}`

  $.ui.status(`cache ${formatMinutes(remainingMs(last, time))}${price}`)
}

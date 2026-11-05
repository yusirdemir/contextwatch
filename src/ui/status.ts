import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import { stayCost } from '../core/forecast'
import { formatUsd } from '../core/pricing'
import { formatMinutes, remainingMs } from '../core/ttl'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

// The always-on line under the prompt, e.g. "cache 55 min · $0.06 now · $2.55 if cold".
export async function showStatus($: EngineInterface) {
  const list = await read($, history)
  const last = list.at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const time = await read($, now)
  const cost = stayCost(list, time)
  const nowPart = cost.warm === null ? '' : ` · ${formatUsd(cost.warm)} now`
  const coldPart = cost.cold === null ? '' : cost.warm === null ? ` · next ${formatUsd(cost.cold)}` : ` · ${formatUsd(cost.cold)} if cold`
  const price = `${nowPart}${coldPart}`

  $.ui.status(`cache ${formatMinutes(remainingMs(last, time))}${price}`)
}

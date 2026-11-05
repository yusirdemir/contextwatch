import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import { stayCost } from '../core/forecast'
import { formatUsd } from '../core/pricing'
import { formatMinutes, remainingMs } from '../core/ttl'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

// The always-on line under the prompt, e.g. "cache 55 min · read $0.06 · cold $2.55".
export async function showStatus($: EngineInterface) {
  const list = await read($, history)
  const last = list.at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const time = await read($, now)
  const cost = stayCost(list, time)
  const readPart = cost.warm === null ? '' : ` · read ${formatUsd(cost.warm)}`
  const coldPart = cost.cold === null ? '' : cost.warm === null ? ` · rewrite ${formatUsd(cost.cold)}` : ` · cold ${formatUsd(cost.cold)}`
  const price = `${readPart}${coldPart}`

  $.ui.status(`cache ${formatMinutes(remainingMs(last, time))}${price}`)
}

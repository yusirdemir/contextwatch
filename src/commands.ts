import type { EngineInterface, On } from 'claude-code'
import { atom, read } from 'claude-code'

import { explainLast } from './core/explain'
import { stayCost } from './core/forecast'
import { contextTokens, formatPercent, formatTokens, hitRate } from './core/metrics'
import { formatUsd } from './core/pricing'
import { formatMinutes, remainingMs, ttlLabel } from './core/ttl'
import { openPane } from './ui/pane'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

export async function registerCommand($: EngineInterface) {
  await $.command.register({
    name: 'contextwatch',
    description: 'Show prompt-cache figures; add "why" to explain the last miss.',
  })
}

// `/contextwatch` opens the pane and prints the figures; `/contextwatch why` explains the last miss.
export function answerCommand(on: On) {
  on('command.run', { command: 'contextwatch' }, async ($, e) => {
    const list = await read($, history)
    if (e.args.trim() === 'why') return { text: explainLast(list) }

    await openPane($)
    const last = list.at(-1)
    if (last === undefined) return { text: 'No response yet in this session.' }

    const time = await read($, now)
    const left = remainingMs(last, time)
    const clock = left === 0 ? 'cold' : `${formatMinutes(left)} left`
    const cost = stayCost(list, time)
    const readPart = cost.warm === null ? '' : ` · cache read ~${formatUsd(cost.warm)}`
    const rewrite = cost.cold === null ? '' : ` · cache rewrite ~${formatUsd(cost.cold)}`
    const price = `${readPart}${rewrite}`

    return {
      text: `Cache ${clock} (TTL ${ttlLabel(last.ttl)}) · ${formatPercent(hitRate(last))} hit · ${formatTokens(contextTokens(last))} tokens of context${price}`,
    }
  })
}

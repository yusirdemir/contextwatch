import type { EngineInterface, On } from 'claude-code'
import { atom, read } from 'claude-code'

import { explainLast } from './core/explain'
import { contextTokens, formatPercent, formatTokens, hitRate } from './core/metrics'
import { formatClock, remainingMs, ttlLabel } from './core/ttl'
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

    const left = remainingMs(last, await read($, now))
    const clock = left === 0 ? 'cold' : `${formatClock(left)} left`

    return {
      text: `Cache ${clock} (TTL ${ttlLabel(last.ttl)}) · ${formatPercent(hitRate(last))} hit · ${formatTokens(contextTokens(last))} tokens of context`,
    }
  })
}

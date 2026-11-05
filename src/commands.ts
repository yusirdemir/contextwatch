import type { EngineInterface, On } from 'claude-code'
import { atom, read } from 'claude-code'

import { explainLast } from './core/explain'
import { stayCost } from './core/forecast'
import { contextTokens, formatPercent, formatTokens, hitRate } from './core/metrics'
import { formatMinutes, remainingMs, ttlLabel } from './core/ttl'
import { formatImpact, formatPercentUsed, formatUntil } from './core/usage'
import { openPane } from './ui/pane'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const lastCompactAt = atom({ plugin: 'contextwatch', key: 'lastCompactAt' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

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
    if (e.args.trim() === 'why') return { text: explainLast(list, await read($, lastCompactAt)) }

    await openPane($)
    const last = list.at(-1)
    if (last === undefined) return { text: 'No response yet in this session.' }

    const time = await read($, now)
    const left = remainingMs(last, time)
    const clock = left === 0 ? 'cold' : `${formatMinutes(left)} left`
    const windows = await read($, limits)
    const cold = formatImpact(stayCost(list, time).cold, windows, await read($, calibration))
    const coldPart = cold === null ? '' : ` · ${cold} if cold`
    const usage = [
      windows?.fiveHour == null ? null : `5-hour ${formatPercentUsed(windows.fiveHour.percent)} (resets in ${formatUntil(windows.fiveHour.resetsAt, time) ?? '?'})`,
      windows?.weekly == null ? null : `weekly ${formatPercentUsed(windows.weekly.percent)} (resets in ${formatUntil(windows.weekly.resetsAt, time) ?? '?'})`,
    ].filter(x => x !== null)
    const usagePart = usage.length === 0 ? '' : `\nUsage: ${usage.join(' · ')}`

    return {
      text: `Cache ${clock} (TTL ${ttlLabel(last.ttl)}) · ${formatPercent(hitRate(last))} hit · ${formatTokens(contextTokens(last))} tokens of context${coldPart}${usagePart}`,
    }
  })
}

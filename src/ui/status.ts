import type { EngineInterface } from 'claude-code'
import { atom, read } from 'claude-code'

import { contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { formatClock, remainingMs } from '../core/ttl'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

// One short status line entry, e.g. "cache 47:12 · 98% hit · 114k".
export async function showStatus($: EngineInterface) {
  const last = (await read($, history)).at(-1)
  if (last === undefined) {
    $.ui.status('cache: waiting for the first response')

    return
  }

  const left = remainingMs(last, await read($, now))
  const tokens = formatTokens(contextTokens(last))
  const clock = left === 0 ? 'cold' : formatClock(left)

  $.ui.status(`cache ${clock} · ${formatPercent(hitRate(last))} hit · ${tokens}`)
}

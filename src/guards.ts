import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { compactAdvice } from './core/compact'
import { contextTokens, formatTokens } from './core/metrics'
import { formatUsd, modelLabel, promptCost } from './core/pricing'
import { diffServers, formatChange } from './core/tools'
import { formatMinutes, remainingMs, TTL_MS } from './core/ttl'
import type { Options } from './options'
import { currentServers } from './sources/tools'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const toolBaseline = atom({ plugin: 'contextwatch', key: 'toolBaseline' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)

// Asks before a model switch that would throw away a warm cache for more
// than the configured amount. The engine prices the rewrite itself.
export function guardModelSwitch(on: On, options: Options) {
  on('classic.PreModelSwitch', async ($, e, next) => {
    const isCostly = options.confirmSwitchUsd > 0 && e.prompt_cache_warm && e.estimated_cache_write_usd >= options.confirmSwitchUsd
    if (!isCostly) return next(e)

    const last = (await read($, history)).at(-1)
    const left = last === undefined ? '' : ` The ${modelLabel(e.from_model)} cache has ${formatMinutes(remainingMs(last, await $.clock.now()))} left.`

    return {
      permissionDecision: 'ask' as const,
      permissionDecisionReason:
        `Switching to ${modelLabel(e.to_model)} rewrites ${formatTokens(e.context_tokens)} tokens of context ` +
        `(~${formatUsd(e.estimated_cache_write_usd)}).${left}`,
    }
  }).catch(($, e, next) => next(e))
}

let remindedFor: number | undefined
let warnedChange: string | undefined

// Runs on every tick: the reminder before the cache lapses, and the check
// for MCP servers that changed since the last response.
export async function watchAway($: EngineInterface, options: Options, time: number) {
  const last = (await read($, history)).at(-1)
  if (last === undefined) return

  const left = remainingMs(last, time)

  if (options.awayReminder && left > 0 && left <= options.awayReminderMinutes * 60_000 && remindedFor !== last.at) {
    remindedFor = last.at
    const cost = promptCost(last.model, contextTokens(last), 0, last.ttl)
    const price = cost === null ? '' : ` (~${formatUsd(cost)})`
    const advice = compactAdvice(await read($, history), time, await read($, compactStats))
    const tip = advice === null ? '' : ` Or compact now (~${formatUsd(advice.compactNow)}) and come back for ~${formatUsd(advice.backCold)}.`
    await say($, `Cache cools in ${formatMinutes(left)}. Send a message to keep ${formatTokens(contextTokens(last))} tokens warm; otherwise the next one rewrites them${price}.${tip}`)
  }

  const baseline = await read($, toolBaseline)
  if (baseline === null) return

  const change = diffServers(baseline, await currentServers($))
  await update($, toolChange, () => change)

  const key = change === null ? undefined : `${last.at}:${formatChange(change)}`
  if (change !== null && left > 0 && left < TTL_MS[last.ttl] && key !== warnedChange) {
    warnedChange = key
    const cost = promptCost(last.model, contextTokens(last), 0, last.ttl)
    const price = cost === null ? '' : ` (~${formatUsd(cost)})`
    $.ui.toast(`MCP servers changed (${formatChange(change)}): the next message likely rewrites the cache${price}.`)
  }
}

// A system notification where the host sends one (terminal apps); elsewhere a
// toast that stays for a minute, so it is still there on return.
async function say($: EngineInterface, text: string) {
  try {
    const sent = await $.ui.notify(text, { title: 'contextwatch' })
    if (sent.isSent) return
  } catch {
    // Fall through to the toast.
  }
  $.ui.toast(text, { timeoutMs: 60_000 })
}

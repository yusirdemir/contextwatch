import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { COMPACT_MIN_TOKENS, compactAdvice } from './core/compact'
import { contextTokens, formatTokens } from './core/metrics'
import { formatUsd, modelLabel, promptCost } from './core/pricing'
import { diffServers, formatChange } from './core/tools'
import { formatMinutes, remainingMs, TTL_MS } from './core/ttl'
import { formatImpact } from './core/usage'
import type { Options } from './options'
import { currentServers } from './sources/tools'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const toolBaseline = atom({ plugin: 'contextwatch', key: 'toolBaseline' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

// Asks before a model switch that would throw away a warm cache for more
// than the configured amount. The engine prices the rewrite itself.
//
// Not registered at all when turned off (0): where an organization's policy
// plugin decides model switches itself, the hook would only ever be skipped,
// and the session would say so on every switch.
export function guardModelSwitch(on: On, options: Options) {
  if (options.confirmSwitchUsd <= 0) return

  on('classic.PreModelSwitch', async ($, e, next) => {
    const isCostly = e.prompt_cache_warm && e.estimated_cache_write_usd >= options.confirmSwitchUsd
    if (!isCostly) return next(e)

    const last = (await read($, history)).at(-1)
    const left = last === undefined ? '' : ` The ${modelLabel(e.from_model)} cache has ${formatMinutes(remainingMs(last, await $.clock.now()))} left.`
    const impact = formatImpact(e.estimated_cache_write_usd, await read($, limits), await read($, calibration)) ?? `~${formatUsd(e.estimated_cache_write_usd)}`

    return {
      permissionDecision: 'ask' as const,
      permissionDecisionReason: `Switching to ${modelLabel(e.to_model)} rewrites ${formatTokens(e.context_tokens)} tokens of context (${impact}).${left}`,
    }
  }).catch(($, e, next) => next(e))
}

export const SEND = 'Send anyway'
export const COMPACT_FIRST = 'Compact, then send'
export const START_FRESH = 'Start fresh, then send'

let askedFor: number | undefined

// Before a message goes into a large cold cache, offers the cheaper ways in:
// compact first (the summary is small to rewrite) or start from a clear
// conversation. Asked once per cold spell; slash commands pass untouched.
export function guardColdSend(on: On, options: Options) {
  on('prompt.submit', async ($, e, next) => {
    if (!options.askWhenCold || e.command !== undefined || e.isMeta === true) return next(e)

    const last = (await read($, history)).at(-1)
    const time = await $.clock.now()
    if (last === undefined || remainingMs(last, time) > 0 || askedFor === last.at) return next(e)

    const context = contextTokens(last)
    if (context < COMPACT_MIN_TOKENS) return next(e)

    askedFor = last.at
    const impact = formatImpact(promptCost(last.model, context, 0, last.ttl), await read($, limits), await read($, calibration))
    const question = `The cache is cold: this message rewrites ${formatTokens(context)} tokens${impact === null ? '' : ` (${impact})`}. How should it go?`

    let answer: string
    try {
      answer = await $.ui.ask(question, { options: [SEND, COMPACT_FIRST, START_FRESH], header: 'Cold cache' })
    } catch {
      // Dismissed: keep the message for later instead of sending it.
      await $.prompt.fill({ text: e.text })

      return { drop: 'Not sent; your message is back in the prompt.' }
    }

    if (answer !== COMPACT_FIRST && answer !== START_FRESH) return next(e)

    // Compacting or clearing would wait on the turn this hook holds, so the
    // message steps aside, the action runs right after, and the message follows.
    $.clock.after(0, () => void sendAfter($, answer, e.text))

    return { drop: answer === COMPACT_FIRST ? 'Compacting first; your message follows.' : 'Starting fresh; your message follows.' }
  }).catch(($, e, next) => next(e))
}

async function sendAfter($: EngineInterface, answer: string, text: string) {
  try {
    if (answer === COMPACT_FIRST) await $.session.compact()
    else await $.command.run({ command: 'clear' })
  } catch {
    // The message still goes; the person can compact or clear by hand.
  }
  await $.prompt.submit({ text, asUser: true })
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
    const windows = await read($, limits)
    const cal = await read($, calibration)
    const cold = formatImpact(promptCost(last.model, contextTokens(last), 0, last.ttl), windows, cal)
    const price = cold === null ? '' : ` (${cold})`
    const advice = compactAdvice(await read($, history), time, await read($, compactStats))
    const back = advice === null ? null : formatImpact(advice.backCold, windows, cal)
    const tip = advice === null ? '' : back === null ? ' Or compact now, while it is cheap.' : ` Or compact now and come back for ${back}.`
    await say($, `Cache cools in ${formatMinutes(left)}. Send a message to keep ${formatTokens(contextTokens(last))} tokens warm; otherwise the next one rewrites them${price}.${tip}`)
  }

  const baseline = await read($, toolBaseline)
  if (baseline === null) return

  const change = diffServers(baseline, await currentServers($))
  await update($, toolChange, () => change)

  const key = change === null ? undefined : `${last.at}:${formatChange(change)}`
  if (change !== null && left > 0 && left < TTL_MS[last.ttl] && key !== warnedChange) {
    warnedChange = key
    const impact = formatImpact(promptCost(last.model, contextTokens(last), 0, last.ttl), await read($, limits), await read($, calibration))
    const price = impact === null ? '' : ` (${impact})`
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

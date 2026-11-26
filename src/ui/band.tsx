import type { Color, On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Alert, Calibration, CompactStats, Limits, Snapshot, ToolChange } from '../../types'
import { alertKey, isFresh } from '../core/alert'
import { compactAdvice } from '../core/compact'
import { floorCost, stayCost, switchOptions } from '../core/forecast'
import { contextTokens, formatTokens } from '../core/metrics'
import { isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, warmth } from '../core/ttl'
import { formatImpact } from '../core/usage'
import { compactNow } from '../sources/compact'
import { COLOR, DOT } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null, samples: [] })
const alert = atom({ plugin: 'contextwatch', key: 'alert' } as const, null)

// `tip` is the quiet suggestion drawn after the line; `canCompact` adds its button.
type Line = { dot: string; color: Color; words: string; tip?: string; canCompact?: boolean }

type Inputs = {
  list: Snapshot[]
  time: number
  model: string | null
  change: ToolChange | null
  stats: CompactStats | null
  windows: Limits | null
  cal: Calibration
  seen: Alert | null
}

// One quiet line above the prompt: all contextwatch draws. A model switch or
// MCP change takes its place for a moment, then the usual line comes back.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const line = lineFor({
      list,
      time: await read($, now),
      model: await read($, activeModel),
      change: await read($, toolChange),
      stats: await read($, compactStats),
      windows: await read($, limits),
      cal: await read($, calibration),
      seen: await read($, alert),
    })
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={line.color}>{line.dot} </Text>
        <Text dimColor>{line.words} </Text>
        {line.tip !== undefined && <Text color="inactive">· {line.tip} </Text>}
        {line.canCompact === true && (
          <Button key="compact" label="Compact" dimColor variant="secondary" onPress={() => compactNow($)} />
        )}
      </Box>
    )
  })
}

// " +6%" straight after the words it measures.
const after = (impact: string | null) => (impact === null ? '' : ` ${impact}`)

const lineFor = ({ list, time, model, change, stats, windows, cal, seen }: Inputs): Line => {
  const last = list.at(-1)!
  const state = warmth(last, time)
  const tokens = formatTokens(contextTokens(last))
  const coldUsd = stayCost(list, time).cold
  const cold = formatImpact(coldUsd, windows, cal)
  const isSwitched = state !== 'cold' && model !== null && !isSameModel(model, last.model)
  const switchUsd = isSwitched ? (switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null) : null
  const isAlerting = isFresh(seen, alertKey(last, time, model, change), time)

  if (isAlerting && isSwitched) {
    return { dot: '●', color: 'warning', words: `Switched to ${modelLabel(model)} · cache rewrite${after(formatImpact(switchUsd, windows, cal))}` }
  }

  if (isAlerting && change !== null) {
    return { dot: '●', color: 'warning', words: `MCP changed (${formatChange(change)}) · likely cache rewrite${after(cold)}` }
  }

  // A figure only for what is true now: a cold cache costs the next message.
  if (state === 'cold') {
    return { dot: DOT.cold, color: COLOR.cold, words: `Cache cold · next message rewrites ${tokens}${cold === null ? '' : ` (${cold})`}` }
  }

  // What the next message adds. After a switch or an MCP change it rewrites
  // the cache; otherwise the context is read from it and the last answer written.
  const nextUsd = isSwitched ? switchUsd : change !== null ? coldUsd : floorCost(list, time)
  const nextImpact = formatImpact(nextUsd, windows, cal)
  const cost = nextImpact === null ? '' : ` · next message ${nextImpact}`
  const words = `Cache ${state === 'cooling' ? 'cooling' : 'warm'} · ${formatMinutes(remainingMs(last, time))}${cost}`

  // Cooling is the moment to compact: reading the context is still cheap.
  const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null
  if (advice !== null) {
    return { dot: DOT[state], color: COLOR[state], words, tip: 'Leaving? Compact first', canCompact: true }
  }

  return { dot: DOT[state], color: COLOR[state], words }
}

import type { Color, On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Calibration, CompactStats, Limits, Snapshot, ToolChange } from '../../types'
import { compactAdvice } from '../core/compact'
import { floorCost, stayCost, switchOptions } from '../core/forecast'
import { contextTokens, formatTokens } from '../core/metrics'
import { isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, warmth } from '../core/ttl'
import { formatImpact } from '../core/usage'
import { compactNow } from '../sources/compact'
import { openPane } from './pane'
import { COLOR, DOT } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null, samples: [] })
const draftTokens = atom({ plugin: 'contextwatch', key: 'draftTokens' } as const, 0)

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
  draft: number
}

// One quiet line above the prompt with the Details button. An alert that
// needs a decision before sending (a model switch, an MCP change) takes its place.
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
      draft: await read($, draftTokens),
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
        <Button key="details" label="Details" onPress={() => openPane($)} />
      </Box>
    )
  })
}

// " +6%" straight after the words it measures.
const after = (impact: string | null) => (impact === null ? '' : ` ${impact}`)

const lineFor = ({ list, time, model, change, stats, windows, cal, draft }: Inputs): Line => {
  const last = list.at(-1)!
  const state = warmth(last, time)
  const tokens = formatTokens(contextTokens(last))
  const cold = formatImpact(stayCost(list, time).cold, windows, cal)

  if (state !== 'cold' && model !== null && !isSameModel(model, last.model)) {
    const cost = switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null

    return { dot: '●', color: 'warning', words: `Switched to ${modelLabel(model)} · cache rewrite${after(formatImpact(cost, windows, cal))}` }
  }

  if (state !== 'cold' && change !== null) {
    return { dot: '●', color: 'warning', words: `MCP changed (${formatChange(change)}) · likely cache rewrite${after(cold)}` }
  }

  // A figure only for what is true now: a cold cache costs the next message.
  if (state === 'cold') {
    return { dot: DOT.cold, color: COLOR.cold, words: `Cache cold · next message rewrites ${tokens}${cold === null ? '' : ` (${cold})`}` }
  }

  // What the next message adds: the context read from the cache, the last
  // answer and the message being typed written.
  const next = formatImpact(floorCost(list, time, draft), windows, cal)
  const cost = next === null ? '' : ` · next message ${next}`
  const words = `Cache ${state === 'cooling' ? 'cooling' : 'warm'} · ${formatMinutes(remainingMs(last, time))}${cost}`

  // Cooling is the moment to compact: reading the context is still cheap.
  const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null
  if (advice !== null) {
    return { dot: DOT[state], color: COLOR[state], words, tip: 'Leaving? Compact first', canCompact: true }
  }

  return { dot: DOT[state], color: COLOR[state], words }
}

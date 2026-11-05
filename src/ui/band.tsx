import type { Color, On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { CompactStats, Snapshot, ToolChange } from '../../types'
import { compactAdvice } from '../core/compact'
import { stayCost, switchOptions } from '../core/forecast'
import { contextTokens, formatTokens } from '../core/metrics'
import { formatUsd, isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, warmth } from '../core/ttl'
import { compactNow } from '../sources/compact'
import { openPane } from './pane'
import { COLOR, DOT } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)

// `tip` is the quiet suggestion drawn after the line; `canCompact` adds its button.
type Line = { dot: string; color: Color; words: string; tip?: string; canCompact?: boolean }

// One quiet line above the prompt with the Details button. An alert that
// needs a decision before sending (a model switch, an MCP change) takes its place.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const line = lineFor(list, await read($, now), await read($, activeModel), await read($, toolChange), await read($, compactStats))
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

const price = (cost: number | null) => (cost === null ? '' : ` ~${formatUsd(cost)}`)

const lineFor = (
  list: Snapshot[],
  time: number,
  model: string | null,
  change: ToolChange | null,
  stats: CompactStats | null,
): Line => {
  const last = list.at(-1)!
  const state = warmth(last, time)
  const tokens = formatTokens(contextTokens(last))
  const cost = stayCost(list, time)

  if (state !== 'cold' && model !== null && !isSameModel(model, last.model)) {
    const switchCost = switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null

    return { dot: '●', color: 'warning', words: `Switched to ${modelLabel(model)} · cache rewrite ${tokens} tokens${price(switchCost)}` }
  }

  if (state !== 'cold' && change !== null) {
    return { dot: '●', color: 'warning', words: `MCP servers changed (${formatChange(change)}) · likely cache rewrite${price(cost.cold)}` }
  }

  if (state === 'cold') {
    return { dot: DOT.cold, color: COLOR.cold, words: `Cache cold · rewrite ${tokens} tokens${price(cost.cold)}` }
  }

  const readPart = cost.warm === null ? '' : ` · cache read${price(cost.warm)}`
  const coldPart = cost.cold === null ? '' : ` · cold${price(cost.cold)}`

  const words = `Cache ${formatMinutes(remainingMs(last, time))} left${readPart}${coldPart}`

  // Cooling is the moment to compact: reading the context is still cheap.
  const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null
  if (advice !== null) {
    return {
      dot: DOT[state],
      color: COLOR[state],
      words,
      tip: `Leaving? Compact now${price(advice.compactNow)}, come back for${price(advice.backCold)}`,
      canCompact: true,
    }
  }

  return { dot: DOT[state], color: COLOR[state], words }
}

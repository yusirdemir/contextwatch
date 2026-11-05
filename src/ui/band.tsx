import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { stayCost, switchOptions } from '../core/forecast'
import { contextTokens, formatTokens } from '../core/metrics'
import { formatUsd, isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, warmth } from '../core/ttl'
import { openPane } from './pane'
import { COLOR, DOT } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)

// One quiet line above the prompt.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    const last = list.at(-1)
    if (e.props.hasSurvey || last === undefined) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const time = await read($, now)
    const model = await read($, activeModel)
    const change = await read($, toolChange)
    const state = warmth(last, time)
    const tokens = formatTokens(contextTokens(last))
    const words = describe()

    return (
      <Box>
        <Text color={COLOR[state]}>{DOT[state]} </Text>
        <Text dimColor>{words} </Text>
        <Button key="details" label="Details" onPress={() => openPane($)} />
      </Box>
    )

    function describe(): string {
      const isSwitched = model !== null && last !== undefined && !isSameModel(model, last.model)
      if (isSwitched) {
        const option = switchOptions(list, time).find(o => isSameModel(o.model, model))
        const cost = option?.cost ?? null
        const price = cost === null ? '' : ` ~${formatUsd(cost)}`

        return `Switched to ${modelLabel(model)} · cache rewrite ${tokens} tokens${price}`
      }

      const cost = stayCost(list, time)
      const rewrite = cost.cold === null ? '' : ` ~${formatUsd(cost.cold)}`
      if (state === 'cold') return `Cache cold · rewrite ${tokens} tokens${rewrite}`
      if (change !== null) return `MCP servers changed (${formatChange(change)}) · likely cache rewrite${rewrite}`

      const readPart = cost.warm === null ? '' : ` · cache read ~${formatUsd(cost.warm)}`
      const cold = cost.cold === null ? '' : ` · cold${rewrite}`

      return `Cache ${formatMinutes(remainingMs(last!, time))} left${readPart}${cold}`
    }
  })
}

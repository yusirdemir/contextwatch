import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import type { Snapshot, ToolChange } from '../../types'
import { stayCost, switchOptions } from '../core/forecast'
import { contextTokens, formatTokens } from '../core/metrics'
import { formatUsd, isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { warmth } from '../core/ttl'
import { openPane } from './pane'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)

// The line above the prompt appears only for what needs a decision before
// sending: a model switch or an MCP change that will rewrite a warm cache.
// Everything else lives in the status line and the pane.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    if (e.props.hasSurvey) return next(e)

    const words = alertFor(list, await read($, now), await read($, activeModel), await read($, toolChange))
    if (words === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="warning">● </Text>
        <Text dimColor>{words} </Text>
        <Button key="details" label="Details" onPress={() => openPane($)} />
      </Box>
    )
  })
}

const alertFor = (list: Snapshot[], time: number, model: string | null, change: ToolChange | null): string | null => {
  const last = list.at(-1)
  if (last === undefined || warmth(last, time) === 'cold') return null

  const tokens = formatTokens(contextTokens(last))

  if (model !== null && !isSameModel(model, last.model)) {
    const cost = switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null
    const price = cost === null ? '' : ` ~${formatUsd(cost)}`

    return `Switched to ${modelLabel(model)} · cache rewrite ${tokens} tokens${price}`
  }

  if (change !== null) {
    const cost = stayCost(list, time).cold
    const price = cost === null ? '' : ` ~${formatUsd(cost)}`

    return `MCP servers changed (${formatChange(change)}) · likely cache rewrite${price}`
  }

  return null
}

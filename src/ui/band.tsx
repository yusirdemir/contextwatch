import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { formatClock, remainingMs, warmth } from '../core/ttl'
import { openPane } from './pane'
import { COLOR, DOT } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

// One quiet line above the prompt.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const last = (await read($, history)).at(-1)
    if (e.props.hasSurvey || last === undefined) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const time = await read($, now)
    const state = warmth(last, time)
    const tokens = formatTokens(contextTokens(last))
    const words =
      state === 'cold'
        ? `Cache cold · next message sends ${tokens} tokens at full cost`
        : `Cache ${formatClock(remainingMs(last, time))} left · ${formatPercent(hitRate(last))} hit · ${tokens} context`

    return (
      <Box>
        <Text color={COLOR[state]}>{DOT[state]} </Text>
        <Text dimColor>{words} </Text>
        <Button key="details" label="Details" onPress={() => openPane($)} />
      </Box>
    )
  })
}

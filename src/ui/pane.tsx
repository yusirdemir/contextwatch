import type { EngineInterface, On } from 'claude-code'
import { atom, read } from 'claude-code'

import { cacheDropped, contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { formatAgo, formatClock, remainingMs, ttlLabel, warmth } from '../core/ttl'
import { COLOR, DOT, LABEL } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

export const PANE = 'contextwatch'

const RECENT = 8

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Context' })
}

// The detail pane beside the chat.
export function registerPane(on: On) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, history)
    const last = list.at(-1)

    if (last === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Waiting for the first response of this session.</Text>
        </Box>
      )
    }

    const time = await read($, now)
    const state = warmth(last, time)
    const left = remainingMs(last, time)
    const ttlNote = last.ttlSource === 'observed' ? 'seen in this session' : 'assumed'

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={COLOR[state]}>{DOT[state]} </Text>
          <Text weight="medium">{LABEL[state]}</Text>
        </Box>
        <Text size="title" mono>
          {state === 'cold' ? '0:00' : formatClock(left)}
        </Text>
        <Text dimColor>
          TTL {ttlLabel(last.ttl)} ({ttlNote})
        </Text>
        <Text> </Text>
        {[
          ['Hit rate', formatPercent(hitRate(last))],
          ['Context', `${formatTokens(contextTokens(last))} tokens`],
          ['Last response', formatAgo(time - last.at)],
          ['Model', last.model],
        ].map(([label, value]) => (
          <Box>
            <Text dimColor>{(label ?? '').padEnd(15)}</Text>
            <Text>{value}</Text>
          </Box>
        ))}
        <Text> </Text>
        <Text weight="medium">Recent responses</Text>
        {list
          .slice(-RECENT)
          .reverse()
          .map(s => (
            <Text dimColor={!cacheDropped(s)} color={cacheDropped(s) ? 'warning' : undefined}>
              {formatAgo(time - s.at).padEnd(10)} {formatPercent(hitRate(s)).padStart(4)} hit ·{' '}
              {formatTokens(s.cacheReadTokens)} read · {formatTokens(s.cacheCreationTokens)} written
            </Text>
          ))}
        <Text> </Text>
        <Text dimColor>An estimate: the server may evict early. The next response confirms.</Text>
      </Box>
    )
  })
}

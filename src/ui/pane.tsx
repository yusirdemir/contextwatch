import type { EngineInterface, On } from 'claude-code'
import { atom, read } from 'claude-code'

import { stayCost, switchOptions } from '../core/forecast'
import { cacheDropped, contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { formatUsd, modelLabel, PRICES_AS_OF } from '../core/pricing'
import { formatAgo, formatMinutes, remainingMs, TTL_MS, ttlLabel, warmth } from '../core/ttl'
import { barSvg, barText, INK, sparklineSvg, sparklineText } from './charts'
import { COLOR, DOT, INK_OF, LABEL } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const sessionUsd = atom({ plugin: 'contextwatch', key: 'sessionUsd' } as const, null)

export const PANE = 'contextwatch'

const LABEL_WIDTH = '42%'

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Context' })
}

// The detail pane beside the chat.
export function registerPane(on: On) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
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
    const total = await read($, sessionUsd)
    const state = warmth(last, time)
    const left = remainingMs(last, time)
    const ttlNote = last.ttlSource === 'observed' ? 'seen in this session' : 'assumed'
    const stay = stayCost(list, time)
    const options = switchOptions(list, time)
    const costs = options.map(o => o.cost ?? 0).concat(stay.cold ?? 0)
    const maxCost = Math.max(...costs, 0.000001)
    const trend = list.map(contextTokens)
    const misses = list.flatMap((s, i) => (i > 0 && cacheDropped(s) ? [i] : []))

    // A bar: an SVG where the surface draws one, blocks of text elsewhere.
    const bar = (key: string, fraction: number, ink: string) =>
      'Svg' in els ? (
        <els.Svg key={key} source={barSvg(fraction, ink)} alt={`${Math.round(fraction * 100)}%`} width={120} height={6} />
      ) : (
        <Text dimColor>{barText(fraction)}</Text>
      )

    const row = (key: string, label: string, value: string, extra?: unknown) => (
      <Box key={key} flexDirection="row" alignItems="center">
        <Box width={LABEL_WIDTH}>
          <Text dimColor>{label}</Text>
        </Box>
        <Box width="22%">
          <Text>{value}</Text>
        </Box>
        {extra as never}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box>
            <Text color={COLOR[state]}>{DOT[state]} </Text>
            <Text weight="medium">{LABEL[state]}</Text>
          </Box>
          <Text size="title" weight="semibold">
            {state === 'cold' ? 'Cache cold' : `${formatMinutes(left)} left`}
          </Text>
          <Text dimColor>
            TTL {ttlLabel(last.ttl)} · {ttlNote}
          </Text>
          {bar('ttl', left / TTL_MS[last.ttl], INK_OF[state])}
        </Box>

        <Box flexDirection="column">
          <Text weight="medium">Next message</Text>
          {stay.warm !== null &&
            row('warm', `Stay on ${modelLabel(last.model)}`, formatUsd(stay.warm), bar('b-warm', stay.warm / maxCost, INK.warm))}
          {stay.cold !== null &&
            row('cold', 'If the cache is cold', formatUsd(stay.cold), bar('b-cold', stay.cold / maxCost, INK.muted))}
          <Text dimColor size="caption">
            For the {formatTokens(contextTokens(last))} tokens of context; your message and the answer come on top.
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text weight="medium">Switch model</Text>
          {options
            .filter(o => !o.isCurrent)
            .map(o =>
              row(
                o.model,
                `${o.label}${o.warmMs > 0 ? ` · warm ${formatMinutes(o.warmMs)}` : ''}`,
                o.cost === null ? '—' : formatUsd(o.cost),
                o.cost === null ? undefined : bar(`b-${o.model}`, o.cost / maxCost, o.warmMs > 0 ? INK.warm : INK.muted),
              ),
            )}
          <Text dimColor size="caption">
            Each model keeps its own cache, so the first message after a switch writes the context again.
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text weight="medium">This session</Text>
          {list.length > 1 &&
            ('Svg' in els ? (
              <els.Svg
                key="trend"
                source={sparklineSvg(trend, misses)}
                alt={`Context grew from ${formatTokens(trend[0] ?? 0)} to ${formatTokens(trend.at(-1) ?? 0)} tokens; ${misses.length} cache misses`}
                width={260}
                height={44}
              />
            ) : (
              <Text dimColor>{sparklineText(trend)}</Text>
            ))}
          {row('ctx', 'Context', `${formatTokens(contextTokens(last))} tokens`)}
          {row('hit', 'Hit rate', formatPercent(hitRate(last)))}
          {row('misses', 'Cache misses', String(misses.length))}
          {total !== null && row('total', 'Session cost', formatUsd(total))}
          {row('last', 'Last response', formatAgo(time - last.at))}
        </Box>

        <Text dimColor size="caption">
          Estimates from Anthropic list prices ({PRICES_AS_OF}). On a subscription these are the API equivalent, not a bill. The server may evict a cache early.
        </Text>
      </Box>
    )
  })
}

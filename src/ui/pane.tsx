import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { compactAdvice } from '../core/compact'
import { stayCost, switchOptions } from '../core/forecast'
import { cacheDropped, contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { formatUsd, isSameModel, modelLabel, PRICES_AS_OF } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, TTL_MS, ttlLabel, warmth } from '../core/ttl'
import { compactNow } from '../sources/compact'
import { barSvg, barText } from './charts'
import { COLOR, DOT, INK_OF, LABEL } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const sessionUsd = atom({ plugin: 'contextwatch', key: 'sessionUsd' } as const, null)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const showModels = atom({ plugin: 'contextwatch', key: 'showModels' } as const, false)

export const PANE = 'contextwatch'

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Context' })
}

// The pane beside the chat: one number that matters, what the next message
// costs, and at most one suggestion. The model comparison opens on request.
export function registerPane(on: On) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const list = await read($, history)
    const last = list.at(-1)

    if (last === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>The countdown starts after the first response.</Text>
        </Box>
      )
    }

    const time = await read($, now)
    const total = await read($, sessionUsd)
    const model = await read($, activeModel)
    const change = await read($, toolChange)
    const stats = await read($, compactStats)
    const isOpen = await read($, showModels)

    const state = warmth(last, time)
    const left = remainingMs(last, time)
    const stay = stayCost(list, time)
    const misses = list.filter((s, i) => i > 0 && cacheDropped(s)).length
    const isSwitched = model !== null && !isSameModel(model, last.model)
    const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null

    const progress =
      'Svg' in els ? (
        <els.Svg
          key="ttl"
          source={barSvg(left / TTL_MS[last.ttl], INK_OF[state], 280, 4)}
          alt={`${formatMinutes(left)} of ${ttlLabel(last.ttl)}`}
          width={280}
          height={4}
        />
      ) : (
        <Text color={COLOR[state]}>{barText(left / TTL_MS[last.ttl], 24)}</Text>
      )

    // A figure with its label beneath, side by side with the other.
    const figure = (key: string, value: string, label: string, isMuted: boolean) => (
      <Box key={key} flexDirection="column" width="50%">
        <Text size="heading" weight="semibold" dimColor={isMuted}>
          {value}
        </Text>
        <Text dimColor size="caption">
          {label}
        </Text>
      </Box>
    )

    const tip = (() => {
      if (state !== 'cold' && isSwitched) {
        const cost = switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null

        return (
          <Text color="warning">
            Switched to {modelLabel(model)}: the next message rewrites the cache{cost === null ? '' : ` (~${formatUsd(cost)})`}.
          </Text>
        )
      }
      if (state !== 'cold' && change !== null) {
        return <Text color="warning">MCP servers changed ({formatChange(change)}): the next message likely rewrites the cache.</Text>
      }
      if (advice !== null) {
        return (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>
              Stepping away? Compact now for {formatUsd(advice.compactNow)} and come back for {formatUsd(advice.backCold)} instead of{' '}
              {formatUsd(advice.stayCold)}.
            </Text>
            <Button key="compact" label={`Compact · saves ~${formatUsd(advice.saves)}`} variant="secondary" onPress={() => compactNow($)} />
          </Box>
        )
      }

      return null
    })()

    const models = isOpen
      ? switchOptions(list, time)
          .filter(o => !o.isCurrent)
          .map(o => (
            <Box key={o.model} flexDirection="row">
              <Box width="50%">
                <Text dimColor>
                  {o.label}
                  {o.warmMs > 0 ? ` · warm ${formatMinutes(o.warmMs)}` : ''}
                </Text>
              </Box>
              <Text>{o.cost === null ? '—' : formatUsd(o.cost)}</Text>
            </Box>
          ))
      : null

    const session = [
      `${formatTokens(contextTokens(last))} context`,
      `${formatPercent(hitRate(last))} hit`,
      misses === 1 ? '1 miss' : `${misses} misses`,
      ...(total === null ? [] : [`${formatUsd(total)} this session`]),
    ].join(' · ')

    return (
      <Box flexDirection="column" gap={2}>
        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={COLOR[state]}>{DOT[state]} </Text>
            <Text dimColor>
              {LABEL[state]} · {modelLabel(last.model)}
            </Text>
          </Box>
          <Text size="title" weight="semibold">
            {state === 'cold' ? 'Cold' : formatMinutes(left)}
          </Text>
          {progress}
          <Text dimColor size="caption">
            {state === 'cold'
              ? 'The next message rewrites the cache.'
              : `left of a ${ttlLabel(last.ttl)} cache${last.ttlSource === 'default' ? ' (assumed)' : ''}`}
          </Text>
        </Box>

        <Box flexDirection="column" gap={1}>
          <Text dimColor size="caption">
            NEXT MESSAGE
          </Text>
          <Box flexDirection="row">
            {state !== 'cold' && stay.warm !== null && figure('warm', formatUsd(stay.warm), 'now, from cache', false)}
            {stay.cold !== null &&
              figure('cold', formatUsd(stay.cold), state === 'cold' ? 'cache rewrite' : 'if it goes cold', state !== 'cold')}
          </Box>
        </Box>

        {tip}

        <Box flexDirection="column" gap={1}>
          <Button
            key="models"
            label={isOpen ? 'Hide other models' : 'Compare other models'}
            plain
            dimColor
            onPress={() => update($, showModels, v => !v)}
          />
          {models}
        </Box>

        <Box flexDirection="column">
          <Text dimColor size="caption">
            {session}
          </Text>
          <Text dimColor size="caption">
            List prices as of {PRICES_AS_OF}; on a subscription, the API equivalent.
          </Text>
        </Box>
      </Box>
    )
  })
}

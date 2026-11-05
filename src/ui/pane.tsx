import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Calibration, Limits, LimitWindow } from '../../types'
import { compactAdvice } from '../core/compact'
import { stayCost, switchOptions } from '../core/forecast'
import { cacheDropped, contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, TTL_MS, ttlLabel, warmth } from '../core/ttl'
import { formatImpact, formatPercentUsed, formatUntil } from '../core/usage'
import { compactNow } from '../sources/compact'
import { barSvg, barText, usageInk, usageSvg, usageText } from './charts'
import { COLOR, DOT, INK_OF, LABEL } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const showModels = atom({ plugin: 'contextwatch', key: 'showModels' } as const, false)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

export const PANE = 'contextwatch'

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Context' })
}

// The points of the 5-hour window `usd` moves, when the ratio is known.
const pointsOf = (usd: number | null, cal: Calibration): number => (usd === null || cal.percentPerUsd === null ? 0 : usd * cal.percentPerUsd)

// The pane beside the chat: how long the cache stays warm, how full the
// usage windows are and what a cold cache would add, and at most one suggestion.
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
    const model = await read($, activeModel)
    const change = await read($, toolChange)
    const stats = await read($, compactStats)
    const isOpen = await read($, showModels)
    const windows: Limits | null = await read($, limits)
    const cal = await read($, calibration)

    const state = warmth(last, time)
    const left = remainingMs(last, time)
    const coldUsd = stayCost(list, time).cold
    const coldImpact = formatImpact(coldUsd, windows, cal)
    const misses = list.filter((s, i) => i > 0 && cacheDropped(s)).length
    const isSwitched = model !== null && !isSameModel(model, last.model)
    const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null
    const isSvg = 'Svg' in els

    const progress = isSvg ? (
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

    // One usage window: its name, a bar, how full it is and when it resets.
    // The 5-hour bar shows what a cold cache would add, faint, past the fill.
    const usageRow = (key: string, name: string, w: LimitWindow, extra: number) => {
      const until = formatUntil(w.resetsAt, time)
      const used = w.percent / 100

      return (
        <Box key={key} flexDirection="column">
          <Box flexDirection="row">
            <Box width="50%">
              <Text>{name}</Text>
            </Box>
            <Text weight="semibold">{formatPercentUsed(w.percent)}</Text>
          </Box>
          {isSvg ? (
            <els.Svg
              key={`bar-${key}`}
              source={usageSvg(used, extra / 100, usageInk(w.percent))}
              alt={`${formatPercentUsed(w.percent)} used`}
              width={220}
              height={6}
            />
          ) : (
            <Text dimColor>{usageText(used, extra / 100)}</Text>
          )}
          {until !== null && (
            <Text dimColor size="caption">
              resets in {until}
            </Text>
          )}
        </Box>
      )
    }

    const usage = (() => {
      if (windows === null) {
        return coldImpact === null ? null : (
          <Text dimColor>If the cache goes cold, the next message costs {coldImpact}.</Text>
        )
      }

      const extra = state === 'cold' ? 0 : pointsOf(coldUsd, cal)

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor size="caption">
            USAGE
          </Text>
          {windows.fiveHour !== null && usageRow('five', '5-hour', windows.fiveHour, extra)}
          {windows.weekly !== null && usageRow('week', 'Weekly', windows.weekly, 0)}
          <Text dimColor size="caption">
            {coldImpact === null
              ? 'Learning how much a message moves your 5-hour window.'
              : state === 'cold'
                ? `The next message rewrites the cache: about ${coldImpact} of the 5-hour window.`
                : `If the cache goes cold, the next message adds about ${coldImpact} (the faint part).`}
          </Text>
        </Box>
      )
    })()

    const tip = (() => {
      if (state !== 'cold' && isSwitched) {
        const cost = switchOptions(list, time).find(o => isSameModel(o.model, model))?.cost ?? null
        const impact = formatImpact(cost, windows, cal)

        return (
          <Text color="warning">
            Switched to {modelLabel(model)}: the next message rewrites the cache{impact === null ? '' : ` (${impact})`}.
          </Text>
        )
      }
      if (state !== 'cold' && change !== null) {
        return <Text color="warning">MCP servers changed ({formatChange(change)}): the next message likely rewrites the cache.</Text>
      }
      if (advice !== null) {
        const back = formatImpact(advice.backCold, windows, cal)
        const stay = formatImpact(advice.stayCold, windows, cal)
        const words =
          back === null || stay === null
            ? 'Stepping away? Compact now, while reading the context is still cheap.'
            : `Stepping away? Compact now and come back for ${back} instead of ${stay}.`

        return (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>{words}</Text>
            <Button key="compact" label="Compact" variant="secondary" onPress={() => compactNow($)} />
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
              <Text>{formatImpact(o.cost, windows, cal) ?? '—'}</Text>
            </Box>
          ))
      : null

    const session = [
      `${formatTokens(contextTokens(last))} context`,
      `${formatPercent(hitRate(last))} hit`,
      misses === 1 ? '1 miss' : `${misses} misses`,
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

        {usage}

        {tip}

        <Box flexDirection="column" gap={1}>
          <Button
            key="models"
            label={isOpen ? 'Hide other models' : 'Compare other models'}
            plain
            dimColor
            onPress={() => update($, showModels, v => !v)}
          />
          {isOpen && (
            <Text dimColor size="caption">
              What the first message on each model would add.
            </Text>
          )}
          {models}
        </Box>

        <Text dimColor size="caption">
          {session}
        </Text>
      </Box>
    )
  })
}

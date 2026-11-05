import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Limits, LimitWindow } from '../../types'
import { compactAdvice } from '../core/compact'
import { nextBreakdown, switchOptions } from '../core/forecast'
import { cacheDropped, contextTokens, formatPercent, formatTokens, hitRate } from '../core/metrics'
import { isSameModel, modelLabel } from '../core/pricing'
import { formatChange } from '../core/tools'
import { formatMinutes, remainingMs, TTL_MS, ttlLabel, warmth } from '../core/ttl'
import { formatImpact, formatLanding, formatPercentUsed, formatUntil, pointsOf } from '../core/usage'
import { compactNow } from '../sources/compact'
import { barSvg, barText, INK, stackSvg, stackText, usageInk, usageSvg, usageText } from './charts'
import { COLOR, DOT, INK_OF, LABEL } from './theme'

const history = atom({ plugin: 'contextwatch', key: 'history' } as const, [])
const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const toolChange = atom({ plugin: 'contextwatch', key: 'toolChange' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)
const showModels = atom({ plugin: 'contextwatch', key: 'showModels' } as const, false)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null, samples: [] })
const draftTokens = atom({ plugin: 'contextwatch', key: 'draftTokens' } as const, 0)

export const PANE = 'contextwatch'

// The content stays this many cells wide at most and centres in a wider pane.
const CONTENT_CELLS = 56

export async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'Context' })
}

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
    const draft = await read($, draftTokens)

    const state = warmth(last, time)
    const left = remainingMs(last, time)
    const misses = list.filter((s, i) => i > 0 && cacheDropped(s)).length
    const isSwitched = model !== null && !isSameModel(model, last.model)
    const advice = state === 'cooling' ? compactAdvice(list, time, stats) : null
    const isSvg = 'Svg' in els

    const progress = isSvg ? (
      <els.Svg
        key="ttl"
        source={barSvg(left / TTL_MS[last.ttl], INK_OF[state], 1000, 4)}
        alt={`${formatMinutes(left)} of ${ttlLabel(last.ttl)}`}
        height={4}
      />
    ) : (
      <Text color={COLOR[state]}>{barText(left / TTL_MS[last.ttl], 24)}</Text>
    )

    // One usage window: its name, a bar, how full it is and when it resets.
    // The 5-hour bar shows what the next message adds, faint, past the fill.
    const usageRow = (key: string, name: string, w: LimitWindow, extra: number) => {
      const until = formatUntil(w.resetsAt, time)
      const used = w.percent / 100

      return (
        <Box key={key} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>{name}</Text>
            <Text weight="semibold">{formatPercentUsed(w.percent)}</Text>
          </Box>
          {isSvg ? (
            <els.Svg
              key={`bar-${key}`}
              source={usageSvg(used, extra / 100, usageInk(w.percent))}
              alt={`${formatPercentUsed(w.percent)} used`}
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

    // The next message as a card: the figure, where the 5-hour window lands,
    // and a bar of what it is made of (read from the cache, or written to it).
    const parts = nextBreakdown(list, time, draft)
    const next = formatImpact(parts?.total ?? null, windows, cal)
    const points = pointsOf(parts?.total ?? null, cal)
    const landing = windows?.fiveHour == null || points === null ? null : formatLanding(windows.fiveHour, points)

    const nextCard = (() => {
      if (parts === null) return null

      const whole = Math.max(parts.total, 1e-9)
      const segments = [
        { fraction: parts.readUsd / whole, color: INK.warm },
        { fraction: parts.writeUsd / whole, color: INK.cooling },
      ]
      const share = (usd: number) => `${Math.round((usd / whole) * 100)}%`
      const written = draft > 0 ? 'last answer + your message' : 'last answer'

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor size="caption">
            NEXT MESSAGE
          </Text>
          <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
            <Text size="heading" weight="semibold">
              {next ?? '…'}
            </Text>
            {landing !== null && <Text dimColor>{landing}</Text>}
          </Box>
          {isSvg ? (
            <els.Svg key="stack" source={stackSvg(segments)} alt={`${share(parts.readUsd)} read, ${share(parts.writeUsd)} written`} height={8} />
          ) : (
            <Text dimColor>{stackText(segments)}</Text>
          )}
          {parts.readTokens > 0 && (
            <Box flexDirection="row" justifyContent="space-between">
              <Text>
                <Text color="success">● </Text>
                <Text dimColor>{formatTokens(parts.readTokens)} read from cache</Text>
              </Text>
              <Text dimColor>{share(parts.readUsd)}</Text>
            </Box>
          )}
          <Box flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color="warning">● </Text>
              <Text dimColor>
                {formatTokens(parts.writeTokens)} written{state === 'cold' ? ', the whole context' : ` · ${written}`}
              </Text>
            </Text>
            <Text dimColor>{share(parts.writeUsd)}</Text>
          </Box>
          {next === null && (
            <Text dimColor size="caption">
              Learning how much a message moves your 5-hour window.
            </Text>
          )}
        </Box>
      )
    })()

    const usage =
      windows === null ? null : (
        <Box flexDirection="column" gap={1}>
          <Text dimColor size="caption">
            USAGE
          </Text>
          {windows.fiveHour !== null && usageRow('five', '5-hour', windows.fiveHour, points ?? 0)}
          {windows.weekly !== null && usageRow('week', 'Weekly', windows.weekly, 0)}
        </Box>
      )

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
        return (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>Stepping away? Compact now, while reading the context is still cheap.</Text>
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
            <Box key={o.model} flexDirection="row" justifyContent="space-between">
              <Text dimColor>
                {o.label}
                {o.warmMs > 0 ? ` · warm ${formatMinutes(o.warmMs)}` : ''}
              </Text>
              <Text>{formatImpact(o.cost, windows, cal) ?? '—'}</Text>
            </Box>
          ))
      : null

    const session = [
      `${formatTokens(contextTokens(last))} context`,
      `${formatPercent(hitRate(last))} hit`,
      misses === 1 ? '1 miss' : `${misses} misses`,
    ].join(' · ')

    const width = `${Math.min(100, Math.round((CONTENT_CELLS / Math.max(1, e.props.bodyColumns)) * 100))}%`

    return (
      <Box flexDirection="column" alignItems="center">
        <Box flexDirection="column" gap={2} width={width}>
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

        {nextCard}

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
      </Box>
    )
  })
}

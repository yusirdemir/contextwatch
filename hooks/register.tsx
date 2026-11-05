import type { EngineInterface, Register, Timer } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { answerCommand, registerCommand } from '../src/commands'
import { calibrate, parseLimits } from '../src/core/usage'
import { guardColdSend, guardModelSwitch, watchAway } from '../src/guards'
import type { Options } from '../src/options'
import { readOptions } from '../src/options'
import { watchCompactions } from '../src/sources/compact'
import { watchDraft } from '../src/sources/draft'
import { watchLive } from '../src/sources/live'
import { registerBand } from '../src/ui/band'
import { openPane, registerPane } from '../src/ui/pane'

const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const sessionUsd = atom({ plugin: 'contextwatch', key: 'sessionUsd' } as const, null)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)
const limits = atom({ plugin: 'contextwatch', key: 'limits' } as const, null)
const calibration = atom({ plugin: 'contextwatch', key: 'calibration' } as const, { anchor: null, percentPerUsd: null })

// The learned ratio outlives the session: the subscription's windows do not change with it.
const STORE_RATIO = 'percentPerUsd'

// Minutes are all the UI shows, so a slow tick keeps it calm.
const TICK_MS = 30_000

let ticker: Timer | undefined

export const register: Register = (on, raw) => {
  const options = readOptions(raw)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await registerCommand($)
    // The band says it all; clear a status line an older version pinned.
    $.ui.status(undefined)
    await loadRatio($)
    await tick($, options)
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void tick($, options))
    void openPane($)

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await tick($, options)

    return done
  })

  answerCommand(on)
  watchLive(on)
  watchCompactions(on)
  watchDraft(on)
  guardModelSwitch(on, options)
  guardColdSend(on, options)
  registerBand(on)
  registerPane(on)
}

// Moves the shared clock on and refreshes what the engine knows; the band
// and the pane redraw from it.
async function tick($: EngineInterface, options: Options) {
  const time = await $.clock.now()
  await update($, now, () => time)
  await refresh($)
  await watchAway($, options, time)
}

async function refresh($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    const usd = usage.cost?.usd ?? null
    const windows = parseLimits(usage.rateLimits)
    await update($, sessionUsd, () => usd)
    await update($, limits, () => windows)

    const before = await read($, calibration)
    const after = calibrate(before, usd, windows)
    await update($, calibration, () => after)
    if (after.percentPerUsd !== null && after.percentPerUsd !== before.percentPerUsd) {
      await $.store.set(STORE_RATIO, after.percentPerUsd)
    }
  } catch {
    // Hosts without a cost ledger or usage windows leave these out.
  }

  try {
    const model = await $.session.model()
    await update($, activeModel, () => model)
  } catch {
    // Without it the band cannot warn about a switch; nothing else depends on it.
  }
}

async function loadRatio($: EngineInterface) {
  try {
    const stored = await $.store.get(STORE_RATIO)
    if (typeof stored === 'number' && stored > 0) {
      await update($, calibration, cal => (cal.percentPerUsd === null ? { ...cal, percentPerUsd: stored } : cal))
    }
  } catch {
    // Without the store the ratio is learned again in this session.
  }
}

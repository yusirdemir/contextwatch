import type { EngineInterface, Register, Timer } from 'claude-code'
import { atom, update } from 'claude-code'

import { answerCommand, registerCommand } from '../src/commands'
import { guardModelSwitch, watchAway } from '../src/guards'
import type { Options } from '../src/options'
import { readOptions } from '../src/options'
import { watchCompactions } from '../src/sources/compact'
import { watchLive } from '../src/sources/live'
import { registerBand } from '../src/ui/band'
import { openPane, registerPane } from '../src/ui/pane'
import { showStatus } from '../src/ui/status'

const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)
const sessionUsd = atom({ plugin: 'contextwatch', key: 'sessionUsd' } as const, null)
const activeModel = atom({ plugin: 'contextwatch', key: 'activeModel' } as const, null)

// Minutes are all the UI shows, so a slow tick keeps it calm.
const TICK_MS = 30_000

let ticker: Timer | undefined

export const register: Register = (on, raw) => {
  const options = readOptions(raw)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await registerCommand($)
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
  guardModelSwitch(on, options)
  registerBand(on)
  registerPane(on)
}

// Moves the shared clock on and refreshes what the engine knows; the band,
// pane and status line redraw from it.
async function tick($: EngineInterface, options: Options) {
  const time = await $.clock.now()
  await update($, now, () => time)
  await refresh($)
  await watchAway($, options, time)
  await showStatus($)
}

async function refresh($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    const usd = usage.cost?.usd ?? null
    await update($, sessionUsd, () => usd)
  } catch {
    // Hosts without a cost ledger leave the total out.
  }

  try {
    const model = await $.session.model()
    await update($, activeModel, () => model)
  } catch {
    // Without it the band cannot warn about a switch; nothing else depends on it.
  }
}

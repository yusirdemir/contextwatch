import type { EngineInterface, Register, Timer } from 'claude-code'
import { atom, update } from 'claude-code'

import { answerCommand, registerCommand } from '../src/commands'
import { watchLive } from '../src/sources/live'
import { registerBand } from '../src/ui/band'
import { openPane, registerPane } from '../src/ui/pane'
import { showStatus } from '../src/ui/status'

const now = atom({ plugin: 'contextwatch', key: 'now' } as const, 0)

const TICK_MS = 1000

let ticker: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await registerCommand($)
    await tick($)
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void tick($))
    void openPane($)

    return started
  })

  answerCommand(on)
  watchLive(on)
  registerBand(on)
  registerPane(on)
}

// Moves the shared clock on; the band, pane and status line redraw from it.
async function tick($: EngineInterface) {
  const time = await $.clock.now()
  await update($, now, () => time)
  await showStatus($)
}

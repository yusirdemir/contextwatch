import type { Register } from 'claude-code'

import { answerCommand, registerCommand } from '../src/commands'
import { watchLive } from '../src/sources/live'
import { registerBand } from '../src/ui/band'
import { registerPane } from '../src/ui/pane'
import { showStatus } from '../src/ui/status'

// Wires the features together; each one lives in src/.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await registerCommand($)
    showStatus($, null)

    return started
  })

  answerCommand(on)
  watchLive(on)
  registerBand(on)
  registerPane(on)
}

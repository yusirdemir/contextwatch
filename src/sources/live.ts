import type { On } from 'claude-code'

// Live figures: turn.step's usage for each response, $.session.usage() for the window.
export function watchLive(on: On) {
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    // TODO: build a Snapshot from step.usage (TTL from the transcript) and store it.

    return step
  })
}

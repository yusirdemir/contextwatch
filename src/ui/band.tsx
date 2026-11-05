import type { On } from 'claude-code'

// The row above the prompt: countdown, colour by time left.
export function registerBand(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    // TODO: draw the countdown once there is a snapshot.
    return next(e)
  })
}

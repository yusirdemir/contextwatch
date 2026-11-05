import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { bucketTokens, estimateTokens } from '../core/tokens'

const draftTokens = atom({ plugin: 'contextwatch', key: 'draftTokens' } as const, 0)

// Follows the prompt box so the figure includes the message being typed.
// Writes only when the estimate crosses a step, so typing does not redraw
// the band on every key.
export function watchDraft(on: On) {
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    await keep($, edited.text)

    return edited
  })

  on('prompt.change', async ($, e, next) => {
    const changed = await next(e)
    await keep($, e.text)

    return changed
  })
}

async function keep($: EngineInterface, text: string) {
  const tokens = bucketTokens(estimateTokens(text))
  if ((await read($, draftTokens)) !== tokens) await update($, draftTokens, () => tokens)
}

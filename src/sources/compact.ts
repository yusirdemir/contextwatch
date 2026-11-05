import type { EngineInterface, On } from 'claude-code'
import { atom, update } from 'claude-code'

const lastCompactAt = atom({ plugin: 'contextwatch', key: 'lastCompactAt' } as const, null)
const compactStats = atom({ plugin: 'contextwatch', key: 'compactStats' } as const, null)

// Learns what compactions of the main conversation come to, and marks when
// one happened so the cache write after it is not reported as a miss.
export function watchCompactions(on: On) {
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.trigger === 'precompute' || result.skip !== undefined) return result

    const at = await $.clock.now()
    await update($, lastCompactAt, () => at)

    const after = result.tokensAfter
    if (after !== undefined) {
      await update($, compactStats, prev => ({
        tokensAfter: after,
        outputTokens: result.usage?.output_tokens ?? prev?.outputTokens ?? 10_000,
      }))
    }

    return result
  })
}

// The compaction asked for from the Compact button.
export async function compactNow($: EngineInterface) {
  await $.session.compact()
}

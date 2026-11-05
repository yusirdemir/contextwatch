import type { EngineInterface } from 'claude-code'

import type { Snapshot } from '../../types'

export function showStatus($: EngineInterface, snapshot: Snapshot | null) {
  // TODO: "cache 47:12 · hit 98% · 113k" once a snapshot exists.
  $.ui.status(snapshot === null ? 'contextwatch · ready' : 'contextwatch')
}

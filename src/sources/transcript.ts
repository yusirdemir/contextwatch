import type { Ttl } from '../../types'

// What the session's .jsonl transcript adds to the live figures.
export type TranscriptFacts = {
  ttl: Ttl | null
  shapeHash: string | null
  lastCompactAt: number | null
}

// Reads ~/.claude/projects/<project>/<sessionId>.jsonl from the end.
export const readTranscriptFacts = async (_path: string): Promise<TranscriptFacts> => {
  // TODO: last assistant usage.cache_creation.ephemeral_{1h,5m}_input_tokens,
  // last api-request shapeHash, last compact_boundary timestamp.
  return { ttl: null, shapeHash: null, lastCompactAt: null }
}

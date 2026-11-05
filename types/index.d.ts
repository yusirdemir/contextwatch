// The values contextwatch keeps in $.state.

export type Ttl = '5m' | '1h'

// How the TTL was settled: assumed, or seen in the responses themselves.
export type TtlSource = 'default' | 'observed'

// One main-thread API response.
export type Snapshot = {
  at: number
  model: string
  ttl: Ttl
  ttlSource: TtlSource
  inputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  outputTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    contextwatch: {
      history: Snapshot[]
      now: number
      // The session's total as Claude Code prices it; null where none is kept.
      sessionUsd: number | null
      // The model the next message goes to; null before it is known.
      activeModel: string | null
    }
  }
}

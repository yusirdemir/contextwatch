// The values contextwatch keeps in $.state.

export type Ttl = '5m' | '1h'

// One main-thread API response, as the mod sees it.
export type Snapshot = {
  at: number
  ttl: Ttl
  inputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    contextwatch: { last: Snapshot | null }
  }
}

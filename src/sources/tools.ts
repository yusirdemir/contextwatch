import type { EngineInterface } from 'claude-code'

import { serversOf } from '../core/tools'

// The MCP servers whose tools the model sees now; an empty list where the host keeps none.
export async function currentServers($: EngineInterface): Promise<string[]> {
  try {
    return serversOf(await $.tool.list())
  } catch {
    return []
  }
}

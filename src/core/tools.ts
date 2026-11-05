import type { ToolChange } from '../../types'

// "mcp__github__create_issue" → "github".
export const serverOf = (toolName: string): string | null => {
  const match = /^mcp__(.+?)__/.exec(toolName)

  return match?.[1] ?? null
}

// The MCP servers behind a tool list, sorted and unique.
export const serversOf = (tools: readonly { name: string; mcp: boolean }[]): string[] =>
  [...new Set(tools.filter(t => t.mcp).flatMap(t => serverOf(t.name) ?? []))].sort()

export const diffServers = (before: readonly string[], after: readonly string[]): ToolChange | null => {
  const added = after.filter(s => !before.includes(s))
  const removed = before.filter(s => !after.includes(s))

  return added.length === 0 && removed.length === 0 ? null : { added, removed }
}

// "+github −slack".
export const formatChange = (change: ToolChange): string =>
  [...change.added.map(s => `+${s}`), ...change.removed.map(s => `−${s}`)].join(' ')

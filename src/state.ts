import { atom } from 'claude-code'

export const last = atom({ plugin: 'contextwatch', key: 'last' } as const, null)

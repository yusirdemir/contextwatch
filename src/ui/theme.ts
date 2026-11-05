import type { Color } from 'claude-code'

import type { Warmth } from '../core/ttl'
import { INK } from './charts'

// Theme keys, so colours follow the person's light or dark theme.
// Colour marks state only; everything else stays dim.
export const COLOR: Record<Warmth, Color> = { warm: 'success', cooling: 'warning', cold: 'inactive' }

export const INK_OF: Record<Warmth, string> = { warm: INK.warm, cooling: INK.cooling, cold: INK.muted }

export const DOT: Record<Warmth, string> = { warm: '●', cooling: '●', cold: '○' }

export const LABEL: Record<Warmth, string> = { warm: 'Warm', cooling: 'Cooling', cold: 'Cold' }

import type { Color } from 'claude-code'

import type { Warmth } from '../core/ttl'

// Theme keys, so colours follow the person's light or dark theme.
// Colour marks state only; everything else stays dim.
export const COLOR: Record<Warmth, Color> = { warm: 'success', cooling: 'warning', cold: 'inactive' }

export const DOT: Record<Warmth, string> = { warm: '●', cooling: '●', cold: '○' }

export const LABEL: Record<Warmth, string> = { warm: 'Warm', cooling: 'Cooling', cold: 'Cold' }

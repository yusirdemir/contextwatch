// A small SVG bar for surfaces that draw SVG, and its text form for the terminal. The colours are mid-tones
// that read on light and dark backgrounds alike; an SVG cannot use theme keys.

export const INK = { track: '#8b8b8b', warm: '#3fb950', cooling: '#d29922', muted: '#8b8b8b' } as const

const round = (n: number) => Math.round(n * 10) / 10

// A thin horizontal bar filled to `fraction` (0 to 1).
// Drawn wide and stretched: the surface narrows it to the slot, so it fills
// whatever width the pane has.
export const barSvg = (fraction: number, color: string, width = 1000, height = 6): string => {
  const fill = round(Math.max(0, Math.min(1, fraction)) * width)
  const r = height / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<rect width="${width}" height="${height}" rx="${r}" fill="${INK.track}" fill-opacity="0.25"/>` +
    (fill > 0 ? `<rect width="${Math.max(fill, height)}" height="${height}" rx="${r}" fill="${color}" fill-opacity="0.9"/>` : '') +
    '</svg>'
}

// The same bar in text, for the terminal: "██████░░░░".
export const barText = (fraction: number, cells = 12): string => {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

// A usage bar: `used` filled, and `extra` beyond it drawn faint, for what a
// cache rewrite would add. Both are fractions of the window (0 to 1).
export const usageSvg = (used: number, extra: number, color: string, width = 1000, height = 6): string => {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const a = round(clamp(used) * width)
  const b = round(clamp(used + extra) * width) - a
  const r = height / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<clipPath id="r"><rect width="${width}" height="${height}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${width}" height="${height}" fill="${INK.track}" fill-opacity="0.25"/>` +
    (a > 0 ? `<rect width="${a}" height="${height}" fill="${color}" fill-opacity="0.9"/>` : '') +
    (b > 0 ? `<rect x="${a}" width="${b}" height="${height}" fill="${INK.cooling}" fill-opacity="0.45"/>` : '') +
    '</g></svg>'
}

// The same in text: "██████▒▒░░░░".
export const usageText = (used: number, extra: number, cells = 16): string => {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const a = Math.round(clamp(used) * cells)
  const b = Math.round(clamp(used + extra) * cells) - a

  return '█'.repeat(a) + '▒'.repeat(b) + '░'.repeat(cells - a - b)
}

// Usage colour: calm until the window is nearly full.
export const usageInk = (percent: number): string => (percent >= 90 ? '#f85149' : percent >= 75 ? INK.cooling : INK.muted)

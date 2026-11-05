// A small SVG bar for surfaces that draw SVG, and its text form for the terminal. The colours are mid-tones
// that read on light and dark backgrounds alike; an SVG cannot use theme keys.

export const INK = { track: '#8b8b8b', warm: '#3fb950', cooling: '#d29922', muted: '#8b8b8b' } as const

const round = (n: number) => Math.round(n * 10) / 10

// A thin horizontal bar filled to `fraction` (0 to 1).
export const barSvg = (fraction: number, color: string, width = 120, height = 6): string => {
  const fill = round(Math.max(0, Math.min(1, fraction)) * width)
  const r = height / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" rx="${r}" fill="${INK.track}" fill-opacity="0.25"/>` +
    (fill > 0 ? `<rect width="${Math.max(fill, height)}" height="${height}" rx="${r}" fill="${color}" fill-opacity="0.9"/>` : '') +
    '</svg>'
}

// The same bar in text, for the terminal: "██████░░░░".
export const barText = (fraction: number, cells = 12): string => {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

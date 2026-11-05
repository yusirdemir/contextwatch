// Small SVG charts for surfaces that draw SVG. The colours are mid-tones
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

// A sparkline of `values`, with a dot on each index in `marks`.
export const sparklineSvg = (values: readonly number[], marks: readonly number[], width = 260, height = 44): string => {
  const pad = 4
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const x = (i: number) => round(pad + i * step)
  const y = (v: number) => round(height - pad - (v / max) * (height - pad * 2))
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${line} L${x(values.length - 1)},${height - pad} L${x(0)},${height - pad} Z`
  const dots = marks
    .filter(i => i >= 0 && i < values.length)
    .map(i => `<circle cx="${x(i)}" cy="${y(values[i] ?? 0)}" r="3" fill="${INK.cooling}"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path d="${area}" fill="${INK.muted}" fill-opacity="0.15"/>` +
    `<path d="${line}" fill="none" stroke="${INK.muted}" stroke-width="1.5" stroke-linejoin="round"/>` +
    dots +
    '</svg>'
}

// The same bar in text, for the terminal: "██████░░░░".
export const barText = (fraction: number, cells = 12): string => {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

// The same trend in text: "▁▂▃▅▆▇".
export const sparklineText = (values: readonly number[]): string => {
  const ticks = '▁▂▃▄▅▆▇█'
  const max = Math.max(...values, 1)

  return values.map(v => ticks[Math.min(ticks.length - 1, Math.floor((v / max) * (ticks.length - 1)))]).join('')
}

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match?.[1]) return null
  const value = parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const blend = (x: number, y: number) => Math.round(x * (1 - amount) + y * amount)
  return { r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b) }
}

function channel(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const INK: Rgb = { r: 20, g: 20, b: 20 }

export function accentFor(space: Rgb, dark: boolean): Rgb {
  return dark ? mix(space, WHITE, 0.2) : mix(space, BLACK, 0.12)
}

export function onAccent(spaceHex: string, dark: boolean): '#ffffff' | '#141414' {
  const space = parseHex(spaceHex)
  if (!space) return '#ffffff'
  const accent = accentFor(space, dark)
  return contrast(accent, WHITE) >= contrast(accent, INK) ? '#ffffff' : '#141414'
}

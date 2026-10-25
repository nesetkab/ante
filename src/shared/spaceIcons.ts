export const SYMBOL_PREFIX = 'symbol:'

export const arcSymbols = [
  'star',
  'bookmark',
  'heart',
  'flag',
  'flash',
  'triangle',
  'medical',
  'notifications',
  'bulb',
  'shapes',
  'grid',
  'apps',
  'layers',
  'server',
  'albums',
  'copy',
  'folder',
  'fileTrayFull',
  'calendar',
  'mail',
  'checkbox',
  'document',
  'book',
  'chatBubbleEllipses',
  'people',
  'terminal',
  'construction',
  'square',
  'egg',
  'ellipse',
  'moon',
  'sunny',
  'planet',
  'leaf',
  'cloud',
  'paw',
  'bag',
  'gift',
  'bed',
  'restaurant',
  'barbell',
  'airplane',
  'musicalNote',
  'colorPallete',
  'video',
  'bandage',
  'code',
  'baseball',
  'cloudOutline',
  'map',
  'bonfire',
  'pizza',
  'skull',
  'receipt',
  'thumbsUp',
  'train',
  'rss',
  'github',
  'linear',
  'figma',
  'search',
] as const

export type ArcSymbol = (typeof arcSymbols)[number]

const symbolSet = new Set<string>(arcSymbols)

export const isArcSymbol = (name: string): name is ArcSymbol => symbolSet.has(name)

export function symbolOf(icon: string | null): ArcSymbol | null {
  if (!icon?.startsWith(SYMBOL_PREFIX)) return null
  const name = icon.slice(SYMBOL_PREFIX.length)
  return isArcSymbol(name) ? name : null
}

export const symbolIcon = (name: ArcSymbol) => `${SYMBOL_PREFIX}${name}`

export function symbolLabel(name: ArcSymbol): string {
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

import type { Data, EaselElement, Id } from './schema'

export const EASEL_PREFIX = 'ante:easel/'
export const ASSET_SCHEME = 'ante-asset'
export const MAX_ASSET_BYTES = 15 * 1024 * 1024
export const BOARD_WIDTH = 4000
export const BOARD_HEIGHT = 3000

const ASSET_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/

export function easelUrl(easelId: Id): string {
  return `${EASEL_PREFIX}${easelId}`
}

export function easelIdOf(url: string): Id | null {
  if (!url.startsWith(EASEL_PREFIX)) return null
  const id = url.slice(EASEL_PREFIX.length)
  return id.length > 0 ? id : null
}

export function isAssetName(name: string): boolean {
  return ASSET_NAME.test(name)
}

export function assetUrl(name: string): string {
  return `${ASSET_SCHEME}://asset/${name}`
}

export type ImageType = 'png' | 'jpg' | 'webp' | 'gif'

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'png'
  if (starts(0xff, 0xd8, 0xff)) return 'jpg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return 'webp'
  return null
}

export function referencedEaselIds(data: Data): Set<Id> {
  const urls = [
    ...Object.values(data.items).flatMap((item) =>
      item.kind === 'tab' ? [item.url, item.savedUrl ?? ''] : [],
    ),
    ...data.closed.map((entry) => entry.tab.url),
    ...data.archive.map((entry) => entry.url),
  ]
  return new Set(urls.map(easelIdOf).filter((id): id is Id => id !== null))
}

export function referencedAssets(data: Data): Set<string> {
  const names = new Set<string>()
  for (const easel of Object.values(data.easels)) {
    for (const element of easel.elements) if (element.kind === 'image') names.add(element.asset)
  }
  return names
}

export function placeImage(
  view: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(1, (view.width * 0.6) / size.width, (view.height * 0.6) / size.height)
  const w = Math.round(size.width * scale)
  const h = Math.round(size.height * scale)
  const x = Math.round(Math.min(Math.max(view.x + (view.width - w) / 2, 0), BOARD_WIDTH - w))
  const y = Math.round(Math.min(Math.max(view.y + (view.height - h) / 2, 0), BOARD_HEIGHT - h))
  return { x, y, w, h }
}

export function bringToFront(elements: readonly EaselElement[], id: Id): EaselElement[] {
  const target = elements.find((element) => element.id === id)
  if (!target) return [...elements]
  return [...elements.filter((element) => element.id !== id), target]
}

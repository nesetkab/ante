import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { Id } from '@shared/schema'

export type Surface = 'chrome' | 'overlay' | 'panel'

export interface SurfaceInfo {
  windowId: Id
  surface: Surface
}

export const preloadPath = join(import.meta.dirname, '../preload/index.cjs')

export function loadSurface(
  contents: WebContents,
  surface: Surface,
  windowId: Id,
  extra: Record<string, string> = {},
): void {
  const query = { ...extra, surface, window: windowId }
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const loading = devUrl
    ? contents.loadURL(`${devUrl}?${new URLSearchParams(query).toString()}`)
    : contents.loadFile(join(import.meta.dirname, '../renderer/index.html'), { query })
  loading.catch((error: unknown) => {
    console.error('[surfaces] failed to load', surface, error)
  })
}

export class SurfaceRegistry {
  readonly #byContents = new Map<number, SurfaceInfo>()

  register(contents: WebContents, info: SurfaceInfo): void {
    const id = contents.id
    this.#byContents.set(id, info)
    contents.once('destroyed', () => this.#byContents.delete(id))
  }

  get(contents: WebContents): SurfaceInfo | undefined {
    return this.#byContents.get(contents.id)
  }

  all(): { contentsId: number; info: SurfaceInfo }[] {
    return [...this.#byContents].map(([contentsId, info]) => ({ contentsId, info }))
  }
}

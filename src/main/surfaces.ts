import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WebContents, WebFrameMain } from 'electron'
import type { Id } from '@shared/schema'

export type Surface = 'chrome' | 'overlay' | 'panel'

export interface SurfaceInfo {
  windowId: Id
  surface: Surface
}

export const preloadPath = join(import.meta.dirname, '../preload/index.cjs')
const rendererFile = join(import.meta.dirname, '../renderer/index.html')

export function isTrustedSurfaceUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) return parsed.origin === new URL(devUrl).origin
    return parsed.protocol === 'file:' && parsed.pathname === pathToFileURL(rendererFile).pathname
  } catch {
    return false
  }
}

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
    : contents.loadFile(rendererFile, { query })
  loading.catch((error: unknown) => {
    console.error('[surfaces] failed to load', surface, error)
  })
}

export class SurfaceRegistry {
  readonly #byContents = new Map<number, SurfaceInfo>()

  register(contents: WebContents, info: SurfaceInfo): void {
    const id = contents.id
    contents.on('will-navigate', (event) => event.preventDefault())
    contents.on('will-redirect', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.#byContents.set(id, info)
    contents.once('destroyed', () => this.#byContents.delete(id))
  }

  get(contents: WebContents): SurfaceInfo | undefined {
    return this.#byContents.get(contents.id)
  }

  verify(contents: WebContents, frame: WebFrameMain | null): SurfaceInfo | undefined {
    if (!frame || frame !== contents.mainFrame || !isTrustedSurfaceUrl(frame.url)) return undefined
    return this.get(contents)
  }

  all(): { contentsId: number; info: SurfaceInfo }[] {
    return [...this.#byContents].map(([contentsId, info]) => ({ contentsId, info }))
  }
}

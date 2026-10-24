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

const RESTART_WINDOW_MS = 60_000
const MAX_RESTARTS = 3
const RESTART_DELAY_MS = 250

export function restartBudget(recent: readonly number[], now: number): number[] | null {
  const kept = recent.filter((time) => now - time < RESTART_WINDOW_MS)
  return kept.length < MAX_RESTARTS ? [...kept, now] : null
}

const lastLoad = new WeakMap<WebContents, () => void>()

function recoverFromCrashes(contents: WebContents, surface: Surface): void {
  let restarts: number[] = []
  contents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    const next = restartBudget(restarts, Date.now())
    console.error('[surfaces] renderer gone', surface, details.reason)
    if (!next) return
    restarts = next
    setTimeout(() => {
      if (!contents.isDestroyed()) lastLoad.get(contents)?.()
    }, RESTART_DELAY_MS)
  })
}

export function loadSurface(
  contents: WebContents,
  surface: Surface,
  windowId: Id,
  extra: Record<string, string> = {},
): void {
  const query = { ...extra, surface, window: windowId }
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const load = () => {
    contents.setIgnoreMenuShortcuts(false)
    const loading = devUrl
      ? contents.loadURL(`${devUrl}?${new URLSearchParams(query).toString()}`)
      : contents.loadFile(rendererFile, { query })
    loading.catch((error: unknown) => {
      console.error('[surfaces] failed to load', surface, error)
    })
  }
  if (!lastLoad.has(contents)) recoverFromCrashes(contents, surface)
  lastLoad.set(contents, load)
  load()
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

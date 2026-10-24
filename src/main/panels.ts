import { BrowserWindow, nativeTheme } from 'electron'
import type { Id } from '@shared/schema'
import type { Store } from './store'
import { loadSurface, preloadPath, type SurfaceRegistry } from './surfaces'
import type { AppWindow } from './windows'

export type PanelKind = 'boost' | 'routes' | 'settings'

const isMac = process.platform === 'darwin'

const panelSizes: Record<PanelKind, { width: number; height: number }> = {
  boost: { width: 360, height: 660 },
  routes: { width: 520, height: 560 },
  settings: { width: 640, height: 680 },
}

const panelTitles: Record<PanelKind, string> = {
  boost: 'Boost',
  routes: 'Air Traffic Control',
  settings: 'Settings',
}

interface OpenPanel {
  win: BrowserWindow
  query: string
}

export class PanelManager {
  readonly #store: Store
  readonly #surfaces: SurfaceRegistry
  readonly #open = new Map<string, OpenPanel>()

  constructor(store: Store, surfaces: SurfaceRegistry) {
    this.#store = store
    this.#surfaces = surfaces
  }

  show(parent: AppWindow, kind: PanelKind, params: Record<string, string> = {}): BrowserWindow {
    const key = `${parent.id}:${kind}`
    const query = new URLSearchParams({ ...params, panel: kind }).toString()
    const existing = this.#open.get(key)
    if (existing && !existing.win.isDestroyed()) {
      if (existing.query !== query) {
        existing.query = query
        loadSurface(existing.win.webContents, 'panel', parent.id, { ...params, panel: kind })
      }
      existing.win.show()
      existing.win.focus()
      return existing.win
    }
    const win = this.#create(parent, kind)
    this.#open.set(key, { win, query })
    win.on('closed', () => {
      if (this.#open.get(key)?.win === win) this.#open.delete(key)
    })
    this.#surfaces.register(win.webContents, { windowId: parent.id, surface: 'panel' })
    loadSurface(win.webContents, 'panel', parent.id, { ...params, panel: kind })
    return win
  }

  get(parentId: Id, kind: PanelKind): BrowserWindow | undefined {
    const win = this.#open.get(`${parentId}:${kind}`)?.win
    return win && !win.isDestroyed() ? win : undefined
  }

  #background(): string {
    const theme = this.#store.state.data.settings.theme
    const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    return dark ? '#232326' : '#ffffff'
  }

  #create(parent: AppWindow, kind: PanelKind): BrowserWindow {
    const size = panelSizes[kind]
    const bounds = parent.win.getContentBounds()
    const height = Math.max(360, Math.min(size.height, bounds.height - 48))
    const x =
      kind === 'boost'
        ? bounds.x + bounds.width - size.width - 16
        : Math.round(bounds.x + (bounds.width - size.width) / 2)
    const win = new BrowserWindow({
      parent: parent.win,
      x: Math.max(bounds.x, x),
      y: bounds.y + (kind === 'boost' ? 40 : 72),
      width: size.width,
      height,
      minWidth: 320,
      minHeight: 360,
      show: false,
      title: panelTitles[kind],
      backgroundColor: this.#background(),
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 16 },
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      ...(isMac
        ? {}
        : { titleBarOverlay: { color: '#00000000', symbolColor: '#555', height: 44 } }),
      webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.once('ready-to-show', () => win.show())
    return win
  }
}

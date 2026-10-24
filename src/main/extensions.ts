import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  session as electronSession,
  type BaseWindow,
  type ContextMenuParams,
  type MenuItem,
  type Session,
  type WebContents,
} from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import type { Id } from '@shared/schema'
import { isPrivateProfile } from '@shared/state/private'
import { activeTabId, visibleTabIds } from '@shared/state/tree'
import type { CommandRunner } from './commands'
import type { Store } from './store'
import type { TabManager } from './tabs'
import type { AppWindow, WindowManager } from './windows'

interface ExtensionDeps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  runner: () => CommandRunner
}

export class Extensions {
  readonly #deps: ExtensionDeps
  readonly #byProfile = new Map<Id, ElectronChromeExtensions>()
  readonly #tracked = new WeakMap<WebContents, BaseWindow>()
  readonly #selected = new WeakMap<BaseWindow, WebContents>()

  constructor(deps: ExtensionDeps) {
    this.#deps = deps
    ElectronChromeExtensions.handleCRXProtocol(electronSession.defaultSession)
  }

  attach(session: Session, profileId: Id): void {
    if (isPrivateProfile(profileId) || this.#byProfile.has(profileId)) return
    const extensions = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session,
      createTab: (details) => this.#createTab(details),
      selectTab: (contents) => this.#selectTab(contents),
      removeTab: (contents) => this.#removeTab(contents),
      createWindow: (details) => this.#createWindow(details),
      removeWindow: (window) => {
        if (!window.isDestroyed()) window.close()
      },
    })
    this.#byProfile.set(profileId, extensions)
    installChromeWebStore({
      session,
      extensionsPath: join(app.getPath('userData'), 'Extensions', profileId),
    }).catch((error: unknown) => {
      console.error('[extensions] web store setup failed', error)
    })
  }

  sync(): void {
    const { data } = this.#deps.store.state
    for (const window of this.#deps.windows.all()) {
      const windowData = window.data
      if (!windowData || window.win.isDestroyed()) continue
      for (const tabId of visibleTabIds(data, windowData)) this.#track(tabId, window)
      const active = this.#deps.tabs.contents(activeTabId(data, windowData))
      if (active && this.#selected.get(window.win) !== active) {
        this.#selected.set(window.win, active)
        this.#forContents(active)?.selectTab(active)
      }
    }
  }

  contextMenuItems(contents: WebContents, params: ContextMenuParams): MenuItem[] {
    return this.#forContents(contents)?.getContextMenuItems(contents, params) ?? []
  }

  #forContents(contents: WebContents): ElectronChromeExtensions | undefined {
    return ElectronChromeExtensions.fromSession(contents.session)
  }

  #track(tabId: Id, window: AppWindow): void {
    const contents = this.#deps.tabs.contents(tabId)
    const extensions = contents && this.#forContents(contents)
    if (!contents || !extensions || this.#tracked.get(contents) === window.win) return
    if (this.#tracked.has(contents)) extensions.removeTab(contents)
    this.#tracked.set(contents, window.win)
    extensions.addTab(contents, window.win)
    contents.once('destroyed', () => this.#tracked.delete(contents))
  }

  #windowFor(base: BaseWindow): AppWindow | undefined {
    return this.#deps.windows.all().find((window) => window.win === base)
  }

  #targetWindow(): AppWindow {
    const { windows, store } = this.#deps
    const existing = windows.lastFocused('main')
    if (existing) return existing
    const spaceId = store.state.data.spaceOrder[0]
    if (!spaceId) throw new Error('No space to open a tab in')
    return windows.createMain(spaceId)
  }

  async #createTab(details: chrome.tabs.CreateProperties): Promise<[WebContents, BaseWindow]> {
    const requested =
      details.windowId === undefined ? undefined : BrowserWindow.fromId(details.windowId)
    const window = (requested && this.#windowFor(requested)) ?? this.#targetWindow()
    const spaceId = window.data?.spaceId ?? this.#deps.store.state.data.spaceOrder[0]
    if (!spaceId) throw new Error('No space to open a tab in')
    const runner = this.#deps.runner()
    const tabId = runner.createTab(details.url ?? 'about:blank', { type: 'today', spaceId })
    if (details.active === false) this.#deps.tabs.ensure(tabId)
    else runner.activate(window, tabId)
    const contents = this.#deps.tabs.contents(tabId)
    if (!contents) throw new Error('Tab could not be created')
    this.#track(tabId, window)
    return Promise.resolve([contents, window.win])
  }

  #selectTab(contents: WebContents): void {
    const tabId = this.#deps.tabs.tabIdFor(contents)
    const window = this.#deps.windows.windowFor(contents) ?? this.#deps.windows.lastFocused('main')
    if (tabId && window) this.#deps.runner().activate(window, tabId)
  }

  #removeTab(contents: WebContents): void {
    const tabId = this.#deps.tabs.tabIdFor(contents)
    const window = this.#deps.windows.windowFor(contents) ?? null
    if (tabId) this.#deps.runner().run(window?.id ?? null, { type: 'tab/close', tabId })
  }

  async #createWindow(details: chrome.windows.CreateData): Promise<BaseWindow> {
    const spaceId =
      this.#deps.windows.lastFocused('main')?.data?.spaceId ??
      this.#deps.store.state.data.spaceOrder[0]
    if (!spaceId) throw new Error('No space to open a window in')
    const window = this.#deps.windows.createMain(spaceId)
    const urls =
      details.url === undefined ? [] : Array.isArray(details.url) ? details.url : [details.url]
    for (const url of urls) {
      this.#deps.runner().run(window.id, { type: 'open', input: url, disposition: 'newTab' })
    }
    return Promise.resolve(window.win)
  }
}

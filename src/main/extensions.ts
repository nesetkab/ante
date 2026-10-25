import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  session as electronSession,
  webContents,
  type BaseWindow,
  type ContextMenuParams,
  type MenuItem,
  type Session,
  type WebContents,
} from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore, installExtension } from 'electron-chrome-web-store'
import { describeExtensionAccess, WEB_STORE_ORIGIN } from '@shared/extensions'
import { originOf } from '@shared/permissions'
import { isWebUrl } from '@shared/url'
import type { Id } from '@shared/schema'
import { isPrivateProfile } from '@shared/state/private'
import { activeTabId, visibleTabIds } from '@shared/state/tree'
import type { CommandRunner } from './commands'
import { copyExtensionData, profileExtensions } from './importers/extensions'
import type { Store } from './store'
import type { TabManager } from './tabs'
import type { AppWindow, WindowManager } from './windows'

const extensionsPathFor = (profileId: Id) => join(app.getPath('userData'), 'Extensions', profileId)

type WebStoreOptions = NonNullable<Parameters<typeof installChromeWebStore>[0]>
type ExtensionInstallDetails = Parameters<NonNullable<WebStoreOptions['beforeInstall']>>[0]

interface ExtensionDeps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  runner: () => CommandRunner
}

export class Extensions {
  readonly #deps: ExtensionDeps
  readonly #byProfile = new Map<Id, ElectronChromeExtensions>()
  readonly #sessions = new Map<Id, Session>()
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
      createTab: (details) => this.#createTab(profileId, details),
      selectTab: (contents) => this.#selectTab(contents),
      removeTab: (contents) => this.#removeTab(contents),
      createWindow: (details) => this.#createWindow(profileId, details),
      removeWindow: (window) => {
        if (!window.isDestroyed()) window.close()
      },
    })
    this.#byProfile.set(profileId, extensions)
    this.#sessions.set(profileId, session)
    installChromeWebStore({
      session,
      extensionsPath: extensionsPathFor(profileId),
      beforeInstall: (details) => this.#confirmInstall(details),
    }).catch((error: unknown) => {
      console.error('[extensions] web store setup failed', error)
    })
  }

  async importFrom(profileId: Id, profileDir: string): Promise<number> {
    const session = this.#sessions.get(profileId)
    if (!session) return 0
    let count = 0
    for (const id of await profileExtensions(profileDir)) {
      if (session.extensions.getExtension(id)) continue
      try {
        if (session.storagePath) await copyExtensionData(id, profileDir, session.storagePath)
        await installExtension(id, { session, extensionsPath: extensionsPathFor(profileId) })
        count += 1
      } catch (error) {
        console.error('[extensions] could not import', id, error)
      }
    }
    return count
  }

  async #confirmInstall(details: ExtensionInstallDetails): Promise<{ action: 'allow' | 'deny' }> {
    if (originOf(details.frame.url) !== WEB_STORE_ORIGIN) return { action: 'deny' }
    const contents = webContents.fromFrame(details.frame)
    const parent = (contents && this.#deps.windows.windowFor(contents)?.win) ?? undefined
    const access = describeExtensionAccess(details.manifest)
    const options = {
      type: 'question' as const,
      buttons: ['Add Extension', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Add “${details.localizedName}”?`,
      detail:
        access.length > 0
          ? `It will be able to:\n${access.map((line) => `• ${line}`).join('\n')}`
          : '',
      icon: details.icon,
    }
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
    return { action: response === 0 ? 'allow' : 'deny' }
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
    else contents.once('destroyed', () => this.#tracked.delete(contents))
    this.#tracked.set(contents, window.win)
    extensions.addTab(contents, window.win)
  }

  #windowFor(base: BaseWindow): AppWindow | undefined {
    return this.#deps.windows.all().find((window) => window.win === base)
  }

  #profileOf(window: AppWindow): Id | null {
    const spaceId = window.data?.spaceId
    return (spaceId && this.#deps.store.state.data.spaces[spaceId]?.profileId) ?? null
  }

  #windowForProfile(profileId: Id, preferred?: BaseWindow | null): AppWindow {
    const { windows, store } = this.#deps
    const matches = (window: AppWindow) =>
      window.kind === 'main' && this.#profileOf(window) === profileId
    const requested = preferred ? this.#windowFor(preferred) : undefined
    if (requested && matches(requested)) return requested
    const existing = windows.lastFocusedWhere(matches)
    if (existing) return existing
    const data = store.state.data
    const spaceId = data.spaceOrder.find((id) => data.spaces[id]?.profileId === profileId)
    if (!spaceId) throw new Error('No space uses this profile')
    return windows.createMain(spaceId)
  }

  async #createTab(
    profileId: Id,
    details: chrome.tabs.CreateProperties,
  ): Promise<[WebContents, BaseWindow]> {
    const requested = details.windowId === undefined ? null : BrowserWindow.fromId(details.windowId)
    const window = this.#windowForProfile(profileId, requested)
    const spaceId = window.data?.spaceId
    if (!spaceId) throw new Error('No space to open a tab in')
    const runner = this.#deps.runner()
    const url = details.url && isWebUrl(details.url) ? details.url : 'about:blank'
    const tabId = runner.createTab(url, { type: 'today', spaceId })
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

  async #createWindow(profileId: Id, details: chrome.windows.CreateData): Promise<BaseWindow> {
    const data = this.#deps.store.state.data
    const spaceId = data.spaceOrder.find((id) => data.spaces[id]?.profileId === profileId)
    if (!spaceId) throw new Error('No space uses this profile')
    const window = this.#deps.windows.createMain(spaceId)
    const urls =
      details.url === undefined ? [] : Array.isArray(details.url) ? details.url : [details.url]
    for (const url of urls) {
      this.#deps.runner().run(window.id, { type: 'open', input: url, disposition: 'newTab' })
    }
    return Promise.resolve(window.win)
  }
}

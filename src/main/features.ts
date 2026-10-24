import { randomUUID } from 'node:crypto'
import { app, webContents as allContents, type BrowserWindow, type WebContents } from 'electron'
import { domainMatches, findBoostForHost, hostnameOf } from '@shared/boosts'
import type { Command } from '@shared/commands'
import { IPC, type UiEvent } from '@shared/ipc'
import { findRoute } from '@shared/routing'
import { isPrivateSpace } from '@shared/state/private'
import { zapSelectorSchema, type Id } from '@shared/schema'
import { activeTabId, getTab } from '@shared/state/tree'
import type { BoostManager } from './boosts'
import type { CommandRunner } from './commands'
import { isDefaultBrowser, setDefaultBrowser } from './external'
import type { PanelManager } from './panels'
import type { Store } from './store'
import type { SurfaceRegistry } from './surfaces'
import type { TabManager } from './tabs'
import type { AppWindow, WindowManager } from './windows'
import { cancelZap, pickZap, type ZapPick } from './zap'

export type FeatureCommand = Extract<
  Command,
  {
    type:
      | 'boost/open'
      | 'boost/zap'
      | 'boost/zapStop'
      | 'boost/reloadTabs'
      | 'routes/open'
      | 'browser/setDefault'
      | 'browser/checkDefault'
  }
>

interface FeatureDeps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  surfaces: SurfaceRegistry
  boosts: BoostManager
  panels: PanelManager
  runner: () => CommandRunner
}

interface ZapSession {
  windowId: Id
  boostId: Id
  contents: WebContents
  stop: () => void
  stopped: Promise<ZapPick>
}

export class Features {
  readonly #deps: FeatureDeps
  #zap: ZapSession | null = null
  readonly #wiredPanels = new WeakSet<BrowserWindow>()

  constructor(deps: FeatureDeps) {
    this.#deps = deps
  }

  get #data() {
    return this.#deps.store.state.data
  }

  run(window: AppWindow, command: FeatureCommand): void {
    switch (command.type) {
      case 'boost/open':
        this.#openBoost(window, command.tabId)
        return
      case 'boost/zap':
        this.#startZap(window, command.boostId, command.tabId)
        return
      case 'boost/zapStop':
        this.#zap?.stop()
        return
      case 'boost/reloadTabs': {
        const boost = this.#data.boosts[command.boostId]
        if (boost) for (const contents of this.#deps.boosts.tabsMatching(boost)) contents.reload()
        return
      }
      case 'routes/open':
        this.#deps.panels.show(this.#mainParent(window), 'routes')
        return
      case 'browser/setDefault':
        setDefaultBrowser()
        this.#send(window.id, { type: 'defaultBrowser', isDefault: isDefaultBrowser() })
        return
      case 'browser/checkDefault':
        this.#send(window.id, { type: 'defaultBrowser', isDefault: isDefaultBrowser() })
        return
    }
  }

  openExternal(url: string): void {
    const { windows } = this.#deps
    const runner = this.#deps.runner()
    const data = this.#data
    const route = findRoute(data.routes, url, (spaceId) => data.spaces[spaceId] !== undefined)
    if (process.platform === 'darwin') app.focus({ steal: true })
    if (!route && data.settings.externalLinks === 'little') {
      runner.run(this.#normalWindow()?.id ?? null, { type: 'window/little', input: url })
      return
    }
    const spaceId = route?.spaceId ?? data.spaceOrder[0]
    if (!spaceId) return
    const target = this.#normalWindow() ?? windows.createMain(spaceId)
    if (target.win.isMinimized()) target.win.restore()
    if (route) runner.run(target.id, { type: 'space/select', spaceId: route.spaceId })
    runner.run(target.id, { type: 'open', input: url, disposition: 'newTab' })
    target.win.focus()
  }

  #normalWindow(): AppWindow | undefined {
    return this.#deps.windows.lastFocusedWhere(
      (window) => window.kind === 'main' && !isPrivateSpace(this.#data, window.data?.spaceId),
    )
  }

  #mainParent(window: AppWindow): AppWindow {
    return window.kind === 'main' ? window : (this.#deps.windows.lastFocused('main') ?? window)
  }

  #targetTab(window: AppWindow, tabId: Id | undefined): Id | null {
    if (tabId) return getTab(this.#data, tabId)?.id ?? null
    const data = window.data
    if (!data) return null
    return data.peekTabId ?? activeTabId(this.#data, data)
  }

  #send(windowId: Id, event: UiEvent): void {
    for (const { contentsId, info } of this.#deps.surfaces.all()) {
      if (info.windowId !== windowId) continue
      const contents = allContents.fromId(contentsId)
      if (contents && !contents.isDestroyed()) contents.send(IPC.ui, event)
    }
  }

  #openBoost(window: AppWindow, tabId: Id | undefined): void {
    const tab = getTab(this.#data, this.#targetTab(window, tabId))
    const host = tab ? hostnameOf(tab.url) : null
    if (!host) return
    const existing = findBoostForHost(this.#data.boosts, host)
    const id = existing?.id ?? randomUUID()
    if (!existing) this.#deps.store.dispatch({ type: 'boost/create', id, name: host, domain: host })
    const panel = this.#deps.panels.show(window, 'boost', { boost: id })
    if (this.#wiredPanels.has(panel)) return
    this.#wiredPanels.add(panel)
    panel.once('closed', () => {
      if (this.#zap?.windowId === window.id) this.#zap.stop()
    })
  }

  #startZap(window: AppWindow, boostId: Id, tabId: Id | undefined): void {
    this.#zap?.stop()
    const boost = this.#data.boosts[boostId]
    const contents = this.#deps.tabs.contents(this.#targetTab(window, tabId))
    const host = contents ? hostnameOf(contents.getURL()) : null
    if (!boost || !contents || !host || !domainMatches(host, boost.domain)) {
      this.#send(window.id, { type: 'zap', boostId, active: false })
      return
    }
    let stop: () => void = () => undefined
    const stopped = new Promise<ZapPick>((resolve) => {
      stop = () => resolve({ status: 'cancelled' })
    })
    const session: ZapSession = { windowId: window.id, boostId, contents, stop, stopped }
    this.#zap = session
    window.win.focus()
    contents.focus()
    this.#send(window.id, { type: 'zap', boostId, active: true })
    void this.#zapLoop(session)
  }

  async #zapLoop(session: ZapSession): Promise<void> {
    const { contents } = session
    const onNavigate = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument) session.stop()
    }
    const onDestroyed = () => session.stop()
    contents.on('did-start-navigation', onNavigate)
    contents.once('destroyed', onDestroyed)
    try {
      for (;;) {
        const pick = await Promise.race([pickZap(contents), session.stopped])
        if (pick.status === 'cancelled') break
        const selector = zapSelectorSchema.safeParse(pick.selector)
        if (selector.success) {
          this.#deps.store.dispatch({
            type: 'boost/addZap',
            id: session.boostId,
            selector: selector.data,
          })
        }
      }
    } catch (error) {
      console.warn('[boosts] zap failed', error)
    } finally {
      if (!contents.isDestroyed()) {
        contents.off('did-start-navigation', onNavigate)
        contents.off('destroyed', onDestroyed)
        cancelZap(contents)
      }
      if (this.#zap === session) this.#zap = null
      this.#send(session.windowId, { type: 'zap', boostId: session.boostId, active: false })
    }
  }
}

import { BaseWindow, WebContentsView, type View, type WebContents } from 'electron'
import { canDockDevtools } from '@shared/devtools'
import type { DevtoolsMode, Id } from '@shared/schema'
import { displayTitle, getTab } from '@shared/state/tree'
import type { Store } from './store'
import type { TabManager } from './tabs'

interface Entry {
  view: WebContentsView
  inspected: WebContents
  host: BaseWindow | null
}

export class DevtoolsDock {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #requestSync: () => void
  readonly #entries = new Map<Id, Entry>()

  constructor(store: Store, tabs: TabManager, requestSync: () => void) {
    this.#store = store
    this.#tabs = tabs
    this.#requestSync = requestSync
  }

  viewFor(tabId: Id): View | undefined {
    const entry = this.#entries.get(tabId)
    return entry && !entry.host && !entry.view.webContents.isDestroyed() ? entry.view : undefined
  }

  toggle(tabId: Id): void {
    if (this.#entries.has(tabId)) this.close(tabId)
    else this.open(tabId, 'docked')
  }

  inspect(tabId: Id, x: number, y: number): void {
    if (!this.#entries.has(tabId)) this.open(tabId, 'docked')
    const entry = this.#entries.get(tabId)
    if (entry && !entry.inspected.isDestroyed()) entry.inspected.inspectElement(x, y)
  }

  open(tabId: Id, mode: DevtoolsMode): void {
    if (this.#entries.has(tabId)) {
      this.setMode(tabId, mode)
      return
    }
    const inspected = this.#tabs.contents(tabId)
    if (!inspected) return
    const view = new WebContentsView()
    view.setBackgroundColor('#ffffff')
    const entry: Entry = { view, inspected, host: null }
    this.#entries.set(tabId, entry)
    inspected.setDevToolsWebContents(view.webContents)
    inspected.openDevTools()
    inspected.once('devtools-closed', () => this.#cleanup(tabId, entry))
    inspected.once('destroyed', () => this.#cleanup(tabId, entry))
    const docked = mode === 'docked' && canDockDevtools(this.#store.state.data, tabId)
    if (!docked) this.#popOut(tabId, entry)
    this.#runtime(tabId, docked ? 'docked' : 'window')
  }

  setMode(tabId: Id, mode: DevtoolsMode): void {
    const entry = this.#entries.get(tabId)
    if (!entry) {
      this.open(tabId, mode)
      return
    }
    if (mode === 'window' && !entry.host) {
      this.#popOut(tabId, entry)
      this.#runtime(tabId, 'window')
      return
    }
    const host = entry.host
    if (mode === 'docked' && host && canDockDevtools(this.#store.state.data, tabId)) {
      entry.host = null
      host.contentView.removeChildView(entry.view)
      host.close()
      this.#runtime(tabId, 'docked')
    }
  }

  close(tabId: Id): void {
    const entry = this.#entries.get(tabId)
    if (!entry) return
    if (!entry.inspected.isDestroyed()) entry.inspected.closeDevTools()
    this.#cleanup(tabId, entry)
  }

  #popOut(tabId: Id, entry: Entry): void {
    for (const window of BaseWindow.getAllWindows()) {
      if (window.contentView.children.includes(entry.view))
        window.contentView.removeChildView(entry.view)
    }
    const tab = getTab(this.#store.state.data, tabId)
    const host = new BaseWindow({
      width: 960,
      height: 680,
      minWidth: 360,
      minHeight: 240,
      title: tab ? `Developer Tools - ${displayTitle(tab)}` : 'Developer Tools',
    })
    host.contentView.addChildView(entry.view)
    const fit = () => {
      const [width = 0, height = 0] = host.getContentSize()
      entry.view.setBounds({ x: 0, y: 0, width, height })
    }
    fit()
    host.on('resize', fit)
    host.on('closed', () => {
      if (entry.host === host) this.close(tabId)
    })
    entry.host = host
    this.#requestSync()
  }

  #cleanup(tabId: Id, entry: Entry): void {
    if (this.#entries.get(tabId) !== entry) return
    this.#entries.delete(tabId)
    const host = entry.host
    entry.host = null
    if (host && !host.isDestroyed()) host.close()
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
    this.#runtime(tabId, null)
    this.#requestSync()
  }

  #runtime(tabId: Id, devtools: DevtoolsMode | null): void {
    if (!this.#store.state.runtime.tabs[tabId]) return
    this.#store.dispatch({ type: 'runtime/tab', id: tabId, patch: { devtools } })
  }
}

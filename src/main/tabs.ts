import { WebContentsView, type ContextMenuParams, type WebContents } from 'electron'
import type { Id, TabRuntime } from '@shared/schema'
import { isNoteUrl } from '@shared/notes'
import { getTab } from '@shared/state/tree'
import type { Sessions } from './sessions'
import type { Store } from './store'

export type OpenDisposition = 'foreground' | 'background'

export interface TabHooks {
  profileFor(tabId: Id): Id
  onOpen(openerId: Id, url: string, disposition: OpenDisposition): void
  onContextMenu(tabId: Id, params: ContextMenuParams): void
}

export class TabManager {
  readonly #views = new Map<Id, WebContentsView>()
  readonly #profiles = new Map<Id, Id>()
  readonly #store: Store
  readonly #sessions: Sessions
  readonly #hooks: TabHooks

  constructor(store: Store, sessions: Sessions, hooks: TabHooks) {
    this.#store = store
    this.#sessions = sessions
    this.#hooks = hooks
  }

  get(id: Id): WebContentsView | undefined {
    return this.#views.get(id)
  }

  contents(id: Id | null | undefined): WebContents | undefined {
    if (!id) return undefined
    const contents = this.#views.get(id)?.webContents
    return contents && !contents.isDestroyed() ? contents : undefined
  }

  tabIdFor(contents: WebContents): Id | null {
    for (const [id, view] of this.#views) if (view.webContents === contents) return id
    return null
  }

  ensure(id: Id): WebContentsView | null {
    const existing = this.#views.get(id)
    if (existing) return existing
    const tab = getTab(this.#store.state.data, id)
    if (!tab || isNoteUrl(tab.url)) return null
    const profileId = this.#hooks.profileFor(id)
    const view = new WebContentsView({
      webPreferences: {
        session: this.#sessions.forProfile(profileId),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
      },
    })
    view.setBackgroundColor('#ffffff')
    this.#views.set(id, view)
    this.#profiles.set(id, profileId)
    this.#wire(id, view.webContents)
    this.#runtime(id, { loading: true })
    this.load(id, tab.url)
    return view
  }

  load(id: Id, url: string): void {
    const contents = this.contents(id)
    if (!contents) {
      this.#store.dispatch({ type: 'tab/update', id, patch: { url } })
      return
    }
    contents.loadURL(url).catch((error: unknown) => {
      if (!contents.isDestroyed() && !isAbort(error)) console.warn('[tabs] load failed', url, error)
    })
  }

  destroy(id: Id): void {
    const view = this.#views.get(id)
    if (!view) return
    this.#views.delete(id)
    this.#profiles.delete(id)
    const contents = view.webContents
    if (!contents.isDestroyed()) contents.close()
  }

  reconcile(): void {
    const { data, runtime } = this.#store.state
    for (const id of [...this.#views.keys()]) {
      const stale = !getTab(data, id) || !runtime.tabs[id]
      if (stale || this.#profiles.get(id) !== this.#hooks.profileFor(id)) this.destroy(id)
    }
  }

  destroyAll(): void {
    for (const id of [...this.#views.keys()]) this.destroy(id)
  }

  #runtime(id: Id, patch: Partial<TabRuntime>): void {
    this.#store.dispatch({ type: 'runtime/tab', id, patch })
  }

  #navigationState(id: Id, contents: WebContents): void {
    if (contents.isDestroyed()) return
    this.#runtime(id, {
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
    })
  }

  #wire(id: Id, contents: WebContents): void {
    const update = (patch: { url?: string; title?: string; favicon?: string | null }) => {
      this.#store.dispatch({ type: 'tab/update', id, patch })
    }

    contents.on('did-start-loading', () => this.#runtime(id, { loading: true, crashed: false }))
    contents.on('did-stop-loading', () => {
      this.#runtime(id, { loading: false })
      this.#navigationState(id, contents)
    })
    contents.on('did-navigate', (_event, url) => {
      update({ url, favicon: null })
      this.#navigationState(id, contents)
    })
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      update({ url })
      this.#navigationState(id, contents)
    })
    contents.on('page-title-updated', (_event, title) => update({ title }))
    contents.on('page-favicon-updated', (_event, favicons) => {
      const favicon = favicons.find((icon) => /^(https?|data):/.test(icon))
      if (favicon) update({ favicon })
    })
    contents.on('audio-state-changed', (event) => this.#runtime(id, { audible: event.audible }))
    contents.on('enter-html-full-screen', () => this.#runtime(id, { fullscreen: true }))
    contents.on('leave-html-full-screen', () => this.#runtime(id, { fullscreen: false }))
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason !== 'clean-exit') this.#runtime(id, { crashed: true, loading: false })
    })
    contents.on('zoom-changed', () => this.#runtime(id, { zoom: contents.getZoomFactor() }))
    contents.on('context-menu', (_event, params) => this.#hooks.onContextMenu(id, params))
    contents.on('did-create-window', (popup) => {
      popup.webContents.setWindowOpenHandler(({ url }) => {
        this.#hooks.onOpen(id, url, 'foreground')
        return { action: 'deny' }
      })
    })
    contents.setWindowOpenHandler(({ url, disposition, features }) => {
      if (disposition === 'new-window' && features) {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }
      }
      this.#hooks.onOpen(id, url, disposition === 'background-tab' ? 'background' : 'foreground')
      return { action: 'deny' }
    })
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED'
}

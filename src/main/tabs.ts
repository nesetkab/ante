import { dialog, WebContentsView, type ContextMenuParams, type WebContents } from 'electron'
import type { Id, TabRuntime } from '@shared/schema'
import { IGNORED_LOAD_ERRORS } from '@shared/loadErrors'
import { restorableHistory, trimHistory, type SavedTabHistory } from '@shared/navigation'
import { isInternalPage } from '@shared/pages'
import { getTab } from '@shared/state/tree'
import type { Sessions } from './sessions'
import type { Store } from './store'

export type OpenDisposition = 'foreground' | 'background'

const MAX_SAVED_HISTORIES = 100
const MAX_HOVER_URL = 2048

export interface TabHooks {
  profileFor(tabId: Id): Id
  onOpen(openerId: Id, url: string, disposition: OpenDisposition): void
  onContextMenu(tabId: Id, params: ContextMenuParams): void
}

export class TabManager {
  readonly #views = new Map<Id, WebContentsView>()
  readonly #hung = new Map<Id, AbortController>()
  readonly #histories = new Map<Id, SavedTabHistory>()
  readonly #discard = new Set<Id>()
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
    if (!tab || isInternalPage(tab.url)) return null
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
    this.#store.dispatch({ type: 'runtime/tab', id, patch: { loading: true }, create: true })
    const saved = this.#histories.get(id)
    this.#histories.delete(id)
    if (saved?.profileId === profileId && restorableHistory(saved, tab.url)) {
      const contents = view.webContents
      contents.navigationHistory
        .restore({ entries: saved.entries, index: saved.index })
        .catch((error: unknown) => {
          if (isAbort(error) || contents.isDestroyed() || this.#views.get(id) !== view) return
          console.warn('[tabs] could not restore history', error)
          if (!contents.getURL()) this.load(id, tab.url)
        })
    } else this.load(id, tab.url)
    return view
  }

  histories(include: (id: Id, profileId: Id) => boolean): Record<Id, SavedTabHistory> {
    const result: Record<Id, SavedTabHistory> = {}
    for (const [id, saved] of this.#histories) if (include(id, saved.profileId)) result[id] = saved
    for (const [id, view] of this.#views) {
      const contents = view.webContents
      const profileId = this.#profiles.get(id)
      if (contents.isDestroyed() || !profileId || !include(id, profileId)) continue
      const saved = this.#capture(contents, profileId)
      if (saved) result[id] = saved
    }
    return result
  }

  restoreHistories(histories: Record<Id, SavedTabHistory>): void {
    for (const [id, saved] of Object.entries(histories)) {
      if (!this.#views.has(id)) this.#histories.set(id, saved)
    }
  }

  clearHistories(profileId: Id): void {
    for (const [id, saved] of this.#histories)
      if (saved.profileId === profileId) this.#histories.delete(id)
    for (const [id, view] of this.#views) {
      const contents = view.webContents
      if (this.#profiles.get(id) === profileId && !contents.isDestroyed())
        contents.navigationHistory.clear()
    }
  }

  #capture(contents: WebContents, profileId: Id): SavedTabHistory | null {
    const history = contents.navigationHistory
    const saved = trimHistory(history.getAllEntries(), history.getActiveIndex())
    return saved ? { ...saved, profileId } : null
  }

  discardHistory(id: Id): void {
    this.#histories.delete(id)
    if (this.#views.has(id)) this.#discard.add(id)
  }

  #remember(id: Id, contents: WebContents): void {
    const profileId = this.#profiles.get(id)
    const saved = profileId ? this.#capture(contents, profileId) : null
    this.#histories.delete(id)
    if (!saved) return
    this.#histories.set(id, saved)
    for (const oldest of this.#histories.keys()) {
      if (this.#histories.size <= MAX_SAVED_HISTORIES) break
      this.#histories.delete(oldest)
    }
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
    this.#hung.get(id)?.abort()
    this.#hung.delete(id)
    const keep = !this.#discard.delete(id)
    const view = this.#views.get(id)
    if (!view) return
    const contents = view.webContents
    if (keep && !contents.isDestroyed()) this.#remember(id, contents)
    this.#views.delete(id)
    this.#profiles.delete(id)
    if (!contents.isDestroyed()) contents.close()
  }

  reconcile(): void {
    const { data, runtime } = this.#store.state
    for (const id of [...this.#views.keys()]) {
      const gone = !getTab(data, id)
      const moved = this.#profiles.get(id) !== this.#hooks.profileFor(id)
      if (gone || moved) this.discardHistory(id)
      if (gone || moved || !runtime.tabs[id]) this.destroy(id)
    }
  }

  destroyAll(): void {
    for (const id of [...this.#views.keys()]) this.destroy(id)
  }

  async #askAboutHang(id: Id, contents: WebContents): Promise<void> {
    if (this.#hung.has(id)) return
    const controller = new AbortController()
    this.#hung.set(id, controller)
    const title = getTab(this.#store.state.data, id)?.title ?? 'This page'
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: `${title || 'This page'} isn't responding`,
      detail: 'You can wait for it to respond or reload the page.',
      buttons: ['Wait', 'Reload'],
      defaultId: 0,
      cancelId: 0,
      signal: controller.signal,
    })
    if (this.#hung.get(id) !== controller || contents.isDestroyed()) return
    this.#hung.delete(id)
    if (response === 1) {
      contents.forcefullyCrashRenderer()
      contents.reload()
    }
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
    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      const current = this.#store.state.runtime.tabs[id]
      if (current?.error) this.#runtime(id, { error: null })
      if (current?.hoverUrl) this.#runtime(id, { hoverUrl: null })
    })
    contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      if (!isMainFrame || IGNORED_LOAD_ERRORS.has(code)) return
      this.#runtime(id, { loading: false, error: { code, url } })
    })
    contents.on('did-stop-loading', () => {
      this.#runtime(id, { loading: false })
      this.#navigationState(id, contents)
    })
    contents.on('did-navigate', (_event, url) => {
      update({ url, favicon: null })
      if (this.#store.state.runtime.tabs[id]?.capturing) this.#runtime(id, { capturing: false })
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
    contents.on('update-target-url', (_event, url) => {
      const hoverUrl = url ? url.slice(0, MAX_HOVER_URL) : null
      if (this.#store.state.runtime.tabs[id]?.hoverUrl !== hoverUrl) this.#runtime(id, { hoverUrl })
    })
    contents.on('unresponsive', () => void this.#askAboutHang(id, contents))
    contents.on('responsive', () => {
      this.#hung.get(id)?.abort()
      this.#hung.delete(id)
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

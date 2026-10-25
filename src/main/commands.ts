import { randomUUID } from 'node:crypto'
import { dialog, webContents, type WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Command, Disposition, SettingsSection, SyncCommand } from '@shared/commands'
import type { BrowserId } from '@shared/importers/chrome'
import type { Container, Id, Overlay, Rect, Tab, WindowData } from '@shared/schema'
import { nextSpaceColor } from '@shared/state/initial'
import { isPrivateSpace, samePrivacy } from '@shared/state/private'
import { MAX_SPLIT } from '@shared/state/reducer'
import { recentTab, stepSwitcher, switcherTabs } from '@shared/state/recent'
import {
  activeTabId,
  displayTitle,
  flattenTabs,
  getTab,
  isPersistent,
  parentSplit,
  rootOf,
  spaceTabOrder,
  visibleTabIds,
} from '@shared/state/tree'
import {
  hostOf,
  isWebUrl,
  markdownLink,
  quoteText,
  resolveInput,
  searchTemplate,
} from '@shared/url'
import { nextZoom, zoomHost } from '@shared/zoom'
import { noteTabTitle, noteUrl } from '@shared/notes'
import { easelUrl, placeImage } from '@shared/easels'
import { IPC, type UiEvent } from '@shared/ipc'
import { captureFullPage, capturePng, captureRegion } from './capture'
import { copySecret, copyText } from './clipboard'
import { describeArcImport, type ArcImportResult } from './importers/arc'
import type { FeatureCommand } from './features'
import type { DevtoolsDock } from './devtools'
import type { EaselAssets } from './easelAssets'
import type { FeedManager } from './feeds'
import type { MediaController } from './media'
import type { PrivacyCommand } from './privacy'
import { showSidebarMenu } from './sidebarMenu'
import { deleteSpaceWithConfirm } from './spaceDelete'
import { showSpaceMenu } from './spaceMenu'
import type { OpenDisposition, TabManager } from './tabs'
import { clearAndReload, pickFiles, savePage, sharePage } from './pageActions'
import type { BrowserImportResult } from './importers/chrome'
import type { Store } from './store'
import type { UpdateChecker } from './updates'
import type { AppWindow, WindowManager } from './windows'
import type { Autofill } from './autofill'
import type { PasswordVault } from './passwords'

const QUOTE_WORLD = 1001

interface Deps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  openSettings: (section?: SettingsSection) => void
  recordShortcuts: (window: AppWindow, recording: boolean) => void
  chooseDownloadFolder: (window: AppWindow) => void
  importBrowser: (browser: BrowserId) => Promise<BrowserImportResult>
  importArc: () => Promise<ArcImportResult>
  runFeature: (window: AppWindow, command: FeatureCommand) => void
  runPrivacy: (window: AppWindow, command: PrivacyCommand) => void
  runSync: (window: AppWindow, command: SyncCommand) => void
  media: Pick<MediaController, 'toggle' | 'togglePip'>
  devtools: Pick<DevtoolsDock, 'toggle' | 'setMode' | 'inspect' | 'show'>
  feeds: Pick<FeedManager, 'follow' | 'refresh'>
  assets: Pick<EaselAssets, 'save'>
  updates: Pick<UpdateChecker, 'check' | 'release'>
  autofill: Pick<Autofill, 'fill' | 'respond'>
  vault: Pick<PasswordVault, 'secret' | 'remove'>
}

export class CommandRunner {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #windows: WindowManager
  readonly #openSettings: (section?: SettingsSection) => void
  readonly #recordShortcuts: (window: AppWindow, recording: boolean) => void
  readonly #chooseDownloadFolder: (window: AppWindow) => void
  readonly #importBrowser: (browser: BrowserId) => Promise<BrowserImportResult>
  readonly #importArc: () => Promise<ArcImportResult>
  #importing = false
  readonly #controlWatch = new Map<Id, () => void>()
  readonly #runFeature: (window: AppWindow, command: FeatureCommand) => void
  readonly #runPrivacy: (window: AppWindow, command: PrivacyCommand) => void
  readonly #runSync: (window: AppWindow, command: SyncCommand) => void
  readonly #media: Deps['media']
  readonly #devtools: Deps['devtools']
  readonly #autofill: Deps['autofill']
  readonly #vault: Deps['vault']
  readonly #feeds: Deps['feeds']
  readonly #assets: Deps['assets']
  readonly #updates: Deps['updates']

  constructor(deps: Deps) {
    this.#store = deps.store
    this.#tabs = deps.tabs
    this.#windows = deps.windows
    this.#openSettings = deps.openSettings
    this.#recordShortcuts = deps.recordShortcuts
    this.#chooseDownloadFolder = deps.chooseDownloadFolder
    this.#importBrowser = deps.importBrowser
    this.#importArc = deps.importArc
    this.#autofill = deps.autofill
    this.#vault = deps.vault
    this.#runFeature = deps.runFeature
    this.#runPrivacy = deps.runPrivacy
    this.#runSync = deps.runSync
    this.#media = deps.media
    this.#devtools = deps.devtools
    this.#feeds = deps.feeds
    this.#assets = deps.assets
    this.#updates = deps.updates
  }

  get #data() {
    return this.#store.state.data
  }

  #now(): number {
    return Date.now()
  }

  #resolveWindow(windowId: Id | null): AppWindow | null {
    if (windowId) return this.#windows.get(windowId) ?? null
    const existing = this.#windows.focused()
    if (existing) return existing
    const spaceId = this.#data.spaceOrder[0]
    return spaceId ? this.#windows.createMain(spaceId) : null
  }

  #windowData(window: AppWindow): WindowData {
    const data = window.data
    if (!data) throw new Error(`Window ${window.id} has no state`)
    return data
  }

  #targetTab(window: AppWindow, tabId: Id | undefined): Id | null {
    if (tabId) return getTab(this.#data, tabId)?.id ?? null
    const data = this.#windowData(window)
    return data.peekTabId ?? activeTabId(this.#data, data)
  }

  createTab(url: string, to: Container | null, index = 0): Id {
    const now = this.#now()
    const tab: Tab = {
      kind: 'tab',
      id: randomUUID(),
      url,
      title: '',
      favicon: null,
      savedUrl: null,
      savedTitle: null,
      customTitle: null,
      createdAt: now,
      lastActiveAt: now,
    }
    this.#store.dispatch({ type: 'tab/create', tab, to, index })
    return tab.id
  }

  toast(window: AppWindow, message: string): void {
    this.#sendUi(window, { type: 'toast', message })
  }

  #runImport(window: AppWindow, task: () => Promise<BrowserImportResult>): void {
    if (this.#importing) return
    this.#importing = true
    this.toast(window, 'Importing…')
    void task()
      .then((result) => {
        if (result.spaceId) this.#selectSpace(window, result.spaceId)
        this.toast(window, result.message)
      })
      .catch((error: unknown) => {
        console.error('[import] failed', error)
        this.toast(window, 'Import failed')
      })
      .finally(() => {
        this.#importing = false
      })
  }

  #sendUi(window: AppWindow, event: UiEvent): void {
    for (const contents of [window.win.webContents, window.overlay.webContents]) {
      if (!contents.isDestroyed()) contents.send(IPC.ui, event)
    }
  }

  activate(window: AppWindow, tabId: Id): void {
    this.#store.dispatch({ type: 'window/activate', id: window.id, tabId, now: this.#now() })
    this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
    this.#windows.syncNow()
    window.focusContent(tabId)
  }

  reveal(tabId: Id): void {
    const contents = this.#tabs.contents(tabId)
    const showing = contents ? this.#windows.windowFor(contents) : undefined
    const spaceId = rootOf(this.#data, tabId)?.spaceId ?? null
    const target =
      showing ??
      this.#windows.lastFocusedWhere(
        (candidate) =>
          candidate.kind === 'main' &&
          spaceId !== null &&
          samePrivacy(this.#data, candidate.data?.spaceId ?? spaceId, spaceId),
      )
    if (!target) return
    if (target.win.isMinimized()) target.win.restore()
    this.activate(target, tabId)
    target.win.focus()
  }

  #mainWindowFor(window: AppWindow): AppWindow {
    if (window.kind === 'main') return window
    return (
      this.#windows.lastFocused('main') ??
      this.#windows.createMain(this.#windowData(window).spaceId)
    )
  }

  #openInSpace(window: AppWindow, url: string, spaceId: Id, foreground: boolean): void {
    const target = this.#mainWindowFor(window)
    const id = this.createTab(url, { type: 'today', spaceId })
    if (!foreground) return
    this.activate(target, id)
    if (target !== window) target.win.focus()
  }

  open(window: AppWindow, input: string, disposition: Disposition): void {
    const url = resolveInput(input, searchTemplate(this.#data.settings))
    const data = this.#windowData(window)
    this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
    switch (disposition) {
      case 'current': {
        const active = data.kind === 'little' ? data.littleTabId : activeTabId(this.#data, data)
        if (!active) {
          this.open(window, input, 'newTab')
          return
        }
        this.#tabs.load(active, url)
        this.activate(window, active)
        return
      }
      case 'newTab':
      case 'background':
        this.#openInSpace(window, url, data.spaceId, disposition === 'newTab')
        return
      case 'peek':
        if (data.kind === 'little') this.#openInSpace(window, url, data.spaceId, true)
        else this.#peek(window, url)
        return
      case 'little':
        this.#little(url)
        return
      case 'window': {
        const created = this.#windows.createMain(data.spaceId)
        const id = this.createTab(url, { type: 'today', spaceId: data.spaceId })
        this.activate(created, id)
        return
      }
    }
  }

  openFromTab(openerId: Id, url: string, disposition: OpenDisposition): void {
    if (!isWebUrl(url)) return
    const opener = this.#tabs.contents(openerId)
    const window = (opener && this.#windows.windowFor(opener)) ?? this.#windows.focused()
    if (!window) return
    const data = this.#windowData(window)
    const openerTab = getTab(this.#data, openerId)
    const crossSite = openerTab ? hostOf(openerTab.url) !== hostOf(url) : true
    if (data.kind === 'main' && disposition === 'peek' && this.#data.settings.shiftClickPeek) {
      this.#peek(window, url)
      return
    }
    if (
      data.kind === 'main' &&
      disposition === 'foreground' &&
      isPersistent(this.#data, openerId) &&
      crossSite &&
      this.#data.settings.peekExternalLinks &&
      !data.peekTabId
    ) {
      this.#peek(window, url)
      return
    }
    const spaceId = rootOf(this.#data, openerId)?.spaceId ?? data.spaceId
    this.#openInSpace(window, url, spaceId, disposition !== 'background')
  }

  #peek(window: AppWindow, url: string): void {
    const data = this.#windowData(window)
    if (data.peekTabId) {
      this.#tabs.load(data.peekTabId, url)
      return
    }
    const id = this.createTab(url, null)
    this.#store.dispatch({ type: 'window/update', id: window.id, patch: { peekTabId: id } })
    this.#windows.syncNow()
    window.focusContent(id)
  }

  openLittle(input?: string): void {
    this.#little(input ? resolveInput(input, searchTemplate(this.#data.settings)) : 'about:blank')
    const little = this.#windows.lastFocused('little')
    if (little && !input) {
      this.#store.dispatch({
        type: 'runtime/window',
        id: little.id,
        patch: { overlay: { kind: 'commandBar', mode: 'edit' } },
      })
    }
  }

  #little(url: string): void {
    const spaceId = this.#windows.lastFocused('main')?.data?.spaceId ?? this.#data.spaceOrder[0]
    if (!spaceId) return
    const id = this.createTab(url, null)
    const window = this.#windows.createLittle(spaceId, id)
    window.focusContent(id)
  }

  #closeTab(window: AppWindow, tabId: Id | null): void {
    if (!tabId) {
      if (window.kind === 'little') window.win.close()
      return
    }
    const data = this.#windowData(window)
    if (data.peekTabId === tabId) {
      this.#closePeek(window)
      return
    }
    if (data.kind === 'little' && data.littleTabId === tabId) {
      window.win.close()
      return
    }
    if (isPersistent(this.#data, tabId)) {
      this.#tabs.discardHistory(tabId)
      this.#store.dispatch({ type: 'tab/reset', id: tabId })
      this.#unload(tabId)
      return
    }
    this.#store.dispatch({ type: 'tab/remove', id: tabId, now: this.#now(), archive: true })
    const next = activeTabId(this.#data, this.#windowData(window))
    this.#windows.syncNow()
    window.focusContent(next)
  }

  #unload(tabId: Id): void {
    for (const window of this.#windows.all()) {
      const data = window.data
      if (data && activeTabId(this.#data, data) === tabId) this.#selectLoadedNeighbor(window, tabId)
    }
    this.#store.dispatch({ type: 'runtime/unload', id: tabId })
  }

  #selectLoadedNeighbor(window: AppWindow, closedId: Id): void {
    const data = this.#windowData(window)
    const order = spaceTabOrder(this.#data, data.spaceId)
    const index = order.indexOf(closedId)
    const loaded = (id: Id) => id !== closedId && this.#store.state.runtime.tabs[id] !== undefined
    const next =
      order.slice(index + 1).find(loaded) ??
      order.slice(0, Math.max(index, 0)).reverse().find(loaded)
    if (next) this.activate(window, next)
    else this.#store.dispatch({ type: 'window/deactivate', id: window.id })
  }

  #switch(window: AppWindow, delta: 1 | -1): void {
    const overlay = this.#store.state.runtime.windows[window.id]?.overlay ?? null
    if (overlay?.kind === 'switcher') {
      const index = stepSwitcher(overlay.index, overlay.tabIds.length, delta)
      this.#setOverlay(window, { ...overlay, index })
      return
    }
    if (overlay) return
    const data = this.#windowData(window)
    const tabIds = switcherTabs(this.#data, data.spaceId, activeTabId(this.#data, data))
    if (tabIds.length < 2) return
    this.#setOverlay(window, {
      kind: 'switcher',
      tabIds,
      index: stepSwitcher(0, tabIds.length, delta),
    })
    this.#watchControl(window)
  }

  #commitSwitcher(window: AppWindow, index: number | undefined): void {
    this.#controlWatch.get(window.id)?.()
    const overlay = this.#switcherOf(window)
    if (!overlay) return
    this.#setOverlay(window, null)
    const tabId = overlay.tabIds[index ?? overlay.index]
    if (tabId && getTab(this.#data, tabId)) this.activate(window, tabId)
    else this.run(window.id, { type: 'overlay/close' })
  }

  #watchControl(window: AppWindow): void {
    this.#controlWatch.get(window.id)?.()
    const data = this.#windowData(window)
    const pages = [...visibleTabIds(this.#data, data), data.peekTabId].map((id) =>
      this.#tabs.contents(id),
    )
    const targets = [
      webContents.getFocusedWebContents(),
      window.win.webContents,
      window.overlay.webContents,
      ...pages,
    ].filter(
      (contents): contents is WebContents =>
        contents !== null && contents !== undefined && !contents.isDestroyed(),
    )
    const stop = () => {
      this.#controlWatch.delete(window.id)
      for (const contents of new Set(targets))
        if (!contents.isDestroyed()) contents.off('before-input-event', onInput)
      window.win.off('blur', onBlur)
      window.win.off('closed', stop)
    }
    const onInput = (event: Electron.Event, input: Electron.Input) => {
      if (!this.#switcherOf(window)) {
        stop()
        return
      }
      if (input.type === 'keyUp' && (input.key === 'Control' || !input.control)) {
        this.run(window.id, { type: 'switcher/commit' })
      } else if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault()
        this.run(window.id, { type: 'overlay/close' })
      }
    }
    const onBlur = () => {
      if (this.#switcherOf(window)) this.run(window.id, { type: 'overlay/close' })
      else stop()
    }
    for (const contents of new Set(targets)) contents.on('before-input-event', onInput)
    window.win.on('blur', onBlur)
    window.win.once('closed', stop)
    this.#controlWatch.set(window.id, stop)
  }

  #switcherOf(window: AppWindow): Extract<Overlay, { kind: 'switcher' }> | null {
    const overlay = this.#store.state.runtime.windows[window.id]?.overlay
    return overlay?.kind === 'switcher' ? overlay : null
  }

  #setOverlay(window: AppWindow, overlay: Overlay | null): void {
    this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay } })
  }

  #closeMany(window: AppWindow, tabId: Id, which: 'below' | 'others'): void {
    const root = rootOf(this.#data, tabId)
    const space = root?.spaceId ? this.#data.spaces[root.spaceId] : undefined
    if (root?.section !== 'today' || !space) return
    const index = space.today.findIndex((id) => flattenTabs(this.#data, [id]).includes(tabId))
    const doomed = space.today.filter((_, position) =>
      which === 'below' ? position > index : position !== index,
    )
    const now = this.#now()
    for (const id of flattenTabs(this.#data, doomed))
      this.#store.dispatch({ type: 'tab/remove', id, now, archive: true })
    this.#windows.syncNow()
    window.focusContent(activeTabId(this.#data, this.#windowData(window)))
  }

  #resetSpace(spaceId: Id): void {
    const space = this.#data.spaces[spaceId]
    if (!space) return
    for (const id of flattenTabs(this.#data, space.pinned)) {
      const tab = getTab(this.#data, id)
      if (!tab?.savedUrl || tab.url === tab.savedUrl) continue
      this.#tabs.load(tab.id, tab.savedUrl)
      this.#store.dispatch({ type: 'tab/reset', id: tab.id })
    }
  }

  async #clearArchive(window: AppWindow): Promise<void> {
    if (this.#data.archive.length === 0) return
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      buttons: ['Clear Archive', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Clear all archived tabs?',
      detail: 'This cannot be undone.',
    })
    if (response === 0) this.#store.dispatch({ type: 'archive/clear' })
  }

  #closePeek(window: AppWindow): void {
    const peekId = this.#windowData(window).peekTabId
    if (!peekId) return
    this.#store.dispatch({ type: 'window/update', id: window.id, patch: { peekTabId: null } })
    this.#store.dispatch({ type: 'tab/remove', id: peekId, now: this.#now() })
    this.#windows.syncNow()
    window.focusContent(activeTabId(this.#data, this.#windowData(window)))
  }

  #cycle(window: AppWindow, step: 1 | -1): void {
    const data = this.#windowData(window)
    const order = spaceTabOrder(this.#data, data.spaceId)
    if (order.length === 0) return
    const current = activeTabId(this.#data, data)
    const index = current ? order.indexOf(current) : -1
    const next = order[(index + step + order.length) % order.length]
    if (next) this.activate(window, next)
  }

  #selectSpace(window: AppWindow, spaceId: Id): void {
    if (!samePrivacy(this.#data, this.#windowData(window).spaceId, spaceId)) return
    this.#store.dispatch({ type: 'window/selectSpace', id: window.id, spaceId, now: this.#now() })
    this.#windows.syncNow()
    window.focusContent(activeTabId(this.#data, this.#windowData(window)))
  }

  #cycleSpace(window: AppWindow, step: 1 | -1): void {
    const order = this.#data.spaceOrder
    const index = order.indexOf(this.#windowData(window).spaceId)
    const next = order[(index + step + order.length) % order.length]
    if (next) this.#selectSpace(window, next)
  }

  #togglePin(window: AppWindow, tabId: Id): void {
    const root = rootOf(this.#data, tabId)
    const spaceId = root?.spaceId ?? this.#windowData(window).spaceId
    if (root?.section === 'today') this.#store.dispatch({ type: 'tab/pin', id: tabId, spaceId })
    else if (root?.section === 'pinned')
      this.#store.dispatch({ type: 'tab/unpin', id: tabId, spaceId })
    else if (root?.section === 'favorites')
      this.#store.dispatch({ type: 'tab/unfavorite', id: tabId, spaceId })
  }

  #addSplit(window: AppWindow, tabId: Id, direction: 'horizontal' | 'vertical'): void {
    const data = this.#windowData(window)
    const split = parentSplit(this.#data, tabId)
    if (split && split.children.length >= MAX_SPLIT) return
    const taken = new Set(split?.children ?? [tabId])
    const candidate = spaceTabOrder(this.#data, data.spaceId)
      .filter(
        (id) =>
          !taken.has(id) &&
          rootOf(this.#data, id)?.section !== 'favorites' &&
          !parentSplit(this.#data, id),
      )
      .map((id) => getTab(this.#data, id))
      .filter((tab) => tab !== null)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
    const partner =
      candidate?.id ?? this.createTab('about:blank', { type: 'today', spaceId: data.spaceId })
    this.#store.dispatch({
      type: 'split/create',
      id: randomUUID(),
      tabIds: [tabId, partner],
      direction,
    })
    this.activate(window, partner)
  }

  #moveLittleToSpace(window: AppWindow, spaceId: Id | undefined): void {
    const data = this.#windowData(window)
    const tabId = data.littleTabId
    if (data.kind !== 'little' || !tabId) return
    const main = this.#windows.lastFocused('main')
    const target = spaceId ?? main?.data?.spaceId ?? this.#data.spaceOrder[0]
    if (!target) return
    this.#store.dispatch({
      type: 'item/move',
      id: tabId,
      to: { type: 'today', spaceId: target },
      index: 0,
    })
    this.#store.dispatch({ type: 'window/update', id: window.id, patch: { littleTabId: null } })
    const destination = main ?? this.#windows.createMain(target)
    this.#store.dispatch({ type: 'window/selectSpace', id: destination.id, spaceId: target })
    window.win.close()
    this.activate(destination, tabId)
    destination.win.focus()
  }

  run(windowId: Id | null, command: Command): void {
    const window = this.#resolveWindow(windowId)
    if (!window?.data) return
    const tabFor = (tabId?: Id) => this.#targetTab(window, tabId)
    const contentsFor = (tabId?: Id) => this.#tabs.contents(tabFor(tabId))

    switch (command.type) {
      case 'open': {
        this.open(window, command.input, command.disposition)
        return
      }
      case 'tab/activate': {
        this.activate(window, command.tabId)
        return
      }
      case 'tab/close': {
        this.#closeTab(window, tabFor(command.tabId))
        return
      }
      case 'tab/reopenClosed': {
        const entry = this.#data.closed[0]
        if (!entry) return
        this.#store.dispatch({
          type: 'tab/restoreClosed',
          fallbackSpaceId: this.#windowData(window).spaceId,
        })
        if (getTab(this.#data, entry.tab.id)) this.activate(window, entry.tab.id)
        return
      }
      case 'tab/duplicate': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (!tab) return
        const spaceId = rootOf(this.#data, tab.id)?.spaceId ?? this.#windowData(window).spaceId
        this.activate(window, this.createTab(tab.url, { type: 'today', spaceId }))
        return
      }
      case 'tab/back':
        return contentsFor(command.tabId)?.navigationHistory.goBack()
      case 'tab/forward':
        return contentsFor(command.tabId)?.navigationHistory.goForward()
      case 'tab/reload': {
        const contents = contentsFor(command.tabId)
        if (command.hard) contents?.reloadIgnoringCache()
        else contents?.reload()
        return
      }
      case 'tab/stop':
        return contentsFor(command.tabId)?.stop()
      case 'tab/resetToSaved': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (!tab?.savedUrl) return
        this.#tabs.load(tab.id, tab.savedUrl)
        this.#store.dispatch({ type: 'tab/reset', id: tab.id })
        return
      }
      case 'tab/toggleMute': {
        const tabId = tabFor(command.tabId)
        const contents = this.#tabs.contents(tabId)
        if (!tabId || !contents) return
        const muted = !contents.isAudioMuted()
        contents.setAudioMuted(muted)
        this.#store.dispatch({ type: 'runtime/tab', id: tabId, patch: { muted } })
        return
      }
      case 'tab/unload': {
        const tabId = tabFor(command.tabId)
        if (tabId) this.#unload(tabId)
        return
      }
      case 'tab/copyUrl': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (!tab) return
        copyText(command.markdown ? markdownLink(displayTitle(tab), tab.url) : tab.url)
        this.#sendUi(window, {
          type: 'toast',
          message: command.markdown ? 'Copied Markdown link' : 'Copied URL',
        })
        return
      }
      case 'tab/closeMany':
        this.#closeMany(window, command.tabId, command.which)
        return
      case 'folder/copyLinks': {
        const tabs = flattenTabs(this.#data, [command.folderId]).flatMap(
          (id) => getTab(this.#data, id) ?? [],
        )
        if (tabs.length === 0) return
        copyText(tabs.map((tab) => `- ${markdownLink(displayTitle(tab), tab.url)}`).join('\n'))
        this.toast(window, `Copied ${tabs.length} ${tabs.length === 1 ? 'link' : 'links'}`)
        return
      }
      case 'tab/togglePin': {
        const tabId = tabFor(command.tabId)
        if (tabId) this.#togglePin(window, tabId)
        return
      }
      case 'tab/next': {
        this.#cycle(window, 1)
        return
      }
      case 'tab/previous': {
        this.#cycle(window, -1)
        return
      }
      case 'tab/switch':
        this.#switch(window, command.delta)
        return
      case 'switcher/commit':
        this.#commitSwitcher(window, command.index)
        return
      case 'tab/recent': {
        const data = this.#windowData(window)
        const id = recentTab(this.#data, data.spaceId, activeTabId(this.#data, data))
        if (id) this.activate(window, id)
        return
      }
      case 'tab/nth': {
        const id = spaceTabOrder(this.#data, this.#windowData(window).spaceId)[command.index]
        if (id) this.activate(window, id)
        return
      }
      case 'tab/last': {
        const id = spaceTabOrder(this.#data, this.#windowData(window).spaceId).at(-1)
        if (id) this.activate(window, id)
        return
      }
      case 'tab/zoom': {
        const tabId = tabFor(command.tabId)
        const contents = this.#tabs.contents(tabId)
        if (!tabId || !contents) return
        const zoom = nextZoom(contents.getZoomFactor(), command.delta)
        contents.setZoomFactor(zoom)
        this.#store.dispatch({ type: 'runtime/tab', id: tabId, patch: { zoom } })
        const host = zoomHost(contents.getURL())
        const profileId = this.#tabs.profileOf(tabId)
        if (host && profileId) this.#store.dispatch({ type: 'siteZoom/set', profileId, host, zoom })
        return
      }
      case 'tab/savePage': {
        const contents = contentsFor(command.tabId)
        if (!contents) return
        savePage(window.win, contents).catch((error: unknown) => {
          console.error('[commands] save page failed', error)
          this.toast(window, 'Could not save the page')
        })
        return
      }
      case 'tab/share': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (tab && isWebUrl(tab.url)) sharePage(window.win, tab.url)
        return
      }
      case 'file/openPaths':
        for (const path of command.paths)
          if (isAbsolute(path)) this.open(window, pathToFileURL(path).href, 'newTab')
        return
      case 'file/open':
        void pickFiles(window.win).then((urls) => {
          for (const url of urls) this.open(window, url, 'newTab')
        })
        return
      case 'tab/devtools': {
        const tabId = tabFor(command.tabId)
        if (!tabId) return
        if (command.panel) this.#devtools.show(tabId, command.panel)
        else this.#devtools.toggle(tabId)
        return
      }
      case 'tab/copyQuote': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (!tab) return
        const copy = (selection: unknown) => {
          const text = typeof selection === 'string' ? selection : ''
          copyText(quoteText(displayTitle(tab), tab.url, text))
          this.toast(window, text.trim() ? 'Copied quote' : 'Copied URL')
        }
        const contents = contentsFor(command.tabId)
        if (!contents) {
          copy('')
          return
        }
        contents
          .executeJavaScriptInIsolatedWorld(QUOTE_WORLD, [
            { code: 'String(getSelection() ?? "").slice(0, 2000)' },
          ])
          .then(copy, () => copy(''))
        return
      }
      case 'tab/print':
        contentsFor(command.tabId)?.print()
        return
      case 'capture/fullPage': {
        const contents = contentsFor(command.tabId)
        if (!contents) return
        captureFullPage(contents)
          .then((file) => this.toast(window, file ? 'Page copied and saved' : 'Nothing to capture'))
          .catch((error: unknown) => {
            console.error('[capture] full page failed', error)
            this.toast(window, 'Capture failed')
          })
        return
      }
      case 'tab/viewSource': {
        const tab = getTab(this.#data, tabFor(command.tabId))
        if (tab && isWebUrl(tab.url)) this.open(window, `view-source:${tab.url}`, 'newTab')
        return
      }
      case 'tab/clearAndReload': {
        const contents = contentsFor(command.tabId)
        if (contents) void clearAndReload(contents, command.clear)
        return
      }
      case 'tab/openIn': {
        const data = this.#windowData(window)
        if (data.kind === 'little') this.#moveLittleToSpace(window, undefined)
        else if (data.peekTabId) this.run(window.id, { type: 'peek/expand' })
        else this.run(window.id, { type: 'file/open' })
        return
      }
      case 'space/resetTabs':
        this.#resetSpace(this.#windowData(window).spaceId)
        return
      case 'archive/clear':
        void this.#clearArchive(window)
        return
      case 'split/close': {
        const tabId = tabFor()
        if (tabId && parentSplit(this.#data, tabId)) this.#closeTab(window, tabId)
        return
      }
      case 'split/focus': {
        const tabId = tabFor()
        const split = tabId ? parentSplit(this.#data, tabId) : null
        if (!tabId || !split) return
        const count = split.children.length
        const current = split.children.indexOf(tabId)
        const index = command.index ?? (current + (command.delta ?? 1) + count) % count
        const next = split.children[index]
        if (next) this.activate(window, next)
        return
      }
      case 'tab/devtoolsMode': {
        const tabId = tabFor(command.tabId)
        if (tabId) this.#devtools.setMode(tabId, command.mode)
        return
      }
      case 'tab/inspect': {
        const tabId = tabFor(command.tabId)
        if (tabId) this.#devtools.inspect(tabId, command.x, command.y)
        return
      }
      case 'media/toggle':
        void this.#media.toggle(command.tabId)
        return
      case 'media/pip':
        void this.#media.togglePip(command.tabId)
        return
      case 'tab/contextMenu':
        showSidebarMenu(command.tabId, {
          state: this.#store.state,
          windowSpaceId: this.#windowData(window).spaceId,
          run: (next) => this.run(window.id, next),
          dispatch: this.#store.dispatch,
          ui: (event) => this.#sendUi(window, event),
        })
        return
      case 'split/add': {
        const tabId = tabFor(command.tabId)
        if (tabId && this.#windowData(window).kind === 'main')
          this.#addSplit(window, tabId, command.direction ?? 'horizontal')
        return
      }
      case 'space/select': {
        this.#selectSpace(window, command.spaceId)
        return
      }
      case 'space/next': {
        this.#cycleSpace(window, 1)
        return
      }
      case 'space/previous': {
        this.#cycleSpace(window, -1)
        return
      }
      case 'space/nth': {
        const spaceId = this.#data.spaceOrder[command.index]
        if (spaceId) this.#selectSpace(window, spaceId)
        return
      }
      case 'space/clearToday':
        this.#store.dispatch({
          type: 'today/clear',
          spaceId: this.#windowData(window).spaceId,
          now: this.#now(),
        })
        return
      case 'space/new': {
        const id = randomUUID()
        const current = this.#data.spaces[this.#windowData(window).spaceId]
        this.#store.dispatch({
          type: 'space/create',
          id,
          name: `Space ${this.#data.spaceOrder.length + 1}`,
          color: nextSpaceColor(this.#data),
          icon: null,
          profileId: current?.profileId ?? 'default',
        })
        this.#selectSpace(window, id)
        return
      }
      case 'window/toggleSidebar': {
        const data = this.#windowData(window)
        if (data.kind !== 'main') return
        this.#store.dispatch({
          type: 'window/update',
          id: window.id,
          patch: { sidebarHidden: !data.sidebarHidden },
        })
        this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
        return
      }
      case 'window/new':
        this.#windows.createMain(this.#windowData(window).spaceId)
        return
      case 'window/little': {
        this.openLittle(command.input)
        return
      }
      case 'window/close':
        window.win.close()
        return
      case 'window/sidebarHover': {
        const data = this.#windowData(window)
        const overlay = this.#store.state.runtime.windows[window.id]?.overlay
        if (command.hovering && data.sidebarHidden && !overlay) {
          this.#store.dispatch({
            type: 'runtime/window',
            id: window.id,
            patch: { overlay: { kind: 'sidebar' } },
          })
        } else if (!command.hovering && overlay?.kind === 'sidebar') {
          this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
        }
        return
      }
      case 'commandBar/open':
        this.#store.dispatch({
          type: 'runtime/window',
          id: window.id,
          patch: { overlay: { kind: 'commandBar', mode: command.mode } },
        })
        this.#windows.syncNow()
        window.focusOverlay()
        return
      case 'overlay/close': {
        this.#controlWatch.get(window.id)?.()
        this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
        const data = this.#windowData(window)
        this.#windows.syncNow()
        window.focusContent(data.peekTabId ?? activeTabId(this.#data, data))
        return
      }
      case 'peek/expand': {
        const data = this.#windowData(window)
        const peekId = data.peekTabId
        if (!peekId) return
        this.#store.dispatch({
          type: 'item/move',
          id: peekId,
          to: { type: 'today', spaceId: data.spaceId },
          index: 0,
        })
        this.#store.dispatch({ type: 'window/update', id: window.id, patch: { peekTabId: null } })
        this.activate(window, peekId)
        return
      }
      case 'peek/close': {
        this.#closePeek(window)
        return
      }
      case 'little/moveToSpace': {
        this.#moveLittleToSpace(window, command.spaceId)
        return
      }
      case 'archive/restore': {
        const tabId = randomUUID()
        this.#store.dispatch({
          type: 'archive/restore',
          id: command.id,
          tabId,
          spaceId: this.#windowData(window).spaceId,
          now: this.#now(),
        })
        if (getTab(this.#data, tabId)) this.activate(window, tabId)
        return
      }
      case 'settings/open':
        this.#openSettings(command.section)
        return
      case 'autofill/fill':
        void this.#autofill.fill(command.tabId, command.loginId)
        return
      case 'password/respond':
        void this.#autofill.respond(command.tabId, command.promptId, command.action)
        return
      case 'password/copy':
        void this.#vault.secret(command.profileId, command.loginId, null).then((secret) => {
          if (secret === null) return
          copySecret(secret)
          this.toast(window, 'Copied password for one minute')
        })
        return
      case 'password/remove':
        this.#vault.remove(command.profileId, command.loginId)
        return
      case 'shortcuts/recording':
        this.#recordShortcuts(window, command.recording)
        return
      case 'downloads/chooseFolder':
        this.#chooseDownloadFolder(window)
        return
      case 'downloads/useDefaultFolder':
        this.#store.dispatch({ type: 'settings/downloadFolder', folder: null })
        return
      case 'import/arc':
        this.#runImport(window, async () => {
          const result = await this.#importArc()
          return {
            message: describeArcImport(result),
            spaceId: result.ok ? (result.spaceIds[0] ?? null) : null,
          }
        })
        return
      case 'import/browser':
        this.#runImport(window, () => this.#importBrowser(command.browser))
        return
      case 'space/delete':
        void deleteSpaceWithConfirm(
          { store: this.#store, windows: this.#windows, window },
          command.spaceId,
        )
        return
      case 'space/contextMenu':
        showSpaceMenu(command.spaceId, {
          state: this.#store.state,
          dispatch: this.#store.dispatch,
          ui: (event) => this.#sendUi(window, event),
          deleteSpace: () =>
            this.run(window.id, { type: 'space/delete', spaceId: command.spaceId }),
        })
        return
      case 'library/open': {
        const overlay = this.#store.state.runtime.windows[window.id]?.overlay
        const section = command.section ?? (overlay?.kind === 'library' ? null : 'history')
        if (!section || (overlay?.kind === 'library' && overlay.section === section)) {
          this.run(window.id, { type: 'overlay/close' })
          return
        }
        this.#store.dispatch({
          type: 'runtime/window',
          id: window.id,
          patch: { overlay: { kind: 'library', section } },
        })
        this.#windows.syncNow()
        window.focusOverlay()
        return
      }
      case 'boost/open':
      case 'boost/zap':
      case 'boost/zapStop':
      case 'boost/reloadTabs':
      case 'routes/open':
      case 'browser/setDefault':
      case 'browser/checkDefault':
        this.#runFeature(window, command)
        return
      case 'find/open':
      case 'find/query':
      case 'find/step':
      case 'find/close':
      case 'permission/respond':
      case 'privacy/siteMenu':
      case 'privacy/clearData':
      case 'window/newPrivate':
        this.#runPrivacy(window, command)
        return
      case 'sync/useICloud':
      case 'sync/chooseFolder':
      case 'sync/stop':
      case 'sync/now':
        this.#runSync(window, command)
        return
      case 'update/check':
        void this.#updates.check().then((status) => {
          if (status.state === 'available' && status.version)
            this.toast(window, `Ante ${status.version} is available`)
          if (status.state === 'current') this.toast(window, 'Ante is up to date')
          if (status.state === 'error') this.toast(window, 'Could not check for updates')
        })
        return
      case 'update/open': {
        const release = this.#updates.release
        if (release) this.open(window, release.url, 'newTab')
        return
      }
      case 'note/new': {
        const noteId = randomUUID()
        const now = this.#now()
        const spaceId = this.#windowData(window).spaceId
        this.#store.dispatch({
          type: 'note/create',
          id: noteId,
          now,
          private: isPrivateSpace(this.#data, spaceId),
        })
        const tabId = this.createTab(noteUrl(noteId), { type: 'today', spaceId })
        this.#store.dispatch({ type: 'tab/update', id: tabId, patch: { title: noteTabTitle('') } })
        this.activate(this.#mainWindowFor(window), tabId)
        return
      }
      case 'feed/follow': {
        const tabId = tabFor(command.tabId)
        if (!tabId) return
        void this.#feeds.follow(tabId).then((result) => {
          this.toast(window, result.ok ? `Following ${result.name}` : result.message)
        })
        return
      }
      case 'feed/refresh':
        void this.#feeds.refresh(command.folderId)
        return
      case 'page/open': {
        const page =
          command.kind === 'note' ? this.#data.notes[command.id] : this.#data.easels[command.id]
        if (!page) return
        const url = command.kind === 'note' ? noteUrl(command.id) : easelUrl(command.id)
        const target = this.#mainWindowFor(window)
        const spaceId = this.#windowData(target).spaceId
        if (isPrivateSpace(this.#data, spaceId) !== page.private) {
          this.toast(window, 'Open this from a regular window')
          return
        }
        const existing = spaceTabOrder(this.#data, spaceId).find(
          (id) => getTab(this.#data, id)?.url === url,
        )
        const tabId = existing ?? this.createTab(url, { type: 'today', spaceId })
        if (!existing) {
          const title =
            command.kind === 'note'
              ? noteTabTitle(page.title)
              : page.title.trim() || 'Untitled easel'
          this.#store.dispatch({ type: 'tab/update', id: tabId, patch: { title } })
        }
        this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
        this.activate(target, tabId)
        return
      }
      case 'page/delete':
        this.#store.dispatch({
          type: 'page/delete',
          kind: command.kind,
          id: command.id,
          now: this.#now(),
        })
        this.#windows.syncNow()
        return
      case 'easel/new': {
        const easelId = randomUUID()
        const spaceId = this.#windowData(window).spaceId
        this.#store.dispatch({
          type: 'easel/create',
          id: easelId,
          now: this.#now(),
          private: isPrivateSpace(this.#data, spaceId),
        })
        const tabId = this.createTab(easelUrl(easelId), { type: 'today', spaceId })
        this.#store.dispatch({ type: 'tab/update', id: tabId, patch: { title: 'Untitled easel' } })
        this.activate(this.#mainWindowFor(window), tabId)
        return
      }
      case 'capture/start':
        this.#store.dispatch({
          type: 'runtime/window',
          id: window.id,
          patch: {
            overlay: {
              kind: 'capture',
              ...(command.easelId ? { easelId: command.easelId } : {}),
              ...(command.view ? { view: command.view } : {}),
            },
          },
        })
        this.#windows.syncNow()
        window.focusOverlay()
        return
      case 'capture/region': {
        const overlay = this.#store.state.runtime.windows[window.id]?.overlay
        this.#store.dispatch({ type: 'runtime/window', id: window.id, patch: { overlay: null } })
        this.#windows.syncNow()
        if (overlay?.kind === 'capture' && overlay.easelId) {
          void this.#captureToEasel(window, overlay.easelId, overlay.view, command)
          return
        }
        captureRegion(window, this.#tabs, command)
          .then((file) => {
            this.toast(window, file ? 'Capture copied and saved' : 'Nothing to capture there')
          })
          .catch((error: unknown) => {
            console.error('[capture] failed', error)
            this.toast(window, 'Capture failed')
          })
        return
      }
    }
  }

  async #captureToEasel(
    window: AppWindow,
    easelId: Id,
    view: Rect | undefined,
    region: Rect,
  ): Promise<void> {
    try {
      const captured = await capturePng(window, this.#tabs, region)
      const asset = captured ? await this.#assets.save(captured.png) : null
      if (!captured || !asset) {
        this.toast(window, 'Nothing to capture there')
        return
      }
      const box = placeImage(view ?? { x: 0, y: 0, width: 1200, height: 800 }, captured)
      this.#store.dispatch({
        type: 'easel/upsert',
        id: easelId,
        element: { kind: 'image', id: randomUUID(), ...box, asset, sourceUrl: captured.sourceUrl },
        now: this.#now(),
      })
    } catch (error) {
      console.error('[capture] easel capture failed', error)
      this.toast(window, 'Capture failed')
    }
  }
}

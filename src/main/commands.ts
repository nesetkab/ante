import { randomUUID } from 'node:crypto'
import type { Command, Disposition, SyncCommand } from '@shared/commands'
import type { Container, Id, Rect, Tab, WindowData } from '@shared/schema'
import { nextSpaceColor } from '@shared/state/initial'
import { samePrivacy } from '@shared/state/private'
import { MAX_SPLIT } from '@shared/state/reducer'
import { recentTab } from '@shared/state/recent'
import {
  activeTabId,
  displayTitle,
  getTab,
  isPersistent,
  parentSplit,
  rootOf,
  spaceTabOrder,
} from '@shared/state/tree'
import { hostOf, isWebUrl, markdownLink, resolveInput, searchTemplate } from '@shared/url'
import { nextZoom } from '@shared/zoom'
import { noteTabTitle, noteUrl } from '@shared/notes'
import { easelUrl, placeImage } from '@shared/easels'
import { IPC, type UiEvent } from '@shared/ipc'
import { capturePng, captureRegion } from './capture'
import { copyText } from './clipboard'
import { describeArcImport, importFromArc } from './importers/arc'
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
import { pickFiles, savePage, sharePage } from './pageActions'
import type { Store } from './store'
import type { UpdateChecker } from './updates'
import type { AppWindow, WindowManager } from './windows'

interface Deps {
  store: Store
  tabs: TabManager
  windows: WindowManager
  openSettings: () => void
  recordShortcuts: (window: AppWindow, recording: boolean) => void
  chooseDownloadFolder: (window: AppWindow) => void
  runFeature: (window: AppWindow, command: FeatureCommand) => void
  runPrivacy: (window: AppWindow, command: PrivacyCommand) => void
  runSync: (window: AppWindow, command: SyncCommand) => void
  media: Pick<MediaController, 'toggle' | 'togglePip'>
  devtools: Pick<DevtoolsDock, 'toggle' | 'setMode' | 'inspect'>
  feeds: Pick<FeedManager, 'follow' | 'refresh'>
  assets: Pick<EaselAssets, 'save'>
  updates: Pick<UpdateChecker, 'check' | 'release'>
}

export class CommandRunner {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #windows: WindowManager
  readonly #openSettings: () => void
  readonly #recordShortcuts: (window: AppWindow, recording: boolean) => void
  readonly #chooseDownloadFolder: (window: AppWindow) => void
  readonly #runFeature: (window: AppWindow, command: FeatureCommand) => void
  readonly #runPrivacy: (window: AppWindow, command: PrivacyCommand) => void
  readonly #runSync: (window: AppWindow, command: SyncCommand) => void
  readonly #media: Deps['media']
  readonly #devtools: Deps['devtools']
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
    this.#openInSpace(window, url, spaceId, disposition === 'foreground')
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
    this.#store.dispatch({ type: 'tab/remove', id: tabId, now: this.#now() })
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
      case 'file/open':
        void pickFiles(window.win).then((urls) => {
          for (const url of urls) this.open(window, url, 'newTab')
        })
        return
      case 'tab/devtools': {
        const tabId = tabFor(command.tabId)
        if (tabId) this.#devtools.toggle(tabId)
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
        this.#little(
          command.input
            ? resolveInput(command.input, searchTemplate(this.#data.settings))
            : 'about:blank',
        )
        const little = this.#windows.lastFocused('little')
        if (little && !command.input) {
          this.#store.dispatch({
            type: 'runtime/window',
            id: little.id,
            patch: { overlay: { kind: 'commandBar', mode: 'edit' } },
          })
        }
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
        this.#openSettings()
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
      case 'import/arc': {
        const result = importFromArc(this.#store)
        const first = result.ok ? result.spaceIds[0] : undefined
        if (first) this.#selectSpace(window, first)
        this.#sendUi(window, { type: 'toast', message: describeArcImport(result) })
        return
      }
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
        this.#store.dispatch({ type: 'note/update', id: noteId, title: '', body: '', now })
        const spaceId = this.#windowData(window).spaceId
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
      case 'easel/new': {
        const easelId = randomUUID()
        this.#store.dispatch({ type: 'easel/create', id: easelId, now: this.#now() })
        const spaceId = this.#windowData(window).spaceId
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

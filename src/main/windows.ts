import { randomUUID } from 'node:crypto'
import { BrowserWindow, WebContentsView, screen, type View, type WebContents } from 'electron'
import { dockedDevtoolsTabId } from '@shared/devtools'
import { computeLayout, type Layout } from '@shared/layout'
import { popoverFor, popoverRect } from '@shared/popover'
import type { Id, Rect, WindowData, WindowKind } from '@shared/schema'
import { visibleTabIds } from '@shared/state/tree'
import type { Store } from './store'
import { loadSurface, preloadPath, type SurfaceRegistry } from './surfaces'
import type { TabManager } from './tabs'

const isMac = process.platform === 'darwin'
const FLOATING_SIDEBAR_INSET = 6
const PEEK_RADIUS = 10

interface WindowContext {
  store: Store
  tabs: TabManager
  surfaces: SurfaceRegistry
  keepOnClose(id: Id): boolean
  requestSync(): void
  onFocus(id: Id): void
  onClosing(id: Id): void
  onClosed(id: Id): void
  devtoolsView?(tabId: Id): View | undefined
}

interface Plan {
  views: View[]
  overlayVisible: boolean
  overlayBounds: Rect
  layout: Layout
  htmlFullscreen: boolean
  floatingSidebar: boolean
}

function defaultBounds(kind: WindowKind): Rect {
  const { workArea } = screen.getPrimaryDisplay()
  const width = kind === 'little' ? 560 : Math.min(1440, workArea.width - 80)
  const height = kind === 'little' ? 680 : Math.min(920, workArea.height - 80)
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  }
}

export class AppWindow {
  readonly id: Id
  readonly kind: WindowKind
  readonly win: BrowserWindow
  readonly overlay: WebContentsView
  readonly #ctx: WindowContext
  #boundsTimer: NodeJS.Timeout | null = null
  #htmlFullscreen = false
  #fullscreenBeforeHtml = false
  #layout: Layout | null = null

  constructor(data: WindowData, ctx: WindowContext) {
    this.id = data.id
    this.kind = data.kind
    this.#ctx = ctx
    const bounds = data.bounds ?? defaultBounds(data.kind)
    this.win = new BrowserWindow({
      ...bounds,
      minWidth: data.kind === 'little' ? 360 : 520,
      minHeight: 320,
      show: false,
      title: 'Ante',
      backgroundColor: '#e9e9ec',
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 14, y: 14 },
      ...(isMac
        ? {}
        : { titleBarOverlay: { color: '#00000000', symbolColor: '#555', height: 36 } }),
      webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true },
    })
    this.overlay = new WebContentsView({
      webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true },
    })
    this.overlay.setBackgroundColor('#00000000')
    this.overlay.setVisible(false)
    this.win.contentView.addChildView(this.overlay)

    ctx.surfaces.register(this.win.webContents, { windowId: this.id, surface: 'chrome' })
    ctx.surfaces.register(this.overlay.webContents, { windowId: this.id, surface: 'overlay' })
    loadSurface(this.win.webContents, 'chrome', this.id)
    loadSurface(this.overlay.webContents, 'overlay', this.id)

    this.win.once('ready-to-show', () => {
      if (process.env.ANTE_AUTOMATION) this.win.showInactive()
      else this.win.show()
    })
    this.win.on('focus', () => {
      ctx.onFocus(this.id)
      ctx.store.dispatch({ type: 'runtime/window', id: this.id, patch: { focused: true } })
    })
    this.win.on('blur', () => {
      ctx.store.dispatch({ type: 'runtime/window', id: this.id, patch: { focused: false } })
    })
    this.win.on('resize', () => this.#boundsChanged())
    this.win.on('move', () => this.#boundsChanged())
    this.win.on('enter-full-screen', () => {
      ctx.store.dispatch({ type: 'runtime/window', id: this.id, patch: { fullscreen: true } })
    })
    this.win.on('leave-full-screen', () => {
      ctx.store.dispatch({ type: 'runtime/window', id: this.id, patch: { fullscreen: false } })
    })
    this.win.on('close', () => {
      ctx.onClosing(this.id)
      if (!ctx.keepOnClose(this.id)) ctx.store.dispatch({ type: 'window/remove', id: this.id })
    })
    this.win.on('closed', () => {
      if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.close()
      ctx.onClosed(this.id)
    })
  }

  get data(): WindowData | undefined {
    return this.#ctx.store.state.data.windows[this.id]
  }

  get layout(): Layout | null {
    return this.#layout
  }

  owns(contents: WebContents): boolean {
    return contents === this.win.webContents || contents === this.overlay.webContents
  }

  #boundsChanged(): void {
    if (this.#boundsTimer) clearTimeout(this.#boundsTimer)
    this.#boundsTimer = setTimeout(() => {
      this.#boundsTimer = null
      if (this.win.isDestroyed() || this.win.isFullScreen() || this.kind !== 'main') return
      this.#ctx.store.dispatch({
        type: 'window/update',
        id: this.id,
        patch: { bounds: this.win.getBounds() },
      })
    }, 400)
    this.#ctx.requestSync()
  }

  plan(claimed: Set<Id>): Plan | null {
    const { data, runtime } = this.#ctx.store.state
    const window = data.windows[this.id]
    if (!window || this.win.isDestroyed()) return null
    const [width = 0, height = 0] = this.win.getContentSize()
    const fullscreenTabId =
      visibleTabIds(data, window).find((id) => runtime.tabs[id]?.fullscreen) ?? null
    const devtoolsTabId = fullscreenTabId ? null : dockedDevtoolsTabId(data, runtime, window)
    const layout = computeLayout({ width, height, window, data, fullscreenTabId, devtoolsTabId })
    this.#layout = layout
    const overlayState = runtime.windows[this.id]?.overlay ?? null
    const views: View[] = []

    for (const pane of layout.panes) {
      if (claimed.has(pane.tabId)) continue
      const problem = runtime.tabs[pane.tabId]
      if (problem?.error || problem?.crashed) {
        claimed.add(pane.tabId)
        continue
      }
      const view = this.#ctx.tabs.ensure(pane.tabId)
      if (!view) continue
      claimed.add(pane.tabId)
      view.setBounds(pane.rect)
      view.setBorderRadius(layout.radius)
      views.push(view)
    }

    const inspected = layout.devtools && this.#ctx.tabs.get(layout.devtools.tabId)
    const devtoolsView = layout.devtools && this.#ctx.devtoolsView?.(layout.devtools.tabId)
    if (layout.devtools && devtoolsView && inspected && views.includes(inspected)) {
      devtoolsView.setBounds(layout.devtools.view)
      devtoolsView.setBorderRadius(layout.radius)
      views.push(devtoolsView)
    }

    const peekId =
      window.peekTabId && layout.peek && !claimed.has(window.peekTabId) ? window.peekTabId : null
    const popover = overlayState === null && !peekId ? popoverFor(data, runtime, window) : null
    const popoverPane = popover && layout.panes.find((pane) => pane.tabId === popover.tabId)
    const overlayVisible = overlayState !== null || peekId !== null || Boolean(popoverPane)
    let overlayBounds: Rect = { x: 0, y: 0, width, height }
    if (popover && popoverPane) overlayBounds = popoverRect(popoverPane.rect, popover)
    if (overlayState?.kind === 'sidebar') {
      const sidebarWidth = data.settings.sidebarWidth
      const x =
        data.settings.sidebarSide === 'right'
          ? width - sidebarWidth - FLOATING_SIDEBAR_INSET
          : FLOATING_SIDEBAR_INSET
      overlayBounds = {
        x,
        y: FLOATING_SIDEBAR_INSET,
        width: sidebarWidth,
        height: height - FLOATING_SIDEBAR_INSET * 2,
      }
    } else if (overlayState?.kind === 'library' && window.kind === 'main') {
      overlayBounds = layout.content
    }
    const peekView = peekId && layout.peek ? this.#ctx.tabs.ensure(peekId) : null
    if (peekId && peekView && layout.peek) {
      claimed.add(peekId)
      peekView.setBounds(layout.peek)
      peekView.setBorderRadius(PEEK_RADIUS)
    }
    if (overlayVisible) this.overlay.setBounds(overlayBounds)
    const overlayOnTop = overlayState !== null
    if (peekView && overlayOnTop) views.push(peekView)
    if (overlayVisible) views.push(this.overlay)
    if (peekView && !overlayOnTop) views.push(peekView)

    return {
      views,
      overlayVisible,
      overlayBounds,
      layout,
      htmlFullscreen: fullscreenTabId !== null,
      floatingSidebar: overlayState?.kind === 'sidebar',
    }
  }

  detachStale(plan: Plan | null): void {
    if (this.win.isDestroyed()) return
    const keep = new Set<View>(plan?.views ?? [])
    keep.add(this.overlay)
    for (const child of this.win.contentView.children) {
      if (!keep.has(child)) this.win.contentView.removeChildView(child)
    }
  }

  attach(plan: Plan | null): void {
    if (!plan || this.win.isDestroyed()) return
    const current = this.win.contentView.children.filter(
      (child) => child !== this.overlay || plan.overlayVisible,
    )
    const inOrder =
      current.length === plan.views.length &&
      current.every((child, index) => child === plan.views[index])
    if (!inOrder) for (const view of plan.views) this.win.contentView.addChildView(view)
    this.overlay.setVisible(plan.overlayVisible)

    if (plan.htmlFullscreen !== this.#htmlFullscreen) {
      this.#htmlFullscreen = plan.htmlFullscreen
      if (plan.htmlFullscreen) this.#fullscreenBeforeHtml = this.win.isFullScreen()
      this.win.setFullScreen(plan.htmlFullscreen || this.#fullscreenBeforeHtml)
    }
    if (isMac) {
      const sidebarShown =
        this.kind === 'little' || !this.data?.sidebarHidden || plan.floatingSidebar
      this.win.setWindowButtonVisibility(!plan.htmlFullscreen && sidebarShown)
    }
  }

  focusContent(tabId: Id | null): void {
    if (this.win.isDestroyed()) return
    const contents = this.#ctx.tabs.contents(tabId)
    if (contents) contents.focus()
    else this.win.webContents.focus()
  }

  focusOverlay(): void {
    if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.focus()
  }
}

export class WindowManager {
  readonly #windows = new Map<Id, AppWindow>()
  readonly #ctx: WindowContext
  #focusOrder: Id[] = []
  #syncScheduled = false
  readonly #syncListeners = new Set<() => void>()

  constructor(
    ctx: Omit<
      WindowContext,
      'onFocus' | 'onClosing' | 'onClosed' | 'requestSync' | 'keepOnClose'
    > & {
      isQuitting: () => boolean
    },
  ) {
    this.#ctx = {
      ...ctx,
      keepOnClose: (id) => {
        if (ctx.isQuitting()) return true
        const closing = this.#windows.get(id)
        if (process.platform === 'darwin' || closing?.kind !== 'main') return false
        return !this.all().some((window) => window.kind === 'main' && window.id !== id)
      },
      requestSync: () => this.scheduleSync(),
      onFocus: (id) => {
        this.#focusOrder = [id, ...this.#focusOrder.filter((other) => other !== id)]
      },
      onClosing: (id) => {
        this.#focusOrder = this.#focusOrder.filter((other) => other !== id)
      },
      onClosed: (id) => {
        this.#windows.delete(id)
        this.#focusOrder = this.#focusOrder.filter((other) => other !== id)
        this.syncNow()
      },
    }
  }

  get(id: Id): AppWindow | undefined {
    return this.#windows.get(id)
  }

  all(): AppWindow[] {
    return [...this.#windows.values()]
  }

  open(data: WindowData): AppWindow {
    const existing = this.#windows.get(data.id)
    if (existing) return existing
    if (!this.#ctx.store.state.data.windows[data.id]) {
      this.#ctx.store.dispatch({ type: 'window/create', window: data })
    }
    this.#ctx.store.dispatch({ type: 'runtime/window', id: data.id, patch: {} })
    const window = new AppWindow(data, this.#ctx)
    this.#windows.set(data.id, window)
    this.#focusOrder.unshift(data.id)
    this.syncNow()
    return window
  }

  createMain(spaceId: Id, bounds: Rect | null = null): AppWindow {
    return this.open({
      id: randomUUID(),
      kind: 'main',
      spaceId,
      activeBySpace: {},
      sidebarHidden: false,
      bounds,
      peekTabId: null,
      littleTabId: null,
    })
  }

  createLittle(spaceId: Id, tabId: Id): AppWindow {
    return this.open({
      id: randomUUID(),
      kind: 'little',
      spaceId,
      activeBySpace: {},
      sidebarHidden: true,
      bounds: null,
      peekTabId: null,
      littleTabId: tabId,
    })
  }

  focused(): AppWindow | undefined {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused) {
      const match = this.all().find((window) => window.win === focused)
      if (match) return match
    }
    return this.lastFocused()
  }

  lastFocused(kind?: WindowKind): AppWindow | undefined {
    for (const id of this.#focusOrder) {
      const window = this.#windows.get(id)
      if (window && (!kind || window.kind === kind)) return window
    }
    return undefined
  }

  lastFocusedWhere(predicate: (window: AppWindow) => boolean): AppWindow | undefined {
    for (const id of this.#focusOrder) {
      const window = this.#windows.get(id)
      if (window && !window.win.isDestroyed() && predicate(window)) return window
    }
    return undefined
  }

  windowFor(contents: WebContents): AppWindow | undefined {
    const tabId = this.#ctx.tabs.tabIdFor(contents)
    const view = tabId ? this.#ctx.tabs.get(tabId) : undefined
    return this.all().find(
      (window) =>
        window.owns(contents) ||
        (view !== undefined && window.win.contentView.children.includes(view)),
    )
  }

  scheduleSync(): void {
    if (this.#syncScheduled) return
    this.#syncScheduled = true
    setImmediate(() => {
      this.#syncScheduled = false
      this.syncNow()
    })
  }

  syncNow(): void {
    const claimed = new Set<Id>()
    const ordered = [
      ...this.#focusOrder
        .map((id) => this.#windows.get(id))
        .filter((window) => window !== undefined),
      ...this.all().filter((window) => !this.#focusOrder.includes(window.id)),
    ]
    this.#ctx.tabs.reconcile()
    const plans = ordered.map((window) => [window, window.plan(claimed)] as const)
    for (const [window, plan] of plans) window.detachStale(plan)
    for (const [window, plan] of plans) window.attach(plan)
    for (const listener of this.#syncListeners) listener()
  }

  onSync(listener: () => void): () => void {
    this.#syncListeners.add(listener)
    return () => this.#syncListeners.delete(listener)
  }
}

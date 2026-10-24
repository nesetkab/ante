import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, Menu, nativeTheme, session } from 'electron'
import type { Command } from '@shared/commands'
import type { Id } from '@shared/schema'
import { createAppState, createInitialData, DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { sanitize } from '@shared/state/sanitize'
import { rootOf } from '@shared/state/tree'
import { startArchiveSweeper } from './archive'
import { runAutomation } from './automation'
import { BoostManager } from './boosts'
import { CommandRunner } from './commands'
import { detectArcImport } from './importers/arc'
import { showContextMenu } from './contextMenu'
import { externalLinks } from './external'
import { Features } from './features'
import { broadcastPatches, registerIpc } from './ipc'
import { DownloadManager } from './downloads'
import { HistoryStore, recordHistory } from './history'
import { registerLibraryIpc } from './libraryIpc'
import { buildAppMenu } from './menu'
import { DevtoolsDock } from './devtools'
import { MediaController } from './media'
import { PanelManager } from './panels'
import { Privacy } from './privacy'
import { AdBlocker } from './privacy/adblock'
import { Persistence } from './persistence'
import { Sessions } from './sessions'
import { Store } from './store'
import { SurfaceRegistry } from './surfaces'
import { TabManager } from './tabs'
import { WindowManager } from './windows'

app.setName('Ante')
if (process.env.ANTE_USER_DATA) app.setPath('userData', process.env.ANTE_USER_DATA)
externalLinks.listen()

const urlArguments = (argv: readonly string[]) =>
  argv.slice(1).filter((arg) => /^https?:\/\//i.test(arg))

async function start(): Promise<void> {
  await app.whenReady()
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
  }

  const persistence = new Persistence(join(app.getPath('userData'), 'state.json'))
  const fallbackSpaceId = randomUUID()
  const loaded = persistence.load()
  const data = loaded ? sanitize(loaded, fallbackSpaceId) : createInitialData(fallbackSpaceId)
  const store = new Store(createAppState(data))
  detectArcImport(store)
  const sessions = new Sessions()
  const surfaces = new SurfaceRegistry()
  let quitting = false

  const profileFor = (tabId: Id): Id => {
    const state = store.state.data
    const root = rootOf(state, tabId)
    if (root?.profileId) return root.profileId
    const owner = Object.values(state.windows).find(
      (window) => window.peekTabId === tabId || window.littleTabId === tabId,
    )
    return (owner && state.spaces[owner.spaceId]?.profileId) ?? DEFAULT_PROFILE_ID
  }

  const tabs: TabManager = new TabManager(store, sessions, {
    profileFor,
    onOpen: (openerId, url, disposition) => runner.openFromTab(openerId, url, disposition),
    onContextMenu: (tabId, params) => {
      const contents = tabs.contents(tabId)
      if (!contents) return
      const windowId = windows.windowFor(contents)?.id ?? null
      showContextMenu(params, {
        contents,
        tabId,
        searchEngine: store.state.data.settings.searchEngine,
        run: (command) => runner.run(windowId, command),
      })
    },
  })
  const devtools = new DevtoolsDock(store, tabs, () => windows.scheduleSync())
  const windows = new WindowManager({
    store,
    tabs,
    surfaces,
    isQuitting: () => quitting,
    devtoolsView: (tabId) => devtools.viewFor(tabId),
  })
  const media = new MediaController(store, tabs)
  windows.onSync(() => media.sync())
  const boosts = new BoostManager(store, tabs)
  boosts.start()
  const panels = new PanelManager(store, surfaces)
  const features = new Features({
    store,
    tabs,
    windows,
    surfaces,
    boosts,
    panels,
    runner: () => runner,
  })
  const runner = new CommandRunner({
    store,
    tabs,
    windows,
    openSettings: () => {
      const parent = windows.lastFocused('main') ?? windows.focused()
      if (parent) panels.show(parent, 'settings')
    },
    runFeature: (window, command) => features.run(window, command),
    runPrivacy: (window, command) => privacy.run(window, command),
    media,
    devtools,
  })
  const privacy = new Privacy({
    store,
    tabs,
    sessions,
    windows,
    toast: (window, message) => runner.toast(window, message),
  })
  const adblock = new AdBlocker(store, tabs, join(app.getPath('userData'), 'adblock'))
  sessions.onCreate((profileSession) => adblock.attach(profileSession))
  void adblock.load()
  const applyTheme = () => {
    nativeTheme.themeSource = store.state.data.settings.theme
  }
  applyTheme()
  const runInFocused = (command: Command) => runner.run(windows.focused()?.id ?? null, command)

  store.subscribe((change) => {
    if (change.prev.data.settings.theme !== change.state.data.settings.theme) applyTheme()
    windows.scheduleSync()
    if (change.patches.some((patch) => patch.path[0] === 'data'))
      persistence.schedule(store.state.data)
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
  const flushPatches = broadcastPatches(store, surfaces)
  registerIpc({ store, surfaces, runner, flushPatches })
  const history = new HistoryStore(join(app.getPath('userData'), 'history.sqlite'))
  history.prune()
  recordHistory(store, history, {
    profileFor,
    isRecording: (tabId) => tabs.contents(tabId)?.session.isPersistent() ?? false,
  })
  const downloads = new DownloadManager(store, sessions)
  registerLibraryIpc({ store, surfaces, history, downloads })
  Menu.setApplicationMenu(buildAppMenu(runInFocused))

  const restored = Object.values(store.state.data.windows).filter(
    (window) => window.kind === 'main',
  )
  for (const window of restored) windows.open(window)
  if (restored.length === 0) {
    const spaceId = store.state.data.spaceOrder[0]
    if (spaceId) windows.createMain(spaceId)
  }
  externalLinks.attach((url) => features.openExternal(url))
  for (const url of urlArguments(process.argv)) externalLinks.push(url)

  startArchiveSweeper(store)

  const automation = process.env.ANTE_AUTOMATION
  if (automation) void runAutomation(automation, { store, tabs, windows, runner })

  app.on('second-instance', (_event, argv) => {
    const window = windows.focused()
    if (window) {
      if (window.win.isMinimized()) window.win.restore()
      window.win.focus()
    }
    for (const url of urlArguments(argv)) externalLinks.push(url)
  })
  app.on('activate', () => {
    const spaceId = store.state.data.spaceOrder[0]
    if (windows.all().length === 0 && spaceId) windows.createMain(spaceId)
  })
  app.on('before-quit', () => {
    quitting = true
    persistence.schedule(store.state.data)
    persistence.flush()
  })
  app.on('will-quit', () => history.close())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

if (app.requestSingleInstanceLock()) {
  start().catch((error: unknown) => {
    console.error('[ante] failed to start', error)
    app.exit(1)
  })
} else {
  app.quit()
}

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, dialog, Menu, nativeTheme, safeStorage, session } from 'electron'
import type { Command } from '@shared/commands'
import type { Id } from '@shared/schema'
import { createAppState, createInitialData, DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { isPrivateProfile } from '@shared/state/private'
import { sanitize } from '@shared/state/sanitize'
import { referencedAssets } from '@shared/easels'
import { getTab, profileIndex } from '@shared/state/tree'
import { searchTemplate } from '@shared/url'
import { startArchiveSweeper } from './archive'
import { runAutomation } from './automation'
import { BoostManager } from './boosts'
import { CommandRunner } from './commands'
import { detectArcImport, importFromArc } from './importers/arc'
import { showContextMenu } from './contextMenu'
import { externalLinks, urlArguments } from './external'
import { Features } from './features'
import { broadcastPatches, registerIpc } from './ipc'
import { DownloadManager } from './downloads'
import { HistoryStore, recordHistory } from './history'
import { registerLibraryIpc } from './libraryIpc'
import { buildAppMenu } from './menu'
import { DevtoolsDock } from './devtools'
import { Extensions } from './extensions'
import { FeedManager } from './feeds'
import { EaselAssets, registerAssetScheme } from './easelAssets'
import { MediaController } from './media'
import { PanelManager } from './panels'
import { Privacy } from './privacy'
import { AdBlocker } from './privacy/adblock'
import { Persistence } from './persistence'
import { Autofill } from './autofill'
import { PasswordVault } from './passwords'
import { Sessions } from './sessions'
import { listenForSwipes, registerPagePreloads } from './swipe'
import { Store } from './store'
import { PrivacySignals } from './privacy/signals'
import { detectBrowsers, importFromBrowser } from './importers/chrome'
import { SyncManager } from './sync'
import { readTabHistories, writeTabHistoriesSync } from './tabHistories'
import { UpdateChecker } from './updates'
import { SurfaceRegistry } from './surfaces'
import { TabManager } from './tabs'
import { WindowManager } from './windows'

app.setName('Ante')
registerAssetScheme()
if (process.env.ANTE_USER_DATA) app.setPath('userData', process.env.ANTE_USER_DATA)
externalLinks.listen()

const ASSET_GRACE_MS = 60_000

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
  store.dispatch({ type: 'runtime/browsers', browsers: detectBrowsers() })
  const sessions = new Sessions()
  const surfaces = new SurfaceRegistry()
  let quitting = false

  const profileFor = (tabId: Id): Id =>
    profileIndex(store.state.data).get(tabId) ?? DEFAULT_PROFILE_ID

  const publishPasswords = () =>
    store.dispatch({
      type: 'runtime/passwords',
      available: vault.available,
      logins: vault.summaries(),
    })
  const encryption = await safeStorage.isAsyncEncryptionAvailable()
  const vault: PasswordVault = new PasswordVault(
    join(app.getPath('userData'), 'passwords.json'),
    {
      available: () => encryption,
      encrypt: async (plain) => (await safeStorage.encryptStringAsync(plain)).toString('base64'),
      decrypt: async (secret) => {
        try {
          const { result } = await safeStorage.decryptStringAsync(Buffer.from(secret, 'base64'))
          return result
        } catch {
          return null
        }
      },
    },
    publishPasswords,
  )
  publishPasswords()

  const historiesPath = join(app.getPath('userData'), 'tab-histories.json')
  const keepsHistory = (tabId: Id, profileId: Id) =>
    getTab(store.state.data, tabId) !== null &&
    !isPrivateProfile(profileId) &&
    profileFor(tabId) === profileId
  const tabs: TabManager = new TabManager(store, sessions, {
    profileFor,
    onOpen: (openerId, url, disposition) => runner.openFromTab(openerId, url, disposition),
    onCreate: (tabId, contents) => autofill.watch(tabId, contents),
    onContextMenu: (tabId, params) => {
      const contents = tabs.contents(tabId)
      if (!contents) return
      const windowId = windows.windowFor(contents)?.id ?? null
      showContextMenu(params, {
        contents,
        extensionItems: extensions.contextMenuItems(contents, params),
        tabId,
        searchTemplate: searchTemplate(store.state.data.settings),
        run: (command) => runner.run(windowId, command),
      })
    },
  })
  const devtools = new DevtoolsDock(store, tabs, () => windows.scheduleSync())
  tabs.restoreHistories(
    Object.fromEntries(
      Object.entries(readTabHistories(historiesPath)).filter(([tabId, saved]) =>
        keepsHistory(tabId, saved.profileId),
      ),
    ),
  )
  const windows = new WindowManager({
    store,
    tabs,
    surfaces,
    isQuitting: () => quitting,
    devtoolsView: (tabId) => devtools.viewFor(tabId),
  })
  const media = new MediaController(store, tabs)
  const feeds = new FeedManager(store)
  const updates = new UpdateChecker(store, (version) => {
    const window = windows.lastFocused('main') ?? windows.focused()
    if (window) runner.toast(window, `Ante ${version} is available. Open Settings to download it.`)
  })
  const assets = new EaselAssets(join(app.getPath('userData'), 'easel-assets'))
  assets.serve(surfaces)
  void assets.collect(referencedAssets(store.state.data))
  store.subscribe((change) => {
    if (change.action.type === 'private/remove')
      void assets.collect(referencedAssets(store.state.data), ASSET_GRACE_MS)
  })
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
  const autofill: Autofill = new Autofill({ store, tabs, vault, profileFor })
  autofill.listen()
  const runner = new CommandRunner({
    store,
    tabs,
    windows,
    autofill,
    vault,
    openSettings: (section) => {
      const parent = windows.lastFocused('main') ?? windows.focused()
      if (parent) panels.show(parent, 'settings', section ? { section } : {})
    },
    importBrowser: (browser) =>
      importFromBrowser(
        store,
        history,
        browser,
        () => sessions.forProfile(DEFAULT_PROFILE_ID),
        (logins) => vault.importLogins(DEFAULT_PROFILE_ID, logins),
      ),
    importArc: () =>
      importFromArc({
        store,
        history,
        jarFor: (profileId) => sessions.forProfile(profileId),
        saveLogins: (profileId, logins) => vault.importLogins(profileId, logins),
        importExtensions: (profileId, dir): Promise<number> => {
          sessions.forProfile(profileId)
          return extensions.importFrom(profileId, dir)
        },
      }),
    chooseDownloadFolder: (window) => {
      const parent = panels.get(window.id, 'settings') ?? window.win
      void dialog
        .showOpenDialog(parent, {
          title: 'Save Downloads To',
          properties: ['openDirectory', 'createDirectory'],
        })
        .then(({ canceled, filePaths }) => {
          const folder = filePaths[0]
          if (!canceled && folder) store.dispatch({ type: 'settings/downloadFolder', folder })
        })
    },
    recordShortcuts: (window, recording) => {
      panels.get(window.id, 'settings')?.webContents.setIgnoreMenuShortcuts(recording)
    },
    runFeature: (window, command) => features.run(window, command),
    runPrivacy: (window, command) => privacy.run(window, command),
    runSync: (window, command) => {
      const parent = panels.get(window.id, 'settings') ?? window.win
      sync.run(parent, command).catch((error: unknown) => {
        console.error('[sync] command failed', error)
      })
    },
    media,
    devtools,
    feeds,
    assets,
    updates,
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
  const signals = new PrivacySignals(store)
  sessions.onCreate((profileSession) => signals.attach(profileSession))
  store.subscribe((change) => {
    const before = change.prev.data.settings.globalPrivacyControl
    if (before !== change.state.data.settings.globalPrivacyControl) signals.sync()
  })
  const extensions: Extensions = new Extensions({ store, tabs, windows, runner: () => runner })
  sessions.onCreate((profileSession, profileId) => extensions.attach(profileSession, profileId))
  sessions.onCreate((profileSession) => registerPagePreloads(profileSession))
  listenForSwipes(tabs)
  for (const profileId of Object.keys(store.state.data.profiles)) {
    if (!isPrivateProfile(profileId)) sessions.forProfile(profileId)
  }
  windows.onSync(() => extensions.sync())
  void adblock.load()
  const applyTheme = () => {
    nativeTheme.themeSource = store.state.data.settings.theme
  }
  applyTheme()
  nativeTheme.on('updated', () => {
    windows.applyTheme()
    panels.applyTheme()
  })
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
  registerLibraryIpc({
    store,
    surfaces,
    history,
    downloads,
    onHistoryCleared: (profileId) => tabs.clearHistories(profileId),
  })
  let menuShortcuts = store.state.data.settings.shortcuts
  Menu.setApplicationMenu(buildAppMenu(runInFocused, menuShortcuts))
  store.subscribe(() => {
    const next = store.state.data.settings.shortcuts
    if (next === menuShortcuts) return
    menuShortcuts = next
    Menu.setApplicationMenu(buildAppMenu(runInFocused, next))
  })

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
  feeds.start()
  const sync = new SyncManager(store, (id, url) => tabs.load(id, url))
  sync.start()
  updates.start()

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
    if (!quitting) {
      const keep = !store.state.data.settings.clearHistoryOnQuit
      writeTabHistoriesSync(historiesPath, keep ? tabs.histories(keepsHistory) : {})
    }
    quitting = true
    updates.stop()
    sync.flush()
    persistence.schedule(store.state.data)
    persistence.flush()
  })
  app.on('will-quit', () => {
    if (store.state.data.settings.clearHistoryOnQuit)
      for (const profileId of Object.keys(store.state.data.profiles)) history.clear(profileId)
    history.close()
  })
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

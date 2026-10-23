import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, Menu } from 'electron'
import type { Command } from '@shared/commands'
import type { Id } from '@shared/schema'
import { createAppState, createInitialData, DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { sanitize } from '@shared/state/sanitize'
import { rootOf } from '@shared/state/tree'
import { startArchiveSweeper } from './archive'
import { runAutomation } from './automation'
import { CommandRunner } from './commands'
import { showContextMenu } from './contextMenu'
import { broadcastPatches, registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { Persistence } from './persistence'
import { Sessions } from './sessions'
import { Store } from './store'
import { SurfaceRegistry } from './surfaces'
import { TabManager } from './tabs'
import { WindowManager } from './windows'

app.setName('Ante')
if (process.env.ANTE_USER_DATA) app.setPath('userData', process.env.ANTE_USER_DATA)

const urlArguments = (argv: readonly string[]) =>
  argv.slice(1).filter((arg) => /^https?:\/\//i.test(arg))

async function start(): Promise<void> {
  await app.whenReady()

  const persistence = new Persistence(join(app.getPath('userData'), 'state.json'))
  const fallbackSpaceId = randomUUID()
  const loaded = persistence.load()
  const data = loaded ? sanitize(loaded, fallbackSpaceId) : createInitialData(fallbackSpaceId)
  const store = new Store(createAppState(data))
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
      showContextMenu(params, { contents, tabId, run: (command) => runner.run(windowId, command) })
    },
  })
  const windows = new WindowManager({ store, tabs, surfaces, isQuitting: () => quitting })
  const runner = new CommandRunner({ store, tabs, windows, openSettings: () => undefined })
  const runInFocused = (command: Command) => runner.run(windows.focused()?.id ?? null, command)

  store.subscribe((change) => {
    windows.scheduleSync()
    if (change.patches.some((patch) => patch.path[0] === 'data'))
      persistence.schedule(store.state.data)
  })
  broadcastPatches(store, surfaces)
  registerIpc({ store, surfaces, runner })
  Menu.setApplicationMenu(buildAppMenu(runInFocused))

  const restored = Object.values(store.state.data.windows).filter(
    (window) => window.kind === 'main',
  )
  for (const window of restored) windows.open(window)
  if (restored.length === 0) {
    const spaceId = store.state.data.spaceOrder[0]
    if (spaceId) windows.createMain(spaceId)
  }
  for (const url of urlArguments(process.argv))
    runInFocused({ type: 'open', input: url, disposition: 'newTab' })

  startArchiveSweeper(store)

  const automation = process.env.ANTE_AUTOMATION
  if (automation) void runAutomation(automation, { store, tabs, windows, runner })

  app.on('second-instance', (_event, argv) => {
    const window = windows.focused()
    if (window) {
      if (window.win.isMinimized()) window.win.restore()
      window.win.focus()
    }
    for (const url of urlArguments(argv))
      runInFocused({ type: 'open', input: url, disposition: 'newTab' })
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

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync, watch, type FSWatcher } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import type { SyncCommand } from '@shared/commands'
import type { Id, SyncStatus } from '@shared/schema'
import {
  createDeviceFile,
  diffEntities,
  sameEntities,
  syncCycle,
  syncSnapshot,
  type SyncEntities,
  isFreshDevice,
  movedTabs,
  touchesSyncedData,
} from '@shared/sync'
import type { Store } from './store'
import {
  deviceFileName,
  devicesDir,
  folderExists,
  readDeviceFiles,
  writeDeviceFile,
  writeDeviceFileSync,
  removeDeviceFile,
} from './syncFiles'

const PUBLISH_DELAY_MS = 2000

function requestDownloads(paths: string[]): void {
  if (process.platform !== 'darwin') return
  for (const path of paths) {
    execFile('/usr/bin/brctl', ['download', path], (error) => {
      if (error) console.warn('[sync] could not download from icloud', path, error.message)
    })
  }
}
const PULL_DELAY_MS = 500
const POLL_MS = 30_000

type Task = 'pull' | 'publish'

export function iCloudSyncFolder(): string | null {
  if (process.platform !== 'darwin') return null
  const root = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
  return existsSync(root) ? join(root, 'Ante') : null
}

const describeError = (error: unknown): string => {
  const code = error instanceof Error && 'code' in error ? error.code : null
  if (code === 'EACCES' || code === 'EPERM') return 'Ante is not allowed to use the sync folder'
  if (code === 'ENOSPC') return 'The sync folder is out of space'
  return 'Could not sync with the folder'
}

export class SyncManager {
  readonly #store: Store
  readonly #iCloudFolder: string | null
  readonly #navigate: (id: Id, url: string) => void
  #folder: string | null = null
  #baseline: SyncEntities | null = null
  #baselineLoaded = false
  #written: SyncEntities | null = null
  #watcher: FSWatcher | null = null
  #watchedFolder: string | null = null
  #publishTimer: NodeJS.Timeout | null = null
  #pullTimer: NodeJS.Timeout | null = null
  #pollTimer: NodeJS.Timeout | null = null
  #pending = new Set<Task>()
  #busy = false
  #lastSyncedAt: number | null = null
  #devices = 0
  #error: string | null = null

  constructor(
    store: Store,
    navigate: (id: Id, url: string) => void = () => undefined,
    iCloudFolder: string | null = iCloudSyncFolder(),
  ) {
    this.#store = store
    this.#navigate = navigate
    this.#iCloudFolder = iCloudFolder
  }

  get #settings() {
    return this.#store.state.data.settings.sync
  }

  start(): () => void {
    const { deviceId, deviceName } = this.#settings
    if (!deviceId || !deviceName) {
      this.#store.dispatch({
        type: 'sync/configure',
        patch: {
          deviceId: deviceId || randomUUID(),
          deviceName: deviceName || hostname().slice(0, 200) || 'Computer',
        },
      })
    }
    const unsubscribe = this.#store.subscribe((change) => {
      if (change.prev.data.settings.sync.folder !== change.state.data.settings.sync.folder) {
        this.#configure()
        return
      }
      if (change.action.type === 'sync/apply') return
      if (change.patches.some((patch) => touchesSyncedData(patch.path))) this.#schedulePublish()
    })
    this.#pollTimer = setInterval(() => this.#schedulePull(0), POLL_MS)
    this.#configure()
    this.#report()
    return () => {
      unsubscribe()
      this.#clearTimers()
      this.#closeWatcher()
    }
  }

  async run(parent: BrowserWindow | null, command: SyncCommand): Promise<void> {
    switch (command.type) {
      case 'sync/useICloud': {
        const folder = this.#iCloudFolder
        if (!folder) return
        try {
          await mkdir(folder, { recursive: true })
        } catch (error) {
          this.#fail(describeError(error))
          return
        }
        this.#setFolder(folder)
        return
      }
      case 'sync/chooseFolder': {
        const options: OpenDialogOptions = {
          title: 'Choose a Sync Folder',
          buttonLabel: 'Sync Here',
          properties: ['openDirectory', 'createDirectory'],
        }
        const result = parent
          ? await dialog.showOpenDialog(parent, options)
          : await dialog.showOpenDialog(options)
        const [folder] = result.filePaths
        if (!result.canceled && folder) this.#setFolder(folder)
        return
      }
      case 'sync/stop': {
        const folder = this.#folder
        const { deviceId } = this.#settings
        this.#setFolder(null)
        if (folder && deviceId) {
          removeDeviceFile(folder, deviceId).catch((error: unknown) => {
            console.warn('[sync] could not remove device file', error)
          })
        }
        return
      }
      case 'sync/now':
        this.#schedulePull(0)
        return
    }
  }

  flush(): void {
    if (!this.#publishTimer) return
    clearTimeout(this.#publishTimer)
    this.#publishTimer = null
    const folder = this.#folder
    const { deviceId, deviceName } = this.#settings
    if (!folder || !deviceId || !this.#baseline || this.#busy) return
    const now = Date.now()
    const entities = diffEntities(syncSnapshot(this.#store.state.data), this.#baseline, now)
    if (this.#written && sameEntities(this.#written, entities)) return
    try {
      if (!statSync(folder).isDirectory()) return
      writeDeviceFileSync(folder, createDeviceFile(deviceId, deviceName, entities, now))
    } catch (error) {
      console.warn('[sync] final write failed', error)
    }
  }

  #setFolder(folder: string | null): void {
    this.#store.dispatch({ type: 'sync/configure', patch: { folder } })
  }

  #configure(): void {
    const folder = this.#settings.folder
    if (folder === this.#folder) return
    this.#folder = folder
    this.#baseline = null
    this.#baselineLoaded = false
    this.#written = null
    this.#devices = 0
    this.#error = null
    this.#lastSyncedAt = null
    this.#closeWatcher()
    if (this.#publishTimer) clearTimeout(this.#publishTimer)
    this.#publishTimer = null
    this.#report()
    if (folder) this.#schedulePull(0)
  }

  #schedulePublish(): void {
    if (!this.#folder || this.#publishTimer) return
    this.#publishTimer = setTimeout(() => {
      this.#publishTimer = null
      this.#enqueue('publish')
    }, PUBLISH_DELAY_MS)
  }

  #schedulePull(delay: number): void {
    if (!this.#folder) return
    if (this.#pullTimer) clearTimeout(this.#pullTimer)
    this.#pullTimer = setTimeout(() => {
      this.#pullTimer = null
      this.#enqueue('pull')
    }, delay)
  }

  #enqueue(task: Task): void {
    this.#pending.add(task)
    void this.#drain()
  }

  async #drain(): Promise<void> {
    if (this.#busy) return
    this.#busy = true
    try {
      while (this.#pending.size > 0) {
        const task: Task = this.#pending.has('pull') ? 'pull' : 'publish'
        this.#pending.clear()
        const folder = this.#folder
        if (!folder) continue
        try {
          if (task === 'pull') await this.#pull(folder)
          else await this.#publish(folder)
        } catch (error) {
          console.warn('[sync] failed', error)
          if (folder === this.#folder) this.#fail(describeError(error))
        }
      }
    } finally {
      this.#busy = false
    }
  }

  async #pull(folder: string): Promise<void> {
    const { deviceId, deviceName } = this.#settings
    if (!deviceId) return
    if (!(await folderExists(folder))) {
      this.#closeWatcher()
      this.#fail('The sync folder is not available')
      return
    }
    const { files, evicted } = await readDeviceFiles(folder)
    if (folder !== this.#folder) return
    requestDownloads(evicted)
    if (!this.#baselineLoaded) {
      const found = files.find((file) => file.deviceId === deviceId)
      const own = found && isFreshDevice(found, Date.now()) ? found : undefined
      this.#baseline = own?.entities ?? null
      this.#written = own?.entities ?? null
      this.#baselineLoaded = true
    }
    const now = Date.now()
    const result = syncCycle({
      data: this.#store.state.data,
      deviceId,
      baseline: this.#baseline,
      remotes: files,
      now,
      apply: (entities, options) => {
        const before = this.#store.state.data
        this.#store.dispatch({
          type: 'sync/apply',
          entities,
          dropSpaces: [...(options.dropSpaces ?? [])],
        })
        const { data, runtime } = this.#store.state
        for (const { id, url } of movedTabs(before, data, Object.keys(runtime.tabs)))
          this.#navigate(id, url)
        return data
      },
    })
    this.#baseline = result.entities
    this.#devices = files.filter(
      (file) => file.deviceId !== deviceId && isFreshDevice(file, now),
    ).length
    await this.#write(folder, deviceId, deviceName, result.entities, now)
    if (folder !== this.#folder) return
    this.#watch(folder, deviceId)
    this.#succeed(now)
  }

  async #publish(folder: string): Promise<void> {
    const { deviceId, deviceName } = this.#settings
    if (!deviceId) return
    const baseline = this.#baseline
    if (!this.#baselineLoaded || !baseline) {
      await this.#pull(folder)
      return
    }
    const now = Date.now()
    const entities = diffEntities(syncSnapshot(this.#store.state.data), baseline, now)
    this.#baseline = entities
    if (this.#written && sameEntities(this.#written, entities)) return
    if (!(await folderExists(folder))) {
      this.#fail('The sync folder is not available')
      return
    }
    await this.#write(folder, deviceId, deviceName, entities, now)
    if (folder !== this.#folder) return
    this.#succeed(now)
  }

  async #write(
    folder: string,
    deviceId: string,
    deviceName: string,
    entities: SyncEntities,
    now: number,
  ): Promise<void> {
    if (this.#written && sameEntities(this.#written, entities)) return
    await writeDeviceFile(folder, createDeviceFile(deviceId, deviceName, entities, now))
    this.#written = entities
  }

  #watch(folder: string, deviceId: string): void {
    if (this.#watcher && this.#watchedFolder === folder) return
    this.#closeWatcher()
    this.#watchedFolder = folder
    const own = deviceFileName(deviceId)
    try {
      this.#watcher = watch(devicesDir(folder), (_event, name) => {
        if (name && (name.startsWith('.') || name === own)) return
        this.#schedulePull(PULL_DELAY_MS)
      })
      this.#watcher.on('error', () => this.#closeWatcher())
    } catch {
      this.#watcher = null
    }
  }

  #closeWatcher(): void {
    this.#watcher?.close()
    this.#watcher = null
    this.#watchedFolder = null
  }

  #clearTimers(): void {
    for (const timer of [this.#publishTimer, this.#pullTimer]) if (timer) clearTimeout(timer)
    if (this.#pollTimer) clearInterval(this.#pollTimer)
    this.#publishTimer = null
    this.#pullTimer = null
    this.#pollTimer = null
  }

  #succeed(now: number): void {
    this.#lastSyncedAt = now
    this.#error = null
    this.#report()
  }

  #fail(message: string): void {
    this.#error = message
    this.#report()
  }

  #report(): void {
    const status: SyncStatus = {
      state: !this.#folder
        ? 'off'
        : this.#error
          ? 'error'
          : this.#lastSyncedAt === null
            ? 'syncing'
            : 'ok',
      lastSyncedAt: this.#lastSyncedAt,
      error: this.#error,
      devices: this.#devices,
      iCloudFolder: this.#iCloudFolder,
    }
    this.#store.dispatch({ type: 'runtime/sync', status })
  }
}

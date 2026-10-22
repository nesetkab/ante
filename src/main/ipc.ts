import { ipcMain, webContents } from 'electron'
import type { Patch } from 'immer'
import { commandSchema } from '@shared/commands'
import { IPC, type PatchBatch, type Snapshot } from '@shared/ipc'
import { uiActionSchema } from '@shared/state/actions'
import type { CommandRunner } from './commands'
import type { Store } from './store'
import type { SurfaceRegistry } from './surfaces'

interface IpcDeps {
  store: Store
  surfaces: SurfaceRegistry
  runner: CommandRunner
}

export function registerIpc({ store, surfaces, runner }: IpcDeps): void {
  ipcMain.handle(IPC.snapshot, (event): Snapshot => {
    if (!surfaces.get(event.sender)) throw new Error('Unknown surface')
    return { version: store.version, state: store.state }
  })

  ipcMain.on(IPC.dispatch, (event, raw: unknown) => {
    if (!surfaces.get(event.sender)) return
    const parsed = uiActionSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[ipc] rejected action', parsed.error.issues[0])
      return
    }
    store.dispatch(parsed.data)
  })

  ipcMain.on(IPC.command, (event, raw: unknown) => {
    const surface = surfaces.get(event.sender)
    if (!surface) return
    const parsed = commandSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[ipc] rejected command', parsed.error.issues[0])
      return
    }
    runner.run(surface.windowId, parsed.data)
  })
}

export function broadcastPatches(store: Store, surfaces: SurfaceRegistry): () => void {
  let pending: Patch[] = []
  let from = store.version
  let scheduled = false

  const flush = () => {
    scheduled = false
    if (pending.length === 0) return
    const batch: PatchBatch = { from, to: store.version, patches: pending }
    pending = []
    from = store.version
    for (const { contentsId } of surfaces.all()) {
      const contents = webContents.fromId(contentsId)
      if (contents && !contents.isDestroyed()) contents.send(IPC.patches, batch)
    }
  }

  return store.subscribe((change) => {
    pending.push(...change.patches)
    if (scheduled) return
    scheduled = true
    setImmediate(flush)
  })
}

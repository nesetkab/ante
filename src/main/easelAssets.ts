import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ipcMain, net, protocol, session } from 'electron'
import { ASSET_SCHEME, isAssetName, MAX_ASSET_BYTES, sniffImageType } from '@shared/easels'
import { IPC } from '@shared/ipc'
import type { SurfaceRegistry } from './surfaces'

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

export class EaselAssets {
  readonly #directory: string

  constructor(directory: string) {
    this.#directory = directory
  }

  serve(surfaces: SurfaceRegistry): void {
    session.defaultSession.protocol.handle(ASSET_SCHEME, (request) => {
      const name = new URL(request.url).pathname.replace(/^\//, '')
      if (!isAssetName(name)) return new Response(null, { status: 404 })
      return net.fetch(pathToFileURL(join(this.#directory, name)).href)
    })
    ipcMain.handle(IPC.saveAsset, async (event, raw: unknown) => {
      if (!surfaces.verify(event.sender, event.senderFrame)) throw new Error('Unknown surface')
      if (!(raw instanceof Uint8Array)) return null
      return this.save(raw)
    })
  }

  async save(bytes: Uint8Array): Promise<string | null> {
    const type = sniffImageType(bytes)
    if (!type || bytes.byteLength > MAX_ASSET_BYTES) return null
    await mkdir(this.#directory, { recursive: true })
    const name = `${randomUUID()}.${type}`
    await writeFile(join(this.#directory, name), bytes)
    return name
  }

  async collect(referenced: ReadonlySet<string>, minAgeMs = 0): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.#directory)
    } catch {
      return
    }
    const cutoff = Date.now() - minAgeMs
    await Promise.all(
      names
        .filter((name) => isAssetName(name) && !referenced.has(name))
        .map(async (name) => {
          const path = join(this.#directory, name)
          try {
            if (minAgeMs > 0 && (await stat(path)).mtimeMs > cutoff) return
            await unlink(path)
          } catch {
            return
          }
        }),
    )
  }
}

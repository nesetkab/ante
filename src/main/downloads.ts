import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app, shell, type DownloadItem, type Session } from 'electron'
import { isActiveDownload, uniqueFileName } from '@shared/downloads'
import type { DownloadCommand } from '@shared/library'
import type { DownloadRuntime, DownloadState, Id } from '@shared/schema'
import type { Sessions } from './sessions'
import type { Store } from './store'

const UPDATE_INTERVAL_MS = 250

interface Tracked {
  item: DownloadItem
  session: Session
  lastUpdate: number
}

export class DownloadManager {
  readonly #store: Store
  readonly #tracked = new Map<Id, Tracked>()
  readonly #reserved = new Set<string>()
  readonly #fallback: () => string

  constructor(store: Store, sessions: Sessions, fallback = () => app.getPath('downloads')) {
    this.#store = store
    this.#fallback = fallback
    sessions.onCreate((session, profileId) => {
      session.on('will-download', (_event, item) => this.#track(item, session, profileId))
    })
  }

  #directory(): string {
    const folder = this.#store.state.data.settings.downloadFolder
    if (folder) {
      try {
        if (statSync(folder).isDirectory()) return folder
      } catch {
        return this.#fallback()
      }
    }
    return this.#fallback()
  }

  #download(id: Id): DownloadRuntime | undefined {
    return this.#store.state.runtime.downloads[id]
  }

  #track(item: DownloadItem, session: Session, profileId: Id): void {
    const id = randomUUID()
    const directory = this.#directory()
    const filename = uniqueFileName(item.getFilename(), (candidate) => {
      const path = join(directory, candidate)
      return this.#reserved.has(path) || existsSync(path)
    })
    const path = join(directory, filename)
    const ask = this.#store.state.data.settings.askWhereToSave
    this.#reserved.add(path)
    if (ask) item.setSaveDialogOptions({ defaultPath: path })
    else item.setSavePath(path)
    this.#tracked.set(id, { item, session, lastUpdate: 0 })
    this.#store.dispatch({
      type: 'download/add',
      download: {
        id,
        url: item.getURL(),
        filename,
        path,
        state: 'progressing',
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        startedAt: Date.now(),
        finishedAt: null,
        profileId,
      },
    })

    item.on('updated', (_event, state) => {
      const tracked = this.#tracked.get(id)
      if (!tracked) return
      if (ask) this.#followChosenPath(id, item)
      const next: DownloadState =
        state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
      const now = Date.now()
      if (next === this.#download(id)?.state && now - tracked.lastUpdate < UPDATE_INTERVAL_MS)
        return
      tracked.lastUpdate = now
      this.#update(id, item, next)
    })
    item.once('done', (_event, state) => {
      this.#reserved.delete(path)
      if (ask && state === 'cancelled' && !item.getSavePath()) {
        this.#tracked.delete(id)
        this.#store.dispatch({ type: 'download/remove', ids: [id] })
        return
      }
      if (ask) this.#followChosenPath(id, item)
      this.#update(id, item, state, Date.now())
      if (state === 'completed' && process.platform === 'darwin')
        app.dock?.downloadFinished(item.getSavePath() || path)
    })
  }

  #followChosenPath(id: Id, item: DownloadItem): void {
    const chosen = item.getSavePath()
    const download = this.#download(id)
    if (!chosen || !download || chosen === download.path) return
    this.#store.dispatch({
      type: 'download/update',
      id,
      patch: { path: chosen, filename: basename(chosen) },
    })
  }

  #update(id: Id, item: DownloadItem, state: DownloadState, finishedAt: number | null = null) {
    if (!this.#download(id)) return
    this.#store.dispatch({
      type: 'download/update',
      id,
      patch: {
        state,
        finishedAt,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      },
    })
  }

  #retry(id: Id): void {
    const download = this.#download(id)
    const tracked = this.#tracked.get(id)
    if (!download || !tracked || isActiveDownload(download)) return
    if (download.state === 'interrupted' && tracked.item.canResume()) {
      tracked.item.resume()
      this.#update(id, tracked.item, 'progressing')
      return
    }
    this.#remove(id)
    tracked.session.downloadURL(download.url)
  }

  #remove(id: Id): void {
    const tracked = this.#tracked.get(id)
    const download = this.#download(id)
    if (tracked && download && isActiveDownload(download)) tracked.item.cancel()
    this.#tracked.delete(id)
    this.#store.dispatch({ type: 'download/remove', ids: [id] })
  }

  run(command: DownloadCommand): void {
    if (command.type === 'clear') {
      const finished = Object.values(this.#store.state.runtime.downloads).filter(
        (download) => !isActiveDownload(download),
      )
      for (const download of finished) this.#tracked.delete(download.id)
      this.#store.dispatch({ type: 'download/remove', ids: finished.map(({ id }) => id) })
      return
    }
    const download = this.#download(command.id)
    const item = this.#tracked.get(command.id)?.item
    if (!download) return
    switch (command.type) {
      case 'open':
        if (download.state === 'completed') void shell.openPath(download.path)
        return
      case 'show':
        if (existsSync(download.path)) shell.showItemInFolder(download.path)
        else void shell.openPath(this.#directory())
        return
      case 'cancel':
        if (isActiveDownload(download)) item?.cancel()
        return
      case 'pause':
        if (download.state === 'progressing' && item) {
          item.pause()
          this.#update(command.id, item, 'paused')
        }
        return
      case 'resume':
        if (download.state === 'paused' && item?.canResume()) {
          item.resume()
          this.#update(command.id, item, 'progressing')
        }
        return
      case 'retry':
        this.#retry(command.id)
        return
      case 'remove':
        this.#remove(command.id)
        return
    }
  }
}

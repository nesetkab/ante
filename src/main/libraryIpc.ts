import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { historyDeleteSchema, historyQuerySchema, type HistoryResult } from '@shared/history'
import { downloadCommandSchema, LIBRARY_IPC } from '@shared/library'
import type { Id } from '@shared/schema'
import { DEFAULT_PROFILE_ID } from '@shared/state/initial'
import { parseSuggestions, suggestQuerySchema, suggestUrl } from '@shared/suggest'
import type { DownloadManager } from './downloads'
import type { HistoryStore } from './history'
import { chromeUserAgent } from './sessions'
import type { Store } from './store'
import type { SurfaceRegistry } from './surfaces'

const SUGGEST_TIMEOUT_MS = 1500

interface LibraryIpcDeps {
  store: Store
  surfaces: SurfaceRegistry
  history: HistoryStore
  downloads: DownloadManager
  onHistoryCleared: (profileId: Id) => void
}

export function registerLibraryIpc({
  store,
  surfaces,
  history,
  downloads,
  onHistoryCleared,
}: LibraryIpcDeps) {
  const pendingSuggestions = new Map<number, AbortController>()
  const userAgent = chromeUserAgent(app.userAgentFallback)

  const profileOf = (event: IpcMainInvokeEvent): Id => {
    const surface = surfaces.verify(event.sender, event.senderFrame)
    if (!surface) throw new Error('Unknown surface')
    const { data } = store.state
    const spaceId = data.windows[surface.windowId]?.spaceId
    return (spaceId && data.spaces[spaceId]?.profileId) ?? DEFAULT_PROFILE_ID
  }

  ipcMain.handle(LIBRARY_IPC.historySearch, (event, raw: unknown): HistoryResult => {
    const profileId = profileOf(event)
    return history.search(profileId, historyQuerySchema.parse(raw))
  })

  ipcMain.handle(LIBRARY_IPC.historyDelete, (event, raw: unknown) => {
    const profileId = profileOf(event)
    history.delete(profileId, historyDeleteSchema.parse(raw))
  })

  ipcMain.handle(LIBRARY_IPC.historyClear, (event) => {
    const profileId = profileOf(event)
    history.clear(profileId)
    onHistoryCleared(profileId)
  })

  ipcMain.handle(LIBRARY_IPC.suggest, async (event, raw: unknown): Promise<string[]> => {
    if (!surfaces.verify(event.sender, event.senderFrame)) throw new Error('Unknown surface')
    const senderId = event.sender.id
    pendingSuggestions.get(senderId)?.abort()
    const parsed = suggestQuerySchema.safeParse(raw)
    if (!parsed.success) return []
    const endpoint = suggestUrl(store.state.data.settings.searchEngine, parsed.data)
    if (!endpoint) return []
    const controller = new AbortController()
    pendingSuggestions.set(senderId, controller)
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(SUGGEST_TIMEOUT_MS)]),
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        credentials: 'omit',
      })
      if (!response.ok) return []
      return parseSuggestions(await response.json(), parsed.data)
    } catch {
      return []
    } finally {
      if (pendingSuggestions.get(senderId) === controller) pendingSuggestions.delete(senderId)
    }
  })

  ipcMain.on(LIBRARY_IPC.download, (event, raw: unknown) => {
    if (!surfaces.verify(event.sender, event.senderFrame)) return
    const parsed = downloadCommandSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[ipc] rejected download command', parsed.error.issues[0])
      return
    }
    downloads.run(parsed.data)
  })
}

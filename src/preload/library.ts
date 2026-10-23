import { ipcRenderer } from 'electron'
import type { HistoryResult } from '@shared/history'
import { LIBRARY_IPC, type LibraryApi } from '@shared/library'

export const libraryApi: LibraryApi = {
  searchHistory: (query) =>
    ipcRenderer.invoke(LIBRARY_IPC.historySearch, query) as Promise<HistoryResult>,
  deleteHistory: (ids) => ipcRenderer.invoke(LIBRARY_IPC.historyDelete, ids) as Promise<void>,
  clearHistory: () => ipcRenderer.invoke(LIBRARY_IPC.historyClear) as Promise<void>,
  suggest: (query) => ipcRenderer.invoke(LIBRARY_IPC.suggest, query) as Promise<string[]>,
  download: (command) => ipcRenderer.send(LIBRARY_IPC.download, command),
}

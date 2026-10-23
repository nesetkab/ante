import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AnteApi, type PatchBatch, type Snapshot, type UiEvent } from '@shared/ipc'
import { libraryApi } from './library'

const api: AnteApi = {
  platform: process.platform,
  snapshot: () => ipcRenderer.invoke(IPC.snapshot) as Promise<Snapshot>,
  onPatches: (listener) => {
    const handler = (_event: IpcRendererEvent, batch: PatchBatch) => listener(batch)
    ipcRenderer.on(IPC.patches, handler)
    return () => ipcRenderer.removeListener(IPC.patches, handler)
  },
  dispatch: (action) => ipcRenderer.send(IPC.dispatch, action),
  command: (command) => ipcRenderer.send(IPC.command, command),
  onUiEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, uiEvent: UiEvent) => listener(uiEvent)
    ipcRenderer.on(IPC.ui, handler)
    return () => ipcRenderer.removeListener(IPC.ui, handler)
  },
}

contextBridge.exposeInMainWorld('ante', api)
contextBridge.exposeInMainWorld('anteLibrary', libraryApi)

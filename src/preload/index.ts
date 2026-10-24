import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
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
  saveAsset: (bytes) => ipcRenderer.invoke(IPC.saveAsset, bytes) as Promise<string | null>,
  pathForFile: (file) => webUtils.getPathForFile(file),
  onUiEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, uiEvent: UiEvent) => listener(uiEvent)
    ipcRenderer.on(IPC.ui, handler)
    return () => ipcRenderer.removeListener(IPC.ui, handler)
  },
}

contextBridge.exposeInMainWorld('ante', api)

injectBrowserAction()
contextBridge.exposeInMainWorld('anteLibrary', libraryApi)

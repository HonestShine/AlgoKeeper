import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '../shared/types/ipc'

// M0：最小桥。后续按 src/shared/types/ipc.ts 的 IpcChannels 逐个补充通道包装。
const api: RendererApi = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  versions: {
    electron: process.versions.electron,
    node: process.versions.node
  }
}

contextBridge.exposeInMainWorld('api', api)

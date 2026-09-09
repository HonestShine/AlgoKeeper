import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../shared/ipc/channels'
import type { RendererApi } from '../shared/types/ipc'
import type { NewNoteDraft, SaveNoteInput } from '../shared/types/note'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

const api: RendererApi = {
  ping: () => invoke<string>(CH.ping),
  versions: {
    electron: process.versions.electron,
    node: process.versions.node
  },

  settings: {
    get: () => invoke(CH.settingsGet),
    set: (p) => invoke(CH.settingsSet, p),
    pickRoot: () => invoke(CH.settingsPick)
  },

  notes: {
    list: () => invoke(CH.notesList),
    get: (noteId) => invoke(CH.notesGet, noteId),
    create: (draft: NewNoteDraft) => invoke(CH.notesCreate, draft),
    save: (input: SaveNoteInput) => invoke(CH.notesSave, input)
  },

  parseUrl: (raw) => invoke(CH.parseUrl, raw)
}

contextBridge.exposeInMainWorld('api', api)

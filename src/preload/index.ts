import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { CH } from '../shared/ipc/channels'
import type { MenuAction, RendererApi } from '../shared/types/ipc'
import type { SearchFilter } from '../shared/types/insight'
import type { ExportRequest } from '../shared/types/export'
import type { NewNoteDraft, SaveAsTarget, SaveNoteInput } from '../shared/types/note'
import type { ReviewFilter, ReviewResult } from '../shared/types/srs'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

const api: RendererApi = {
  ping: () => invoke<string>(CH.ping),
  versions: {
    electron: process.versions.electron,
    node: process.versions.node
  },

  window: {
    newWindow: () => invoke<void>(CH.appNewWindow)
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
    save: (input: SaveNoteInput) => invoke(CH.notesSave, input),
    saveAs: (input: { noteId: string; target: SaveAsTarget }) => invoke(CH.notesSaveAs, input),
    related: (noteId: string) => invoke(CH.notesRelated, noteId),
    delete: (noteId: string) => invoke(CH.notesDelete, noteId),
    reveal: (p) => invoke(CH.notesReveal, p),
    importNote: () => invoke(CH.notesImport)
  },

  review: {
    dueCount: (filter?: ReviewFilter) => invoke(CH.reviewDueCount, filter),
    collect: (filter?: ReviewFilter) => invoke(CH.reviewCollect, filter),
    commit: (results: ReviewResult[]) => invoke(CH.reviewCommit, results)
  },

  parseUrl: (raw) => invoke(CH.parseUrl, raw),

  search: {
    query: (filter: SearchFilter) => invoke(CH.searchQuery, filter)
  },
  stats: {
    overview: () => invoke(CH.statsOverview)
  },

  export: {
    run: (req: ExportRequest) => invoke(CH.exportRun, req)
  },

  onMenuAction: (cb) => {
    const listener = (_e: IpcRendererEvent, action: MenuAction): void => cb(action)
    ipcRenderer.on(CH.menuAction, listener)
    return () => ipcRenderer.removeListener(CH.menuAction, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

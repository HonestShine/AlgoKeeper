import { dialog, ipcMain } from 'electron'
import { CH } from '../../shared/ipc/channels'
import { parseProblemUrl } from '../../shared/utils/url'
import { getSettings, setNotesRoot } from '../services/settings-store'
import { createNote, listNotes, readNote, saveAsNote, saveNote } from '../services/note-store'
import { collectDue, commitReviews } from '../services/srs-store'
import type { NewNoteDraft, SaveAsTarget, SaveNoteInput } from '../../shared/types/note'
import type { ReviewResult } from '../../shared/types/srs'

/** 统一把领域错误格式化为可经 IPC 透传的 Error（`[code] message`）。 */
function toIpcError(err: unknown): Error {
  const e = err as { code?: string; message?: string }
  const code = e.code ? e.code : 'app.error'
  const message = e.message ?? String(err)
  return new Error(`[${code}] ${message}`)
}

/** 注册一个带类型 payload 与统一错误处理的 invoke 通道。 */
function reg<A, R>(channel: string, fn: (arg: A) => Promise<R>): void {
  ipcMain.handle(channel, async (_event, payload: A) => {
    try {
      return await fn(payload)
    } catch (err) {
      throw toIpcError(err)
    }
  })
}

async function currentRoot(): Promise<string> {
  return (await getSettings()).notesRoot
}

export function registerIpc(): void {
  reg(CH.ping, async () => 'pong')

  reg(CH.settingsGet, async () => ({ settings: await getSettings() }))
  reg(CH.settingsSet, async (payload: { notesRoot?: string }) => {
    if (!payload?.notesRoot) throw Object.assign(new Error('notesRoot 必填'), { code: 'settings.missing' })
    return { settings: await setNotesRoot(payload.notesRoot) }
  })
  reg(CH.settingsPick, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return { settings: await setNotesRoot(res.filePaths[0]) }
  })

  reg(CH.notesList, async () => listNotes(await currentRoot()))
  reg(CH.notesGet, async (noteId: string) => readNote(await currentRoot(), noteId))
  reg(CH.notesCreate, async (draft: NewNoteDraft) => createNote(await currentRoot(), draft))
  reg(CH.notesSave, async (input: SaveNoteInput) => saveNote(await currentRoot(), input))
  reg(CH.notesSaveAs, async (input: { noteId: string; target: SaveAsTarget }) =>
    saveAsNote(await currentRoot(), input.noteId, input.target)
  )
  reg(CH.reviewDueCount, async () => (await collectDue(await currentRoot())).length)
  reg(CH.reviewCollect, async () => collectDue(await currentRoot()))
  reg(CH.reviewCommit, async (results: ReviewResult[]) => commitReviews(await currentRoot(), results))
  reg(CH.parseUrl, async (raw: string) => parseProblemUrl(raw))
}

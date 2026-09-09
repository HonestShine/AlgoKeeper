import { dialog, ipcMain } from 'electron'
import { CH } from '../../shared/ipc/channels'
import { parseProblemUrl } from '../../shared/utils/url'
import { getSettings, updateSettings } from '../services/settings-store'
import { createNote, listNotes, readNote, saveAsNote, saveNote } from '../services/note-store'
import { collectDue, commitReviews } from '../services/srs-store'
import { indexNote, recordReviewLogs } from '../services/indexer'
import { searchNotes } from '../services/search-service'
import { statsOverview } from '../services/stats-service'
import { relatedNotes } from '../services/related-service'
import { exportScope } from '../services/exporter'
import type { SearchFilter } from '../../shared/types/insight'
import type { ExportRequest } from '../../shared/types/export'
import type { NewNoteDraft, SaveAsTarget, SaveNoteInput } from '../../shared/types/note'
import type { ReviewFilter, ReviewResult } from '../../shared/types/srs'
import type { SettingsUpdate } from '../../shared/types/settings'

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

/** review 队列过滤默认带上设置的每日新卡上限 */
async function withDefaultLimit(filter: ReviewFilter = {}): Promise<ReviewFilter> {
  const settings = await getSettings()
  return { ...filter, newLimit: filter.newLimit ?? settings.newCardLimit }
}

export function registerIpc(): void {
  reg(CH.ping, async () => 'pong')

  reg(CH.settingsGet, async () => ({ settings: await getSettings() }))
  reg(CH.settingsSet, async (payload: SettingsUpdate) => {
    if (!payload || Object.keys(payload).length === 0) return { settings: await getSettings() }
    return { settings: await updateSettings(payload) }
  })
  reg(CH.settingsPick, async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return { settings: await updateSettings({ notesRoot: res.filePaths[0] }) }
  })

  reg(CH.notesList, async () => listNotes(await currentRoot()))
  reg(CH.notesGet, async (noteId: string) => readNote(await currentRoot(), noteId))
  reg(CH.notesCreate, async (draft: NewNoteDraft) => {
    const root = await currentRoot()
    const note = await createNote(root, draft)
    await indexNote(root, note.noteId)
    return note
  })
  reg(CH.notesSave, async (input: SaveNoteInput) => {
    const root = await currentRoot()
    const res = await saveNote(root, input)
    await indexNote(root, input.noteId)
    return res
  })
  reg(CH.notesSaveAs, async (input: { noteId: string; target: SaveAsTarget }) => {
    const root = await currentRoot()
    const note = await saveAsNote(root, input.noteId, input.target)
    await indexNote(root, note.noteId)
    return note
  })
  reg(CH.notesRelated, async (noteId: string) => relatedNotes(await currentRoot(), noteId))
  reg(CH.exportRun, async (req: ExportRequest) => {
    if (req.format === 'pdf') {
      throw Object.assign(new Error('PDF 导出尚未实现，请使用 Markdown / HTML'), { code: 'export.pdf' })
    }
    const root = await currentRoot()
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return exportScope(root, res.filePaths[0], req)
  })
  reg(CH.reviewDueCount, async (filter?: ReviewFilter) => (await collectDue(await currentRoot(), await withDefaultLimit(filter))).length)
  reg(CH.reviewCollect, async (filter?: ReviewFilter) => collectDue(await currentRoot(), await withDefaultLimit(filter)))
  reg(CH.reviewCommit, async (results: ReviewResult[]) => {
    const root = await currentRoot()
    const outcome = await commitReviews(root, results)
    recordReviewLogs(outcome.logs)
    const touched = [...new Set(outcome.logs.map((l) => l.noteId))]
    for (const noteId of touched) await indexNote(root, noteId)
    return outcome.written
  })
  reg(CH.searchQuery, async (filter: SearchFilter) => searchNotes(await currentRoot(), filter))
  reg(CH.statsOverview, async () => statsOverview())
  reg(CH.parseUrl, async (raw: string) => parseProblemUrl(raw))
}

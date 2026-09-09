/**
 * 仅供开发期网页测试（Playwright/无 preload）的内存假后端。
 * 持久化到 localStorage（键 alk:notes）。生产打包经 import.meta.env.DEV 剔除。
 */
import type { RendererApi } from '../../shared/types/ipc'
import type { FileMeta, LoadedNote, NewNoteDraft, SaveNoteInput } from '../../shared/types/note'
import type { AppSettings } from '../../shared/types/settings'
import { parseProblemUrl } from '../../shared/utils/url'

const LS_KEY = 'alk:notes'
const SETTINGS_KEY = 'alk:settings'

interface StoreNote {
  noteId: string
  meta: FileMeta
  bodyMd: string
}

function isoNow(): string {
  return new Date().toISOString()
}

function sampleNote(): StoreNote {
  return {
    noteId: 'leetcode/two-sum',
    meta: {
      source: 'leetcode',
      id: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['array', 'hash-table'],
      status: 'active',
      aliases: [],
      createdAt: '2026-09-01T09:12:00.000Z',
      updatedAt: '2026-09-08T21:47:00.000Z'
    },
    bodyMd:
      '# Two Sum\n\n> 给定整数数组与目标值，返回两数下标，使和等于目标值。\n\n## 解法一：哈希表\n\n一遍遍历，边存边查补数。\n\n```ts\nfunction twoSum(nums, target) {}\n```\n\n**时间复杂度**：O(n)　**空间复杂度**：O(n)\n'
  }
}

function loadNotes(): StoreNote[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? (JSON.parse(raw) as StoreNote[]) : []
    return arr.length ? arr : [sampleNote()]
  } catch {
    return [sampleNote()]
  }
}

function persist(notes: StoreNote[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(notes))
}

export function installFakeApi(): RendererApi {
  let notes = loadNotes()

  const read = (noteId: string): LoadedNote => {
    const found = notes.find((n) => n.noteId === noteId)
    if (!found) throw Object.assign(new Error(`笔记不存在: ${noteId}`), { code: 'note.not-found' })
    return { noteId: found.noteId, filePath: `<virtual>/${noteId}.md`, meta: { ...found.meta }, bodyMd: found.bodyMd, warnings: [] }
  }

  const summarize = (n: StoreNote) => ({
    noteId: n.noteId,
    source: n.meta.source,
    id: n.meta.id,
    title: n.meta.title,
    difficulty: n.meta.difficulty,
    tags: n.meta.tags,
    status: n.meta.status,
    updatedAt: n.meta.updatedAt,
    filePath: `<virtual>/${n.noteId}.md`
  })

  const api: RendererApi = {
    ping: async () => 'pong',
    versions: { electron: '(fake)', node: '' },
    settings: {
      get: async () => {
        const stored = localStorage.getItem(SETTINGS_KEY)
        const payload = stored
          ? (JSON.parse(stored) as AppSettings)
          : { appRoot: '<dev>', notesRootDefault: '<dev>/Documents', notesRoot: '<dev>/Documents' }
        return { settings: payload }
      },
      set: async (p) => {
        const base = await api.settings.get()
        const next: AppSettings = { ...base.settings, notesRoot: p.notesRoot ?? base.settings.notesRoot }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
        return { settings: next }
      },
      pickRoot: async () => null
    },
    notes: {
      list: async () => [...notes].map(summarize).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      get: async (noteId) => read(noteId),
      create: async (draft: NewNoteDraft) => {
        const source = draft.meta.source || 'notes'
        const id = draft.meta.id || `untitled-${Date.now()}`
        const noteId = `${source}/${id}`
        if (notes.some((n) => n.noteId === noteId)) {
          throw Object.assign(new Error(`题解已存在: ${noteId}`), { code: 'notes.exist' })
        }
        const meta: FileMeta = { ...draft.meta, source, id, title: draft.meta.title || id, createdAt: isoNow(), updatedAt: isoNow() }
        notes = [...notes, { noteId, meta, bodyMd: draft.bodyMd }]
        persist(notes)
        return { noteId, filePath: `<virtual>/${noteId}.md`, meta, bodyMd: draft.bodyMd, warnings: [] }
      },
      save: async (input: SaveNoteInput) => {
        const idx = notes.findIndex((n) => n.noteId === input.noteId)
        if (idx < 0) throw Object.assign(new Error(`笔记不存在: ${input.noteId}`), { code: 'note.not-found' })
        const meta: FileMeta = { ...input.meta, updatedAt: isoNow() }
        const next = [...notes]
        next[idx] = { noteId: input.noteId, meta, bodyMd: input.bodyMd }
        notes = next
        persist(notes)
        return { noteId: input.noteId, updatedAt: meta.updatedAt }
      }
    },
    parseUrl: async (raw) => parseProblemUrl(raw)
  }
  return api
}

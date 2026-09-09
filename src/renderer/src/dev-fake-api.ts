/**
 * 仅供开发期网页测试（Playwright/无 preload）的内存假后端。
 * 持久化到 localStorage（键 alk:notes）。生产打包经 import.meta.env.DEV 剔除。
 */
import type { MenuAction, RendererApi } from '../../shared/types/ipc'
import type { FileMeta, LoadedNote, NewNoteDraft, SaveAsTarget, SaveNoteInput } from '../../shared/types/note'
import type { AppSettings } from '../../shared/types/settings'
import type { CardSessionItem, ReviewFilter, ReviewResult, SchedulingInfo } from '../../shared/types/srs'
import { parseProblemUrl } from '../../shared/utils/url'
import { todayKey } from '../../shared/utils/date'
import { newCardScheduling, schedule } from '../../shared/utils/sm2'
import { parseBodyCards } from '../../shared/utils/cards'

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

  const readSettingsSync = (): AppSettings => {
    try {
      const s = (JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AppSettings>) ?? {}
      return {
        appRoot: s.appRoot ?? '<dev>',
        notesRootDefault: s.notesRootDefault ?? '<dev>/Documents',
        notesRoot: s.notesRoot ?? '<dev>/Documents',
        newCardLimit: typeof s.newCardLimit === 'number' ? s.newCardLimit : 20
      }
    } catch {
      return { appRoot: '<dev>', notesRootDefault: '<dev>/Documents', notesRoot: '<dev>/Documents', newCardLimit: 20 }
    }
  }

  type SchedStore = Record<string, { main?: SchedulingInfo; cards?: Record<string, SchedulingInfo> }>
  const SCHED_KEY = 'alk:sched'
  const readSched = (): SchedStore => {
    try {
      return JSON.parse(localStorage.getItem(SCHED_KEY) ?? '{}') as SchedStore
    } catch {
      return {}
    }
  }
  const writeSched = (s: SchedStore): void => {
    localStorage.setItem(SCHED_KEY, JSON.stringify(s))
  }
  const collectCards = (filter: ReviewFilter = {}): CardSessionItem[] => {
    const today = todayKey()
    const sched = readSched()
    const newLimit = filter.newLimit ?? readSettingsSync().newCardLimit
    const passes = (item: CardSessionItem): boolean => {
      if (filter.difficulty && item.difficulty !== filter.difficulty) return false
      if (filter.tags && filter.tags.length > 0 && !filter.tags.some((t) => item.tags.includes(t))) return false
      return true
    }
    const dueItems: CardSessionItem[] = []
    const newItems: CardSessionItem[] = []
    for (const n of notes) {
      const ns = sched[n.noteId] ?? {}
      const difficulty = n.meta.difficulty
      const tags = n.meta.tags
      const wholeNew = ns.main === undefined
      const main = ns.main ?? newCardScheduling(today)
      const wholeItem: CardSessionItem = {
        cardId: `${n.noteId}::main`,
        noteId: n.noteId,
        noteTitle: n.meta.title,
        difficulty,
        tags,
        kind: 'whole',
        question: `回顾 “${n.meta.title}” 的完整解法`,
        answerText: n.bodyMd,
        due: main.due,
        isNew: wholeNew
      }
      if (passes(wholeItem)) {
        if (wholeNew) newItems.push(wholeItem)
        else if (main.due <= today) dueItems.push(wholeItem)
      }
      const cards = ns.cards ?? {}
      for (const line of parseBodyCards(n.bodyMd)) {
        const isNew = cards[line.qhash] === undefined
        const c = cards[line.qhash] ?? newCardScheduling(today)
        const item: CardSessionItem = {
          cardId: `${n.noteId}::${line.qhash}`,
          noteId: n.noteId,
          noteTitle: n.meta.title,
          difficulty,
          tags,
          kind: 'split',
          question: line.question,
          answerText: line.answer,
          due: c.due,
          isNew
        }
        if (!passes(item)) continue
        if (isNew) newItems.push(item)
        else if (c.due <= today) dueItems.push(item)
      }
    }
    const cappedNew = newLimit >= 0 ? newItems.slice(0, newLimit) : newItems
    return [...dueItems, ...cappedNew]
  }

  const api: RendererApi = {
    ping: async () => 'pong',
    versions: { electron: '(fake)', node: '' },
    settings: {
      get: async () => ({ settings: readSettingsSync() }),
      set: async (p) => {
        const base = readSettingsSync()
        const next: AppSettings = {
          notesRoot: p.notesRoot ?? base.notesRoot,
          newCardLimit: typeof p.newCardLimit === 'number' ? p.newCardLimit : base.newCardLimit,
          appRoot: base.appRoot,
          notesRootDefault: base.notesRootDefault
        }
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
      },
      saveAs: async (input: { noteId: string; target: SaveAsTarget }) => {
        const src = read(input.noteId)
        const source = input.target.source || 'notes'
        const noteId = `${source}/${input.target.id}`
        if (notes.some((n) => n.noteId === noteId)) {
          throw Object.assign(new Error(`目标已存在: ${noteId}`), { code: 'notes.exist' })
        }
        const meta: FileMeta = {
          ...src.meta,
          source,
          id: input.target.id,
          title: input.target.title?.trim() ? input.target.title.trim() : src.meta.title,
          createdAt: isoNow(),
          updatedAt: isoNow()
        }
        notes = [...notes, { noteId, meta, bodyMd: src.bodyMd }]
        persist(notes)
        return { noteId, filePath: `<virtual>/${noteId}.md`, meta, bodyMd: src.bodyMd, warnings: [] }
      }
    },
    review: {
      dueCount: async (filter?: ReviewFilter) => collectCards(filter).length,
      collect: async (filter?: ReviewFilter) => collectCards(filter),
      commit: async (results: ReviewResult[]) => {
        const today = todayKey()
        const sched = readSched()
        for (const r of results) {
          const idx = r.cardId.lastIndexOf('::')
          if (idx <= 0) continue
          const noteId = r.cardId.slice(0, idx)
          const key = r.cardId.slice(idx + 2)
          const ns = sched[noteId] ?? {}
          const cur = key === 'main' ? (ns.main ?? newCardScheduling(today)) : (ns.cards ?? {})[key] ?? newCardScheduling(today)
          const upd = schedule(r.grade, cur, today)
          if (key === 'main') ns.main = upd
          else {
            ns.cards = ns.cards ?? {}
            ns.cards[key] = upd
          }
          sched[noteId] = ns
        }
        writeSched(sched)
        return results.length
      }
    },
    parseUrl: async (raw) => parseProblemUrl(raw),
    onMenuAction: (_cb: (action: MenuAction) => void) => () => undefined
  }
  return api
}

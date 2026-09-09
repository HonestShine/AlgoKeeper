/**
 * 仅供开发期网页测试（Playwright/无 preload）的内存假后端。
 * 持久化到 localStorage（键 alk:notes）。生产打包经 import.meta.env.DEV 剔除。
 */
import type { MenuAction, RendererApi } from '../../shared/types/ipc'
import type { FileMeta, LoadedNote, NewNoteDraft, SaveAsTarget, SaveNoteInput } from '../../shared/types/note'
import type { AppSettings } from '../../shared/types/settings'
import type { CardSessionItem, ReviewFilter, ReviewLogEntry, ReviewResult, SchedulingInfo } from '../../shared/types/srs'
import type { SearchFilter, StatsOverview, TagCount, WeakTag } from '../../shared/types/insight'
import type { RelatedNotes } from '../../shared/types/export'
import type { Difficulty, NoteSummary } from '../../shared/types/note'
import { parseProblemUrl } from '../../shared/utils/url'
import { todayKey } from '../../shared/utils/date'
import { newCardScheduling, schedule } from '../../shared/utils/sm2'
import { parseBodyCards } from '../../shared/utils/cards'
import { parseWikiTargets } from '../../shared/utils/wikilinks'

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
        newCardLimit: typeof s.newCardLimit === 'number' ? s.newCardLimit : 20,
        theme: s.theme === 'dark' ? 'dark' : 'light-github'
      }
    } catch {
      return { appRoot: '<dev>', notesRootDefault: '<dev>/Documents', notesRoot: '<dev>/Documents', newCardLimit: 20, theme: 'light-github' }
    }
  }

  const LOGS_KEY = 'alk:logs'
  const readLogs = (): ReviewLogEntry[] => {
    try {
      return (JSON.parse(localStorage.getItem(LOGS_KEY) ?? '[]') as ReviewLogEntry[]) ?? []
    } catch {
      return []
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
    window: { newWindow: async () => undefined },
    settings: {
      get: async () => ({ settings: readSettingsSync() }),
      set: async (p) => {
        const base = readSettingsSync()
        const next: AppSettings = {
          notesRoot: p.notesRoot ?? base.notesRoot,
          newCardLimit: typeof p.newCardLimit === 'number' ? p.newCardLimit : base.newCardLimit,
          appRoot: base.appRoot,
          notesRootDefault: base.notesRootDefault,
          theme: p.theme ?? base.theme
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
      },
      related: async (noteId: string): Promise<RelatedNotes> => {
        const self = notes.find((n) => n.noteId === noteId)
        if (!self) return { backlinks: [], similar: [] }
        const names = new Set([self.meta.title, self.meta.id, ...self.meta.aliases])
        const backlinks: NoteSummary[] = []
        const scored: Array<{ s: NoteSummary; score: number }> = []
        for (const n of notes) {
          if (n.noteId === noteId) continue
          const refs = parseWikiTargets(n.bodyMd)
          if (refs.some((r) => names.has(r))) backlinks.push(summarize(n))
          const overlap = n.meta.tags.filter((t) => self.meta.tags.includes(t)).length
          if (overlap > 0) scored.push({ s: summarize(n), score: overlap })
        }
        const similar = scored
          .sort((a, b) => b.score - a.score || (a.s.title < b.s.title ? -1 : 1))
          .slice(0, 5)
          .map((x) => x.s)
        return { backlinks, similar }
      },
      delete: async (noteId: string) => {
        notes = notes.filter((n) => n.noteId !== noteId)
        persist(notes)
      },
      reveal: async () => {
        /* 网页环境无法显示文件管理器 */
      },
      importNote: async () => null
    },
    review: {
      dueCount: async (filter?: ReviewFilter) => collectCards(filter).length,
      collect: async (filter?: ReviewFilter) => collectCards(filter),
      commit: async (results: ReviewResult[]) => {
        const today = todayKey()
        const sched = readSched()
        const logs: ReviewLogEntry[] = []
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
          logs.push({
            cardId: r.cardId,
            noteId,
            grade: r.grade,
            ts: new Date().toISOString(),
            intervalBefore: cur.interval,
            intervalAfter: upd.interval,
            easeAfter: upd.easeFactor
          })
        }
        writeSched(sched)
        localStorage.setItem(LOGS_KEY, JSON.stringify([...readLogs(), ...logs]))
        return results.length
      }
    },
    parseUrl: async (raw) => parseProblemUrl(raw),
    search: {
      query: async (filter: SearchFilter) => {
        const text = (filter.text ?? '').trim().toLowerCase()
        const res: StoreNote[] = []
        for (const n of notes) {
          if (filter.difficulty && n.meta.difficulty !== filter.difficulty) continue
          if (filter.status && n.meta.status !== filter.status) continue
          if (filter.tag && !n.meta.tags.includes(filter.tag)) continue
          if (text) {
            const hit =
              n.meta.title.toLowerCase().includes(text) ||
              n.meta.tags.some((t) => t.toLowerCase().includes(text)) ||
              n.bodyMd.toLowerCase().includes(text)
            if (!hit) continue
          }
          res.push(n)
        }
        return res.map(summarize)
      }
    },
    export: {
      run: async (req) => {
        if (req.format === 'pdf') throw Object.assign(new Error('PDF 导出尚未实现，请使用 Markdown / HTML'), { code: 'export.pdf' })
        const count = req.scope === 'single' && req.noteId ? 1 : notes.length
        return { path: '<导出目录>', count }
      }
    },
    stats: {
      overview: async (): Promise<StatsOverview> => {
        const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard']
        const total = notes.length
        const difficulty = DIFFS.map((d) => ({ difficulty: d, count: notes.filter((n) => n.meta.difficulty === d).length }))
        const tagMap = new Map<string, number>()
        for (const n of notes) for (const t of n.meta.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1)
        const tags: TagCount[] = [...tagMap.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
        const withTags = notes.filter((n) => n.meta.tags.length > 0).length
        const tagCoverage = total ? withTags / total : 0
        const logs = readLogs()
        const perDate = new Map<string, { ok: number; n: number }>()
        for (const l of logs) {
          const d = l.ts.slice(0, 10)
          const e = perDate.get(d) ?? { ok: 0, n: 0 }
          e.n += 1
          if (l.grade >= 3) e.ok += 1
          perDate.set(d, e)
        }
        const series = [...perDate.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, v]) => ({ date, acc: v.ok / v.n, n: v.n }))
        const tagStats = new Map<string, { ok: number; n: number }>()
        for (const l of logs) {
          const n = notes.find((x) => x.noteId === l.noteId)
          if (!n) continue
          for (const t of n.meta.tags) {
            const e = tagStats.get(t) ?? { ok: 0, n: 0 }
            e.n += 1
            if (l.grade >= 3) e.ok += 1
            tagStats.set(t, e)
          }
        }
        const weakTags: WeakTag[] = [...tagStats.entries()]
          .map(([tag, v]) => ({ tag, acc: v.ok / v.n, n: v.n }))
          .filter((w) => w.n >= 3 && w.acc < 0.6)
          .sort((a, b) => a.acc - b.acc)
        return { total, difficulty, tags, tagCoverage, weakTags, series }
      }
    },
    onMenuAction: (_cb: (action: MenuAction) => void) => () => undefined
  }
  return api
}

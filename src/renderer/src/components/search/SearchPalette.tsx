import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Difficulty, NoteStatus, NoteSummary } from '../../../../shared/types/note'

export interface SearchPaletteProps {
  onPick(noteId: string): void
  onClose(): void
}

const DIFFS: Array<'' | Difficulty> = ['', 'Easy', 'Medium', 'Hard']
const STATUSES: Array<'' | NoteStatus> = ['', 'active', 'to-review', 'mastered', 'need-depth']
const STATUS_LABEL: Record<string, string> = {
  '': '全部状态',
  active: '无标记',
  'to-review': '待二刷',
  mastered: '已掌握',
  'need-depth': '需深入'
}

/** Ctrl+K 检索浮层：正文/标题/标签模糊 + 难度/状态/标签组合筛选。 */
export default function SearchPalette({ onPick, onClose }: SearchPaletteProps): ReactElement {
  const [text, setText] = useState('')
  const [difficulty, setDifficulty] = useState<'' | Difficulty>('')
  const [status, setStatus] = useState<'' | NoteStatus>('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [hits, setHits] = useState<NoteSummary[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const api = window.api
      if (!api) return
      const list = (await api.notes.list()) ?? []
      if (alive) setTags([...new Set(list.flatMap((s) => s.tags))].sort())
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      void (async () => {
        const api = window.api
        if (!api) return
        setBusy(true)
        try {
          const res = await api.search.query({ text: text.trim() || undefined, difficulty: difficulty || undefined, status: status || undefined, tag: tag || undefined })
          if (alive) setHits(res)
        } finally {
          if (alive) setBusy(false)
        }
      })()
    }, 150)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [text, difficulty, status, tag])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const field =
    'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={onClose}>
      <div
        className="w-[640px] max-w-[94vw] rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <span className="text-neutral-500">⌕</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none"
            placeholder="搜索标题/正文/标签（可再按难度/状态/标签组合）"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value as '' | Difficulty)}>
            {DIFFS.map((d) => (
              <option key={d} value={d}>
                {d ? `难度：${d}` : '全部难度'}
              </option>
            ))}
          </select>
          <select className={field} value={status} onChange={(e) => setStatus(e.target.value as '' | NoteStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select className={field} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">全部标签</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            Esc
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {busy && <p className="px-3 py-2 text-xs text-neutral-500">检索中…</p>}
          {!busy && hits.length === 0 && <p className="px-3 py-3 text-xs text-neutral-600">无匹配题解</p>}
          {hits.map((s) => (
            <button
              key={s.noteId}
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-neutral-800"
              onClick={() => onPick(s.noteId)}
            >
              <span className="flex items-center gap-2 text-[13px] text-neutral-100">
                {s.title}
                <span className={`rounded px-1 text-[11px] ${diffCls(s.difficulty)}`}>{s.difficulty}</span>
                {s.tags.map((t) => (
                  <span key={t} className="rounded bg-neutral-800 px-1 text-[11px] text-neutral-400">
                    {t}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function diffCls(d: Difficulty): string {
  if (d === 'Easy') return 'bg-emerald-500/15 text-emerald-400'
  if (d === 'Medium') return 'bg-amber-500/15 text-amber-400'
  return 'bg-rose-500/15 text-rose-400'
}

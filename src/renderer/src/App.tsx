import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppSettings } from '../../shared/types/settings'
import type { Difficulty, FileMeta, LoadedNote, NoteStatus, NoteSummary } from '../../shared/types/note'
import EditorSurface from './components/editor/EditorSurface'
import QuickCaptureDialog from './components/capture/QuickCaptureDialog'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const STATUSES: NoteStatus[] = ['active', 'to-review', 'mastered', 'need-depth']
const STATUS_LABEL: Record<NoteStatus, string> = {
  active: '无标记',
  'to-review': '待二刷',
  mastered: '已掌握',
  'need-depth': '需深入'
}
const DIFF_COLOR: Record<Difficulty, string> = {
  Easy: 'bg-emerald-500/15 text-emerald-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Hard: 'bg-rose-500/15 text-rose-400'
}

interface ActiveState {
  noteId: string
  meta: FileMeta
  md: string
}

export default function App(): ReactElement {
  const api = window.api
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [summaries, setSummaries] = useState<NoteSummary[]>([])
  const [active, setActive] = useState<ActiveState | null>(null)
  const [mode, setMode] = useState<'edit' | 'read'>('edit')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [error, setError] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const booted = useRef(false)

  const loadSummaries = useCallback(async (): Promise<void> => {
    if (!api) return
    try {
      setSummaries(await api.notes.list())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [api])

  const openNote = useCallback(
    async (noteId: string): Promise<void> => {
      if (!api) return
      setOpenNoteId(noteId)
      try {
        const note: LoadedNote = await api.notes.get(noteId)
        setActive({ noteId: note.noteId, meta: note.meta, md: note.bodyMd })
        setMode('edit')
        setDirty(false)
        setSavedAt('')
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [api]
  )

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      if (!window.api) {
        setError('window.api 未注入：请在 Electron 应用（或 Playwright + 假后端）中运行')
        return
      }
      const st = await window.api.settings.get()
      setSettings(st.settings)
      await loadSummaries()
    })()
  }, [api, loadSummaries])

  // 首次打开第一条
  useEffect(() => {
    if (!active && summaries.length > 0 && !openNoteId) void openNote(summaries[0].noteId)
  }, [summaries, active, openNoteId, openNote])

  const save = useCallback(async (): Promise<void> => {
    if (!api || !active) return
    setSaving(true)
    setError('')
    try {
      const res = await api.notes.save({ noteId: active.noteId, meta: active.meta, bodyMd: active.md })
      setSavedAt(new Date().toLocaleTimeString())
      setActive((prev) => (prev ? { ...prev, meta: { ...prev.meta, updatedAt: res.updatedAt } } : prev))
      setDirty(false)
      void loadSummaries()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [api, active, loadSummaries])

  const patchMeta = useCallback((patch: Partial<FileMeta>): void => {
    setActive((prev) => (prev ? { ...prev, meta: { ...prev.meta, ...patch } } : prev))
    setDirty(true)
  }, [])

  const toggleMode = useCallback((): void => {
    setMode((m) => (m === 'edit' ? 'read' : 'edit'))
  }, [])

  // 全局快捷键（捕获阶段）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl || e.altKey) return
      if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        setCaptureOpen(true)
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        void save()
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        toggleMode()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [save, toggleMode])

  const onCreated = useCallback(
    (note: LoadedNote): void => {
      setCaptureOpen(false)
      void loadSummaries().then(() => openNote(note.noteId))
    },
    [loadSummaries, openNote]
  )

  const toggleTag = (t: string): void => {
    setTagFilter((cur) => (cur === t ? null : t))
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const s of summaries) for (const t of s.tags) set.add(t)
    return [...set].sort()
  }, [summaries])

  const shown = useMemo(() => {
    if (!tagFilter) return summaries
    return summaries.filter((s) => s.tags.includes(tagFilter))
  }, [summaries, tagFilter])

  const groups = useMemo(() => {
    const g = new Map<string, NoteSummary[]>()
    for (const s of shown) {
      const folder = s.noteId.includes('/') ? s.noteId.split('/')[0] : s.source
      const arr = g.get(folder) ?? []
      arr.push(s)
      g.set(folder, arr)
    }
    return [...g.entries()]
  }, [shown])

  const wordCount = active ? active.md.replace(/[`#*_|>~]/g, '').length : 0

  const labelCls = 'mb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500'
  const fieldCls =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[13px] text-neutral-100 focus:border-sky-600 focus:outline-none'

  if (!api) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        需在桌面应用中运行（或开发期 Playwright 假后端）。{error && <span className="text-red-400">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-200">
      {error && (
        <div className="flex items-center justify-between border-b border-red-900/50 bg-red-950/40 px-4 py-1.5 text-xs text-red-300">
          <span>{error}</span>
          <button className="text-red-200 hover:text-white" onClick={() => setError('')} type="button">
            ✕
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* 左栏 */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60">
          <div className="border-b border-neutral-800 px-3 py-2">
            <p className="truncate text-[11px] text-neutral-500" title={settings?.notesRoot}>
              {settings?.notesRoot}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1">
            {groups.length === 0 && <p className="px-2 py-4 text-xs text-neutral-600">还没有题解，Ctrl+Shift+N 新建</p>}
            {groups.map(([folder, items]) => (
              <div key={folder} className="mb-2">
                <p className="px-1 py-0.5 text-[11px] font-medium text-neutral-500">📁 {folder}</p>
                {items.map((s) => (
                  <button
                    key={s.noteId}
                    type="button"
                    onClick={() => void openNote(s.noteId)}
                    className={`block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-neutral-800 ${
                      active?.noteId === s.noteId ? 'bg-neutral-800/80 text-sky-300' : 'text-neutral-300'
                    }`}
                  >
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                    {s.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-neutral-800 px-3 py-2 text-xs text-neutral-500">标签</div>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto px-3 pb-2">
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  tagFilter === t ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="border-t border-neutral-800 p-2">
            <button
              type="button"
              className="w-full rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              onClick={() => void api.settings.pickRoot().then((r) => r && setSettings(r.settings))}
            >
              更换笔记目录…
            </button>
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5">
            {active ? (
              <>
                <input
                  className="w-52 rounded border-transparent bg-transparent px-1 text-sm font-medium text-neutral-100 hover:border-neutral-700 focus:border-sky-600 focus:outline-none"
                  value={active.meta.title}
                  onChange={(e) => patchMeta({ title: e.target.value })}
                />
                <span className={`rounded px-1.5 py-0.5 text-xs ${DIFF_COLOR[active.meta.difficulty]}`}>
                  {active.meta.difficulty}
                </span>
                {active.meta.status !== 'active' && (
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-400">{STATUS_LABEL[active.meta.status]}</span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    {mode === 'edit' ? '阅读' : '编辑'} (Ctrl+E)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureOpen(true)}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    + 新建 (Ctrl+Shift+N)
                  </button>
                  <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                    className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    {saving ? '保存中…' : dirty ? '保存 * (Ctrl+S)' : '已保存'}
                  </button>
                </span>
              </>
            ) : (
              <span className="text-sm text-neutral-400">选择左侧题解，或 Ctrl+Shift+N 快速记录</span>
            )}
          </header>

          <section className="min-h-0 flex-1 bg-neutral-950">
            {active ? (
              mode === 'edit' ? (
                <EditorSurface md={active.md} editable onDocChange={(md) => { setActive((p) => (p ? { ...p, md } : p)); setDirty(true) }} />
              ) : (
                <EditorSurface md={active.md} editable={false} />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-600">
                AlgoKeeper · 选择或新建一篇题解
              </div>
            )}
          </section>
        </main>

        {/* 右栏 Inspector */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-900/60 p-3 md:flex">
          {active ? (
            <>
              <p className={labelCls}>难度</p>
              <div className="mb-3 flex gap-1">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => patchMeta({ difficulty: d })}
                    className={`rounded px-2 py-1 text-xs ${active.meta.difficulty === d ? DIFF_COLOR[d] : 'bg-neutral-800 text-neutral-400'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <p className={labelCls}>状态</p>
              <select
                className={`mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs ${fieldCls}`}
                value={active.meta.status}
                onChange={(e) => patchMeta({ status: e.target.value as NoteStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

              <p className={labelCls}>标签</p>
              <div className="mb-1 flex flex-wrap gap-1">
                {active.meta.tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200">
                    {t}
                    <button
                      type="button"
                      className="text-neutral-500 hover:text-red-400"
                      onClick={() => patchMeta({ tags: active.meta.tags.filter((x) => x !== t) })}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="mb-3 flex gap-1">
                <input
                  className={fieldCls}
                  placeholder="+ 加标签后回车"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagDraft.trim()) {
                      e.preventDefault()
                      const next = [...active.meta.tags, tagDraft.trim()]
                      if (new Set(next).size !== next.length) setTagDraft('')
                      else {
                        patchMeta({ tags: next })
                        setTagDraft('')
                      }
                    }
                  }}
                />
              </div>

              <p className={labelCls}>来源 / ID</p>
              <p className="mb-3 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-400">
                {active.meta.source}/{active.meta.id}
              </p>

              <p className={labelCls}>时间</p>
              <p className="text-[11px] text-neutral-500">
                创建 {fmt(active.meta.createdAt)}
                <br />
                更新 {fmt(active.meta.updatedAt)}
              </p>
            </>
          ) : (
            <p className="text-xs text-neutral-600">选择题解查看与编辑元数据</p>
          )}
        </aside>
      </div>

      {/* 状态栏 */}
      <footer className="flex items-center gap-4 border-t border-neutral-800 bg-neutral-900/80 px-4 py-1 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          {dirty ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
          {savedAt ? `最近保存 ${savedAt}` : dirty ? '有未保存修改' : '已同步'}
        </span>
        <span>{wordCount} 字</span>
        <span className="ml-auto">Electron {window.api?.versions.electron ?? '-'}</span>
      </footer>

      {captureOpen && <QuickCaptureDialog onClose={() => setCaptureOpen(false)} onCreated={onCreated} />}
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

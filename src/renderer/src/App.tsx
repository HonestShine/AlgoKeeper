import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import type { AppSettings } from '../../shared/types/settings'
import type { Difficulty, FileMeta, LoadedNote, NoteStatus, NoteSummary } from '../../shared/types/note'
import EditorSurface from './components/editor/EditorSurface'
import QuickCaptureDialog from './components/capture/QuickCaptureDialog'
import SaveAsDialog from './components/capture/SaveAsDialog'
import ReviewSession from './components/review/ReviewSession'
import TopMenuBar from './components/menu/TopMenuBar'
import SettingsDialog from './components/settings/SettingsDialog'
import SearchPalette from './components/search/SearchPalette'
import Dashboard from './components/dashboard/Dashboard'
import ExportDialog from './components/export/ExportDialog'
import FindReplaceDialog from './components/find/FindReplaceDialog'
import { parseToc } from '../../shared/utils/toc'
import type { ExportFormat, RelatedNotes } from '../../shared/types/export'
import { runEditorAction } from './lib/editor-actions'

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
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [related, setRelated] = useState<RelatedNotes | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showStatus, setShowStatus] = useState(true)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('md')
  const [findOpen, setFindOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [dueCount, setDueCount] = useState(0)
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

  const refreshDue = useCallback(async (): Promise<void> => {
    if (!api) return
    try {
      setDueCount(await api.review.dueCount())
    } catch {
      /* 忽略计数失败 */
    }
  }, [api])

  useEffect(() => {
    if (api) void refreshDue()
  }, [api, refreshDue])

  // 主题应用到根节点（data-theme 驱动浅色/深色）
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'light-github'
  }, [settings?.theme])

  const saveTheme = (theme: 'dark' | 'light-github'): void => {
    void api?.settings.set({ theme }).then((r) => r && setSettings(r.settings))
  }

  // 打开笔记时加载双向关联（反链 + 同标签）
  const activeNoteId = active?.noteId
  useEffect(() => {
    if (!activeNoteId) {
      setRelated(null)
      return
    }
    let alive = true
    setRelated(null)
    void api?.notes
      .related(activeNoteId)
      .then((r) => alive && setRelated(r))
      .catch(() => alive && setRelated({ backlinks: [], similar: [] }))
    return () => {
      alive = false
    }
  }, [api, activeNoteId])

  const startReview = useCallback((): void => {
    setReviewOpen(true)
  }, [])

  const openSaveAs = useCallback((): void => {
    if (!active) {
      setError('请先打开一篇题解再另存为')
      return
    }
    setSaveAsOpen(true)
  }, [active])

  const pickNewRoot = useCallback((): void => {
    void api?.settings.pickRoot().then((r) => r && setSettings(r.settings))
  }, [api])

  // 桌面端原生菜单 → 同一动作表
  useEffect(() => {
    return api?.onMenuAction?.((action) => {
      switch (action) {
        case 'new-note':
          setCaptureOpen(true)
          break
        case 'save':
          void save()
          break
        case 'save-as':
          openSaveAs()
          break
        case 'toggle-mode':
          toggleMode()
          break
        case 'change-root':
          pickNewRoot()
          break
        case 'review-start':
          startReview()
          break
        case 'open-settings':
          setSettingsOpen(true)
          break
        case 'open-search':
          setSearchOpen(true)
          break
        case 'open-dashboard':
          setDashboardOpen(true)
          break
      }
    })
  }, [api, save, openSaveAs, toggleMode, pickNewRoot, startReview])

  // 全局快捷键（捕获阶段）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl || e.altKey) return
      if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFindOpen(true)
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        setCaptureOpen(true)
      } else if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault()
        startReview()
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
  }, [save, toggleMode, startReview])

  const onCreated = useCallback(
    (note: LoadedNote): void => {
      setCaptureOpen(false)
      void loadSummaries().then(() => {
        void openNote(note.noteId)
        void refreshDue()
      })
    },
    [loadSummaries, openNote, refreshDue]
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

  // —— 左栏文件区右键快捷菜单（标准文件/文件夹操作）——
  interface CtxAction {
    label: string
    disabled?: boolean
    run(): void
  }
  interface CtxState {
    x: number
    y: number
    actions: CtxAction[]
  }
  const [ctx, setCtx] = useState<CtxState | null>(null)
  const [clip, setClip] = useState<{ id: string; src: string; cut: boolean } | null>(null)

  useEffect(() => {
    if (!ctx) return
    const close = (e: Event): void => {
      const t = e.target as HTMLElement | null
      if (t && !t.closest('.ak-ctx-menu')) setCtx(null)
    }
    const kb = (): void => setCtx(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', kb)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', kb)
    }
  }, [ctx])

  const ctxPos = (e: ReactMouseEvent): { x: number; y: number } => ({
    x: Math.min(e.clientX, window.innerWidth - 240),
    y: Math.min(e.clientY, window.innerHeight - 320)
  })

  const sepAction = (k: string): CtxAction => ({ label: k, disabled: true, run: () => undefined })

  const renameNote = async (noteId: string): Promise<void> => {
    const cur = summaries.find((s) => s.noteId === noteId)
    const name = window.prompt('新的题解标题：', cur?.title)
    if (!name?.trim()) return
    try {
      const note = await api?.notes.get(noteId)
      if (!note) return
      await api?.notes.save({ noteId, meta: { ...note.meta, title: name.trim() }, bodyMd: note.bodyMd })
      void loadSummaries()
      if (active?.noteId === noteId) setActive((p) => (p ? { ...p, meta: { ...p.meta, title: name.trim() } } : p))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const deleteFor = async (noteId: string): Promise<void> => {
    if (!window.confirm(`删除题解 ${noteId}？文件将被永久删除，不可恢复。`)) return
    try {
      await api?.notes.delete(noteId)
      if (active?.noteId === noteId) setActive(null)
      void loadSummaries()
      void refreshDue()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const moveNote = async (noteId: string, curSource: string): Promise<void> => {
    const folder = window.prompt('移动到哪个 source 文件夹（如 leetcode）：', curSource)?.trim()
    if (!folder) return
    if (folder === curSource) {
      setError('目标与当前 source 相同，无需移动')
      return
    }
    try {
      const note = await api?.notes.get(noteId)
      if (!note) return
      await api?.notes.create({ meta: { ...note.meta, source: folder, createdAt: '', updatedAt: '' }, bodyMd: note.bodyMd })
      await api?.notes.delete(noteId)
      void loadSummaries()
      void refreshDue()
      if (active?.noteId === noteId) await openNote(`${folder}/${note.meta.id}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const runImport = async (): Promise<void> => {
    try {
      const note = await api?.notes.importNote()
      if (!note) {
        setError('导入需在桌面端选择 .md 文件')
        return
      }
      void loadSummaries()
      await openNote(note.noteId)
      void refreshDue()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const pasteTo = async (folder: string): Promise<void> => {
    const c = clip
    if (!c) return
    try {
      const note = await api?.notes.get(c.id)
      if (!note) return
      await api?.notes.create({ meta: { ...note.meta, source: folder, createdAt: '', updatedAt: '' }, bodyMd: note.bodyMd })
      if (c.cut) {
        await api?.notes.delete(c.id)
        setClip(null)
      }
      void loadSummaries()
      void refreshDue()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const openNoteCtx = (e: ReactMouseEvent, noteId: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const source = noteId.split('/')[0]
    const same = clip?.src === source
    setCtx({
      ...ctxPos(e),
      actions: [
        { label: '新建文件', run: () => setCaptureOpen(true) },
        { label: '新建文件夹', run: () => setError('新建文件夹：目录按 source 自动分组，暂不支持手动建夹') },
        sepAction('__s1'),
        { label: '在资源管理器中显示', run: () => void api?.notes.reveal({ kind: 'file', noteId }) },
        sepAction('__s2'),
        { label: '剪切', run: () => setClip({ id: noteId, src: source, cut: true }) },
        { label: '复制', run: () => setClip({ id: noteId, src: source, cut: false }) },
        { label: '粘贴', disabled: !clip || same, run: () => void pasteTo(source) },
        sepAction('__s3'),
        { label: '重命名', run: () => void renameNote(noteId) },
        { label: '删除', run: () => void deleteFor(noteId) }
      ]
    })
  }
  const openFolderCtx = (e: ReactMouseEvent, folder: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const same = clip?.src === folder
    setCtx({
      ...ctxPos(e),
      actions: [
        { label: '新建文件', run: () => setCaptureOpen(true) },
        { label: '新建文件夹', run: () => setError('新建文件夹：目录按 source 自动分组，暂不支持手动建夹') },
        sepAction('__f1'),
        { label: '在资源管理器中显示', run: () => void api?.notes.reveal({ kind: 'folder', folder }) },
        sepAction('__f2'),
        { label: '剪切', disabled: true, run: () => undefined },
        { label: '复制', disabled: true, run: () => undefined },
        { label: '粘贴', disabled: !clip || same, run: () => void pasteTo(folder) },
        sepAction('__f3'),
        { label: '重命名', disabled: true, run: () => undefined },
        { label: '删除', disabled: true, run: () => undefined }
      ]
    })
  }
  // 编辑区右键：文档内容快捷操作
  const openEditorCtx = (e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setCtx({
      ...ctxPos(e),
      actions: [
        { label: '撤销', run: () => void runEditorAction('undo') },
        { label: '重做', run: () => void runEditorAction('redo') },
        sepAction('_ec1'),
        { label: '剪切', disabled: true, run: () => undefined },
        { label: '复制', disabled: true, run: () => undefined },
        { label: '粘贴', disabled: true, run: () => undefined },
        sepAction('_ec2'),
        { label: '加粗', run: () => void runEditorAction('bold') },
        { label: '斜体', run: () => void runEditorAction('italic') },
        { label: '下划线', run: () => void runEditorAction('underline') },
        { label: '删除线', run: () => void runEditorAction('strike') },
        { label: '代码', run: () => void runEditorAction('code') },
        { label: '高亮', run: () => void runEditorAction('highlight') },
        sepAction('_ec3'),
        { label: '超链接…', run: () => void runEditorAction('link') },
        { label: '内联公式', run: () => void runEditorAction('math-inline') },
        { label: '插入图片…', run: () => void runEditorAction('image') },
        sepAction('_ec4'),
        { label: '查找和替换…', run: () => { runEditorAction('find-open'); setFindOpen(true) } },
        { label: '全选', run: () => void runEditorAction('select-all') },
        { label: '清除样式', run: () => void runEditorAction('clear-format') }
      ]
    })
  }
  const openPaneCtx = (e: ReactMouseEvent): void => {
    e.preventDefault()
    setCtx({
      ...ctxPos(e),
      actions: [
        { label: '新建文件', run: () => setCaptureOpen(true) },
        { label: '新建文件夹', run: () => setError('新建文件夹：目录按 source 自动分组，暂不支持手动建夹') },
        sepAction('__p1'),
        { label: '在资源管理器中显示', disabled: true, run: () => undefined },
        sepAction('__p2'),
        { label: '剪切', disabled: true, run: () => undefined },
        { label: '复制', disabled: true, run: () => undefined },
        { label: '粘贴', disabled: true, run: () => undefined },
        sepAction('__p3'),
        { label: '重命名', disabled: true, run: () => undefined },
        { label: '删除', disabled: true, run: () => undefined }
      ]
    })
  }

  // —— 顶层菜单动作分发（菜单树 → App 能力 / 编辑器命令）——
  const openExport = (f: ExportFormat): void => {
    setExportFormat(f)
    setExportOpen(true)
  }
  const doDelete = async (): Promise<void> => {
    const id = active?.noteId
    if (!id) return
    if (!window.confirm(`删除题解 ${id}？文件将被永久删除，不可恢复。`)) return
    try {
      await api?.notes.delete(id)
      setActive(null)
      void loadSummaries()
      void refreshDue()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const handleMenuAction = (key: string): void => {
    if (runEditorAction(key)) return
    switch (key) {
      case 'new-note':
        setCaptureOpen(true)
        break
      case 'open-note':
      case 'open-search':
        setSearchOpen(true)
        break
      case 'open-folder':
        pickNewRoot()
        break
      case 'save':
      case 'save-all':
        void save()
        break
      case 'save-as':
        openSaveAs()
        break
      case 'delete-note':
        void doDelete()
        break
      case 'new-window':
        void api?.window.newWindow().catch(() => undefined)
        break
      case 'open-recent':
        setSearchOpen(true)
        break
      case 'move-note':
        if (active) void moveNote(active.noteId, active.noteId.split('/')[0])
        else setError('请先打开要移动的题解')
        break
      case 'import':
        void runImport()
        break
      case 'close-note':
        if (!active) break
        if (dirty) setError('有未保存修改，请先保存再关闭')
        else {
          setActive(null)
          setMode('edit')
        }
        break
      case 'export-pdf':
        openExport('pdf')
        break
      case 'export-html':
      case 'export-html-plain':
        openExport('html')
        break
      case 'open-settings':
        setSettingsOpen(true)
        break
      case 'review-start':
        startReview()
        break
      case 'open-dashboard':
        setDashboardOpen(true)
        break
      case 'theme-dark':
        saveTheme('dark')
        break
      case 'theme-github':
        saveTheme('light-github')
        break
      case 'source-mode':
        if (active && mode !== 'edit') setMode('edit')
        setSourceOpen((v) => !v)
        break
      case 'docs-list':
        setShowSidebar((v) => !v)
        break
      case 'find-open':
      case 'find-next':
      case 'find-prev':
      case 'find-replace':
        setFindOpen(true)
        break
      case 'toggle-filebar':
      case 'toggle-filetree':
        setShowSidebar((v) => !v)
        break
      case 'toggle-statusbar':
        setShowStatus((v) => !v)
        break
      case 'about':
        window.alert('AlgoKeeper v0.1 — 本地优先的算法题解记录 + SM-2 间隔重复桌面应用')
        break
      default:
        break
    }
  }

  const wordCount = active ? active.md.replace(/[`#*_|>~]/g, '').length : 0
  const toc = active ? parseToc(active.md) : []

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
      <TopMenuBar
        dueCount={dueCount}
        dirty={dirty}
        saving={saving}
        mode={mode}
        canEdit={!!active && mode === 'edit'}
        disabledKeys={dirty || saving ? [] : ['save']}
        onAction={handleMenuAction}
      />
      <div className="flex min-h-0 flex-1">
        <aside
          className={`${showSidebar ? '' : 'hidden'} flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60`}
          onContextMenu={openPaneCtx}
        >
          <div className="border-b border-neutral-800 px-3 py-2">
            <p className="truncate text-[11px] text-neutral-500" title={settings?.notesRoot}>
              {settings?.notesRoot}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1">
            {groups.length === 0 && <p className="px-2 py-4 text-xs text-neutral-600">还没有题解，Ctrl+Shift+N 新建</p>}
            {groups.map(([folder, items]) => (
              <div key={folder} className="mb-2">
                <p
                  className="cursor-default px-1 py-0.5 text-[11px] font-medium text-neutral-500"
                  onContextMenu={(e) => openFolderCtx(e, folder)}
                >
                  📁 {folder}
                </p>
                {items.map((s) => (
                  <button
                    key={s.noteId}
                    type="button"
                    onClick={() => void openNote(s.noteId)}
                    onContextMenu={(e) => openNoteCtx(e, s.noteId)}
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
                <span className="ml-auto text-[11px] text-neutral-700">
                  {mode === 'edit' ? '编辑中 · Ctrl+E 阅读' : '阅读 · Ctrl+E 编辑'}
                </span>
              </>
            ) : (
              <span className="text-sm text-neutral-400">选择左侧题解，或 文件 → 快速记录（Ctrl+Shift+N）</span>
            )}
          </header>

          <section className="min-h-0 flex-1 bg-neutral-950">
            {active ? (
              mode === 'edit' ? (
                sourceOpen ? (
                  <textarea
                    value={active.md}
                    spellCheck={false}
                    onChange={(e) => {
                      setActive((p) => (p ? { ...p, md: e.target.value } : p))
                      setDirty(true)
                    }}
                    className="block h-full w-full resize-none bg-neutral-950 p-4 font-mono text-[13px] leading-relaxed text-neutral-200 focus:outline-none"
                  />
                ) : (
                  <EditorSurface
                    md={active.md}
                    editable
                    onOpenContext={openEditorCtx}
                    onDocChange={(md) => { setActive((p) => (p ? { ...p, md } : p)); setDirty(true) }}
                  />
                )
              ) : (
                <div className="flex h-full">
                  {toc.length > 0 && (
                    <aside className="w-44 shrink-0 overflow-y-auto border-r border-neutral-800/70 px-3 py-3 text-xs">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">大纲</p>
                      {toc.map((item, i) => (
                        <button
                          key={i}
                          type="button"
                          className="block w-full truncate rounded py-0.5 text-left text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                          style={{ paddingLeft: `${(item.depth - 1) * 10}px` }}
                          onClick={() => {
                            const el = Array.from(
                              document.querySelectorAll('.ak-editor h1, .ak-editor h2, .ak-editor h3, .ak-editor h4, .ak-editor h5, .ak-editor h6')
                            ).find((h) => h.textContent?.trim() === item.text)
                            el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                        >
                          {item.text}
                        </button>
                      ))}
                    </aside>
                  )}
                  <div className="min-w-0 flex-1">
                    <EditorSurface md={active.md} editable={false} />
                  </div>
                </div>
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

              <p className={labelCls}>关联题目</p>
              {!related && <p className="text-xs text-neutral-600">加载中…</p>}
              {related && related.backlinks.length === 0 && related.similar.length === 0 && (
                <p className="text-xs text-neutral-600">暂无（用 [[题名]] 建立引用）</p>
              )}
              {related && related.backlinks.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] text-sky-400">反向链接 ({related.backlinks.length})</p>
                  {related.backlinks.map((b) => (
                    <button
                      key={b.noteId}
                      type="button"
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                      onClick={() => void openNote(b.noteId)}
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
              {related && related.similar.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-neutral-500">同标签推荐</p>
                  {related.similar.map((b) => (
                    <button
                      key={b.noteId}
                      type="button"
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                      onClick={() => void openNote(b.noteId)}
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-neutral-600">选择题解查看与编辑元数据</p>
          )}
        </aside>
      </div>

      <footer
        className={`${showStatus ? '' : 'hidden'} flex items-center gap-4 border-t border-neutral-800 bg-neutral-900/80 px-4 py-1 text-[11px] text-neutral-500`}
      >
        <span className="flex items-center gap-1">
          {dirty ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
          {savedAt ? `最近保存 ${savedAt}` : dirty ? '有未保存修改' : '已同步'}
        </span>
        <span>{wordCount} 字</span>
        <span className="ml-auto">Electron {window.api?.versions.electron ?? '-'}</span>
      </footer>

      {captureOpen && <QuickCaptureDialog onClose={() => setCaptureOpen(false)} onCreated={onCreated} />}
      {saveAsOpen && active && (
        <SaveAsDialog
          meta={active.meta}
          onClose={() => setSaveAsOpen(false)}
          onSaved={(note) => {
            setSaveAsOpen(false)
            void loadSummaries().then(() => {
              void openNote(note.noteId)
              void refreshDue()
            })
          }}
        />
      )}
      {reviewOpen && (
        <ReviewSession
          availableTags={allTags}
          onExit={() => {
            setReviewOpen(false)
            void refreshDue()
            void loadSummaries()
          }}
        />
      )}
      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSettingsChanged={(s) => {
            setSettings(s)
            void refreshDue()
          }}
        />
      )}
      {findOpen && <FindReplaceDialog onClose={() => setFindOpen(false)} />}
      {searchOpen && (
        <SearchPalette
          onPick={(noteId) => {
            setSearchOpen(false)
            void openNote(noteId)
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {dashboardOpen && <Dashboard onClose={() => setDashboardOpen(false)} />}
      {exportOpen && (
        <ExportDialog
          noteId={active?.noteId}
          defaultFormat={exportFormat}
          onClose={() => {
            setExportFormat('md')
            setExportOpen(false)
          }}
        />
      )}
      {ctx && (
        <div
          className="ak-ctx-menu fixed z-[60] max-h-[70vh] min-w-44 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
          style={{ left: ctx.x, top: ctx.y }}
        >
          {ctx.actions.map((a) =>
            a.label.startsWith('__') ? (
              <div key={a.label} className="mx-2 my-1 border-t border-neutral-800" />
            ) : (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-600 disabled:hover:bg-transparent"
                onClick={() => {
                  if (!a.disabled) a.run()
                  setCtx(null)
                }}
              >
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

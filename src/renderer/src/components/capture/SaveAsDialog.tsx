import { useState } from 'react'
import type { ReactElement } from 'react'
import type { FileMeta, LoadedNote } from '../../../../shared/types/note'

export interface SaveAsDialogProps {
  meta: FileMeta
  onClose(): void
  onSaved(note: LoadedNote): void
}

/** 另存为：把当前笔记复制到新 source/id（重置调度）。 */
export default function SaveAsDialog({ meta, onClose, onSaved }: SaveAsDialogProps): ReactElement {
  const [source, setSource] = useState(meta.source)
  const [id, setId] = useState(meta.id)
  const [title, setTitle] = useState(meta.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    const api = window.api
    if (!api) return
    setBusy(true)
    setError('')
    try {
      const note = await api.notes.saveAs({ noteId: `${meta.source}/${meta.id}`, target: { source, id, title } })
      onSaved(note)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder-neutral-600 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[440px] rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-100">另存为…</h2>
        <p className="mb-3 text-xs text-neutral-500">
          复制当前题解到新的 source/id（复习进度重置，原文件不变）。
        </p>
        <div className="mb-2 flex gap-2">
          <label className="flex-1 text-xs text-neutral-400">
            source
            <input className={`mt-1 ${field}`} value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label className="flex-1 text-xs text-neutral-400">
            id（slug）
            <input className={`mt-1 ${field}`} value={id} onChange={(e) => setId(e.target.value)} />
          </label>
        </div>
        <label className="mb-3 block text-xs text-neutral-400">
          标题
          <input className={`mt-1 ${field}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit()}
            type="button"
          >
            另存为
          </button>
        </div>
      </div>
    </div>
  )
}

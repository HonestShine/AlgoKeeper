import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Difficulty, LoadedNote } from '../../../../shared/types/note'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

export interface QuickCaptureDialogProps {
  onClose: () => void
  onCreated: (note: LoadedNote) => void
}

/** Ctrl+Shift+N 快速记录：Markdown 正文 + 粘贴 URL 自动解析 source/id/title。 */
export default function QuickCaptureDialog({ onClose, onCreated }: QuickCaptureDialogProps): ReactElement {
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('leetcode')
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium')
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const parse = async (): Promise<void> => {
    setError('')
    if (!url.trim()) return
    const parsed = await window.api?.parseUrl(url.trim())
    if (!parsed) {
      setError('无法识别该 URL（当前支持 LeetCode 题目页）')
      return
    }
    setSource(parsed.source)
    setId(parsed.id)
    setTitle(parsed.title)
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const api = window.api
      if (!api) throw Object.assign(new Error('需在桌面应用中运行'), { code: 'app.context' })
      const note = await api.notes.create({
        meta: {
          source,
          id,
          title,
          difficulty,
          tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
          status: 'active',
          aliases: [],
          createdAt: '',
          updatedAt: ''
        },
        bodyMd: body.trim()
      })
      onCreated(note)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 placeholder-neutral-600 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[92vw] rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">快速记录题解</h2>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            Esc / ✕
          </button>
        </div>

        <div className="mb-2 flex gap-2">
          <input
            className={inputCls}
            placeholder="粘贴题目 URL（LeetCode）自动解析…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void parse()
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            onClick={() => void parse()}
          >
            解析
          </button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="source" value={source} onChange={(e) => setSource(e.target.value)} />
          <input className={inputCls} placeholder="id（slug）" value={id} onChange={(e) => setId(e.target.value)} />
          <input className={inputCls} placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input className={inputCls} placeholder="tags：array, 哈希表" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>

        <textarea
          className={`${inputCls} ak-editor h-44 resize-y font-mono text-[13px] leading-relaxed`}
          placeholder={'# Two Sum\n\n## 解法一：哈希表\n\n思路…\n\n```ts\n代码…\n```'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit()}
            type="button"
          >
            创建并打开
          </button>
        </div>
      </div>
    </div>
  )
}

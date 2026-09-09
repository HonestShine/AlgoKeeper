import { useState } from 'react'
import type { ReactElement } from 'react'
import type { ExportFormat, ExportScope, ExportVariant } from '../../../../shared/types/export'

export interface ExportDialogProps {
  noteId?: string
  onClose(): void
}

/** 导出：Markdown / HTML，单篇或整集；分享(剥调度) / 备份(可回导)。 */
export default function ExportDialog({ noteId, onClose }: ExportDialogProps): ReactElement {
  const [scope, setScope] = useState<ExportScope>(noteId ? 'single' : 'all')
  const [format, setFormat] = useState<ExportFormat>('md')
  const [variant, setVariant] = useState<ExportVariant>('share')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const run = async (): Promise<void> => {
    const api = window.api
    if (!api) return
    setBusy(true)
    setMessage('')
    try {
      const res = await api.export.run({ scope, format, variant, noteId: scope === 'single' ? noteId : undefined })
      if (!res) setMessage('已取消')
      else setMessage(`已导出 ${res.count} 篇到：${res.path}`)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[420px] rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">导出</h2>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <label className="text-neutral-400">
            范围
            <select className={`mt-1 w-full ${field}`} value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
              <option value="single" disabled={!noteId}>
                当前题解
              </option>
              <option value="all">整集全部</option>
            </select>
          </label>
          <label className="text-neutral-400">
            格式
            <select className={`mt-1 w-full ${field}`} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
              <option value="pdf" disabled>
                PDF（待实现）
              </option>
            </select>
          </label>
          <label className="text-neutral-400">
            版本
            <select className={`mt-1 w-full ${field}`} value={variant} onChange={(e) => setVariant(e.target.value as ExportVariant)}>
              <option value="share">分享（剥调度）</option>
              <option value="backup">备份（含调度）</option>
            </select>
          </label>
        </div>
        <p className="mb-3 text-[11px] text-neutral-600">
          {variant === 'share' ? '分享版 frontmatter 不含 scheduling，适合发布。' : '备份版保留 scheduling，可整目录回导无损恢复。'}
        </p>
        {message && <p className="mb-2 break-all text-xs text-neutral-400">{message}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800" onClick={onClose} type="button">
            关闭
          </button>
          <button
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            disabled={busy}
            onClick={() => void run()}
            type="button"
          >
            {busy ? '导出中…' : '选择目录导出'}
          </button>
        </div>
      </div>
    </div>
  )
}

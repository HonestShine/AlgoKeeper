import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { getActiveEditor } from '../../lib/editor-bridge'

export interface FindReplaceDialogProps {
  onClose(): void
}

interface Match {
  from: number
  to: number
}

function collectMatches(query: string): Match[] {
  const editor = getActiveEditor()
  if (!editor || !query) return []
  const q = query.toLowerCase()
  const out: Match[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && typeof node.text === 'string') {
      const text = node.text
      let idx = text.toLowerCase().indexOf(q)
      while (idx !== -1) {
        out.push({ from: pos + idx, to: pos + idx + q.length })
        idx = text.toLowerCase().indexOf(q, idx + q.length)
      }
    }
    return true
  })
  return out
}

function selectMatch(editor: ReturnType<typeof getActiveEditor>, m: Match): void {
  if (!editor) return
  editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run()
}

/** 编辑>查找和替换：纯文本定位 + 替换（逐次 / 全部）。 */
export default function FindReplaceDialog({ onClose }: FindReplaceDialogProps): ReactElement {
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [cursor, setCursor] = useState(0)
  const [mode, setMode] = useState<'find' | 'replace'>('find')

  const matches = useMemo(() => collectMatches(query), [query])
  const current = matches.length ? matches[cursor % matches.length] : null

  const go = (dir: 1 | -1): void => {
    if (!matches.length) return
    setCursor((c) => (c + dir + matches.length) % matches.length)
  }

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    const editor = getActiveEditor()
    if (current) selectMatch(editor, current)
    else editor?.chain().focus().run()
  }, [current, cursor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        go(1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, matches.length])

  const replaceOne = (): void => {
    const editor = getActiveEditor()
    const m = current
    if (!editor || !m) return
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replace).run()
    setQuery(query)
  }
  const replaceAll = (): void => {
    const editor = getActiveEditor()
    if (!editor || !matches.length) return
    for (const m of [...matches].reverse()) editor.chain().insertContentAt({ from: m.from, to: m.to }, replace).run()
    setQuery(query)
  }

  const field =
    'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh]" onMouseDown={onClose}>
      <div
        className="w-[520px] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-400">查找和替换</span>
          <div className="ml-auto flex rounded border border-neutral-700 text-xs">
            {(['find', 'replace'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-1 ${mode === m ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400'}`}
              >
                {m === 'find' ? '查找' : '替换'}
              </button>
            ))}
          </div>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            autoFocus
            className={`${field} flex-1`}
            placeholder="查找…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="w-14 text-center text-[11px] text-neutral-500">
            {matches.length ? `${cursor + 1}/${matches.length}` : '0'}
          </span>
          <button className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800" onClick={() => go(-1)} type="button">
            ‹
          </button>
          <button className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800" onClick={() => go(1)} type="button">
            ›
          </button>
        </div>

        {mode === 'replace' && (
          <div className="mt-2 flex items-center gap-2">
            <input className={`${field} flex-1`} placeholder="替换为…" value={replace} onChange={(e) => setReplace(e.target.value)} />
            <button className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40" disabled={!current} onClick={replaceOne} type="button">
              替换
            </button>
            <button className="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-500 disabled:opacity-40" disabled={!matches.length} onClick={replaceAll} type="button">
              全部替换
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-neutral-600">Enter=下一个 · Esc 关闭（支持替换、逐条与全部）</p>
      </div>
    </div>
  )
}

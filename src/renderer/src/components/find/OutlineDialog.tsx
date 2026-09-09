import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { parseToc } from '../../../../shared/utils/toc'

export interface OutlineDialogProps {
  md: string
  onClose(): void
}

/** 大纲抽屉：列出当前题解 heading，点击定位到编辑/阅读视图。 */
export default function OutlineDialog({ md, onClose }: OutlineDialogProps): ReactElement {
  const toc = parseToc(md)

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

  const jump = (text: string): void => {
    const el = Array.from(
      document.querySelectorAll('.ak-editor h1, .ak-editor h2, .ak-editor h3, .ak-editor h4, .ak-editor h5, .ak-editor h6')
    ).find((h) => h.textContent?.trim() === text)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[10vh]" onMouseDown={onClose}>
      <div
        className="w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">大纲</h2>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        {toc.length === 0 && <p className="text-xs text-neutral-500">当前文档没有标题</p>}
        <div className="max-h-[60vh] overflow-y-auto">
          {toc.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jump(item.text)}
              className="block w-full truncate rounded px-2 py-1 text-left text-[13px] text-neutral-300 hover:bg-neutral-800"
              style={{ paddingLeft: `${(item.depth - 1) * 14 + 8}px` }}
            >
              {item.text}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-600">点击跳转 · Esc 关闭</p>
      </div>
    </div>
  )
}

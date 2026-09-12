import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

export interface ReadToggleProps {
  mode: 'edit' | 'read'
  onToggle(): void
}

/** 编辑区右上角悬浮的阅读/编辑开关；闲置 1.5s 后降到 40% 不透明度以免遮挡正文。 */
export default function ReadToggle({ mode, onToggle }: ReadToggleProps): ReactElement {
  const [dim, setDim] = useState(false)
  const timer = useRef<number | null>(null)

  const arm = (): void => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDim(true), 1500)
  }

  useEffect(() => {
    arm()
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const wake = (): void => {
    setDim(false)
    arm()
  }

  // 静止悬停 / 键盘聚焦期间不再产生 mousemove，计时器仍会到点把 dim 置真；
  // 故用 CSS 覆写兜底：指针在按钮上或键盘聚焦时恒为不透明。
  return (
    <button
      type="button"
      title={mode === 'read' ? '回到编辑 Ctrl+E' : '进入阅读 Ctrl+E'}
      onClick={onToggle}
      onMouseEnter={wake}
      onMouseMove={wake}
      onFocus={wake}
      className={`absolute right-3 top-3 z-20 rounded-full border border-neutral-700 bg-neutral-900/90 px-3 py-1 text-[11px] text-neutral-300 shadow-lg transition-opacity hover:border-sky-600 hover:text-sky-300 ${
        dim ? 'opacity-40 hover:opacity-100 focus-visible:opacity-100' : 'opacity-100'
      }`}
    >
      {mode === 'read' ? '✏ 编辑' : '👁 阅读'}
    </button>
  )
}

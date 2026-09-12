import type { ReactElement } from 'react'

export interface SourceToggleProps {
  active: boolean
  /** 阅读态下不可用 */
  disabled: boolean
  onToggle(): void
  /** 状态栏隐藏时渲染为编辑区左下角悬浮按钮 */
  floating?: boolean
}

/** `</>` 源码模式开关。同一组件两种挂载位置：状态栏内 / 编辑区左下角悬浮。 */
export function SourceToggle({ active, disabled, onToggle, floating }: SourceToggleProps): ReactElement {
  return (
    <button
      type="button"
      title={disabled ? '阅读态不可用，按 Ctrl+E 回到编辑' : '源码模式 Ctrl+/'}
      disabled={disabled}
      onClick={onToggle}
      className={
        floating
          ? `absolute bottom-3 left-3 z-20 rounded border px-2 py-1 font-mono text-[11px] shadow-lg transition-opacity hover:opacity-100 ${
              active ? 'border-sky-600 bg-sky-600/20 text-sky-300 opacity-80' : 'border-neutral-700 bg-neutral-900/90 text-neutral-400 opacity-40'
            } disabled:opacity-20`
          : `rounded px-1.5 py-0.5 font-mono text-[11px] ${
              active ? 'bg-sky-600/20 text-sky-300' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
            } disabled:text-neutral-700 disabled:hover:bg-transparent`
      }
    >
      {'</>'}
    </button>
  )
}

export interface StatusBarProps {
  dirty: boolean
  savedAt: string
  wordCount: number
  electronVersion: string
  source: boolean
  /** = mode === 'edit' */
  canUseSource: boolean
  onToggleSource(): void
}

export default function StatusBar(p: StatusBarProps): ReactElement {
  return (
    <footer className="flex items-center gap-4 border-t border-neutral-800 bg-neutral-900/80 px-4 py-1 text-[11px] text-neutral-500">
      <SourceToggle active={p.source} disabled={!p.canUseSource} onToggle={p.onToggleSource} />
      <span className="flex items-center gap-1">
        {p.dirty ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
        {p.savedAt ? `最近保存 ${p.savedAt}` : p.dirty ? '有未保存修改' : '已同步'}
      </span>
      <span>{p.wordCount} 字</span>
      <span className="ml-auto">Electron {p.electronVersion}</span>
    </footer>
  )
}

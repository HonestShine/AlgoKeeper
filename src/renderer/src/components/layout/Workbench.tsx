import { useEffect, useRef } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode
} from 'react'
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  LEFT_MAX,
  LEFT_MIN,
  RAIL_WIDTH,
  RIGHT_MAX,
  RIGHT_MIN
} from '../../../../shared/utils/layout'
import { clampWidth, dragWidth, resolveWidths, stepWidth } from './splitter'

export interface WorkbenchProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  leftWidth: number
  rightWidth: number
  leftVisible: boolean
  rightVisible: boolean
  focusMode: boolean
  onWidthChange(side: 'left' | 'right', width: number): void
  onToggle(side: 'left' | 'right'): void
}

const SIDE_LABEL: Record<'left' | 'right', string> = { left: '左栏', right: '右栏' }

/** 工作台三栏骨架：两侧可拖拽调宽、可折叠为窄条 rail。 */
export default function Workbench(p: WorkbenchProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<'left' | 'right' | null>(null)
  // F4：折叠/展开一栏都会把「当前持有焦点的那个按钮」卸载（折叠卸载分隔条与栏头折叠按钮，
  // 展开卸载 rail 及其展开按钮），浏览器于是把焦点丢给 <body>，键盘用户在两侧之间来回时
  // 每转一次都要补按一次 Tab。这里给四个按钮留 ref，在两个方向上把焦点接回去。
  const leftExpandRef = useRef<HTMLButtonElement>(null)
  const rightExpandRef = useRef<HTMLButtonElement>(null)
  const leftCollapseRef = useRef<HTMLButtonElement>(null)
  const rightCollapseRef = useRef<HTMLButtonElement>(null)
  const prevVisible = useRef({ left: p.leftVisible, right: p.rightVisible })
  // 用户是否已经和界面交互过（用于区分「用户折叠」与「启动时异步载入偏好导致的折叠」）
  const interacted = useRef(false)

  useEffect(() => {
    const mark = (): void => {
      interacted.current = true
    }
    window.addEventListener('pointerdown', mark, true)
    window.addEventListener('keydown', mark, true)
    return () => {
      window.removeEventListener('pointerdown', mark, true)
      window.removeEventListener('keydown', mark, true)
    }
  }, [])

  useEffect(() => {
    const prev = prevVisible.current
    prevVisible.current = { left: p.leftVisible, right: p.rightVisible }
    // 只在真实转变上补焦：prevVisible 初值即当前值，挂载时不聚焦。
    const collapsedLeft = prev.left && !p.leftVisible
    const collapsedRight = prev.right && !p.rightVisible
    const expandedLeft = !prev.left && p.leftVisible
    const expandedRight = !prev.right && p.rightVisible
    if (!collapsedLeft && !collapsedRight && !expandedLeft && !expandedRight) return
    // 启动时 settings.json 到位可能把原本默认展开的一栏折叠 —— 那不是用户操作，
    // 不该把焦点从别处抢过来（初始即为折叠态时不聚焦）。
    if (!interacted.current) return
    // 只有「确实因为被卸载而丢掉焦点」（activeElement 掉到 body / 已脱离文档）才补焦；
    // 焦点还停在中栏输入框、正文或菜单项上时一律不抢（例如用 Ctrl+1 展开时不要抢正文焦点）。
    const el = document.activeElement
    if (!(el === null || el === document.body || !el.isConnected)) return
    // 折叠 → 焦点去 rail 的展开按钮；展开 → 焦点去栏头的折叠按钮（闭环两侧都能继续键盘操作）
    if (collapsedLeft) leftExpandRef.current?.focus()
    else if (collapsedRight) rightExpandRef.current?.focus()
    if (expandedLeft) leftCollapseRef.current?.focus()
    else if (expandedRight) rightCollapseRef.current?.focus()
  }, [p.leftVisible, p.rightVisible])

  // 容器尺寸变化时重新解析宽度，保证正文始终有 MIN_CONTENT_WIDTH
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fix = (): void => {
      if (dragRef.current) return
      const container = host.clientWidth
      // 容器尚未布局（隐藏 / 无头环境）时 clientWidth 为 0，下写会把两栏压到 0
      if (container <= 0) return
      const next = resolveWidths(p.leftWidth, p.rightWidth, container)
      // 兜底：resolveWidths 在极窄容器下刻意允许「两侧 min 之和 + MIN_CONTENT_WIDTH > 容器」
      // （不隐式折叠），故此处的后置条件不能当成既有保证。两个后果都要挡住：
      // 1) 写盘侧（settings-store → mergeLayout）会把越界值夹回 [min, max]，若这里下写越界值，
      //    会形成「乐观值 → 被夹回 → 再下写」的来回拉锯（每次约 300ms 一轮 IPC 写），故只写夹取后的合法值；
      // 2) 绝不写出负数/越界宽度 —— 那会把正文区挤成负宽，或把侧栏压到不可用的极窄。
      // 极窄下两侧已落到合法下界（resolveWidths 的结果），正文不足的空间由用户折叠 rail 解决。
      const l = clampWidth(next.left, LEFT_MIN, LEFT_MAX)
      const r = clampWidth(next.right, RIGHT_MIN, RIGHT_MAX)
      if (l !== p.leftWidth) p.onWidthChange('left', l)
      if (r !== p.rightWidth) p.onWidthChange('right', r)
    }
    fix()
    const ro = new ResizeObserver(fix)
    ro.observe(host)
    return () => ro.disconnect()
  }, [p.leftWidth, p.rightWidth, p.leftVisible, p.rightVisible, p.focusMode, p.onWidthChange])

  // 卸载兜底：拖拽中组件被卸载时清掉 resizing 标记
  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.resizing
    }
  }, [])

  const startDrag =
    (side: 'left' | 'right') =>
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      e.preventDefault()
      // preventDefault 会连带取消「按下即聚焦」的默认行为，而本元素的键盘微调（←/→/Home/End/Enter）
      // 只有聚焦后才生效；这里显式聚焦，让鼠标用户也能用上键盘微调（实测点击后 activeElement 不是分隔条）。
      e.currentTarget.focus()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = side
      document.documentElement.dataset.resizing = '1'
    }

  const onDrag =
    (side: 'left' | 'right') =>
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragRef.current !== side) return
      const rect = hostRef.current?.getBoundingClientRect()
      if (!rect) return
      const other =
        side === 'left' ? (p.rightVisible && !p.focusMode ? p.rightWidth : 0) : p.leftVisible && !p.focusMode ? p.leftWidth : 0
      p.onWidthChange(side, dragWidth(e.clientX, side, rect.left, rect.right, other))
    }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null) return
    dragRef.current = null
    delete document.documentElement.dataset.resizing
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onKey =
    (side: 'left' | 'right') =>
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      const min = side === 'left' ? LEFT_MIN : RIGHT_MIN
      const max = side === 'left' ? LEFT_MAX : RIGHT_MAX
      const cur = side === 'left' ? p.leftWidth : p.rightWidth
      const grow = side === 'left' ? 1 : -1
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          p.onWidthChange(side, stepWidth(cur, -16 * grow, min, max))
          break
        case 'ArrowRight':
          e.preventDefault()
          p.onWidthChange(side, stepWidth(cur, 16 * grow, min, max))
          break
        case 'Home':
          e.preventDefault()
          p.onWidthChange(side, min)
          break
        case 'End':
          e.preventDefault()
          p.onWidthChange(side, max)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          p.onToggle(side)
          break
        default:
          break
      }
    }

  const onDoubleClick =
    (side: 'left' | 'right') =>
    (): void => {
      p.onWidthChange(side, side === 'left' ? DEFAULT_LEFT_WIDTH : DEFAULT_RIGHT_WIDTH)
    }

  /** 分隔条：默认 1px 线，hover 3px 高亮 */
  const divider = (side: 'left' | 'right'): ReactElement => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${SIDE_LABEL[side]}宽度调整`}
      tabIndex={0}
      onPointerDown={startDrag(side)}
      onPointerMove={onDrag(side)}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // 兜底：捕获在无 pointercancel 的情况下丢失时也要收尾，否则 dragRef 永久非空
      // （data-resizing 残留 + fix() 被永久短路）。endDrag 幂等，可安全重复调用。
      onLostPointerCapture={endDrag}
      onKeyDown={onKey(side)}
      onDoubleClick={onDoubleClick(side)}
      className="group relative w-px shrink-0 cursor-col-resize bg-neutral-800 before:absolute before:inset-y-0 before:-left-1 before:w-3 before:content-[''] hover:bg-sky-600 focus:bg-sky-600 focus:outline-none"
    />
  )

  const rail = (side: 'left' | 'right'): ReactElement => (
    <div
      className="flex shrink-0 flex-col items-center border-neutral-800 bg-neutral-900/60 pt-2"
      style={{ width: RAIL_WIDTH, borderRightWidth: side === 'left' ? 1 : 0, borderLeftWidth: side === 'left' ? 0 : 1 }}
    >
      <button
        ref={side === 'left' ? leftExpandRef : rightExpandRef}
        type="button"
        title={`展开${SIDE_LABEL[side]} Ctrl+${side === 'left' ? '1' : 'Shift+B'}`}
        onClick={() => p.onToggle(side)}
        className="rounded px-1 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
      >
        {side === 'left' ? '⌄' : '⌃'}
      </button>
    </div>
  )

  const collapseBtn = (side: 'left' | 'right'): ReactElement => (
    <button
      ref={side === 'left' ? leftCollapseRef : rightCollapseRef}
      type="button"
      title={`折叠${SIDE_LABEL[side]} Ctrl+${side === 'left' ? '1' : 'Shift+B'}`}
      onClick={() => p.onToggle(side)}
      className="rounded px-1 text-xs text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
    >
      {side === 'left' ? '⌃' : '⌄'}
    </button>
  )

  return (
    <div ref={hostRef} className="flex min-h-0 flex-1">
      {p.leftVisible && !p.focusMode ? (
        <>
          <div className="flex shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60" style={{ width: p.leftWidth }}>
            <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">题解</span>
              {collapseBtn('left')}
            </div>
            {p.left}
          </div>
          {divider('left')}
        </>
      ) : (
        !p.focusMode && rail('left')
      )}

      <main className="flex min-w-0 flex-1 flex-col">{p.center}</main>

      {p.rightVisible && !p.focusMode ? (
        <>
          {divider('right')}
          <div className="flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900/60" style={{ width: p.rightWidth }}>
            <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1">
              {collapseBtn('right')}
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">属性</span>
            </div>
            {p.right}
          </div>
        </>
      ) : (
        !p.focusMode && rail('right')
      )}
    </div>
  )
}

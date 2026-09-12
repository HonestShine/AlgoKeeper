import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { createLowlight, common } from 'lowlight'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import MathExtension from '@aarkue/tiptap-math-extension'
import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Image from '@tiptap/extension-image'
import { Fragment } from '@tiptap/pm/model'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Footnote } from '../../lib/footnote-extension'
import { getActiveEditor, setActiveEditor } from '../../lib/editor-bridge'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const lowlight = createLowlight(common)

const extensions = [
  StarterKit.configure({ codeBlock: false }),
  Footnote,
  CodeBlockLowlight.configure({ lowlight }),
  MathExtension.configure({ evaluation: true }),
  Markdown.configure({ html: false, tightLists: true }),
  Placeholder.configure({ placeholder: '书写题解… 支持 Markdown、代码块、LaTeX、表格、任务清单' }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Subscript,
  Superscript,
  Image
]

export interface EditorSurfaceProps {
  /** 当前正文（Markdown） */
  md: string
  editable: boolean
  onDocChange?: (md: string) => void
  /** 内容区滚动百分比（0–1），用于与源码模式对齐滚动位置 */
  onScrollRatio?: (ratio: number) => void
  /** 挂载时按此百分比恢复滚动位置（与 SourceEditor 同名 prop 对称，双向对齐的另一半） */
  initialScrollRatio?: number
  /** 内容区右键（文档操作快捷菜单；未提供则保留默认菜单） */
  onOpenContext?: (e: ReactMouseEvent<HTMLElement>) => void
}

/** 从编辑器 storage 取 Markdown 输出（tiptap-markdown 未做全局类型增强，做安全收窄） */
function mdFromEditor(editor: { storage: unknown }): string {
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } }
  return storage.markdown?.getMarkdown?.() ?? ''
}

/**
 * `[^n]` 脚注 token 的匹配模式 —— 「是否需要转换」的预检与真正做替换的转换
 * **共用同一个来源**（`textHasFootnoteToken` / `newFootnoteTokenRe`），避免两套谓词
 * 漂移：预检说「不必转换」而转换却 dispatch（或反之）时，下面 300ms 写窗的武装
 * 条件就会失真。
 */
const FOOTNOTE_TOKEN_PATTERN = '\\[\\^(\\d+)\\]'
/** 无 g 标志 → 无 lastIndex 状态，可反复安全调用 */
const FOOTNOTE_TOKEN_TEST = new RegExp(FOOTNOTE_TOKEN_PATTERN)
/** 每次转换新建带 g 的正则，避免 lastIndex 在文本节点之间串味 */
const newFootnoteTokenRe = (): RegExp => new RegExp(FOOTNOTE_TOKEN_PATTERN, 'g')

/** 该段文本是否含需要转成 Footnote 节点的 `[^n]` token */
function textHasFootnoteToken(text: string): boolean {
  return FOOTNOTE_TOKEN_TEST.test(text)
}

/**
 * 文档里是否存在 `[^n]` token —— 即 `convertFootnoteTokens` 这次调用是否会真的 dispatch。
 * 它是「武装程序性写窗」的唯一前提：窗口只能在真会派发时打开，否则会把窗口压在
 * 紧随其后的用户键入上（详见下面的脚注 effect）。
 */
function docHasFootnoteToken(editor: Editor): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (found) return false
    if (node.isText && typeof node.text === 'string' && textHasFootnoteToken(node.text)) found = true
    return !found
  })
  return found
}

/** 把正文中的 `[^n]` 文本 token 转成 Footnote 节点（幂等） */
function convertFootnoteTokens(editor: Editor): void {
  let tr = editor.state.tr
  let changed = false
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string' || !textHasFootnoteToken(node.text)) return true
    const schema = node.type.schema
    const re = newFootnoteTokenRe()
    const parts: PMNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(node.text)) !== null) {
      if (m.index > last) parts.push(schema.text(node.text.slice(last, m.index), node.marks))
      parts.push(schema.nodes.footnote.create({ ref: Number(m[1]) }) as PMNode)
      last = m.index + m[0].length
    }
    if (last < node.text.length) parts.push(schema.text(node.text.slice(last), node.marks))
    tr = tr.replaceWith(pos, pos + node.nodeSize, Fragment.fromArray(parts))
    changed = true
    return true
  })
  if (changed && tr.docChanged) editor.view.dispatch(tr)
}

export default function EditorSurface({ md, editable, onDocChange, onScrollRatio, initialScrollRatio, onOpenContext }: EditorSurfaceProps): ReactElement {
  // 程序性写入之后的 onUpdate 抑制时间窗（脚注转换用：它在同一个 effect 里
  // dispatch，事务本身没有 preventUpdate 元数据）。setContent 那条路径已改为
  // 事务级抑制（emitUpdate:false），不再依赖时间窗 —— 时间窗只应该覆盖
  // 「刚刚派发的那次程序性事务」，不该覆盖之后 300ms 内的用户键入。
  const lastApplied = useRef(0)
  const scrollHostRef = useRef<HTMLDivElement>(null)
  const editor = useEditor({
    extensions,
    content: md,
    editable,
    onUpdate: ({ editor: e }) => {
      if (performance.now() - lastApplied.current < 300) return
      onDocChange?.(mdFromEditor(e))
    }
  })

  // 挂载后按传入比例恢复滚动位置（源码 → WYSIWYG 方向）。
  // Tiptap 的内容高度同样是异步的，故沿用 SourceEditor 的 rAF 手法：放到下一帧、
  // 在下一次绘制前生效，这样恢复动作必胜、用户看不到从顶部跳走的中间态。
  useEffect(() => {
    const el = scrollHostRef.current
    if (!el || initialScrollRatio === undefined) return
    const raf = requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) el.scrollTop = initialScrollRatio * max
    })
    return () => cancelAnimationFrame(raf)
    // 仅在挂载时应用
  }, [])

  // 注册为全局当前编辑器（供菜单动作调用）
  useEffect(() => {
    if (!editor) return
    setActiveEditor(editor)
    return () => {
      if (getActiveEditor() === editor) setActiveEditor(null)
    }
  }, [editor])

  // 外部切换笔记（md 变化）时同步编辑器内容；与编辑输出一致则跳过。
  // 「程序性写入不得被误报为用户编辑」这条抑制仍然承重（setContent 在 tiptap 里
  // 默认 emitUpdate=true，@tiptap/core setContent 会给事务打 preventUpdate:!emitUpdate），
  // 只是把它从「300ms 时间窗」精确成「这一次事务」：时间窗会连带吞掉同一窗口内
  // 用户的真实键入 —— 切笔记后立刻敲字就是最典型的一条（编辑器里有这个字、
  // active.md 里没有 ⇒ 状态栏「已同步」+ 保存菜单置灰的假绿）。
  // 实测：手写 .md（末尾带换行）的 round-trip 与序列化结果不等 ⇒ 每次挂载都会走到
  // 这里，故这条时间窗也曾是挂载窗口的真正来源（不只是脚注 effect）。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (mdFromEditor(editor) === md) return
    editor.commands.setContent(md, { emitUpdate: false })
  }, [md, editor])

  // setEditable 在 tiptap 里也会 emit('update')（@tiptap/core setEditable：`if (emitUpdate)
  // this.emit('update', …)`）。它跟正文内容毫无关系，若被 onUpdate 收下，就会在
  // 「笔记刚打开」这一刻被误报成一次用户编辑（dirty 立刻为真、保存菜单从置灰变可用）。
  // 故显式关掉它的 update 事件 —— 与 setContent 的 emitUpdate:false 同理。
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable, false)
  }, [editable, editor])

  // md 载入后把文本 `[^n]` 转成 Footnote 节点（置于程序性写窗前，避免误标 dirty）。
  // 三行的顺序是关键：**先**确认这次转换真的会 dispatch，**再**武装写窗
  // （`view.dispatch` 会同步触发 onUpdate，武装必须早于它），最后才转换。
  // 曾经无条件武装：而 `md` 变化恰恰是「上一次键入被上报」的结果，于是每上报一次
  // 就把 300ms 窗口重新武装一次 —— 窗口内紧随的键入被 onUpdate 直接吞掉、
  // 永不进入 active.md（敲完立刻 Ctrl+S 不落盘 / 立刻 Ctrl+/ 时刚打的字从屏幕消失）。
  // 不含 `[^n]` 的笔记（绝大多数）窗口永不武装，暴露面归零；含脚注 token 的笔记里
  // 武装与真实 doc 变更同源。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (!docHasFootnoteToken(editor)) return
    lastApplied.current = performance.now()
    convertFootnoteTokens(editor)
  }, [md, editor])

  // 警告框彩化：DOM 装饰层（不改 schema，round-trip 安全）；块引用首行 `[!type]` 上色
  useEffect(() => {
    if (!editor) return
    const decorate = (): void => {
      const container = editor.view?.dom as HTMLElement | undefined
      if (!container) return
      container.querySelectorAll('blockquote').forEach((bq) => {
        const e = bq as HTMLElement
        const cls = Array.from(e.classList).filter((c) => c.startsWith('ak-callout'))
        e.classList.remove(...cls)
        const m = /^\[!(\w+)\]/.exec((e.textContent ?? '').trimStart())
        if (m) e.classList.add('ak-callout', `ak-callout-${m[1].toLowerCase()}`)
      })
      // 脚注：把定义正文挂到引用的 title（悬停预览）
      const defs = new Map<string, string>()
      container.querySelectorAll('p').forEach((p) => {
        const dm = /^\[\^(\d+)\]:\s*(.*)/.exec((p.textContent ?? '').trim())
        if (dm) defs.set(dm[1], dm[2])
      })
      container.querySelectorAll('sup.ak-footnote').forEach((s) => {
        const n = s.getAttribute('data-fn') ?? ''
        const body = defs.get(n)
        if (body) s.setAttribute('title', body)
      })
    }
    decorate()
    let observer: MutationObserver | null = null
    const ensureObserver = (): void => {
      const container = editor.view?.dom as HTMLElement | undefined
      if (!container || observer) return
      observer = new MutationObserver(decorate)
      observer.observe(container, { childList: true, subtree: true, characterData: true })
    }
    ensureObserver()
    const boot = globalThis.setInterval(() => {
      ensureObserver()
      decorate()
      if (observer) globalThis.clearInterval(boot)
    }, 200)
    return () => {
      globalThis.clearInterval(boot)
      observer?.disconnect()
    }
  }, [editor])

  // 脚注：引用↔定义点击跳转
  useEffect(() => {
    if (!editor) return
    const dom = editor.view?.dom as HTMLElement | undefined
    if (!dom) return
    const onClick = (ev: MouseEvent): void => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const sup = t.closest('sup.ak-footnote')
      if (sup) {
        const n = sup.getAttribute('data-fn')
        const def = n
          ? Array.from(dom.querySelectorAll('p')).find((p) => new RegExp(`^\\[\\^${n}\\]\\:`).test((p.textContent ?? '').trim()))
          : undefined
        if (def) def.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      const p = t.closest('p')
      if (p) {
        const m = /^\[\^(\d+)\]:/.exec((p.textContent ?? '').trim())
        if (m) {
          const ref = Array.from(dom.querySelectorAll('sup.ak-footnote')).find((s) => s.getAttribute('data-fn') === m[1])
          ref?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }
    dom.addEventListener('click', onClick)
    return () => dom.removeEventListener('click', onClick)
  }, [editor])

  return (
    <div
      className="flex h-full flex-col"
      onContextMenu={(e) => {
        if (onOpenContext) {
          e.preventDefault()
          onOpenContext(e)
        }
      }}
    >
      <div
        ref={scrollHostRef}
        className="ak-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onScroll={(e) => {
          if (!onScrollRatio) return
          const el = e.currentTarget
          const max = el.scrollHeight - el.clientHeight
          onScrollRatio(max > 0 ? el.scrollTop / max : 0)
        }}
      >
        <div className="ak-page">
          <EditorContent editor={editor} className="ak-editor" />
        </div>
      </div>
    </div>
  )
}

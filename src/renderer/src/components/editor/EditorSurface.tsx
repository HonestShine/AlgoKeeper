import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { createLowlight, common } from 'lowlight'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import MathExtension from '@aarkue/tiptap-math-extension'
import { useEffect, useRef } from 'react'
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

/** 把正文中的 `[^n]` 文本 token 转成 Footnote 节点（幂等） */
function convertFootnoteTokens(editor: import('@tiptap/core').Editor): void {
  let tr = editor.state.tr
  let changed = false
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string' || !node.text.includes('[^')) return true
    const schema = node.type.schema
    const re = /\[\^(\d+)\]/g
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
  // 程序性 setContent 之后 onUpdate 可能异步派发，用时间窗抑制误报“用户编辑”
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

  // 外部切换笔记（md 变化）时同步编辑器内容；与编辑输出一致则跳过
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (mdFromEditor(editor) === md) return
    lastApplied.current = performance.now()
    editor.commands.setContent(md)
  }, [md, editor])

  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editable, editor])

  // md 载入后把文本 `[^n]` 转成 Footnote 节点（置于程序性写窗前，避免误标 dirty）
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
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

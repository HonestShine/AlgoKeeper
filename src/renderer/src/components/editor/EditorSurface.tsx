import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { createLowlight, common } from 'lowlight'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import MathExtension from '@aarkue/tiptap-math-extension'
import { useCallback, useEffect, useRef, type ReactElement } from 'react'
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
import { getActiveEditor, setActiveEditor } from '../../lib/editor-bridge'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

const lowlight = createLowlight(common)

const extensions = [
  StarterKit.configure({ codeBlock: false }),
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
}

/** 从编辑器 storage 取 Markdown 输出（tiptap-markdown 未做全局类型增强，做安全收窄） */
function mdFromEditor(editor: { storage: unknown }): string {
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } }
  return storage.markdown?.getMarkdown?.() ?? ''
}

export default function EditorSurface({ md, editable, onDocChange }: EditorSurfaceProps): ReactElement {
  // 程序性 setContent 之后 onUpdate 可能异步派发，用时间窗抑制误报“用户编辑”
  const lastApplied = useRef(0)
  const editor = useEditor({
    extensions,
    content: md,
    editable,
    onUpdate: ({ editor: e }) => {
      if (performance.now() - lastApplied.current < 300) return
      onDocChange?.(mdFromEditor(e))
    }
  })

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

  const btn = useCallback(
    (label: string, title: string, run: () => void): ReactElement => (
      <button
        key={label}
        type="button"
        title={title}
        disabled={!editor}
        onClick={run}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
      >
        {label}
      </button>
    ),
    [editor]
  )

  return (
    <div className="flex h-full flex-col">
      {editable && (
      <div className="flex items-center gap-0.5 border-b border-neutral-800/70 px-2 py-1">
        {btn('B', '粗体 Ctrl+B', () => editor?.chain().focus().toggleBold().run())}
        {btn('I', '斜体 Ctrl+I', () => editor?.chain().focus().toggleItalic().run())}
        {btn('<>', '行内代码', () => editor?.chain().focus().toggleCode().run())}
        {btn('H1', '一级标题', () => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
        {btn('H2', '二级标题', () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
        {btn('H3', '三级标题', () => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
        {btn('≡', '无序列表', () => editor?.chain().focus().toggleBulletList().run())}
        {btn('1.', '有序列表', () => editor?.chain().focus().toggleOrderedList().run())}
        <span className="mx-1 h-4 w-px bg-neutral-800" />
        {btn('↶', '撤销', () => editor?.chain().focus().undo().run())}
        {btn('↷', '重做', () => editor?.chain().focus().redo().run())}
      </div>
      )}
      <div className="ak-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <EditorContent editor={editor} className="ak-editor" />
      </div>
    </div>
  )
}

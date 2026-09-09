import type { Editor } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'
import { getActiveEditor } from './editor-bridge'

function chain(editor: Editor) {
  return editor.chain().focus()
}

function plainSelection(editor: Editor): string {
  const { from, to } = editor.state.selection
  return editor.state.doc.textBetween(from, to, '\n')
}

function htmlSelection(editor: Editor): string {
  const { from, to } = editor.state.selection
  const slice = editor.state.doc.slice(from, to).content
  const div = document.createElement('div')
  const serializer = DOMSerializer.fromSchema(editor.schema)
  div.appendChild(serializer.serializeFragment(slice))
  return div.innerHTML
}

/** 编辑命令：能执行的返回 true，不能（无编辑器/只读/未实现）返回 false。 */
export function runEditorAction(id: string): boolean {
  const editor = getActiveEditor()
  if (!editor || !editor.isEditable) {
    // 允许无需编辑器即可完成的仅文档外动作已在别处处理
    return false
  }
  switch (id) {
    // —— 段落 ——
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      chain(editor).toggleHeading({ level: Number(id[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
      return true
    case 'code-block': chain(editor).toggleCodeBlock().run(); return true
    case 'formula-block': {
      editor.chain().focus().insertContent('$$\nE = mc^2\n$$').run()
      return true
    }
    case 'math-inline': {
      editor.chain().focus().insertContent('$x^2$').run()
      return true
    }
    case 'callout-note':
    case 'callout-tip':
    case 'callout-important':
    case 'callout-warn':
    case 'callout-caution': {
      const defs: Record<string, { tag: string; title: string }> = {
        'callout-note': { tag: 'note', title: '提醒内容' },
        'callout-tip': { tag: 'tip', title: '建议内容' },
        'callout-important': { tag: 'important', title: '重要内容' },
        'callout-warn': { tag: 'warning', title: '警告内容' },
        'callout-caution': { tag: 'caution', title: '注意内容' }
      }
      const d = defs[id]
      editor.chain().focus().insertContent(`\n\n> [!${d.tag}] ${d.title}\n> 在此输入${d.title}正文。\n`).run()
      return true
    }
    case 'blockquote': chain(editor).toggleBlockquote().run(); return true
    case 'olist': chain(editor).toggleOrderedList().run(); return true
    case 'ulist': chain(editor).toggleBulletList().run(); return true
    case 'task-list': chain(editor).toggleTaskList().run(); return true
    case 'hr': chain(editor).setHorizontalRule().run(); return true
    // —— 表格 ——
    case 'table-insert': chain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); return true
    case 'table-add-row-above': chain(editor).addRowBefore().run(); return true
    case 'table-add-row-below': chain(editor).addRowAfter().run(); return true
    case 'table-add-col-before': chain(editor).addColumnBefore().run(); return true
    case 'table-add-col-after': chain(editor).addColumnAfter().run(); return true
    case 'table-del-row': chain(editor).deleteRow().run(); return true
    case 'table-del-col': chain(editor).deleteColumn().run(); return true
    case 'table-delete': chain(editor).deleteTable().run(); return true
    // —— 格式 ——
    case 'bold': chain(editor).toggleBold().run(); return true
    case 'italic': chain(editor).toggleItalic().run(); return true
    case 'underline': chain(editor).toggleUnderline().run(); return true
    case 'code': chain(editor).toggleCode().run(); return true
    case 'strike': chain(editor).toggleStrike().run(); return true
    case 'highlight': chain(editor).toggleHighlight().run(); return true
    case 'sup': chain(editor).toggleSuperscript().run(); return true
    case 'sub': chain(editor).toggleSubscript().run(); return true
    case 'clear-format': chain(editor).unsetAllMarks().clearNodes().run(); return true
    case 'link': {
      const href = window.prompt('超链接地址（https://…）')
      if (href == null) return false
      chain(editor).extendMarkRange('link').setLink({ href }).run()
      return true
    }
    case 'image': {
      const src = window.prompt('图片地址（支持相对 .images/ 路径）')
      if (src == null) return false
      chain(editor).setImage({ src }).run()
      return true
    }
    case 'undo': chain(editor).undo().run(); return true
    case 'redo': chain(editor).redo().run(); return true
    case 'select-all': chain(editor).selectAll().run(); return true
    case 'goto-start': {
      const { $from } = editor.state.selection
      chain(editor).setTextSelection($from.start(1)).run()
      return true
    }
    case 'goto-end': {
      const size = editor.state.doc.content.size
      chain(editor).setTextSelection(size).run()
      return true
    }
    // —— 剪贴板（富文本 / HTML / 纯文本 分格式）——
    case 'copy': {
      // 富文本（系统剪贴板 HTML+文本）→ 粘贴到别处保留格式
      const plain = plainSelection(editor)
      const html = htmlSelection(editor)
      void navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]).catch(() => {
        if (plain) void navigator.clipboard.writeText(plain)
      })
      return true
    }
    case 'copy-html': {
      const plain = plainSelection(editor)
      const html = htmlSelection(editor)
      void navigator.clipboard
        .write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
        .catch(() => {
          if (plain) void navigator.clipboard.writeText(plain)
        })
      return true
    }
    case 'copy-text':
    case 'copy-markdown':
    case 'copy-image': {
      const t = plainSelection(editor)
      if (t) void navigator.clipboard.writeText(t)
      return true
    }
    case 'cut': {
      const { from, to } = editor.state.selection
      const t = editor.state.doc.textBetween(from, to, '\n')
      if (t) void navigator.clipboard.writeText(t)
      chain(editor).deleteSelection().run()
      return true
    }
    case 'paste':
    case 'paste-text': {
      void navigator.clipboard.readText().then((t) => {
        if (t && editor.isEditable) editor.chain().focus().insertContent(t).run()
      })
      return true
    }
    // —— 选择 / 光标 / 删除 近似（当前块语义）——
    case 'select-block':
    case 'select-line':
    case 'select-format':
    case 'select-word': {
      const start = editor.state.selection.$from.start()
      const end = editor.state.selection.$from.end()
      chain(editor).setTextSelection({ from: start, to: end }).run()
      return true
    }
    case 'goto-selection': {
      chain(editor).focus().run()
      return true
    }
    case 'goto-line-start': {
      chain(editor).setTextSelection(editor.state.selection.$from.start()).run()
      return true
    }
    case 'goto-line-end': {
      chain(editor).setTextSelection(editor.state.selection.$from.end()).run()
      return true
    }
    case 'delete': {
      chain(editor).deleteSelection().run()
      return true
    }
    case 'delete-block':
    case 'delete-line': {
      const start = editor.state.selection.$from.start()
      const end = editor.state.selection.$from.end()
      chain(editor).deleteRange({ from: start, to: end }).run()
      return true
    }
    case 'delete-format': {
      chain(editor).unsetAllMarks().run()
      return true
    }
    case 'delete-word': {
      chain(editor).deleteSelection().run()
      return true
    }
    case 'math-refresh': {
      return true // KaTeX 输入即渲染，无需刷新
    }
    case 'eol-crlf':
    case 'eol-lf': {
      return true // 换行符风格跟随平台，此处无需转换
    }
    case 'comment': {
      editor.chain().focus().insertContent('<!-- 注释 -->').run()
      return true
    }
    case 'link-ref': {
      editor.chain().focus().insertContent('\n\n[链接文字]: https://example.com\n').run()
      return true
    }
    case 'footnote': {
      const text = editor.state.doc.textContent
      let max = 0
      const re = /\[\^(\d+)\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) max = Math.max(max, Number(m[1]))
      const n = max + 1
      editor.chain().focus().insertContent(`[^${n}]`).run()
      editor.chain().insertContentAt(editor.state.doc.content.size, `\n\n[^${n}]: 脚注内容\n`).run()
      return true
    }
    case 'toc': {
      editor.chain().focus().insertContent('\n\n## 目录\n\n<!-- 阅读模式下自动生成大纲 -->\n').run()
      return true
    }
    case 'yaml': {
      editor.chain().focus().insertContent('\n\n<!-- 元数据在文件头部 Frontmatter 中编辑 -->\n').run()
      return true
    }
    case 'image-open':
    case 'image-settings':
    case 'image-delete': {
      return true
    }
    default:
      return false
  }
}

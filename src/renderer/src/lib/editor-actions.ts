import type { Editor } from '@tiptap/react'
import { getActiveEditor } from './editor-bridge'

function chain(editor: Editor) {
  return editor.chain().focus()
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
    default:
      return false
  }
}

import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { tags } from '@lezer/highlight'

export interface SourceEditorProps {
  md: string
  onChange(md: string): void
  /** 滚动百分比（0–1），用于切换模式时对齐位置 */
  onScrollRatio?(ratio: number): void
  initialScrollRatio?: number
}

/** 围栏代码块内嵌高亮的语言（覆盖 LeetCode 主流提交语言）。 */
const CODE_LANGUAGES = [
  LanguageDescription.of({ name: 'javascript', alias: ['js', 'jsx', 'typescript', 'ts', 'tsx'], extensions: ['js', 'jsx', 'ts', 'tsx'], load: async () => javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'python', alias: ['py'], extensions: ['py'], load: async () => python() }),
  LanguageDescription.of({ name: 'cpp', alias: ['c++'], extensions: ['cpp', 'cc', 'h', 'hpp'], load: async () => cpp() }),
  LanguageDescription.of({ name: 'java', extensions: ['java'], load: async () => java() }),
  LanguageDescription.of({ name: 'go', alias: ['golang'], extensions: ['go'], load: async () => go() })
]

/** 主题：所有颜色走 CSS 变量，跟随 data-theme 切换。 */
const akTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--ak-src-bg)', color: 'var(--ak-src-fg)', height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace", lineHeight: '1.7' },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--ak-src-bg)', color: 'var(--ak-src-gutter-fg)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--ak-src-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--ak-src-active-line)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--ak-src-cursor)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--ak-src-selection)'
  }
})

const akHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--ak-src-heading)', fontWeight: '700' },
  { tag: tags.strong, color: 'var(--ak-src-emphasis)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--ak-src-emphasis)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--ak-src-link)' },
  { tag: tags.monospace, color: 'var(--ak-src-code)' },
  { tag: tags.quote, color: 'var(--ak-src-quote)' },
  { tag: tags.list, color: 'var(--ak-src-list)' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--ak-src-fence)' },
  { tag: tags.keyword, color: 'var(--ak-src-keyword)' },
  { tag: tags.string, color: 'var(--ak-src-string)' },
  { tag: tags.comment, color: 'var(--ak-src-comment)' },
  { tag: tags.number, color: 'var(--ak-src-number)' },
  { tag: [tags.typeName, tags.className], color: 'var(--ak-src-type)' }
])

/** CodeMirror 6 封装：受控 md 同步 + 滚动百分比回传。 */
export default function SourceEditor({ md, onChange, onScrollRatio, initialScrollRatio }: SourceEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const scrollRef = useRef(onScrollRatio)
  const appliedRef = useRef(false)

  onChangeRef.current = onChange
  scrollRef.current = onScrollRatio

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: md,
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage, codeLanguages: CODE_LANGUAGES }),
          syntaxHighlighting(akHighlight),
          akTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            if (!appliedRef.current) onChangeRef.current(u.state.doc.toString())
            const scroller = u.view.scrollDOM
            const max = scroller.scrollHeight - scroller.clientHeight
            scrollRef.current?.(max > 0 ? scroller.scrollTop / max : 0)
          }),
          EditorView.domEventHandlers({
            scroll: (_e, v) => {
              const max = v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight
              scrollRef.current?.(max > 0 ? v.scrollDOM.scrollTop / max : 0)
              return false
            }
          })
        ]
      })
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅首次挂载建视图；外部 md 变化由下一个 effect 处理
  }, [])

  // 外部 md 变化 → 全量替换（保留选区，越界落到文末）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur === md) return
    const sel = view.state.selection.main
    const anchor = Math.min(sel.anchor, md.length)
    const head = Math.min(sel.head, md.length)
    appliedRef.current = true
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: md },
      selection: { anchor, head }
    })
    appliedRef.current = false
  }, [md])

  // 首次挂载后按传入比例恢复滚动位置
  useEffect(() => {
    const view = viewRef.current
    if (!view || initialScrollRatio === undefined) return
    const scroller = view.scrollDOM
    const max = scroller.scrollHeight - scroller.clientHeight
    if (max > 0) scroller.scrollTop = initialScrollRatio * max
    // 仅在挂载时应用
  }, [])

  return <div ref={hostRef} className="h-full overflow-hidden" />
}

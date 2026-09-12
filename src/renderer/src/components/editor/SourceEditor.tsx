import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { EditorState, Transaction } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import { CODE_LANGUAGES } from './language-descriptions'

export interface SourceEditorProps {
  md: string
  onChange(md: string): void
  /** 滚动百分比（0–1），用于切换模式时对齐位置 */
  onScrollRatio?(ratio: number): void
  initialScrollRatio?: number
}

/** 主题：所有颜色走 CSS 变量，跟随 data-theme 切换。 */
const akTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--ak-src-bg)', color: 'var(--ak-src-fg)', height: '100%', fontSize: '13px' },
    '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace", lineHeight: '1.7' },
    '.cm-content': { padding: '12px 0' },
    '.cm-gutters': { backgroundColor: 'var(--ak-src-bg)', color: 'var(--ak-src-gutter-fg)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'var(--ak-src-active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--ak-src-active-line)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--ak-src-cursor)' },
    // 选择器必须与 @codemirror/view 基础主题「同形状」：基础主题写的是
    // `&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`（特异性 0,5,0），
    // 只写 `&.cm-focused .cm-selectionBackground`（0,3,0）会被它压过，--ak-src-selection 不生效。
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'var(--ak-src-selection)' },
    // 面板 / 输入框 / 按钮 / 悬浮层：基础主题对它们写死了 &light 与 &dark 两套颜色。
    // 本编辑器是单一实例（dark: true），若不显式覆盖，浅色主题下会露出深色 UI（或反之）。
    '.cm-panels': { backgroundColor: 'var(--ak-src-panel-bg)', color: 'var(--ak-src-fg)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--ak-src-border)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--ak-src-border)' },
    '.cm-textfield': {
      backgroundColor: 'var(--ak-src-field-bg)',
      color: 'var(--ak-src-fg)',
      border: '1px solid var(--ak-src-border)'
    },
    '.cm-button': {
      backgroundColor: 'var(--ak-src-btn-bg)',
      backgroundImage: 'none',
      color: 'var(--ak-src-fg)',
      border: '1px solid var(--ak-src-border)'
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--ak-src-panel-bg)',
      color: 'var(--ak-src-fg)',
      border: '1px solid var(--ak-src-border)'
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--ak-src-active-line)',
      color: 'var(--ak-src-fg)'
    },
    '.cm-searchMatch': { backgroundColor: 'var(--ak-src-match)', outline: '1px solid var(--ak-src-border)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--ak-src-match-selected)' }
  },
  // dark: true —— 不标会让 darkTheme facet 恒 false，基础主题走 &light 分支，
  // 深色编辑器里的 Ctrl+F 面板会是浅色条。代价：基础主题一律走 &dark 分支，
  // 故上面必须显式覆盖全部相关选择器（两套主题都要实测）。
  { dark: true }
)

const akHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--ak-src-heading)', fontWeight: '700' },
  { tag: tags.strong, color: 'var(--ak-src-emphasis)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--ak-src-emphasis)', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: 'var(--ak-src-quote)', textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--ak-src-link)' },
  { tag: tags.monospace, color: 'var(--ak-src-code)' },
  { tag: [tags.quote, tags.contentSeparator], color: 'var(--ak-src-quote)' },
  { tag: tags.list, color: 'var(--ak-src-list)' },
  // 围栏的语言标签（```ts 里的 ts）与链接标签
  { tag: tags.labelName, color: 'var(--ak-src-label)' },
  // 围栏标记 ``` 本身
  { tag: tags.processingInstruction, color: 'var(--ak-src-fence)' },
  { tag: tags.keyword, color: 'var(--ak-src-keyword)' },
  { tag: tags.string, color: 'var(--ak-src-string)' },
  { tag: tags.comment, color: 'var(--ak-src-comment)' },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: 'var(--ak-src-number)' },
  { tag: [tags.typeName, tags.className], color: 'var(--ak-src-type)' },
  // 函数名 / 定义名（此前只有 typeName 有色，函数名是裸前景色）
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: 'var(--ak-src-type)' },
  { tag: tags.propertyName, color: 'var(--ak-src-property)' },
  { tag: tags.operator, color: 'var(--ak-src-operator)' }
])

/** CodeMirror 6 封装：受控 md 同步 + 滚动百分比回传。 */
export default function SourceEditor({ md, onChange, onScrollRatio, initialScrollRatio }: SourceEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const scrollRef = useRef(onScrollRatio)
  const appliedRef = useRef(false)
  /** 最近一次由本编辑器发出（而非外部传入）的 md，用于识别「自己回灌的旧值」 */
  const lastEmittedRef = useRef<string | null>(null)

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
            if (!appliedRef.current) {
              const next = u.state.doc.toString()
              lastEmittedRef.current = next
              onChangeRef.current(next)
            }
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
    // 进入源码模式是明确的用户意图（他就是来编辑的），故主动聚焦：
    // 不聚焦的话，Ctrl+/ 路径焦点落回 <body>、状态栏 `</>` 路径焦点留在按钮上，
    // CodeMirror 的键位（含 searchKeymap 的 Ctrl+F）与直接打字都会失效。
    // SourceEditor 只在「编辑态 + 源码态」挂载，不存在非用户意图的挂载路径，
    // 因此不会与 T9 的「挂载即抢焦」防护冲突。
    view.focus()
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
    // 回灌的 md 可能是上一帧的旧值（React commit 与 passive effect 之间用户又敲了一键）：
    // 若它正是我们自己刚发出的内容，说明文档已前进，直接跳过，别把文档回退。
    if (md === lastEmittedRef.current) return
    const sel = view.state.selection.main
    const anchor = Math.min(sel.anchor, md.length)
    const head = Math.min(sel.head, md.length)
    appliedRef.current = true
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: md },
      selection: { anchor, head },
      // 程序性全量替换绝不能进 undo 历史：否则「切笔记 + 500ms 内敲字 + Ctrl+Z」
      // 会把文档整篇回退成上一篇笔记的正文，而 save() 用的是 active.md + 当前 noteId
      // → 会把上一篇正文写进当前笔记文件。用户键入仍照常可撤销。
      annotations: [Transaction.addToHistory.of(false)]
    })
    appliedRef.current = false
    lastEmittedRef.current = md
  }, [md])

  // 首次挂载后按传入比例恢复滚动位置
  useEffect(() => {
    const view = viewRef.current
    if (!view || initialScrollRatio === undefined) return
    // CodeMirror 对超长文档的初始高度是估算值，同步读 scrollHeight 会偏，放到下一帧再恢复
    const raf = requestAnimationFrame(() => {
      const scroller = view.scrollDOM
      const max = scroller.scrollHeight - scroller.clientHeight
      if (max > 0) scroller.scrollTop = initialScrollRatio * max
    })
    return () => cancelAnimationFrame(raf)
    // 仅在挂载时应用
  }, [])

  return <div ref={hostRef} className="h-full overflow-hidden" />
}

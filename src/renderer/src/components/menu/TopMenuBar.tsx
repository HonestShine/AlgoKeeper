import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'

export interface TopMenuBarProps {
  dueCount: number
  dirty: boolean
  saving: boolean
  mode: 'edit' | 'read'
  /** 是否有可编辑编辑器（决定编辑器类菜单是否可用） */
  canEdit: boolean
  disabledKeys?: string[]
  onAction(key: string): void
}

interface MItem {
  key: string
  label: string
  shortcut?: string
  sub?: MItem[]
  sep?: boolean
  needsEditor?: boolean
  /** 未实现的占位能力（显示为置灰） */
  todo?: boolean
}

interface MenuGroup {
  label: string
  items: MItem[]
}

const e = (key: string, label: string, needsEditor = true): MItem => ({ key, label, needsEditor })
const t = (key: string, label: string): MItem => ({ key, label, todo: true })
const sep = (): MItem => ({ key: `s${Math.random().toString(36).slice(2)}`, label: '', sep: true })

function item(k: string, label: string, extra: Partial<MItem> = {}): MItem {
  return { key: k, label, ...extra }
}

const GROUPS: MenuGroup[] = [
  {
    label: '文件',
    items: [
      item('new-note', '新建', { shortcut: 'Ctrl+Shift+N' }),
      t('new-window', '新建窗口'),
      item('open-note', '打开…', { shortcut: 'Ctrl+K' }),
      item('open-folder', '打开文件夹…'),
      t('open-recent', '打开最近文件'),
      sep(),
      item('save', '保存', { shortcut: 'Ctrl+S' }),
      item('save-as', '另存为…', { shortcut: 'Ctrl+Shift+S' }),
      t('move-note', '移动到…'),
      item('save-all', '保存全部打开的文件…'),
      item('delete-note', '删除…'),
      t('import', '导入…'),
      {
        key: 'export',
        label: '导出',
        sub: [
          item('export-pdf', 'PDF'),
          item('export-html', 'HTML'),
          item('export-html-plain', 'HTML(without styles)')
        ]
      },
      sep(),
      item('open-settings', '偏好设置…', { shortcut: 'Ctrl+,' }),
      item('close-note', '关闭')
    ]
  },
  {
    label: '编辑',
    items: [
      e('undo', '撤销', false),
      e('redo', '重做', false),
      sep(),
      t('cut', '剪切'),
      t('copy', '复制'),
      t('copy-image', '拷贝图片'),
      t('paste', '粘贴'),
      t('copy-text', '复制为纯文本'),
      t('copy-markdown', '复制为 Markdown'),
      t('copy-html', '复制为 HTML 代码'),
      t('paste-text', '粘贴为纯文本'),
      {
        key: 'selection',
        label: '选择',
        sub: [
          e('select-all', '全选', false),
          t('select-block', '选择段落或块'),
          t('select-line', '选中当前行或句'),
          t('select-format', '选中当前格式文本'),
          t('select-word', '选中当前词'),
          e('goto-start', '跳转到文首', false),
          t('goto-selection', '跳转到所选内容'),
          e('goto-end', '跳转到文末', false),
          t('goto-line-start', '跳转到行首'),
          t('goto-line-end', '跳转到行尾')
        ]
      },
      sep(),
      t('delete', '删除'),
      {
        key: 'delete-range',
        label: '删除范围',
        sub: [t('delete-block', '删除块'), t('delete-line', '删除当前行或句'), t('delete-format', '删除当前格式文本'), t('delete-word', '删除当前词')]
      },
      { key: 'math-tools', label: '数学工具', sub: [t('math-refresh', '刷新所有数学公式')] },
      { key: 'eol', label: '换行符', sub: [t('eol-crlf', 'Windows换行符(CRLF)'), t('eol-lf', 'Unix换行符(LF)')] },
      {
        key: 'find',
        label: '查找和替换',
        sub: [
          item('find-open', '查找…', { shortcut: 'Ctrl+F' }),
          item('find-next', '查找下一个', { shortcut: 'Enter' }),
          item('find-prev', '查找上一个'),
          item('find-replace', '替换')
        ]
      }
    ]
  },
  {
    label: '段落',
    items: [
      e('h1', '一级标题'), e('h2', '二级标题'), e('h3', '三级标题'),
      e('h4', '四级标题'), e('h5', '五级标题'), e('h6', '六级标题'),
      {
        key: 'table',
        label: '表格',
        sub: [
          e('table-insert', '插入表格'),
          e('table-add-row-above', '上方插入行'),
          e('table-add-row-below', '下方插入行'),
          e('table-add-col-before', '左侧插入列'),
          e('table-add-col-after', '右侧插入列'),
          e('table-del-row', '删除行'),
          e('table-del-col', '删除列'),
          t('table-copy', '复制表格'),
          e('table-delete', '删除表格')
        ]
      },
      item('formula-block', '公式块'),
      e('code-block', '代码块'),
      {
        key: 'callout',
        label: '警告框',
        sub: [t('callout-note', '提醒内容'), t('callout-tip', '建议内容'), t('callout-important', '重要内容'), t('callout-warn', '警告内容'), t('callout-caution', '注意内容')]
      },
      e('blockquote', '引用'),
      e('olist', '有序列表'),
      e('ulist', '无序列表'),
      e('task-list', '任务列表'),
      t('link-ref', '链接引用'),
      t('footnote', '脚注'),
      e('hr', '水平分割线'),
      t('toc', '内容目录'),
      t('yaml', 'YAML Front Matter')
    ]
  },
  {
    label: '格式',
    items: [
      e('bold', '加粗'), e('italic', '斜体'), e('underline', '下划线'), e('code', '代码'),
      item('math-inline', '内联公式'), e('highlight', '高亮'), e('sup', '上标'), e('sub', '下标'),
      t('comment', '注释'), e('link', '超链接'),
      {
        key: 'image',
        label: '图像',
        sub: [e('image', '插入图片'), t('image-local', '插入本地图片'), t('image-open', '打开图片位置…'), t('image-delete', '删除图片文件'), t('image-settings', '全局图像设置…')]
      },
      e('clear-format', '清除样式')
    ]
  },
  {
    label: '视图',
    items: [
      item('toggle-filebar', '显示/隐藏文件管理栏'),
      t('outline', '大纲'),
      item('docs-list', '文档列表'),
      item('toggle-filetree', '文件树'),
      item('open-search', '搜索', { shortcut: 'Ctrl+K' }),
      item('source-mode', '源代码模式', { shortcut: 'Ctrl+/' }),
      item('toggle-statusbar', '显示状态栏')
    ]
  },
  {
    label: '复习',
    items: [item('review-start', '今日复习…', { shortcut: 'Ctrl+Shift+R' }), item('open-dashboard', '统计看板…')]
  },
  { label: '主题', items: [item('theme-github', 'Github', { shortcut: '' })] },
  { label: '帮助', items: [item('about', '关于…')] }
]

function isDisabled(prop: TopMenuBarProps, it: MItem): boolean {
  if (it.sep) return false
  if (it.todo) return true
  if (it.needsEditor && !prop.canEdit) return true
  if (prop.disabledKeys?.includes(it.key)) return true
  return false
}

/** 应用级顶层菜单栏：文件/编辑/段落/格式/视图/复习/主题/帮助（子菜单钻取）。 */
export default function TopMenuBar(p: TopMenuBarProps): ReactElement {
  const groups = GROUPS.map((g) =>
    g.label === '复习'
      ? { ...g, items: g.items.map((it) => (it.key === 'review-start' ? { ...it, label: `今日复习…${p.dueCount > 0 ? `（${p.dueCount}）` : ''}` } : it)) }
      : g
  )
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // 钻取栈：每层为 { title, items }
  const [stack, setStack] = useState<Array<{ title: string; items: MItem[] }>>([])

  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  const closeAll = (): void => {
    setOpenGroup(null)
    setStack([])
    setAnchor(null)
  }

  const openTop = (g: MenuGroup, e: ReactMouseEvent<HTMLButtonElement>): void => {
    if (openGroup === g.label) closeAll()
    else {
      const r = e.currentTarget.getBoundingClientRect()
      setAnchor({ x: r.left, y: r.bottom + 2 })
      setOpenGroup(g.label)
      setStack([{ title: g.label, items: g.items }])
    }
  }

  const openSub = (it: MItem): void => {
    setStack((s) => [...s, { title: it.label, items: it.sub ?? [] }])
  }

  const run = (it: MItem): void => {
    if (it.sub?.length) return openSub(it)
    if (it.sep || isDisabled(p, it)) return
    closeAll()
    p.onAction(it.key)
  }

  const back = (): void => setStack((s) => s.slice(0, -1))

  const visibleItems = stack.length ? stack[stack.length - 1].items : []
  const inSub = stack.length > 0

  return (
    <div className="relative z-40 flex select-none items-center border-b border-neutral-800 bg-neutral-900 px-1 text-[13px] text-neutral-300">
      {groups.map((g) => (
        <button
          key={g.label}
          type="button"
          onClick={(e) => openTop(g, e)}
          className={`relative z-50 rounded px-2.5 py-1 hover:bg-neutral-800 ${openGroup === g.label ? 'bg-neutral-800' : ''}`}
        >
          {g.label}
        </button>
      ))}

      {openGroup && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeAll} />
          <div
            className="fixed z-50 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-2xl"
            style={anchor ? { left: Math.min(anchor.x, window.innerWidth - 280), top: anchor.y } : { left: 0, top: 0, display: 'none' }}
          >
            {inSub && (
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-[12px] text-neutral-500 hover:bg-neutral-800"
                onClick={back}
              >
                ‹ 返回 {stack.length > 1 ? stack[stack.length - 2].title : ''}
              </button>
            )}
            {inSub && <div className="mx-2 my-1 border-t border-neutral-800" />}
            <div className="max-h-[70vh] overflow-y-auto">
              {visibleItems.map((it) =>
                it.sep ? (
                  <div key={it.key} className="mx-2 my-1 border-t border-neutral-800" />
                ) : (
                  <button
                    key={it.key}
                    type="button"
                    disabled={isDisabled(p, it)}
                    title={it.todo ? '待实现' : undefined}
                    onClick={() => run(it)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] ${
                      it.todo ? 'text-neutral-600' : 'text-neutral-200 hover:bg-neutral-800'
                    } disabled:opacity-45`}
                  >
                    <span>{it.label}</span>
                    <span className="ml-4 flex items-center gap-2">
                      {it.shortcut && <span className="text-[11px] text-neutral-500">{it.shortcut}</span>}
                      {it.sub && <span className="text-neutral-600">›</span>}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}
      <div className="ml-auto pr-1 text-[11px] text-neutral-700">
        {p.mode === 'edit' ? '编辑中' : '阅读'}
      </div>
    </div>
  )
}

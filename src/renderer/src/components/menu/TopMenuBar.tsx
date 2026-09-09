import { useState } from 'react'
import type { ReactElement } from 'react'

export interface MenuItemDef {
  key: string
  label: string
  shortcut?: string
  disabled?: boolean
}

export interface TopMenuBarProps {
  dueCount: number
  dirty: boolean
  saving: boolean
  mode: 'edit' | 'read'
  onNew(): void
  onSave(): void
  onSaveAs(): void
  onToggleMode(): void
  onChangeRoot(): void
  onReview(): void
}

interface Group {
  key: string
  label: string
  items: MenuItemDef[]
}

export default function TopMenuBar(p: TopMenuBarProps): ReactElement {
  const [open, setOpen] = useState<string | null>(null)

  const groups: Group[] = [
    {
      key: 'file',
      label: '文件',
      items: [
        { key: 'new', label: '快速记录…', shortcut: 'Ctrl+Shift+N' },
        { key: 'save', label: p.dirty ? '保存 *' : '保存', shortcut: 'Ctrl+S', disabled: !p.dirty || p.saving },
        { key: 'save-as', label: '另存为…', shortcut: 'Ctrl+Shift+S' }
      ]
    },
    { key: 'edit', label: '编辑', items: [] },
    {
      key: 'view',
      label: '视图',
      items: [{ key: 'toggle', label: p.mode === 'edit' ? '阅读模式' : '编辑模式', shortcut: 'Ctrl+E' }]
    },
    {
      key: 'review',
      label: `复习${p.dueCount > 0 ? ` (${p.dueCount})` : ''}`,
      items: [{ key: 'start', label: '今日复习…', shortcut: 'Ctrl+Shift+R' }]
    }
  ]

  const run = (item: MenuItemDef): void => {
    setOpen(null)
    if (item.disabled) return
    switch (item.key) {
      case 'new':
        p.onNew()
        break
      case 'save':
        p.onSave()
        break
      case 'save-as':
        p.onSaveAs()
        break
      case 'toggle':
        p.onToggleMode()
        break
      case 'start':
        p.onReview()
        break
    }
  }

  return (
    <div className="relative z-40 flex select-none items-center border-b border-neutral-800 bg-neutral-900 px-1 text-[13px] text-neutral-300">
      {groups.map((g) => (
        <div key={g.key} className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === g.key ? null : g.key)}
            className={`rounded px-2.5 py-1 hover:bg-neutral-800 ${open === g.key ? 'bg-neutral-800' : ''}`}
          >
            {g.label}
          </button>
          {open === g.key && g.items.length > 0 && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />
              <div className="absolute left-0 top-full z-50 mt-0.5 min-w-56 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => run(item)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-[11px] text-neutral-500">{item.shortcut}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-3 pr-2 text-[11px] text-neutral-600">
        <button type="button" className="hover:text-neutral-300" onClick={p.onChangeRoot}>
          更换目录
        </button>
      </div>
    </div>
  )
}

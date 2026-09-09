import { useState } from 'react'
import type { ReactElement } from 'react'

export interface TopMenuBarProps {
  dueCount: number
  dirty: boolean
  saving: boolean
  mode: 'edit' | 'read'
  onNew(): void
  onSave(): void
  onSaveAs(): void
  onToggleMode(): void
  onOpenSettings(): void
  onReview(): void
  onSearch(): void
  onDashboard(): void
}

interface MenuItemDef {
  key: string
  label: string
  shortcut?: string
  disabled?: boolean
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
    {
      key: 'view',
      label: '视图',
      items: [
        { key: 'toggle', label: p.mode === 'edit' ? '阅读模式' : '编辑模式', shortcut: 'Ctrl+E' },
        { key: 'search', label: '搜索…', shortcut: 'Ctrl+K' },
        { key: 'dashboard', label: '统计看板…' }
      ]
    },
    {
      key: 'review',
      label: `复习${p.dueCount > 0 ? ` (${p.dueCount})` : ''}`,
      items: [{ key: 'start', label: '今日复习…', shortcut: 'Ctrl+Shift+R' }]
    },
    {
      key: 'settings',
      label: '设置',
      items: [{ key: 'open-settings', label: '偏好设置…', shortcut: 'Ctrl+,' }]
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
      case 'open-settings':
        p.onOpenSettings()
        break
      case 'search':
        p.onSearch()
        break
      case 'dashboard':
        p.onDashboard()
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
            className={`relative z-50 rounded px-2.5 py-1 hover:bg-neutral-800 ${open === g.key ? 'bg-neutral-800' : ''}`}
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
      <div className="ml-auto pr-1 text-[11px] text-neutral-700">AlgoKeeper</div>
    </div>
  )
}

import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import type { NoteSummary } from '../../../../shared/types/note'

export interface FilePanelProps {
  rootPath: string
  groups: Array<[string, NoteSummary[]]>
  activeNoteId?: string
  allTags: string[]
  tagFilter: string | null
  onOpen(noteId: string): void
  onNoteContext(e: ReactMouseEvent, noteId: string): void
  onFolderContext(e: ReactMouseEvent, folder: string): void
  onToggleTag(tag: string): void
  onClearTag(): void
  onPaneContext(e: ReactMouseEvent): void
  onNewNote(): void
}

/** 左栏文件区：笔记根路径 + 按 source 分组文件树 + 标签云。 */
export default function FilePanel(p: FilePanelProps): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col" onContextMenu={p.onPaneContext}>
      <p className="truncate border-b border-neutral-800 px-3 py-2 text-[11px] text-neutral-500" title={p.rootPath}>
        {p.rootPath}
      </p>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1">
        {p.groups.length === 0 && (
          <div className="px-2 py-4 text-xs text-neutral-600">
            <p className="mb-2">还没有题解</p>
            <button
              type="button"
              onClick={p.onNewNote}
              className="rounded bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-500"
            >
              新建题解
            </button>
          </div>
        )}
        {p.groups.map(([folder, items]) => (
          <div key={folder} className="mb-2">
            <p
              className="cursor-default px-1 py-0.5 text-[11px] font-medium text-neutral-500"
              onContextMenu={(e) => p.onFolderContext(e, folder)}
            >
              📁 {folder}
            </p>
            {items.map((s) => (
              <button
                key={s.noteId}
                type="button"
                onClick={() => p.onOpen(s.noteId)}
                onContextMenu={(e) => p.onNoteContext(e, s.noteId)}
                className={`block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-neutral-800 ${
                  p.activeNoteId === s.noteId ? 'bg-neutral-800/80 text-sky-300' : 'text-neutral-300'
                }`}
              >
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                {s.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-800 px-3 py-2 text-xs text-neutral-500">标签</div>
      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto px-3 pb-2">
        {p.allTags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => p.onToggleTag(t)}
            className={`rounded-full px-2 py-0.5 text-xs ${
              p.tagFilter === t ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {t}
          </button>
        ))}
        {p.tagFilter !== null && (
          <button
            type="button"
            onClick={p.onClearTag}
            className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            全部
          </button>
        )}
      </div>
    </div>
  )
}

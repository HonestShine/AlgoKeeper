import type { ReactElement } from 'react'
import type { FileMeta, NoteStatus } from '../../../../shared/types/note'
import type { RelatedNotes } from '../../../../shared/types/export'
import type { ActiveState } from '../../lib/note-meta'
import { DIFFICULTIES, DIFF_COLOR, STATUSES, STATUS_LABEL } from '../../lib/note-meta'

export interface InspectorPanelProps {
  active: ActiveState | null
  related: RelatedNotes | null
  tagDraft: string
  onTagDraftChange(v: string): void
  onPatchMeta(patch: Partial<FileMeta>): void
  onOpenNote(noteId: string): void
}

const labelCls = 'mb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500'
const fieldCls =
  'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[13px] text-neutral-100 focus:border-sky-600 focus:outline-none'

function fmt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 右栏属性区：难度 / 状态 / 标签 / 来源 / 时间 / 复习统计 / 关联题目。 */
export default function InspectorPanel(p: InspectorPanelProps): ReactElement {
  const { active } = p
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {active ? (
        <>
          <p className={labelCls}>难度</p>
          <div className="mb-3 flex gap-1">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => p.onPatchMeta({ difficulty: d })}
                className={`rounded px-2 py-1 text-xs ${active.meta.difficulty === d ? DIFF_COLOR[d] : 'bg-neutral-800 text-neutral-400'}`}
              >
                {d}
              </button>
            ))}
          </div>

          <p className={labelCls}>状态</p>
          <select
            className={`mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs ${fieldCls}`}
            value={active.meta.status}
            onChange={(e) => p.onPatchMeta({ status: e.target.value as NoteStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <p className={labelCls}>标签</p>
          <div className="mb-1 flex flex-wrap gap-1">
            {active.meta.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200">
                {t}
                <button
                  type="button"
                  className="text-neutral-500 hover:text-red-400"
                  onClick={() => p.onPatchMeta({ tags: active.meta.tags.filter((x) => x !== t) })}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mb-3 flex gap-1">
            <input
              className={fieldCls}
              placeholder="+ 加标签后回车"
              value={p.tagDraft}
              onChange={(e) => p.onTagDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && p.tagDraft.trim()) {
                  e.preventDefault()
                  const next = [...active.meta.tags, p.tagDraft.trim()]
                  if (new Set(next).size !== next.length) p.onTagDraftChange('')
                  else {
                    p.onPatchMeta({ tags: next })
                    p.onTagDraftChange('')
                  }
                }
              }}
            />
          </div>

          <p className={labelCls}>来源 / ID</p>
          <p className="mb-3 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-400">
            {active.meta.source}/{active.meta.id}
          </p>

          <p className={labelCls}>时间</p>
          <p className="text-[11px] text-neutral-500">
            创建 {fmt(active.meta.createdAt)}
            <br />
            更新 {fmt(active.meta.updatedAt)}
          </p>

          <p className={labelCls}>复习统计</p>
          {!active.scheduling?.main && !active.scheduling?.cards ? (
            <p className="mb-3 text-xs text-neutral-600">尚未复习（新卡）</p>
          ) : (
            <div className="mb-3 space-y-1">
              {active.scheduling?.main && (
                <p className="text-[11px] leading-relaxed text-neutral-400">
                  <span className="text-neutral-500">整题卡{'\u3000'}</span>
                  上次 {active.scheduling.main.lastReviewed ?? '—'} · 下次 {active.scheduling.main.due} · 重复{' '}
                  {active.scheduling.main.repetitions} · EF {active.scheduling.main.easeFactor.toFixed(2)} · 忘记{' '}
                  {active.scheduling.main.lapses}
                </p>
              )}
              {active.scheduling?.cards && (
                <p className="text-[11px] text-neutral-400">
                  <span className="text-neutral-500">拆卡{'\u3000'}{'\u3000'}</span>
                  {Object.keys(active.scheduling.cards).length} 张（最近到期{' '}
                  {Object.values(active.scheduling.cards)
                    .map((c) => c.due)
                    .sort()[0] ?? '—'}
                  ）
                </p>
              )}
            </div>
          )}

          <p className={labelCls}>关联题目</p>
          {!p.related && <p className="text-xs text-neutral-600">加载中…</p>}
          {p.related && p.related.backlinks.length === 0 && p.related.similar.length === 0 && (
            <p className="text-xs text-neutral-600">暂无（用 [[题名]] 建立引用）</p>
          )}
          {p.related && p.related.backlinks.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[11px] text-sky-400">反向链接 ({p.related.backlinks.length})</p>
              {p.related.backlinks.map((b) => (
                <button
                  key={b.noteId}
                  type="button"
                  className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                  onClick={() => p.onOpenNote(b.noteId)}
                >
                  {b.title}
                </button>
              ))}
            </div>
          )}
          {p.related && p.related.similar.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] text-neutral-500">同标签推荐</p>
              {p.related.similar.map((b) => (
                <button
                  key={b.noteId}
                  type="button"
                  className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                  onClick={() => p.onOpenNote(b.noteId)}
                >
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-600">选择题解查看与编辑元数据</p>
      )}
    </div>
  )
}

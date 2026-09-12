import type { Difficulty, FileMeta, NoteScheduling, NoteStatus } from '../../../shared/types/note'

/** 当前打开的笔记（装配层与左右栏共同消费） */
export interface ActiveState {
  noteId: string
  meta: FileMeta
  md: string
  /** 复习调度（来自 frontmatter scheduling）；未复习的笔记该键缺省 */
  scheduling?: NoteScheduling
}

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
export const STATUSES: NoteStatus[] = ['active', 'to-review', 'mastered', 'need-depth']
export const STATUS_LABEL: Record<NoteStatus, string> = {
  active: '无标记',
  'to-review': '待二刷',
  mastered: '已掌握',
  'need-depth': '需深入'
}
export const DIFF_COLOR: Record<Difficulty, string> = {
  Easy: 'bg-emerald-500/15 text-emerald-400',
  Medium: 'bg-amber-500/15 text-amber-400',
  Hard: 'bg-rose-500/15 text-rose-400'
}

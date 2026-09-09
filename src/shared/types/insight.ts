import type { Difficulty, NoteStatus } from './note'

/** 组合检索条件（条件间 AND；tags/difficulty/status 见 FR-3.1） */
export interface SearchFilter {
  text?: string
  difficulty?: Difficulty
  status?: NoteStatus
  tag?: string
}

export interface DifficultyCount {
  difficulty: Difficulty
  count: number
}

export interface TagCount {
  tag: string
  count: number
}

/** 每日正确率采样点：acc = grade∈{3,4} / n */
export interface AccuracyPoint {
  date: string
  acc: number
  n: number
}

/** 薄弱标签：样本足够的低正确率标签 */
export interface WeakTag {
  tag: string
  acc: number
  n: number
}

export interface StatsOverview {
  total: number
  difficulty: DifficultyCount[]
  tags: TagCount[]
  /** 标签覆盖率 = 已有标签的笔记 / 总笔记 */
  tagCoverage: number
  weakTags: WeakTag[]
  series: AccuracyPoint[]
}

/** 间隔重复（SRS）领域类型：调度信息、复习队列项。 */

export interface SchedulingInfo {
  /** 连续答对次数（失败重置 0） */
  repetitions: number
  /** 难度因子 [1.3, ∞)，初 2.5 */
  easeFactor: number
  /** 距上次复习天数 */
  interval: number
  /** 'YYYY-MM-DD' 下次到期日（本地自然日） */
  due: string
  /** 累计 Again 次数 */
  lapses: number
  /** 最近评分日 'YYYY-MM-DD' */
  lastReviewed?: string
}

export interface EmbeddedCardLine {
  qhash: string
  question: string
  answer: string
}

export type CardKind = 'whole' | 'split'

export interface CardSessionItem {
  cardId: string // whole: `${noteId}::main`；split: `${noteId}::${qhash}`
  noteId: string
  noteTitle: string
  kind: CardKind
  question: string
  answerText: string // whole=整篇正文；split=答案
  due: string
  isNew: boolean // 尚无复习历史
}

export interface ReviewResult {
  cardId: string
  grade: 1 | 2 | 3 | 4
}

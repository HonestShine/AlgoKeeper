/** 导出契约（FR-4.3）。 */
import type { NoteSummary } from './note'

export type ExportFormat = 'md' | 'html' | 'pdf'
export type ExportScope = 'single' | 'all'
/** share=剥离 scheduling；backup=含 scheduling 可回导 */
export type ExportVariant = 'share' | 'backup'

export interface ExportRequest {
  scope: ExportScope
  format: ExportFormat
  variant: ExportVariant
  /** scope=single 时的目标笔记 */
  noteId?: string
}

export interface ExportResult {
  /** 落盘路径（single=文件；all=目录） */
  path: string
  count: number
}

export interface TocItem {
  text: string
  depth: number
}

export interface RelatedNotes {
  /** 引用本篇（正文含 [[本题目/别名]] 或通过 id 引用）的题解 */
  backlinks: NoteSummary[]
  /** 同标签重叠最高的题解（不含自身，Top5） */
  similar: NoteSummary[]
}

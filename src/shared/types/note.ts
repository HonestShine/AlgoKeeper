/** 题解笔记领域类型（M1 子集，字段与 docs/technical-design.md §3 一致） */

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** 手动状态标记；缺省 'active'（无标记） */
export type NoteStatus = 'active' | 'to-review' | 'mastered' | 'need-depth'

/** 一条题解 .md 的头部元数据（作者字段；调度 scheduling 保留为未知键，不在此建模） */
export interface FileMeta {
  source: string // 题目来源，内建 'leetcode'，可扩展
  id: string // source 内稳定标识；LeetCode 场景取 URL slug
  title: string
  difficulty: Difficulty
  tags: string[]
  status: NoteStatus
  aliases: string[]
  createdAt: string // ISO-8601
  updatedAt: string // ISO-8601
}

/** frontmatter 解析结果：类型化字段 + 保真的未知字段（含调度等未来键） */
export interface ParsedFrontmatter {
  meta: FileMeta
  /** 原 frontmatter 中的未知键（如 scheduling），序列化时原样保留 */
  extras: Record<string, unknown>
  warnings: string[]
}

/** 笔记摘要（列表/检索用） */
export interface NoteSummary {
  noteId: string // 'source/id'（相对 posix 路径去 .md）
  source: string
  id: string
  title: string
  difficulty: Difficulty
  tags: string[]
  status: NoteStatus
  updatedAt: string
  filePath: string
}

/** 打开/创建的完整笔记（meta + 正文 md） */
export interface LoadedNote {
  noteId: string
  filePath: string
  meta: FileMeta
  bodyMd: string
  warnings: string[]
}

/** 保存入参（meta 与正文由编辑器分别产出后合并提交） */
export interface SaveNoteInput {
  noteId: string
  meta: FileMeta
  bodyMd: string
}

/** 新建草稿 */
export interface NewNoteDraft {
  meta: FileMeta
  bodyMd: string
}

/** 另存为目标（source/id/可选新标题） */
export interface SaveAsTarget {
  source: string
  id: string
  title?: string
}

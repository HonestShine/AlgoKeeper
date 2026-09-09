/**
 * 所有 IPC 桥类型统一在此定义（规范：全通道有类型）。
 * M1 范围：settings / notes / parseUrl。
 */
import type { Difficulty } from './note'

export interface RendererApi {
  /** 连通性冒烟测试 */
  ping(): Promise<string>
  versions: { electron: string; node: string }

  /** 窗口 */
  window: {
    /** 新建一个应用窗口（桌面端） */
    newWindow(): Promise<void>
  }

  /** 设置与目录 */
  settings: {
    /** 读取当前设置；确保默认 <appRoot>/Documents 存在 */
    get(): Promise<SettingsPayload>
    /** 更新设置（笔记目录 / 每日新卡上限等），并持久化 */
    set(update: SettingsUpdate): Promise<SettingsPayload>
    /** 弹出目录选择对话框；取消返回 null（选中后即写入并返回新设置） */
    pickRoot(): Promise<SettingsPayload | null>
  }

  /** 题解笔记 */
  notes: {
    /** 列出 notesRoot 下全部笔记摘要（按 updatedAt 倒序） */
    list(): Promise<NoteSummary[]>
    /** 打开一篇（读取文件并解析 frontmatter） */
    get(noteId: string): Promise<LoadedNote>
    /** 新建草稿落盘；noteId 冲突抛错 */
    create(draft: NewNoteDraft): Promise<LoadedNote>
    /** 保存（合并原文件的未知键如 scheduling，见 note-store） */
    save(input: SaveNoteInput): Promise<{ noteId: string; updatedAt: string }>
    /** 另存为：复制到新 source/id（重置调度），冲突抛错 */
    saveAs(input: { noteId: string; target: SaveAsTarget }): Promise<LoadedNote>
    /** 双向关联：反链 + 同标签推荐 */
    related(noteId: string): Promise<RelatedNotes>
    /** 删除题解文件（不可恢复；调用方须先确认） */
    delete(noteId: string): Promise<void>
    /** 在系统文件管理器中显示文件/文件夹 */
    reveal(p: { kind: 'file' | 'folder'; noteId?: string; folder?: string }): Promise<void>
    /** 导入外部 .md 文件为笔记（原生对话框选文件；取消/网页返回 null） */
    importNote(): Promise<LoadedNote | null>
  }

  /** 间隔重复复习 */
  review: {
    /** 今日到期 + 新卡总数（受新卡上限；可按难度/标签过滤） */
    dueCount(filter?: ReviewFilter): Promise<number>
    /** 拉取今日复习队列 */
    collect(filter?: ReviewFilter): Promise<CardSessionItem[]>
    /** 提交评分并写回 frontmatter；返回写入笔记数 */
    commit(results: ReviewResult[]): Promise<number>
  }

  /** 从题目 URL 解析 source/id/title */
  parseUrl(raw: string): Promise<ParsedProblemUrl | null>

  /** 检索与洞察（M3） */
  search: {
    /** 组合条件检索（标题/标签/正文 text + 难度/状态/标签 AND） */
    query(filter: SearchFilter): Promise<SearchHit[]>
  }
  stats: {
    /** 仪表盘聚合：总数/难度/标签/正确率曲线/薄弱标签 */
    overview(): Promise<StatsOverview>
  }

  /** 导出（选目录对话框在 main 侧弹出；取消返回 null） */
  export: {
    run(req: ExportRequest): Promise<ExportResult | null>
  }

  /** 订阅桌面端原生菜单动作；返回退订函数 */
  onMenuAction(cb: (action: MenuAction) => void): () => void
}

export type MenuAction =
  | 'new-note'
  | 'save'
  | 'save-as'
  | 'toggle-mode'
  | 'change-root'
  | 'review-start'
  | 'open-settings'
  | 'open-search'
  | 'open-dashboard'

export interface SettingsPayload {
  settings: Settings
}

type Settings = import('./settings').AppSettings
type SettingsUpdate = import('./settings').SettingsUpdate
type ReviewFilter = import('./srs').ReviewFilter
type ParsedProblemUrl = import('../utils/url').ParsedProblemUrl
type NoteSummary = import('./note').NoteSummary
type LoadedNote = import('./note').LoadedNote
type NewNoteDraft = import('./note').NewNoteDraft
type SaveNoteInput = import('./note').SaveNoteInput
type SaveAsTarget = import('./note').SaveAsTarget
type CardSessionItem = import('./srs').CardSessionItem
type ReviewResult = import('./srs').ReviewResult
type SearchFilter = import('./insight').SearchFilter
type SearchHit = import('./note').NoteSummary
type StatsOverview = import('./insight').StatsOverview
type RelatedNotes = import('./export').RelatedNotes
type ExportRequest = import('./export').ExportRequest
type ExportResult = import('./export').ExportResult

export type { Difficulty }

/**
 * 所有 IPC 桥类型统一在此定义（规范：全通道有类型）。
 * M1 范围：settings / notes / parseUrl。
 */
import type { Difficulty } from './note'

export interface RendererApi {
  /** 连通性冒烟测试 */
  ping(): Promise<string>
  versions: { electron: string; node: string }

  /** 设置与目录 */
  settings: {
    /** 读取当前设置；确保默认 <appRoot>/Documents 存在 */
    get(): Promise<SettingsPayload>
    /** 更新设置（如切换 notesRoot），并确保新目录存在 */
    set(partial: { notesRoot?: string }): Promise<SettingsPayload>
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
  }

  /** 从题目 URL 解析 source/id/title */
  parseUrl(raw: string): Promise<ParsedProblemUrl | null>
}

export interface SettingsPayload {
  settings: Settings
}

type Settings = import('./settings').AppSettings
type ParsedProblemUrl = import('../utils/url').ParsedProblemUrl
type NoteSummary = import('./note').NoteSummary
type LoadedNote = import('./note').LoadedNote
type NewNoteDraft = import('./note').NewNoteDraft
type SaveNoteInput = import('./note').SaveNoteInput

export type { Difficulty }

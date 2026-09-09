/** 主题标识 */
export type ThemeName = 'dark' | 'light-github'

/** 应用设置（存储根、复习偏好等）。写盘：userData/settings.json。 */
export interface AppSettings {
  /** 当前使用的笔记根目录（默认 <appRoot>/Documents，可改选） */
  notesRoot: string
  /** 程序安装/项目根目录 */
  appRoot: string
  /** 默认笔记根 = <appRoot>/Documents */
  notesRootDefault: string
  /** 今日队列中的每日新卡上限 */
  newCardLimit: number
  /** 界面主题 */
  theme: ThemeName
}

/** 允许通过设置更新/持久化的字段 */
export interface SettingsUpdate {
  notesRoot?: string
  newCardLimit?: number
  theme?: ThemeName
}

/** 主题标识 */
export type ThemeName = 'dark' | 'light-github'

/** 正文内容限宽档位 */
export type ContentWidth = 'narrow' | 'medium' | 'full'

/** 布局偏好（写盘位置：userData/settings.json 的 layout 字段） */
export interface LayoutPrefs {
  /** 左栏宽度 px */
  leftWidth: number
  /** 右栏宽度 px */
  rightWidth: number
  leftVisible: boolean
  rightVisible: boolean
  contentWidth: ContentWidth
  focusMode: boolean
  /** 打开笔记时是否默认进入阅读态（跨笔记保持） */
  readMode: boolean
  /** 停笔 800ms 自动保存；默认关闭 */
  autoSave: boolean
  /** 是否显示底部状态栏；关闭后 `</>` 悬浮在编辑区左下角 */
  showStatus: boolean
}

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
  /** 布局偏好 */
  layout: LayoutPrefs
}

/** 允许通过设置更新/持久化的字段 */
export interface SettingsUpdate {
  notesRoot?: string
  newCardLimit?: number
  theme?: ThemeName
  layout?: Partial<LayoutPrefs>
}

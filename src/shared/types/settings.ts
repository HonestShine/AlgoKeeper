/** 应用设置（存储根等）。写盘位置：userData/settings.json，见 settings-store。 */
export interface AppSettings {
  /** 当前使用的笔记根目录（默认 <appRoot>/Documents，可改选） */
  notesRoot: string
  /** 程序安装/项目根目录 */
  appRoot: string
  /** 默认笔记根 = <appRoot>/Documents */
  notesRootDefault: string
}

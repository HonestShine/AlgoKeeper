/** IPC 通道常量：main 注册与 preload 调用共用，防字符串漂移。 */
export const CH = {
  ping: 'app:ping',
  settingsGet: 'meta:settings:get',
  settingsSet: 'meta:settings:set',
  settingsPick: 'meta:settings:pick',
  notesList: 'notes:list',
  notesGet: 'notes:get',
  notesCreate: 'notes:create',
  notesSave: 'notes:save',
  parseUrl: 'parse:url'
} as const

export type Channel = (typeof CH)[keyof typeof CH]

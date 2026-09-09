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
  notesSaveAs: 'notes:save-as',
  notesDelete: 'notes:delete',
  parseUrl: 'parse:url',
  reviewDueCount: 'review:due-count',
  reviewCollect: 'review:collect',
  reviewCommit: 'review:commit',
  searchQuery: 'search:query',
  statsOverview: 'stats:overview',
  notesRelated: 'notes:related',
  exportRun: 'export:run',
  /** main → renderer：原生菜单动作 */
  menuAction: 'menu:action'
} as const

export type Channel = (typeof CH)[keyof typeof CH]

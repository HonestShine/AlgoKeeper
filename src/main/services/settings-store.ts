import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings } from '../../shared/types/settings'

function resolveDefaults(): Pick<AppSettings, 'appRoot' | 'notesRootDefault'> {
  // 打包后：exe 所在目录即安装根；开发期：项目根
  const appRoot = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
  return { appRoot, notesRootDefault: join(appRoot, 'Documents') }
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** 读取设置；若 notesRoot 不存在则补建目录 */
export async function getSettings(): Promise<AppSettings> {
  const def = resolveDefaults()
  let notesRoot = def.notesRootDefault
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8')
    const parsed = JSON.parse(raw) as { notesRoot?: unknown }
    if (typeof parsed.notesRoot === 'string' && parsed.notesRoot.trim()) notesRoot = parsed.notesRoot.trim()
  } catch {
    /* 首次启动无文件：用默认值 */
  }
  await fs.mkdir(notesRoot, { recursive: true })
  return { notesRoot, ...def }
}

/** 切换笔记根目录并持久化 */
export async function setNotesRoot(notesRoot: string): Promise<AppSettings> {
  await fs.mkdir(notesRoot, { recursive: true })
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({ notesRoot }, null, 2), 'utf8')
  return { notesRoot, ...resolveDefaults() }
}

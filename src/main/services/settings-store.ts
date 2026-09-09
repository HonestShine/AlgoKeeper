import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, SettingsUpdate } from '../../shared/types/settings'

export const DEFAULT_NEW_CARD_LIMIT = 20

interface Stored {
  notesRoot?: string
  newCardLimit?: number
}

function resolveDefaults(): Pick<AppSettings, 'appRoot' | 'notesRootDefault'> {
  // 打包后：exe 所在目录即安装根；开发期：项目根
  const appRoot = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
  return { appRoot, notesRootDefault: join(appRoot, 'Documents') }
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function clampNewCardLimit(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_NEW_CARD_LIMIT
  return Math.min(200, Math.max(0, Math.round(v)))
}

async function readStored(): Promise<Stored> {
  try {
    const raw = await fs.readFile(settingsFile(), 'utf8')
    const parsed = JSON.parse(raw) as Stored
    return { notesRoot: parsed.notesRoot, newCardLimit: parsed.newCardLimit }
  } catch {
    return {}
  }
}

async function persist(stored: Stored): Promise<void> {
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(stored, null, 2), 'utf8')
}

/** 读取设置；notesRoot 不存在则补建目录 */
export async function getSettings(): Promise<AppSettings> {
  const def = resolveDefaults()
  const stored = await readStored()
  const notesRoot = stored.notesRoot?.trim() || def.notesRootDefault
  await fs.mkdir(notesRoot, { recursive: true })
  return { notesRoot, ...def, newCardLimit: clampNewCardLimit(stored.newCardLimit) }
}

/** 更新并持久化（笔记目录 / 每日新卡上限等） */
export async function updateSettings(patch: SettingsUpdate): Promise<AppSettings> {
  const def = resolveDefaults()
  const stored = await readStored()
  const notesRoot = patch.notesRoot?.trim() ? patch.notesRoot.trim() : stored.notesRoot?.trim() || def.notesRootDefault
  const newCardLimit = clampNewCardLimit(patch.newCardLimit ?? stored.newCardLimit)
  if (patch.notesRoot?.trim()) await fs.mkdir(notesRoot, { recursive: true })
  await persist({ notesRoot, newCardLimit })
  return { notesRoot, ...def, newCardLimit }
}

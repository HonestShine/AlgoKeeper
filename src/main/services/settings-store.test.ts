/**
 * settings-store 集成测试（真实 fs + 局部 electron mock）。
 *
 * 覆盖重点：`layout` 的持久化往返。`persist()` 是整文件覆写，而 `readStored()` 是
 * 逐字段白名单拷贝，两者独立——「只改返回字面量、漏改 persist 调用」的实现能通过
 * tsc，却会在用户仅修改 `newCardLimit` 时把已存的 `layout` 整个抹掉。本文件的
 * 核心回归断言（见「改 newCardLimit 不丢 layout」）正是为拦住这条数据丢失路径。
 *
 * electron mock 仅限于本文件：Vitest 按文件隔离模块注册表，`vi.mock` 不会外溢到其它测试。
 */
import { promises as fs } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT, LEFT_MAX, RIGHT_MIN } from '../../shared/utils/layout'
import { getSettings, updateSettings } from './settings-store'

/** vi.mock 工厂会在 import 之前求值，故可变路径必须放在 vi.hoisted 里 */
const paths = vi.hoisted(() => ({ userData: '', appRoot: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => paths.appRoot,
    getPath: (key: string) => (key === 'userData' ? paths.userData : paths.appRoot)
  }
}))

function settingsFile(): string {
  return join(paths.userData, 'settings.json')
}

async function readRawSettings(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Record<string, unknown>
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

describe('settings-store layout 持久化', () => {
  beforeEach(() => {
    // 绝不触碰真实 userData：全部落在临时目录
    paths.userData = mkdtempSync(join(tmpdir(), 'alk-settings-'))
    paths.appRoot = mkdtempSync(join(tmpdir(), 'alk-approot-'))
  })

  afterEach(() => {
    rmSync(paths.userData, { recursive: true, force: true })
    rmSync(paths.appRoot, { recursive: true, force: true })
  })

  it('无 settings.json 时 getSettings 返回默认 layout，且不写盘', async () => {
    const s = await getSettings()

    expect(s.layout).toEqual(DEFAULT_LAYOUT)
    expect(Array.isArray(s.layout)).toBe(false)
    // 纯读取不应产生 settings.json（只有 updateSettings 才 persist）
    expect(await exists(settingsFile())).toBe(false)
  })

  it('改 newCardLimit 不丢 layout（磁盘整文件覆写回归）', async () => {
    await updateSettings({
      layout: { leftWidth: 321, rightWidth: 411, leftVisible: false, contentWidth: 'full', focusMode: true }
    })
    expect(await readRawSettings()).toHaveProperty('layout')

    // 用户只改「每日新卡上限」——坏实现（漏改 persist 调用）会在此抹掉 layout
    const after = await updateSettings({ newCardLimit: 42 })

    expect(after.newCardLimit).toBe(42)
    expect(after.layout).toMatchObject({
      leftWidth: 321,
      rightWidth: 411,
      leftVisible: false,
      contentWidth: 'full',
      focusMode: true
    })

    // 关键：磁盘上也必须还在
    const raw = await readRawSettings()
    expect(raw.newCardLimit).toBe(42)
    expect(raw.layout).toMatchObject({
      leftWidth: 321,
      rightWidth: 411,
      leftVisible: false,
      contentWidth: 'full',
      focusMode: true
    })

    // 重启后仍拿得回
    const reread = await getSettings()
    expect(reread.layout).toMatchObject({ leftWidth: 321, rightWidth: 411, leftVisible: false })
  })

  it('既有用户（settings.json 已含 layout）改 newCardLimit 同样不丢', async () => {
    await fs.writeFile(
      settingsFile(),
      JSON.stringify({
        notesRoot: join(paths.appRoot, 'Documents'),
        newCardLimit: 5,
        theme: 'dark',
        layout: { leftWidth: 400, rightWidth: 500, rightVisible: false, contentWidth: 'narrow' }
      }),
      'utf8'
    )

    await updateSettings({ newCardLimit: 99 })

    const raw = await readRawSettings()
    expect(raw.newCardLimit).toBe(99)
    expect(raw.layout).toMatchObject({ leftWidth: 400, rightWidth: 500, rightVisible: false, contentWidth: 'narrow' })
  })

  it('layout 局部 patch 只覆盖提及字段，notesRoot/theme 不变', async () => {
    const customRoot = join(paths.appRoot, 'NotesCustom')
    await updateSettings({
      notesRoot: customRoot,
      theme: 'dark',
      layout: { leftWidth: 300, rightWidth: 400, contentWidth: 'full' }
    })

    const after = await updateSettings({ layout: { leftVisible: false } })

    expect(after.layout).toEqual({ ...DEFAULT_LAYOUT, leftWidth: 300, rightWidth: 400, contentWidth: 'full', leftVisible: false })
    expect(after.theme).toBe('dark')
    expect(after.notesRoot).toBe(customRoot)

    const raw = await readRawSettings()
    expect(raw.theme).toBe('dark')
    expect(raw.notesRoot).toBe(customRoot)
    expect(raw.layout).toMatchObject({ leftWidth: 300, rightWidth: 400, contentWidth: 'full', leftVisible: false })
  })

  it('空 patch（updateSettings({})）不丢已有 layout', async () => {
    await updateSettings({ layout: { leftWidth: 260 }, theme: 'dark' })

    await updateSettings({})

    const raw = await readRawSettings()
    expect(raw.theme).toBe('dark')
    expect(raw.layout).toMatchObject({ leftWidth: 260 })
  })

  it('磁盘脏 layout 被 normalizeLayout 夹取后读回，不抛错', async () => {
    await fs.writeFile(
      settingsFile(),
      JSON.stringify({
        notesRoot: join(paths.appRoot, 'Documents'),
        newCardLimit: 7,
        theme: 'dark',
        layout: {
          leftWidth: 99999,
          rightWidth: -5,
          contentWidth: 'huge',
          leftVisible: 'yes',
          rightVisible: null,
          focusMode: 1,
          readMode: true,
          autoSave: 'nope',
          showStatus: false
        }
      }),
      'utf8'
    )

    const s = await getSettings()

    expect(s.layout.leftWidth).toBe(LEFT_MAX) // 越界上夹
    expect(s.layout.rightWidth).toBe(RIGHT_MIN) // 越界下夹
    expect(s.layout.contentWidth).toBe('medium') // 非法枚举回落默认
    expect(s.layout.leftVisible).toBe(true) // 非布尔回落默认
    expect(s.layout.rightVisible).toBe(true)
    expect(s.layout.focusMode).toBe(false)
    expect(s.layout.readMode).toBe(true) // 合法布尔保留
    expect(s.layout.autoSave).toBe(false)
    expect(s.layout.showStatus).toBe(false)
    // 同文件其它字段不受影响
    expect(s.newCardLimit).toBe(7)
    expect(s.theme).toBe('dark')
  })

  it('layout 为非对象/数组/原始值时整体回落默认，不抛错', async () => {
    for (const bad of ['oops', 42, null, ['a'], true]) {
      await fs.writeFile(settingsFile(), JSON.stringify({ layout: bad }), 'utf8')
      const s = await getSettings()
      expect(s.layout).toEqual(DEFAULT_LAYOUT)
    }
  })

  it('往返一致：写入后再读回的值与返回字面量相同', async () => {
    const written = await updateSettings({
      newCardLimit: 33,
      theme: 'dark',
      layout: { leftWidth: 222, rightWidth: 333, rightVisible: false, contentWidth: 'narrow', autoSave: true }
    })

    const read = await getSettings()

    expect(read.layout).toEqual(written.layout)
    expect(read.newCardLimit).toBe(written.newCardLimit)
    expect(read.theme).toBe(written.theme)
    expect(read.notesRoot).toBe(written.notesRoot)
    expect(read.appRoot).toBe(written.appRoot)
    expect(read.notesRootDefault).toBe(written.notesRootDefault)

    // 磁盘原始 JSON 与读回值一致
    expect((await readRawSettings()).layout).toEqual(written.layout)
  })
})

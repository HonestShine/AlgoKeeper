/* global window */
/**
 * 真实 Electron 全链路走查（Playwright _electron 驱动真实构建窗口：
 * 真实 preload/IPC/fs/SM-2 写回，不依赖网页假后端）。
 * 运行前请先 npm run build。
 * 步骤：文件>新建（快速记录）→ 真实落盘 → 复习>今日复习 → 空格+评分 → frontmatter 出现 scheduling。
 */
import { _electron as electron } from 'playwright-core'
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import assert from 'node:assert'

const root = process.cwd()
const ELECTRON = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const id = 'two-sum-e2e'
const file = join(root, 'Documents', 'leetcode', `${id}.md`)

function sleep(ms) {
  return new Promise((r) => globalThis.setTimeout(r, ms))
}

async function waitFile(path, ms = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (existsSync(path)) return
    await sleep(200)
  }
  throw new Error(`等待文件出现超时: ${path}`)
}

async function clickMenu(page, group, itemRe) {
  await page.getByRole('button', { name: group, exact: true }).click()
  await page.getByRole('button', { name: itemRe }).click()
}

const app = await electron.launch({
  executablePath: ELECTRON,
  args: [root],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
})

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: '文件', exact: true }).waitFor({ timeout: 15000 })

  // 1) 文件>新建 → 快速记录（真实 IPC 创建于 <root>/Documents）
  await clickMenu(page, '文件', /^新建 Ctrl\+Shift\+N$/)
  const src = page.locator('input[placeholder="source"]')
  await src.waitFor()
  await src.fill('leetcode')
  await page.locator('input[placeholder="id（slug）"]').fill(id)
  await page.locator('input[placeholder="标题"]').fill('Two Sum E2E')
  await page.locator('textarea').fill('# Two Sum E2E\n\n## 解法一\n一遍哈希表。')
  await page.locator('button:has-text("创建并打开")').click()

  await waitFile(file)
  const created = await fs.readFile(file, 'utf8')
  assert.ok(created.includes('source: leetcode'), 'frontmatter source 缺失')
  assert.ok(created.includes('title: Two Sum E2E'), 'frontmatter title 缺失')
  console.log('✔ 真实创建落盘:', file)

  // 2) 复习>今日复习 → 空格显示答案 → 评分 3（提交并写回 scheduling）
  await clickMenu(page, '复习', /今日复习/)
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('3')
  await sleep(800)

  const saved = await fs.readFile(file, 'utf8')
  assert.ok(saved.includes('scheduling:'), '未写回 scheduling')
  assert.ok(/main:\s*\n\s*repetitions: 1/.test(saved), '整题卡 repetitions 应为 1')
  const due = /due:\s*(\d{4}-\d{2}-\d{2})/.exec(saved)?.[1]
  assert.ok(due && due !== new Date().toISOString().slice(0, 10), 'due 应被排到未来')
  console.log('✔ 评分写回 scheduling.main:', { file, due })

  // 3) 重开列表应含该题（真实 IPC notes:list）
  await page.getByRole('button', { name: '复习', exact: true }).click()
  await page.keyboard.press('Escape')
  const items = await page.locator('aside button').allTextContents()
  assert.ok(items.some((t) => t.includes('Two Sum E2E')), '列表未包含新题解')
  console.log('✔ 真实列表包含 Two Sum E2E')

  // 4) 剪贴板闭环：全选 → 编辑>复制（navigator ClipboardItem，已放行权限）→ 主进程读取
  await page.locator('.ak-editor .ProseMirror').click()
  await page.keyboard.press('Control+A')
  await clickMenu(page, '编辑', /^复制$/)
  await page.waitForTimeout(200)
  const copied = await page.evaluate(() => window.api.clipboard.readText())
  assert.ok(copied.includes('Two Sum E2E'), '剪贴板未收到全文：' + copied.slice(0, 40))
  console.log('✔ 剪贴板闭环：复制→主进程读到', copied.slice(0, 24) + '…')

  // 5) 粘贴闭环：主进程写入探针文本 → 编辑>粘贴 → 正文应包含探针
  const token = '▲粘贴探针▲'
  await page.evaluate((t) => window.api.clipboard.write({ text: t }), token)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await clickMenu(page, '编辑', /^粘贴$/)
  await page.waitForTimeout(400)
  const proseAfter = await page.locator('.ak-editor').innerText()
  assert.ok(proseAfter.includes(token), '粘贴闭环失败：正文未出现探针')
  console.log('✔ 粘贴闭环：主进程探针文本已粘贴进正文')

  console.log('✔✔ 真实 Electron 全链路走查通过')
} finally {
  await app.close()
  // 清理本次走查生成的测试笔记
  if (existsSync(file)) await fs.rm(file)
  const dir = dirname(file)
  try {
    await fs.rmdir(dir)
  } catch {
    /* 目录非空则保留 */
  }
}

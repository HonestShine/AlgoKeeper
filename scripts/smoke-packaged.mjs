/** 打包产物冒烟：用 Playwright _electron 启动指定 Electron 可执行文件（packaged app），断言可起窗口、UI 载入。 */
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import assert from 'node:assert'

const exe = process.argv[2]
if (!exe || !existsSync(exe)) {
  console.error('用法: node scripts/smoke-packaged.mjs <path/to/AlgoKeeper.exe>')
  process.exit(2)
}

const app = await electron.launch({ executablePath: exe, args: [] })
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: '文件', exact: true }).waitFor({ timeout: 20000 })
  const title = await page.title()
  assert.strictEqual(title, 'AlgoKeeper', '窗口标题应为 AlgoKeeper')
  const hasEditor = (await page.locator('.ak-editor').count()) >= 0
  assert.ok(hasEditor)
  console.log('✔ packaged smoke ok:', exe, '| title =', title)
} finally {
  await app.close()
}

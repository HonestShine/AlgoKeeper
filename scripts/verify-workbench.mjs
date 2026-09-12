/* global document, getComputedStyle, HTMLElement */
/**
 * 工作台三栏重构（P1）的可复跑交付验证。
 *
 * 覆盖：A 三栏骨架与分隔条 / B 排版体系 / C 模式与控件 / D 复习统计（真机端到端）/
 *       E CodeMirror 源码模式 / F 静默丢字（C1 写窗的零延迟路径）。
 *
 * 与一次性脚本的关键差别（前 10 轮的教训固化在这里）：
 * 1) 自己先 `npm run build`，再断言 `out/renderer/assets/*.js` 的 mtime 晚于 `src/` 最新改动。
 *    漏构建会让断言假失败，而源码改了不重建会让它静默假通过 —— 后者更危险。
 * 2) 隔离：临时 `--user-data-dir` profile + 临时笔记根，全部由 mkdtemp 新建，跑完删除。
 *    不读写真实 %APPDATA%/algokeeper，也不触碰仓库的 Documents/。
 * 3) 断言必须有判别力：每条都要能回答「把对应修复回退，这条会红吗」。
 *    尤其：源码态进入后**不点击**直接打字 / 直接 Ctrl+F；滚动比例与模式绕行；
 *    切笔记后 Ctrl+Z 不串写（含落盘复核）；复习统计走真实主进程读盘；
 *    F 节的**零延迟**键入路径（sleep 只用于等 UI 稳定，绝不用来掩盖竞态窗口）。
 *
 * 注意：scripts/ 受 eslint 覆盖，本文件不得出现字面不可见字符
 * （需要测 .cm-specialChar 时用 String.fromCharCode(0xad) 构造软连字符）。
 */
import { _electron as electron } from 'playwright-core'
import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = process.cwd()
const ELECTRON = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

// 与 src/shared/utils/layout.ts 同源的常量（改了源码这里会红，提示同步更新）
const LEFT_MIN = 180
const LEFT_MAX = 480
const RIGHT_MIN = 200
const RIGHT_MAX = 520
const DEFAULT_LEFT_WIDTH = 240
const DEFAULT_RIGHT_WIDTH = 256
const RAIL_WIDTH = 28
const MIN_CONTENT_WIDTH = 360
/** 两条分隔条各占 1px，从 flex 行里扣；故正文实测下限 = MIN_CONTENT_WIDTH - 2 */
const DIVIDER_TOTAL = 2

const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms))

/**
 * 轮询等待：反复取样直到 pred(v) 成立或超时，返回最后一次取样值。
 * 几何/异步落盘类断言一律用它 —— 固定 sleep 在慢机器上会随机红，而竞态窗口
 * 又绝不能用 sleep 掩盖（那正是原脚本 600ms 恰好绕开 C1 窗口、182/182 全绿却
 * 抓不到丢字的原因）。sleep 只作为兜底。
 */
async function pollUntil(sample, pred, timeout = 6000, interval = 120) {
  const deadline = Date.now() + timeout
  for (;;) {
    const v = await sample()
    if (pred(v)) return v
    if (Date.now() >= deadline) return v
    await sleep(interval)
  }
}

// ---- 轻量过滤 ------------------------------------------------------------
// 默认全跑；判别性自证（变异某一处修复后看对应断言是否变红）时用它压成本：
//   node scripts/verify-workbench.mjs --only=E            只跑 E 节
//   node scripts/verify-workbench.mjs --only=A,E          只跑 A + E
//   node scripts/verify-workbench.mjs --only=F            只跑 F 节（静默丢字 C1 的三条零延迟断言）
//   node scripts/verify-workbench.mjs --grep=滚动比例      只记录 label 匹配的断言（分节仍会执行）
// 构建守卫与隔离环境不受过滤影响，始终生效。
const argv = process.argv.slice(2)
const argOf = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return null
  const eq = hit.indexOf('=')
  return eq === -1 ? '' : hit.slice(eq + 1)
}
const onlyRaw = argOf('only')
const onlyKeys = onlyRaw
  ? onlyRaw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  : null
const grepRaw = argOf('grep')
const grepRe = grepRaw ? new RegExp(grepRaw) : null
const sectionKey = (name) => (name.trim().split(/\s+/)[0] ?? '').toUpperCase()
const skippedSections = []
const skippedChecks = []

const results = []
let currentSection = '(未分节)'
function setSection(name) {
  currentSection = name
}
function check(label, ok, detail) {
  if (grepRe && !grepRe.test(label)) {
    skippedChecks.push(label)
    return
  }
  results.push({ section: currentSection, label, ok, detail })
  console.log(`${ok ? '✔' : '✘'} [${currentSection}] ${label}${detail !== undefined ? ' — ' + detail : ''}`)
}

// ============================== 构建守卫 ==============================
async function newestMtime(dir) {
  let newest = 0
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    newest = Math.max(newest, e.isDirectory() ? await newestMtime(p) : (await fs.stat(p)).mtimeMs)
  }
  return newest
}

setSection('构建')
console.log('\n-------- 构建 --------')
let buildOk = true
try {
  execSync('npm run build', { stdio: 'inherit', cwd: root })
} catch (err) {
  buildOk = false
  check('npm run build 成功', false, String(err && err.message ? err.message : err))
}
if (buildOk) {
  const assetsDir = join(root, 'out', 'renderer', 'assets')
  const files = (await fs.readdir(assetsDir)).filter((f) => f.endsWith('.js'))
  check('构建产物 out/renderer/assets/*.js 存在', files.length > 0, files.join(', '))
  const outNewest = Math.max(...(await Promise.all(files.map(async (f) => (await fs.stat(join(assetsDir, f))).mtimeMs))))
  const srcNewest = await newestMtime(join(root, 'src'))
  check(
    '构建产物新于 src 下最新改动（否则验证跑在旧产物上，会静默假通过）',
    outNewest >= srcNewest,
    `out=${new Date(outNewest).toISOString()} src=${new Date(srcNewest).toISOString()}`
  )
}

// ============================== 隔离环境 ==============================
const tempDirs = []
async function mkTmp(prefix) {
  const d = await fs.mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(d)
  return d
}

const notesRoot = await mkTmp('ak-vw-notes-')
const srcDir = join(notesRoot, 'leetcode')
await fs.mkdir(srcDir, { recursive: true })

const FILLER = [
  '这一段正文用于把文档撑到足够长，保证滚动比例对齐那组断言有充分的可滚动量。',
  '如果文档太短，滚动比例的分母接近零，断言就失去判别力，无论修没修都会绿。',
  '因此这里刻意堆了若干段等价内容，让两种编辑器的滚动量都远超一个视口。',
  '内容本身没有语义价值，只服务于测量。',
  '第一组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第二组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第三组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第四组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第五组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第六组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第七组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。',
  '第八组的补充说明文字，继续堆高，保持每段两行左右的渲染高度。'
]

function fm(lines) {
  return ['---', ...lines, '---', ''].join('\n')
}

const twoSumMd =
  fm([
    'source: leetcode',
    'id: two-sum',
    'title: Two Sum 两数之和',
    'difficulty: Easy',
    'tags: [array, hash-table]',
    'status: active',
    'aliases: [两数之和]',
    'created: 2026-09-01T09:12:00.000Z',
    'updated: 2026-09-08T21:47:00.000Z'
  ]) +
  [
    '# Two Sum 两数之和',
    '',
    '> 给定一个整数数组 nums 和一个目标值 target，返回两个下标，使两数之和等于目标值。',
    '',
    '## 解法一：哈希表',
    '',
    '一遍遍历，边存边查补数。',
    '',
    '```ts',
    'function twoSum(nums: number[], target: number): number[] {',
    '  const seen = new Map<number, number>()',
    '  for (let i = 0; i < nums.length; i++) {',
    '    const need = target - nums[i]',
    '    if (seen.has(need)) return [seen.get(need)!, i]',
    '    seen.set(nums[i], i)',
    '  }',
    '  return []',
    '}',
    '```',
    '',
    '**时间复杂度**：O(n) **空间复杂度**：O(n)',
    '',
    '## 解法二：暴力枚举',
    '',
    '双重循环枚举所有下标对，和等于目标值即返回。',
    '',
    '## 易错点',
    '',
    '- 必须先查表再写入当前元素，否则目标值恰好是两倍时元素会与自己配对。',
    '- 返回的是下标而不是值。',
    '',
    '## 备注',
    '',
    ...FILLER,
    ''
  ].join('\n')

const lruMd =
  fm([
    'source: leetcode',
    'id: lru-cache',
    'title: LRU Cache 最近最少使用缓存',
    'difficulty: Medium',
    'tags: [hash-table, linked-list, design]',
    'status: active',
    'aliases: []',
    'created: 2026-09-02T10:00:00.000Z',
    'updated: 2026-09-07T18:30:00.000Z'
  ]) +
  [
    '# LRU Cache 最近最少使用缓存',
    '',
    '哈希表 + 双向链表，读写都是 O(1)。',
    '',
    '| 方法 | 复杂度 | 说明 |',
    '| --- | --- | --- |',
    '| get | O(1) | 命中后把节点移到表头 |',
    '| put | O(1) | 写入后把节点移到表头 |',
    '| evict | O(1) | 超出容量时淘汰表尾 |',
    '| resize | O(n) | 扩容时重建索引 |',
    '',
    '## 易错点',
    '',
    '- 淘汰的是表尾而不是表头。',
    '',
    '## 备注',
    '',
    ...FILLER,
    ''
  ].join('\n')

const WIDE_COLS = 40
const wideHeader = Array.from({ length: WIDE_COLS }, (_, i) => `列${i + 1}头`)
const wideRow = (n) => Array.from({ length: WIDE_COLS }, (_, i) => `值${i + 1}_${n}`)
const wideMd =
  fm([
    'source: leetcode',
    'id: wide-table',
    'title: 宽表验证 Wide Table',
    'difficulty: Easy',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-12T10:00:00.000Z',
    'updated: 2026-09-12T10:00:00.000Z'
  ]) +
  [
    '# 宽表验证 Wide Table',
    '',
    `| ${wideHeader.join(' | ')} |`,
    `| ${Array.from({ length: WIDE_COLS }, () => '---').join(' | ')} |`,
    `| ${wideRow(1).join(' | ')} |`,
    `| ${wideRow(2).join(' | ')} |`,
    `| ${wideRow(3).join(' | ')} |`,
    ''
  ].join('\n')

// B 组「超长单行代码块」的真机种子：一行远超正文宽度（800px ≈ 100 字符）的代码。
// 用来测 `.ak-editor pre{overflow-x:auto}` 这条真正承重的规则 —— 原来那条
// `max-width: none` 断言没有判别力（max-width 初始值就是 none）。
const LONG_CODE_LINE =
  'const result = ' + Array.from({ length: 40 }, (_, i) => `value${i}`).join(' + ') + ' // 超长单行注释，用于验证代码块内部的横向滚动'
/** 无任何断点的超长 token（连 word-break 都只能靠 overflow-wrap:anywhere 才断得开） */
const LONG_TOKEN_LINE = 'const akUnbreakableToken = ' + 'z'.repeat(260)
const wideCodeMd =
  fm([
    'source: leetcode',
    'id: wide-code',
    'title: 长行代码验证 Wide Code',
    'difficulty: Easy',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-12T10:00:00.000Z',
    'updated: 2026-09-12T10:00:00.000Z'
  ]) +
  ['# 长行代码验证 Wide Code', '', '```ts', LONG_CODE_LINE, LONG_TOKEN_LINE, '```', '', '尾段占位。', ''].join('\n')

// F 组脚注种子：验证「文本 `[^n]` → Footnote 节点」的转换在预检谓词改造后仍然生效
// （C1 的修复把「是否武装写窗」与「是否会真的 dispatch」绑成同一个谓词，这条是它的正对照）。
// 注意这里**不写** `[^1]: 定义。`：markdown-it 会把「引用 + 定义」整体解析成 reference link
// （实测 `[^1]` 变成 <a href="...">^1</a>），文本节点里就没有 `[^n]` 了，转换自然不会触发。
// 无定义的 `[^n]` 才是这条转换真正的目标（也与「用户直接键入 [^n]」同形）。
const footnoteMd =
  fm([
    'source: leetcode',
    'id: footnote-ref',
    'title: 脚注验证 Footnote Ref',
    'difficulty: Easy',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-12T10:00:00.000Z',
    'updated: 2026-09-12T10:00:00.000Z'
  ]) + ['# 脚注验证 Footnote Ref', '', '这里有脚注引用[^1]，后面还有正文。', ''].join('\n')

// D 组：复习统计三分支的真机种子（走真实主进程 readNote，不经假后端）
const schedFullMd =
  fm([
    'source: leetcode',
    'id: sched-full',
    'title: 调度完整 Scheduled Full',
    'difficulty: Medium',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-03T10:00:00.000Z',
    'updated: 2026-09-03T10:00:00.000Z',
    'scheduling:',
    '  main: { repetitions: 4, easeFactor: 2.36, interval: 7, due: 2026-09-15, lapses: 1, lastReviewed: 2026-09-08 }',
    '  cards:',
    '    qhash-a: { repetitions: 1, easeFactor: 2.5, interval: 3, due: 2026-09-18, lapses: 0 }',
    '    qhash-b: { repetitions: 2, easeFactor: 2.5, interval: 5, due: 2026-09-20, lapses: 0 }'
  ]) + ['# 调度完整', '', '正文占位。', ''].join('\n')

const schedNoneMd =
  fm([
    'source: leetcode',
    'id: sched-none',
    'title: 无调度 Scheduled None',
    'difficulty: Easy',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-03T10:00:00.000Z',
    'updated: 2026-09-03T10:00:00.000Z'
  ]) + ['# 无调度', '', '正文占位。', ''].join('\n')

const schedPartialMd =
  fm([
    'source: leetcode',
    'id: sched-partial',
    'title: 调度残缺 Scheduled Partial',
    'difficulty: Hard',
    'tags: [verify]',
    'status: active',
    'aliases: []',
    'created: 2026-09-03T10:00:00.000Z',
    'updated: 2026-09-03T10:00:00.000Z',
    'scheduling:',
    '  main: { repetitions: 2, easeFactor: 2.5, interval: 3, lapses: 0 }',
    '  cards:',
    '    qhash-c: { repetitions: 1, easeFactor: 2.5 }'
  ]) + ['# 调度残缺', '', '正文占位。仅 main 缺 due、cards 缺 due，均应视为未复习且不抛错。', ''].join('\n')

for (const [name, body] of [
  ['two-sum.md', twoSumMd],
  ['lru-cache.md', lruMd],
  ['wide-table.md', wideMd],
  ['wide-code.md', wideCodeMd],
  ['footnote-ref.md', footnoteMd],
  ['sched-full.md', schedFullMd],
  ['sched-none.md', schedNoneMd],
  ['sched-partial.md', schedPartialMd]
]) {
  await fs.writeFile(join(srcDir, name), body, 'utf8')
}

/** 启动一个隔离窗口：临时 profile + 预置 settings.json（笔记根指向临时目录）。 */
async function openApp(opts = {}) {
  const profile = opts.profile ?? (await mkTmp('ak-vw-profile-'))
  if (!opts.profile) {
    const settings = { notesRoot, theme: opts.theme ?? 'dark' }
    if (opts.layout) settings.layout = opts.layout
    await fs.writeFile(join(profile, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  }
  const app = await electron.launch({ executablePath: ELECTRON, args: [root, `--user-data-dir=${profile}`] })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: '文件', exact: true }).waitFor({ timeout: 20000 })
  if (opts.size) {
    const [w, h] = opts.size
    await app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setSize(width, height), [w, h])
  }
  await sleep(opts.settle ?? 2500)
  return { app, page, profile }
}

async function runSection(name, fn) {
  if (onlyKeys && !onlyKeys.includes(sectionKey(name))) {
    skippedSections.push(name)
    console.log(`\n-------- ${name} -------- (--only 过滤，跳过)`)
    return
  }
  setSection(name)
  console.log(`\n-------- ${name} --------`)
  try {
    await fn()
  } catch (err) {
    check('本节脚本异常', false, String(err && err.stack ? err.stack : err))
  }
}

const attrs = (page) =>
  page.evaluate(() => ({
    mode: document.documentElement.dataset.mode ?? null,
    source: document.documentElement.dataset.source ?? null,
    focus: document.documentElement.dataset.focus ?? null,
    theme: document.documentElement.dataset.theme ?? null,
    contentWidth: document.documentElement.dataset.contentWidth ?? null
  }))

const activeDesc = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el) return 'null'
    if (el === document.body) return 'body'
    // 分隔条只有 aria-label（没有 title），一并读出来
    const t = el.getAttribute('title') ?? el.getAttribute('aria-label')
    return `${el.tagName.toLowerCase()}${t ? `[${t}]` : ''}`
  })

const readSettings = async (profile) => JSON.parse(await fs.readFile(join(profile, 'settings.json'), 'utf8'))

/** 同上，但带 CSS class（用于识别 .cm-content 这类没有 title 的元素） */
const activeCls = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el) return 'null'
    if (el === document.body) return 'body'
    return `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')}`
  })

/**
 * 分隔条的鼠标落点。
 * 不能取元素本身的几何中心：分隔条是 `w-px`（1 CSS px），而它右侧的兄弟 <main> /
 * 右侧面板在 DOM 中靠后、绘制在其之上，把元素自己的 1px 盖住了 ——
 * elementFromPoint(中心) 实测返回的是 <main>，按下事件根本到不了分隔条。
 * 组件本来就把可抓取区做成 `before:-left-1 before:w-3`（元素左边界向左 4px、宽 12px）
 * 的伪元素，所以按设计取「元素左边界 − 2px」这个落点（实测 pointerdown 命中分隔条）。
 */
const sepPoint = (page, side) =>
  page.evaluate((s) => {
    const seps = [...document.querySelectorAll('[role="separator"]')]
    const el = seps[s === 'left' ? 0 : 1]
    if (!el) return null
    const b = el.getBoundingClientRect()
    const h = el.parentElement.getBoundingClientRect()
    return { x: b.left - 2, y: b.top + b.height / 2, hostLeft: h.left, hostRight: h.right, hostWidth: h.width }
  }, side)

const openNote = async (page, nameRe) => {
  await page.getByRole('button', { name: nameRe }).first().click()
  await sleep(1500)
  await page.locator('.ak-editor .ProseMirror').waitFor({ timeout: 10000 })
}

/** 关闭可能打开的下拉菜单（overlay 会拦截点击） */
const closeMenus = async (page) => {
  for (let i = 0; i < 3; i++) {
    const open = await page.locator('.fixed.inset-0.z-40').count()
    if (!open) return
    await page.locator('.fixed.inset-0.z-40').first().click({ force: true })
    await sleep(300)
  }
  await page.keyboard.press('Escape')
  await sleep(300)
}

/** 走菜单钻取路径：编辑 → 查找和替换 → 查找… */
const openFindFromMenu = async (page) => {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await sleep(400)
  await page.getByRole('button', { name: /查找和替换/ }).click()
  await sleep(400)
  await page.getByRole('button', { name: /查找…/ }).click()
  await sleep(700)
}

const findProbe = (page) =>
  page.evaluate(() => ({
    cmSearch: !!document.querySelector('.cm-search'),
    dialog: !!document.querySelector('input[placeholder="查找…"]')
  }))

// ============================================================================
// A. 三栏工作台（T5 未留下脚本，按 task-5-report.md 的行为清单重新实现）
// ============================================================================
await runSection('A 三栏工作台', async () => {
  const probe = (page) =>
    page.evaluate(() => {
      const sep = document.querySelector('[role="separator"]')
      const host = sep ? sep.parentElement : null
      const left = document.querySelector('button[title="折叠左栏 Ctrl+1"]')
      const right = document.querySelector('button[title="折叠右栏 Ctrl+Shift+B"]')
      const rect = host ? host.getBoundingClientRect() : null
      const main = document.querySelector('main')
      return {
        host: rect ? Math.round(rect.width) : null,
        hostLeft: rect ? rect.left : null,
        hostRight: rect ? rect.right : null,
        leftWidth: left ? Math.round(left.parentElement.parentElement.getBoundingClientRect().width) : null,
        rightWidth: right ? Math.round(right.parentElement.parentElement.getBoundingClientRect().width) : null,
        centerWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
        hasLeftPanel: !!left,
        hasRightPanel: !!right,
        rails: [...document.querySelectorAll('button[title^="展开"]')].map((b) => ({
          title: b.getAttribute('title'),
          w: Math.round(b.parentElement.getBoundingClientRect().width)
        })),
        resizing: document.documentElement.dataset.resizing ?? null
      }
    })

  const dragTo = async (page, side, targetX) => {
    const pt = await sepPoint(page, side)
    await page.mouse.move(pt.x, pt.y)
    await page.mouse.down()
    await page.mouse.move(targetX, pt.y, { steps: 10 })
    await page.mouse.up()
    await sleep(450)
  }

  const clickSep = async (page, side) => {
    const pt = await sepPoint(page, side)
    await page.mouse.click(pt.x, pt.y)
    await sleep(300)
  }

  const dbl = async (page, side) => {
    const pt = await sepPoint(page, side)
    await page.mouse.dblclick(pt.x, pt.y)
    await sleep(450)
  }

  const { app, page, profile } = await openApp({ theme: 'light-github', size: [1500, 1000] })
  try {
    // 几何断言等条件成立：首帧布局与偏好读出都可能比固定 sleep 慢（慢机器上会随机红）
    let p = await pollUntil(
      () => probe(page),
      (v) => v.leftWidth === DEFAULT_LEFT_WIDTH && v.rightWidth === DEFAULT_RIGHT_WIDTH
    )
    check(
      `初始左栏宽 ${DEFAULT_LEFT_WIDTH} / 右栏宽 ${DEFAULT_RIGHT_WIDTH}`,
      p.leftWidth === DEFAULT_LEFT_WIDTH && p.rightWidth === DEFAULT_RIGHT_WIDTH,
      `左 ${p.leftWidth} 右 ${p.rightWidth}`
    )
    check(`初始正文宽 ≥ MIN_CONTENT_WIDTH(${MIN_CONTENT_WIDTH})`, p.centerWidth >= MIN_CONTENT_WIDTH, `正文 ${p.centerWidth}`)

    // ---- 拖拽 clamp ----
    await dragTo(page, 'left', p.hostLeft + 2)
    p = await probe(page)
    check(`拖左栏到最左被夹到 LEFT_MIN=${LEFT_MIN}`, p.leftWidth === LEFT_MIN, `实际 ${p.leftWidth}`)
    check('拖拽后正文仍 ≥ 下限', p.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p.centerWidth}`)

    await dragTo(page, 'left', p.hostRight - 2)
    p = await probe(page)
    check(`拖左栏到最右被夹到 LEFT_MAX=${LEFT_MAX}`, p.leftWidth === LEFT_MAX, `实际 ${p.leftWidth}`)
    check('拖拽后正文仍 ≥ 下限', p.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p.centerWidth}`)

    // ---- 双击分隔条恢复默认宽 ----
    await dbl(page, 'left')
    p = await probe(page)
    check(`双击左分隔条恢复默认宽 ${DEFAULT_LEFT_WIDTH}`, p.leftWidth === DEFAULT_LEFT_WIDTH, `实际 ${p.leftWidth}`)

    await dragTo(page, 'right', p.hostRight - 2)
    p = await probe(page)
    check(`拖右栏到最右被夹到 RIGHT_MIN=${RIGHT_MIN}`, p.rightWidth === RIGHT_MIN, `实际 ${p.rightWidth}`)
    check('拖拽后正文仍 ≥ 下限', p.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p.centerWidth}`)

    await dbl(page, 'right')
    p = await probe(page)
    check(`双击右分隔条恢复默认宽 ${DEFAULT_RIGHT_WIDTH}`, p.rightWidth === DEFAULT_RIGHT_WIDTH, `实际 ${p.rightWidth}`)

    await dragTo(page, 'right', p.hostLeft + 2)
    p = await probe(page)
    check(`拖右栏到最左被夹到 RIGHT_MAX=${RIGHT_MAX}`, p.rightWidth === RIGHT_MAX, `实际 ${p.rightWidth}`)
    check('拖拽后正文仍 ≥ 下限', p.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p.centerWidth}`)
    await dbl(page, 'right')
    await dbl(page, 'left')

    // ---- R7：data-resizing 只由拖拽置位，抬起后清掉 ----
    {
      const pt = await sepPoint(page, 'left')
      await page.mouse.move(pt.x, pt.y)
      await page.mouse.down()
      await page.mouse.move(pt.x + 60, pt.y, { steps: 4 })
      const during = (await probe(page)).resizing
      await page.mouse.up()
      await sleep(300)
      const after = (await probe(page)).resizing
      check("拖拽中 data-resizing='1'、抬起后清空", during === '1' && after === null, `拖拽中=${during} 抬起后=${after}`)
      await dbl(page, 'left')
    }

    // ---- 键盘：点击分隔条即聚焦（T5 的 D1），←/→/Home/End ----
    {
      await clickSep(page, 'left')
      const desc = await activeDesc(page)
      check('点击分隔条后分隔条自身获焦（鼠标用户可用键盘微调）', desc === 'div[左栏宽度调整]', `activeElement = ${desc}`)

      await page.keyboard.press('ArrowRight')
      await sleep(350)
      p = await probe(page)
      check(`分隔条 ArrowRight 步进 16 → ${DEFAULT_LEFT_WIDTH + 16}`, p.leftWidth === DEFAULT_LEFT_WIDTH + 16, `实际 ${p.leftWidth}`)

      await page.keyboard.press('ArrowLeft')
      await sleep(350)
      p = await probe(page)
      check(`分隔条 ArrowLeft 步进 -16 → ${DEFAULT_LEFT_WIDTH}`, p.leftWidth === DEFAULT_LEFT_WIDTH, `实际 ${p.leftWidth}`)

      await page.keyboard.press('Home')
      await sleep(350)
      p = await probe(page)
      check(`分隔条 Home 跳到 LEFT_MIN=${LEFT_MIN}`, p.leftWidth === LEFT_MIN, `实际 ${p.leftWidth}`)

      await page.keyboard.press('End')
      await sleep(350)
      p = await probe(page)
      check(`分隔条 End 跳到 LEFT_MAX=${LEFT_MAX}`, p.leftWidth === LEFT_MAX, `实际 ${p.leftWidth}`)

      // 右栏分隔条：grow = -1
      await dbl(page, 'right')
      await clickSep(page, 'right')
      await page.keyboard.press('ArrowLeft')
      await sleep(350)
      p = await probe(page)
      check(`右分隔条 ArrowLeft 步进 +16 → ${DEFAULT_RIGHT_WIDTH + 16}`, p.rightWidth === DEFAULT_RIGHT_WIDTH + 16, `实际 ${p.rightWidth}`)
      await page.keyboard.press('Home')
      await sleep(350)
      p = await probe(page)
      check(`右分隔条 Home 跳到 RIGHT_MIN=${RIGHT_MIN}`, p.rightWidth === RIGHT_MIN, `实际 ${p.rightWidth}`)
      await page.keyboard.press('End')
      await sleep(350)
      p = await probe(page)
      check(`右分隔条 End 跳到 RIGHT_MAX=${RIGHT_MAX}`, p.rightWidth === RIGHT_MAX, `实际 ${p.rightWidth}`)
      await dbl(page, 'right')
      await dbl(page, 'left')
    }

    // ---- 内容宽度上限：容器变窄时 cap 必须真的吃掉拖拽量 ----
    {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 1000))
      await sleep(900)
      p = await probe(page)
      const W = p.host
      await dragTo(page, 'left', p.hostRight - 2)
      p = await probe(page)
      const expected = Math.min(LEFT_MAX, W - MIN_CONTENT_WIDTH - p.rightWidth)
      check(
        '窗口变窄后拖满左栏被 cap 截断（保留正文最小宽）',
        Math.abs(p.leftWidth - expected) <= 1 && p.leftWidth < LEFT_MAX,
        `容器 ${W} / 左 ${p.leftWidth} / 期望 ${expected} / 右 ${p.rightWidth}`
      )
      check('cap 生效后正文仍 ≥ 下限', p.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p.centerWidth} / 下限 ${MIN_CONTENT_WIDTH - DIVIDER_TOTAL}`)
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 1000))
      await sleep(800)
      await dbl(page, 'left')
    }

    // ---- 折叠 / rail / 焦点闭环（F4）----
    {
      await clickSep(page, 'left')
      await page.keyboard.press('Enter')
      await sleep(500)
      p = await probe(page)
      let desc = await activeDesc(page)
      check(
        `分隔条 Enter 折叠左栏 → ${RAIL_WIDTH}px rail（tooltip 展开左栏 Ctrl+1）`,
        !p.hasLeftPanel && p.rails.length === 1 && p.rails[0].title === '展开左栏 Ctrl+1' && p.rails[0].w === RAIL_WIDTH,
        JSON.stringify(p.rails)
      )
      check('折叠后焦点落到 rail 的展开按钮（F4）', desc === 'button[展开左栏 Ctrl+1]', `activeElement = ${desc}`)

      await page.keyboard.press('Enter')
      await sleep(500)
      p = await probe(page)
      desc = await activeDesc(page)
      check('rail 展开按钮可被 Enter 激活并恢复左栏', p.hasLeftPanel && p.rails.length === 0, JSON.stringify(p))
      check('展开后焦点回到栏头折叠按钮（F4 闭环）', desc === 'button[折叠左栏 Ctrl+1]', `activeElement = ${desc}`)

      await page.keyboard.press('Enter')
      await sleep(500)
      p = await probe(page)
      desc = await activeDesc(page)
      check(
        '折叠 → 展开 → 再折叠 全程无需 Tab（键盘闭环）',
        !p.hasLeftPanel && p.rails.length === 1 && desc === 'button[展开左栏 Ctrl+1]',
        `activeElement = ${desc}`
      )
      // 点 rail 箭头展开
      await page.locator('button[title="展开左栏 Ctrl+1"]').click()
      await sleep(500)
      p = await probe(page)
      check('点击 rail 箭头可展开左栏', p.hasLeftPanel && p.rails.length === 0, JSON.stringify(p))

      // 右栏：Space 折叠 + 焦点补位
      await clickSep(page, 'right')
      await page.keyboard.press(' ')
      await sleep(500)
      p = await probe(page)
      desc = await activeDesc(page)
      check(
        '分隔条 Space 折叠右栏后焦点落到 rail 展开按钮（F4）',
        !p.hasRightPanel && p.rails.length === 1 && desc === 'button[展开右栏 Ctrl+Shift+B]',
        `activeElement = ${desc}`
      )
      await page.keyboard.press('Enter')
      await sleep(500)
      desc = await activeDesc(page)
      check('右栏展开方向补焦到栏头折叠按钮', desc === 'button[折叠右栏 Ctrl+Shift+B]', `activeElement = ${desc}`)
    }

    // ---- D5：Ctrl+1 / Ctrl+Shift+B ----
    {
      // 「Ctrl+Shift+1 不折叠左栏」单独断言没有判别力：US 布局下 Shift+1 的 e.key 恒为 '!'，
      // 于是即使删掉源码里的 !e.shiftKey 守卫这条也依旧绿（真正的隔离来自 e.key）。
      // 因此与「同一时刻 Ctrl+1 必须真的折叠」成对断言：判别力来自这条正对照 ——
      // 若有人把键位改成按 e.code==='Digit1' 判定（Ctrl+Shift+1 会一起命中），本组必红。
      await page.keyboard.press('Control+Shift+1')
      await sleep(500)
      const afterShift1 = await probe(page)
      await page.keyboard.press('Control+1')
      await sleep(500)
      p = await probe(page)
      check(
        'Ctrl+Shift+1 不折叠左栏、而 Ctrl+1 折叠（带修饰键与 Ctrl+1 可区分）',
        afterShift1.hasLeftPanel && afterShift1.rails.length === 0 && !p.hasLeftPanel && p.rails.length === 1,
        JSON.stringify({ shift1: afterShift1.rails, ctrl1: p.rails })
      )
      check(
        'Ctrl+1 折叠左栏（tooltip 展开左栏 Ctrl+1）',
        !p.hasLeftPanel && p.rails.length === 1 && p.rails[0].title === '展开左栏 Ctrl+1',
        JSON.stringify(p.rails)
      )
      await page.keyboard.press('Control+1')
      await sleep(500)
      p = await probe(page)
      check('Ctrl+1 再按恢复左栏', p.hasLeftPanel && p.rails.length === 0, JSON.stringify(p))

      await page.keyboard.press('Control+Shift+B')
      await sleep(500)
      p = await probe(page)
      check(
        'Ctrl+Shift+B 折叠右栏（tooltip 展开右栏 Ctrl+Shift+B）',
        !p.hasRightPanel && p.rails.length === 1 && p.rails[0].title === '展开右栏 Ctrl+Shift+B',
        JSON.stringify(p.rails)
      )
      await page.keyboard.press('Control+Shift+B')
      await sleep(500)
      p = await probe(page)
      check('Ctrl+Shift+B 再按恢复右栏', p.hasRightPanel && p.rails.length === 0, JSON.stringify(p))
    }

    // ---- 写盘 + 重启保持 ----
    {
      await clickSep(page, 'left')
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight')
        await sleep(200)
      }
      // 右栏 256 → 旋钮到 272 再折回，避免与默认值撞车
      await page.keyboard.press('Control+Shift+B')
      await sleep(1300)
      const st = await readSettings(profile)
      check(
        '布局偏好写入 settings.json（宽度 + 显隐）',
        st.layout?.leftWidth === DEFAULT_LEFT_WIDTH + 64 && st.layout?.rightVisible === false && st.layout?.rightWidth === DEFAULT_RIGHT_WIDTH,
        JSON.stringify(st.layout)
      )
    }

    await app.close()
    const revived = await openApp({ profile, size: [1500, 1000] })
    try {
      const p2 = await pollUntil(
        () =>
          revived.page.evaluate(() => {
            const left = document.querySelector('button[title="折叠左栏 Ctrl+1"]')
            const main = document.querySelector('main')
            return {
              leftWidth: left ? Math.round(left.parentElement.parentElement.getBoundingClientRect().width) : null,
              hasRightPanel: !!document.querySelector('button[title="折叠右栏 Ctrl+Shift+B"]'),
              rails: [...document.querySelectorAll('button[title^="展开"]')].map((b) => ({
                title: b.getAttribute('title'),
                w: Math.round(b.parentElement.getBoundingClientRect().width)
              })),
              centerWidth: main ? Math.round(main.getBoundingClientRect().width) : null
            }
          }),
        (v) => v.leftWidth === DEFAULT_LEFT_WIDTH + 64 && v.hasRightPanel === false
      )
      check('同一 profile 二次启动：左栏宽度保持', p2.leftWidth === DEFAULT_LEFT_WIDTH + 64, `实际 ${p2.leftWidth}`)
      check(
        '同一 profile 二次启动：右栏折叠状态保持（渲染为 rail）',
        !p2.hasRightPanel && p2.rails.length === 1 && p2.rails[0].title === '展开右栏 Ctrl+Shift+B',
        JSON.stringify(p2.rails)
      )
      check('重启后正文仍 ≥ 下限', p2.centerWidth >= MIN_CONTENT_WIDTH - DIVIDER_TOTAL, `正文 ${p2.centerWidth}`)
      const desc = await activeDesc(revived.page)
      check('启动时不做「挂载即抢焦」（activeElement 不是 rail 展开按钮）', !desc.startsWith('button[展开'), `activeElement = ${desc}`)
    } finally {
      await revived.app.close()
    }
    return
  } finally {
    await app.close().catch(() => undefined)
  }
})

// ============================================================================
// B. 排版体系（T7）
// ============================================================================
await runSection('B 排版', async () => {
  const { app, page } = await openApp({ theme: 'light-github', size: [1500, 1000] })
  try {
    await openNote(page, 'Two Sum 两数之和')

    const initial = (await attrs(page)).contentWidth
    check("App effect 把默认档位写到根节点 data-content-width='medium'", initial === 'medium', `实际 ${JSON.stringify(initial)}`)

    // ---- 顶部格式工具栏已移除 ----
    const toolbarProbe = await page.evaluate(() => {
      const titles = ['粗体 Ctrl+B', '斜体 Ctrl+I', '行内代码', '一级标题', '二级标题', '三级标题', '无序列表', '有序列表', '撤销', '重做']
      const found = titles.filter((t) => document.querySelector(`button[title="${t}"]`))
      const editor = document.querySelector('.ak-editor')
      const pageEl = editor?.parentElement
      const scroller = pageEl?.parentElement
      const pane = scroller?.parentElement
      return {
        found,
        pageClass: pageEl?.className ?? null,
        scrollerClass: scroller?.className ?? null,
        firstChildClass: pane?.firstElementChild?.className ?? null,
        childCount: pane?.children.length ?? -1,
        editorButtons: pane ? pane.querySelectorAll('button').length : -1
      }
    })
    check('顶部格式工具栏按钮已全部移除', toolbarProbe.found.length === 0, `残留 ${JSON.stringify(toolbarProbe.found)}`)
    check(
      'DOM 结构为 .ak-scroll > .ak-page > .ak-editor',
      toolbarProbe.pageClass === 'ak-page' &&
        (toolbarProbe.scrollerClass ?? '').includes('ak-scroll') &&
        (toolbarProbe.firstChildClass ?? '').includes('ak-scroll'),
      JSON.stringify({ page: toolbarProbe.pageClass, scroll: toolbarProbe.scrollerClass })
    )
    check('编辑面板只有滚动容器一个子节点（工具栏块已删除）', toolbarProbe.childCount === 1, `子节点数 ${toolbarProbe.childCount}`)
    check('编辑面板内 button 数为 0', toolbarProbe.editorButtons === 0, `实际 ${toolbarProbe.editorButtons}`)

    // ---- 内容限宽三档 ----
    const measurePage = (target) =>
      (async () => {
        const el = document.querySelector('.ak-page')
        const scroller = el.closest('.ak-scroll')
        const cs = getComputedStyle(scroller)
        const padL = parseFloat(cs.paddingLeft)
        const padR = parseFloat(cs.paddingRight)
        const avail = scroller.clientWidth - padL - padR
        const r = el.getBoundingClientRect()
        const s = scroller.getBoundingClientRect()
        return {
          target,
          cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ak-content-width').trim(),
          pageWidth: Math.round(r.width),
          avail: Math.round(avail),
          gapL: Math.round(r.left - (s.left + padL)),
          gapR: Math.round(s.left + padL + avail - r.right)
        }
      })()

    // 三档宽度是几何断言：用轮询等「该档的宽度真的生效」而不是固定 sleep(400)
    const wantWidth = { narrow: 680, medium: 800 }
    const probes = []
    for (const v of ['narrow', 'medium', 'full']) {
      await page.evaluate((val) => {
        document.documentElement.dataset.contentWidth = val
      }, v)
      const want = wantWidth[v]
      probes.push(
        await pollUntil(
          () => page.evaluate(measurePage, v),
          (m) => (want === undefined ? m.pageWidth === m.avail : m.pageWidth === want)
        )
      )
    }
    const [narrow, medium, full] = probes
    check('narrow 变量解析为 680px', narrow.cssVar === '680px', narrow.cssVar)
    check('medium 变量解析为 800px', medium.cssVar === '800px', medium.cssVar)
    check('full 变量解析为 100%', full.cssVar === '100%', full.cssVar)
    check('可用宽度足够区分三档（>800px，否则本组无意义）', medium.avail > 800, `可用 ${medium.avail}px`)
    check('编辑态：narrow 实测 = 680px', narrow.pageWidth === 680, `${narrow.pageWidth}px`)
    check('编辑态：medium 实测 = 800px', medium.pageWidth === 800, `${medium.pageWidth}px`)
    check('编辑态：full 实测 = 铺满可用宽度', full.pageWidth === full.avail, `${full.pageWidth}px vs 可用 ${full.avail}px`)
    check(
      '三档宽度单调递增 narrow < medium < full',
      narrow.pageWidth < medium.pageWidth && medium.pageWidth < full.pageWidth,
      `${narrow.pageWidth} < ${medium.pageWidth} < ${full.pageWidth}`
    )
    check('medium 水平居中（左右留白均等）', Math.abs(medium.gapL - medium.gapR) <= 1 && medium.gapL > 0, `左 ${medium.gapL} / 右 ${medium.gapR}`)
    check('full 左右无留白', full.gapL <= 1 && full.gapR <= 1, `左 ${full.gapL} / 右 ${full.gapR}`)
    await page.evaluate(() => {
      document.documentElement.dataset.contentWidth = 'medium'
    })

    // 阅读态同样套用 .ak-page 限宽（限宽不是编辑态专属）
    await page.keyboard.press('Control+e')
    await sleep(1200)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1900, 1000))
    // 窗口 resize 后的重排 + 阅读态 .ak-page 生效都要等条件成立（原来固定 sleep(800)）
    const readPage = await pollUntil(
      () => page.evaluate(measurePage, 'medium-read'),
      (m) => m.avail > 800 && m.pageWidth === 800 && Math.abs(m.gapL - m.gapR) <= 1
    )
    check(
      '阅读态：.ak-page 同样限宽 800px 且居中',
      readPage.avail > 800 && readPage.pageWidth === 800 && Math.abs(readPage.gapL - readPage.gapR) <= 1,
      `可用 ${readPage.avail} / 实际 ${readPage.pageWidth} / 左 ${readPage.gapL} 右 ${readPage.gapR}`
    )
    await page.keyboard.press('Control+e')
    await sleep(900)

    // ---- 代码块排版 ----
    // 注：原先还有一条「代码块 max-width: none」——已删除。max-width 的初始值就是
    // none，删掉 main.css 里那条声明它照样恒绿（空洞断言）。真正承重的是
    // `.ak-editor pre{overflow-x:auto}`（main.css:80），下面用一段真实超宽的单行
    // 代码把它测出来。
    const preProbe = await page.evaluate(() => {
      const pre = document.querySelector('.ak-editor pre')
      if (!pre) return null
      const cs = getComputedStyle(pre)
      return { borderRadius: cs.borderRadius, padding: cs.padding }
    })
    check('代码块 border-radius 8px', preProbe && preProbe.borderRadius === '8px', preProbe?.borderRadius)

    // ---- 超长单行代码块：折行必须被自身消化，且不把外层撑宽 ----
    // 实测结论（本组断言的由来）：`.ak-editor pre{overflow-x:auto}`（main.css:80）在本仓库的
    // 排版下是**惰性的** —— `.ak-editor{word-break:break-word}`（main.css:24，word-break 可继承）
    // 会把任何超长 token 直接断开，代码块因此永远不产生横向溢出（实测 pre scrollWidth ===
    // clientWidth === 799，含 368 字符长行与 260 字符无断点 token 各一条）。
    // 所以这里不写「断言 pre 内部横滚」那种构造不出来的断言，而是钉住真正可观测、
    // 且一旦排版被改坏就会变红的两条不变量：超长行被折行消化在块内 + 外层不出现横向滚动。
    await openNote(page, /长行代码验证/)
    const longPre = await page.evaluate(() => {
      const pre = document.querySelector('.ak-editor pre')
      const scroller = pre?.closest('.ak-scroll')
      const page = document.querySelector('.ak-page')
      if (!pre || !scroller || !page) return { found: false }
      const preCs = getComputedStyle(pre)
      return {
        found: true,
        overflowX: preCs.overflowX,
        wordBreak: preCs.wordBreak,
        whiteSpace: preCs.whiteSpace,
        // 视觉行数：>1 说明超长行是被「折行」消化掉的，而不是横向溢出
        visualLines: preCs.lineHeight ? Math.round(pre.getBoundingClientRect().height / parseFloat(preCs.lineHeight)) : -1,
        pageWidth: Math.round(page.getBoundingClientRect().width),
        preClientWidth: pre.clientWidth,
        preScrollWidth: pre.scrollWidth,
        textLength: (pre.textContent ?? '').length,
        overflowWrap: preCs.overflowWrap,
        maxDescRight: Math.round(Math.max(0, ...[...pre.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right)) - pre.getBoundingClientRect().left),
        scrollerClientWidth: scroller.clientWidth,
        scrollerScrollWidth: scroller.scrollWidth,
        scrollerOverflows: scroller.scrollWidth > scroller.clientWidth + 1
      }
    })
    check(
      '超长代码行确实需要折行消化（前提成立，否则本组无意义）',
      longPre.found && longPre.visualLines >= 4,
      `视觉行数 ${longPre?.visualLines}（white-space=${longPre?.whiteSpace} word-break=${longPre?.wordBreak}）`
    )
    check(
      '代码块宽度撑满正文（不跟随正文压缩、不被压窄 —— max-width:none 的可观测等价物）',
      longPre.found && longPre.pageWidth - longPre.preClientWidth <= 4,
      `pre ${longPre?.preClientWidth} vs 正文 ${longPre?.pageWidth}`
    )
    check(
      '超长代码行不溢出代码块、也不把外层 .ak-scroll 撑出横向滚动',
      longPre.found && longPre.preScrollWidth <= longPre.preClientWidth + 1 && longPre.scrollerOverflows === false,
      `pre scroll=${longPre?.preScrollWidth}/client=${longPre?.preClientWidth} scroller=${longPre?.scrollerScrollWidth}/${longPre?.scrollerClientWidth} 文本 ${longPre?.textLength} 字 overflow-wrap=${longPre?.overflowWrap} 最右后代=${longPre?.maxDescRight}`
    )

    // ---- 表格：表头着色 + 斑马纹相位 ----
    await openNote(page, /LRU/)
    const tableProbe = await page.evaluate(() => {
      const table = document.querySelector('.ak-editor table')
      if (!table) return null
      const cs = (el) => (el ? getComputedStyle(el) : null)
      const origTheme = document.documentElement.dataset.theme
      const readIn = (theme) => {
        document.documentElement.dataset.theme = theme
        const tbody = table.querySelector('tbody')
        const rows = Array.from(tbody.children)
        const headerRow = rows.find((r) => r.querySelector('th'))
        const dataRows = rows.filter((r) => r.querySelector('td'))
        return {
          theme,
          headerBg: headerRow ? cs(headerRow.querySelector('th')).backgroundColor : null,
          headerWeight: headerRow ? cs(headerRow.querySelector('th')).fontWeight : null,
          // 按数据行顺序取每行首格底色（不是 tbody 子元素序号）
          dataRowBgs: dataRows.map((r) => cs(r.querySelector('td')).backgroundColor),
          dataRowCount: dataRows.length,
          tbodyChildTags: rows.map((r) => Array.from(r.children).map((c) => c.tagName).join(''))
        }
      }
      const res = {
        hasThead: !!table.querySelector('thead'),
        theadThCount: table.querySelectorAll('thead th').length,
        tableFontSize: cs(table).fontSize,
        dark: readIn('dark'),
        light: readIn('light-github')
      }
      if (origTheme === undefined) delete document.documentElement.dataset.theme
      else document.documentElement.dataset.theme = origTheme
      return res
    })
    // 注：原先的「表格 max-width: none」已删除 —— 同为空洞断言（max-width 初始值就是
    // none）。表格的横向滚动归属由下面「超宽表格的横向滚动归属」四条实测覆盖
    // （可编辑态 + 只读态：.tableWrapper 内横滚 + 外层 .ak-scroll 不横滚）。
    check('表格字号 13px', tableProbe && tableProbe.tableFontSize === '13px', tableProbe?.tableFontSize)
    check(
      '确认 DOM 无 thead（ProseMirror 恒产出 tbody，表头行是 tbody 首行且全为 TH）',
      tableProbe && tableProbe.hasThead === false && tableProbe.theadThCount === 0 && tableProbe.dark.tbodyChildTags[0] === 'THTHTH',
      `tbody 子行 ${JSON.stringify(tableProbe?.dark.tbodyChildTags)}`
    )
    check('数据行数量足够验证相位（≥4）', (tableProbe?.dark.dataRowCount ?? 0) >= 4, `数据行 ${tableProbe?.dark.dataRowCount}`)
    check(
      '表头 th 有底色（暗色，不是 transparent）',
      tableProbe?.dark.headerBg === 'rgb(39, 39, 42)',
      `实际 ${tableProbe?.dark.headerBg}`
    )
    check(
      '表头 th 有底色（浅色，不是 transparent）',
      tableProbe?.light.headerBg === 'rgb(246, 248, 250)',
      `实际 ${tableProbe?.light.headerBg}`
    )
    check(
      '表头 font-weight 600（两主题）',
      tableProbe?.dark.headerWeight === '600' && tableProbe?.light.headerWeight === '600',
      `dark=${tableProbe?.dark.headerWeight} light=${tableProbe?.light.headerWeight}`
    )
    // 相位：表头占 tbody #1 → 被着色的是数据行第 2、4 行（tbody 的 #3、#5），第 1、3 行透明
    const wantDark = ['rgba(0, 0, 0, 0)', 'rgba(39, 39, 42, 0.4)', 'rgba(0, 0, 0, 0)', 'rgba(39, 39, 42, 0.4)']
    const wantLight = ['rgba(0, 0, 0, 0)', 'rgba(246, 248, 250, 0.7)', 'rgba(0, 0, 0, 0)', 'rgba(246, 248, 250, 0.7)']
    check(
      '斑马纹相位：数据行第 2/4 行着色、第 1/3 行透明（暗色）',
      JSON.stringify(tableProbe?.dark.dataRowBgs) === JSON.stringify(wantDark),
      `实际 ${JSON.stringify(tableProbe?.dark.dataRowBgs)}`
    )
    check(
      '斑马纹相位：数据行第 2/4 行着色、第 1/3 行透明（浅色）',
      JSON.stringify(tableProbe?.light.dataRowBgs) === JSON.stringify(wantLight),
      `实际 ${JSON.stringify(tableProbe?.light.dataRowBgs)}`
    )

    // ---- 超宽表格的横向滚动归属 ----
    const wideProbe = () =>
      (async () => {
        const table = document.querySelector('.ak-editor table')
        const wrapper = table?.closest('.tableWrapper')
        const scroller = table?.closest('.ak-scroll')
        if (!table || !scroller) return { found: false }
        return {
          found: true,
          overflowX: wrapper ? getComputedStyle(wrapper).overflowX : null,
          wrapperClientWidth: wrapper ? wrapper.clientWidth : null,
          wrapperScrollWidth: wrapper ? wrapper.scrollWidth : null,
          scrollerClientWidth: scroller.clientWidth,
          scrollerScrollWidth: scroller.scrollWidth,
          tableOverflowsWrapper: wrapper ? table.getBoundingClientRect().width > wrapper.clientWidth + 1 : null,
          scrollerOverflows: scroller.scrollWidth > scroller.clientWidth + 1
        }
      })()
    await openNote(page, /宽表验证/)
    const wideEdit = await page.evaluate(wideProbe)
    check('可编辑态：表格确实超宽（前提成立，否则本组无意义）', wideEdit.found && wideEdit.tableOverflowsWrapper === true, JSON.stringify(wideEdit))
    check(
      '可编辑态：横向滚动发生在表格区块内（.tableWrapper overflow-x）',
      wideEdit.found && wideEdit.overflowX === 'auto' && wideEdit.wrapperScrollWidth > wideEdit.wrapperClientWidth,
      `overflow-x=${wideEdit?.overflowX} scroll=${wideEdit?.wrapperScrollWidth}/${wideEdit?.wrapperClientWidth}`
    )
    check(
      '可编辑态：外层 .ak-scroll 不出现横向滚动',
      wideEdit.found && wideEdit.scrollerOverflows === false,
      `scroller scroll=${wideEdit?.scrollerScrollWidth}/client=${wideEdit?.scrollerClientWidth}`
    )
    await page.keyboard.press('Control+e')
    await sleep(1200)
    const wideRead = await page.evaluate(wideProbe)
    check('只读态：表格确实超宽（前提成立）', wideRead.found && wideRead.tableOverflowsWrapper === true, JSON.stringify(wideRead))
    check(
      '只读态：横向滚动发生在表格区块内',
      wideRead.found && wideRead.overflowX === 'auto' && wideRead.wrapperScrollWidth > wideRead.wrapperClientWidth,
      `overflow-x=${wideRead?.overflowX}`
    )
    check('只读态：外层 .ak-scroll 不出现横向滚动', wideRead.found && wideRead.scrollerOverflows === false, `scroller ${wideRead?.scrollerScrollWidth}/${wideRead?.scrollerClientWidth}`)
    await page.keyboard.press('Control+e')
    await sleep(1000)

    // ---- 右键菜单链路仍在 ----
    await openNote(page, /LRU/)
    await page.locator('.ak-editor .ProseMirror').click()
    await page.keyboard.press('Control+a')
    await sleep(200)
    await page.locator('.ak-editor .ProseMirror').click({ button: 'right' })
    await sleep(500)
    const ctx = await page.evaluate(() => {
      const menu = document.querySelector('.ak-ctx-menu')
      return { present: !!menu, text: (menu?.textContent ?? '').slice(0, 24) }
    })
    check('编辑区右键菜单仍弹出（onContextMenu 链路保留）', ctx.present && ctx.text.includes('加粗'), JSON.stringify(ctx))
    await page.locator('.ak-ctx-menu button:has-text("加粗")').click()
    await sleep(500)
    const bolded = await page.evaluate(() => !!document.querySelector('.ak-editor strong, .ak-editor b'))
    check('右键菜单「加粗」动作生效', bolded, `strong/b 节点存在=${bolded}`)
    await page.keyboard.press('Control+z')
    await sleep(400)
  } finally {
    await app.close()
  }
})

// ============================================================================
// C. 模式与控件（T9）
// ============================================================================
await runSection('C 模式与控件', async () => {
  const opacityOf = (page) =>
    page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /阅读|编辑/.test(x.textContent ?? '') && x.className.includes('absolute'))
      return b ? { op: getComputedStyle(b).opacity, text: b.textContent, inSection: !!b.closest('section') } : null
    })
  const srcBtnProbe = (page) =>
    page.evaluate(() => {
      const footer = document.querySelector('footer')
      const btn = footer ? [...footer.querySelectorAll('button')].find((b) => b.textContent === '</>') : null
      return {
        hasFooter: !!footer,
        hasBtn: !!btn,
        isFirst: btn && footer ? footer.children[0] === btn : false,
        title: btn?.getAttribute('title') ?? null,
        disabled: btn?.disabled ?? null,
        cls: btn?.className ?? null,
        hasCm: !!document.querySelector('.cm-editor')
      }
    })

  const { app, page, profile } = await openApp({ theme: 'light-github', size: [1600, 1000] })
  try {
    await openNote(page, 'Two Sum 两数之和')

    let a = await attrs(page)
    check('根节点属性初值 mode=edit / source=0 / focus=0', a.mode === 'edit' && a.source === '0' && a.focus === '0', JSON.stringify(a))

    // ---- ReadToggle：闲置变淡 / 静止悬停不变暗（F1）/ 键盘聚焦不变暗 ----
    const readBtn = page.locator('button[title="进入阅读 Ctrl+E"]')
    check('编辑区出现悬浮阅读开关（title=进入阅读 Ctrl+E）', (await readBtn.count()) === 1)
    let dimmed = await opacityOf(page)
    check('阅读开关位于编辑区右上角（section 内绝对定位）', dimmed?.inSection === true && dimmed?.text === '👁 阅读', JSON.stringify(dimmed))
    await sleep(1800)
    dimmed = await opacityOf(page)
    check('闲置 1.5s 后变淡到 0.4', dimmed?.op === '0.4', `opacity=${dimmed?.op}`)
    await readBtn.hover()
    await sleep(350)
    check('鼠标移入后恢复不透明', (await opacityOf(page))?.op === '1', `opacity=${(await opacityOf(page))?.op}`)

    // F1：指针静止停在按钮上 → 不再产生 mousemove，计时器到点仍会置 dim；CSS hover 必须兜住
    const readBox = await readBtn.boundingBox()
    await page.mouse.move(readBox.x + readBox.width / 2, readBox.y + readBox.height / 2)
    await sleep(2000)
    const stillHover = await opacityOf(page)
    check('指针静止悬停 2s 不变暗（F1：CSS hover 兜住 CSS 类里的 dim）', stillHover?.op === '1', `opacity=${stillHover?.op}`)

    // 键盘聚焦：Tab 走到该按钮（真实键盘路径，保证 :focus-visible 命中），
    // 再静置 2s 让计时器重新把 dim 置真 —— 此时只有 focus-visible 覆写能保持不透明。
    await page.mouse.move(5, 5)
    await sleep(200)
    let focused = false
    for (let i = 0; i < 90 && !focused; i++) {
      await page.keyboard.press('Tab')
      focused = await page.evaluate(() => document.activeElement?.getAttribute('title') === '进入阅读 Ctrl+E')
    }
    const fv = await page.evaluate(() => ({
      matches: document.activeElement?.matches(':focus-visible') ?? false,
      op: document.activeElement ? getComputedStyle(document.activeElement).opacity : null
    }))
    check('Tab 键可达阅读开关（键盘路径成立）', focused, `focused=${focused}`)
    check('键盘聚焦命中 :focus-visible', fv.matches, `matches=${fv.matches}`)
    await sleep(2000)
    const focusOp = await page.evaluate(() => (document.activeElement ? getComputedStyle(document.activeElement).opacity : null))
    check('键盘聚焦期间静置 2s 不变暗（focus-visible 覆写）', focusOp === '1', `opacity=${focusOp}`)
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await sleep(200)

    // ---- Ctrl+E 编辑 ⇄ 阅读 ----
    const editFont = await page.evaluate(() => getComputedStyle(document.querySelector('.ak-editor')).fontSize)
    await page.keyboard.press('Control+e')
    await sleep(900)
    a = await attrs(page)
    const readState = await page.evaluate(() => ({
      hasToc: !!document.querySelector('aside'),
      tocText: document.querySelector('aside')?.textContent?.slice(0, 12) ?? null,
      hasCm: !!document.querySelector('.cm-editor'),
      editorEditable: document.querySelector('.ak-editor [contenteditable]')?.getAttribute('contenteditable') ?? null,
      font: getComputedStyle(document.querySelector('.ak-editor')).fontSize
    }))
    check('Ctrl+E 进入阅读态（data-mode=read）', a.mode === 'read', JSON.stringify(a))
    check('阅读态左侧出现大纲', readState.hasToc && (readState.tocText ?? '').includes('大纲'), readState.tocText)
    check('阅读态正文不可编辑（contenteditable=false）', readState.editorEditable === 'false', JSON.stringify(readState))
    check(
      `阅读态排版生效（15px，编辑态为 ${editFont}）`,
      readState.font === '15px' && editFont !== '15px',
      `read=${readState.font} edit=${editFont}`
    )

    await sleep(1200)
    let st = await readSettings(profile)
    check('进入阅读时 readMode=true 已写入 settings.json', st.layout?.readMode === true, JSON.stringify(st.layout ?? null))

    // ---- 阅读态跨笔记保持 ----
    await page.getByRole('button', { name: /LRU/ }).first().click()
    await sleep(1600)
    a = await attrs(page)
    check('readMode=true 时打开另一篇笔记直接进阅读态（跨笔记保持）', a.mode === 'read', JSON.stringify(a))

    // ---- N4：阅读态按 Ctrl+/ 也必须把 readMode 写回 false ----
    await page.keyboard.press('Control+/')
    await sleep(900)
    a = await attrs(page)
    let s = await srcBtnProbe(page)
    check(
      '阅读态按 Ctrl+/ → 回到编辑态并进入源码模式',
      a.mode === 'edit' && a.source === '1' && s.hasCm === true,
      JSON.stringify({ attrs: a, cm: s.hasCm })
    )
    await sleep(1300)
    st = await readSettings(profile)
    check('阅读 → 源码 的转变写回了 readMode=false（N4 分支）', st.layout?.readMode === false, JSON.stringify(st.layout ?? null))

    // 回到 WYSIWYG 编辑态继续
    await page.keyboard.press('Control+/')
    await sleep(900)
    a = await attrs(page)
    check('Ctrl+/ 切回所见即所得（data-source=0）', a.source === '0' && (await srcBtnProbe(page)).hasCm === false, JSON.stringify(a))

    // ---- 状态栏 `</>` ----
    s = await srcBtnProbe(page)
    check('状态栏最左出现 `</>` 按钮', s.hasFooter && s.hasBtn && s.isFirst, JSON.stringify({ hasBtn: s.hasBtn, isFirst: s.isFirst }))
    check('编辑态 `</>` 可用且提示「源码模式 Ctrl+/」', s.disabled === false && s.title === '源码模式 Ctrl+/', JSON.stringify({ d: s.disabled, t: s.title }))

    await page.locator('footer button:has-text("</>")').click()
    await sleep(900)
    a = await attrs(page)
    s = await srcBtnProbe(page)
    check('点击 `</>` 切到 CodeMirror 且 data-source=1', s.hasCm === true && a.source === '1', JSON.stringify({ cm: s.hasCm, attrs: a }))
    await page.keyboard.press('Control+/')
    await sleep(900)
    a = await attrs(page)
    check('Ctrl+/ 切回 WYSIWYG（data-source=0）', a.source === '0', JSON.stringify(a))

    // 源码态 Ctrl+E → 阅读态（两者互斥）
    await page.keyboard.press('Control+/')
    await sleep(900)
    await page.keyboard.press('Control+e')
    await sleep(900)
    a = await attrs(page)
    s = await srcBtnProbe(page)
    check('源码态按 Ctrl+E 进阅读态且 data-source 归 0（阅读与源码互斥）', a.mode === 'read' && a.source === '0', JSON.stringify(a))
    check(
      '阅读态 `</>` 置灰且提示「阅读态不可用，按 Ctrl+E 回到编辑」',
      s.disabled === true && s.title === '阅读态不可用，按 Ctrl+E 回到编辑',
      JSON.stringify({ d: s.disabled, t: s.title })
    )
    await page.keyboard.press('Control+e')
    await sleep(900)

    // ---- 隐藏状态栏 → 悬浮 `</>` ----
    await page.getByRole('button', { name: '视图', exact: true }).click()
    await sleep(300)
    await page.getByRole('button', { name: /显示状态栏/ }).click()
    await sleep(900)
    const floating = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '</>')
      return {
        hasFooter: !!document.querySelector('footer'),
        exists: !!b,
        floating: b ? b.className.includes('absolute') : false,
        inSection: b ? !!b.closest('section') : false,
        bottomGap: b ? Math.round(b.closest('section').getBoundingClientRect().bottom - b.getBoundingClientRect().bottom) : null
      }
    })
    check('关闭状态栏后 `</>` 悬浮在编辑区左下角（编辑态）', floating.hasFooter === false && floating.exists && floating.floating && floating.inSection, JSON.stringify(floating))
    await page.getByRole('button', { name: '视图', exact: true }).click()
    await sleep(300)
    await page.getByRole('button', { name: /显示状态栏/ }).click()
    await sleep(900)
    check('重新打开状态栏恢复', await page.evaluate(() => !!document.querySelector('footer')))

    // ---- 三个根属性随状态切换 ----
    a = await attrs(page)
    check('收尾根属性 edit / 0 / 0 一致', a.mode === 'edit' && a.source === '0' && a.focus === '0', JSON.stringify(a))
  } finally {
    await app.close()
  }

  // data-focus 的另一半：focusMode 无 UI 入口，用预置 layout 驱动根属性（真实接线验证）
  const { app: app2, page: page2 } = await openApp({ theme: 'dark', layout: { focusMode: true }, size: [1500, 1000] })
  try {
    const a2 = await attrs(page2)
    const chrome = await page2.evaluate(() => ({
      rails: document.querySelectorAll('button[title^="展开"]').length,
      separators: document.querySelectorAll('[role="separator"]').length,
      main: Math.round(document.querySelector('main').getBoundingClientRect().width)
    }))
    check("focusMode=true 时根属性 data-focus='1'", a2.focus === '1', JSON.stringify(a2))
    check('focusMode=true 时两侧均不渲染面板/分隔条', chrome.rails === 0 && chrome.separators === 0, JSON.stringify(chrome))
  } finally {
    await app2.close()
  }
})

// ============================================================================
// D. 复习统计（真机端到端；T6 只做过假后端打桩）
// ============================================================================
await runSection('D 复习统计', async () => {
  const { app, page } = await openApp({ theme: 'dark', size: [1500, 1000] })
  try {
    // 取右栏「复习统计」区块的文本：label <p> 的下一个兄弟
    const statsText = () =>
      page.evaluate(() => {
        const label = [...document.querySelectorAll('p')].find((x) => x.textContent === '复习统计')
        return label?.nextElementSibling?.textContent ?? null
      })

    await openNote(page, /调度完整/)
    let txt = await statsText()
    const wantMain =
      '整题卡' + '　' + '上次 2026-09-08 · 下次 2026-09-15 · 重复 4 · EF 2.36 · 忘记 1'
    const wantSplit = '拆卡' + '　　' + '2 张（最近到期 2026-09-18）'
    check(
      '有 scheduling.main 时右栏显示整题卡上次/下次/重复/EF/忘记',
      txt !== null && txt.includes(wantMain),
      JSON.stringify(txt)
    )
    check('有 scheduling.cards 时右栏显示拆卡张数与最近到期', txt !== null && txt.includes(wantSplit), JSON.stringify(txt))

    await openNote(page, /无调度/)
    txt = await statsText()
    check('无 scheduling 的笔记显示「尚未复习（新卡）」', txt === '尚未复习（新卡）', JSON.stringify(txt))

    await openNote(page, /调度残缺/)
    txt = await statsText()
    const noError = await page.evaluate(() => {
      const t = document.body.textContent ?? ''
      return !/TypeError|Cannot read|undefined is not|Uncaught/.test(t)
    })
    check('scheduling.main 缺 due 的笔记不抛错，显示为未复习', txt === '尚未复习（新卡）' && noError, JSON.stringify(txt))
    // 中栏标题是 input（textContent 读不到），改用右栏「来源 / ID」确认打开的确实是这篇
    const sourceId = await page.evaluate(() => {
      const label = [...document.querySelectorAll('p')].find((x) => x.textContent === '来源 / ID')
      return label?.nextElementSibling?.textContent ?? null
    })
    check('残缺笔记仍能正常打开（右栏来源/ID 指向该笔记）', sourceId === 'leetcode/sched-partial', JSON.stringify(sourceId))
  } finally {
    await app.close()
  }
})

// ============================================================================
// E. 源码模式（T10）
// ============================================================================
await runSection('E 源码模式', async () => {
  const { app, page } = await openApp({ theme: 'dark', size: [1600, 1000] })
  try {
    const insertText = async (t) => {
      await page.keyboard.insertText(t)
      await sleep(600)
    }
    /** 全量读取源码态文档（走剪贴板：.cm-content 的 textContent 只含视口内已渲染的行） */
    const readDoc = async () => {
      await page.locator('.cm-content').click()
      await sleep(200)
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Control+c')
      await sleep(300)
      return app.evaluate(({ clipboard }) => clipboard.readText())
    }
    const readWys = () => page.evaluate(() => document.querySelector('.ak-editor .ProseMirror')?.textContent ?? '')
    const varColor = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
    const rgb = (v) =>
      page.evaluate((val) => {
        const d = document.createElement('div')
        d.style.color = val
        document.body.appendChild(d)
        const c = getComputedStyle(d).color
        d.remove()
        return c
      }, v)
    const lineColors = (pred) =>
      page.evaluate((src) => {
        const fn = new Function('t', src)
        const line = [...document.querySelectorAll('.cm-line')].find((l) => fn(l.textContent ?? ''))
        if (!line) return null
        const spans = [...line.querySelectorAll('span')]
        return { text: (line.textContent ?? '').slice(0, 40), colors: [...new Set(spans.map((s) => getComputedStyle(s).color))] }
      }, pred)
    /** 编辑器 UI 配色：真实面板 + 注入同 class 的 tooltip 探针（tooltip 无法稳定自然触发） */
    const chromeProbe = () =>
      page.evaluate(() => {
        const g = (el) => (el ? getComputedStyle(el).backgroundColor : null)
        const gc = (el) => (el ? getComputedStyle(el).color : null)
        const cmEl = document.querySelector('.cm-editor')
        const tip = document.createElement('div')
        tip.className = 'cm-tooltip'
        const arrow = document.createElement('div')
        arrow.className = 'cm-tooltip-arrow'
        tip.appendChild(arrow)
        cmEl.appendChild(tip)
        const tipBg = getComputedStyle(tip).backgroundColor
        const arrowBefore = getComputedStyle(arrow, ':before').borderTopColor
        const arrowAfter = getComputedStyle(arrow, ':after').borderBottomColor
        tip.remove()
        return {
          editorBg: g(cmEl),
          editorFg: gc(cmEl),
          gutterFg: gc(document.querySelector('.cm-gutters')),
          activeLineBg: g(document.querySelector('.cm-activeLine')),
          selectionBg: g(document.querySelector('.cm-selectionLayer .cm-selectionBackground')),
          panelBg: g(document.querySelector('.cm-panels')),
          fieldBg: g(document.querySelector('.cm-textfield')),
          tooltipBg: tipBg,
          arrowBefore,
          arrowAfter
        }
      })
    /** 真实路径：把光标放进代码块，Ctrl+Space 触发自动补全 tooltip，读它的真实底色 */
    const realTooltipProbe = async () => {
      const pos = await page.evaluate(() => {
        const l = [...document.querySelectorAll('.cm-line')].find((x) => (x.textContent ?? '').includes('function twoSum'))
        if (!l) return null
        const r = l.getBoundingClientRect()
        return { x: r.left + 30, y: r.top + r.height / 2 }
      })
      if (!pos) return { found: false, reason: '未找到 function twoSum 行（可能不在视口内）' }
      await page.mouse.click(pos.x, pos.y)
      await sleep(300)
      await page.keyboard.press('Control+Space')
      // 原来是固定 sleep(1000)：补全源经 @codemirror/lang-javascript 的**动态 import**
      // 注册，冷缓存时可能超过 1s（慢机器上随机红）。改为轮询等 tooltip 出现，超时才算失败。
      const out = await pollUntil(
        () =>
          page.evaluate(() => {
            const t = document.querySelector('.cm-tooltip')
            if (!t) return null
            return { found: true, cls: t.className, bg: getComputedStyle(t).backgroundColor, hasArrow: !!t.querySelector('.cm-tooltip-arrow') }
          }),
        (v) => v !== null,
        4000
      ) ?? { found: false }
      await page.keyboard.press('Escape')
      await sleep(300)
      return out
    }

    await openNote(page, 'Two Sum 两数之和')

    // ===== E1 进入源码：焦点 / 不点击即可交互（F2）=====
    await page.locator('.ak-editor .ProseMirror').click() // 焦点先在 ProseMirror
    await sleep(300)
    await page.keyboard.press('Control+/')
    await sleep(1200)
    let a = await attrs(page)
    check('Ctrl+/ 进入源码模式（data-source=1）', a.source === '1', JSON.stringify(a))

    const focusDesc = await activeCls(page)
    check('进入源码模式后编辑器自动获焦（activeElement 落在 .cm-content）', focusDesc.startsWith('div.cm-content'), `activeElement = ${focusDesc}`)

    const cm = await page.evaluate(() => ({
      hasCm: !!document.querySelector('.cm-editor'),
      hasBareTextarea: !!document.querySelector('section textarea'),
      hasGutters: !!document.querySelector('.cm-gutters'),
      hasLineNumbers: !!document.querySelector('.cm-gutters .cm-lineNumbers'),
      lineNumberCount: document.querySelectorAll('.cm-gutters .cm-lineNumbers .cm-gutterElement').length,
      hasActiveLine: !!document.querySelector('.cm-activeLine'),
      hasActiveGutter: !!document.querySelector('.cm-activeLineGutter'),
      hasAkPage: !!document.querySelector('section .ak-page')
    }))
    check('源码模式渲染 .cm-editor，裸 textarea 已移除', cm.hasCm && cm.hasBareTextarea === false, JSON.stringify({ cm: cm.hasCm, ta: cm.hasBareTextarea }))
    check(
      '显示行号 gutter（.cm-gutters .cm-lineNumbers）',
      cm.hasLineNumbers && cm.lineNumberCount > 3,
      `gutters=${cm.hasGutters} lineNumbers=${cm.hasLineNumbers} 行号元素 ${cm.lineNumberCount} 个`
    )
    check('当前行高亮（.cm-activeLine + .cm-activeLineGutter）', cm.hasActiveLine && cm.hasActiveGutter, JSON.stringify({ l: cm.hasActiveLine, g: cm.hasActiveGutter }))
    check('R8：源码模式不套用 .ak-page 限宽', cm.hasAkPage === false, `section 内 .ak-page = ${cm.hasAkPage}`)

    // F2 严格路径：从进入源码到断言完成，全程**不用鼠标点击**。
    // 焦点唯一来源是 mount 时的 view.focus()；打字与 Ctrl+F 都靠它。
    await page.keyboard.press('Control+End')
    await insertText('AKFOCUS')
    await page.keyboard.press('Control+f')
    await sleep(800)
    let f = await findProbe(page)
    check(
      'F2：进入源码模式后「不点击直接 Ctrl+F」弹出 CodeMirror 搜索面板（非应用对话框）',
      f.cmSearch === true && f.dialog === false,
      JSON.stringify(f)
    )
    // 面板没出现时不硬等（否则 fill 超时会抛错、整节中断，后面所有断言都跑不到，
    // 判别性自证就没法看到「目标断言之外还有什么跟着红」）。断言本身不受影响。
    const searchInput = page.locator('.cm-search input').first()
    let searchValue = null
    if (await searchInput.count()) {
      await searchInput.fill('twoSum')
      await sleep(400)
      searchValue = await searchInput.inputValue()
    }
    f = await findProbe(page)
    // 关键词必须真的进了搜索框：只复述上一条的 cmSearch===true 等于没有断言
    check('搜索面板可输入关键词（关键词真的进入搜索框且面板保持）', f.cmSearch === true && searchValue === 'twoSum', JSON.stringify({ ...f, value: searchValue }))
    await page.keyboard.press('Escape')
    await sleep(400)
    check('F2：进入源码模式后「不点击直接打字」生效', (await readDoc()).includes('AKFOCUS'), '文档含 AKFOCUS')

    // ===== E2 F8：源码态下菜单「查找和替换 → 查找…」不得打开应用对话框 =====
    await openFindFromMenu(page)
    f = await findProbe(page)
    check('F8：源码态下菜单「查找和替换 → 查找…」不打开应用对话框', f.dialog === false, JSON.stringify(f))
    await closeMenus(page)

    // ===== E3 语法高亮（F4）=====
    const darkVars = {
      bg: await rgb(await varColor('--ak-src-bg')),
      fg: await rgb(await varColor('--ak-src-fg')),
      gutter: await rgb(await varColor('--ak-src-gutter-fg')),
      activeLine: await rgb(await varColor('--ak-src-active-line')),
      selection: await rgb(await varColor('--ak-src-selection')),
      panel: await rgb(await varColor('--ak-src-panel-bg')),
      field: await rgb(await varColor('--ak-src-field-bg')),
      heading: await rgb(await varColor('--ak-src-heading')),
      keyword: await rgb(await varColor('--ak-src-keyword')),
      operator: await rgb(await varColor('--ak-src-operator')),
      label: await rgb(await varColor('--ak-src-label'))
    }
    const headingLine = await lineColors('return t.includes("# Two Sum 两数之和")')
    check(
      'Markdown 标题行着色（命中 --ak-src-heading 且 ≠ 正文前景色）',
      headingLine !== null && headingLine.colors.includes(darkVars.heading) && darkVars.heading !== darkVars.fg,
      `colors=${JSON.stringify(headingLine?.colors)} expect=${darkVars.heading}`
    )
    const codeLine = await lineColors('return t.includes("function twoSum")')
    check('```ts 围栏内嵌语言高亮：关键字命中 --ak-src-keyword', codeLine !== null && codeLine.colors.includes(darkVars.keyword), `colors=${JSON.stringify(codeLine?.colors)}`)
    const fenceLine = await lineColors('return t.trim().startsWith("```ts")')
    check('F4：围栏语言标签 ts 着色（命中 --ak-src-label）', fenceLine !== null && fenceLine.colors.includes(darkVars.label), `colors=${JSON.stringify(fenceLine?.colors)} expect=${darkVars.label}`)
    const opLine = await lineColors('return t.includes("i++)")')
    check('F4：代码块内运算符着色（命中 --ak-src-operator）', opLine !== null && opLine.colors.includes(darkVars.operator), `colors=${JSON.stringify(opLine?.colors)} expect=${darkVars.operator}`)

    // ===== E4 深色下的小部件配色 =====
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+a')
    await sleep(400)
    let chrome = await chromeProbe(page)
    check('F5 深色：选中色 === --ak-src-selection', chrome.selectionBg === darkVars.selection, `got=${chrome.selectionBg} expect=${darkVars.selection}`)
    check('深色：当前行 / 行号配色正常', chrome.activeLineBg === darkVars.activeLine && chrome.gutterFg === darkVars.gutter, `activeLine=${chrome.activeLineBg} gutter=${chrome.gutterFg}`)
    await page.keyboard.press('ArrowRight')
    await sleep(200)
    await page.keyboard.press('Control+f')
    await sleep(700)
    chrome = await chromeProbe(page)
    check('F6 深色：搜索面板底色 === --ak-src-panel-bg', chrome.panelBg === darkVars.panel, `got=${chrome.panelBg}`)
    check('F6 深色：搜索输入框底色 === --ak-src-field-bg', chrome.fieldBg === darkVars.field, `got=${chrome.fieldBg}`)
    check('F6 深色：tooltip 底色 === --ak-src-panel-bg', chrome.tooltipBg === darkVars.panel, `got=${chrome.tooltipBg}`)
    check(
      'N1 深色：tooltip 箭头与气泡同色（非基础主题 &dark 写死的 #333338）',
      chrome.arrowBefore === darkVars.panel && chrome.arrowAfter === darkVars.panel,
      `before=${chrome.arrowBefore} after=${chrome.arrowAfter}`
    )
    await page.keyboard.press('Escape')
    await sleep(400)
    const darkRealTip = await realTooltipProbe()
    check('F6 深色（真实路径）：Ctrl+Space 自动补全 tooltip 底色 === --ak-src-panel-bg', darkRealTip.found === true && darkRealTip.bg === darkVars.panel, JSON.stringify(darkRealTip))

    // ===== E5 双向切换内容不丢 =====
    const MARK_S = 'AKSRCMARK10'
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText(MARK_S)
    check('源码模式中输入的标记已进入编辑器文档', (await readDoc()).includes(MARK_S), '文档含 AKSRCMARK10')

    await page.keyboard.press('Control+/')
    await sleep(1400)
    a = await attrs(page)
    const wys1 = await readWys()
    check('源码 → WYSIWYG：改动被保留', a.source === '0' && wys1.includes(MARK_S), JSON.stringify({ source: a.source, has: wys1.includes(MARK_S) }))
    check('dirty 指示出现（状态栏含「未保存」或「有未保存修改」）', await page.evaluate(() => /未保存/.test(document.body.textContent ?? '')))

    const MARK_W = 'AKWYSMARK10'
    await page.locator('.ak-editor .ProseMirror p').last().click()
    await sleep(250)
    await page.keyboard.press('End')
    await sleep(600)
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText(MARK_W)
    check('WYSIWYG 中键入的标记确实进入 ProseMirror 文档', (await readWys()).includes(MARK_W))
    await page.keyboard.press('Control+/')
    await sleep(1400)
    const srcDoc2 = await readDoc()
    check('WYSIWYG → 源码：ProseMirror 的改动出现在 CodeMirror 文档', srcDoc2.includes(MARK_W), `含 ${MARK_W} = ${srcDoc2.includes(MARK_W)}`)
    check('双向切换后两侧改动同时存在（内容不丢）', srcDoc2.includes(MARK_S) && srcDoc2.includes(MARK_W))
    await page.keyboard.press('Control+s')
    await sleep(1600)
    const savedFile = await fs.readFile(join(srcDir, 'two-sum.md'), 'utf8')
    check('两个标记均已落盘（以 .md 文件为准，排除渲染层假象）', savedFile.includes(MARK_S) && savedFile.includes(MARK_W))

    // ===== E6 切笔记 + Ctrl+Z 不得回退成上一篇（源码侧）=====
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText('AKNOTEA')
    check('（前置）two-sum 源码文档已含 AKNOTEA', (await readDoc()).includes('AKNOTEA'))

    await page.getByRole('button', { name: /LRU/ }).first().click()
    await sleep(1800)
    a = await attrs(page)
    const afterSwitch = await page.evaluate(() => ({ cm: !!document.querySelector('.cm-editor') }))
    // 规格 §4.1：source 是会话内临时态，任何模式切换（含切笔记）都清零 —— 断言的是
    // 「与规格一致」，不是「记录现状」
    check('切笔记后源码模式归零且 CodeMirror 卸载（规格 §4.1：source 为会话内临时态）', a.source === '0' && afterSwitch.cm === false, JSON.stringify({ ...a, cm: afterSwitch.cm }))

    // 重新进源码：焦点由 mount 时的 view.focus() 提供，全程不点击
    await page.keyboard.press('Control+/')
    await sleep(1400)
    const focusDesc2 = await activeCls(page)
    await insertText('X')
    await sleep(200)
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Control+z')
      await sleep(300)
    }
    const afterUndo = await readDoc()
    check('切笔记后敲字 + Ctrl+Z 不回退成上一篇正文（源码侧不含 AKNOTEA）', !afterUndo.includes('AKNOTEA'), `含 AKNOTEA = ${afterUndo.includes('AKNOTEA')}`)
    check('文档仍是当前笔记（含 LRU 正文）', afterUndo.includes('LRU Cache'), `含 LRU Cache = ${afterUndo.includes('LRU Cache')}`)
    check('切笔记后重新进源码仍自动获焦（不点击即可打字）', focusDesc2.startsWith('div.cm-content'), `activeElement = ${focusDesc2}`)
    await page.keyboard.press('Control+s')
    await sleep(1600)
    const lruFile = await fs.readFile(join(srcDir, 'lru-cache.md'), 'utf8')
    check('存盘后 lru-cache.md 未被写入上一篇正文（不含 AKNOTEA）', !lruFile.includes('AKNOTEA'), `含 AKNOTEA = ${lruFile.includes('AKNOTEA')}`)
    check('lru-cache.md 内容仍是本笔记', lruFile.includes('LRU Cache'))

    // 用户键入本身仍可撤销
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText('AKUNDO')
    const hasUndoMark = (await readDoc()).includes('AKUNDO')
    await page.keyboard.press('Control+z')
    await sleep(500)
    check('用户键入本身仍可撤销（Ctrl+Z 撤掉 AKUNDO，历史未被整体关掉）', hasUndoMark && !(await readDoc()).includes('AKUNDO'), `键入前存在=${hasUndoMark}`)

    // ===== E7 滚动比例双向对齐 + 模式绕行归零 =====
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 620))
    await sleep(900)

    await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * 0.7)
    })
    await sleep(600)
    const srcRatio = await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      const max = sc.scrollHeight - sc.clientHeight
      return { max, ratio: max > 0 ? sc.scrollTop / max : 0 }
    })
    check('（前置）源码侧已滚到 0.7（可滚动量足够，否则本组断言无意义）', srcRatio.max > 50 && Math.abs(srcRatio.ratio - 0.7) < 0.05, `max=${srcRatio.max} ratio=${srcRatio.ratio.toFixed(3)}`)
    await page.keyboard.press('Control+/')
    await sleep(1800)
    const wysRatio = await page.evaluate(() => {
      const el = document.querySelector('.ak-scroll')
      const max = el.scrollHeight - el.clientHeight
      return { max, top: el.scrollTop, ratio: max > 0 ? el.scrollTop / max : 0 }
    })
    check(
      '源码 → WYSIWYG 按滚动百分比恢复（不跳回顶部，±0.06）',
      wysRatio.max > 50 && wysRatio.ratio > 0.1 && Math.abs(wysRatio.ratio - srcRatio.ratio) < 0.06,
      `源码 ${srcRatio.ratio.toFixed(3)} → WYS ${wysRatio.ratio.toFixed(3)}（max=${wysRatio.max}）`
    )

    await page.evaluate(() => {
      const el = document.querySelector('.ak-scroll')
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.25)
    })
    await sleep(600)
    const wysRatio2 = await page.evaluate(() => {
      const el = document.querySelector('.ak-scroll')
      const max = el.scrollHeight - el.clientHeight
      return { max, ratio: max > 0 ? el.scrollTop / max : 0 }
    })
    await page.keyboard.press('Control+/')
    await sleep(1800)
    const backSrc = await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      const max = sc.scrollHeight - sc.clientHeight
      return { max, top: sc.scrollTop, ratio: max > 0 ? sc.scrollTop / max : 0 }
    })
    check(
      'WYSIWYG → 源码 按滚动百分比恢复（不跳回顶部，±0.06）',
      backSrc.ratio > 0.06 && Math.abs(backSrc.ratio - wysRatio2.ratio) < 0.06,
      `WYS ${wysRatio2.ratio.toFixed(3)} → 源码 ${backSrc.ratio.toFixed(3)}（max=${backSrc.max}）`
    )

    // 模式绕行（源码 → 阅读 → 编辑 → 源码）必须归零比例
    await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * 0.8)
    })
    await sleep(600)
    const detourBefore = await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      const max = sc.scrollHeight - sc.clientHeight
      return { max, ratio: max > 0 ? sc.scrollTop / max : 0 }
    })
    check('（前置）源码侧已滚到 0.8', detourBefore.max > 50 && detourBefore.ratio > 0.7, `ratio=${detourBefore.ratio.toFixed(3)}`)
    await page.keyboard.press('Control+e')
    await sleep(1000)
    await page.keyboard.press('Control+e')
    await sleep(1300)
    await page.keyboard.press('Control+/')
    await sleep(1600)
    const detourAfter = await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      const max = sc.scrollHeight - sc.clientHeight
      return { max, top: sc.scrollTop, ratio: max > 0 ? sc.scrollTop / max : 0 }
    })
    check(
      '模式绕行（源码 → 阅读 → 编辑 → 源码）不继承绕行前的滚动比例（回到顶部附近）',
      detourAfter.ratio < 0.15,
      `绕行前 ${detourBefore.ratio.toFixed(3)} → 绕行后 ${detourAfter.ratio.toFixed(3)}（top=${detourAfter.top}）`
    )

    // ===== E8 切笔记 + Ctrl+Z 不得跨笔记回退（WYSIWYG 侧，落盘复核）=====
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000))
    await sleep(700)
    await page.keyboard.press('Control+/')
    await sleep(1500)
    a = await attrs(page)
    check('（前置）已在 WYSIWYG（lru-cache）', a.source === '0' && a.mode === 'edit', JSON.stringify(a))

    const WYS_MARK = 'AKPREVNOTE'
    await page.locator('.ak-editor .ProseMirror p').last().click()
    await sleep(250)
    await page.keyboard.press('End')
    await sleep(600)
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText(WYS_MARK)
    check('（前置）lru-cache 的 WYSIWYG 正文已含 AKPREVNOTE', (await readWys()).includes(WYS_MARK))

    await page.getByRole('button', { name: 'Two Sum 两数之和' }).first().click()
    await sleep(600)
    await page.locator('.ak-editor .ProseMirror').click()
    await sleep(200)
    // 只按**一次** Ctrl+Z —— 这就是「回退一步」的用户动作，也是这条断言的判别力所在：
    // 编辑器若按笔记重挂载（key={noteId}），新实例历史为空，这一次撤销无事发生；
    // 若不重挂载，一次撤销会把 setContent 那次事务回退掉、整篇变回上一篇正文。
    // （实测教训：原先连按 3 次会「撤过头」——第 1 次退回上一篇、第 2 次把上一篇里
    //  我们自己插入的标记也撤掉，于是缺陷存在时断言反而变绿。）
    await page.keyboard.press('Control+z')
    await sleep(350)
    const afterCrossUndo = await readWys()
    check(
      '切笔记后 Ctrl+Z 不回退成上一篇正文（WYSIWYG 既不含 AKPREVNOTE、仍是本笔记正文）',
      !afterCrossUndo.includes(WYS_MARK) && afterCrossUndo.includes('Two Sum'),
      `含 AKPREVNOTE = ${afterCrossUndo.includes(WYS_MARK)} / 含 Two Sum = ${afterCrossUndo.includes('Two Sum')}`
    )

    await page.keyboard.press('Control+s')
    await sleep(1600)
    const twoSumFile = await fs.readFile(join(srcDir, 'two-sum.md'), 'utf8')
    check('切笔记 + Ctrl+Z 后存盘：two-sum.md 未被写入上一篇正文（不含 AKPREVNOTE）', !twoSumFile.includes(WYS_MARK), `含 AKPREVNOTE = ${twoSumFile.includes(WYS_MARK)}`)
    check('存盘后 two-sum.md 内容仍是本笔记', twoSumFile.includes('Two Sum'))

    // ===== E9 切主题：不重建 + 滚动不丢 + 配色跟随 + 浅色小部件 =====
    await page.keyboard.press('Control+/')
    await sleep(1500)
    a = await attrs(page)
    check('（前置）已在源码态（two-sum），供切主题结构检查', a.source === '1', JSON.stringify(a))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 620))
    await sleep(900)
    const beforeTheme = await page.evaluate(() => {
      const sc = document.querySelector('.cm-scroller')
      sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * 0.45)
      const cmEl = document.querySelector('.cm-editor')
      cmEl.__akProbe = 'verify-workbench'
      return { top: sc.scrollTop, bg: getComputedStyle(cmEl).backgroundColor, fg: getComputedStyle(cmEl).color }
    })
    await page.getByRole('button', { name: '主题', exact: true }).click()
    await sleep(400)
    await page.getByRole('button', { name: /界面主题/ }).click()
    await sleep(400)
    await page.getByRole('button', { name: /GitHub 浅色/ }).click()
    await sleep(1600)
    const afterTheme = await page.evaluate(() => {
      const cmEl = document.querySelector('.cm-editor')
      const sc = document.querySelector('.cm-scroller')
      return {
        theme: document.documentElement.dataset.theme,
        sameNode: cmEl?.__akProbe ?? null,
        cmCount: document.querySelectorAll('.cm-editor').length,
        top: sc?.scrollTop ?? null,
        bg: cmEl ? getComputedStyle(cmEl).backgroundColor : null,
        fg: cmEl ? getComputedStyle(cmEl).color : null
      }
    })
    check('切到 light-github（data-theme 变更）', afterTheme.theme === 'light-github', `theme=${afterTheme.theme}`)
    check('切主题后编辑器未被重建（同一 .cm-editor 节点，且仅一个实例）', afterTheme.sameNode === 'verify-workbench' && afterTheme.cmCount === 1, `marker=${afterTheme.sameNode} cmCount=${afterTheme.cmCount}`)
    check('切主题后源码模式配色跟随（背景/前景变化）', afterTheme.bg !== beforeTheme.bg && afterTheme.fg !== beforeTheme.fg, `bg ${beforeTheme.bg}→${afterTheme.bg}`)
    check('切主题后滚动位置未丢', afterTheme.top === beforeTheme.top, `scrollTop ${beforeTheme.top} → ${afterTheme.top}`)

    const lightVars = {
      panel: await rgb(await varColor('--ak-src-panel-bg')),
      field: await rgb(await varColor('--ak-src-field-bg')),
      selection: await rgb(await varColor('--ak-src-selection')),
      activeLine: await rgb(await varColor('--ak-src-active-line')),
      gutter: await rgb(await varColor('--ak-src-gutter-fg')),
      quote: await rgb(await varColor('--ak-src-quote')),
      heading: await rgb(await varColor('--ak-src-heading')),
      keyword: await rgb(await varColor('--ak-src-keyword')),
      label: await rgb(await varColor('--ak-src-label')),
      operator: await rgb(await varColor('--ak-src-operator'))
    }
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+a')
    await sleep(400)
    let lightChrome = await chromeProbe(page)
    check('F5 浅色：选中色 === --ak-src-selection', lightChrome.selectionBg === lightVars.selection, `got=${lightChrome.selectionBg}`)
    check('浅色：当前行 / 行号配色正常', lightChrome.activeLineBg === lightVars.activeLine && lightChrome.gutterFg === lightVars.gutter, `activeLine=${lightChrome.activeLineBg}`)
    await page.keyboard.press('ArrowRight')
    await sleep(200)
    await page.keyboard.press('Control+f')
    await sleep(700)
    lightChrome = await chromeProbe(page)
    check('F6 浅色：搜索面板底色 === --ak-src-panel-bg（未露出深色 UI）', lightChrome.panelBg === lightVars.panel, `got=${lightChrome.panelBg}`)
    check('F6 浅色：搜索输入框底色 === --ak-src-field-bg', lightChrome.fieldBg === lightVars.field, `got=${lightChrome.fieldBg}`)
    check('F6 浅色：tooltip 底色 === --ak-src-panel-bg', lightChrome.tooltipBg === lightVars.panel, `got=${lightChrome.tooltipBg}`)
    check(
      'N1 浅色：.cm-tooltip-arrow 箭头色 === 气泡色（消除浅色气泡 + 深灰箭头接缝）',
      lightChrome.arrowBefore === lightVars.panel && lightChrome.arrowAfter === lightVars.panel,
      `before=${lightChrome.arrowBefore} after=${lightChrome.arrowAfter}`
    )
    await page.keyboard.press('Escape')
    await sleep(300)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000))
    await sleep(800)
    await page.evaluate(() => {
      document.querySelector('.cm-scroller').scrollTop = 0
    })
    await sleep(600)
    const lightRealTip = await realTooltipProbe()
    check('F6 浅色（真实路径）：Ctrl+Space 自动补全 tooltip 底色 === --ak-src-panel-bg', lightRealTip.found === true && lightRealTip.bg === lightVars.panel, JSON.stringify(lightRealTip))

    const fenceLineLight = await lineColors('return t.trim().startsWith("```ts")')
    const codeLineLight = await lineColors('return t.includes("function twoSum")')
    const opLineLight = await lineColors('return t.includes("i++)")')
    const headingLight = await lineColors('return t.includes("# Two Sum 两数之和")')
    check('F4：切主题后围栏语言标签仍着色（浅色 --ak-src-label）', fenceLineLight !== null && fenceLineLight.colors.includes(lightVars.label), `colors=${JSON.stringify(fenceLineLight?.colors)}`)
    check('F4：切主题后代码块关键字仍着色（浅色 --ak-src-keyword）', codeLineLight !== null && codeLineLight.colors.includes(lightVars.keyword), `colors=${JSON.stringify(codeLineLight?.colors)}`)
    check('F4：切主题后运算符仍着色（浅色 --ak-src-operator）', opLineLight !== null && opLineLight.colors.includes(lightVars.operator), `colors=${JSON.stringify(opLineLight?.colors)}`)
    check('切主题后 Markdown 标题色跟随（命中浅色 --ak-src-heading）', headingLight !== null && headingLight.colors.includes(lightVars.heading), `colors=${JSON.stringify(headingLight?.colors)}`)

    // N2：不可见字符占位配色（软连字符 U+00AD 在 CodeMirror 的 Specials 区间内；NBSP 不在）
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+End')
    await sleep(400)
    await insertText(String.fromCharCode(0xad))
    await sleep(700)
    const special = await page.evaluate(() => {
      const el = document.querySelector('.cm-specialChar')
      return el ? getComputedStyle(el).color : null
    })
    check(
      'N2 浅色：.cm-specialChar 走变量（=== --ak-src-quote，非基础主题 &dark 的 #f78）',
      special !== null && special === lightVars.quote,
      `got=${special} expect=${lightVars.quote}`
    )

    await page.getByRole('button', { name: '主题', exact: true }).click()
    await sleep(400)
    await page.getByRole('button', { name: /界面主题/ }).click()
    await sleep(400)
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await sleep(1400)
    const backDark = await page.evaluate(() => {
      const cmEl = document.querySelector('.cm-editor')
      return { theme: document.documentElement.dataset.theme, marker: cmEl?.__akProbe ?? null, bg: cmEl ? getComputedStyle(cmEl).backgroundColor : null }
    })
    check('切回深色：仍为同一节点、配色回到深色', backDark.theme === 'dark' && backDark.marker === 'verify-workbench' && backDark.bg === beforeTheme.bg, JSON.stringify(backDark))

    // ===== E10 Ctrl+F 路由（编辑 / 阅读）+ 源码态 Ctrl+B =====
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000))
    await sleep(800)
    await page.keyboard.press('Control+/')
    await sleep(1400)
    a = await attrs(page)
    check('Ctrl+/ 回到 WYSIWYG（data-source=0）', a.source === '0', JSON.stringify(a))
    await page.locator('.ak-editor .ProseMirror').click()
    await sleep(300)
    await page.keyboard.press('Control+f')
    await sleep(800)
    f = await findProbe(page)
    check('编辑态 Ctrl+F → 应用级查找替换对话框（非 .cm-search）', f.dialog === true && f.cmSearch === false, JSON.stringify(f))
    await page.keyboard.press('Escape')
    await sleep(500)

    await openFindFromMenu(page)
    f = await findProbe(page)
    check('F8 正对照：编辑态走同一菜单路径照常打开对话框（守卫是有条件的）', f.dialog === true, JSON.stringify(f))
    await page.keyboard.press('Escape')
    await sleep(500)
    await closeMenus(page)

    await page.keyboard.press('Control+e')
    await sleep(900)
    const readPage = await page.evaluate(() => ({
      mode: document.documentElement.dataset.mode,
      hasAkPage: !!document.querySelector('section .ak-page'),
      hasCm: !!document.querySelector('.cm-editor')
    }))
    check('阅读态仍套用 .ak-page 且无 CodeMirror（R8 未误伤）', readPage.mode === 'read' && readPage.hasAkPage === true && readPage.hasCm === false, JSON.stringify(readPage))
    await page.keyboard.press('Control+f')
    await sleep(800)
    f = await findProbe(page)
    check('阅读态 Ctrl+F 也走应用查找对话框', f.dialog === true && f.cmSearch === false, JSON.stringify(f))
    await page.keyboard.press('Escape')
    await sleep(500)
    await page.keyboard.press('Control+e')
    await sleep(800)

    await page.keyboard.press('Control+/')
    await sleep(1400)
    await page.locator('.cm-content').click()
    await sleep(250)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await sleep(600)
    await insertText('AKBOLD')
    await page.locator('.cm-content').click()
    await sleep(200)
    await page.keyboard.press('Control+b')
    await sleep(700)
    const boldAfter = await page.evaluate(() => ({
      cm: !!document.querySelector('.cm-editor'),
      wys: !!document.querySelector('section .ak-editor'),
      source: document.documentElement.dataset.source
    }))
    // 必须在按 Ctrl+B **之后**再读一次文档：原来读的是按之前的内容，
    // `!boldDoc.includes('**AKBOLD**')` 恒真，等于没有断言。
    const boldDocAfter = await readDoc()
    check(
      '源码模式 Ctrl+B 不触发 WYSIWYG 加粗（仍在 CodeMirror，无 .ak-editor，文档未被加上 ** 标记）',
      boldAfter.cm === true &&
        boldAfter.wys === false &&
        boldAfter.source === '1' &&
        boldDocAfter.includes('AKBOLD') &&
        !boldDocAfter.includes('**AKBOLD**'),
      JSON.stringify({ ...boldAfter, plain: boldDocAfter.includes('AKBOLD'), bolded: boldDocAfter.includes('**AKBOLD**') })
    )
  } finally {
    await app.close()
  }
})

// ============================================================================
// F. 静默丢字（C1）：程序性写窗被「每次上报都重新武装」时，窗口内紧随的用户键入
//    会被 onUpdate 直接吞掉、永不进入 active.md。
//    E 节的 insertText 后面固定 sleep(600)、openNote 固定 sleep(1500)，恰好都绕开了
//    这个 300ms 窗口 —— 所以 182/182 全绿也抓不到它。本节的共同前提是**零延迟**：
//    键入后立刻 Ctrl+S / Ctrl+/ / 读状态栏，中间不许有任何 sleep
//    （sleep 只用于等 UI 稳定，绝不用于掩盖竞态窗口）。
// ============================================================================
await runSection('F 静默丢字', async () => {
  const { app, page } = await openApp({ theme: 'dark', size: [1600, 1000] })
  try {
    const readWys = () => page.evaluate(() => document.querySelector('.ak-editor .ProseMirror')?.textContent ?? '')
    /** 全量读取源码态文档（走剪贴板：.cm-content 的 textContent 只含视口内已渲染的行） */
    const readSrcDoc = async () => {
      await page.locator('.cm-content').click()
      await sleep(200)
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Control+c')
      await sleep(300)
      return app.evaluate(({ clipboard }) => clipboard.readText())
    }
    const readNoteFile = async (name) => {
      try {
        return await fs.readFile(join(srcDir, name), 'utf8')
      } catch {
        return ''
      }
    }
    /**
     * 慢速敲入：**每字之间** 400ms（>300ms 写窗 ⇒ 每一字都被上报，并各自重新武装窗口）。
     * 注意末尾那字后面不能再 sleep —— 否则「上报后的重新武装」会在快速段到来前就过期，
     * 复现窗口消失（这正是原脚本用 sleep 掩盖竞态的反面教材）。
     */
    const typeSlow = async (text) => {
      for (let i = 0; i < text.length; i++) {
        if (i > 0) await sleep(400)
        await page.keyboard.insertText(text[i])
      }
    }
    /**
     * 快速段：慢速段结束后先等 FAST_GAP，让「上一字上报 → 重新武装」确实已经发生
     * （React passive effect 通常几毫秒），同时仍留在 300ms 窗口内；随后零延迟连打。
     * 修复前：这一串字全部被 onUpdate 吞掉（active.md 不再前进）；修复后：全部上报。
     */
    const FAST_GAP = 150
    const typeFast = async (text) => {
      await sleep(FAST_GAP)
      for (const ch of text) await page.keyboard.insertText(ch)
    }
    const SLOW_A = 'AKC1A'
    const SLOW_B = 'AKC1B'
    const FAST = 'ZZ'
    const statusText = () => page.evaluate(() => document.querySelector('footer')?.textContent ?? '')
    /**
     * 「打开笔记不得变脏」：等新笔记的编辑器挂载完并静置一拍再读状态栏。
     * 程序性写入（setContent / setEditable / 脚注转换）都在挂载后的 effect 里同步发生；
     * dirty 一旦被误报置真就会粘住（openNote 的 setDirty(false) 已经在挂载之前跑完），
     * 故静置后再读一次即可判定。
     */
    const assertNotDirty = async (label) => {
      await page.locator('.ak-editor .ProseMirror').waitFor({ timeout: 10000 })
      await sleep(700)
      const later = await statusText()
      check(label, !later.includes('有未保存修改'), JSON.stringify(later.slice(0, 32)))
    }

    // ---- 脚注转换的正对照：预检谓词（是否武装写窗）与转换谓词同源后仍必须生效 ----
    await openNote(page, /脚注验证/)
    const fn = await pollUntil(
      () =>
        page.evaluate(() => {
          const els = [...document.querySelectorAll('.ak-editor sup.ak-footnote')]
          return { count: els.length, firstRef: els[0]?.getAttribute('data-fn') ?? null }
        }),
      (v) => v.count > 0,
      3000
    )
    check('F 前置：文本 `[^1]` 仍被转成 Footnote 节点（预检谓词改造未破坏转换）', fn.count > 0 && fn.firstRef === '1', JSON.stringify(fn))
    // 脚注笔记打开时会真的 dispatch 一次转换事务：写窗武装必须早于 dispatch，
    // 否则这次程序性写入会被 onUpdate 收下 → 笔记刚打开就 dirty。
    await assertNotDirty('F 前置：含脚注 token 的笔记打开后不变脏（转换事务被写窗吞掉，武装早于 dispatch）')

    // ---- C1-a：慢速敲完立刻快速补字再 Ctrl+S → 补的字必须落盘 ----
    await openNote(page, 'Two Sum 两数之和')
    await page.keyboard.press('Control+s')
    await sleep(1400)
    await assertNotDirty('F 前置：打开普通笔记后不变脏（setContent/setEditable 的程序性写入未被误报）')
    await page.locator('.ak-editor .ProseMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await typeSlow(SLOW_A)
    await typeFast(FAST)
    await page.keyboard.press('Control+s') // 零延迟：紧跟快速段
    const savedHasFast = await pollUntil(
      async () => (await readNoteFile('two-sum.md')).includes(SLOW_A + FAST),
      (v) => v === true,
      5000
    )
    check(
      `C1-a 慢速敲完快速补字后立刻 Ctrl+S：补的字必须落盘（${SLOW_A}${FAST}）`,
      savedHasFast === true,
      `two-sum.md 含 ${SLOW_A}${FAST} = ${savedHasFast}`
    )

    // ---- C1-b：慢速敲完立刻快速补字再 Ctrl+/ → 源码文档不得吞掉刚打的字 ----
    await page.locator('.ak-editor .ProseMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await typeSlow(SLOW_B)
    await typeFast(FAST)
    await page.keyboard.press('Control+/') // 零延迟：紧跟快速段
    const srcDoc = await readSrcDoc()
    check(
      `C1-b 慢速敲完快速补字后立刻 Ctrl+/：源码文档必须含刚输入的字（${SLOW_B}${FAST}）`,
      srcDoc.includes(SLOW_B + FAST),
      `含 ${SLOW_B}${FAST} = ${srcDoc.includes(SLOW_B + FAST)}`
    )
    await page.keyboard.press('Control+/')
    await sleep(1500)
    const wysBack = await readWys()
    check(
      'C1-b 切回 WYSIWYG 后刚输入的字仍在（未被滞后 md 回灌覆盖）',
      wysBack.includes(SLOW_B + FAST),
      `含 ${SLOW_B}${FAST} = ${wysBack.includes(SLOW_B + FAST)}`
    )

    // ---- C1-c：切笔记后立刻敲字 → 不得「假绿」（状态栏已同步 + 保存菜单置灰）----
    // 编辑器每次重挂都会（修复前）无条件武装 300ms 写窗，挂载窗口内的键入被吞：
    // 编辑器里有这个字、active.md 里没有 —— 状态栏恒显示「已同步」、菜单「保存」置灰。
    const C1C_MARK = 'AKC1C'
    await page.getByRole('button', { name: /LRU/ }).first().click()
    await page.locator('.ak-editor .ProseMirror').focus()
    await page.keyboard.insertText(C1C_MARK) // 零延迟：不等待、不 sleep
    // dirty 一旦被吞就不会自愈（不会有第二次上报），故这里轮询读状态不削弱判别力
    const c1cStatus = await pollUntil(statusText, (t) => t.includes('有未保存修改'), 1500)
    const c1cDoc = await readWys()
    check(
      'C1-c 前置：零延迟键入确实进入了编辑器（否则本组无意义）',
      c1cDoc.includes(C1C_MARK),
      `编辑器含 ${C1C_MARK} = ${c1cDoc.includes(C1C_MARK)}`
    )
    check(
      'C1-c 切笔记后立刻敲字：状态栏不得显示「已同步」（键入未被静默吞掉）',
      c1cStatus.includes('有未保存修改') && !c1cStatus.includes('已同步'),
      JSON.stringify(c1cStatus.slice(0, 40))
    )
    await page.getByRole('button', { name: '文件', exact: true }).click()
    await sleep(400)
    const saveItem = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.querySelector('span')?.textContent === '保存')
      return b ? { disabled: b.disabled, label: b.textContent } : null
    })
    check('C1-c 保存菜单未置灰（dirty 为真，不是假绿）', saveItem !== null && saveItem.disabled === false, JSON.stringify(saveItem))
    await closeMenus(page)
    // 落盘复核：以 .md 文件为准 —— 键入真的进了 active.md 才可能被写进文件
    // （也排除「dirty 恰好被别的路径置真、状态栏断言侥幸通过」这一种假绿）
    await page.keyboard.press('Control+s')
    const c1cSaved = await pollUntil(async () => (await readNoteFile('lru-cache.md')).includes(C1C_MARK), (v) => v === true, 5000)
    check(`C1-c 落盘复核：Ctrl+S 后 lru-cache.md 含该字符（${C1C_MARK}）`, c1cSaved === true, `含 ${C1C_MARK} = ${c1cSaved}`)
  } finally {
    await app.close()
  }
})

// ============================== 清理与汇总 ==============================
for (const d of tempDirs) {
  try {
    await fs.rm(d, { recursive: true, force: true })
  } catch {
    /* 清理失败不掩盖验证结论 */
  }
}

const failed = results.filter((r) => !r.ok)
if (onlyKeys) console.log(`\n[过滤] --only=${onlyKeys.join(',')}；跳过的分节：${skippedSections.join(' / ') || '(无)'}`)
if (grepRe) console.log(`[过滤] --grep=/${grepRe.source}/；未记录的断言 ${skippedChecks.length} 条`)
console.log(`\n==== ${results.length - failed.length}/${results.length} 通过 ====`)
if (failed.length) {
  console.log('\n失败项清单:')
  for (const f of failed) console.log(` - [${f.section}] ${f.label}${f.detail !== undefined ? ' — ' + f.detail : ''}`)
  process.exitCode = 1
}

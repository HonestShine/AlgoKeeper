import { useEffect, useState, type ReactElement } from 'react'

const SAMPLE_TAGS = ['动态规划', '数组', '哈希表', '二分查找', '树', '图', '贪心']

interface BootInfo {
  ping: string
  electron: string
  node: string
}

const BOOT_INITIAL: BootInfo = { ping: '…', electron: '—', node: '—' }

export default function App(): ReactElement {
  const [boot, setBoot] = useState<BootInfo>(BOOT_INITIAL)

  useEffect(() => {
    let alive = true
    void (async () => {
      const next: BootInfo = { ...BOOT_INITIAL }
      try {
        const pong = await window.api?.ping()
        next.ping = pong ?? '(preload 未注入)'
        next.electron = window.api?.versions.electron ?? '—'
        next.node = window.api?.versions.node ?? '—'
      } catch {
        next.ping = '(IPC 不可用)'
      }
      if (alive) setBoot(next)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-200">
      <div className="flex min-h-0 flex-1">
        {/* 左栏：文件树 + 标签云 */}
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-neutral-800 bg-neutral-900/60">
          <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Notes
          </div>
          <div className="px-3 py-1.5 font-mono text-[13px] text-neutral-400">Documents/</div>
          <div className="px-3 py-1.5 font-mono text-[13px] text-neutral-400">└ leetcode/</div>
          <div className="px-3 py-1 font-mono text-[13px] text-sky-400">
            &nbsp;&nbsp;├ two-sum.md <span className="text-neutral-600">(当前)</span>
          </div>
          <div className="px-3 py-1 font-mono text-[13px] text-neutral-500">&nbsp;&nbsp;└ three-sum.md</div>

          <div className="mt-4 border-t border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            标签云
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 py-1">
            {SAMPLE_TAGS.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </aside>

        {/* 主区域：顶栏 + 编辑器 / 阅读占位 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-neutral-800 px-4 py-2">
            <span className="text-sm font-medium text-neutral-100">two-sum</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-400">
              Easy
            </span>
            <span className="ml-auto text-xs text-neutral-500">
              编辑（WYSIWYG Tiptap 待 M1 接入）
            </span>
          </header>
          <section className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-neutral-300">AlgoKeeper · M0 空壳</p>
              <p className="mt-2 text-sm text-neutral-500">
                笔记默认存于 <code className="text-neutral-400">Documents/</code>，图片存于{' '}
                <code className="text-neutral-400">.images/</code>
              </p>
              <p className="mt-4 text-xs text-neutral-600">
                快捷键占位：Ctrl+Shift+N 快速记录 · Ctrl+Shift+R 今日复习
              </p>
            </div>
          </section>
        </main>

        {/* 右栏：Inspector */}
        <aside className="hidden w-64 shrink-0 flex-col border-l border-neutral-800 bg-neutral-900/60 md:flex">
          <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Inspector
          </div>
          <div className="space-y-4 px-3 py-3 text-xs text-neutral-400">
            <div>
              <p className="font-medium text-neutral-500">复习统计</p>
              <p className="mt-1">
                repetitions —&nbsp; easeFactor —&nbsp; interval —
              </p>
            </div>
            <div>
              <p className="font-medium text-neutral-500">关联题目</p>
              <p className="mt-1 text-neutral-600">（反链 / 同标签 Top5 待 M1）</p>
            </div>
          </div>
        </aside>
      </div>

      {/* 状态栏 */}
      <footer className="flex items-center gap-4 border-t border-neutral-800 bg-neutral-900/80 px-4 py-1 text-xs text-neutral-500">
        <span>字数 — · 光标 —</span>
        <span className="ml-auto flex items-center gap-3">
          <span>复习队列 <b className="text-neutral-300">0/0</b></span>
          <span className={boot.ping === 'pong' ? 'text-emerald-500' : ''}>IPC {boot.ping}</span>
          <span className="text-neutral-600">
            Electron {boot.electron} · Node {boot.node}
          </span>
        </span>
      </footer>
    </div>
  )
}

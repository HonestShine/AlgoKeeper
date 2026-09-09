import { useCallback, useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { StatsOverview } from '../../../../shared/types/insight'

export interface DashboardProps {
  onClose(): void
}

/** 统计看板：总题数/难度/标签覆盖率/每日正确率曲线/薄弱标签。 */
export default function Dashboard({ onClose }: DashboardProps): ReactElement {
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    setError('')
    try {
      const res = await window.api?.stats.overview()
      if (res) setStats(res)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const maxDiff = stats ? Math.max(1, ...stats.difficulty.map((d) => d.count)) : 1
  const maxTag = stats ? Math.max(1, ...stats.tags.map((t) => t.count)) : 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="flex h-[80vh] w-[720px] max-w-[94vw] flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">统计看板</h2>
          <div className="flex items-center gap-2">
            <button className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800" onClick={() => void load()} type="button">
              刷新
            </button>
            <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-[13px] text-neutral-300">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!stats && !error && <p className="text-neutral-500">加载中…</p>}

          {stats && (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Stat label="总题数" value={String(stats.total)} />
                {stats.difficulty.map((d) => (
                  <Stat key={d.difficulty} label={d.difficulty} value={String(d.count)} />
                ))}
              </div>

              <section>
                <SectionTitle>难度占比</SectionTitle>
                {stats.difficulty.map((d) => (
                  <Bar key={d.difficulty} label={d.difficulty} count={d.count} max={maxDiff} color="bg-sky-600" />
                ))}
              </section>

              <section>
                <SectionTitle>标签分布（知识地图 · 标签覆盖率 {(stats.tagCoverage * 100).toFixed(0)}%）</SectionTitle>
                {stats.tags.length === 0 && <p className="text-neutral-600">还没有标签</p>}
                {stats.tags.map((t) => (
                  <Bar key={t.tag} label={t.tag} count={t.count} max={maxTag} color="bg-emerald-600" />
                ))}
              </section>

              <section>
                <SectionTitle>每日正确率曲线（Good/Easy 记为正确）</SectionTitle>
                {stats.series.length === 0 && <p className="text-neutral-600">暂无复习记录</p>}
                {stats.series.map((p) => (
                  <div key={p.date} className="flex items-center gap-2 py-0.5">
                    <span className="w-24 font-mono text-xs text-neutral-500">{p.date}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-800">
                      <div className="h-full bg-sky-500" style={{ width: `${Math.round(p.acc * 100)}%` }} />
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-neutral-400">
                      {(p.acc * 100).toFixed(0)}% ({p.n})
                    </span>
                  </div>
                ))}
              </section>

              <section>
                <SectionTitle>薄弱环节（近 30 天样本≥3 且正确率&lt;60%）</SectionTitle>
                {stats.weakTags.length === 0 && <p className="text-neutral-600">无薄弱标签，状态良好</p>}
                {stats.weakTags.map((w) => (
                  <div key={w.tag} className="flex items-center gap-2 rounded bg-red-950/40 px-2 py-1 text-red-300">
                    <span>{w.tag}</span>
                    <span className="ml-auto font-mono text-xs">正确率 {(w.acc * 100).toFixed(0)}% · 样本 {w.n}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-center">
      <p className="text-lg font-semibold text-neutral-100">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }): ReactElement {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{children}</p>
}

function Bar({ label, count, max, color }: { label: string; count: number; max: number; color: string }): ReactElement {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-24 text-xs text-neutral-400">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className={`h-full ${color}`} style={{ width: `${max ? Math.max(2, (count / max) * 100) : 0}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-xs text-neutral-400">{count}</span>
    </div>
  )
}

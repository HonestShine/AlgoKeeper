import { useState } from 'react'
import type { ReactElement } from 'react'
import type { AppSettings } from '../../../../shared/types/settings'

export interface SettingsDialogProps {
  settings: AppSettings
  onClose(): void
  onSettingsChanged(s: AppSettings): void
}

const HOTKEYS: Array<[string, string]> = [
  ['Ctrl+Shift+N', '快速记录（粘贴 URL 自动解析）'],
  ['Ctrl+S', '保存当前题解'],
  ['Ctrl+Shift+S', '另存为…'],
  ['Ctrl+E', '阅读 / 编辑切换'],
  ['Ctrl+Shift+R', '今日复习'],
  ['Ctrl+,', '偏好设置'],
  ['空格 / 1-4', '复习会话：翻答案 / 评分'],
  ['U / Esc', '复习会话：撤销上一步 / 退出并保存']
]

/** 偏好设置：数据目录、复习偏好、快捷键速查。 */
export default function SettingsDialog({ settings, onClose, onSettingsChanged }: SettingsDialogProps): ReactElement {
  const [newLimit, setNewLimit] = useState(String(settings.newCardLimit))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const changeRoot = async (): Promise<void> => {
    const api = window.api
    if (!api) return
    setBusy(true)
    setError('')
    try {
      const res = await api.settings.pickRoot()
      if (res) onSettingsChanged(res.settings)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveLimit = async (): Promise<void> => {
    const api = window.api
    if (!api) return
    const n = Number(newLimit)
    if (!Number.isFinite(n) || n < 0 || n > 200) {
      setError('每日新卡上限需为 0–200 的整数')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.settings.set({ newCardLimit: Math.round(n) })
      onSettingsChanged(res.settings)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1 text-xs font-medium text-neutral-400'
  const field =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        className="w-[560px] max-w-[92vw] rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">偏好设置</h2>
          <button className="text-neutral-500 hover:text-neutral-200" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-4 py-4">
          {/* 数据 */}
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">数据</p>
            <p className={label}>笔记目录</p>
            <div className="flex gap-2">
              <input className={`${field} font-mono text-xs`} value={settings.notesRoot} readOnly />
              <button
                type="button"
                disabled={busy}
                onClick={() => void changeRoot()}
                className="shrink-0 rounded border border-neutral-700 px-3 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                更换…
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-600">默认：{settings.notesRootDefault}（笔记为 .md 文件，图片在各自目录 .images/）</p>
          </section>

          {/* 外观 */}
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">外观</p>
            <p className={label}>界面主题</p>
            <div className="flex gap-2">
              <select
                className={`${field} w-44`}
                value={settings.theme}
                onChange={(e) => {
                  const theme = e.target.value === 'light-github' ? 'light-github' : 'dark'
                  void window.api?.settings.set({ theme }).then((r) => r && onSettingsChanged(r.settings))
                }}
              >
                <option value="dark">深色（默认）</option>
                <option value="light-github">GitHub 浅色</option>
              </select>
              <span className="self-center text-[11px] text-neutral-600">即时生效并保存</span>
            </div>
          </section>

          {/* 复习 */}
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">复习</p>
            <p className={label}>每日新卡上限（今日队列新增卡数）</p>
            <div className="flex items-center gap-2">
              <input
                className={`${field} w-28`}
                type="number"
                min={0}
                max={200}
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveLimit()}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                保存
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-600">评分规则：1=Again 重置 / 2=Hard(EF−0.14) / 3=Good / 4=Easy(EF+0.10)</p>
          </section>

          {/* 快捷键 */}
          <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">快捷键速查</p>
            <table className="w-full text-xs">
              <tbody>
                {HOTKEYS.map(([k, desc]) => (
                  <tr key={k} className="border-t border-neutral-800/70">
                    <td className="py-1 pr-3 font-mono text-neutral-300">{k}</td>
                    <td className="py-1 text-neutral-500">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}

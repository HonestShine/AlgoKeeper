import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, LayoutPrefs } from '../../../shared/types/settings'
import { DEFAULT_LAYOUT } from '../../../shared/utils/layout'

export interface LayoutController {
  layout: LayoutPrefs
  /** 拖拽中高频调用：只改本地乐观值 */
  setWidth(side: 'left' | 'right', width: number): void
  /** 切换单栏显隐 */
  toggle(side: 'left' | 'right'): void
  /** 更新任意布局字段（如 contentWidth / autoSave） */
  set<K extends keyof LayoutPrefs>(key: K, value: LayoutPrefs[K]): void
}

/** 布局偏好：本地乐观更新 + 300ms 防抖持久化到 userData/settings.json。 */
export function useLayoutPrefs(
  settings: AppSettings | null,
  onChanged: (s: AppSettings) => void
): LayoutController {
  const api = window.api
  const base = settings?.layout ?? DEFAULT_LAYOUT
  const [draft, setDraft] = useState<Partial<LayoutPrefs>>({})
  const layout = useMemo<LayoutPrefs>(() => ({ ...base, ...draft }), [base, draft])
  const pending = Object.keys(draft).length > 0

  useEffect(() => {
    // settings 尚未到位（settings.get() 未返回）时不写盘：否则会以 DEFAULT_LAYOUT 为基底
    // 覆盖掉已持久化的宽度（首帧就改布局 + 响应晚于 300ms 即可触发）
    if (!settings || !pending || !api) return
    // 本次实际提交的字段（Partial）：只发变更字段，避免把整份 layout 里的过期字段写回，
    // 多窗口共用 settings.json 时互相覆盖
    const sent: Partial<LayoutPrefs> = { ...draft }
    const timer = window.setTimeout(() => {
      void api.settings
        .set({ layout: sent })
        .then((r) => {
          if (!r) return
          onChanged(r.settings)
          setDraft((d) => {
            // 只清除「仍等于本次提交值」的键：提交后用户的新改动必须保留。
            // 若无条件 setDraft({})，回显会视觉回退新值，且清空 draft 会让本 effect
            // 的 cleanup 取消掉新值尚未触发的写盘 timer —— 那是丢写。
            const rest: Partial<LayoutPrefs> = { ...d }
            for (const k of Object.keys(sent) as Array<keyof LayoutPrefs>) {
              if (rest[k] === sent[k]) delete rest[k]
            }
            return rest
          })
        })
        .catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [settings, pending, draft, api, onChanged])

  const setWidth = useCallback((side: 'left' | 'right', width: number): void => {
    setDraft((d) => ({ ...d, [side === 'left' ? 'leftWidth' : 'rightWidth']: width }))
  }, [])

  const toggle = useCallback(
    (side: 'left' | 'right'): void => {
      const key = side === 'left' ? 'leftVisible' : 'rightVisible'
      setDraft((d) => {
        const cur = d[key] ?? base[key]
        return { ...d, [key]: !cur }
      })
    },
    [base]
  )

  const set = useCallback(<K extends keyof LayoutPrefs>(key: K, value: LayoutPrefs[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])

  // 控制器身份必须稳定：消费方（App 的全局快捷键 effect）会把它放进依赖数组，
  // 拖拽期间每帧都返回新对象会导致每帧重注册 window 监听器。
  return useMemo<LayoutController>(
    () => ({ layout, setWidth, toggle, set }),
    [layout, setWidth, toggle, set]
  )
}

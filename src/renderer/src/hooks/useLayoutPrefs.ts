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
    if (!pending || !api) return
    const snapshot = { ...base, ...draft }
    const timer = window.setTimeout(() => {
      void api.settings
        .set({ layout: snapshot })
        .then((r) => {
          if (r) {
            onChanged(r.settings)
            setDraft({})
          }
        })
        .catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [pending, base, draft, api, onChanged])

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

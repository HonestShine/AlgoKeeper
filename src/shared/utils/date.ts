/** 纯日期工具：本地时区、YYYY-MM-DD 粒度（间隔重复调度的最小时间单位）。 */

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Date → 本地日期键 'YYYY-MM-DD' */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 今日本地日期键 */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** base + days 天后的本地日期键（跨月/跨年由 Date 自动进位） */
export function addDaysKey(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** 'YYYY-MM-DD' 文本按本地时区解析为当天 0 点 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

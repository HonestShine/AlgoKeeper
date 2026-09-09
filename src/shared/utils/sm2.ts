/**
 * SM-2 调度（纯函数，规则锁定于 docs/technical-design.md §5.2 与 PRD §4.2）：
 * 四档评分 1=Again 2=Hard 3=Good 4=Easy → 质量分 q ∈ {1,3,4,5}；
 * 失败(Again)重置短间隔且不改 EF；EF 更新仅作用于成功档；下限 1.3。
 */
import { addDaysKey } from './date'
import type { SchedulingInfo } from '../types/srs'

export type Grade = 1 | 2 | 3 | 4
export const EASE_INIT = 2.5
export const EASE_MIN = 1.3
export const INTERVAL_RESET = 1

/** 新卡初始调度（due 默认今天） */
export function newCardScheduling(today: string): SchedulingInfo {
  return { repetitions: 0, easeFactor: EASE_INIT, interval: 0, due: today, lapses: 0 }
}

function gradeToQuality(grade: Grade): 1 | 3 | 4 | 5 {
  const map: Record<Grade, 1 | 3 | 4 | 5> = { 1: 1, 2: 3, 3: 4, 4: 5 }
  return map[grade]
}

/** 成功档 EF 更新：EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02))，下限 1.3 */
function efAfter(quality: 1 | 3 | 4 | 5, ef: number): number {
  if (quality < 3) return ef // Again：EF 不变（保留已调整值）
  const d = 5 - quality // Hard:2 · Good:1 · Easy:0
  return Math.max(EASE_MIN, ef + (0.1 - d * (0.08 + 0.02 * d)))
}

export function schedule(grade: Grade, sched: SchedulingInfo, today: string): SchedulingInfo {
  const quality = gradeToQuality(grade)
  const ef = efAfter(quality, sched.easeFactor)
  const lastReviewed = today

  if (quality < 3) {
    return {
      repetitions: 0,
      easeFactor: ef,
      interval: INTERVAL_RESET,
      due: addDaysKey(new Date(today + 'T00:00:00'), INTERVAL_RESET),
      lapses: sched.lapses + 1,
      lastReviewed
    }
  }

  const reps = sched.repetitions + 1
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.max(1, Math.round(sched.interval * ef))
  return {
    repetitions: reps,
    easeFactor: ef,
    interval,
    due: addDaysKey(new Date(today + 'T00:00:00'), interval),
    lapses: sched.lapses,
    lastReviewed
  }
}

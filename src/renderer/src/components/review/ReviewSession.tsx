import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Difficulty } from '../../../../shared/types/note'
import type { CardSessionItem, ReviewFilter, ReviewResult } from '../../../../shared/types/srs'

export interface ReviewSessionProps {
  onExit(): void
  availableTags?: string[]
}

/** 全键盘复习覆盖层：空格翻答案 · 1-4 评分 · U 撤销上一步 · Esc 退出并保存。 */
export default function ReviewSession({ onExit, availableTags = [] }: ReviewSessionProps): ReactElement {
  const [cards, setCards] = useState<CardSessionItem[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'question' | 'reveal'>('question')
  const [results, setResults] = useState<ReviewResult[]>([])
  const [status, setStatus] = useState('加载队列…')
  const [diff, setDiff] = useState<'all' | Difficulty>('all')
  const [tag, setTag] = useState('all')

  const cardsRef = useRef<CardSessionItem[]>([])
  const idxRef = useRef(0)
  const phaseRef = useRef<'question' | 'reveal'>('question')
  const resultsRef = useRef<ReviewResult[]>([])
  cardsRef.current = cards ?? []
  idxRef.current = idx
  phaseRef.current = phase
  resultsRef.current = results

  // 难度/标签过滤变化时重拉队列
  useEffect(() => {
    let alive = true
    void (async () => {
      setStatus('加载队列…')
      const api = window.api
      const filter: ReviewFilter = {}
      if (diff !== 'all') filter.difficulty = diff
      if (tag !== 'all') filter.tags = [tag]
      const list = (await api?.review.collect(Object.keys(filter).length ? filter : undefined)) ?? []
      if (!alive) return
      setCards(list)
      setIdx(0)
      setPhase('question')
      setResults([])
      setStatus(list.length ? '' : '该筛选下今日队列为空 🎉')
    })()
    return () => {
      alive = false
    }
  }, [diff, tag])

  const commitAndExit = async (): Promise<void> => {
    const api = window.api
    if (api && resultsRef.current.length > 0) {
      setStatus('保存复习进度…')
      await api.review.commit(resultsRef.current)
    }
    onExit()
  }

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const list = cardsRef.current
      const i = idxRef.current
      if (list.length === 0) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault()
          void commitAndExit()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        void commitAndExit()
        return
      }
      if (phaseRef.current === 'question') {
        if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          setPhase('reveal')
        }
        return
      }
      // reveal 阶段：评分
      const grade: ReviewResult['grade'] | null =
        e.key === '1' ? 1 : e.key === '2' ? 2 : e.key === '3' ? 3 : e.key === '4' ? 4 : null
      if (grade) {
        e.preventDefault()
        const next = [...resultsRef.current, { cardId: list[i].cardId, grade }]
        resultsRef.current = next
        setResults(next)
        if (i + 1 >= list.length) {
          void commitAndExit()
        } else {
          setIdx(i + 1)
          setPhase('question')
        }
        return
      }
      if (e.key === 'u' || e.key === 'U') {
        const prev = resultsRef.current.slice(0, -1)
        resultsRef.current = prev
        setResults(prev)
        if (i > 0) {
          setIdx(i - 1)
          setPhase('reveal')
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const current = cards?.[idx]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
        <span>今日复习</span>
        <span className="font-mono">
          {cards ? (cards.length ? `${idx + 1}/${cards.length}` : '0/0') : '…'}
        </span>
        <button type="button" className="rounded px-2 py-0.5 hover:bg-neutral-800" onClick={() => void commitAndExit()}>
          退出并保存 (Esc)
        </button>
      </header>

      <div className="flex items-center gap-4 border-b border-neutral-800/70 px-4 py-1.5 text-xs text-neutral-500">
        <label className="flex items-center gap-1.5">
          难度
          <select
            value={diff}
            onChange={(e) => setDiff(e.target.value as 'all' | Difficulty)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-200 focus:outline-none"
          >
            <option value="all">全部</option>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          标签
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-200 focus:outline-none"
          >
            <option value="all">全部</option>
            {availableTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {cards && cards.length > 0 && <span className="ml-auto text-neutral-600">改动筛选将重置本轮进度</span>}
      </div>

      {status ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-neutral-400">{status}</p>
          <button
            type="button"
            className="rounded border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
            onClick={() => void commitAndExit()}
          >
            {cards && cards.length > 0 ? '返回' : '关闭 (Enter)'}
          </button>
        </div>
      ) : current ? (
        <>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <p className="mb-1 text-xs text-neutral-500">
              {current.kind === 'whole' ? '整题卡' : '拆解卡'}
              {current.isNew ? ' · 新卡' : ''} · {current.noteTitle}
            </p>
            <h2 className="mb-4 text-lg font-semibold text-neutral-100">{current.question}</h2>
            {phase === 'reveal' && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
                {current.kind === 'whole' ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-neutral-200">
                    {current.answerText}
                  </pre>
                ) : (
                  <p className="text-[15px] text-neutral-100">{current.answerText}</p>
                )}
              </div>
            )}
          </div>
          <footer className="border-t border-neutral-800 px-6 py-3 text-center text-xs text-neutral-500">
            {phase === 'question' ? (
              <span>
                ␣ 空格显示答案 · <span className="text-neutral-300">先尝试回忆</span>
              </span>
            ) : (
              <span>
                [1] Again · [2] Hard · [3] Good · [4] Easy&nbsp;&nbsp;&nbsp;<span className="text-neutral-600">U 撤销上一步</span>
              </span>
            )}
          </footer>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-neutral-600">加载中…</div>
      )}
    </div>
  )
}

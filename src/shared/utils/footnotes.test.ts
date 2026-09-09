import { describe, expect, it } from 'vitest'
import { renumberFootnotes, scanFootnotes } from './footnotes'

describe('footnotes utils', () => {
  it('scan 收集代码围栏外的引用与定义', () => {
    const md = [
      '正文引用[^2]与[^1]。',
      '```ts',
      '// [^99] 不应算',
      '```',
      '',
      '[^1]: 定义一',
      '[^2]: 定义二'
    ].join('\n')
    const s = scanFootnotes(md)
    expect(s.refs).toEqual([2, 1])
    expect([...s.defs.keys()].sort()).toEqual([1, 2])
  })

  it('renumber 按首次出现顺序连续化 2→1、1→2，定义同步', () => {
    const md = ['引用[^2]和[^1]。', '', '[^1]: 一', '[^2]: 二'].join('\n')
    const r = renumberFootnotes(md)
    expect(r.count).toBe(2)
    expect(r.md).toContain('[^1]和[^2]。')
    expect(r.md).toContain('[^1]: 二')
    expect(r.md).toContain('[^2]: 一')
  })

  it('代码围栏内 token 不受重排影响', () => {
    const md = ['[^5]正文', '```', '[^3]不处理', '```'].join('\n')
    const r = renumberFootnotes(md)
    expect(r.md).toContain('[^1]正文')
    expect(r.md).toContain('[^3]不处理')
  })
})

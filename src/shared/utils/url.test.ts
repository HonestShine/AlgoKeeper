import { describe, expect, it } from 'vitest'
import { parseProblemUrl } from './url'

describe('parseProblemUrl', () => {
  it('解析 leetcode 常见 URL 形态', () => {
    expect(parseProblemUrl('https://leetcode.com/problems/two-sum/description/')).toEqual({
      source: 'leetcode',
      id: 'two-sum',
      title: 'Two Sum'
    })
    expect(parseProblemUrl('https://leetcode.com/problems/two-sum/')).toEqual({
      source: 'leetcode',
      id: 'two-sum',
      title: 'Two Sum'
    })
  })

  it('www 前缀与多余参数兼容', () => {
    expect(parseProblemUrl('https://www.leetcode.com/problems/merge-k-sorted-lists/?envType=study-plan')).toEqual({
      source: 'leetcode',
      id: 'merge-k-sorted-lists',
      title: 'Merge K Sorted Lists'
    })
  })

  it('拒绝不可信/非题目 URL', () => {
    expect(parseProblemUrl('https://leetcode.com/problemset/all/')).toBeNull()
    expect(parseProblemUrl('https://evil.example.com/problems/two-sum/')).toBeNull()
    expect(parseProblemUrl('https://leetcode.com/')).toBeNull()
  })

  it('非法输入安全返回 null', () => {
    expect(parseProblemUrl('not a url')).toBeNull()
    expect(parseProblemUrl('')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { hashCardKey, normalizeQuestion, parseBodyCards } from './cards'

describe('cards utils', () => {
  it('normalizeQuestion 折叠连续空白', () => {
    expect(normalizeQuestion('  a\tb   c ')).toBe('a b c')
  })

  it('hashCardKey 稳定且对规范化后的问句幂等', () => {
    expect(hashCardKey('二分退出条件?')).toBe(hashCardKey('  二分退出条件? '))
    expect(hashCardKey('A')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('解析独立段落行与列表项单行', () => {
    const md = [
      '## 解法一：栈',
      '左括号入栈。',
      '```ts',
      'const x = 1', // 代码内即使有 :: 也不解析
      '```',
      '二分退出时关系是?::low > high',
      '- 为什么栈能匹配?::因为后进先出',
      '普通行不用解析'
    ].join('\n')
    const cards = parseBodyCards(md)
    expect(cards).toHaveLength(2)
    expect(cards[0].question).toBe('二分退出时关系是?')
    expect(cards[0].answer).toBe('low > high')
    expect(cards[1].question).toBe('为什么栈能匹配?')
    expect(cards[1].answer).toBe('因为后进先出')
    expect(cards[1].qhash).toBe(hashCardKey('为什么栈能匹配?'))
  })

  it('答案内嵌 :: 只按首个 :: 切分', () => {
    const cards = parseBodyCards('a::b::c')
    expect(cards[0]).toMatchObject({ question: 'a', answer: 'b::c' })
  })
})

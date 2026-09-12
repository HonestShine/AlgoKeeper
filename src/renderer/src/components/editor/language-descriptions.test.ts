import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { LanguageDescription, ensureSyntaxTree } from '@codemirror/language'
import { CODE_LANGUAGES } from './language-descriptions'

/** 每个语言包一段合法片段：能被解析且语法树里没有 error 节点，才算「真能解析」。 */
const SAMPLES: Record<string, string> = {
  javascript: 'const add = (a: number, b: number): number => a + b\n',
  python: 'def add(a, b):\n    return a + b\n',
  cpp: 'int add(int a, int b) { return a + b; }\n',
  java: 'class Main {\n  static int add(int a, int b) { return a + b; }\n}\n',
  go: 'package main\n\nfunc add(a int, b int) int {\n  return a + b\n}\n'
}

describe('CODE_LANGUAGES', () => {
  it('覆盖 5 个高频提交语言', () => {
    expect(CODE_LANGUAGES.map((d) => d.name).sort()).toEqual(['cpp', 'go', 'java', 'javascript', 'python'])
  })

  it.each(Object.keys(SAMPLES))('按名字可匹配到 %s', (name) => {
    const desc = LanguageDescription.matchLanguageName(CODE_LANGUAGES, name, true)
    expect(desc).not.toBeNull()
    expect(desc?.name).toBe(name)
  })

  it.each(Object.keys(SAMPLES))('围栏别名可匹配到 %s', (name) => {
    // markdown 围栏里用户常写 ```py / ```golang / ```c++
    const alias: Record<string, string> = { python: 'py', go: 'golang', cpp: 'c++', java: 'java', javascript: 'ts' }
    const desc = LanguageDescription.matchLanguageName(CODE_LANGUAGES, alias[name], true)
    expect(desc?.name).toBe(name)
  })

  it.each(Object.keys(SAMPLES))('%s 的 load() 能用解析器解析片段且无 error 节点', async (name) => {
    const desc = LanguageDescription.matchLanguageName(CODE_LANGUAGES, name, true)
    expect(desc).not.toBeNull()
    const support = await desc!.load()

    const sample = SAMPLES[name]
    const state = EditorState.create({ doc: sample, extensions: [support] })
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)
    expect(tree).not.toBeNull()

    const errors: string[] = []
    tree!.iterate({
      enter: (node) => {
        if (node.type.isError) errors.push(`${node.name}@${node.from}-${node.to}`)
      }
    })
    expect(errors).toEqual([])
  })
})

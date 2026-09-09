/**
 * 脚注工具层（纯函数，供 R2 管线与渲染解析复用）。
 * 语法：引用 `[^n]`（正文），定义 `[^n]: 内容`（文末惯例）。代码围栏内不解析。
 */

const REF_RE = /\[\^(\d+)\]/g
const DEF_RE = /^\[\^(\d+)\]:\s*(.*)$/

/** 行级迭代工具：跳过 ``` 围栏内容 */
export function collectLines(md: string, visit: (line: string, lineIndex: number, inCode: boolean) => void): void {
  let inCode = false
  const lines = md.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const t = raw.trim()
    if (t.startsWith('```')) {
      inCode = !inCode
      visit(raw, i, true)
      return
    }
    visit(raw, i, inCode)
  })
}

export interface FootnoteScan {
  /** 出现顺序的引用编号（代码外） */
  refs: number[]
  /** 定义：key=原文编号，body=内容 */
  defs: Map<number, { body: string; lineIndex: number }>
}

/** 扫描引用与定义（跳过代码围栏） */
export function scanFootnotes(md: string): FootnoteScan {
  const refs: number[] = []
  const defs = new Map<number, { body: string; lineIndex: number }>()
  collectLines(md, (line, i, inCode) => {
    if (inCode) return
    const d = DEF_RE.exec(line.trim())
    if (d) {
      defs.set(Number(d[1]), { body: d[2], lineIndex: i })
      return
    }
    let m: RegExpExecArray | null
    const re = new RegExp(REF_RE.source, 'g')
    while ((m = re.exec(line)) !== null) refs.push(Number(m[1]))
  })
  return { refs, defs }
}

/**
 * 把脚注按“首次出现顺序”连续重排（1..N），引用与定义键同步更新。
 * 返回重排后的 md 与脚注总数。代码围栏内不受影响。
 */
export function renumberFootnotes(md: string): { md: string; count: number } {
  const seen = new Map<number, number>()
  let next = 0
  const fresh = (old: number): number => {
    if (!seen.has(old)) seen.set(old, ++next)
    return seen.get(old) as number
  }
  const mapLine = (line: string): string => {
    const def = DEF_RE.exec(line.trim())
    if (def) {
      const key = fresh(Number(def[1]))
      return line.replace(/^(\s*)\[\^(\d+)\]:/, `$1[^${key}]:`)
    }
    return line.replace(REF_RE, (_tok, num: string) => `[^${fresh(Number(num))}]`)
  }

  const out: string[] = []
  collectLines(md, (line, _i, inCode) => {
    out.push(inCode ? line : mapLine(line))
  })
  return { md: out.join('\n'), count: next }
}

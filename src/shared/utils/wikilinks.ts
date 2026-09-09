/** [[目标]] / [[目标|别名]] 双链解析（纯函数）。 */
export function parseWikiTargets(md: string): string[] {
  const targets = new Set<string>()
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const name = m[1].trim()
    if (name) targets.add(name)
  }
  return [...targets]
}

export function stripWikiSyntax(md: string): string {
  return md.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
}

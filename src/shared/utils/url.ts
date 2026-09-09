/** URL 解析（纯逻辑，快速记录浮窗用）。解析失败返回 null。 */

export interface ParsedProblemUrl {
  source: string
  id: string
  title: string
}

interface SourceRule {
  source: string
  hostRe: RegExp
  /** 从 pathname 提取稳定 id；不匹配返回 null */
  idFromPath: (pathname: string) => string | null
  titleFromPath: (id: string) => string
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const RULES: SourceRule[] = [
  {
    source: 'leetcode',
    hostRe: /^(www\.)?leetcode\.com$/,
    // /problems/two-sum/description → two-sum（slug 即稳定标识）
    idFromPath: (p) => /^\/problems\/([\w-]+)/.exec(p)?.[1] ?? null,
    titleFromPath: toTitleCase
  }
]

export function parseProblemUrl(raw: string): ParsedProblemUrl | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const rule = RULES.find((r) => r.hostRe.test(url.hostname))
  if (!rule) return null
  const id = rule.idFromPath(url.pathname)
  if (!id) return null

  return { source: rule.source, id, title: rule.titleFromPath(id) }
}

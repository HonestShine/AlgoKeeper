import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import type { Difficulty, FileMeta, ParsedFrontmatter } from '../../shared/types/note'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const STATUSES = ['active', 'to-review', 'mastered', 'need-depth'] as const

const KNOWN_KEYS = ['source', 'id', 'title', 'difficulty', 'tags', 'status', 'aliases', 'created', 'updated'] as const

const FM_DELIM = '---'

function isoNow(): string {
  return new Date().toISOString()
}

/**
 * 把 frontmatter YAML 对象 ↔ FileMeta 互转。
 * frontmatter 键名（created/updated）与 TS 字段（createdAt/updatedAt）映射见技术方案 §4.1。
 */
function docToMeta(doc: Record<string, unknown>): { meta: FileMeta; extras: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = []
  const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
  const tags = Array.isArray(doc.tags) ? doc.tags.filter((t): t is string => typeof t === 'string') : doc.tags ? [str(doc.tags)] : []
  const difficultyRaw = str(doc.difficulty) as Difficulty
  const difficulty: Difficulty = DIFFICULTIES.includes(difficultyRaw) ? difficultyRaw : 'Easy'
  if (doc.difficulty !== undefined && !DIFFICULTIES.includes(difficultyRaw)) warnings.push('invalid-difficulty')
  const statusRaw = str(doc.status)
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as FileMeta['status']) : 'active'

  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(doc)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) extras[k] = v
  }

  const meta: FileMeta = {
    source: str(doc.source),
    id: str(doc.id),
    title: str(doc.title),
    difficulty,
    tags,
    status,
    aliases: Array.isArray(doc.aliases) ? doc.aliases.filter((a): a is string => typeof a === 'string') : [],
    createdAt: str(doc.created) || isoNow(),
    updatedAt: str(doc.updated) || isoNow()
  }
  if (!meta.source || !meta.id || !meta.title) warnings.push('missing-meta')
  return { meta, extras, warnings }
}

function metaToDoc(meta: FileMeta, extras: Record<string, unknown>): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    source: meta.source,
    id: meta.id,
    title: meta.title,
    difficulty: meta.difficulty,
    tags: meta.tags,
    status: meta.status,
    aliases: meta.aliases,
    created: meta.createdAt,
    updated: meta.updatedAt
  }
  for (const [k, v] of Object.entries(extras)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) doc[k] = v
  }
  return doc
}

type ParsedNote = ParsedFrontmatter & { bodyMd: string }

/** 解析 .md 全文：frontmatter → FileMeta（含未知键）+ 正文 */
export function parseFrontmatter(md: string): ParsedNote {
  return splitFrontmatter(md)
}

function splitFrontmatter(md: string): ParsedNote {
  const trimmedStart = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md
  const lines = trimmedStart.split(/\r?\n/)
  const warnings: string[] = []
  let doc: Record<string, unknown>
  let bodyMd = trimmedStart

  if (lines[0]?.trim() === FM_DELIM) {
    let end = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === FM_DELIM) {
        end = i
        break
      }
    }
    if (end > 0) {
      const yamlText = lines.slice(1, end).join('\n')
      try {
        const parsed = yamlParse(yamlText)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          doc = parsed as Record<string, unknown>
          bodyMd = lines.slice(end + 1).join('\n').replace(/^\n/, '')
        } else {
          doc = {}
          warnings.push('frontmatter-not-object')
        }
      } catch {
        doc = {}
        warnings.push('frontmatter-invalid-yaml')
      }
    } else {
      doc = {}
      warnings.push('frontmatter-unterminated')
    }
  } else {
    doc = {}
    warnings.push('no-frontmatter')
  }

  const { meta, extras, warnings: metaWarnings } = docToMeta(doc)
  return { meta, extras, warnings: [...warnings, ...metaWarnings], bodyMd }
}

/** 由 meta + 正文重建 .md（未知键 extras 原样保留） */
export function buildNoteMd(meta: FileMeta, bodyMd: string, extras: Record<string, unknown> = {}): string {
  const yamlText = yamlStringify(metaToDoc(meta, extras), { indent: 2 })
  const body = bodyMd.replace(/^\n/, '')
  return `${FM_DELIM}\n${yamlText}${FM_DELIM}\n${body ? '\n' + body : ''}`
}

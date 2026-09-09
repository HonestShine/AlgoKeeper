import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parseFrontmatter, buildNoteMd } from './markdown-parser'
import type { FileMeta, LoadedNote, NewNoteDraft, NoteSummary, SaveNoteInput } from '../../shared/types/note'

const DEFAULT_STATUS: FileMeta['status'] = 'active'

function codeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

export async function ensureNotesRoot(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true })
}

/** noteId 安全校验（防路径穿越）。合法：posix 相对、≤2 段、每段为安全 slug。 */
export function assertSafeNoteId(noteId: string): void {
  const parts = noteId.split('/')
  if (noteId.startsWith('/') || parts.includes('..') || parts.some((p) => !/^[A-Za-z0-9._-]+$/.test(p))) {
    throw codeError(`非法笔记标识: ${noteId}`, 'note.invalid-id')
  }
}

function notePath(root: string, noteId: string): string {
  return join(root, ...noteId.split('/')) + '.md'
}

function relToNoteId(abs: string, root: string): string {
  return relative(resolve(root), resolve(abs)).split(sep).join('/').replace(/\.md$/, '')
}

async function walkMd(dir: string, root: string, acc: string[]): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue // 跳过 .images 等隐藏目录
    const p = join(dir, e.name)
    if (e.isDirectory()) await walkMd(p, root, acc)
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) acc.push(p)
  }
}

/** 列出根目录全部笔记（递归，按 updatedAt 倒序） */
export async function listNotes(root: string): Promise<NoteSummary[]> {
  const files: string[] = []
  await walkMd(root, root, files)
  const summaries: NoteSummary[] = []
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = parseFrontmatter(raw)
      const noteId = relToNoteId(file, root)
      const m = parsed.meta
      const stat = await fs.stat(file).catch(() => null)
      const updatedAt =
        m.updatedAt && !Number.isNaN(Date.parse(m.updatedAt))
          ? m.updatedAt
          : new Date(stat?.mtimeMs ?? 0).toISOString()
      summaries.push({
        noteId,
        source: (m.source || noteId.split('/')[0]) ?? '',
        id: m.id || basename(file, '.md'),
        title: m.title || basename(file, '.md'),
        difficulty: m.difficulty,
        tags: m.tags,
        status: m.status,
        updatedAt,
        filePath: file
      })
    } catch {
      /* 解析失败的文件跳过列表（避免单个坏文件阻塞） */
    }
  }
  summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return summaries
}

/** 打开一篇笔记：读文件 + 解析 frontmatter + 补默认 */
export async function readNote(root: string, noteId: string): Promise<LoadedNote> {
  assertSafeNoteId(noteId)
  const file = notePath(root, noteId)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    throw codeError(`笔记不存在: ${noteId}`, 'note.not-found')
  }
  const parsed = parseFrontmatter(raw)
  const m = parsed.meta
  return {
    noteId,
    filePath: file,
    meta: { ...m, status: m.status || DEFAULT_STATUS },
    bodyMd: parsed.bodyMd,
    warnings: parsed.warnings
  }
}

function isoNow(): string {
  return new Date().toISOString()
}

/** 新建草稿落盘（目录按需创建；noteId 冲突报错） */
export async function createNote(root: string, draft: NewNoteDraft): Promise<LoadedNote> {
  await ensureNotesRoot(root)
  const source = draft.meta.source || 'notes'
  const id = draft.meta.id || `untitled-${Date.now()}`
  const noteId = `${source}/${id}`
  assertSafeNoteId(noteId)

  const file = notePath(root, noteId)
  const folder = dirname(file)
  await fs.mkdir(folder, { recursive: true })
  try {
    await fs.access(file)
    throw codeError(`题解已存在: ${noteId}`, 'notes.exist')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }

  const meta: FileMeta = {
    ...draft.meta,
    source,
    id,
    title: draft.meta.title || id,
    createdAt: isoNow(),
    updatedAt: isoNow()
  }
  const content = buildNoteMd(meta, draft.bodyMd)
  await atomicWrite(file, content)
  return { noteId, filePath: file, meta, bodyMd: draft.bodyMd, warnings: [] }
}

/** 保存：meta/正文合并重写。未知键（如 scheduling）从磁盘现文件保留。 */
export async function saveNote(root: string, input: SaveNoteInput): Promise<{ noteId: string; updatedAt: string }> {
  assertSafeNoteId(input.noteId)
  const file = notePath(root, input.noteId)
  let extras: Record<string, unknown> = {}
  try {
    const existing = parseFrontmatter(await fs.readFile(file, 'utf8'))
    extras = existing.extras
  } catch {
    /* 新文件无 extras */
  }
  const meta: FileMeta = { ...input.meta, updatedAt: isoNow() }
  await atomicWrite(file, buildNoteMd(meta, input.bodyMd, extras))
  return { noteId: input.noteId, updatedAt: meta.updatedAt }
}

/** 原子写：临时文件 + rename，避免写一半损坏（NFR-5） */
export async function atomicWrite(file: string, content: string): Promise<void> {
  const dir = dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${basename(file)}.${process.pid}.ak.tmp`)
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, file)
}

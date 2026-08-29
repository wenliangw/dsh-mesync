// db/wiki — wiki_pages 索引表 CRUD（LLM Wiki 的元数据）

import * as fs from 'node:fs'
import * as path from 'node:path'
import { getDB } from './connection.js'
import type { WikiPage } from './types.js'

/** 记录/更新一个 wiki 文档的索引 */
export function upsertWikiPage(page: WikiPage): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO wiki_pages (path, git_commit, updated_at, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      git_commit = excluded.git_commit,
      updated_at = excluded.updated_at,
      source = excluded.source
  `).run(page.path, page.git_commit, page.updated_at, page.source)
}

/** 查询所有 wiki 文档索引 */
export function listWikiPages(): WikiPage[] {
  const d = getDB()
  return d.prepare('SELECT * FROM wiki_pages ORDER BY path').all() as WikiPage[]
}

/** 删除一个 wiki 文档的索引 */
export function deleteWikiPage(path: string): void {
  const d = getDB()
  d.prepare('DELETE FROM wiki_pages WHERE path = ?').run(path)
}

/**
 * 扫描项目 .mesync/ 下的 wiki 文档（overview.md + wiki/**.md），
 * 逐个 upsert 到 sqlite 索引，并删除文件已不存在的旧记录。
 *
 * 这是主 agent 写完 wiki 文档后调用的「同步」逻辑——
 * mesync 不再后台跑 loop 生成，而是由主 agent 写盘后调用 sync 工具触发这里。
 *
 * @param projectRoot - 工作区根目录
 * @param gitHead - 当前 git commit（可为 null）
 * @param source - 同步来源标记
 * @returns 同步的文档数量
 */
export function syncWikiFromFiles(
  projectRoot: string,
  gitHead: string | null,
  source: 'initial' | 'incremental' | 'manual'
): number {
  const now = new Date().toISOString()

  const docs = collectWikiDocs(projectRoot)
  const docSet = new Set(docs)

  for (const relPath of docs) {
    upsertWikiPage({
      path: relPath,
      git_commit: gitHead,
      updated_at: now,
      source,
    })
  }

  // 删除索引里文件已不存在的旧记录
  for (const existing of listWikiPages()) {
    if (!docSet.has(existing.path)) {
      deleteWikiPage(existing.path)
    }
  }

  return docs.length
}

/** 收集 .mesync/ 下的所有 wiki 文档相对路径（相对 .mesync/，如 overview.md、wiki/xxx.md） */
function collectWikiDocs(projectRoot: string): string[] {
  const result: string[] = []

  const overviewPath = path.join(projectRoot, '.mesync', 'overview.md')
  if (fs.existsSync(overviewPath)) {
    result.push('overview.md')
  }

  const wikiDir = path.join(projectRoot, '.mesync', 'wiki')
  if (fs.existsSync(wikiDir)) {
    for (const f of listMdFiles(wikiDir)) {
      const rel = path.relative(path.join(projectRoot, '.mesync'), f).replace(/\\/g, '/')
      result.push(rel)
    }
  }

  return result
}

/** 递归列出目录下的 md 文件 */
function listMdFiles(dir: string): string[] {
  const result: string[] = []
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return result
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...listMdFiles(full))
    } else if (e.name.endsWith('.md')) {
      result.push(full)
    }
  }
  return result
}
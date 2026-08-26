// db/wiki — wiki_pages 索引表 CRUD（LLM Wiki 的元数据）

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

/** 查询单个 wiki 文档索引 */
export function getWikiPage(path: string): WikiPage | null {
  const d = getDB()
  return (d.prepare('SELECT * FROM wiki_pages WHERE path = ?').get(path) as WikiPage) ?? null
}

/** 判断 workspace 是否已有 wiki 数据（用于决定首次全量 vs 复用） */
export function hasWikiData(): boolean {
  const d = getDB()
  const row = d.prepare('SELECT COUNT(*) as c FROM wiki_pages').get() as any
  return row.c > 0
}
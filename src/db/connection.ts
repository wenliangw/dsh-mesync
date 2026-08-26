// db/connection — SQLite 连接管理
// 固定路径：<workspace>/.mesync/db/resonance.db
// 多实例缓存：按 projectRoot 缓存，项目级记忆需要每个 workspace 独立

import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { SCHEMA_SQL } from './schema.js'

const dbCache = new Map<string, Database.Database>()
let current: Database.Database | null = null

/** 计算默认 db 文件路径：<workspace>/.mesync/db/resonance.db */
export function defaultDbPath(projectRoot: string): string {
  return path.join(projectRoot, '.mesync', 'db', 'resonance.db')
}

/**
 * 初始化指定 workspace 的数据库（幂等，重复调用返回缓存实例）。
 * db 文件固定放在 <workspace>/.mesync/db/resonance.db。
 */
export function initDB(projectRoot: string): Database.Database {
  const cached = dbCache.get(projectRoot)
  if (cached) {
    current = cached
    return cached
  }

  const dbFile = defaultDbPath(projectRoot)
  const dir = path.dirname(dbFile)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)

  // 初始化 meta
  const now = new Date().toISOString()
  db.prepare('INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('schema_version', '1', now)

  dbCache.set(projectRoot, db)
  current = db
  return db
}

/** 获取当前 db 实例（需先 initDB） */
export function getDB(): Database.Database {
  if (!current) throw new Error('DB not initialized. Call initDB() first.')
  return current
}

/** 关闭所有缓存的 db 实例 */
export function closeDB(): void {
  for (const db of dbCache.values()) {
    db.close()
  }
  dbCache.clear()
  current = null
}
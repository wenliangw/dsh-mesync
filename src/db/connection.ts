// db/connection — SQLite 连接管理
// 固定路径：<workspace>/.mesync/db/resonance.db
// 多实例缓存：按 projectRoot 缓存，项目级记忆需要每个 workspace 独立

import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { SCHEMA_SQL } from './schema.js'

/** 缓存条目：连接实例 + 打开时对应的 db 文件路径（用于校验文件是否已被删除） */
interface DbEntry {
  db: Database.Database
  dbFile: string
}

/**
 * 按 projectRoot 缓存的连接表。
 * 缓存有效性以「db 文件是否真实存在于磁盘」为准：
 * 若文件被手动删除（如删掉整个 .mesync/），旧连接失效，重建。
 */
const dbCache = new Map<string, DbEntry>()

/** 当前生效的 projectRoot（getDB 据此取实例，避免全局单例串 workspace） */
let currentRoot: string | null = null

/** 计算默认 db 文件路径：<workspace>/.mesync/db/resonance.db */
function defaultDbPath(projectRoot: string): string {
  return path.join(projectRoot, '.mesync', 'db', 'resonance.db')
}

/**
 * 初始化指定 workspace 的数据库（幂等）。
 *
 * 连接生命周期绑定「真实的 db 文件」：
 * - 文件存在 + 缓存命中 → 复用缓存实例
 * - 文件被删除（.mesync 被手动删掉）→ 关闭旧连接、清除缓存、重建
 *
 * 这样即使 dsh 进程不重启，删除 .mesync 后重新对话也会拿到全新的空库，
 * hasWikiData() 返回 false，触发首次全量生成。
 */
export function initDB(projectRoot: string): Database.Database {
  const dbFile = defaultDbPath(projectRoot)

  // 缓存命中：校验 db 文件是否仍真实存在。被删则视为失效，关闭旧连接。
  const cached = dbCache.get(projectRoot)
  if (cached) {
    if (fs.existsSync(cached.dbFile)) {
      currentRoot = projectRoot
      return cached.db
    }
    // 文件已不存在 → 关闭旧连接并移除缓存，走重建流程
    try {
      cached.db.close()
    } catch {
      // 连接可能已处于异常状态，忽略关闭错误
    }
    dbCache.delete(projectRoot)
    console.warn(`[mesync] db file missing (${cached.dbFile}), recreating connection`)
  }

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

  dbCache.set(projectRoot, { db, dbFile })
  currentRoot = projectRoot
  return db
}

/** 获取当前 db 实例（需先 initDB） */
export function getDB(): Database.Database {
  if (!currentRoot) throw new Error('DB not initialized. Call initDB() first.')
  const entry = dbCache.get(currentRoot)
  if (!entry) throw new Error('DB not initialized. Call initDB() first.')
  return entry.db
}

/** 关闭所有缓存的 db 实例 */
export function closeDB(): void {
  for (const entry of dbCache.values()) {
    entry.db.close()
  }
  dbCache.clear()
  currentRoot = null
}
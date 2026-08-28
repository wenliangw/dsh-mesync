// connection.test.ts — db 连接生命周期测试
// 核心场景：dsh 进程不重启的情况下，手动删除 .mesync 后重新 initDB，
// 必须拿到全新的空库（而非持有已删除文件的旧连接）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initDB, getDB, closeDB, defaultDbPath } from '../src/db/connection.js'
import { hasWikiData } from '../src/db/wiki.js'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mesync-conn-'))
})

afterEach(() => {
  closeDB()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('initDB 连接生命周期', () => {
  it('首次 initDB 后 hasWikiData() 为 false（空库）', () => {
    initDB(tmpRoot)
    expect(hasWikiData()).toBe(false)
  })

  it('写入 wiki 数据后，不重启（同一进程）删除 .mesync 并重新 initDB，应回到空库状态', () => {
    // 1. 初始化并写入一条 wiki 数据（模拟已初始化状态）
    initDB(tmpRoot)
    const db = getDB()
    db.prepare(
      'INSERT INTO wiki_pages (path, updated_at, source) VALUES (?, ?, ?)'
    ).run('overview.md', new Date().toISOString(), 'initial')
    expect(hasWikiData()).toBe(true)

    // 2. 模拟「手动删除 .mesync 文件夹」（进程未重启，缓存仍在）
    const dbFile = defaultDbPath(tmpRoot)
    expect(fs.existsSync(dbFile)).toBe(true)
    fs.rmSync(path.join(tmpRoot, '.mesync'), { recursive: true, force: true })
    expect(fs.existsSync(dbFile)).toBe(false)

    // 3. 重新 initDB：必须检测到文件已删除，重建连接，拿到空库
    initDB(tmpRoot)
    expect(hasWikiData()).toBe(false)
  })

  it('不删除文件时，重复 initDB 复用同一连接（幂等）', () => {
    const a = initDB(tmpRoot)
    const b = initDB(tmpRoot)
    expect(a).toBe(b)
    // 连接仍有效：能正常读写
    expect(hasWikiData()).toBe(false)
  })
})

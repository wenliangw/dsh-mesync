// DB — SQLite 操作层
// 管理 .mesync/resonance.db 的初始化、迁移和 CRUD

import Database from 'better-sqlite3'
import * as path from 'node:path'
import * as fs from 'node:fs'

// ---- 类型定义 ----

export interface DecisionNode {
  id: string
  created_at: string
  session_id: string | null
  decision: string
  trigger: string | null
  rationale: string
  evidence: string | null
  outcome: 'adopted' | 'reverted' | 'refined' | 'pending'
  caused_by: string | null
  supersedes: string | null
  alternatives: Alternative[]
  taste_signals: TasteSignalRef[]
}

export interface Alternative {
  option: string
  why_not: string
}

export interface TasteSignalRef {
  signal: string
  context: string
}

export interface TasteSignal {
  id: string
  signal: string
  weight: number
  examples: string[] // DecisionNode id 列表
  updated_at: string
}

export interface ManualTaste {
  id: string
  content: string
  parsed_signals: ParsedSignal[]
  created_at: string
  updated_at: string
}

export interface ParsedSignal {
  signal: string
  context: string
}

export interface AntiPattern {
  id: string
  pattern: string
  context: string | null
  from_decisions: string[]
  from_manual: string | null
  updated_at: string
}

export interface RealitySnapshot {
  id: string
  version: number
  created_at: string
  session_id: string | null
  overview: string | null
  tech_stack: Record<string, unknown>
  architecture: Record<string, unknown>
  modules: ModuleInfo[]
  data_flow: Record<string, unknown>
  constraints: string[]
  diff_summary: string | null
}

export interface ModuleInfo {
  name: string
  desc: string
  status: 'stable' | 'evolving' | 'planned'
  path: string
}

// ---- 数据库管理 ----

let db: Database.Database | null = null

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  session_id    TEXT,
  decision      TEXT NOT NULL,
  trigger       TEXT,
  rationale     TEXT NOT NULL,
  evidence      TEXT,
  outcome       TEXT NOT NULL DEFAULT 'adopted',
  caused_by     TEXT,
  supersedes    TEXT,
  alternatives  TEXT NOT NULL DEFAULT '[]',
  taste_signals TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_caused_by ON decisions(caused_by);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decisions(outcome);

CREATE TABLE IF NOT EXISTS taste_signals (
  id            TEXT PRIMARY KEY,
  signal        TEXT NOT NULL,
  weight        REAL NOT NULL DEFAULT 0.0,
  examples      TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_taste_signal ON taste_signals(signal);

CREATE TABLE IF NOT EXISTS taste_manual (
  id             TEXT PRIMARY KEY,
  content        TEXT NOT NULL,
  parsed_signals TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anti_patterns (
  id             TEXT PRIMARY KEY,
  pattern        TEXT NOT NULL,
  context        TEXT,
  from_decisions  TEXT NOT NULL DEFAULT '[]',
  from_manual    TEXT,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reality_snapshots (
  id            TEXT PRIMARY KEY,
  version       INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  session_id    TEXT,
  overview      TEXT,
  tech_stack    TEXT NOT NULL DEFAULT '{}',
  architecture  TEXT NOT NULL DEFAULT '{}',
  modules       TEXT NOT NULL DEFAULT '[]',
  data_flow     TEXT NOT NULL DEFAULT '{}',
  constraints   TEXT NOT NULL DEFAULT '[]',
  diff_summary  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reality_version ON reality_snapshots(version DESC);

CREATE TABLE IF NOT EXISTS meta (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
`

export function initDB(projectRoot: string, dbPath?: string): Database.Database {
  if (db) return db

  const resolvedPath = dbPath ?? path.join(projectRoot, '.mesync', 'resonance.db')
  const dir = path.dirname(resolvedPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(SCHEMA_SQL)

  // 初始化 meta
  const now = new Date().toISOString()
  const initMeta = db.prepare(
    'INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES (?, ?, ?)'
  )
  initMeta.run('schema_version', '1', now)
  initMeta.run('project_name', '', now)

  return db
}

export function getDB(): Database.Database {
  if (!db) throw new Error('DB not initialized. Call initDB() first.')
  return db
}

export function closeDB(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ---- Decisions CRUD ----

export function insertDecision(node: DecisionNode): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO decisions (id, created_at, session_id, decision, trigger, rationale,
      evidence, outcome, caused_by, supersedes, alternatives, taste_signals)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    node.id, node.created_at, node.session_id, node.decision, node.trigger,
    node.rationale, node.evidence, node.outcome, node.caused_by, node.supersedes,
    JSON.stringify(node.alternatives), JSON.stringify(node.taste_signals)
  )
}

export function getDecisionChain(nodeId: string): DecisionNode[] {
  const d = getDB()
  const chain: DecisionNode[] = []

  // 向上追溯 caused_by
  let current: string | null = nodeId
  while (current) {
    const row = d.prepare('SELECT * FROM decisions WHERE id = ?').get(current) as any
    if (!row) break
    chain.unshift(rowToDecision(row))
    current = row.caused_by
  }

  // 向下追溯：找到以当前节点为 caused_by 的节点
  current = nodeId
  const children = d.prepare('SELECT * FROM decisions WHERE caused_by = ? ORDER BY created_at ASC').all(current) as any[]
  for (const child of children) {
    chain.push(rowToDecision(child))
  }

  return chain
}

export function searchDecisions(query: string, limit = 10): DecisionNode[] {
  const d = getDB()
  const like = `%${query}%`
  const rows = d.prepare(
    `SELECT * FROM decisions WHERE decision LIKE ? OR rationale LIKE ? OR trigger LIKE ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(like, like, like, limit) as any[]
  return rows.map(rowToDecision)
}

export function getRecentDecisions(limit = 10): DecisionNode[] {
  const d = getDB()
  const rows = d.prepare(
    'SELECT * FROM decisions WHERE outcome = ? ORDER BY created_at DESC LIMIT ?'
  ).all('adopted', limit) as any[]
  return rows.map(rowToDecision)
}

function rowToDecision(row: any): DecisionNode {
  return {
    ...row,
    alternatives: JSON.parse(row.alternatives || '[]'),
    taste_signals: JSON.parse(row.taste_signals || '[]'),
  }
}

// ---- Taste CRUD ----

export function upsertTasteSignal(signal: string, weight: number, exampleId: string): void {
  const d = getDB()
  const now = new Date().toISOString()
  const existing = d.prepare('SELECT * FROM taste_signals WHERE signal = ?').get(signal) as any

  if (existing) {
    const examples = JSON.parse(existing.examples || '[]')
    if (!examples.includes(exampleId)) examples.push(exampleId)
    const newWeight = (existing.weight * examples.length + weight) / (examples.length + 1)
    d.prepare(
      'UPDATE taste_signals SET weight = ?, examples = ?, updated_at = ? WHERE signal = ?'
    ).run(newWeight, JSON.stringify(examples), now, signal)
  } else {
    const id = crypto.randomUUID()
    d.prepare(
      'INSERT INTO taste_signals (id, signal, weight, examples, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, signal, weight, JSON.stringify([exampleId]), now)
  }
}

export function getTasteProfile(): TasteSignal[] {
  const d = getDB()
  return (d.prepare('SELECT * FROM taste_signals ORDER BY weight DESC').all() as any[])
    .map((r: any) => ({ ...r, examples: JSON.parse(r.examples || '[]') }))
}

export function updateManualTaste(content: string, parsedSignals: ParsedSignal[]): void {
  const d = getDB()
  const now = new Date().toISOString()
  const existing = d.prepare('SELECT * FROM taste_manual LIMIT 1').get() as any

  if (existing) {
    d.prepare(
      'UPDATE taste_manual SET content = ?, parsed_signals = ?, updated_at = ? WHERE id = ?'
    ).run(content, JSON.stringify(parsedSignals), now, existing.id)
  } else {
    d.prepare(
      'INSERT INTO taste_manual (id, content, parsed_signals, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), content, JSON.stringify(parsedSignals), now, now)
  }
}

export function getManualTaste(): ManualTaste | null {
  const d = getDB()
  const row = d.prepare('SELECT * FROM taste_manual LIMIT 1').get() as any
  if (!row) return null
  return { ...row, parsed_signals: JSON.parse(row.parsed_signals || '[]') }
}

// ---- AntiPatterns CRUD ----

export function getAntiPatterns(): AntiPattern[] {
  const d = getDB()
  return (d.prepare('SELECT * FROM anti_patterns').all() as any[])
    .map((r: any) => ({ ...r, from_decisions: JSON.parse(r.from_decisions || '[]') }))
}

// ---- Reality CRUD ----

export function getLatestReality(): RealitySnapshot | null {
  const d = getDB()
  const row = d.prepare(
    'SELECT * FROM reality_snapshots ORDER BY version DESC LIMIT 1'
  ).get() as any
  if (!row) return null
  return rowToReality(row)
}

export function createRealitySnapshot(snapshot: RealitySnapshot): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO reality_snapshots (id, version, created_at, session_id, overview,
      tech_stack, architecture, modules, data_flow, constraints, diff_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.id, snapshot.version, snapshot.created_at, snapshot.session_id,
    snapshot.overview, JSON.stringify(snapshot.tech_stack),
    JSON.stringify(snapshot.architecture), JSON.stringify(snapshot.modules),
    JSON.stringify(snapshot.data_flow), JSON.stringify(snapshot.constraints),
    snapshot.diff_summary
  )
}

export function getNextRealityVersion(): number {
  const d = getDB()
  const row = d.prepare('SELECT MAX(version) as max FROM reality_snapshots').get() as any
  return (row?.max ?? 0) + 1
}

function rowToReality(row: any): RealitySnapshot {
  return {
    ...row,
    tech_stack: JSON.parse(row.tech_stack || '{}'),
    architecture: JSON.parse(row.architecture || '{}'),
    modules: JSON.parse(row.modules || '[]'),
    data_flow: JSON.parse(row.data_flow || '{}'),
    constraints: JSON.parse(row.constraints || '[]'),
  }
}
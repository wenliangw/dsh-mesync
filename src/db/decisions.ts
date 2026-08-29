// db/decisions — decisions 表 CRUD

import { getDB } from './connection.js'
import type { DecisionNode } from './types.js'

export function insertDecision(node: DecisionNode): void {
  const d = getDB()
  d.prepare(`
    INSERT INTO decisions (id, created_at, session_id, decision, trigger, rationale,
      evidence, outcome, caused_by, supersedes, alternatives, taste_signals, scopes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    node.id, node.created_at, node.session_id, node.decision, node.trigger,
    node.rationale, node.evidence, node.outcome, node.caused_by, node.supersedes,
    JSON.stringify(node.alternatives), JSON.stringify(node.taste_signals),
    JSON.stringify(node.scopes ?? [])
  )
}

/** 按关键词模糊匹配决策（decision/rationale/trigger 字段）。 */
export function searchDecisions(query: string, limit = 10): DecisionNode[] {
  const d = getDB()
  const like = `%${query}%`
  const rows = d.prepare(
    `SELECT * FROM decisions WHERE decision LIKE ? OR rationale LIKE ? OR trigger LIKE ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(like, like, like, limit) as any[]
  return rows.map(rowToDecision)
}

/** 按分类标签（scope）粗筛决策，返回该分类下的决策（时间倒序）。 */
export function searchDecisionsByScope(scope: string, limit = 50): DecisionNode[] {
  const d = getDB()
  const rows = d.prepare(
    'SELECT * FROM decisions WHERE scopes LIKE ? ORDER BY created_at DESC LIMIT ?'
  ).all(`%${scope}%`, limit) as any[]
  return rows.map(rowToDecision)
}

/** 按 id 精确取一条决策。 */
export function getDecisionById(id: string): DecisionNode | null {
  const d = getDB()
  const row = d.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as any
  return row ? rowToDecision(row) : null
}

/** 取最近的已采纳（adopted）决策。 */
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
    scopes: JSON.parse(row.scopes || '[]'),
  }
}

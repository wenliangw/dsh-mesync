// db/decisions — decisions 表 CRUD

import { getDB } from './connection.js'
import type { DecisionNode } from './types.js'

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
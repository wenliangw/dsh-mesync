// Decisions — 决策管理
// 提供决策的写入、查询、因果链构建等高层接口

import { insertDecision, getDecisionChain, searchDecisions, getRecentDecisions } from '../db/index.js'
import type { DecisionNode, Alternative, TasteSignalRef } from '../db/index.js'

/**
 * 创建决策节点
 */
export function createDecision(params: {
  decision: string
  rationale: string
  trigger?: string
  evidence?: string
  alternatives?: Alternative[]
  taste_signals?: TasteSignalRef[]
  outcome?: 'adopted' | 'reverted' | 'refined' | 'pending'
  caused_by?: string
  supersedes?: string
  session_id?: string
}): DecisionNode {
  const node: DecisionNode = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    session_id: params.session_id || null,
    decision: params.decision,
    trigger: params.trigger || null,
    rationale: params.rationale,
    evidence: params.evidence || null,
    outcome: params.outcome || 'adopted',
    caused_by: params.caused_by || null,
    supersedes: params.supersedes || null,
    alternatives: params.alternatives || [],
    taste_signals: params.taste_signals || [],
  }

  insertDecision(node)
  return node
}

/**
 * 查询决策链
 */
export { getDecisionChain, searchDecisions, getRecentDecisions }
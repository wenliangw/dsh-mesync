// Extractor — Agent 驱动的决策提取
// 在检测到决策信号后，调用 LLM 回顾对话，提取决策节点、品味信号和项目现状变更

import type { DecisionNode, Alternative, TasteSignalRef } from './db.js'
import type { DecisionSignal, TurnSummary } from './detector.js'

/**
 * 提取 prompt 模板
 */
const EXTRACT_PROMPT = `You are a project memory analyst. Your task is to review the conversation below and extract:

1. **Decision Nodes**: Any architectural, code-style, or business-logic decisions made.
   For each decision, capture:
   - decision: what was decided
   - rationale: why this decision was made
   - trigger: what prompted this decision
   - alternatives: what other options were considered and why rejected
   - taste_signals: what code taste / style preferences this decision reflects
   - outcome: "adopted" (default), "reverted", "refined", "pending"

2. **Taste Signals**: Any code style preferences, quality standards, or anti-patterns mentioned.
   - signal: the preference name (e.g. "prefer-explicit-over-implicit")
   - context: how it was demonstrated

3. **Project Reality Changes**: Any changes to the project's tech stack, architecture, modules, or constraints.

Respond in JSON format:
{
  "decisions": [
    {
      "decision": "...",
      "rationale": "...",
      "trigger": "...",
      "alternatives": [{"option": "...", "why_not": "..."}],
      "taste_signals": [{"signal": "...", "context": "..."}],
      "outcome": "adopted"
    }
  ],
  "taste_signals": [{"signal": "...", "context": "..."}],
  "reality_changes": {
    "description": "summary of changes to project state"
  },
  "no_decisions": false
}

If no meaningful decisions were made (just casual conversation or simple edits), set "no_decisions": true.

Conversation:
---
{conversation}
---`

/**
 * 提取结果结构
 */
export interface ExtractionResult {
  decisions: DecisionExtract[]
  taste_signals: { signal: string; context: string }[]
  reality_changes: { description: string } | null
  no_decisions: boolean
}

export interface DecisionExtract {
  decision: string
  rationale: string
  trigger: string
  alternatives: Alternative[]
  taste_signals: TasteSignalRef[]
  outcome: string
}

/**
 * 生成提取 prompt
 */
export function buildExtractPrompt(turnSummary: TurnSummary, signal: DecisionSignal): string {
  const conversation = turnSummary.userMessages.join('\n\n')
  return EXTRACT_PROMPT.replace('{conversation}', conversation)
}

/**
 * 解析 LLM 返回的提取结果
 */
export function parseExtractionResult(raw: string): ExtractionResult {
  try {
    // 尝试提取 JSON（可能被 markdown 代码块包裹）
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/)
    const json = jsonMatch ? jsonMatch[1] : raw
    return JSON.parse(json) as ExtractionResult
  } catch {
    return { decisions: [], taste_signals: [], reality_changes: null, no_decisions: true }
  }
}

/**
 * 将提取结果转换为 DecisionNode
 */
export function toDecisionNodes(extracts: DecisionExtract[]): DecisionNode[] {
  return extracts.map(e => ({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    session_id: null,
    decision: e.decision,
    trigger: e.trigger || null,
    rationale: e.rationale,
    evidence: null,
    outcome: (e.outcome as any) || 'adopted',
    caused_by: null,
    supersedes: null,
    alternatives: e.alternatives || [],
    taste_signals: e.taste_signals || [],
  }))
}
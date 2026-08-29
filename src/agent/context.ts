// agent/context — 格式化同频记忆上下文，注入 system prompt
// session-start 时注入完整上下文（wiki 速览 + 决策链 + 品味）
// pre-step 时注入即时上下文（任务匹配的决策）

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getTasteProfile,
  getAntiPatterns,
  getRecentDecisions,
  searchDecisions,
} from '../db/index.js'
import type { DecisionNode } from '../db/index.js'

/** 注入选项 */
export interface InjectOptions {
  maxDecisions?: number
  maxTasteSignals?: number
  includeWiki?: boolean
  taskQuery?: string
}

/**
 * 读取 overview.md 速览内容（若存在）。
 * overview.md 是 LLM 生成的「项目简介 + 各模块索引」。
 */
export function readOverview(projectRoot: string): string | null {
  try {
    const p = path.join(projectRoot, '.mesync', 'overview.md')
    if (!fs.existsSync(p)) return null
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

/**
 * 生成完整的同频记忆上下文（session-start 用）。
 */
export function buildResonanceContext(projectRoot: string, opts: InjectOptions = {}): string {
  const { maxDecisions = 5, maxTasteSignals = 5, includeWiki = true, taskQuery } = opts

  const sections: string[] = []

  // 1. 项目速览（LLM Wiki 的 overview.md）
  if (includeWiki) {
    const overview = readOverview(projectRoot)
    if (overview && overview.trim()) {
      sections.push('## 📋 Project Overview\n' + overview.trim())
      sections.push('')
    }
  }

  // 2. 品味和反模式
  const tasteProfile = getTasteProfile()
  const antiPatterns = getAntiPatterns()
  if (tasteProfile.length > 0 || antiPatterns.length > 0) {
    sections.push('## 🎨 Project Taste Profile')
    if (tasteProfile.length > 0) {
      for (const t of tasteProfile.slice(0, maxTasteSignals)) {
        sections.push(`- **${t.signal}** (weight: ${t.weight.toFixed(1)})`)
      }
    }
    if (antiPatterns.length > 0) {
      sections.push('### Anti-Patterns (avoid these)')
      for (const a of antiPatterns) {
        sections.push(`- **${a.pattern}**: ${a.context || ''}`)
      }
    }
    sections.push('')
  }

  // 3. 关键决策链
  const decisions: DecisionNode[] = taskQuery
    ? searchDecisions(taskQuery, maxDecisions)
    : getRecentDecisions(maxDecisions)
  if (decisions.length > 0) {
    sections.push('## 🔗 Key Decision Chain')
    for (const d of decisions) {
      sections.push(formatDecisionNode(d))
    }
    sections.push('')
  }

  if (sections.length === 0) return ''

  return `## 🔮 Resonance Memory — Project Context

${sections.join('\n')}`
}

/**
 * 生成即时上下文（pre-step 用，轻量版）。
 */
export function buildTurnContext(taskQuery: string): string {
  if (!taskQuery) return ''

  const decisions = searchDecisions(taskQuery, 3)
  if (decisions.length === 0) return ''

  const parts = ['## 🔮 Related Resonance Memory']
  for (const d of decisions) {
    parts.push(formatDecisionNode(d))
  }
  parts.push('')
  return parts.join('\n')
}

/** 格式化单个决策节点 */
function formatDecisionNode(d: DecisionNode): string {
  const parts = [`- **${d.decision}** (${d.outcome})`]
  parts.push(`  Rationale: ${d.rationale}`)
  if (d.alternatives && d.alternatives.length > 0) {
    const alts = d.alternatives.map(a => `${a.option} (${a.why_not})`).join(', ')
    parts.push(`  Alternatives: ${alts}`)
  }
  if (d.taste_signals && d.taste_signals.length > 0) {
    const tastes = d.taste_signals.map(t => t.signal).join(', ')
    parts.push(`  Taste: ${tastes}`)
  }
  return parts.join('\n')
}
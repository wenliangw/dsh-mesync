// Context Injector — 格式化同频记忆上下文注入 prompt
// 在 agent/session-start 和 agent/pre-step 时注入

import {
  getTasteProfile,
  getAntiPatterns,
  getRecentDecisions,
  searchDecisions,
  getLatestReality,
} from './db.js'
import type { DecisionNode, TasteSignal, AntiPattern, RealitySnapshot } from './db.js'

/**
 * 注入选项
 */
export interface InjectOptions {
  /** 最大决策数 */
  maxDecisions?: number
  /** 最大品味信号数 */
  maxTasteSignals?: number
  /** 是否包含项目现状 */
  includeReality?: boolean
  /** 当前任务相关的查询（用于匹配相关决策） */
  taskQuery?: string
}

/**
 * 生成完整的同频记忆上下文（session-start 用）
 */
export function buildResonanceContext(opts: InjectOptions = {}): string {
  const {
    maxDecisions = 5,
    maxTasteSignals = 5,
    includeReality = true,
    taskQuery,
  } = opts

  const sections: string[] = []

  // 1. 品味和反模式
  const tasteProfile = getTasteProfile()
  const antiPatterns = getAntiPatterns()

  if (tasteProfile.length > 0 || antiPatterns.length > 0) {
    sections.push('## 🎨 Project Taste Profile')
    if (tasteProfile.length > 0) {
      const topTaste = tasteProfile.slice(0, maxTasteSignals)
      sections.push('### Preferences')
      for (const t of topTaste) {
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

  // 2. 项目现状
  if (includeReality) {
    const reality = getLatestReality()
    if (reality && reality.version > 0) {
      sections.push(formatRealitySection(reality))
    }
  }

  // 3. 关键决策链
  let decisions: DecisionNode[]
  if (taskQuery) {
    decisions = searchDecisions(taskQuery, maxDecisions)
  } else {
    decisions = getRecentDecisions(maxDecisions)
  }

  if (decisions.length > 0) {
    sections.push('## 🔗 Key Decision Chain')
    for (const d of decisions) {
      sections.push(formatDecisionNode(d))
    }
    sections.push('')
  }

  if (sections.length === 0) {
    return ''
  }

  return `## 🔮 Resonance Memory — Project Context

The following is the project's accumulated resonance memory — decisions, tastes, and current reality. Use this to align with the project's history and preferences.

${sections.join('\n')}
---
_Use the "recall" tool to search for more specific decisions. Use "remember" to record new decisions._
`
}

/**
 * 生成即时上下文（pre-step 用，轻量版）
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

/**
 * 格式化项目现状
 */
function formatRealitySection(reality: RealitySnapshot): string {
  const parts = ['## 📋 Project Reality']

  if (reality.overview) {
    parts.push(reality.overview)
  }

  if (reality.tech_stack && Object.keys(reality.tech_stack).length > 0) {
    parts.push('### Tech Stack')
    for (const [k, v] of Object.entries(reality.tech_stack)) {
      parts.push(`- **${k}**: ${v}`)
    }
  }

  if (reality.constraints && reality.constraints.length > 0) {
    parts.push('### Constraints')
    for (const c of reality.constraints) {
      parts.push(`- ${c}`)
    }
  }

  if (reality.modules && reality.modules.length > 0) {
    parts.push('### Modules')
    for (const m of reality.modules) {
      parts.push(`- **${m.name}** (${m.status}): ${m.desc}`)
    }
  }

  parts.push(`\n_(snapshot v${reality.version})_`)
  parts.push('')
  return parts.join('\n')
}

/**
 * 格式化单个决策节点
 */
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
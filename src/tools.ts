// Tools — 注册 mesync 的 4 个 Agent 工具
// recall / remember / taste_add / reality

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  searchDecisions,
  getDecisionChain,
  getRecentDecisions,
  getTasteProfile,
  getAntiPatterns,
  getLatestReality,
  insertDecision,
  upsertTasteSignal,
  updateManualTaste,
} from './db.js'
import type { DecisionNode, Alternative, TasteSignalRef } from './db.js'

export function registerTools(ctx: Context): void {
  // ---- recall — 查询历史决策 ----
  ctx.tools.register(defineTool({
    name: 'recall',
    description:
      'Search the project resonance memory for related decisions, taste signals, and context. ' +
      'Use this when you need to understand why something was done a certain way, ' +
      'or when you need to align with the project\'s taste preferences.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'What you want to search for — keywords, concepts, or question.',
      },
      mode: {
        type: 'string',
        description: 'What to search: "decisions" (default), "taste", "all".',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => {
        return [{ type: 'text', text: value }]
      },
    },
    async execute(args: { query: string; mode?: string }, _exec: any) {
      const mode = args.mode || 'all'
      const parts: string[] = []

      if (mode === 'decisions' || mode === 'all') {
        const decisions = searchDecisions(args.query)
        if (decisions.length > 0) {
          parts.push('## Related Decisions')
          for (const d of decisions) {
            parts.push(`- **${d.decision}** (${d.outcome})`)
            parts.push(`  Rationale: ${d.rationale}`)
            if (d.alternatives?.length) {
              parts.push(`  Alternatives: ${d.alternatives.map(a => `${a.option} (${a.why_not})`).join(', ')}`)
            }
          }
        }
      }
      if (mode === 'taste' || mode === 'all') {
        const taste = getTasteProfile()
        if (taste.length > 0) {
          parts.push('## Taste Signals')
          for (const t of taste) {
            parts.push(`- **${t.signal}** (weight: ${t.weight.toFixed(1)})`)
          }
        }
      }
      if (mode === 'all') {
        const anti = getAntiPatterns()
        if (anti.length > 0) {
          parts.push('## Anti-Patterns')
          for (const a of anti) {
            parts.push(`- ${a.pattern}: ${a.context || ''}`)
          }
        }
      }
      return parts.join('\n\n') || 'No results found.'
    },
  }))

  // ---- remember — 手动标记决策节点 ----
  ctx.tools.register(defineTool({
    name: 'remember',
    description:
      'Explicitly record a decision node in the project resonance memory. ' +
      'Use this when the user explicitly says "remember this" or when you made a significant ' +
      'architectural/code-style/business-logic decision that should be remembered.',
    parameters: {
      decision: {
        type: 'string',
        required: true,
        description: 'What decision was made.',
      },
      rationale: {
        type: 'string',
        required: true,
        description: 'Why this decision was made.',
      },
      trigger: {
        type: 'string',
        description: 'What triggered this decision.',
      },
      alternatives: {
        type: 'string',
        description: 'JSON array of {option, why_not} alternatives considered.',
      },
      taste_signals: {
        type: 'string',
        description: 'JSON array of {signal, context} taste signals.',
      },
      outcome: {
        type: 'string',
        description: 'Outcome: "adopted" (default), "reverted", "refined", "pending".',
      },
      caused_by: {
        type: 'string',
        description: 'ID of the decision that caused this one (for causal chain).',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => {
        return [{ type: 'text', text: value }]
      },
    },
    async execute(args: {
      decision: string
      rationale: string
      trigger?: string
      alternatives?: string
      taste_signals?: string
      outcome?: string
      caused_by?: string
    }, _exec: any) {
      let alts: Alternative[] = []
      let tastes: TasteSignalRef[] = []
      try {
        if (args.alternatives) alts = JSON.parse(args.alternatives)
        if (args.taste_signals) tastes = JSON.parse(args.taste_signals)
      } catch {
        // ignore parse errors
      }

      const node: DecisionNode = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        session_id: null,
        decision: args.decision,
        trigger: args.trigger || null,
        rationale: args.rationale,
        evidence: null,
        outcome: (args.outcome as any) || 'adopted',
        caused_by: args.caused_by || null,
        supersedes: null,
        alternatives: alts,
        taste_signals: tastes,
      }
      insertDecision(node)

      for (const ts of tastes) {
        upsertTasteSignal(ts.signal, 0.5, node.id)
      }

      return `✅ Decision recorded: **${node.decision}** (${node.id})`
    },
  }))

  // ---- taste_add — 手动添加品味信号 ----
  ctx.tools.register(defineTool({
    name: 'taste_add',
    description:
      'Add a taste preference to the project. Taste signals guide future agents on code style, ' +
      'architecture patterns, and quality standards. Use when the user expresses a style preference.',
    parameters: {
      signal: {
        type: 'string',
        required: true,
        description: 'The taste signal, e.g. "prefer-explicit-over-implicit", "avoid-premature-abstraction".',
      },
      context: {
        type: 'string',
        description: 'Context or example of this taste signal.',
      },
      weight: {
        type: 'number',
        description: 'Importance weight 0-1 (default 0.5).',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => {
        return [{ type: 'text', text: value }]
      },
    },
    async execute(args: { signal: string; context?: string; weight?: number }, _exec: any) {
      const weight = args.weight || 0.5
      const placeholderId = `manual_${crypto.randomUUID()}`
      upsertTasteSignal(args.signal, weight, placeholderId)

      if (args.context) {
        updateManualTaste(
          `[${args.signal}] ${args.context}`,
          [{ signal: args.signal, context: args.context }]
        )
      }

      return `✅ Taste signal updated: **${args.signal}** (weight: ${weight.toFixed(1)})`
    },
  }))

  // ---- reality — 查看项目现状 ----
  ctx.tools.register(defineTool({
    name: 'reality',
    description:
      'View the current project reality snapshot — tech stack, architecture, module structure, ' +
      'constraints, and data flow. Use this when you need to understand the project\'s current state.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => {
        return [{ type: 'text', text: value }]
      },
    },
    async execute(_args: {}, _exec: any) {
      const reality = getLatestReality()
      if (!reality) return 'No project reality snapshot yet. It will be created automatically after the first session.'

      const parts: string[] = []
      if (reality.overview) parts.push(`## Overview\n${reality.overview}`)
      if (reality.tech_stack && Object.keys(reality.tech_stack).length > 0) {
        parts.push(`## Tech Stack\n${Object.entries(reality.tech_stack).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
      }
      if (reality.constraints?.length) {
        parts.push(`## Constraints\n${reality.constraints.map(c => `- ${c}`).join('\n')}`)
      }
      if (reality.modules?.length) {
        parts.push(`## Modules\n${reality.modules.map(m => `- ${m.name} (${m.status}): ${m.desc}`).join('\n')}`)
      }
      parts.push(`\n_(snapshot v${reality.version})_`)
      return parts.join('\n\n')
    },
  }))
}
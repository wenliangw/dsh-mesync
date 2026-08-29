// agent/tools — 注册 mesync 的 Agent 工具
// recall / remember / reality / mesync_sync_wiki
//
// 注意：品味（taste）不再存 sqlite，改为 tastes/ 下的 md 文件（由主 agent 用
// 原生 write 工具读写）。sqlite 只存 decisions（决策链 + taste_signals 因果关联）。
// 通过模块级 currentProjectRoot 感知当前 workspace（由 events 在 session-start 设置）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  searchDecisions,
  insertDecision,
  syncWikiFromFiles,
  listWikiPages,
} from '../db/index.js'
import type { DecisionNode, Alternative, TasteSignalRef } from '../db/index.js'

/** 当前活跃的 workspace（由 events 在 session-start 时设置） */
let currentProjectRoot: string | null = null

/** 设置当前 workspace（供 reality 工具读取 wiki 文档） */
export function setCurrentProjectRoot(root: string | null): void {
  currentProjectRoot = root
}

export function registerTools(ctx: Context): void {
  // ---- recall — 查询历史决策 ----
  ctx.tools.register(defineTool({
    name: 'recall',
    description:
      'Search the project resonance memory for related decisions and their rationale. ' +
      'Use this when you need to understand why something was done a certain way, or ' +
      'before making a new decision to find a matching historical decision.',
    parameters: {
      query: { type: 'string', required: true, description: 'What to search for — keywords or concepts.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: { query: string }, _exec: any) {
      const decisions = searchDecisions(args.query)
      if (decisions.length === 0) return 'No related decisions found.'

      const parts = ['## Related Decisions']
      for (const d of decisions) {
        parts.push(`- **${d.decision}** (${d.outcome})`)
        parts.push(`  Rationale: ${d.rationale}`)
        if (d.alternatives?.length) {
          parts.push(`  Alternatives: ${d.alternatives.map(a => `${a.option} (${a.why_not})`).join(', ')}`)
        }
        if (d.taste_signals?.length) {
          parts.push(`  Taste signals: ${d.taste_signals.map(t => t.signal).join(', ')}`)
        }
      }
      return parts.join('\n')
    },
  }))

  // ---- remember — 手动标记决策节点 ----
  ctx.tools.register(defineTool({
    name: 'remember',
    description:
      'Record a decision node in the project resonance memory. Use when the user says "remember this" ' +
      'or when a significant architectural/code-style/business decision was made.',
    parameters: {
      decision: { type: 'string', required: true, description: 'What decision was made.' },
      rationale: { type: 'string', required: true, description: 'Why this decision.' },
      trigger: { type: 'string', description: 'What triggered it.' },
      alternatives: { type: 'string', description: 'JSON array of {option, why_not}.' },
      taste_signals: { type: 'string', description: 'JSON array of {signal, context}.' },
      outcome: { type: 'string', description: '"adopted" (default) / "reverted" / "refined" / "pending".' },
      caused_by: { type: 'string', description: 'ID of the decision that caused this one.' },
      supersedes: { type: 'string', description: 'ID of the previous decision this one replaces/overrides.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(args: {
      decision: string
      rationale: string
      trigger?: string
      alternatives?: string
      taste_signals?: string
      outcome?: string
      caused_by?: string
      supersedes?: string
    }, _exec: any) {
      let alts: Alternative[] = []
      let tastes: TasteSignalRef[] = []
      try {
        if (args.alternatives) alts = JSON.parse(args.alternatives)
        if (args.taste_signals) tastes = JSON.parse(args.taste_signals)
      } catch { /* ignore */ }

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
        supersedes: args.supersedes || null,
        alternatives: alts,
        taste_signals: tastes,
      }
      insertDecision(node)

      return `✅ Decision recorded: **${node.decision}** (${node.id})`
    },
  }))

  // ---- reality — 查看项目认知（读 wiki 文档）----
  ctx.tools.register(defineTool({
    name: 'reality',
    description:
      'View the project overview — a summary of what the project is, its tech stack and module index. ' +
      'This is generated and maintained by mesync automatically.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(_args: {}, _exec: any) {
      if (!currentProjectRoot) {
        return 'No workspace selected. Start a session with a workspace first.'
      }
      const overviewPath = path.join(currentProjectRoot, '.mesync', 'overview.md')
      if (!fs.existsSync(overviewPath)) {
        return 'No project overview yet. It will be generated automatically on the first session.'
      }
      return fs.readFileSync(overviewPath, 'utf-8')
    },
  }))

  // ---- mesync_sync_wiki — 写完 wiki 文档后，同步进 sqlite 索引 ----
  // 主 agent 按规则探索项目并 write 了 .mesync/ 下的 md 文档后，调用本工具
  // 把文档扫描进 sqlite 的 wiki_pages 索引（供后续检索/增量判断用）。
  ctx.tools.register(defineTool({
    name: 'mesync_sync_wiki',
    description:
      'Sync the wiki documents you just wrote under .mesync/ into the resonance index. ' +
      'Call this AFTER you have finished writing .mesync/overview.md and/or .mesync/wiki/*.md ' +
      'so the resonance memory knows which documents exist.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: any) => [{ type: 'text', text: value }],
    },
    async execute(_args: {}, _exec: any) {
      if (!currentProjectRoot) {
        return 'No workspace selected. Start a session with a workspace first.'
      }
      const count = syncWikiFromFiles(currentProjectRoot, null, 'manual')
      const pages = listWikiPages().map(p => p.path)
      return `✅ Synced ${count} wiki document(s) to the resonance index.` +
        (pages.length > 0 ? `\nIndexed paths:\n${pages.map(p => `- ${p}`).join('\n')}` : '')
    },
  }))
}
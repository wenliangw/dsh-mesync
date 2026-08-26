// Mesync — 同频记忆引擎
// DeepSeek Harness 插件，实现项目级因果链、品味画像和项目现状的自动提取与注入。
//
// 四个集成点：
// 1. agent/session-start — 注入同频记忆上下文到 system prompt
// 2. agent/pre-step — 按任务匹配注入即时上下文
// 3. agent/turn-stopping — 检测决策信号，触发 Agent 提取
// 4. 工具注册 — recall / remember / taste_add / reality

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { initDB, closeDB, getLatestReality } from './db.js'
import { registerTools } from './tools.js'
import { detectDecisionSignal } from './detector.js'
import type { TurnSummary } from './detector.js'
import { buildExtractPrompt, parseExtractionResult, toDecisionNodes } from './extractor.js'
import { buildResonanceContext, buildTurnContext } from './context-injector.js'
import { scanProjectReality } from './reality.js'
import { updateTasteFromDecision, loadManualTaste } from './taste.js'
import { createDecision } from './decisions.js'

// ---- 配置 ----

export const name = 'mesync'

export interface Config {
  /** 数据库路径，默认 '.mesync/resonance.db' */
  dbPath: string
  /** 提取用的模型，为空则复用当前模型 */
  extractModel: string
  /** 是否自动提取决策，默认 true */
  autoExtract: boolean
  /** 品味手动声明路径，默认 '.mesync/tastes/'（支持目录批量加载） */
  tastePath: string
  /** 注入上下文时最多带几条决策，默认 5 */
  maxContextDecisions: number
}

export const Config: Schema<Config> = Schema.object({
  dbPath: Schema.string().default('.mesync/resonance.db'),
  extractModel: Schema.string().default(''),
  autoExtract: Schema.boolean().default(true),
  tastePath: Schema.string().default('.mesync/tastes/'),
  maxContextDecisions: Schema.number().default(5),
})

export const inject = ['tools', 'systemPrompt', 'llm']

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  // 确定项目根目录
  const projectRoot = process.env.DSH_PROJECT_ROOT || process.cwd()

  // 初始化数据库
  initDB(projectRoot, config.dbPath)

  // 加载手动品味声明
  const path = require('node:path')
  const tastePath = config.tastePath.startsWith('/')
    ? config.tastePath
    : path.join(projectRoot, config.tastePath)
  loadManualTaste(tastePath)

  // 注册工具
  registerTools(ctx)

  // ---- 集成点 1: agent/session-start — 注入同频记忆上下文 ----
  ctx.on('agent/session-start', () => {
    const context = buildResonanceContext({
      maxDecisions: config.maxContextDecisions,
      includeReality: true,
    })

    if (context) {
      ctx.systemPrompt.section({
        name: 'mesync-resonance',
        order: 150,
        text: context,
      })
    }
  })

  // ---- 集成点 2: agent/pre-step — 按任务匹配注入即时上下文 ----
  ctx.on('agent/pre-step', async (payload: any, next: () => Promise<any>) => {
    try {
      const messages = payload.messages
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.type === 'user') {
          const text = (lastMessage.content as any[])
            ?.map((c: any) => c.text || '')
            .join(' ') || ''
          if (text.length > 0) {
            const turnContext = buildTurnContext(text)
            if (turnContext) {
              ctx.systemPrompt.context({
                name: 'mesync-turn',
                order: 160,
                text: turnContext,
              })
            }
          }
        }
      }
    } catch {
      // 上下文注入失败不影响对话
    }
    return next()
  })

  // ---- 集成点 3: agent/turn-stopping — 检测决策信号 ----
  if (config.autoExtract) {
    ctx.on('agent/turn-stopping', async () => {
      try {
        // Phase 1: 简化版 TurnSummary
        const summary = buildTurnSummary()
        if (!summary) return

        const signals = detectDecisionSignal(summary)
        if (!signals) return

        const signal = signals[0]
        const prompt = buildExtractPrompt(summary, signal)

        const llm = (ctx as any).llm
        if (!llm) {
          console.warn('[mesync] LLM service not available, skipping extraction')
          return
        }

        // 调用 LLM stream
        const messages = [
          { role: 'system' as const, content: 'You are a project memory analyst. Respond in JSON only.' },
          { role: 'user' as const, content: prompt },
        ]

        const model = config.extractModel || undefined
        let raw = ''

        try {
          // dsh llm API: llm.stream(messages, options) → AsyncIterable<Chunk>
          const stream = llm.stream(messages, { model })
          for await (const chunk of stream) {
            if (chunk.type === 'text-delta' || chunk.type === 'text') {
              raw += chunk.text || ''
            }
          }
        } catch {
          // LLM 调用失败，跳过提取
          console.warn('[mesync] LLM extraction call failed, skipping')
          return
        }

        const result = parseExtractionResult(raw)

        if (result.no_decisions) return

        // 写入决策节点
        const nodes = toDecisionNodes(result.decisions)
        for (const node of nodes) {
          createDecision({
            decision: node.decision,
            rationale: node.rationale,
            trigger: node.trigger || undefined,
            alternatives: node.alternatives,
            taste_signals: node.taste_signals,
            outcome: node.outcome,
          })

          updateTasteFromDecision(node.id, node.taste_signals)
        }
      } catch (err) {
        console.error('[mesync] Extraction failed:', err)
      }
    })
  }

  // 注册清理
  ctx.effect(() => {
    return () => {
      closeDB()
    }
  })
}

/**
 * 构建 TurnSummary
 * Phase 1 简化版 — 后续版本会从 session event 流中收集完整信息
 */
function buildTurnSummary(): TurnSummary | null {
  // Phase 1: 返回基础 TurnSummary，至少能检测"记住"关键词
  // 后续版本会从 session events 中收集信息
  return {
    userMessages: [],
    toolCalls: [],
    filesModified: [],
    hasExplicitChoice: false,
    hasRememberKeyword: false,
    repeatCount: 0,
    moduleCount: 0,
  }
}
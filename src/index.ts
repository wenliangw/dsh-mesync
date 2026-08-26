// Mesync — 同频记忆引擎
// DeepSeek Harness 插件，实现项目级因果链、品味画像和项目现状的自动提取与注入。
//
// 四个集成点：
// 1. agent/session-start — 定位 workspace + 刷新现状 + 注入同频记忆上下文
// 2. agent/pre-step — 按任务匹配注入即时上下文
// 3. agent/turn-stopping — 检测决策信号，触发 Agent 提取
// 4. 工具注册 — recall / remember / taste_add / reality
//
// 项目级记忆：每个 workspace（dsh 里选的目录）拥有独立的 .mesync/resonance.db。
// projectRoot 从 agent.session.header.cwd 获取，而非环境变量或进程 cwd。

import * as path from 'node:path'
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
  /** 数据库文件名，默认 'resonance.db'（放在每个 workspace 的 .mesync/ 下） */
  dbPath: string
  /** 提取用的模型，为空则复用当前模型 */
  extractModel: string
  /** 是否自动提取决策，默认 true */
  autoExtract: boolean
  /** 品味声明路径（相对 workspace 的 .mesync/tastes/），支持目录批量加载 */
  tastePath: string
  /** 注入上下文时最多带几条决策，默认 5 */
  maxContextDecisions: number
}

export const Config: Schema<Config> = Schema.object({
  dbPath: Schema.string().default('resonance.db'),
  extractModel: Schema.string().default(''),
  autoExtract: Schema.boolean().default(true),
  tastePath: Schema.string().default('.mesync/tastes/'),
  maxContextDecisions: Schema.number().default(5),
})

export const inject = ['tools', 'systemPrompt', 'llm']

/**
 * 从 agent 的 session header 解析 workspace（项目根目录）。
 * dsh 的「Choose workspace」选中的目录就是 session.header.cwd。
 */
function resolveProjectRoot(agent: any): string | null {
  try {
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    return null
  } catch {
    return null
  }
}

/**
 * 为指定 workspace 初始化 mesync（db + 品味加载 + 现状扫描）。
 * 每个 workspace 独立，db 放在 <workspace>/.mesync/<dbPath> 下。
 */
function ensureWorkspaceInitialized(projectRoot: string, config: Config): void {
  // 初始化数据库（db 文件放在 workspace 的 .mesync/ 目录下）
  const dbFile = path.join(projectRoot, '.mesync', config.dbPath)
  initDB(projectRoot, dbFile)

  // 加载手动品味声明
  const tastePath = path.isAbsolute(config.tastePath)
    ? config.tastePath
    : path.join(projectRoot, config.tastePath)
  loadManualTaste(tastePath)
}

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  // 注册工具（工具在 db 已初始化后由各 workspace 共享，当前用全局单例 db）
  registerTools(ctx)

  // ---- 集成点 1: agent/session-start — 定位 workspace + 刷新现状 + 注入上下文 ----
  ctx.on('agent/session-start', (payload: { agent: any; source: unknown }) => {
    const projectRoot = resolveProjectRoot(payload.agent)
    if (!projectRoot) {
      console.warn('[mesync] session has no cwd, skipping workspace init')
      return
    }

    // 初始化当前 workspace 的 db + 品味 + 现状
    try {
      ensureWorkspaceInitialized(projectRoot, config)
      scanProjectReality(projectRoot)
    } catch (err) {
      console.warn('[mesync] workspace init failed:', err)
    }

    // 注入同频记忆上下文
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
  ctx.on('agent/pre-step', async (payload: {
    agent: any
    messages: any[]
    turn: number
    step: number
    signal: AbortSignal
  }, next: () => Promise<any>) => {
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

  // ---- 集成点 3: agent/turn-stopping — 检测决策信号（Phase 1 骨架） ----
  if (config.autoExtract) {
    ctx.on('agent/turn-stopping', async (payload: { agent: any }) => {
      try {
        // Phase 1: TurnSummary 收集尚未实现，暂用空结构（detector 不会触发）
        // 完整实现见 P1：从 session event 流收集本 turn 的用户消息/工具调用/文件变更
        const summary = buildTurnSummary(payload.agent)
        if (!summary) return

        const signals = detectDecisionSignal(summary)
        if (!signals) return

        await runExtraction(ctx, config, buildExtractPrompt(summary, signals[0]))
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
 * 调用 LLM 提取决策节点并写入。
 * 注意：llm API 尚未核对 dsh 真实签名，P1 需校正。
 */
async function runExtraction(ctx: Context, config: Config, prompt: string): Promise<void> {
  const llm = (ctx as any).llm
  if (!llm) {
    console.warn('[mesync] LLM service not available, skipping extraction')
    return
  }

  const messages = [
    { role: 'system' as const, content: 'You are a project memory analyst. Respond in JSON only.' },
    { role: 'user' as const, content: prompt },
  ]

  const model = config.extractModel || undefined
  let raw = ''

  try {
    const stream = llm.stream(messages, { model })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta' || chunk.type === 'text') {
        raw += chunk.text || ''
      }
    }
  } catch {
    console.warn('[mesync] LLM extraction call failed, skipping')
    return
  }

  const result = parseExtractionResult(raw)
  if (result.no_decisions) return

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
}

/**
 * 构建 TurnSummary
 * Phase 1 骨架 — 后续版本会从 session event 流中收集完整信息
 */
function buildTurnSummary(_agent: any): TurnSummary | null {
  // Phase 1: 返回基础 TurnSummary。目前所有信号字段为默认值，
  // detector 不会触发。P1 需从 agent.session 的 event log 中收集真实数据。
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
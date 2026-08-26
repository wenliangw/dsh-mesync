// agent/events — 事件监听
// session-start：定位 workspace + 确保 wiki 同步 + 注入上下文
// pre-step：注入即时上下文
// turn-stopping：决策信号检测（Phase 1 骨架）

import type { Context } from '@deepseek-ai/cordis'
import { initDB, closeDB } from '../db/index.js'
import { ensureWikiSynced } from '../wiki/index.js'
import { buildResonanceContext, buildTurnContext } from './context.js'
import { setCurrentProjectRoot } from './tools.js'
import { detectDecisionSignal } from '../decisions/detector.js'
import type { TurnSummary } from '../decisions/detector.js'

/** 从 agent.session.header.cwd 解析 workspace 根目录 */
function resolveProjectRoot(agent: any): string | null {
  try {
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    return null
  } catch {
    return null
  }
}

/** 注册所有事件监听 */
export function registerEvents(ctx: Context, config: any): void {
  // ---- session-start：定位 workspace + wiki 同步 + 注入上下文 ----
  ctx.on('agent/session-start', async (payload: { agent: any; source: unknown }) => {
    const projectRoot = resolveProjectRoot(payload.agent)
    if (!projectRoot) {
      console.warn('[mesync] session has no cwd, skip')
      return
    }

    // 设置当前 workspace（供 reality 工具读取）
    setCurrentProjectRoot(projectRoot)

    // 初始化 db（固定路径 .mesync/db/resonance.db）
    initDB(projectRoot)

    // 确保 wiki 同步（首次全量生成，后续复用）
    if (config.autoExtract) {
      try {
        await ensureWikiSynced(ctx, projectRoot, payload.agent)
      } catch (err) {
        console.warn('[mesync] wiki sync failed:', err)
      }
    }

    // 注入同频记忆上下文
    const context = buildResonanceContext(projectRoot, {
      maxDecisions: config.maxContextDecisions,
      includeWiki: true,
    })
    if (context) {
      ctx.systemPrompt.section({
        name: 'mesync-resonance',
        order: 150,
        text: context,
      })
    }
  })

  // ---- pre-step：注入即时上下文 ----
  ctx.on('agent/pre-step', async (payload: {
    agent: any
    messages: any[]
    turn: number
    step: number
    signal: AbortSignal
  }, next: () => Promise<any>) => {
    try {
      const lastMessage = payload.messages?.[payload.messages.length - 1]
      if (lastMessage?.type === 'user') {
        const text = (lastMessage.content as any[])?.map((c: any) => c.text || '').join(' ') || ''
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
    } catch { /* 注入失败不影响对话 */ }
    return next()
  })

  // ---- turn-stopping：决策信号检测（Phase 1 骨架）----
  if (config.autoExtract) {
    ctx.on('agent/turn-stopping', async (payload: { agent: any }) => {
      try {
        // Phase 1：TurnSummary 收集 + 决策提取尚未实现，仅检测信号
        const summary = buildTurnSummary(payload.agent)
        if (!summary) return
        const signals = detectDecisionSignal(summary)
        if (!signals) return
        // TODO(P1)：实现完整的决策提取（调 LLM → 写入 decisions 表）
      } catch (err) {
        console.error('[mesync] extraction failed:', err)
      }
    })
  }

  // 清理
  ctx.effect(() => {
    return () => {
      setCurrentProjectRoot(null)
      closeDB()
    }
  })
}

/** Phase 1 骨架：从 agent 收集 turn 信息（TODO: 从 session event log 收集） */
function buildTurnSummary(_agent: any): TurnSummary | null {
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
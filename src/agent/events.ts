// agent/events — 事件监听
// session-start：定位 workspace + 按需执行 wiki 同步 + 注入上下文 + 提示用户
// pre-step：注入即时上下文
// turn-stopping：决策信号检测（后续实现）

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { initDB, closeDB } from '../db/index.js'
import { ensureWikiSynced } from '../wiki/index.js'
import { buildResonanceContext, buildTurnContext } from './context.js'
import { setCurrentProjectRoot } from './tools.js'
import type { Config } from '../config/index.js'

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

/** 向用户注入一条可见的 notice 提示（一行说明，折叠显示） */
function notify(agent: any, summary: string, detail: string): void {
  try {
    const message = createUserMessage({
      content: [{ type: 'text', text: detail }],
      source: {
        kind: 'plugin',
        plugin: 'mesync',
        form: 'notice',
        summary,
      },
    })
    agent?.inject?.(message)
  } catch {
    // 提示失败不影响主流程
  }
}

/** 注册所有事件监听 */
export function registerEvents(ctx: Context, config: Config): void {
  // ---- session-start：定位 workspace + wiki 同步 + 注入上下文 ----
  ctx.on('agent/session-start', async (payload: { agent: any; source: unknown }) => {
    const agent = payload.agent
    const projectRoot = resolveProjectRoot(agent)
    if (!projectRoot) {
      console.warn('[mesync] session has no cwd, skip')
      return
    }

    // 设置当前 workspace（供 reality 工具读取）
    setCurrentProjectRoot(projectRoot)

    // 初始化 db（固定路径 .mesync/db/resonance.db）
    initDB(projectRoot)

    // 按需执行 wiki 同步：
    // - 未初始化 → 全量生成（阻塞，提示用户）
    // - agent 执行任务后（有代码变更）→ 增量更新
    // - 其余 → skip（不重复执行 subagent）
    if (config.autoExtract) {
      notify(agent, 'mesync 正在初始化项目认知…', 'mesync 正在读取工作区文件并生成项目认知文档（wiki），请稍候。')

      try {
        const outcome = await ensureWikiSynced(ctx, projectRoot, agent)
        if (outcome === 'full') {
          notify(agent, 'mesync 初始化完成', 'mesync 已完成项目认知文档（wiki）的首次生成，后续对话将基于它理解项目。')
        } else if (outcome === 'incremental') {
          notify(agent, 'mesync 已更新项目认知', 'mesync 检测到代码变更，已增量更新项目认知文档（wiki）。')
        }
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

  // 清理
  ctx.effect(() => {
    return () => {
      setCurrentProjectRoot(null)
      closeDB()
    }
  })
}

// agent/events — 事件监听
// session-start：定位 workspace + 生成规则模板 + 注入上下文（wiki 维护指引 + 同频记忆）
// pre-step：注入即时上下文（任务匹配的决策）
// turn-stopping：决策信号检测（后续实现）
//
// 核心转变：mesync 不再后台跑 loop 生成 wiki。
// 改为「会话内惰性触发」——把规则（md 文件）+ 状态指令注入给主 agent，
// 让主 agent 自己探索项目、按规则生成/更新 wiki，并调用 mesync_sync_wiki 同步索引。

import type { Context } from '@deepseek-ai/cordis'
import { initDB, closeDB } from '../db/index.js'
import { ensureRulesFile, ensureSkillFile, ensureInitSkillFile, ensureMaintainMemorySkillFile, ensureRecordDecisionRuleFile, ensureRecordDecisionSkillFile, loadInitSkill, loadMaintainMemorySkill } from '../wiki/index.js'
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

/** 注册所有事件监听 */
export function registerEvents(ctx: Context, config: Config): void {
  // ---- session-start：定位 workspace + 生成规则模板 + 注入上下文 ----
  ctx.on('agent/session-start', async (payload: { agent: any; source: unknown }) => {
    const agent = payload.agent
    const projectRoot = resolveProjectRoot(agent)
    if (!projectRoot) {
      console.warn('[mesync] session has no cwd, skip')
      return
    }

    // 设置当前 workspace（供 reality / mesync_sync_wiki 工具读取）
    setCurrentProjectRoot(projectRoot)

    // 初始化 db（固定路径 .mesync/db/resonance.db）
    initDB(projectRoot)

    // 首次确保 rules + skill 模板存在（输出默认模板，尊重用户版本）
    ensureRulesFile(projectRoot)
    ensureSkillFile(projectRoot)
    ensureInitSkillFile(projectRoot)
    ensureMaintainMemorySkillFile(projectRoot)
    ensureRecordDecisionRuleFile(projectRoot)
    ensureRecordDecisionSkillFile(projectRoot)

    // 注入 mesync wiki 维护指引：直接读 _init_wiki.skill.md 文件内容注入。
    // 该文件用自然语言描述了主 agent 该做什么（判断首次/增量、按规则探索生成、
    // 完成后调 mesync_sync_wiki），代码不做任何语义拼装，零硬编码指令。
    if (config.autoExtract) {
      ctx.systemPrompt.section({
        name: 'mesync-wiki-guide',
        order: 140,
        text: () => loadInitSkill(projectRoot),
      })
    }

    // 注入同频记忆上下文（wiki 速览 + 决策链 + 品味）。
    // text 传函数，每次 prompt 组装时实时读取最新 overview.md / 决策 / 品味。
    ctx.systemPrompt.section({
      name: 'mesync-resonance',
      order: 150,
      text: () => buildResonanceContext(projectRoot, {
        maxDecisions: config.maxContextDecisions,
        includeWiki: true,
      }),
    })

    // 注入同频记忆维护策略（决策链/品味的读写时机，自然语言，来自 _maintain_memory.skill.md）。
    // 与上面「数据展示」分开：数据是 buildResonanceContext 展示，策略是文件描述、让主 agent 自行识别执行。
    if (config.autoExtract) {
      ctx.systemPrompt.section({
        name: 'mesync-memory-guide',
        order: 145,
        text: () => loadMaintainMemorySkill(projectRoot),
      })
    }
  })

  // ---- pre-step：注入即时上下文（任务匹配的决策）----
  ctx.on('agent/pre-step', async (payload: {
    agent: any
    messages: any[]
    turn: number
    step: number
    signal: AbortSignal
  }, next: () => Promise<any>) => {
    try {
      const lastMessage = payload.messages?.[payload.messages.length - 1]
      // 注意：dsh 的 Message 用 role 字段（'system'|'user'|'assistant'），不是 type。
      if (lastMessage?.role === 'user') {
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

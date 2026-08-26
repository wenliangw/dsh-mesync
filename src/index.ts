// Mesync — 同频记忆引擎入口
// DeepSeek Harness 插件：项目级记忆（LLM Wiki + 决策链 + 品味）。
//
// 模块划分：
// - wiki/     项目认知（LLM 自动生成/维护 .mesync/ 下的 md 文档）
// - decisions/ 因果链（决策节点）
// - tastes/   品味信号
// - db/       SQLite 数据层（.mesync/db/resonance.db）
// - agent/     dsh 能力调用（LLM、事件、工具、上下文注入）

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

import { registerTools, registerEvents } from './agent/index.js'

// ---- 配置 ----

export const name = 'mesync'

export interface Config {
  /** 提取用的模型，空字符串 = 复用当前 agent 的模型 */
  extractModel: string
  /** 是否自动提取决策 + 同步 wiki，默认 true */
  autoExtract: boolean
  /** 注入上下文时最多带几条决策，默认 5 */
  maxContextDecisions: number
}

export const Config: Schema<Config> = Schema.object({
  extractModel: Schema.string().default(''),
  autoExtract: Schema.boolean().default(true),
  maxContextDecisions: Schema.number().default(5),
})

export const inject = ['tools', 'systemPrompt', 'llm']

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  // 注册 Agent 工具（recall / remember / taste_add / reality）
  registerTools(ctx)

  // 注册事件监听（session-start / pre-step / turn-stopping）
  registerEvents(ctx, config)
}
// Mesync — 同频记忆引擎入口
// DeepSeek Harness 插件：项目级记忆（LLM Wiki + 决策链 + 品味）。
//
// 模块划分：
// - config/   配置（name / Config schema / inject）
// - wiki/     项目认知（LLM 自动生成/维护 .mesync/ 下的 md 文档）
// - decisions/ 因果链（决策节点）
// - tastes/   品味信号
// - db/       SQLite 数据层（.mesync/db/resonance.db）
// - agent/     dsh 能力调用（LLM、事件、工具、上下文注入）

import type { Context } from '@deepseek-ai/cordis'

import { name, Config, inject } from './config/index.js'
import { registerTools, registerEvents } from './agent/index.js'

export { name, Config, inject }

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  // 注册 Agent 工具（recall / remember / taste_add / reality）
  registerTools(ctx)

  // 注册事件监听（session-start / pre-step / turn-stopping）
  registerEvents(ctx, config)
}
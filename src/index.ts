// Mesync — 同频记忆引擎入口
// DeepSeek Harness 插件：项目级记忆（LLM Wiki + 决策链 + 品味）。
//
// 模块划分：
// - config/   配置（name / Config schema / inject）
// - wiki/     规则/心法模板管理（rules/ + skills/ 下的 md 文件）
// - db/       SQLite 数据层（decisions 决策链 + wiki 索引）
// - agent/    dsh 能力调用（事件、工具、上下文注入）
//
// 存储架构：
// - wiki / tastes 详细内容 → .mesync/ 下的 md 文档（主 agent 惰性生成/维护）
// - decisions + 因果关系 → SQLite（决策因子）

import type { Context } from '@deepseek-ai/cordis'

import { name, Config, inject } from './config/index.js'
import { registerTools, registerEvents } from './agent/index.js'

export { name, Config, inject }

// ---- 插件入口 ----

export function apply(ctx: Context, config: Config) {
  // 注册 Agent 工具（recall / remember / reality / mesync_sync_wiki）
  registerTools(ctx)

  // 注册事件监听（session-start / pre-step / turn-stopping）
  registerEvents(ctx, config)
}
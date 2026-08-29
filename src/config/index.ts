// config/index — mesync 配置定义
// 插件名、Config schema、依赖注入声明

import Schema from '@deepseek-ai/schemastery'

/** 插件名（dsh 插件标识） */
export const name = 'mesync'

/** mesync 配置项 */
export interface Config {
  /** 是否自动注入同频记忆上下文 + 维护指引，默认 true */
  autoExtract: boolean
  /** 注入上下文时最多带几条决策，默认 5 */
  maxContextDecisions: number
}

/** Config 的 Schemastery schema（dsh 用于校验 + 填默认值） */
export const Config: Schema<Config> = Schema.object({
  autoExtract: Schema.boolean().default(true),
  maxContextDecisions: Schema.number().default(5),
})

/** 插件依赖的服务（dsh 会等待这些服务就绪后再加载插件） */
export const inject = ['tools', 'systemPrompt']
// wiki/index — 项目认知（LLM Wiki）模块出口
//
// 注：loop.ts / sync.ts 已废弃删除。mesync 不再后台跑 loop 生成 wiki，
// 改为会话内惰性触发：规则（rules.ts）+ 状态指令注入给主 agent，
// 主 agent 自己探索 + 生成 + 调用 mesync_sync_wiki 同步索引。

export * from './structure.js'
export * from './rules.js'
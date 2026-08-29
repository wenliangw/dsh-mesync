// wiki/structure — .mesync 目录结构定义
// 定义 rules/、skills/ 下的模板文件路径。

/** 默认的 wiki 同步规则文件 */
export const SYNC_RULE_FILE = '.mesync/rules/_sync_wiki.rule.md'

/** 默认的 wiki 同步 skill 文件（独立 skills 目录，与 rules 分类管理） */
export const SYNC_SKILL_FILE = '.mesync/skills/_sync_wiki.skill.md'

/** wiki 初始化/维护任务描述文件（自然语言描述主 agent 该做什么） */
export const INIT_SKILL_FILE = '.mesync/skills/_init_wiki.skill.md'

/** 同频记忆（决策链 + 品味）维护策略描述文件 */
export const MAINTAIN_MEMORY_SKILL_FILE = '.mesync/skills/_sync_strategy.skill.md'

/** 决策记录规则文件（什么算决策、字段规范、因果链关联） */
export const RECORD_DECISION_RULE_FILE = '.mesync/rules/_sync_decision.rule.md'

/** 决策记录心法文件（怎么识别信号、怎么高质量记录） */
export const RECORD_DECISION_SKILL_FILE = '.mesync/skills/_sync_decision.skill.md'

/** 品味维护心法文件（怎么识别品味、怎么写 tastes/*.md、怎么维护 overview） */
export const TASTE_SKILL_FILE = '.mesync/skills/_sync_taste.skill.md'

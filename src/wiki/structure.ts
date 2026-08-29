// wiki/structure — wiki 目录结构定义
// .mesync 下的 LLM Wiki 文件布局

/** overview.md 的固定位置（相对 workspace 根） */
export const OVERVIEW_PATH = '.mesync/overview.md'

/** wiki/ 目录（相对 workspace 根） */
export const WIKI_DIR = '.mesync/wiki'

/** rules 目录 */
export const RULES_DIR = '.mesync/rules'

/** skills 目录 */
export const SKILLS_DIR = '.mesync/skills'

/** 默认的 wiki 同步规则文件 */
export const SYNC_RULE_FILE = '.mesync/rules/_sync_wiki.rule.md'

/** 默认的 wiki 同步 skill 文件（独立 skills 目录，与 rules 分类管理） */
export const SYNC_SKILL_FILE = '.mesync/skills/_sync_wiki.skill.md'

/** wiki 初始化/维护任务描述文件（自然语言描述主 agent 该做什么） */
export const INIT_SKILL_FILE = '.mesync/skills/_init_wiki.skill.md'

/** 同频记忆（决策链 + 品味）维护策略描述文件 */
export const MAINTAIN_MEMORY_SKILL_FILE = '.mesync/skills/_sync_strategy.skill.md'

/** 判断一个相对路径是否是 wiki 文档（.mesync/ 下的 .md 文件） */
export function isWikiDoc(relPath: string): boolean {
  return (
    relPath === OVERVIEW_PATH ||
    (relPath.startsWith(WIKI_DIR + '/') && relPath.endsWith('.md'))
  )
}

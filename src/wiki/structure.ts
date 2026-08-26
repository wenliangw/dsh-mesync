// wiki/structure — wiki 目录结构定义
// .mesync 下的 LLM Wiki 文件布局

/** overview.md 的固定位置（相对 workspace 根） */
export const OVERVIEW_PATH = '.mesync/overview.md'

/** wiki/ 目录（相对 workspace 根） */
export const WIKI_DIR = '.mesync/wiki'

/** rules 目录 */
export const RULES_DIR = '.mesync/rules'

/** 默认的 wiki 同步规则文件 */
export const SYNC_RULE_FILE = '.mesync/rules/_sync_wiki.rule.md'

/** 判断一个相对路径是否是 wiki 文档（.mesync/ 下的 .md 文件） */
export function isWikiDoc(relPath: string): boolean {
  return (
    relPath === OVERVIEW_PATH ||
    (relPath.startsWith(WIKI_DIR + '/') && relPath.endsWith('.md'))
  )
}
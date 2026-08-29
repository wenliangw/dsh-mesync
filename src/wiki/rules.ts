// wiki/rules — 默认 rules / skill 模板管理
// 模板作为独立资源文件放在 src/templates/。
// mesync 初始化时：若项目 .mesync/rules/ 下对应文件不存在，则输出默认模板；
// 若用户已修改，则尊重用户版本（不覆盖）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { SYNC_RULE_FILE, SYNC_SKILL_FILE, INIT_SKILL_FILE, MAINTAIN_MEMORY_SKILL_FILE, RECORD_DECISION_RULE_FILE, RECORD_DECISION_SKILL_FILE, TASTE_SKILL_FILE } from './structure.js'

/** 内置默认模板的目录（src/templates/） */
function templateDir(): string {
  // 用 import.meta.url 定位到 src/templates/（源码时 .ts，构建后 .js，模板文件是 .md 不受影响）
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  return path.join(here, '..', 'templates')
}

/**
 * 读取内置默认模板内容。
 * 模板按 rules/、skills/ 分类存放于 src/templates/ 下。
 */
function readTemplate(relPath: string): string {
  try {
    return fs.readFileSync(path.join(templateDir(), relPath), 'utf-8')
  } catch {
    // 极端情况模板文件缺失，返回空（调用方会兜底）
    return ''
  }
}

/**
 * 首次初始化：若项目里没有目标文件，则把默认模板输出到项目。
 * 已在则不动（尊重用户版本）。
 */
function ensureTemplateFile(projectRoot: string, relPath: string, templateRelPath: string): void {
  const target = path.join(projectRoot, relPath)
  if (fs.existsSync(target)) return

  const template = readTemplate(templateRelPath)
  if (!template) return

  const dir = path.dirname(target)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(target, template, 'utf-8')
}

/**
 * 读取文件内容。
 * 优先读项目里的（可能已被用户修改），不存在则返回内置模板。
 */
function loadTemplate(projectRoot: string, relPath: string, templateRelPath: string): string {
  const target = path.join(projectRoot, relPath)
  try {
    if (fs.existsSync(target)) {
      const content = fs.readFileSync(target, 'utf-8')
      if (content.trim()) return content
    }
  } catch {
    // 读取失败，走模板兜底
  }
  return readTemplate(templateRelPath)
}

/** 确保 rules 文件存在 */
export function ensureRulesFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, SYNC_RULE_FILE, 'rules/_sync_wiki.rule.md')
}

/** 确保 skill 文件存在 */
export function ensureSkillFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, SYNC_SKILL_FILE, 'skills/_sync_wiki.skill.md')
}

/** 确保 wiki 初始化/维护任务描述文件存在 */
export function ensureInitSkillFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, INIT_SKILL_FILE, 'skills/_init_wiki.skill.md')
}

/** 确保同频记忆维护策略描述文件存在 */
export function ensureMaintainMemorySkillFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, MAINTAIN_MEMORY_SKILL_FILE, 'skills/_sync_strategy.skill.md')
}

/** 读取同频记忆维护策略描述（决策链 + 品味的读写时机，自然语言） */
export function loadMaintainMemorySkill(projectRoot: string): string {
  return loadTemplate(projectRoot, MAINTAIN_MEMORY_SKILL_FILE, 'skills/_sync_strategy.skill.md')
}

/** 确保决策记录规则文件存在 */
export function ensureRecordDecisionRuleFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, RECORD_DECISION_RULE_FILE, 'rules/_sync_decision.rule.md')
}

/** 确保决策记录心法文件存在 */
export function ensureRecordDecisionSkillFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, RECORD_DECISION_SKILL_FILE, 'skills/_sync_decision.skill.md')
}

/** 确保品味维护心法文件存在 */
export function ensureTasteSkillFile(projectRoot: string): void {
  ensureTemplateFile(projectRoot, TASTE_SKILL_FILE, 'skills/_sync_taste.skill.md')
}

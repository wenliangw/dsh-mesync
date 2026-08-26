// wiki/rules — 默认 rules 模板管理
// 模板作为独立资源文件放在 src/templates/。
// mesync 初始化时：若项目 .mesync/rules/_sync_wiki.rule.md 不存在，则输出默认模板；
// 若用户已修改，则尊重用户版本（不覆盖）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { SYNC_RULE_FILE } from './structure.js'

/** 默认模板在 src/templates/ 下的文件名 */
const TEMPLATE_FILE = '_sync_wiki.rule.md'

/**
 * 读取内置默认模板内容（src/templates/_sync_wiki.rule.md）。
 */
function readTemplate(): string {
  // 用 import.meta.url 定位到 src/templates/（源码时 .ts，构建后 .js，模板文件是 .md 不受影响）
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  const templatePath = path.join(here, '..', 'templates', TEMPLATE_FILE)
  try {
    return fs.readFileSync(templatePath, 'utf-8')
  } catch {
    // 极端情况模板文件缺失，返回空（调用方会兜底）
    return ''
  }
}

/**
 * 首次初始化：若项目里没有 rules 文件，则把默认模板输出到项目。
 * 已在则不动（尊重用户版本）。
 */
export function ensureRulesFile(projectRoot: string): void {
  const target = path.join(projectRoot, SYNC_RULE_FILE)
  if (fs.existsSync(target)) return

  const template = readTemplate()
  if (!template) return

  const dir = path.dirname(target)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(target, template, 'utf-8')
}

/**
 * 读取 rules 文件内容。
 * 优先读项目里的（可能已被用户修改），不存在则返回内置模板。
 */
export function loadSyncRules(projectRoot: string): string {
  const target = path.join(projectRoot, SYNC_RULE_FILE)
  try {
    if (fs.existsSync(target)) {
      const content = fs.readFileSync(target, 'utf-8')
      if (content.trim()) return content
    }
  } catch {
    // 读取失败，走模板兜底
  }
  return readTemplate()
}
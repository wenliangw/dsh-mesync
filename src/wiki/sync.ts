// wiki/sync — Wiki 同步编排
// 首次：全量生成 overview + architecture + business + constraints + modules
// 后续：git 检测变更 → 增量更新受影响文档

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { hasWikiData, upsertWikiPage, getWikiPage, getDB, deleteWikiPage } from '../db/index.js'
import {
  buildFullWikiPrompt,
  parseFullWikiResult,
  buildIncrementalWikiPrompt,
  parseIncrementalWikiResult,
  type FullWikiResult,
  type IncrementalWikiResult,
} from './generate.js'
import { ensureRulesFile, loadSyncRules } from './rules.js'
import { OVERVIEW_PATH, WIKI_DIR } from './structure.js'
import { callLlm, resolveAgentModel } from '../agent/llm.js'
import { detectChanges, isGitRepo, getGitHead, isDocsOnlyChange, formatChangeSummary } from './git.js'

/** meta key：记录上次同步时的 git commit */
const META_LAST_COMMIT = 'wiki_last_commit'

/**
 * 确保 wiki 同步（首次全量 + 后续增量）。
 *
 * 逻辑：
 * - 无 wiki 数据 → 首次全量生成
 * - 有 wiki 数据 → git 检测变更，有变更则增量更新
 * - 非 git 项目 → 首次生成后跳过增量（无法检测变更）
 *
 * @returns 'full' | 'incremental' | 'skip'
 */
export async function ensureWikiSynced(
  ctx: Context,
  projectRoot: string,
  agent: any
): Promise<'full' | 'incremental' | 'skip'> {
  try {
    // 首次确保 rules 文件存在
    ensureRulesFile(projectRoot)

    const resolved = resolveAgentModel(agent)
    if (!resolved) {
      console.warn('[mesync] no provider/model configured on agent, skip wiki sync')
      return 'skip'
    }
    const { provider, model } = resolved

    const rules = loadSyncRules(projectRoot)

    // 首次全量生成
    if (!hasWikiData()) {
      const ok = await runFullSync(ctx, projectRoot, rules, provider, model)
      recordLastCommit(projectRoot)
      return ok ? 'full' : 'skip'
    }

    // 已有 wiki 数据 → 增量同步
    if (!isGitRepo(projectRoot)) {
      console.warn('[mesync] not a git repo, skip incremental sync')
      return 'skip'
    }

    const lastCommit = getLastCommit()
    const changes = detectChanges(projectRoot, lastCommit)

    if (!changes.changed) {
      return 'skip'
    }

    // 只有文档类变更（如 README）时，跳过代码 wiki 更新
    if (isDocsOnlyChange(changes.files)) {
      console.warn('[mesync] docs-only change, skip wiki sync')
      recordLastCommit(projectRoot)
      return 'skip'
    }

    const ok = await runIncrementalSync(ctx, projectRoot, rules, provider, model, changes)
    if (ok) recordLastCommit(projectRoot)
    return ok ? 'incremental' : 'skip'
  } catch (err) {
    console.error('[mesync] wiki sync failed:', err)
    return 'skip'
  }
}

/** 首次全量生成 */
async function runFullSync(
  ctx: Context,
  projectRoot: string,
  rules: string,
  provider: string,
  model: string
): Promise<boolean> {
  const { system, user } = buildFullWikiPrompt(projectRoot, rules)
  const content = await callLlm(ctx, { provider, model, messages: [{ role: 'user', content: user }], system })
  if (!content || !content.trim()) {
    console.warn('[mesync] LLM returned empty wiki, skip')
    return false
  }

  const result = parseFullWikiResult(content)
  if (!result) {
    console.warn('[mesync] failed to parse full wiki result')
    return false
  }

  writeFullWiki(projectRoot, result)
  return true
}

/** 增量更新 */
async function runIncrementalSync(
  ctx: Context,
  projectRoot: string,
  rules: string,
  provider: string,
  model: string,
  changes: ReturnType<typeof detectChanges>
): Promise<boolean> {
  const changeSummary = formatChangeSummary(changes.files)
  const currentWiki = readCurrentWiki(projectRoot)

  const { system, user } = buildIncrementalWikiPrompt(projectRoot, rules, changeSummary, currentWiki)
  const content = await callLlm(ctx, { provider, model, messages: [{ role: 'user', content: user }], system })
  if (!content || !content.trim()) {
    console.warn('[mesync] LLM returned empty incremental result, skip')
    return false
  }

  const result = parseIncrementalWikiResult(content)
  if (!result) {
    console.warn('[mesync] failed to parse incremental wiki result')
    return false
  }

  applyIncremental(projectRoot, result)
  return true
}

/** 将首次全量结果落盘 */
function writeFullWiki(projectRoot: string, result: FullWikiResult): void {
  const now = new Date().toISOString()

  // overview.md（必写）
  if (result.overview.trim()) {
    writeWikiFile(projectRoot, OVERVIEW_PATH, result.overview, 'initial', now)
  }

  // architecture.md
  if (result.architecture.trim()) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/architecture.md`, result.architecture, 'initial', now)
  }

  // business.md
  if (result.business.trim()) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/business.md`, result.business, 'initial', now)
  }

  // constraints.md
  if (result.constraints.trim()) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/constraints.md`, result.constraints, 'initial', now)
  }

  // modules/*.md
  for (const m of result.modules) {
    if (m.content.trim()) {
      writeWikiFile(projectRoot, `${WIKI_DIR}/modules/${m.name}.md`, m.content, 'initial', now)
    }
  }
}

/** 应用增量更新结果 */
function applyIncremental(projectRoot: string, result: IncrementalWikiResult): void {
  const now = new Date().toISOString()

  if (result.overview !== null) {
    writeWikiFile(projectRoot, OVERVIEW_PATH, result.overview, 'incremental', now)
  }
  if (result.architecture !== null) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/architecture.md`, result.architecture, 'incremental', now)
  }
  if (result.business !== null) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/business.md`, result.business, 'incremental', now)
  }
  if (result.constraints !== null) {
    writeWikiFile(projectRoot, `${WIKI_DIR}/constraints.md`, result.constraints, 'incremental', now)
  }

  for (const m of result.modules) {
    if (m.content.trim()) {
      writeWikiFile(projectRoot, `${WIKI_DIR}/modules/${m.name}.md`, m.content, 'incremental', now)
    }
  }

  // 删除模块
  for (const name of result.removeModules) {
    const relPath = `${WIKI_DIR}/modules/${name}.md`
    removeWikiFile(projectRoot, relPath)
  }
}

/** 写单个 wiki 文件 + 记录索引 */
function writeWikiFile(
  projectRoot: string,
  relPath: string,
  content: string,
  source: 'initial' | 'incremental',
  now: string
): void {
  const full = path.join(projectRoot, relPath)
  ensureDir(path.dirname(full))
  fs.writeFileSync(full, content.trim() + '\n', 'utf-8')

  upsertWikiPage({
    path: relPath,
    git_commit: getGitHead(projectRoot),
    updated_at: now,
    source,
  })
}

/** 删除单个 wiki 文件 + 移除索引 */
function removeWikiFile(projectRoot: string, relPath: string): void {
  const full = path.join(projectRoot, relPath)
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full)
  } catch {
    // 忽略
  }
  deleteWikiPage(relPath)
}

/** 读取当前所有 wiki 内容（供增量更新 prompt 参考） */
function readCurrentWiki(projectRoot: string): string {
  const parts: string[] = []

  // overview
  const overviewPath = path.join(projectRoot, OVERVIEW_PATH)
  if (fs.existsSync(overviewPath)) {
    parts.push(`### ${OVERVIEW_PATH}`)
    parts.push(readCapped(overviewPath, 6000))
    parts.push('')
  }

  // wiki/ 目录
  const wikiDir = path.join(projectRoot, WIKI_DIR)
  if (fs.existsSync(wikiDir)) {
    const files = listMdFiles(wikiDir)
    for (const f of files) {
      const rel = path.relative(projectRoot, f).replace(/\\/g, '/')
      parts.push(`### ${rel}`)
      parts.push(readCapped(f, 6000))
      parts.push('')
    }
  }

  return parts.join('\n')
}

/** 递归列出目录下的 md 文件 */
function listMdFiles(dir: string): string[] {
  const result: string[] = []
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return result
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...listMdFiles(full))
    } else if (e.name.endsWith('.md')) {
      result.push(full)
    }
  }
  return result
}

function readCapped(filePath: string, maxLen: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.length > maxLen ? content.slice(0, maxLen) + '\n... (截断)' : content
  } catch {
    return '(读取失败)'
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/** 记录上次同步的 git commit（写入 meta 表） */
function recordLastCommit(projectRoot: string): void {
  const head = getGitHead(projectRoot)
  if (!head) return
  const now = new Date().toISOString()
  try {
    getDB()
      .prepare('INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(META_LAST_COMMIT, head, now)
  } catch {
    // db 可能未初始化
  }
}

/** 读取上次同步的 git commit */
function getLastCommit(): string | null {
  try {
    const row = getDB().prepare('SELECT value FROM meta WHERE key = ?').get(META_LAST_COMMIT) as any
    return row?.value ?? null
  } catch {
    return null
  }
}

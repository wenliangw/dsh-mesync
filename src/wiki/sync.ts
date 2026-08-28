// wiki/sync — Wiki 同步编排
// 首次：轻量 loop 全量生成 .mesync/ 下的 md 文档
// 后续：git 检测变更 → 轻量 loop 增量更新受影响文档
//
// 职责边界（方案 A）：
// - loop 负责「让 LLM 读文件 → 生成全部 md 文档内容」并返回分节文本
// - mesync 负责「解析分节 → 写盘 → 扫描同步 sqlite 引用记录（wiki_pages 表）」
//
// 生成规则在 _sync_wiki.rule.md，工作心法在 _sync_wiki.skill.md（零硬编码提示词）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { hasWikiData, upsertWikiPage, listWikiPages, deleteWikiPage, getDB } from '../db/index.js'
import { ensureRulesFile, ensureSkillFile, loadSyncRules, loadSyncSkill } from './rules.js'
import { OVERVIEW_PATH, WIKI_DIR } from './structure.js'
import { runWikiLoop } from './loop.js'
import { resolveAgentModel } from '../agent/llm.js'
import { detectChanges, isGitRepo, getGitHead, isDocsOnlyChange, formatChangeSummary } from './git.js'

/** meta key：记录上次同步时的 git commit */
const META_LAST_COMMIT = 'wiki_last_commit'

/** wiki 同步结果 */
export type WikiSyncOutcome = 'full' | 'incremental' | 'skip'

/**
 * 确保 wiki 同步（首次全量 + 后续增量）。
 *
 * 执行时机（由调用方 events.ts 控制）：
 * - 未初始化（无 wiki 数据）→ 全量生成
 * - agent 执行任务之后（git 检测到变更）→ 增量更新
 * - 其余情况 → skip（不重复执行）
 */
export async function ensureWikiSynced(
  ctx: Context,
  projectRoot: string,
  agent: any,
  onFull?: () => void
): Promise<WikiSyncOutcome> {
  try {
    // 首次确保 rules + skill 文件存在（输出默认模板，尊重用户版本）
    ensureRulesFile(projectRoot)
    ensureSkillFile(projectRoot)

    // 取 provider/model（loop 需要）；新建会话时靠 ctx.agentDefaultModel 兜底
    const resolved = resolveAgentModel(agent, ctx)
    if (!resolved) {
      console.warn('[mesync] no provider/model configured on agent, skip wiki sync')
      return 'skip'
    }
    console.log(`[mesync] resolveAgentModel → provider=${resolved.provider} model=${resolved.model}`)

    // 加载 rule（生成规则） + skill（工作心法）两份文档，代码不硬编码任何生成提示词
    const rule = loadSyncRules(projectRoot)
    const skill = loadSyncSkill(projectRoot)

    // 1. 未初始化 → 全量生成（先回调通知调用方，让用户看到「正在初始化」）
    if (!hasWikiData()) {
      onFull?.()
      const ok = await runFullSync(ctx, projectRoot, rule, skill, resolved)
      if (ok) recordLastCommit(projectRoot)
      return ok ? 'full' : 'skip'
    }

    // 2. 已初始化 → 检测代码变更，有变更才增量更新
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

    const ok = await runIncrementalSync(ctx, projectRoot, rule, skill, resolved, changes)
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
  rule: string,
  skill: string,
  resolved: { provider: string; model: string }
): Promise<boolean> {
  const result = await runWikiLoop(ctx, resolved.provider, resolved.model, rule, skill, projectRoot)
  if (!result) {
    console.warn('[mesync] wiki loop returned no result')
    return false
  }
  // loop 已通过 write 工具把文档写入 .mesync/*.md，这里扫描同步 sqlite 索引
  syncWikiIndex(projectRoot, 'initial')
  return true
}

/** 增量更新 */
async function runIncrementalSync(
  ctx: Context,
  projectRoot: string,
  rule: string,
  skill: string,
  resolved: { provider: string; model: string },
  changes: ReturnType<typeof detectChanges>
): Promise<boolean> {
  // 把「变更摘要」和「当前 wiki」作为附加上下文传给 loop，让它按规则增量更新
  const changeSummary = formatChangeSummary(changes.files)
  const currentWiki = readCurrentWiki(projectRoot)

  const extraContext = [
    '## 本次是「增量更新」任务',
    '',
    '项目代码发生了变更，请按规则增量更新 wiki（只输出发生变化、需要更新的文档，未变化的文档不要输出）。',
    '',
    '## 代码变更摘要',
    '',
    changeSummary,
    '',
    '## 当前 wiki 内容（供参考）',
    '',
    currentWiki,
  ].join('\n')

  const result = await runWikiLoop(ctx, resolved.provider, resolved.model, rule, skill, projectRoot, extraContext)
  if (!result) {
    console.warn('[mesync] wiki loop returned no result')
    return false
  }
  syncWikiIndex(projectRoot, 'incremental')
  return true
}

/**
 * 扫描 .mesync/ 下的 wiki 文档（overview.md + wiki 目录下的 md），
 * 逐个 upsert 到 sqlite 的 wiki_pages 表，并删除文件已不存在的旧记录。
 */
function syncWikiIndex(projectRoot: string, source: 'initial' | 'incremental'): void {
  const head = getGitHead(projectRoot)
  const now = new Date().toISOString()

  const docs = collectWikiDocs(projectRoot)
  const docSet = new Set(docs)

  for (const relPath of docs) {
    upsertWikiPage({
      path: relPath,
      git_commit: head,
      updated_at: now,
      source,
    })
  }

  // 删除索引里文件已不存在的旧记录
  for (const existing of listWikiPages()) {
    if (!docSet.has(existing.path)) {
      deleteWikiPage(existing.path)
    }
  }

  console.log(`[mesync] synced ${docs.length} wiki docs to index (source=${source})`)
}

/** 收集 .mesync/ 下的所有 wiki 文档相对路径（相对 .mesync/，如 overview.md、wiki/xxx.md） */
function collectWikiDocs(projectRoot: string): string[] {
  const result: string[] = []

  const overviewPath = path.join(projectRoot, OVERVIEW_PATH)
  if (fs.existsSync(overviewPath)) {
    result.push('overview.md')
  }

  const wikiDir = path.join(projectRoot, WIKI_DIR)
  if (fs.existsSync(wikiDir)) {
    for (const f of listMdFiles(wikiDir)) {
      const rel = path.relative(path.join(projectRoot, '.mesync'), f).replace(/\\/g, '/')
      result.push(rel)
    }
  }

  return result
}

/** 读取当前所有 wiki 内容（供增量更新参考） */
function readCurrentWiki(projectRoot: string): string {
  const parts: string[] = []

  const overviewPath = path.join(projectRoot, OVERVIEW_PATH)
  if (fs.existsSync(overviewPath)) {
    parts.push(`### ${OVERVIEW_PATH}`)
    parts.push(readCapped(overviewPath, 6000))
    parts.push('')
  }

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

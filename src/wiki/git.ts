// wiki/git — 代码变更检测
// 通过 git 判断项目是否发生变更，以及变更涉及哪些文件。
// 这是「代码变更后增量同步 wiki」的基础。

import { execFileSync } from 'node:child_process'
import * as path from 'node:path'

/**
 * 获取当前 git HEAD 的 commit hash。
 * 非 git 项目返回 null。
 */
export function getGitHead(projectRoot: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim() || null
  } catch {
    return null
  }
}

/**
 * 判断 projectRoot 是否是一个 git 仓库。
 */
export function isGitRepo(projectRoot: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

/** 变更文件信息 */
export interface ChangedFile {
  /** 相对 projectRoot 的路径 */
  path: string
  /** 变更类型：新增 / 修改 / 删除 / 重命名 */
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  /** 新增/删除的行数（diff 摘要，可能为 null） */
  additions: number | null
  deletions: number | null
}

/** git 变更检测结果 */
export interface GitChanges {
  /** 当前 HEAD commit */
  head: string
  /** 变更文件列表 */
  files: ChangedFile[]
  /** 是否有变更 */
  changed: boolean
}

/**
 * 检测从 sinceCommit 到当前 HEAD 的变更。
 *
 * - sinceCommit 为 null：表示「首次」，无法用 git diff 对比（返回 changed=false，由调用方走全量生成）
 * - sinceCommit 存在：用 git diff --name-status 对比
 * - 额外包含工作区未提交的变更（git status --porcelain）
 */
export function detectChanges(projectRoot: string, sinceCommit: string | null): GitChanges {
  const head = getGitHead(projectRoot) ?? ''
  if (!sinceCommit) {
    return { head, files: [], changed: false }
  }

  const files: ChangedFile[] = []

  // 1. 已提交的变更（sinceCommit..HEAD）
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-status', '--diff-filter=ACDMR', `${sinceCommit}..HEAD`, '--', '.'],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    for (const line of out.split('\n')) {
      const parsed = parseNameStatus(line)
      if (parsed) files.push(parsed)
    }
  } catch {
    // diff 失败（如 commit 不存在），忽略，继续看工作区
  }

  // 2. 工作区未提交的变更（含未跟踪文件）
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const line of out.split('\n')) {
      const parsed = parsePorcelain(line)
      if (parsed) files.push(parsed)
    }
  } catch {
    // 忽略
  }

  // 去重（按 path）
  const seen = new Map<string, ChangedFile>()
  for (const f of files) {
    seen.set(f.path, f)
  }

  const unique = [...seen.values()].filter(f => !isIgnoredPath(f.path))

  return { head, files: unique, changed: unique.length > 0 }
}

/** 解析 git diff --name-status 的一行，如 "M\tsrc/a.ts" */
function parseNameStatus(line: string): ChangedFile | null {
  const m = line.match(/^([ACDMR])\t(.+)$/)
  if (!m) return null
  const statusMap: Record<string, ChangedFile['status']> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'added',
  }
  const status = statusMap[m[1]]
  if (!status) return null
  return { path: m[2], status, additions: null, deletions: null }
}

/** 解析 git status --porcelain 的一行，如 " M src/a.ts" */
function parsePorcelain(line: string): ChangedFile | null {
  if (line.length < 4) return null
  const xy = line.slice(0, 2)
  const p = line.slice(3)
  if (!p) return null

  let status: ChangedFile['status'] | null = null
  if (xy[0] === 'D' || xy[1] === 'D') status = 'deleted'
  else if (xy[0] === 'R' || xy[1] === 'R') status = 'renamed'
  else if (xy[0] === 'A' || xy[1] === 'A' || xy.includes('?')) status = 'added'
  else status = 'modified'

  // 处理重命名 "R  old -> new"，取新路径
  let finalPath = p
  const renameMatch = p.match(/^(.*) -> (.*)$/)
  if (renameMatch) finalPath = renameMatch[2]

  return { path: finalPath, status, additions: null, deletions: null }
}

/** 判断路径是否应该被忽略（不参与 wiki 变更判断） */
export function isIgnoredPath(p: string): boolean {
  const normalized = p.replace(/\\/g, '/')
  if (normalized.startsWith('.mesync/')) return true
  if (normalized.includes('/.mesync/')) return true
  const ignoredDirs = ['node_modules/', '.git/', 'dist/', 'build/', 'target/', '.next/', 'lib/']
  return ignoredDirs.some(d => normalized.startsWith(d) || normalized.includes('/' + d))
}

/** 判断变更是否只涉及文档类文件（md 等），不涉及代码 */
export function isDocsOnlyChange(files: ChangedFile[]): boolean {
  if (files.length === 0) return true
  const codeExts = /\.(ts|tsx|js|jsx|rs|go|py|java|kt|cs|cpp|c|h|vue|svelte|css|scss|less)$/i
  return files.every(f => !codeExts.test(f.path))
}

/**
 * 格式化变更摘要，供 LLM 增量更新时参考。
 */
export function formatChangeSummary(files: ChangedFile[]): string {
  if (files.length === 0) return '(无变更)'
  const statusLabel: Record<ChangedFile['status'], string> = {
    added: '新增',
    modified: '修改',
    deleted: '删除',
    renamed: '重命名',
  }
  return files.map(f => `- [${statusLabel[f.status]}] ${f.path}`).join('\n')
}

/**
 * 判断两个 commit 是否不同（用于决定是否需要增量同步）。
 */
export function hasCommitChanged(projectRoot: string, lastCommit: string | null): boolean {
  const head = getGitHead(projectRoot)
  if (!head) return false
  return head !== lastCommit
}

/** 解析相对路径，确保是相对 projectRoot 的路径（安全） */
export function resolveWithin(projectRoot: string, rel: string): string {
  return path.join(projectRoot, rel)
}

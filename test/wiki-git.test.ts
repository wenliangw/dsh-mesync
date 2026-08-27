// wiki/git — 代码变更检测逻辑测试

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  detectChanges,
  isGitRepo,
  getGitHead,
  isDocsOnlyChange,
  isIgnoredPath,
  formatChangeSummary,
} from '@/wiki/git.js'

function makeGitRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesync-git-test-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir })
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir })
  return dir
}

function gitCommit(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir })
}

describe('git 变更检测', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
      dir = null
    }
  })

  it('isGitRepo 能识别 git 仓库', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    expect(isGitRepo(dir)).toBe(true)
  })

  it('getGitHead 返回 commit hash', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    expect(getGitHead(dir)).toMatch(/^[0-9a-f]{40}$/)
  })

  it('sinceCommit 为 null 时 changed=false（走首次全量）', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    const result = detectChanges(dir, null)
    expect(result.changed).toBe(false)
    expect(result.files).toHaveLength(0)
  })

  it('检测已提交的变更', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    const before = getGitHead(dir)!
    fs.writeFileSync(path.join(dir, 'b.ts'), 'y')
    gitCommit(dir, 'add b.ts')

    const result = detectChanges(dir, before)
    expect(result.changed).toBe(true)
    const paths = result.files.map(f => f.path)
    expect(paths).toContain('b.ts')
  })

  it('检测工作区未提交的变更', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    const before = getGitHead(dir)!
    fs.writeFileSync(path.join(dir, 'a.ts'), 'modified')

    const result = detectChanges(dir, before)
    expect(result.changed).toBe(true)
    expect(result.files.map(f => f.path)).toContain('a.ts')
  })

  it('无变更时 changed=false', () => {
    dir = makeGitRepo({ 'a.ts': 'x' })
    const before = getGitHead(dir)!
    const result = detectChanges(dir, before)
    expect(result.changed).toBe(false)
  })

  it('isIgnoredPath 忽略 .mesync 和 node_modules', () => {
    expect(isIgnoredPath('.mesync/overview.md')).toBe(true)
    expect(isIgnoredPath('node_modules/x/index.js')).toBe(true)
    expect(isIgnoredPath('src/index.ts')).toBe(false)
  })

  it('isDocsOnlyChange 识别纯文档变更', () => {
    const docsOnly = [
      { path: 'README.md', status: 'modified' as const, additions: null, deletions: null },
    ]
    expect(isDocsOnlyChange(docsOnly)).toBe(true)

    const withCode = [
      { path: 'src/index.ts', status: 'modified' as const, additions: null, deletions: null },
    ]
    expect(isDocsOnlyChange(withCode)).toBe(false)
  })

  it('formatChangeSummary 格式化变更列表', () => {
    const files = [
      { path: 'src/a.ts', status: 'modified' as const, additions: null, deletions: null },
      { path: 'src/b.ts', status: 'added' as const, additions: null, deletions: null },
    ]
    const summary = formatChangeSummary(files)
    expect(summary).toContain('[修改] src/a.ts')
    expect(summary).toContain('[新增] src/b.ts')
  })
})

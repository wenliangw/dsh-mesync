// Reality 扫描逻辑测试
// 验证 scanProject / detectTechStack / detectModules 能正确识别项目类型
// 注意：只测纯扫描函数（不依赖 db），持久化逻辑另测

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { scanProject, detectTechStack, detectModules } from './reality.js'

// 创建临时项目目录做测试
function makeTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesync-test-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return dir
}

describe('detectTechStack', () => {
  let tmpDir: string | null = null

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  it('识别 React 组件库项目（package.json + pnpm + TS）', () => {
    tmpDir = makeTempProject({
      'package.json': JSON.stringify({
        name: 'test-lib',
        dependencies: { react: '^18', typescript: '^5' },
      }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    })

    const stack = detectTechStack(tmpDir)
    expect(stack.runtime).toBe('Node.js')
    expect(stack.package_manager).toBe('pnpm')
    expect(stack.framework).toBe('React')
    expect(stack.language).toBe('TypeScript')
  })

  it('识别 Rust 项目（Cargo.toml）', () => {
    tmpDir = makeTempProject({
      'Cargo.toml': '[package]\nname = "test"\nedition = "2024"\n',
    })

    const stack = detectTechStack(tmpDir)
    expect(stack.runtime).toBe('Rust')
    expect(stack.edition).toBe('2024')
  })

  it('识别 Go 项目', () => {
    tmpDir = makeTempProject({ 'go.mod': 'module test\n' })
    const stack = detectTechStack(tmpDir)
    expect(stack.runtime).toBe('Go')
    expect(stack.language).toBe('Go')
  })

  it('空项目返回空 stack（不抛错）', () => {
    tmpDir = makeTempProject({ 'README.md': '# empty' })
    const stack = detectTechStack(tmpDir)
    expect(Object.keys(stack)).toHaveLength(0)
  })
})

describe('detectModules', () => {
  let tmpDir: string | null = null

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  it('检测 src/ 下的子目录', () => {
    tmpDir = makeTempProject({
      'src/components/index.ts': '',
      'src/utils/index.ts': '',
      'src/hooks/index.ts': '',
    })

    const modules = detectModules(tmpDir).map((m) => m.name)
    expect(modules).toContain('src/components/')
    expect(modules).toContain('src/utils/')
    expect(modules).toContain('src/hooks/')
  })

  it('无 src 目录返回空数组', () => {
    tmpDir = makeTempProject({ 'README.md': '' })
    expect(detectModules(tmpDir)).toEqual([])
  })
})

describe('scanProject', () => {
  it('组合返回 techStack + modules', () => {
    const tmpDir = makeTempProject({
      'package.json': JSON.stringify({ dependencies: { react: '^18' } }),
      'src/button/index.ts': '',
    })
    const result = scanProject(tmpDir)
    expect(result.techStack.framework).toBe('React')
    expect(result.modules.map((m) => m.name)).toContain('src/button/')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

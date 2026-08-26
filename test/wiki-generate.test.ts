// collectProjectMaterial 素材收集逻辑测试

import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { collectProjectMaterial } from '@/wiki/generate.js'

function makeTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesync-wiki-test-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return dir
}

describe('collectProjectMaterial', () => {
  let tmpDir: string | null = null

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  it('包含目录树和关键配置文件内容', () => {
    tmpDir = makeTempProject({
      'package.json': JSON.stringify({ name: 'test', dependencies: { react: '^18' } }),
      'src/index.ts': 'export const x = 1',
    })

    const material = collectProjectMaterial(tmpDir)
    expect(material).toContain('## 项目目录结构')
    expect(material).toContain('## 关键配置文件')
    expect(material).toContain('package.json')
    expect(material).toContain('src/')      // 目录树里有 src
  })

  it('忽略 node_modules 和 .git 等目录', () => {
    tmpDir = makeTempProject({
      'package.json': '{}',
      'node_modules/some-pkg/index.js': 'x',
      '.git/config': 'x',
      'src/index.ts': 'x',
    })

    const material = collectProjectMaterial(tmpDir)
    expect(material).not.toContain('node_modules')
    expect(material).not.toContain('.git')
    expect(material).toContain('src/')
  })

  it('空项目也能返回有效素材（不抛错）', () => {
    tmpDir = makeTempProject({ 'README.md': '# hi' })
    const material = collectProjectMaterial(tmpDir)
    expect(material).toContain('## 项目目录结构')
    expect(material).toContain('README.md')
  })
})

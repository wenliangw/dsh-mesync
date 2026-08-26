// wiki/generate — LLM 生成 wiki 文档
// 收集项目素材 → 调 LLM 分析 → 生成 overview.md 等文档 → 落盘 + 记录元数据

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 收集给 LLM 分析的项目素材（纯函数，可测试）。
 * 返回：目录树（限深度）+ 关键配置文件内容。
 */
export function collectProjectMaterial(projectRoot: string, opts: { maxDepth?: number } = {}): string {
  const { maxDepth = 3 } = opts
  const parts: string[] = []

  parts.push('## 项目目录结构')
  parts.push(renderTree(projectRoot, '', maxDepth))

  parts.push('')
  parts.push('## 关键配置文件')

  // 常见的关键配置文件
  const keyFiles = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    'pom.xml',
    'build.gradle',
    'tsconfig.json',
    'vite.config.ts',
    'README.md',
  ]

  for (const file of keyFiles) {
    const full = path.join(projectRoot, file)
    if (fs.existsSync(full)) {
      const content = readCapped(full, 4000)
      parts.push(`### ${file}`)
      parts.push('```')
      parts.push(content)
      parts.push('```')
      parts.push('')
    }
  }

  return parts.join('\n')
}

/**
 * 渲染目录树（限制深度，忽略 node_modules/.git/dist 等）。
 */
function renderTree(dir: string, prefix: string, maxDepth: number, currentDepth = 0): string {
  if (currentDepth > maxDepth) return ''

  const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.mesync', 'lib'])
  let result = ''
  let entries: fs.Dirent[] = []

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !ignore.has(e.name))
      .sort((a, b) => {
        // 目录在前，文件在后，各自按名字排序
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return ''
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    result += `${prefix}${entry.isDirectory() ? entry.name + '/' : entry.name}\n`
    if (entry.isDirectory() && currentDepth < maxDepth) {
      result += renderTree(full, prefix + '  ', maxDepth, currentDepth + 1)
    }
  }
  return result
}

/**
 * 读取文件内容，超过 maxLen 截断。
 */
function readCapped(filePath: string, maxLen: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.length > maxLen ? content.slice(0, maxLen) + '\n... (截断)' : content
  } catch {
    return '(读取失败)'
  }
}